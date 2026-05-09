/**
 * Experiential / personal-data parsers.
 *
 * Personal exports from services where the LLM should design a
 * "re-experience this" page rather than a flat report. Each export has
 * its own prompt under `prompts/`; this parser sniffs the file shape
 * and stamps the matching `contentType` so the prompt is loaded.
 *
 *   - spotify-history    — Spotify "Download your data" JSON
 *                          (Account Data: `Streaming_History_Music_*.json`,
 *                           Extended:     `endsong_*.json`).
 *                          Root is an array of play records.
 *   - twitch-history     — Twitch "Request my data" CSV
 *                          (`viewing_history.csv`, `messages.csv`).
 *                          Header has channel + timestamp + duration.
 *   - google-maps-stars  — Google Takeout "Saved" CSV
 *                          (`Starred places.csv`, `Want to go.csv`,
 *                           `Favourite places.csv`).
 *                          Columns: Title, Note, URL, Comment.
 *   - iphone-health      — Apple Health "Export All Health Data" XML
 *                          (`export.xml`). Records + workouts.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Parser, ParsedFile } from "../types.js"

export const parser: Parser = {
  name: "experiential",
  matches: [".json", ".csv", ".xml"],
  async detect(filepath: string): Promise<boolean> {
    const ext = path.extname(filepath).toLowerCase()
    const base = path.basename(filepath).toLowerCase()
    try {
      const head = await readHead(filepath, 8192)
      if (ext === ".json") return looksLikeSpotify(head, base)
      if (ext === ".csv") return looksLikeTwitch(head, base) || looksLikeStars(head, base)
      if (ext === ".xml") return looksLikeAppleHealth(head)
    } catch { /* fall through */ }
    return false
  },
  async parse(filepath: string): Promise<ParsedFile> {
    const ext = path.extname(filepath).toLowerCase()
    const base = path.basename(filepath).toLowerCase()
    const raw = await fs.readFile(filepath, "utf8")
    const meta = {
      sourceFile: path.basename(filepath),
      sizeBytes: Buffer.byteLength(raw, "utf8"),
    }
    if (ext === ".json") return parseSpotify(raw, meta)
    if (ext === ".csv") {
      const firstLine = (raw.split(/\r?\n/, 1)[0] || "").toLowerCase()
      if (looksLikeTwitch(firstLine, base)) return parseTwitch(raw, meta)
      return parseStars(raw, meta)
    }
    return parseAppleHealth(raw, meta)
  },
}

// ----------------------------------- detection

function looksLikeSpotify(head: string, base: string): boolean {
  if (/streaming_history_music|endsong_/i.test(base)) return true
  // Spotify-distinctive keys (Account Data + Extended shapes). Check for
  // a track-name + a play-duration key together in the first ~8 KB.
  const hasTrackKey = /"master_metadata_track_name"|"trackName"\s*:/i.test(head)
  const hasPlayKey = /"ms_played"\s*:|"msPlayed"\s*:|"endTime"\s*:/i.test(head)
  return hasTrackKey && hasPlayKey
}

function looksLikeTwitch(head: string, base: string): boolean {
  if (/viewing_history|messages\.csv|chat_history\.csv/i.test(base)) return true
  const first = head.split(/\r?\n/, 1)[0]?.toLowerCase() || ""
  // Either chat-message export or watch-history export.
  if (/\bchannellogin\b/.test(first) && /\b(body|sentat|sender)\b/.test(first)) return true
  if (/\bcontenttitle\b/.test(first) && /\b(time|watchedat)\b/.test(first)) return true
  if (first.startsWith("twitch")) return true
  return false
}

function looksLikeStars(head: string, base: string): boolean {
  if (/starred|want to go|favourite places|favorite places|saved places/i.test(base)) return true
  const firstLine = head.split(/\r?\n/, 1)[0] || ""
  if (!/^title\b/i.test(firstLine.replace(/^[﻿]/, ""))) return false
  // Confirm there's a Google Maps URL nearby.
  return /google\.com\/maps|goo\.gl\/maps|maps\.app\.goo\.gl/i.test(head)
}

function looksLikeAppleHealth(head: string): boolean {
  return /<HealthData[\s>]/i.test(head) || /<!DOCTYPE\s+HealthData/i.test(head)
}

// ----------------------------------- spotify

interface SpotifyPlay {
  ts: string
  track: string
  artist: string
  album?: string
  msPlayed: number
  skipped?: boolean
  platform?: string
}

