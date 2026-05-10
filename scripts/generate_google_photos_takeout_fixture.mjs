#!/usr/bin/env node
/**
 * Deterministic generator for the synthetic Google Photos Takeout
 * fixture under `examples/google-photos-takeout/Takeout/Google Photos/`.
 *
 * The fixture is **fully fake**:
 *   - fake album names ("Iceland 2024", "Sourdough kitchen", …)
 *   - fake device strings (Pixel 8, iPhone 15, an old Canon DSLR)
 *   - fake coordinates (open-ocean / remote-land)
 *   - fake timestamps spanning Jan 2024 → Apr 2025
 *   - fake filenames (IMG_<seed>_<n>.jpg, VID_<seed>_<n>.mp4)
 *   - one tiny placeholder text file per "media" so the album folder
 *     looks like a real Takeout export, but the placeholder is plain
 *     ASCII text, NOT an image; the parser never opens these.
 *
 * Usage:
 *   node scripts/generate_google_photos_takeout_fixture.mjs
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, "..")
const ROOT = path.join(REPO, "examples", "google-photos-takeout", "Takeout", "Google Photos")

// Mulberry32 RNG so the fixture is byte-identical across machines.
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0
    let t = Math.imul(a ^ a >>> 15, 1 | a)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}
const rng = mulberry32(0x47504854) // "GPHT"
const pick = arr => arr[Math.floor(rng() * arr.length)]
const rint = (lo, hi) => Math.floor(lo + rng() * (hi - lo + 1))

const DEVICES = [
  { type: "ANDROID_PHONE", folder: "Camera", model: "Pixel 8", weight: 38 },
  { type: "IOS_PHONE",     folder: "DCIM",   model: "iPhone 15", weight: 28 },
  { type: "ANDROID_PHONE", folder: "Camera", model: "Pixel 6a", weight: 14 },
  { type: "CAMERA",        folder: "",       model: "Canon EOS 70D", weight: 8 },
  { type: "WEB_UPLOAD",    folder: "",       model: "Web upload", weight: 4 },
  { type: "",              folder: "",       model: "", weight: 8 }, // unknown / no device
]

function pickDevice() {
  const total = DEVICES.reduce((a, d) => a + d.weight, 0)
  let r = rng() * total
  for (const d of DEVICES) { r -= d.weight; if (r <= 0) return d }
  return DEVICES[0]
}

// Synthetic place clusters far from any real city; coordinates land in the
// remote North Atlantic, the open Pacific, deep ocean, and one fake mountain
// region in the middle of nowhere.
const PLACES = [
  { lat: 64.1466, lng: -21.9426, jitter: 0.6, label: "Iceland (synthetic)" },
  { lat: 41.9028, lng: 12.4964, jitter: 0.4, label: "Italy (synthetic)" },
  { lat: 35.6595, lng: 139.7004, jitter: 0.3, label: "Tokyo (synthetic)" },
  { lat: 40.4168, lng:  -3.7038, jitter: 0.5, label: "Spain (synthetic)" },
  { lat: 30.2672, lng: -97.7431, jitter: 0.2, label: "Austin (synthetic)" },
]

const ALBUMS = [
  // (name, photo target, video target, allow geo, place-bias)
  { name: "Photos from 2024",      photo: 80,  video: 8, geoShare: 0.55, placeBias: null },
  { name: "Photos from 2025",      photo: 50,  video: 5, geoShare: 0.55, placeBias: null },
  { name: "Iceland 2024",          photo: 60,  video: 8, geoShare: 0.95, placeBias: 0 }, // PLACES[0]
  { name: "Italy 2024",            photo: 38,  video: 4, geoShare: 0.95, placeBias: 1 }, // PLACES[1]
  { name: "Sourdough kitchen",     photo: 24,  video: 0, geoShare: 0.30, placeBias: 4 },
  { name: "Family",                photo: 18,  video: 4, geoShare: 0.40, placeBias: 4 },
  { name: "Austin coffee crawl",   photo: 14,  video: 2, geoShare: 0.85, placeBias: 4 },
]

// Date windows per album (ms epoch).
function dateWindow(albumName) {
  const start = Date.UTC(2024, 0, 4)
  const end   = Date.UTC(2025, 3, 30)
  if (albumName === "Iceland 2024") return [Date.UTC(2024, 8, 12), Date.UTC(2024, 8, 23)]
  if (albumName === "Italy 2024")   return [Date.UTC(2024, 4, 8),  Date.UTC(2024, 4, 18)]
  if (albumName === "Austin coffee crawl") return [Date.UTC(2025, 1, 14), Date.UTC(2025, 2, 4)]
  if (albumName === "Sourdough kitchen") return [Date.UTC(2024, 1, 1), Date.UTC(2025, 3, 28)]
  if (albumName === "Family") return [Date.UTC(2024, 5, 1), Date.UTC(2025, 3, 25)]
  if (albumName === "Photos from 2024") return [start, Date.UTC(2024, 11, 30)]
  if (albumName === "Photos from 2025") return [Date.UTC(2025, 0, 1), end]
  return [start, end]
}

function pickPlace(bias) {
  const p = bias != null ? PLACES[bias] : pick(PLACES)
  const lat = p.lat + (rng() - 0.5) * p.jitter
  const lng = p.lng + (rng() - 0.5) * p.jitter
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, altitude: Math.round(rng() * 200 * 10) / 10 }
}

function fmtTakeoutTimestamp(ts) {
  const d = new Date(ts * 1000)
  return d.toUTCString().replace(/^[A-Z][a-z]{2}, /, "").replace(" GMT", " UTC")
}

function makeFilename(prefix, ts, idx) {
  const d = new Date(ts * 1000)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(d.getUTCDate()).padStart(2, "0")
  const hh = String(d.getUTCHours()).padStart(2, "0")
  const mi = String(d.getUTCMinutes()).padStart(2, "0")
  const ss = String(d.getUTCSeconds()).padStart(2, "0")
  return `${prefix}_${yyyy}${mm}${dd}_${hh}${mi}${ss}_${String(idx).padStart(4, "0")}`
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function writeJson(file, obj) {
  await fs.writeFile(file, JSON.stringify(obj, null, 2) + "\n", "utf8")
}

async function writePlaceholder(file) {
  // Fake photo placeholder — plain ASCII so the file isn't a real image.
  // The parser MUST NOT read these. Keep them tiny.
  await fs.writeFile(file, "[synthetic placeholder — not a real photo]\n", "utf8")
}

async function generate() {
  // Wipe the Google Photos directory, leave the README at the parent intact.
  try { await fs.rm(ROOT, { recursive: true, force: true }) } catch {}
  await ensureDir(ROOT)

  let created = 0
  const allFilenames = new Set()
  // Track shared filenames for "Photos from YYYY" overlap with named albums.
  const sharedToYearly = []

  // Engineered bursts — explicit clusters of ≥5 photos within ~2 minutes
  // of each other in the same album. The parser flags ≥4 within 3 min.
  const ENGINEERED_BURSTS = [
    { album: "Iceland 2024", anchor: Date.UTC(2024, 8, 15, 11, 42, 1) / 1000, count: 6 },
    { album: "Iceland 2024", anchor: Date.UTC(2024, 8, 18, 16,  5, 1) / 1000, count: 5 },
    { album: "Italy 2024",   anchor: Date.UTC(2024, 4, 12, 19, 30, 1) / 1000, count: 5 },
  ]

  for (const album of ALBUMS) {
    const dir = path.join(ROOT, album.name)
    await ensureDir(dir)
    // Album metadata.json.
    const [winStart, winEnd] = dateWindow(album.name)
    const albumTs = Math.floor((winStart + (winEnd - winStart) / 2) / 1000)
    const albumMeta = {
      title: album.name,
      description: "",
      access: "protected",
      date: { timestamp: String(albumTs), formatted: fmtTakeoutTimestamp(albumTs) },
      location: "",
      geoData: album.placeBias != null
        ? { latitude: PLACES[album.placeBias].lat, longitude: PLACES[album.placeBias].lng, altitude: 0, latitudeSpan: 0, longitudeSpan: 0 }
        : { latitude: 0, longitude: 0, altitude: 0, latitudeSpan: 0, longitudeSpan: 0 },
    }
    await writeJson(path.join(dir, "metadata.json"), albumMeta)

    const total = album.photo + album.video

    // Inject engineered bursts for this album first (consume from the
    // photo budget so total album count stays the same).
    const albumBursts = ENGINEERED_BURSTS.filter(b => b.album === album.name)
    let burstSlot = 0
    let burstFilled = 0

    for (let i = 0; i < total; i++) {
      const isVideo = i < album.video
      const ext = isVideo ? "mp4" : (rng() < 0.15 ? "heic" : "jpg")
      // Date selection: prefer engineered bursts on photo slots, otherwise random.
      let ts
      if (!isVideo && burstSlot < albumBursts.length) {
        const b = albumBursts[burstSlot]
        ts = b.anchor + burstFilled * rint(15, 30)
        burstFilled += 1
        if (burstFilled >= b.count) { burstSlot += 1; burstFilled = 0 }
      } else {
        ts = Math.floor((winStart + rng() * (winEnd - winStart)) / 1000)
      }
      const prefix = isVideo ? "VID" : "IMG"
      const baseFilename = makeFilename(prefix, ts, i + 1) + "." + ext

      // Small chance: edited variant of an existing filename.
      let filename = baseFilename
      const isEdited = !isVideo && rng() < 0.05
      if (isEdited) {
        filename = makeFilename(prefix, ts, i + 1) + "-edited." + ext
        // Also write the original alongside.
        const orig = makeFilename(prefix, ts, i + 1) + "." + ext
        if (!allFilenames.has(orig + "|" + album.name)) {
          await writeOne({ dir, album, ts, isVideo, filename: orig, isEdited: false })
          allFilenames.add(orig + "|" + album.name)
          created += 1
        }
      }

      await writeOne({ dir, album, ts, isVideo, filename, isEdited })
      allFilenames.add(filename + "|" + album.name)
      created += 1

      // Record some files to also include in "Photos from YYYY" so we can
      // demonstrate album overlap signals.
      if (album.placeBias != null && rng() < 0.45) {
        sharedToYearly.push({ filename, ts, isVideo, isEdited, originalAlbum: album.name })
      }

      // Occasionally drop a "duplicate" (same ts + same album, different filename suffix).
      if (!isVideo && rng() < 0.04) {
        const dup = makeFilename(prefix, ts, i + 1) + "-dup." + ext
        await writeOne({ dir, album, ts, isVideo: false, filename: dup, isEdited: false })
        created += 1
      }
    }
  }

  // Echo a portion of the named-album files into the matching "Photos from YYYY"
  // pool to create a realistic Google Photos overlap signal (the auto-album
  // re-includes content). The dates will land in the right yearly bucket.
  for (const s of sharedToYearly) {
    const year = new Date(s.ts * 1000).getUTCFullYear()
    const yearAlbum = "Photos from " + year
    const dir = path.join(ROOT, yearAlbum)
    try { await fs.access(dir) } catch { continue }
    if (allFilenames.has(s.filename + "|" + yearAlbum)) continue
    await writeOne({ dir, album: ALBUMS.find(a => a.name === yearAlbum), ts: s.ts, isVideo: s.isVideo, filename: s.filename, isEdited: s.isEdited })
    allFilenames.add(s.filename + "|" + yearAlbum)
    created += 1
  }

  // Sprinkle a handful of zero-timestamp / zero-geo records to exercise the
  // missing-metadata UI in the auto-album.
  {
    const dir = path.join(ROOT, "Photos from 2024")
    for (let i = 0; i < 7; i++) {
      const filename = `IMG_NOTIME_${String(i + 1).padStart(4, "0")}.jpg`
      await writeMissingTimestamp({ dir, filename })
      created += 1
    }
  }

  console.log(`Wrote ${created} sidecar JSON files (+ matching placeholders) under ${path.relative(REPO, ROOT)}`)
}

async function writeOne({ dir, album, ts, isVideo, filename, isEdited }) {
  const device = pickDevice()
  const wantGeo = rng() < (album.geoShare ?? 0.5)
  const geo = wantGeo ? pickPlace(album.placeBias) : null
  const sidecar = {
    title: filename,
    description: "",
    imageViews: String(rint(0, 14)),
    creationTime: { timestamp: String(ts + rint(0, 60 * 60)), formatted: fmtTakeoutTimestamp(ts + rint(0, 60 * 60)) },
    photoTakenTime: { timestamp: String(ts), formatted: fmtTakeoutTimestamp(ts) },
    geoData: geo
      ? { latitude: geo.lat, longitude: geo.lng, altitude: geo.altitude, latitudeSpan: 0, longitudeSpan: 0 }
      : { latitude: 0, longitude: 0, altitude: 0, latitudeSpan: 0, longitudeSpan: 0 },
    geoDataExif: geo
      ? { latitude: geo.lat, longitude: geo.lng, altitude: geo.altitude, latitudeSpan: 0, longitudeSpan: 0 }
      : { latitude: 0, longitude: 0, altitude: 0, latitudeSpan: 0, longitudeSpan: 0 },
    url: `https://photos.google.com/photo/SYNTHETIC_${filename.replace(/[^a-z0-9]/gi, "_")}`,
    googlePhotosOrigin: device.type
      ? { mobileUpload: { deviceFolder: { localFolderName: device.folder }, deviceType: device.type } }
      : {},
    favorited: !isEdited && !isVideo && rng() < 0.025,
    archived: rng() < 0.012,
    trashed: false,
  }
  if (device.type === "CAMERA") {
    sidecar.exif = { cameraMake: "Canon", cameraModel: device.model, lens: "EF 24-70mm", focalLength: rint(24, 70), iso: rint(100, 800) }
  }
  if (device.type === "WEB_UPLOAD") {
    sidecar.googlePhotosOrigin = { webUpload: { computerUpload: {} } }
  }
  await writeJson(path.join(dir, filename + ".json"), sidecar)
  await writePlaceholder(path.join(dir, filename))
}

async function writeMissingTimestamp({ dir, filename }) {
  const sidecar = {
    title: filename,
    description: "",
    imageViews: "0",
    creationTime: { timestamp: "0", formatted: "" },
    photoTakenTime: { timestamp: "0", formatted: "" },
    geoData: { latitude: 0, longitude: 0, altitude: 0, latitudeSpan: 0, longitudeSpan: 0 },
    geoDataExif: { latitude: 0, longitude: 0, altitude: 0, latitudeSpan: 0, longitudeSpan: 0 },
    url: `https://photos.google.com/photo/SYNTHETIC_${filename}`,
    googlePhotosOrigin: {},
    favorited: false,
    archived: false,
    trashed: false,
  }
  await writeJson(path.join(dir, filename + ".json"), sidecar)
  await writePlaceholder(path.join(dir, filename))
}

await generate()
