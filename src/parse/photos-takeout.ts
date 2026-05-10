/**
 * Google Photos Takeout parser.
 *
 * Input is a **directory** — typically `Takeout/Google Photos/` with a
 * subfolder per album, each containing media files plus a `*.json`
 * sidecar per item and an optional `metadata.json` for the album.
 *
 * The parser walks one level of subfolders, reads sidecar JSON only,
 * and never opens the actual photo / video binaries. Real photos stay
 * where they are.
 *
 * The parser is registered as a *directory* parser (`matches: ["/"]`)
 * so it is not invoked by the file-extension `pickParser` flow. The
 * CLI's directory branch checks for it before falling back to the
 * knowledge-base parser.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Parser, ParsedFile } from "../types.js"

const MEDIA_EXTS = new Set([".jpg", ".jpeg", ".heic", ".heif", ".png", ".gif", ".webp",
                            ".mp4", ".mov", ".m4v", ".3gp", ".avi", ".mkv"])
const VIDEO_EXTS = new Set([".mp4", ".mov", ".m4v", ".3gp", ".avi", ".mkv"])
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", ".DS_Store"])
const MAX_SIDECARS = 5000
const MAX_DIR_DEPTH = 2

interface PhotoRow {
  id: string
  filename: string
  album: string | null
  isVideo: boolean
  ext: string
  ts: string | null
  tsCreation: string | null
  year: string | null
  month: string | null
  date: string | null
  hour: number | null
  dow: number | null
  hasTimestamp: boolean
  lat: number | null
  lng: number | null
  altitude: number | null
  hasGeo: boolean
  device: string | null
  deviceKind: "android" | "ios" | "camera" | "web" | "unknown"
  favorited: boolean
  archived: boolean
  trashed: boolean
  isEdited: boolean
  sidecarFile: string
  raw: Record<string, unknown>
}

interface AlbumAgg {
  name: string
  itemCount: number
  photoCount: number
  videoCount: number
  first: string
  last: string
  topDevice: string | null
  sampleFilenames: string[]
  mosaicHashes: number[]
  filenameSet: Set<string>
  deviceCounts: Record<string, number>
}

export const parser: Parser = {
  name: "google-photos-takeout",
  matches: ["/"],
  async detect(filepath: string): Promise<boolean> {
    try {
      const st = await fs.stat(filepath)
      if (!st.isDirectory()) return false
      const sidecarHits = await countTakeoutSidecars(filepath, MAX_DIR_DEPTH, 24)
      if (sidecarHits >= 6) return true
      // Also accept a directory literally named "Google Photos" with at
      // least one album subfolder containing sidecars.
      if (/^google\s*photos$/i.test(path.basename(filepath))) {
        return sidecarHits >= 2
      }
      return false
    } catch {
      return false
    }
  },
  async parse(filepath: string): Promise<ParsedFile> {
    const root = path.resolve(filepath)
    const sourceDir = path.basename(root)

    const sidecars = await collectSidecars(root, MAX_DIR_DEPTH)
    if (sidecars.length === 0) {
      throw new Error("google-photos-takeout: no sidecar JSON files found")
    }

    const albumMetadata: Record<string, AlbumMetadata> = {}
    const rows: PhotoRow[] = []
    let counter = 0
    let editedCounter = 0
    for (const s of sidecars) {
      const entry = await readSidecar(root, s)
      if (!entry) continue
      if (entry.kind === "album") {
        albumMetadata[entry.albumKey] = entry.meta
        continue
      }
      counter += 1
      if (entry.row.isEdited) editedCounter += 1
      entry.row.id = `gp_${counter.toString().padStart(6, "0")}`
      rows.push(entry.row)
      if (rows.length >= MAX_SIDECARS) break
    }

    rows.sort((a, b) => {
      if (a.ts && b.ts) return a.ts.localeCompare(b.ts)
      if (a.ts) return -1
      if (b.ts) return 1
      return a.filename.localeCompare(b.filename)
    })

    return aggregate(rows, albumMetadata, {
      sourceDir,
      fileCount: sidecars.length,
      sidecarCount: rows.length,
      sourceFile: sourceDir,
      sizeBytes: 0,
    }, editedCounter)
  },
}

// ---------------------------------------------------------------------------
// Filesystem walking
// ---------------------------------------------------------------------------

interface SidecarPath {
  full: string
  rel: string
  album: string | null
  base: string             // sidecar filename without trailing ".json" / ".suppl.json"
  isAlbumMeta: boolean
}

async function collectSidecars(root: string, maxDepth: number): Promise<SidecarPath[]> {
  const out: SidecarPath[] = []
  await walk(root, root, 0, maxDepth, out)
  return out
}

async function walk(root: string, dir: string, depth: number, maxDepth: number, out: SidecarPath[]): Promise<void> {
  if (depth > maxDepth) return
  let entries: import("node:fs").Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch { return }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      await walk(root, full, depth + 1, maxDepth, out)
      continue
    }
    if (!e.isFile()) continue
    if (!isSidecarName(e.name)) continue
    const rel = path.relative(root, full)
    const album = albumOfRel(rel)
    out.push({
      full,
      rel,
      album,
      base: stripSidecarSuffix(e.name),
      isAlbumMeta: e.name.toLowerCase() === "metadata.json",
    })
    if (out.length >= MAX_SIDECARS * 2) return
  }
}

function isSidecarName(name: string): boolean {
  if (name.toLowerCase() === "metadata.json") return true
  // Canonical Takeout sidecars: `<base>.<media-ext>.json` or
  // `<base>.<media-ext>.suppl.json` (long-filename variant).
  const lower = name.toLowerCase()
  if (!lower.endsWith(".json")) return false
  const stripped = lower.endsWith(".suppl.json") ? lower.slice(0, -".suppl.json".length) : lower.slice(0, -".json".length)
  const ext = path.extname(stripped)
  return MEDIA_EXTS.has(ext)
}

function stripSidecarSuffix(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith(".suppl.json")) return name.slice(0, -".suppl.json".length)
  return name.slice(0, -".json".length)
}

function albumOfRel(rel: string): string | null {
  const parts = rel.split(path.sep)
  if (parts.length < 2) return null
  return parts[0]
}

async function countTakeoutSidecars(dir: string, maxDepth: number, capPerLevel: number): Promise<number> {
  let count = 0
  async function go(d: string, depth: number): Promise<void> {
    if (depth > maxDepth || count >= capPerLevel) return
    let entries: import("node:fs").Dirent[]
    try { entries = await fs.readdir(d, { withFileTypes: true }) }
    catch { return }
    for (const e of entries) {
      if (count >= capPerLevel) return
      if (SKIP_DIRS.has(e.name)) continue
      const full = path.join(d, e.name)
      if (e.isDirectory()) {
        await go(full, depth + 1)
      } else if (e.isFile()) {
        if (e.name.toLowerCase() === "metadata.json") continue
        if (isSidecarName(e.name)) count += 1
      }
    }
  }
  await go(dir, 0)
  return count
}

// ---------------------------------------------------------------------------
// Sidecar parsing
// ---------------------------------------------------------------------------

interface AlbumMetadata {
  title: string
  description?: string
  date?: string         // ISO
  geoLat?: number
  geoLng?: number
}

type SidecarRead =
  | { kind: "album"; albumKey: string; meta: AlbumMetadata }
  | { kind: "row";   row: PhotoRow }

async function readSidecar(_root: string, s: SidecarPath): Promise<SidecarRead | null> {
  let raw: string
  try { raw = await fs.readFile(s.full, "utf8") }
  catch { return null }
  let json: Record<string, unknown>
  try { json = JSON.parse(raw) as Record<string, unknown> }
  catch { return null }

  if (s.isAlbumMeta) {
    if (!s.album) return null
    return { kind: "album", albumKey: s.album, meta: albumFromJson(json, s.album) }
  }

  // Per-media sidecar.
  const filename = typeof json.title === "string" && json.title ? json.title : s.base
  const ext = path.extname(filename).toLowerCase()
  const isVideo = VIDEO_EXTS.has(ext)

  const taken = readTimestamp(json.photoTakenTime as Record<string, unknown> | undefined)
  const created = readTimestamp(json.creationTime as Record<string, unknown> | undefined)
  const ts = taken || created || null
  const dateObj = ts ? new Date(ts) : null
  const date = dateObj && !Number.isNaN(dateObj.getTime()) ? dateObj.toISOString().slice(0, 10) : null
  const month = date ? date.slice(0, 7) : null
  const year = date ? date.slice(0, 4) : null
  const hour = dateObj && !Number.isNaN(dateObj.getTime()) ? dateObj.getUTCHours() : null
  const dow = dateObj && !Number.isNaN(dateObj.getTime()) ? dateObj.getUTCDay() : null

  const { lat, lng, altitude } = readGeo(json)
  const hasGeo = lat !== null && lng !== null && !(lat === 0 && lng === 0)

  const { device, kind } = readDevice(json)

  const favorited = json.favorited === true
  const archived = json.archived === true
  const trashed = json.trashed === true

  const isEdited = /-(?:edited|modificado|edit)\b/i.test(filename) || /-EDITED\b/.test(filename)

  const row: PhotoRow = {
    id: "",
    filename,
    album: s.album,
    isVideo,
    ext: ext.replace(/^\./, ""),
    ts,
    tsCreation: created || null,
    year,
    month,
    date,
    hour,
    dow,
    hasTimestamp: ts !== null,
    lat: hasGeo ? lat : null,
    lng: hasGeo ? lng : null,
    altitude: altitude !== null ? altitude : null,
    hasGeo,
    device,
    deviceKind: kind,
    favorited,
    archived,
    trashed,
    isEdited,
    sidecarFile: s.rel,
    raw: trimRaw(json),
  }

  return { kind: "row", row }
}

function albumFromJson(json: Record<string, unknown>, fallback: string): AlbumMetadata {
  const title = typeof json.title === "string" && json.title ? json.title : fallback
  const description = typeof json.description === "string" ? json.description : undefined
  const date = readTimestamp(json.date as Record<string, unknown> | undefined) || undefined
  const geo = json.geoData as Record<string, unknown> | undefined
  const geoLat = geo && typeof geo.latitude === "number" ? geo.latitude : undefined
  const geoLng = geo && typeof geo.longitude === "number" ? geo.longitude : undefined
  return { title, description, date, geoLat, geoLng }
}

function readTimestamp(o: Record<string, unknown> | undefined): string | null {
  if (!o || typeof o !== "object") return null
  const ts = o.timestamp
  if (typeof ts === "string" || typeof ts === "number") {
    const n = typeof ts === "number" ? ts : Number(ts)
    if (Number.isFinite(n) && n > 0) {
      const d = new Date(n * 1000)
      if (!Number.isNaN(d.getTime())) return d.toISOString()
    }
  }
  const formatted = o.formatted
  if (typeof formatted === "string" && formatted) {
    const d = new Date(formatted)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return null
}

function readGeo(json: Record<string, unknown>): { lat: number | null; lng: number | null; altitude: number | null } {
  const candidates: Array<Record<string, unknown> | undefined> = [
    json.geoData as Record<string, unknown> | undefined,
    json.geoDataExif as Record<string, unknown> | undefined,
  ]
  for (const c of candidates) {
    if (!c || typeof c !== "object") continue
    const lat = typeof c.latitude === "number" ? c.latitude : null
    const lng = typeof c.longitude === "number" ? c.longitude : null
    const altitude = typeof c.altitude === "number" ? c.altitude : null
    if (lat !== null && lng !== null && !(lat === 0 && lng === 0)) {
      return { lat, lng, altitude }
    }
  }
  return { lat: null, lng: null, altitude: null }
}

function readDevice(json: Record<string, unknown>): { device: string | null; kind: PhotoRow["deviceKind"] } {
  const origin = json.googlePhotosOrigin as Record<string, unknown> | undefined
  if (origin && typeof origin === "object") {
    const mobile = origin.mobileUpload as Record<string, unknown> | undefined
    if (mobile && typeof mobile === "object") {
      const deviceType = typeof mobile.deviceType === "string" ? mobile.deviceType : ""
      const deviceFolder = mobile.deviceFolder as Record<string, unknown> | undefined
      const folderName = deviceFolder && typeof deviceFolder.localFolderName === "string"
        ? deviceFolder.localFolderName : ""
      const label = [deviceType, folderName].filter(Boolean).join(" — ").trim()
      const kind = mapDeviceKind(deviceType)
      if (label) return { device: label, kind }
    }
    if (origin.webUpload || origin.composition || origin.partnerSharing) {
      return { device: "Web upload", kind: "web" }
    }
  }
  // EXIF-style fallback that some sidecars carry directly (rare but possible).
  const exif = json.exif as Record<string, unknown> | undefined
  if (exif && typeof exif === "object") {
    const make = typeof exif.cameraMake === "string" ? exif.cameraMake : ""
    const model = typeof exif.cameraModel === "string" ? exif.cameraModel : ""
    const label = [make, model].filter(Boolean).join(" ").trim()
    if (label) return { device: "CAMERA — " + label, kind: "camera" }
  }
  return { device: null, kind: "unknown" }
}

function mapDeviceKind(deviceType: string): PhotoRow["deviceKind"] {
  const t = (deviceType || "").toUpperCase()
  if (t.includes("ANDROID")) return "android"
  if (t.includes("IOS") || t.includes("IPHONE") || t.includes("IPAD")) return "ios"
  if (t.includes("WEB")) return "web"
  if (t.includes("CAMERA") || t.includes("DSLR")) return "camera"
  return "unknown"
}

function trimRaw(json: Record<string, unknown>): Record<string, unknown> {
  // Keep the sidecar small enough to inline thousands of rows. Drop verbose
  // fields like `description` (already kept) only if it's huge; trim any
  // string > 240 chars.
  const out: Record<string, unknown> = {}
  let n = 0
  for (const [k, v] of Object.entries(json)) {
    if (n >= 16) { out["…"] = "+" + (Object.keys(json).length - n) + " more"; break }
    if (typeof v === "string" && v.length > 240) out[k] = v.slice(0, 240) + "…"
    else out[k] = v
    n += 1
  }
  return out
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function aggregate(
  rows: PhotoRow[],
  albumMeta: Record<string, AlbumMetadata>,
  meta: { sourceDir: string; fileCount: number; sidecarCount: number; sourceFile: string; sizeBytes: number },
  _editedCounter: number,
): ParsedFile {
  const totalCount = rows.length
  const photoCount = rows.filter(r => !r.isVideo).length
  const videoCount = totalCount - photoCount

  // Albums
  const albumAgg: Record<string, AlbumAgg> = {}
  for (const r of rows) {
    const key = r.album || "(loose)"
    const titleFromMeta = r.album && albumMeta[r.album]?.title
    const display = titleFromMeta || key
    const a = albumAgg[display] = albumAgg[display] || {
      name: display,
      itemCount: 0,
      photoCount: 0,
      videoCount: 0,
      first: r.date || "9999-12-31",
      last: r.date || "0000-01-01",
      topDevice: null,
      sampleFilenames: [],
      mosaicHashes: [],
      filenameSet: new Set<string>(),
      deviceCounts: {},
    }
    a.itemCount += 1
    if (r.isVideo) a.videoCount += 1
    else a.photoCount += 1
    if (r.date) {
      if (r.date < a.first) a.first = r.date
      if (r.date > a.last) a.last = r.date
    }
    if (a.sampleFilenames.length < 8) a.sampleFilenames.push(r.filename)
    if (a.mosaicHashes.length < 8) a.mosaicHashes.push(hashHue(r.filename))
    a.filenameSet.add(stripExt(r.filename).toLowerCase())
    if (r.device) a.deviceCounts[r.device] = (a.deviceCounts[r.device] || 0) + 1
  }
  for (const a of Object.values(albumAgg)) {
    a.topDevice = topKey(a.deviceCounts)
    if (a.first === "9999-12-31") a.first = ""
    if (a.last === "0000-01-01") a.last = ""
  }
  // Compute album overlap (≥3 shared filenames).
  const albumNames = Object.keys(albumAgg)
  const albumOverlap: Record<string, Array<{ other: string; shared: number }>> = {}
  for (let i = 0; i < albumNames.length; i++) {
    for (let j = i + 1; j < albumNames.length; j++) {
      const A = albumAgg[albumNames[i]]
      const B = albumAgg[albumNames[j]]
      let shared = 0
      const small = A.filenameSet.size <= B.filenameSet.size ? A.filenameSet : B.filenameSet
      const big = A.filenameSet.size <= B.filenameSet.size ? B.filenameSet : A.filenameSet
      for (const k of small) if (big.has(k)) { shared += 1; if (shared >= 200) break }
      if (shared >= 3) {
        ;(albumOverlap[A.name] = albumOverlap[A.name] || []).push({ other: B.name, shared })
        ;(albumOverlap[B.name] = albumOverlap[B.name] || []).push({ other: A.name, shared })
      }
    }
  }
  const albums = Object.values(albumAgg).map(a => ({
    name: a.name,
    itemCount: a.itemCount,
    photoCount: a.photoCount,
    videoCount: a.videoCount,
    first: a.first,
    last: a.last,
    topDevice: a.topDevice,
    sampleFilenames: a.sampleFilenames,
    mosaicHashes: a.mosaicHashes,
    overlap: (albumOverlap[a.name] || []).slice(0, 3),
  })).sort((a, b) => b.itemCount - a.itemCount)

  // Devices
  const deviceAgg: Record<string, {
    name: string
    kind: PhotoRow["deviceKind"]
    itemCount: number
    photoCount: number
    videoCount: number
    first: string
    last: string
    monthly: Record<string, number>
  }> = {}
  for (const r of rows) {
    const name = r.device || "unknown device"
    const d = deviceAgg[name] = deviceAgg[name] || {
      name,
      kind: r.deviceKind,
      itemCount: 0,
      photoCount: 0,
      videoCount: 0,
      first: r.date || "9999-12-31",
      last: r.date || "0000-01-01",
      monthly: {},
    }
    d.itemCount += 1
    if (r.isVideo) d.videoCount += 1
    else d.photoCount += 1
    if (r.date) {
      if (r.date < d.first) d.first = r.date
      if (r.date > d.last) d.last = r.date
      d.monthly[r.month!] = (d.monthly[r.month!] || 0) + 1
    }
  }
  const allMonths = new Set<string>()
  for (const r of rows) if (r.month) allMonths.add(r.month)
  const sortedMonths = Array.from(allMonths).sort()
  const devices = Object.values(deviceAgg)
    .map(d => ({
      name: d.name,
      kind: d.kind,
      itemCount: d.itemCount,
      share: totalCount ? d.itemCount / totalCount : 0,
      photoCount: d.photoCount,
      videoCount: d.videoCount,
      first: d.first === "9999-12-31" ? "" : d.first,
      last: d.last === "0000-01-01" ? "" : d.last,
      monthly: sortedMonths.map(m => ({ month: m, count: d.monthly[m] || 0 })),
    }))
    .sort((a, b) => b.itemCount - a.itemCount)

  // Month / year totals
  const monthAgg: Record<string, { count: number; photo: number; video: number; days: Set<string> }> = {}
  const yearAgg: Record<string, { count: number; photo: number; video: number }> = {}
  for (const r of rows) {
    if (r.month && r.year && r.date) {
      const m = monthAgg[r.month] = monthAgg[r.month] || { count: 0, photo: 0, video: 0, days: new Set<string>() }
      m.count += 1
      if (r.isVideo) m.video += 1; else m.photo += 1
      m.days.add(r.date)
      const y = yearAgg[r.year] = yearAgg[r.year] || { count: 0, photo: 0, video: 0 }
      y.count += 1
      if (r.isVideo) y.video += 1; else y.photo += 1
    }
  }
  const monthTotals = sortedMonths.map(m => ({
    month: m,
    count: monthAgg[m]?.count || 0,
    photo: monthAgg[m]?.photo || 0,
    video: monthAgg[m]?.video || 0,
    days: monthAgg[m]?.days.size || 0,
  }))
  const sortedYears = Object.keys(yearAgg).sort()
  const yearTotals = sortedYears.map(y => ({ year: y, count: yearAgg[y].count, photo: yearAgg[y].photo, video: yearAgg[y].video }))
  const yearMonthHeatmap = {
    years: sortedYears,
    cells: sortedYears.map(y => {
      const arr = new Array(12).fill(0)
      for (const m of sortedMonths) {
        if (m.startsWith(y + "-")) {
          const mm = parseInt(m.slice(5, 7), 10) - 1
          arr[mm] = monthAgg[m]?.count || 0
        }
      }
      return arr
    }),
  }

  // Hour-of-day + day-of-week distributions.
  const hourCounts = new Array(24).fill(0)
  const dowCounts = new Array(7).fill(0)
  const heatmap: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0))
  for (const r of rows) {
    if (r.hour !== null && r.dow !== null) {
      hourCounts[r.hour] += 1
      dowCounts[r.dow] += 1
      heatmap[r.dow][r.hour] += 1
    }
  }

  // Busiest day / month / year.
  const dayAgg: Record<string, number> = {}
  for (const r of rows) if (r.date) dayAgg[r.date] = (dayAgg[r.date] || 0) + 1
  const busiestDay = Object.entries(dayAgg).sort((a, b) => b[1] - a[1])[0] || null
  const busiestMonth = Object.entries(monthAgg).sort((a, b) => b[1].count - a[1].count)[0] || null
  const busiestYear = Object.entries(yearAgg).sort((a, b) => b[1].count - a[1].count)[0] || null

  // Geotag coverage + places clustering.
  const geoRows = rows.filter(r => r.hasGeo && r.lat !== null && r.lng !== null)
  const places = buildPlaces(geoRows)

  // Bursts: ≥4 rows within a 3-min window in the same album.
  const bursts = detectBursts(rows, 180)

  // Edited / original pairs.
  const editedPairs: Array<{ base: string; original: string; edited: string }> = []
  const baseIndex: Record<string, string> = {}
  for (const r of rows) {
    if (r.isEdited) continue
    baseIndex[stripEditedSuffix(stripExt(r.filename)).toLowerCase()] = r.id
  }
  for (const r of rows) {
    if (!r.isEdited) continue
    const baseKey = stripEditedSuffix(stripExt(r.filename)).toLowerCase()
    if (baseIndex[baseKey]) editedPairs.push({ base: baseKey, original: baseIndex[baseKey], edited: r.id })
  }

  // Visual duplicates: same photoTakenTime + same album.
  const dupKey: Record<string, string[]> = {}
  for (const r of rows) {
    if (!r.ts) continue
    const k = (r.album || "(loose)") + "|" + r.ts
    ;(dupKey[k] = dupKey[k] || []).push(r.id)
  }
  const duplicates: Array<{ ts: string; album: string | null; sampleIds: string[]; reason: string }> = []
  for (const [k, ids] of Object.entries(dupKey)) {
    if (ids.length >= 2) {
      const [album, ts] = k.split("|")
      duplicates.push({
        ts,
        album: album === "(loose)" ? null : album,
        sampleIds: ids.slice(0, 6),
        reason: "same photoTakenTime + same album",
      })
    }
  }

  // Coverage counts.
  const missingTimestampCount = rows.filter(r => !r.hasTimestamp).length
  const missingGeoCount = rows.filter(r => !r.hasGeo).length
  const missingDeviceCount = rows.filter(r => !r.device).length
  const favoritedCount = rows.filter(r => r.favorited).length
  const archivedCount = rows.filter(r => r.archived).length
  const trashedCount = rows.filter(r => r.trashed).length

  const datesSorted = rows.map(r => r.date).filter((d): d is string => !!d).sort()
  const dateRange = datesSorted.length ? `${datesSorted[0]} → ${datesSorted[datesSorted.length - 1]}` : "(empty)"
  const durLabel = durationLabel(datesSorted[0], datesSorted[datesSorted.length - 1])

  const summary = {
    totalCount,
    photoCount,
    videoCount,
    albumCount: albums.length,
    deviceCount: devices.length,
    dateRange,
    durationLabel: durLabel,
    activeDays: Object.keys(dayAgg).length,
    activeMonths: monthTotals.length,
    busiestDay: busiestDay ? { date: busiestDay[0], count: busiestDay[1] } : null,
    busiestMonth: busiestMonth ? { month: busiestMonth[0], count: busiestMonth[1].count } : null,
    busiestYear: busiestYear ? { year: busiestYear[0], count: busiestYear[1].count } : null,
    geoCount: geoRows.length,
    geoShare: totalCount ? geoRows.length / totalCount : 0,
    favoritedCount,
    archivedCount,
    trashedCount,
    editedPairCount: editedPairs.length,
    burstCount: bursts.length,
    duplicateCount: duplicates.length,
    missingTimestampCount,
    missingGeoCount,
    missingDeviceCount,
    topAlbum: albums[0] ? { name: albums[0].name, count: albums[0].itemCount } : null,
    topDevice: devices[0]?.name || null,
    topDeviceCount: devices[0]?.itemCount || 0,
  }

  const data = {
    format: "google-photos-takeout",
    rows,
    summary,
    albums,
    devices,
    monthTotals,
    yearTotals,
    yearMonthHeatmap,
    hourCounts,
    dowCounts,
    heatmap,
    places,
    bursts,
    editedPairs,
    duplicates,
    meta: {
      sourceFile: meta.sourceDir,
      sizeBytes: meta.sizeBytes,
      sourceDir: meta.sourceDir,
      fileCount: meta.fileCount,
      sidecarCount: meta.sidecarCount,
      shape: "google-photos-takeout",
    },
  }

  const sample = {
    summary,
    albums: albums.slice(0, 8),
    devices: devices.slice(0, 6),
    monthTotals: monthTotals.slice(-12),
    yearTotals,
    hourCounts,
    dowCounts,
    placeClusters: places.clusters.slice(0, 6),
    bursts: bursts.slice(0, 4),
    editedPairs: editedPairs.slice(0, 4),
    duplicates: duplicates.slice(0, 4),
    firstRows: rows.slice(0, 6).map(stripRow),
    lastRows: rows.slice(-3).map(stripRow),
  }

  const summaryLine =
    `Google Photos Takeout — ${totalCount} media (${photoCount} photo / ${videoCount} video) ` +
    `across ${albums.length} albums (${dateRange}, ${durLabel}). ` +
    `Top album: ${summary.topAlbum?.name || "—"}. ` +
    `Top device: ${summary.topDevice || "—"}. ` +
    `Geotag coverage: ${Math.round(summary.geoShare * 100)}%.`

  return {
    contentType: "google-photos-takeout",
    summary: summaryLine,
    sample,
    data,
    meta: {
      sourceFile: meta.sourceDir,
      sizeBytes: meta.sizeBytes,
      shape: "google-photos-takeout",
      totalCount,
      photoCount,
      videoCount,
      albumCount: albums.length,
      deviceCount: devices.length,
      dateRange,
    },
  }
}

function stripRow(r: PhotoRow): PhotoRow {
  return { ...r, raw: { "…": "trimmed for sample" } as Record<string, unknown> }
}

// ---------------------------------------------------------------------------
// Helpers — places, bursts, hashing, dates
// ---------------------------------------------------------------------------

interface PlacesPayload {
  points: Array<{ lat: number; lng: number; count: number; sampleId: string }>
  clusters: Array<{
    label: string
    lat: number
    lng: number
    count: number
    first: string
    last: string
    sampleIds: string[]
  }>
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null
}

function buildPlaces(rows: PhotoRow[]): PlacesPayload {
  if (rows.length === 0) return { points: [], clusters: [], bbox: null }
  // Bin to 1° cells for clusters; collapse points with same 0.01° rounding for the scatter.
  const cellAgg: Record<string, { lat: number; lng: number; count: number; first: string; last: string; sampleIds: string[] }> = {}
  const pointAgg: Record<string, { lat: number; lng: number; count: number; sampleId: string }> = {}
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
  for (const r of rows) {
    if (r.lat === null || r.lng === null) continue
    if (r.lat < minLat) minLat = r.lat
    if (r.lat > maxLat) maxLat = r.lat
    if (r.lng < minLng) minLng = r.lng
    if (r.lng > maxLng) maxLng = r.lng

    const cellKey = Math.round(r.lat) + "|" + Math.round(r.lng)
    const c = cellAgg[cellKey] = cellAgg[cellKey] || {
      lat: Math.round(r.lat * 10) / 10,
      lng: Math.round(r.lng * 10) / 10,
      count: 0,
      first: r.date || "",
      last: r.date || "",
      sampleIds: [],
    }
    c.count += 1
    if (r.date && (!c.first || r.date < c.first)) c.first = r.date
    if (r.date && (!c.last || r.date > c.last)) c.last = r.date
    if (c.sampleIds.length < 6) c.sampleIds.push(r.id)

    const pointKey = (Math.round(r.lat * 100) / 100) + "|" + (Math.round(r.lng * 100) / 100)
    const p = pointAgg[pointKey] = pointAgg[pointKey] || {
      lat: Math.round(r.lat * 100) / 100,
      lng: Math.round(r.lng * 100) / 100,
      count: 0,
      sampleId: r.id,
    }
    p.count += 1
  }
  const clusters = Object.values(cellAgg)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
    .map(c => ({
      label: clusterLabel(c.lat, c.lng),
      lat: c.lat,
      lng: c.lng,
      count: c.count,
      first: c.first,
      last: c.last,
      sampleIds: c.sampleIds,
    }))
  const points = Object.values(pointAgg).sort((a, b) => b.count - a.count).slice(0, 1000)
  return {
    points,
    clusters,
    bbox: minLat !== Infinity ? { minLat, maxLat, minLng, maxLng } : null,
  }
}

function clusterLabel(lat: number, lng: number): string {
  const ns = lat >= 0 ? "N" : "S"
  const ew = lng >= 0 ? "E" : "W"
  return `Cluster around ${Math.abs(lat).toFixed(1)} ${ns}, ${Math.abs(lng).toFixed(1)} ${ew}`
}

interface Burst {
  start: string
  end: string
  durationSec: number
  count: number
  album: string | null
  sampleFilenames: string[]
  itemIds: string[]
}

function detectBursts(rows: PhotoRow[], gapSec: number): Burst[] {
  if (!rows.length) return []
  // Bucket by album so a timestamp-adjacent row from a different album can't
  // break a cluster (Takeout often duplicates a named-album photo into the
  // "Photos from YYYY" auto-album with the same `photoTakenTime`).
  const byAlbum: Record<string, PhotoRow[]> = {}
  for (const r of rows) {
    if (!r.ts) continue
    const k = r.album || "(loose)"
    ;(byAlbum[k] = byAlbum[k] || []).push(r)
  }
  const gapMs = gapSec * 1000
  const bursts: Burst[] = []
  for (const [albumKey, list] of Object.entries(byAlbum)) {
    const sorted = list.slice().sort((a, b) => a.ts!.localeCompare(b.ts!))
    let cur: { start: number; end: number; ids: string[]; album: string | null; titles: string[] } | null = null
    for (const r of sorted) {
      const t = Date.parse(r.ts!)
      if (!Number.isFinite(t)) continue
      if (cur && t - cur.end <= gapMs) {
        cur.end = t
        cur.ids.push(r.id)
        if (cur.titles.length < 6) cur.titles.push(r.filename)
      } else {
        if (cur && cur.ids.length >= 4) bursts.push(finalizeBurst(cur))
        cur = { start: t, end: t, ids: [r.id], album: albumKey === "(loose)" ? null : albumKey, titles: [r.filename] }
      }
    }
    if (cur && cur.ids.length >= 4) bursts.push(finalizeBurst(cur))
  }
  return bursts.sort((a, b) => b.count - a.count).slice(0, 12)
}

function finalizeBurst(s: { start: number; end: number; ids: string[]; album: string | null; titles: string[] }): Burst {
  return {
    start: new Date(s.start).toISOString(),
    end: new Date(s.end).toISOString(),
    durationSec: Math.round((s.end - s.start) / 1000),
    count: s.ids.length,
    album: s.album,
    sampleFilenames: s.titles.slice(0, 6),
    itemIds: s.ids,
  }
}

function stripExt(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot > 0 ? name.slice(0, dot) : name
}

function stripEditedSuffix(name: string): string {
  return name.replace(/-(?:edited|modificado|edit)$/i, "").replace(/-EDITED$/, "")
}

function hashHue(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h) % 360
}

function topKey(rec: Record<string, number>): string | null {
  let best: [string, number] | null = null
  for (const [k, v] of Object.entries(rec)) {
    if (best === null || v > best[1]) best = [k, v]
  }
  return best?.[0] || null
}

function durationLabel(first: string | undefined, last: string | undefined): string {
  if (!first || !last) return ""
  const d1 = new Date(first + "T00:00:00Z").getTime()
  const d2 = new Date(last + "T00:00:00Z").getTime()
  if (!Number.isFinite(d1) || !Number.isFinite(d2)) return ""
  const days = Math.max(1, Math.round((d2 - d1) / 86400000))
  if (days < 60) return `${days} days`
  const months = Math.round(days / 30)
  if (months < 24) return `${months} months`
  const years = Math.floor(months / 12)
  const rem = months % 12
  return rem ? `${years} years ${rem} months` : `${years} years`
}