function parseSpotify(raw: string, meta: ParsedFile["meta"]): ParsedFile {
  const arr = JSON.parse(raw) as unknown[]
  if (!Array.isArray(arr)) throw new Error("spotify-history: expected JSON array")
  const plays: SpotifyPlay[] = []
  for (const r of arr) {
    if (!r || typeof r !== "object") continue
    const o = r as Record<string, unknown>
    // Account Data shape: { endTime, msPlayed, trackName, artistName }
    // Extended shape: { ts, ms_played, master_metadata_track_name, master_metadata_album_artist_name }
    const ts = (o.ts as string) || (o.endTime as string) || ""
    const track = (o.master_metadata_track_name as string) || (o.trackName as string) || ""
    const artist = (o.master_metadata_album_artist_name as string) || (o.artistName as string) || ""
    const album = (o.master_metadata_album_album_name as string) || (o.albumName as string)
    const msPlayed = Number(o.ms_played ?? o.msPlayed ?? 0)
    if (!track || !ts) continue
    plays.push({
      ts,
      track,
      artist,
      album: album || undefined,
      msPlayed,
      skipped: o.skipped === true ? true : undefined,
      platform: (o.platform as string) || undefined,
    })
  }
  plays.sort((a, b) => a.ts.localeCompare(b.ts))

  const artistTotals: Record<string, number> = {}
  const trackTotals: Record<string, number> = {}
  const yearArtist: Record<string, Record<string, number>> = {}
  let totalMs = 0
  for (const p of plays) {
    artistTotals[p.artist] = (artistTotals[p.artist] || 0) + 1
    const tk = `${p.artist} — ${p.track}`
    trackTotals[tk] = (trackTotals[tk] || 0) + 1
    totalMs += p.msPlayed
    const year = p.ts.slice(0, 4)
    if (year.length === 4) {
      yearArtist[year] = yearArtist[year] || {}
      yearArtist[year][p.artist] = (yearArtist[year][p.artist] || 0) + 1
    }
  }
  const topPerYear: Record<string, Array<{ artist: string; count: number }>> = {}
  for (const [year, m] of Object.entries(yearArtist)) {
    topPerYear[year] = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([artist, count]) => ({ artist, count }))
  }
  const topArtistsAllTime = Object.entries(artistTotals).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([artist, count]) => ({ artist, count }))
  const topTracksAllTime = Object.entries(trackTotals).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([key, count]) => {
    const separator = key.indexOf(" — ")
    return {
      artist: separator >= 0 ? key.slice(0, separator) : "",
      track: separator >= 0 ? key.slice(separator + 3) : key,
      count,
    }
  })
  const dateRange = plays.length ? `${plays[0].ts.slice(0, 10)} → ${plays[plays.length - 1].ts.slice(0, 10)}` : "(empty)"

  const data = {
    plays,
    topArtistsAllTime,
    topTracksAllTime,
    topPerYear,
    artistTotals,
    trackTotals,
    dateRange,
    totalPlays: plays.length,
    totalMs,
  }

  const sample = {
    plays: plays.slice(0, 5).concat(plays.slice(-3)),
    topArtistsAllTime: topArtistsAllTime.slice(0, 10),
    topTracksAllTime: topTracksAllTime.slice(0, 10),
    topPerYear,
    dateRange,
    totalPlays: plays.length,
    totalMs,
  }

  return {
    contentType: "spotify-history",
    summary: `Spotify listening history — ${plays.length} plays from ${dateRange} across ${Object.keys(artistTotals).length} artists.`,
    sample,
    data,
    meta: {
      ...meta,
      shape: "spotify-history",
      totalPlays: plays.length,
      uniqueArtists: Object.keys(artistTotals).length,
      uniqueTracks: Object.keys(trackTotals).length,
      dateRange,
    },
  }
}

// ----------------------------------- twitch

function parseTwitch(raw: string, meta: ParsedFile["meta"]): ParsedFile {
  const rows = parseCsv(raw)
  if (rows.length === 0) throw new Error("twitch-history: no rows")
  const header = rows[0].map(h => h.trim().toLowerCase())
  const body = rows.slice(1)

  const isMessages = header.includes("body") && header.includes("channellogin")
  if (isMessages) return parseTwitchMessages(header, body, meta)
  return parseTwitchViews(header, body, meta)
}

function parseTwitchViews(header: string[], rows: string[][], meta: ParsedFile["meta"]): ParsedFile {
  const idx = (n: string) => header.indexOf(n)
  const colChannel = idx("channellogin") >= 0 ? idx("channellogin") : idx("channel")
  const colTitle = idx("contenttitle") >= 0 ? idx("contenttitle") : idx("title")
  const colCategory = idx("category") >= 0 ? idx("category") : idx("contentcategory")
  const colTime = idx("watchedat") >= 0 ? idx("watchedat") : (idx("time") >= 0 ? idx("time") : idx("ts"))
  const colDuration = idx("duration") >= 0 ? idx("duration") : idx("durationsec")

  const views = rows.filter(r => r.length > 1).map(r => ({
    ts: r[colTime] || "",
    channel: r[colChannel] || "(unknown)",
    title: r[colTitle] || "",
    category: r[colCategory] || "",
    durationSec: parseDuration(r[colDuration] || ""),
  })).filter(v => v.ts && v.channel)
  views.sort((a, b) => a.ts.localeCompare(b.ts))

  const byChannel: Record<string, { hours: number; sessions: number }> = {}
  const byCategory: Record<string, number> = {}
  let totalSec = 0
  for (const v of views) {
    byChannel[v.channel] = byChannel[v.channel] || { hours: 0, sessions: 0 }
    byChannel[v.channel].sessions += 1
    byChannel[v.channel].hours += v.durationSec / 3600
    if (v.category) byCategory[v.category] = (byCategory[v.category] || 0) + v.durationSec / 3600
    totalSec += v.durationSec
  }
  const dateRange = views.length ? `${views[0].ts.slice(0, 10)} → ${views[views.length - 1].ts.slice(0, 10)}` : "(empty)"
  const topChannels = Object.entries(byChannel).sort((a, b) => b[1].hours - a[1].hours).slice(0, 12)
    .map(([channel, s]) => ({ channel, hours: Math.round(s.hours * 10) / 10, sessions: s.sessions }))
  const topCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([category, hours]) => ({ category, hours: Math.round(hours * 10) / 10 }))

  const data = {
    views,
    messages: [] as Array<unknown>,
    byChannel,
    byCategory,
    topChannels,
    topCategories,
    totalHours: totalSec / 3600,
    totalSessions: views.length,
    dateRange,
  }
  const sample = {
    views: views.slice(0, 5).concat(views.slice(-2)),
    topChannels: topChannels.slice(0, 8),
    topCategories: topCategories.slice(0, 6),
    totalHours: Math.round((totalSec / 3600) * 10) / 10,
    totalSessions: views.length,
    dateRange,
  }
  return {
    contentType: "twitch-history",
    summary: `Twitch viewing history — ${views.length} sessions across ${Object.keys(byChannel).length} channels (${dateRange}).`,
    sample,
    data,
    meta: {
      ...meta,
      shape: "twitch-history",
      totalSessions: views.length,
      uniqueChannels: Object.keys(byChannel).length,
      uniqueCategories: Object.keys(byCategory).length,
      dateRange,
    },
  }
}

function parseTwitchMessages(header: string[], rows: string[][], meta: ParsedFile["meta"]): ParsedFile {
  const idx = (n: string) => header.indexOf(n)
  const colChannel = idx("channellogin") >= 0 ? idx("channellogin") : idx("channel")
  const colBody = idx("body") >= 0 ? idx("body") : idx("text")
  const colTime = idx("sentat") >= 0 ? idx("sentat") : idx("time")
  const messages = rows.filter(r => r.length > 1).map(r => ({
    ts: r[colTime] || "",
    channel: r[colChannel] || "(unknown)",
    text: r[colBody] || "",
  })).filter(m => m.ts && m.channel)
  messages.sort((a, b) => a.ts.localeCompare(b.ts))
  const byChannel: Record<string, number> = {}
  for (const m of messages) byChannel[m.channel] = (byChannel[m.channel] || 0) + 1
  const dateRange = messages.length ? `${messages[0].ts.slice(0, 10)} → ${messages[messages.length - 1].ts.slice(0, 10)}` : "(empty)"
  const topChannels = Object.entries(byChannel).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([channel, count]) => ({ channel, count }))
  const data = { views: [], messages, byChannel, byCategory: {}, topChannels, topCategories: [], totalHours: 0, totalSessions: 0, dateRange }
  const sample = {
    messages: messages.slice(0, 12),
    topChannels,
    totalMessages: messages.length,
    dateRange,
  }
  return {
    contentType: "twitch-history",
    summary: `Twitch chat history — ${messages.length} messages across ${Object.keys(byChannel).length} channels (${dateRange}).`,
    sample,
    data,
    meta: { ...meta, shape: "twitch-history-messages", totalMessages: messages.length, uniqueChannels: Object.keys(byChannel).length, dateRange },
  }
}

function parseDuration(s: string): number {
  if (!s) return 0
  const n = Number(s)
  if (Number.isFinite(n)) return n
  // "01:23:45" form.
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s.trim())
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0)
  return 0
}

// ----------------------------------- google-maps-stars

function parseStars(raw: string, meta: ParsedFile["meta"]): ParsedFile {
  const rows = parseCsv(raw)
  if (rows.length === 0) throw new Error("google-maps-stars: empty CSV")
  const header = rows[0].map(h => h.trim().toLowerCase())
  const idx = (n: string) => header.indexOf(n)
  const colTitle = idx("title") >= 0 ? idx("title") : 0
  const colNote = idx("note")
  const colUrl = idx("url")
  const colComment = idx("comment")

  const places = rows.slice(1).filter(r => r[colTitle]).map(r => {
    const url = colUrl >= 0 ? r[colUrl] : ""
    const { lat, lng } = parseLatLngFromMapsUrl(url)
    return {
      name: r[colTitle],
      note: colNote >= 0 ? r[colNote] || "" : "",
      mapsUrl: url,
      comment: colComment >= 0 ? r[colComment] || "" : "",
      lat,
      lng,
      list: meta.sourceFile.replace(/\.csv$/i, ""),
    }
  })

  const cities: Record<string, number> = {}
  for (const p of places) {
    // Best-effort city extraction from the name's last comma segment.
    const parts = p.name.split(",").map(s => s.trim())
    if (parts.length > 1) {
      const last = parts[parts.length - 1]
      if (last && !/^\d/.test(last)) cities[last] = (cities[last] || 0) + 1
    }
  }
  const placesWithCoords = places.filter(p => p.lat != null && p.lng != null).length

  const data = {
    places,
    lists: [{ name: meta.sourceFile.replace(/\.csv$/i, ""), count: places.length }],
    cities,
    countries: [] as string[],
  }
  const sample = {
    places: places.slice(0, 6),
    totalPlaces: places.length,
    placesWithCoords,
    topCities: Object.entries(cities).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
  }
  return {
    contentType: "google-maps-stars",
    summary: `Google Maps saved places — ${places.length} entries (${placesWithCoords} with coordinates).`,
    sample,
    data,
    meta: { ...meta, shape: "google-maps-stars", totalPlaces: places.length, placesWithCoords },
  }
}

function parseLatLngFromMapsUrl(url: string): { lat?: number; lng?: number } {
  if (!url) return {}
  // Forms: !3d35.6749!4d139.7363, @35.6749,139.7363, ?q=35.6749,139.7363
  const at = /@(-?\d+\.\d+),\s*(-?\d+\.\d+)/.exec(url)
  if (at) return { lat: Number(at[1]), lng: Number(at[2]) }
  const bang = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(url)
  if (bang) return { lat: Number(bang[1]), lng: Number(bang[2]) }
  const q = /[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/.exec(url)
  if (q) return { lat: Number(q[1]), lng: Number(q[2]) }
  const ll = /[?&]ll=(-?\d+\.\d+),\s*(-?\d+\.\d+)/.exec(url)
  if (ll) return { lat: Number(ll[1]), lng: Number(ll[2]) }
  return {}
}

// ----------------------------------- iphone-health

interface HealthRecord { type: string; value: number; unit?: string; startDate: string; endDate?: string; source?: string }
interface HealthWorkout { type: string; durationSec: number; distanceM?: number; kcal?: number; startDate: string; endDate?: string }

function parseAppleHealth(raw: string, meta: ParsedFile["meta"]): ParsedFile {
  const records: HealthRecord[] = []
  const workouts: HealthWorkout[] = []

  const recordRe = /<Record\b([^>]*?)\/>|<Record\b([^>]*)>([\s\S]*?)<\/Record>/g
  for (const m of raw.matchAll(recordRe)) {
    const attrs = parseXmlAttrs(m[1] || m[2] || "")
    const type = attrs.type || ""
    if (!type) continue
    const value = Number(attrs.value || "0")
    if (!Number.isFinite(value)) continue
    records.push({
      type,
      value,
      unit: attrs.unit,
      startDate: (attrs.startDate || "").slice(0, 10),
      endDate: (attrs.endDate || undefined)?.slice(0, 10),
      source: attrs.sourceName,
    })
  }
  const workoutRe = /<Workout\b([^>]*?)\/>|<Workout\b([^>]*)>([\s\S]*?)<\/Workout>/g
  for (const m of raw.matchAll(workoutRe)) {
    const attrs = parseXmlAttrs(m[1] || m[2] || "")
    const type = (attrs.workoutActivityType || "").replace(/^HKWorkoutActivityType/, "")
    if (!type) continue
    const durationMin = Number(attrs.duration || "0")
    const durationUnit = (attrs.durationUnit || "min").toLowerCase()
    const durationSec = durationUnit.startsWith("min") ? durationMin * 60 : durationMin
    const distanceM = attrs.totalDistance ? Number(attrs.totalDistance) * (attrs.totalDistanceUnit === "km" ? 1000 : 1609.34) : undefined
    const kcal = attrs.totalEnergyBurned ? Number(attrs.totalEnergyBurned) : undefined
    workouts.push({
      type,
      durationSec,
      distanceM,
      kcal,
      startDate: (attrs.startDate || "").slice(0, 10),
      endDate: (attrs.endDate || undefined)?.slice(0, 10),
    })
  }

  records.sort((a, b) => a.startDate.localeCompare(b.startDate))
  workouts.sort((a, b) => a.startDate.localeCompare(b.startDate))

  const byType: Record<string, { totalDays: number; total: number }> = {}
  const dayKeysByType: Record<string, Set<string>> = {}
  for (const r of records) {
    const short = r.type.replace(/^HKQuantityTypeIdentifier|^HKCategoryTypeIdentifier/, "")
    byType[short] = byType[short] || { totalDays: 0, total: 0 }
    byType[short].total += r.value
    dayKeysByType[short] = dayKeysByType[short] || new Set()
    if (r.startDate) dayKeysByType[short].add(r.startDate)
  }
  for (const k of Object.keys(byType)) byType[k].totalDays = dayKeysByType[k].size

  const yearStats: Record<string, Record<string, number>> = {}
  for (const r of records) {
    const year = r.startDate.slice(0, 4)
    if (year.length !== 4) continue
    yearStats[year] = yearStats[year] || {}
    const short = r.type.replace(/^HKQuantityTypeIdentifier|^HKCategoryTypeIdentifier/, "")
    if (short === "StepCount") yearStats[year].steps = (yearStats[year].steps || 0) + r.value
    if (short === "DistanceWalkingRunning") yearStats[year].distanceM = (yearStats[year].distanceM || 0) + r.value
    if (short === "ActiveEnergyBurned") yearStats[year].kcal = (yearStats[year].kcal || 0) + r.value
  }
  for (const w of workouts) {
    const year = w.startDate.slice(0, 4)
    if (year.length !== 4) continue
    yearStats[year] = yearStats[year] || {}
    yearStats[year].workouts = (yearStats[year].workouts || 0) + 1
    yearStats[year].workoutMinutes = (yearStats[year].workoutMinutes || 0) + w.durationSec / 60
  }

  const allDates = [...records, ...workouts].map(r => r.startDate).filter(Boolean).sort()
  const dateRange = allDates.length ? `${allDates[0]} → ${allDates[allDates.length - 1]}` : "(empty)"

  const data = { records, workouts, byType, yearStats, dateRange }
  const sample = {
    records: records.slice(0, 6).concat(records.slice(-3)),
    workouts: workouts.slice(0, 8),
    byType,
    yearStats,
    dateRange,
    totalRecords: records.length,
    totalWorkouts: workouts.length,
  }
  return {
    contentType: "iphone-health",
    summary: `Apple Health export — ${records.length} records + ${workouts.length} workouts (${dateRange}).`,
    sample,
    data,
    meta: { ...meta, shape: "iphone-health", totalRecords: records.length, totalWorkouts: workouts.length, dateRange },
  }
}

function parseXmlAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /(\w+)="([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) out[m[1]] = m[2]
  return out
}

// ----------------------------------- shared

async function readHead(filepath: string, n: number): Promise<string> {
  const fd = await fs.open(filepath, "r")
  try {
    const buf = Buffer.alloc(n)
    const { bytesRead } = await fd.read(buf, 0, n, 0)
    return buf.subarray(0, bytesRead).toString("utf8")
  } finally {
    await fd.close()
  }
}

function parseCsv(raw: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ""
  let inQuotes = false
  const text = raw.replace(/^[﻿]/, "")
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++ }
        else inQuotes = false
      } else cur += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ",") { row.push(cur); cur = "" }
      else if (c === "\n") { row.push(cur); cur = ""; rows.push(row); row = [] }
      else if (c === "\r") { /* ignore */ }
      else cur += c
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row) }
  return rows.filter(r => r.length > 1 || (r[0] && r[0].length))
}
