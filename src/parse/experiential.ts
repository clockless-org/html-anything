/**
 * Experiential / personal-data parsers.
 *
 * Personal exports from services where the LLM should design a
 * "re-experience this" page rather than a flat report. Each export has
 * its own prompt under `prompts/sources/`; this parser sniffs the file shape
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
 *   - amazon-orders      — Amazon "Request Your Information" / legacy
 *                          Order Reports CSV (`Retail.OrderHistory.*.csv`,
 *                          `Items.csv`). Item-level row per ordered item.
 *                          Detected by header containing `Order ID`
 *                          plus one of `ASIN` / `Title` / `Product Name`.
 *   - youtube-watch-history — Google Takeout "YouTube and YouTube Music"
 *                          watch-history.json. Array of objects with
 *                          `header: "YouTube"`, `title`, `titleUrl`,
 *                          `subtitles[0].name`, `time`, `products`. The
 *                          parser also accepts the rare empty-subtitles
 *                          shape (removed / private videos).
 *   - linkedin-connections — LinkedIn "Download your data" Connections.csv.
 *                          Header row contains `First Name,Last Name,URL,
 *                          Email Address,Company,Position,Connected On`
 *                          (with optional 2-3 line "Notes:" preamble that
 *                          the parser strips). One row per connection.
 *   - browser-history    — Chrome / Edge / Brave / Safari / Firefox history
 *                          export. CSV with `url,title,visit_time` plus
 *                          optional `visit_count,typed_count,transition`,
 *                          or JSON array of the same shape. Filename hints:
 *                          `history`, `browser`, `chrome`, `edge`, `safari`,
 *                          `firefox`. SQLite blobs are refused with a
 *                          clear conversion recipe.
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
      if (ext === ".json") return looksLikeYoutube(head, base) || looksLikeBrowserHistoryJson(head, base) || looksLikeSpotify(head, base)
      if (ext === ".csv") return looksLikeLinkedIn(head, base) || looksLikeAmazon(head, base) || looksLikeTwitch(head, base) || looksLikeBrowserHistoryCsv(head, base) || looksLikeStars(head, base)
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
    if (ext === ".json") {
      const head = raw.slice(0, 8192)
      if (looksLikeYoutube(head, base)) return parseYoutube(raw, meta)
      if (looksLikeBrowserHistoryJson(head, base)) return parseBrowserHistoryJson(raw, meta)
      return parseSpotify(raw, meta)
    }
    if (ext === ".csv") {
      const head = raw.slice(0, 8192)
      if (looksLikeLinkedIn(head, base)) return parseLinkedIn(raw, meta)
      const firstLine = (raw.split(/\r?\n/, 1)[0] || "").toLowerCase()
      if (looksLikeAmazon(firstLine, base)) return parseAmazon(raw, meta)
      if (looksLikeTwitch(firstLine, base)) return parseTwitch(raw, meta)
      if (looksLikeBrowserHistoryCsv(head, base)) return parseBrowserHistoryCsv(raw, meta)
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

function looksLikeYoutube(head: string, base: string): boolean {
  if (/^watch-history\.json$/i.test(base)) return true
  // Google Takeout YouTube-distinctive shape: `header: "YouTube"` plus
  // either a youtube.com titleUrl or a `products: ["YouTube"]` array,
  // and a `time` ISO field. `subtitles` may be absent on removed /
  // private videos, so don't require it.
  const hasYoutubeHeader = /"header"\s*:\s*"YouTube(?:\s+Music)?"/.test(head)
  const hasProductYoutube = /"products"\s*:\s*\[[^\]]*"YouTube"/.test(head)
  const hasTitleUrl = /"titleUrl"\s*:\s*"https?:\/\/(?:www\.)?youtube\.com\/watch/.test(head)
  const hasTime = /"time"\s*:\s*"\d{4}-\d{2}-\d{2}T/.test(head)
  if (!hasTime) return false
  return (hasYoutubeHeader && (hasProductYoutube || hasTitleUrl)) || hasTitleUrl
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

function looksLikeLinkedIn(head: string, base: string): boolean {
  if (/^connections\.csv$/i.test(base)) return true
  // LinkedIn export sometimes carries a 2-3 line "Notes:" preamble
  // before the real header. Scan the first ~8 KB for the canonical
  // header line.
  const lines = head.split(/\r?\n/, 30)
  for (const ln of lines) {
    const lower = ln.toLowerCase().replace(/^[﻿]/, "")
    const hasFirstName = /\bfirst\s*name\b/.test(lower)
    const hasLastName = /\blast\s*name\b/.test(lower)
    const hasConnectedOn = /\bconnected\s*on\b/.test(lower)
    const hasCompany = /\bcompany\b/.test(lower)
    const hasPosition = /\bposition\b/.test(lower)
    if (hasFirstName && hasLastName && hasConnectedOn && (hasCompany || hasPosition)) return true
  }
  return false
}

function looksLikeBrowserHistoryCsv(head: string, base: string): boolean {
  const filenameHint = /history|browser|chrome|edge|brave|safari|firefox|places/i.test(base)
  const firstLine = (head.split(/\r?\n/, 1)[0] || "").toLowerCase().replace(/^[﻿]/, "")
  const cols = firstLine.split(/[,;\t]/).map(s => s.trim().replace(/^"|"$/g, ""))
  if (cols.length < 2) return false
  const hasUrl = cols.some(c => /^url$/.test(c) || /^urls?\.url$/.test(c) || /^visit_url$/.test(c) || /^link$/.test(c))
  if (!hasUrl) return false
  const hasTime =
    cols.some(c => /^visit[ _-]?time$/.test(c)) ||
    cols.some(c => /^last[ _-]?visit[ _-]?(time|date)$/.test(c)) ||
    cols.some(c => /^visited[ _-]?on$/.test(c)) ||
    cols.some(c => /^visit[ _-]?date$/.test(c)) ||
    cols.some(c => /^date$/.test(c) && filenameHint) ||
    cols.some(c => /^time(stamp)?$/.test(c) && filenameHint)
  // Must have URL + time. Discriminate against generic CSVs that just happen to have a `url` column.
  if (!hasTime) return false
  // Anti-collide with Stars (Title,Note,URL,Comment) — that one lacks visit_time, so we already
  // filter it out above. Anti-collide with reading-list CSVs by requiring filename hint OR
  // the presence of a visit_count / typed_count / transition column.
  const hasBrowserSignal =
    filenameHint ||
    cols.some(c => /^visit[ _-]?count$/.test(c)) ||
    cols.some(c => /^typed[ _-]?count$/.test(c)) ||
    cols.some(c => /^transition([ _-]?type)?$/.test(c))
  return hasBrowserSignal
}

function looksLikeBrowserHistoryJson(head: string, base: string): boolean {
  const filenameHint = /history|browser|chrome|edge|brave|safari|firefox|places/i.test(base)
  // Refuse SQLite blobs early — caller should convert to CSV.
  if (/^SQLite format 3/.test(head)) return false
  // Look for a JSON object/array shape with url + visit_time-like keys.
  const hasUrl = /"url"\s*:/i.test(head) || /"visit_url"\s*:/i.test(head)
  const hasTimeKey =
    /"visit_time"\s*:/i.test(head) ||
    /"visitTime"\s*:/i.test(head) ||
    /"last_visit_time"\s*:/i.test(head) ||
    /"lastVisitTime"\s*:/i.test(head) ||
    /"last_visit_date"\s*:/i.test(head) ||
    /"visited_at"\s*:/i.test(head) ||
    /"timestamp"\s*:/i.test(head) ||
    /"date_added"\s*:/i.test(head)
  // Discriminate against YouTube which uses `time` + youtube.com/watch.
  if (/"header"\s*:\s*"YouTube/.test(head)) return false
  if (!hasUrl || !hasTimeKey) return false
  // Anti-collide with Spotify by ensuring no Spotify-distinctive keys appear.
  if (/"master_metadata_track_name"|"trackName"\s*:|"ms_played"\s*:|"msPlayed"\s*:/.test(head)) return false
  return filenameHint || /"visit_count"\s*:|"visitCount"\s*:|"typed_count"\s*:|"typedCount"\s*:|"transition"\s*:|"transition_type"\s*:/.test(head)
}

function looksLikeAmazon(head: string, base: string): boolean {
  if (/retail\.orderhistory|retail\.returnsandrefunds|order[-_ ]?history|orderitemreport|items\.csv/i.test(base)) return true
  const firstLine = head.split(/\r?\n/, 1)[0] || ""
  const lower = firstLine.toLowerCase()
  // Order ID is the strongest signal; pair it with ASIN, Title, or Product Name.
  const hasOrderId = /\border\s*id\b/.test(lower) || /"order\s*id"/.test(lower)
  if (!hasOrderId) return false
  const hasItemSignal =
    /\basin\b/.test(lower) ||
    /\bproduct\s*name\b/.test(lower) ||
    /\btitle\b/.test(lower) ||
    /\bitem\s*total\b/.test(lower)
  return hasItemSignal
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

// ----------------------------------- youtube-watch-history

interface YoutubeWatch {
  id: string                    // synthetic row id (`yt_000123`)
  ts: string                    // ISO timestamp
  title: string                 // cleaned title (with leading "Watched " stripped)
  rawTitle: string              // verbatim Takeout title field
  videoId: string | null        // 11-char YouTube id, parsed from titleUrl
  videoUrl: string | null       // full https URL, kept for display
  channelName: string | null
  channelId: string | null
  topic: string                 // heuristic bucket: learning / coding / music / cooking / news / gaming / entertainment / vlog / craft / late-night / other
  topicInferred: boolean        // always true (no Takeout-provided category)
  bucket: "learning" | "entertainment" | "music" | "other"
  hour: number                  // 0–23, UTC
  dow: number                   // 0=Sun
  date: string                  // YYYY-MM-DD (UTC)
  isLateNight: boolean          // 0–4 hour bucket
  isRemoved: boolean            // missing titleUrl / "removed video" / "private video"
}

const YOUTUBE_TOPIC_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(lecture|professor|university|course|class|study|tutorial|explained|how (?:does|do|to)|why (?:does|do|is)|history of|economics|physics|chemistry|biology|geography|map|maps|antibiotic|engineer|engineering|science|theorem|proof|equation|calculus|statistics|grammar|language)\b/i, "learning"],
  [/\b(rust|python|typescript|javascript|js\b|node|react|vue|svelte|deno|bun|kubernetes|k8s|docker|postgres|mysql|sqlite|database|sql|api|backend|frontend|devops|terraform|aws\b|azure|gcp|linux|kernel|compile|compiler|debug|debugger|ide|vscode|vim|neovim|git\b|github|gitlab|orm|async|thread|memory leak|coding|code review|side project|open source)\b/i, "coding"],
  [/\b(music|song|songs|piano|guitar|cello|violin|orchestra|symphony|jazz|lo[-]?fi|lofi|ambient|synth|techno|house music|hip[-\s]?hop|rap\b|vinyl|record|records|choral|hour of|listening room|mix\b|mixtape|playlist)\b/i, "music"],
  [/\b(recipe|cooking|cook|sourdough|bread|stew|soup|olive oil|knife|kitchen|baking|sandwich|breakfast|lunch|dinner|meal[-\s]?prep|leftovers|pantry|yogurt|spice)\b/i, "cooking"],
  [/\b(news|election|budget|council|zoning|public comment|harbor|transit|water bill|local government)\b/i, "news"],
  [/\b(game|games|gaming|playthrough|speedrun|roguelite|rpg|fps\b|nintendo|playstation|xbox|steam deck|cartridge|hard mode|boss|level)\b/i, "gaming"],
  [/\b(workshop|woodworking|chisel|plane|workbench|origami|fold|folded|crease|sharpening|restore|restored|repair|refinish|hand tool)\b/i, "craft"],
  [/\b(insomnia|midnight|late[-\s]?night|conspiracy|unsolved|true crime|sleep)\b/i, "late-night"],
  [/\b(walk|river|sunday|afternoon|notes from|small studio|read this month|drawing|tree|training run|cold morning|10[-\s]?mile|5[-\s]?mile|12[-\s]?mile|mile|marathon)\b/i, "vlog"],
  [/\b(diner|jukebox|sandwich|parade|small[-\s]?town|pancake|cinematic universe|review|reviews|reviewing)\b/i, "entertainment"],
  [/\b(team|defense|box score|coach|league|nba|nfl|mlb|nhl|fifa|cricket|football|basketball|baseball)\b/i, "entertainment"],
]

function inferYoutubeTopic(title: string, channelName: string | null): string {
  const haystack = (channelName ? channelName + " " : "") + title
  for (const [re, t] of YOUTUBE_TOPIC_KEYWORDS) if (re.test(haystack)) return t
  return "other"
}

const YT_TOPIC_BUCKET: Record<string, "learning" | "entertainment" | "music" | "other"> = {
  learning: "learning",
  coding: "learning",
  news: "learning",
  craft: "learning",
  music: "music",
  cooking: "entertainment",
  gaming: "entertainment",
  entertainment: "entertainment",
  vlog: "entertainment",
  "late-night": "other",
  other: "other",
}

function parseYoutube(raw: string, meta: ParsedFile["meta"]): ParsedFile {
  const arr = JSON.parse(raw) as unknown[]
  if (!Array.isArray(arr)) throw new Error("youtube-watch-history: expected JSON array")

  const watches: YoutubeWatch[] = []
  let counter = 0
  for (const r of arr) {
    if (!r || typeof r !== "object") continue
    const o = r as Record<string, unknown>
    // Only YouTube products (skip stray YouTube Music search rows that may
    // appear in the same Takeout file).
    const products = Array.isArray(o.products) ? o.products as unknown[] : []
    if (products.length && !products.includes("YouTube") && !products.includes("YouTube Music")) continue
    const time = typeof o.time === "string" ? o.time : ""
    if (!time) continue
    const ts = new Date(time)
    if (Number.isNaN(ts.getTime())) continue
    const rawTitle = typeof o.title === "string" ? o.title : ""
    const titleStripped = rawTitle.replace(/^Watched\s+/, "").trim() || "(untitled)"
    const titleUrl = typeof o.titleUrl === "string" ? o.titleUrl : ""
    const videoIdMatch = /[?&]v=([A-Za-z0-9_-]{6,16})/.exec(titleUrl)
    const videoId = videoIdMatch ? videoIdMatch[1] : null
    let channelName: string | null = null
    let channelId: string | null = null
    if (Array.isArray(o.subtitles) && o.subtitles.length > 0) {
      const s = o.subtitles[0] as Record<string, unknown>
      if (typeof s?.name === "string") channelName = s.name
      if (typeof s?.url === "string") {
        const m = /\/channel\/([A-Za-z0-9_-]+)/.exec(s.url)
        if (m) channelId = m[1]
      }
    }
    const isRemoved =
      !titleUrl ||
      /a video that has been removed/i.test(rawTitle) ||
      /a private video/i.test(rawTitle)
    const topic = inferYoutubeTopic(titleStripped, channelName)
    counter += 1
    const dow = ts.getUTCDay()
    const hour = ts.getUTCHours()
    watches.push({
      id: `yt_${counter.toString().padStart(6, "0")}`,
      ts: ts.toISOString(),
      title: titleStripped,
      rawTitle,
      videoId,
      videoUrl: titleUrl || null,
      channelName,
      channelId,
      topic,
      topicInferred: true,
      bucket: YT_TOPIC_BUCKET[topic] || "other",
      hour,
      dow,
      date: ts.toISOString().slice(0, 10),
      isLateNight: hour < 5,
      isRemoved,
    })
  }

  watches.sort((a, b) => a.ts.localeCompare(b.ts))

  const totalCount = watches.length
  const dateRange = totalCount
    ? `${watches[0].date} → ${watches[totalCount - 1].date}`
    : "(empty)"
  const durLabel = durationLabel(watches[0]?.date, watches[totalCount - 1]?.date)

  // Channel leaderboard
  const channelAgg: Record<string, {
    name: string
    channelId: string | null
    count: number
    first: string
    last: string
    topic: string
    sampleTitles: Array<{ title: string; ts: string; videoId: string | null; topic: string }>
  }> = {}
  for (const w of watches) {
    const key = w.channelName || "(unknown channel)"
    const entry = channelAgg[key] = channelAgg[key] || {
      name: key,
      channelId: w.channelId,
      count: 0,
      first: w.date,
      last: w.date,
      topic: w.topic,
      sampleTitles: [],
    }
    entry.count += 1
    if (w.date < entry.first) entry.first = w.date
    if (w.date > entry.last) entry.last = w.date
    if (entry.sampleTitles.length < 6) {
      entry.sampleTitles.push({ title: w.title, ts: w.ts, videoId: w.videoId, topic: w.topic })
    }
  }
  const channels = Object.values(channelAgg)
    .sort((a, b) => b.count - a.count)
    .map(c => ({ ...c, share: totalCount ? c.count / totalCount : 0 }))

  // Topic breakdown
  const topicAgg: Record<string, { count: number; channels: Set<string> }> = {}
  for (const w of watches) {
    const e = topicAgg[w.topic] = topicAgg[w.topic] || { count: 0, channels: new Set<string>() }
    e.count += 1
    e.channels.add(w.channelName || "(unknown channel)")
  }
  const topics = Object.entries(topicAgg)
    .map(([topic, e]) => ({
      topic,
      count: e.count,
      channels: e.channels.size,
      share: totalCount ? e.count / totalCount : 0,
      bucket: YT_TOPIC_BUCKET[topic] || "other",
    }))
    .sort((a, b) => b.count - a.count)

  // Bucket totals: learning vs entertainment vs music vs other
  const buckets: Record<string, number> = { learning: 0, entertainment: 0, music: 0, other: 0 }
  for (const w of watches) buckets[w.bucket] = (buckets[w.bucket] || 0) + 1
  const bucketTotals = ["learning", "music", "entertainment", "other"].map(b => ({
    bucket: b,
    count: buckets[b] || 0,
    share: totalCount ? (buckets[b] || 0) / totalCount : 0,
  }))

  // Monthly + weekly histograms (UTC).
  const monthAgg: Record<string, { count: number; sessions: Set<string> }> = {}
  const weekAgg: Record<string, number> = {}
  for (const w of watches) {
    const month = w.date.slice(0, 7)
    const me = monthAgg[month] = monthAgg[month] || { count: 0, sessions: new Set<string>() }
    me.count += 1
    me.sessions.add(w.date)
    const wk = isoWeek(w.date)
    weekAgg[wk] = (weekAgg[wk] || 0) + 1
  }
  const monthTotals = Object.keys(monthAgg).sort().map(m => ({
    month: m,
    count: monthAgg[m].count,
    activeDays: monthAgg[m].sessions.size,
  }))
  const weekTotals = Object.keys(weekAgg).sort().map(w => ({ week: w, count: weekAgg[w] }))

  // Hour-of-day + day-of-week distributions.
  const hourCounts = new Array(24).fill(0)
  const dowCounts = new Array(7).fill(0)
  let lateNightCount = 0
  for (const w of watches) {
    hourCounts[w.hour] += 1
    dowCounts[w.dow] += 1
    if (w.isLateNight) lateNightCount += 1
  }

  // Day-of-week × hour heatmap (7 × 24 cells).
  const heatmap: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0))
  for (const w of watches) heatmap[w.dow][w.hour] += 1

  // Repeat-watch detection: same videoId watched 3+ times.
  const byVid: Record<string, { videoId: string; title: string; channel: string | null; topic: string; count: number; first: string; last: string; sampleIds: string[] }> = {}
  for (const w of watches) {
    if (!w.videoId) continue
    const e = byVid[w.videoId] = byVid[w.videoId] || {
      videoId: w.videoId,
      title: w.title,
      channel: w.channelName,
      topic: w.topic,
      count: 0,
      first: w.date,
      last: w.date,
      sampleIds: [],
    }
    e.count += 1
    if (w.date < e.first) e.first = w.date
    if (w.date > e.last) e.last = w.date
    if (e.sampleIds.length < 8) e.sampleIds.push(w.id)
  }
  const rediscoveries = Object.values(byVid)
    .filter(v => v.count >= 3)
    .map(v => ({
      videoId: v.videoId,
      title: v.title,
      channel: v.channel,
      topic: v.topic,
      timesWatched: v.count,
      firstSeen: v.first,
      lastSeen: v.last,
      cadenceLabel: cadenceLabel(v.first, v.last, v.count),
      sampleIds: v.sampleIds,
    }))
    .sort((a, b) => b.timesWatched - a.timesWatched)

  // Binge sessions: cluster nearby watches with gaps under 45 minutes.
  // (Per the issue spec.) Need at least 4 watches in the cluster to count.
  const sessions = detectBingeSessions(watches, 45)
  const binges = sessions
    .filter(s => s.itemIds.length >= 4)
    .map(s => ({
      start: s.start,
      end: s.end,
      durationMin: s.durationMin,
      count: s.itemIds.length,
      topChannel: s.topChannel,
      sampleTitles: s.sampleTitles,
      itemIds: s.itemIds,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)

  // Busiest day / week.
  const dayAgg: Record<string, number> = {}
  for (const w of watches) dayAgg[w.date] = (dayAgg[w.date] || 0) + 1
  const busiestDay = Object.entries(dayAgg).sort((a, b) => b[1] - a[1])[0] || null
  const busiestWeek = Object.entries(weekAgg).sort((a, b) => b[1] - a[1])[0] || null

  // Removed-content count (Takeout emits these for taken-down / private videos).
  const removedCount = watches.filter(w => w.isRemoved).length

  const summary = {
    totalCount,
    uniqueChannels: Object.keys(channelAgg).length,
    uniqueVideos: Object.keys(byVid).length,
    dateRange,
    durationLabel: durLabel,
    activeDays: Object.keys(dayAgg).length,
    activeMonths: monthTotals.length,
    busiestDay: busiestDay ? { date: busiestDay[0], count: busiestDay[1] } : null,
    busiestWeek: busiestWeek ? { week: busiestWeek[0], count: busiestWeek[1] } : null,
    lateNightCount,
    lateNightShare: totalCount ? lateNightCount / totalCount : 0,
    removedCount,
    bingeCount: binges.length,
    rediscoveryCount: rediscoveries.length,
    topChannel: channels[0]?.name || null,
    topChannelShare: channels[0]?.share || 0,
    topTopic: topics[0]?.topic || null,
    topTopicShare: topics[0]?.share || 0,
    learningShare: totalCount ? (buckets.learning || 0) / totalCount : 0,
    entertainmentShare: totalCount ? (buckets.entertainment || 0) / totalCount : 0,
    musicShare: totalCount ? (buckets.music || 0) / totalCount : 0,
  }

  const data = {
    format: "youtube-watch-history",
    rows: watches,
    summary,
    channels,
    topics,
    bucketTotals,
    monthTotals,
    weekTotals,
    hourCounts,
    dowCounts,
    heatmap,
    rediscoveries,
    binges,
    meta: {
      ...meta,
      shape: "youtube-watch-history",
    },
  }

  const sample = {
    summary,
    topChannels: channels.slice(0, 8),
    topics,
    bucketTotals,
    monthTotals,
    hourCounts,
    dowCounts,
    rediscoveries: rediscoveries.slice(0, 6),
    binges: binges.slice(0, 4),
    firstWatches: watches.slice(0, 6),
    lastWatches: watches.slice(-3),
  }

  const lateLabel = totalCount ? Math.round(summary.lateNightShare * 100) + "%" : "0%"
  const summaryLine =
    `YouTube watch history — ${totalCount} watches across ${summary.uniqueChannels} channels (${dateRange}, ${durLabel}). ` +
    `Top channel: ${summary.topChannel || "—"}. Late-night share: ${lateLabel}.`

  return {
    contentType: "youtube-watch-history",
    summary: summaryLine,
    sample,
    data,
    meta: {
      ...meta,
      shape: "youtube-watch-history",
      totalCount,
      uniqueChannels: summary.uniqueChannels,
      uniqueVideos: summary.uniqueVideos,
      dateRange,
    },
  }
}

interface BingeSession {
  start: string
  end: string
  durationMin: number
  itemIds: string[]
  topChannel: string | null
  sampleTitles: string[]
}

function detectBingeSessions(watches: YoutubeWatch[], gapMinutes: number): BingeSession[] {
  if (!watches.length) return []
  const sorted = [...watches].sort((a, b) => a.ts.localeCompare(b.ts))
  const gapMs = gapMinutes * 60_000
  const sessions: BingeSession[] = []
  let cur: { start: number; end: number; ids: string[]; channels: Record<string, number>; titles: string[] } | null = null
  for (const w of sorted) {
    const t = Date.parse(w.ts)
    if (!Number.isFinite(t)) continue
    if (cur && t - cur.end <= gapMs) {
      cur.end = t
      cur.ids.push(w.id)
      const ch = w.channelName || "(unknown channel)"
      cur.channels[ch] = (cur.channels[ch] || 0) + 1
      if (cur.titles.length < 6) cur.titles.push(w.title)
    } else {
      if (cur) sessions.push(finalizeSession(cur))
      cur = { start: t, end: t, ids: [w.id], channels: {}, titles: [w.title] }
      const ch = w.channelName || "(unknown channel)"
      cur.channels[ch] = 1
    }
  }
  if (cur) sessions.push(finalizeSession(cur))
  return sessions
}

function finalizeSession(s: { start: number; end: number; ids: string[]; channels: Record<string, number>; titles: string[] }): BingeSession {
  const top = Object.entries(s.channels).sort((a, b) => b[1] - a[1])[0]
  return {
    start: new Date(s.start).toISOString(),
    end: new Date(s.end).toISOString(),
    durationMin: Math.round((s.end - s.start) / 60_000),
    itemIds: s.ids,
    topChannel: top ? top[0] : null,
    sampleTitles: s.titles.slice(0, 6),
  }
}

function isoWeek(dateYmd: string): string {
  const d = new Date(dateYmd + "T00:00:00Z")
  // Thursday in current week decides the year per ISO 8601.
  const thu = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = thu.getUTCDay() || 7
  thu.setUTCDate(thu.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((thu.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return thu.getUTCFullYear() + "-W" + String(week).padStart(2, "0")
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

// ----------------------------------- amazon-orders

interface AmazonRow {
  id: string
  date: string
  shipDate: string | null
  title: string
  asin: string | null
  orderId: string
  category: string | null
  categoryInferred: boolean
  quantity: number
  itemSubtotal: number
  itemTotal: number
  currency: string
  status: string
  recipient: string | null
  shipState: string | null
  carrier: string | null
  flags: string[]
  raw: Record<string, string>
}

const AMAZON_HEADER_PATTERNS: Record<string, RegExp[]> = {
  date: [/^order\s*date$/i, /^purchase\s*date$/i],
  shipDate: [/^ship(ment|ping)?\s*date$/i],
  title: [/^title$/i, /^product\s*name$/i, /^item\s*name$/i],
  asin: [/^asin(?:\/?isbn)?$/i, /^asin$/i],
  orderId: [/^order\s*id$/i, /^order\s*number$/i],
  category: [/^category$/i, /^product\s*category$/i, /^department$/i],
  quantity: [/^quantity$/i, /^qty$/i, /^item\s*quantity$/i],
  itemSubtotal: [/^item\s*subtotal$/i, /^subtotal$/i],
  itemTotal: [/^item\s*total$/i, /^total\s*charged$/i, /^total$/i, /^amount$/i],
  currency: [/^currency$/i],
  status: [/^order\s*status$/i, /^shipment\s*status$/i, /^status$/i],
  recipient: [/^shipping\s*address\s*name$/i, /^ship[\s_-]*to(\s*name)?$/i, /^recipient$/i],
  shipState: [/^shipping\s*address\s*state$/i, /^ship\s*state$/i, /^state$/i],
  carrier: [/^carrier(\s*name(\s*&\s*tracking\s*number)?)?$/i, /^shipping\s*carrier$/i],
}

const CATEGORY_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(book|novel|paperback|hardcover|kindle edition)\b/i, "Books"],
  [/\b(diaper|formula|crib|stroller|pacifier|onesie|baby\b)/i, "Baby"],
  [/\b(cat|dog|pet|kibble|litter|leash|fish food)\b/i, "Pet Supplies"],
  [/\b(coffee|tea|kettle|french press|grinder|filter|espresso)\b/i, "Kitchen"],
  [/\b(blender|toaster|mixer|knife|cutting board|spatula|sauce pan|skillet|pot)\b/i, "Kitchen"],
  [/\b(diapers?|shampoo|conditioner|toothpaste|toothbrush|deodorant|razor|lotion|moisturiz)\b/i, "Health & Personal Care"],
  [/\b(vitamin|supplement|magnesium|melatonin|ibuprofen|advil|tylenol|protein)\b/i, "Health & Personal Care"],
  [/\b(notebook|pen|pencil|highlighter|stapler|paper|printer ink|toner)\b/i, "Office"],
  [/\b(headphone|earbud|usb|charger|cable|hdmi|laptop|webcam|keyboard|mouse|monitor|adapter|battery|powerbank)\b/i, "Electronics"],
  [/\b(t-shirt|shirt|sock|jean|sweater|jacket|hoodie|sneaker|boot|dress|skirt)\b/i, "Apparel"],
  [/\b(toy|lego|puzzle|board game|action figure)\b/i, "Toys"],
  [/\b(tools?|drill|screw|hammer|wrench|saw|sand paper|paint(?:brush)?)\b/i, "Tools & Home"],
  [/\b(garden|plant|seed|soil|hose|trowel|fertilizer)\b/i, "Garden"],
  [/\b(cleaner|detergent|wipes|sponge|paper towel|trash bag|broom|mop|vacuum)\b/i, "Household"],
  [/\b(snack|crackers|chocolate|cereal|peanut butter|protein bar|granola)\b/i, "Grocery"],
]

function parseAmazon(raw: string, meta: ParsedFile["meta"]): ParsedFile {
  const rows = parseCsv(raw)
  if (rows.length === 0) throw new Error("amazon-orders: empty CSV")
  const headers = rows[0]
  const headerLower = headers.map(h => (h || "").trim())
  const cols: Record<string, number | null> = {}
  for (const slot of Object.keys(AMAZON_HEADER_PATTERNS)) {
    cols[slot] = null
    for (let i = 0; i < headerLower.length; i++) {
      if (AMAZON_HEADER_PATTERNS[slot].some(p => p.test(headerLower[i]))) {
        cols[slot] = i
        break
      }
    }
  }

  const get = (r: string[], idx: number | null) => (idx !== null ? (r[idx] || "").trim() : "")

  const items: AmazonRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.every(c => !c || !c.trim())) continue
    const date = parseAmazonDate(get(r, cols.date))
    if (!date) continue
    const itemTotal = parseAmazonAmount(get(r, cols.itemTotal))
    const itemSubtotal = parseAmazonAmount(get(r, cols.itemSubtotal)) || itemTotal
    const titleRaw = get(r, cols.title) || "(no title)"
    const title = titleRaw.length > 240 ? titleRaw.slice(0, 240) + "…" : titleRaw
    const status = get(r, cols.status) || "Unknown"
    const flags = classifyAmazonStatus(status)
    let category = get(r, cols.category) || null
    let categoryInferred = false
    if (!category) {
      category = inferCategory(title)
      categoryInferred = category !== null
    }
    const rawObj: Record<string, string> = {}
    for (let j = 0; j < headers.length && j < r.length; j++) {
      const k = (headers[j] || `col_${j}`).trim() || `col_${j}`
      const v = (r[j] || "").trim()
      if (v.length > 240) rawObj[k] = v.slice(0, 240) + "…"
      else rawObj[k] = v
    }
    items.push({
      id: `amz_${(i).toString().padStart(6, "0")}`,
      date,
      shipDate: parseAmazonDate(get(r, cols.shipDate)) || null,
      title,
      asin: get(r, cols.asin) || null,
      orderId: get(r, cols.orderId) || "",
      category,
      categoryInferred,
      quantity: Math.max(1, Number(get(r, cols.quantity)) || 1),
      itemSubtotal,
      itemTotal,
      currency: get(r, cols.currency) || "USD",
      status,
      recipient: get(r, cols.recipient) || null,
      shipState: get(r, cols.shipState) || null,
      carrier: get(r, cols.carrier) || null,
      flags,
      raw: rawObj,
    })
  }

  items.sort((a, b) => a.date.localeCompare(b.date))

  const currencyCode = items[0]?.currency || "USD"
  const currencySymbol = currencyCode === "USD" || currencyCode === "" ? "$"
    : currencyCode === "GBP" ? "£" : currencyCode === "EUR" ? "€"
    : currencyCode === "JPY" ? "¥" : currencyCode === "CAD" ? "$"
    : currencyCode === "AUD" ? "$" : "$"

  const orderIds = new Set<string>()
  const titleKeyTotals: Record<string, { title: string; key: string; count: number; quantity: number; spend: number; first: string; last: string; ids: string[] }> = {}
  const yearAgg: Record<string, { spend: number; orders: Set<string>; items: number; categories: Record<string, number> }> = {}
  const monthAgg: Record<string, { spend: number; orders: Set<string>; items: number }> = {}
  const categoryAgg: Record<string, { spend: number; items: number; inferred: boolean; monthly: Record<string, number> }> = {}
  const recipientAgg: Record<string, { spend: number; items: number; titles: Record<string, number> }> = {}

  let totalSpend = 0
  let totalSubtotal = 0
  let refundedAmount = 0
  let refundedCount = 0
  let cancelledCount = 0

  for (const it of items) {
    if (it.orderId) orderIds.add(it.orderId)
    totalSpend += it.itemTotal
    totalSubtotal += it.itemSubtotal
    if (it.flags.includes("refund") || it.flags.includes("return")) {
      refundedAmount += it.itemTotal
      refundedCount += 1
    }
    if (it.flags.includes("cancelled")) cancelledCount += 1

    const year = it.date.slice(0, 4)
    const month = it.date.slice(0, 7)
    const yEntry = yearAgg[year] = yearAgg[year] || { spend: 0, orders: new Set<string>(), items: 0, categories: {} }
    yEntry.spend += it.itemTotal
    yEntry.items += 1
    if (it.orderId) yEntry.orders.add(it.orderId)
    if (it.category) yEntry.categories[it.category] = (yEntry.categories[it.category] || 0) + it.itemTotal

    const mEntry = monthAgg[month] = monthAgg[month] || { spend: 0, orders: new Set<string>(), items: 0 }
    mEntry.spend += it.itemTotal
    mEntry.items += 1
    if (it.orderId) mEntry.orders.add(it.orderId)

    const cat = it.category || "Uncategorized"
    const cEntry = categoryAgg[cat] = categoryAgg[cat] || { spend: 0, items: 0, inferred: false, monthly: {} }
    cEntry.spend += it.itemTotal
    cEntry.items += 1
    if (it.categoryInferred) cEntry.inferred = true
    cEntry.monthly[month] = (cEntry.monthly[month] || 0) + it.itemTotal

    if (it.recipient) {
      const rEntry = recipientAgg[it.recipient] = recipientAgg[it.recipient] || { spend: 0, items: 0, titles: {} }
      rEntry.spend += it.itemTotal
      rEntry.items += 1
      rEntry.titles[it.title] = (rEntry.titles[it.title] || 0) + 1
    }

    const key = (it.asin || it.title).toLowerCase()
    const tk = titleKeyTotals[key] = titleKeyTotals[key] || {
      title: it.title, key, count: 0, quantity: 0, spend: 0,
      first: it.date, last: it.date, ids: [],
    }
    tk.count += 1
    tk.quantity += it.quantity
    tk.spend += it.itemTotal
    if (it.date < tk.first) tk.first = it.date
    if (it.date > tk.last) tk.last = it.date
    tk.ids.push(it.id)
  }

  const sortedMonths = Object.keys(monthAgg).sort()
  const monthTotals = sortedMonths.map(m => ({
    month: m,
    spend: round2(monthAgg[m].spend),
    orders: monthAgg[m].orders.size,
    items: monthAgg[m].items,
  }))
  const yearTotals = Object.keys(yearAgg).sort().map(y => ({
    year: y,
    spend: round2(yearAgg[y].spend),
    orders: yearAgg[y].orders.size,
    items: yearAgg[y].items,
    topCategory: topKey(yearAgg[y].categories),
  }))

  const categoryTotalsList = Object.entries(categoryAgg)
    .map(([category, v]) => ({
      category,
      spend: round2(v.spend),
      items: v.items,
      share: totalSpend > 0 ? v.spend / totalSpend : 0,
      inferred: v.inferred,
      monthly: sortedMonths.map(m => ({ month: m, spend: round2(v.monthly[m] || 0) })),
    }))
    .sort((a, b) => b.spend - a.spend)

  const reorders = Object.values(titleKeyTotals)
    .filter(t => t.count >= 3)
    .map(t => ({
      key: t.key,
      title: t.title,
      timesOrdered: t.count,
      totalQuantity: t.quantity,
      totalSpend: round2(t.spend),
      firstSeen: t.first,
      lastSeen: t.last,
      cadenceLabel: cadenceLabel(t.first, t.last, t.count),
      cadenceTag: cadenceTag(t.first, t.last, t.count, t.spend / t.count),
      sampleItemIds: t.ids.slice(0, 12),
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend)

  const habitCandidates = reorders.length === 0
    ? Object.values(titleKeyTotals)
        .filter(t => t.count === 2)
        .slice(0, 10)
        .map(t => ({
          key: t.key,
          title: t.title,
          timesOrdered: t.count,
          totalQuantity: t.quantity,
          totalSpend: round2(t.spend),
          firstSeen: t.first,
          lastSeen: t.last,
          cadenceLabel: cadenceLabel(t.first, t.last, t.count),
          cadenceTag: "habit-candidate" as const,
          sampleItemIds: t.ids.slice(0, 4),
        }))
    : []

  const recipients = Object.entries(recipientAgg)
    .map(([name, v]) => ({
      name,
      spend: round2(v.spend),
      items: v.items,
      share: totalSpend > 0 ? v.spend / totalSpend : 0,
      topItems: Object.entries(v.titles).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([title, count]) => ({ title, count })),
    }))
    .sort((a, b) => b.spend - a.spend)

  const returned: AmazonRow[] = items.filter(it => it.flags.includes("return") || it.flags.includes("refund"))
  const cancelled: AmazonRow[] = items.filter(it => it.flags.includes("cancelled"))
  const problem: AmazonRow[] = items.filter(it => it.flags.includes("problem"))

  const period = items.length ? `${items[0].date} → ${items[items.length - 1].date}` : "(empty)"
  const months = sortedMonths.length

  const summary = {
    rowCount: items.length,
    orderCount: orderIds.size,
    distinctItemCount: Object.keys(titleKeyTotals).length,
    totalSpend: round2(totalSpend),
    totalSubtotal: round2(totalSubtotal),
    refundedAmount: round2(refundedAmount),
    refundedCount,
    cancelledCount,
    currencySymbol,
    currencyCode: currencyCode || "USD",
    period,
    durationLabel: durationLabel(items[0]?.date, items[items.length - 1]?.date),
    activeMonths: months,
    distinctCategories: Object.keys(categoryAgg).length,
    distinctRecipients: Object.keys(recipientAgg).length,
    topCategory: categoryTotalsList[0]?.category || null,
    topCategoryShare: categoryTotalsList[0]?.share || 0,
  }

  const returnsAndRefunds = {
    returned: returned.map(rowSummaryForRefund),
    cancelled: cancelled.map(rowSummaryForRefund),
    problem: problem.map(rowSummaryForRefund),
  }

  const data = {
    format: "amazon-orders",
    subtype: "items",
    rows: items,
    summary,
    yearTotals,
    monthTotals,
    categoryTotals: categoryTotalsList,
    reorders: reorders.length ? reorders : habitCandidates,
    reordersKind: reorders.length ? "reorder" : "habit-candidate",
    recipients,
    returnsAndRefunds,
    meta: {
      ...meta,
      headers,
      detectedColumns: Object.fromEntries(Object.entries(cols).filter(([_, v]) => v !== null).map(([k, v]) => [k, headers[v as number]])),
      currencyCode: summary.currencyCode,
      currencySymbol: summary.currencySymbol,
    },
  }

  const sample = {
    summary,
    yearTotals,
    monthTotals: monthTotals.slice(-12),
    categoryTotals: categoryTotalsList.slice(0, 8),
    reordersTop: data.reorders.slice(0, 6),
    recipients,
    returnsAndRefundsCounts: {
      returned: returned.length,
      cancelled: cancelled.length,
      problem: problem.length,
    },
    firstRows: items.slice(0, 6).map(stripAmazonRow),
    lastRows: items.slice(-3).map(stripAmazonRow),
    detectedColumns: data.meta.detectedColumns,
    headers,
  }

  const summaryLine = `Amazon order history — ${items.length} items across ${orderIds.size} orders, ${currencySymbol}${Math.round(totalSpend).toLocaleString("en-US")} spent over ${period} (${Object.keys(categoryAgg).length} categories, ${Object.keys(recipientAgg).length} recipients).`

  return {
    contentType: "amazon-orders",
    summary: summaryLine,
    sample,
    data,
    meta: {
      ...meta,
      shape: "amazon-orders",
      itemCount: items.length,
      orderCount: orderIds.size,
      totalSpend: round2(totalSpend),
      currencyCode: summary.currencyCode,
      currencySymbol: summary.currencySymbol,
      period,
    },
  }
}

function stripAmazonRow(it: AmazonRow): AmazonRow {
  const raw: Record<string, string> = {}
  let n = 0
  for (const [k, v] of Object.entries(it.raw)) {
    if (n >= 8) { raw["…"] = `+${Object.keys(it.raw).length - n} more`; break }
    raw[k] = v.length > 60 ? v.slice(0, 60) + "…" : v
    n += 1
  }
  return { ...it, raw }
}

function rowSummaryForRefund(r: AmazonRow): { id: string; title: string; date: string; amount: number; status: string; orderId: string } {
  return { id: r.id, title: r.title, date: r.date, amount: r.itemTotal, status: r.status, orderId: r.orderId }
}

function classifyAmazonStatus(status: string): string[] {
  const s = status.toLowerCase()
  if (/cancel/.test(s)) return ["cancelled"]
  if (/refund/.test(s)) return ["refund"]
  if (/return/.test(s)) return ["return"]
  if (/lost|damag|delay|exception|problem|undeliver/.test(s)) return ["problem"]
  return []
}

function inferCategory(title: string): string | null {
  for (const [re, cat] of CATEGORY_KEYWORDS) {
    if (re.test(title)) return cat
  }
  return null
}

function topKey(rec: Record<string, number>): string | null {
  let best: [string, number] | null = null
  for (const [k, v] of Object.entries(rec)) {
    if (best === null || v > best[1]) best = [k, v]
  }
  return best?.[0] || null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function parseAmazonDate(s: string): string {
  if (!s) return ""
  const t = s.trim()
  // ISO 8601 (2024-03-14, 2024-03-14T12:00:00Z)
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  // M/D/YYYY or MM/DD/YYYY (Amazon US default)
  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.exec(t)
  if (us) {
    const yyyy = us[3].length === 2 ? "20" + us[3] : us[3]
    return `${yyyy}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`
  }
  return ""
}

function parseAmazonAmount(s: string): number {
  if (!s) return 0
  const cleaned = s.replace(/[^0-9.\-]/g, "")
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
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

function cadenceLabel(first: string, last: string, count: number): string {
  if (count < 2) return "one-off"
  const days = Math.max(1, Math.round((Date.parse(last) - Date.parse(first)) / 86400000))
  const avg = days / Math.max(1, count - 1)
  if (avg < 21) return "every ~2 weeks"
  if (avg < 45) return "every ~month"
  if (avg < 75) return "every ~6 weeks"
  if (avg < 150) return "every ~3 months"
  if (avg < 240) return "every ~6 months"
  if (avg < 400) return "yearly"
  return "occasional"
}

function cadenceTag(first: string, last: string, count: number, avgPrice: number): "habit" | "subscribe" | "splurge-rebuy" {
  const days = Math.max(1, Math.round((Date.parse(last) - Date.parse(first)) / 86400000))
  const avg = days / Math.max(1, count - 1)
  if (count >= 5 && avg < 60 && avgPrice < 60) return "subscribe"
  if (avg < 90) return "habit"
  return "splurge-rebuy"
}

// ----------------------------------- linkedin-connections

interface LinkedInRow {
  id: string
  firstName: string
  lastName: string
  fullName: string
  url: string | null
  email: string | null
  emailMasked: string | null
  emailDomain: string | null
  emailDomainKind: "work" | "personal" | null
  company: string | null
  companyKey: string | null   // normalized for grouping
  position: string | null
  positionKeyword: string | null
  industry: string
  connectedOn: string         // ISO YYYY-MM-DD or ""
  connectedYear: number | null
  connectedMonth: string | null   // YYYY-MM
  yearsAgo: number | null
  reconnectScore: number      // 0..1
  flags: string[]             // e.g. "missing-email","missing-company","stale-old","very-recent","duplicate-name"
}

const LINKEDIN_PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
  "icloud.com", "me.com", "mac.com", "yahoo.com", "aol.com", "proton.me",
  "protonmail.com", "pm.me", "fastmail.com", "msn.com", "ymail.com",
  "rocketmail.com", "comcast.net", "verizon.net", "att.net",
])

const LINKEDIN_INDUSTRY_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(software|engineer|engineering|developer|dev\b|sde\b|sdet\b|backend|frontend|full[-\s]?stack|devops|sre|reliability|platform|architect|programmer|data\s*scien|ml\s*engineer|machine\s*learning|ai\s*engineer|research\s*scien)/i, "Engineering & Data"],
  [/\b(product\s*manager|pm\b|product\s*lead|product\s*owner|head\s*of\s*product|chief\s*product|product\s*marketing)/i, "Product"],
  [/\b(design|designer|ux|ui\b|user\s*experience|product\s*design|brand\s*design|graphic|creative\s*director|illustrator)/i, "Design"],
  [/\b(marketing|growth|seo\b|brand\b|content\s*strategist|social\s*media|comms?\b|public\s*relations|pr\s*manager|copywriter)/i, "Marketing & Growth"],
  [/\b(sales|account\s*executive|ae\b|sdr\b|bdr\b|business\s*development|partnerships?)/i, "Sales & BD"],
  [/\b(founder|co[-\s]?founder|ceo\b|chief\s*executive|cto\b|chief\s*technolog|coo\b|cfo\b|chief\s*of\s*staff|managing\s*director|owner|entrepreneur)/i, "Founder & Exec"],
  [/\b(investor|venture|partner\b|principal\b|associate\s*partner|vc\b|angel|portfolio|investment\s*banker|hedge|private\s*equity|wealth\s*manag)/i, "Investing & Finance"],
  [/\b(recruiter|talent|people\s*ops|hr\b|human\s*resources|coach\b|career\s*coach|culture\s*lead)/i, "People & Talent"],
  [/\b(operations|ops\b|program\s*manager|project\s*manager|chief\s*operating)/i, "Operations"],
  [/\b(consultant|consulting|advisor|strateg|mckinsey|bain|bcg)/i, "Consulting & Strategy"],
  [/\b(legal|attorney|lawyer|paralegal|counsel\b|compliance)/i, "Legal & Compliance"],
  [/\b(professor|lecturer|teacher|phd\s*candidate|researcher|postdoc|graduate\s*student|academic)/i, "Academia"],
  [/\b(journalist|reporter|editor|writer|author|columnist|podcast)/i, "Media & Writing"],
  [/\b(doctor\b|physician|surgeon|nurse|nurse\s*practitioner|md\b|healthcare|clinical|pharmacist|therapist)/i, "Healthcare"],
  [/\b(student|undergrad|intern|fellow)/i, "Student & Early Career"],
]

function parseLinkedIn(raw: string, meta: ParsedFile["meta"]): ParsedFile {
  const allRows = parseCsv(stripLinkedInPreamble(raw))
  if (allRows.length === 0) throw new Error("linkedin-connections: empty CSV")
  const headers = allRows[0].map(h => (h || "").trim())
  const headerLower = headers.map(h => h.toLowerCase())
  const idx = (label: RegExp) => headerLower.findIndex(h => label.test(h))
  const cols = {
    firstName: idx(/^first\s*name$/),
    lastName: idx(/^last\s*name$/),
    url: idx(/^url$/),
    email: idx(/^email\s*address$/),
    company: idx(/^company$/),
    position: idx(/^position$/),
    connectedOn: idx(/^connected\s*on$/),
  }

  const rows: LinkedInRow[] = []
  const dupNames: Record<string, string[]> = {}
  const dupUrls: Record<string, string[]> = {}

  for (let i = 1; i < allRows.length; i++) {
    const r = allRows[i]
    if (!r || r.every(c => !c || !c.trim())) continue
    const id = `ln_${i.toString().padStart(6, "0")}`
    const firstName = field(r, cols.firstName)
    const lastName = field(r, cols.lastName)
    const fullName = `${firstName} ${lastName}`.trim()
    const url = field(r, cols.url) || null
    const emailRaw = field(r, cols.email)
    const email = emailRaw.includes("@") ? emailRaw.toLowerCase() : (emailRaw || null)
    const company = field(r, cols.company) || null
    const position = field(r, cols.position) || null
    const connectedOn = parseLinkedInDate(field(r, cols.connectedOn))
    const connectedYear = connectedOn ? Number(connectedOn.slice(0, 4)) : null
    const connectedMonth = connectedOn ? connectedOn.slice(0, 7) : null
    const emailDomain = email && email.includes("@") ? email.split("@")[1] || null : null
    const emailDomainKind: LinkedInRow["emailDomainKind"] = emailDomain
      ? (LINKEDIN_PERSONAL_DOMAINS.has(emailDomain) ? "personal" : "work")
      : null
    const flags: string[] = []
    if (!email) flags.push("missing-email")
    if (!company) flags.push("missing-company")
    if (!position) flags.push("missing-position")
    rows.push({
      id, firstName, lastName, fullName,
      url: url ? sanitizeLinkedInUrl(url) : null,
      email: email || null,
      emailMasked: email ? maskEmail(email) : null,
      emailDomain,
      emailDomainKind,
      company,
      companyKey: company ? company.toLowerCase().replace(/\s+/g, " ").trim() : null,
      position,
      positionKeyword: position ? topPositionKeyword(position) : null,
      industry: inferLinkedInIndustry(position, company),
      connectedOn,
      connectedYear,
      connectedMonth,
      yearsAgo: null,             // filled in once we know latest date
      reconnectScore: 0,          // filled in below
      flags,
    })
    if (fullName) {
      const k = fullName.toLowerCase()
      ;(dupNames[k] = dupNames[k] || []).push(id)
    }
    if (url) {
      const k = sanitizeLinkedInUrl(url).toLowerCase()
      ;(dupUrls[k] = dupUrls[k] || []).push(id)
    }
  }

  rows.sort((a, b) => (a.connectedOn || "").localeCompare(b.connectedOn || ""))

  // Cross-link duplicate flags
  for (const [name, ids] of Object.entries(dupNames)) {
    if (ids.length < 2) continue
    for (const id of ids) {
      const r = rows.find(rr => rr.id === id)
      if (r && !r.flags.includes("duplicate-name")) r.flags.push("duplicate-name")
    }
    void name
  }
  for (const [url, ids] of Object.entries(dupUrls)) {
    if (ids.length < 2) continue
    for (const id of ids) {
      const r = rows.find(rr => rr.id === id)
      if (r && !r.flags.includes("duplicate-url")) r.flags.push("duplicate-url")
    }
    void url
  }

  // Year-of-connection helpers using the latest date in the file as
  // "now" so the example output stays stable across years.
  const datesPresent = rows.map(r => r.connectedOn).filter(Boolean) as string[]
  const latestDate = datesPresent.length ? datesPresent[datesPresent.length - 1] : ""
  const earliestDate = datesPresent.length ? datesPresent[0] : ""
  const nowMs = latestDate ? Date.parse(latestDate + "T00:00:00Z") : Date.now()

  for (const r of rows) {
    if (r.connectedOn) {
      const ms = Date.parse(r.connectedOn + "T00:00:00Z")
      r.yearsAgo = Math.round(((nowMs - ms) / (365.25 * 86400000)) * 10) / 10
      if (r.yearsAgo >= 5) r.flags.push("stale-old")
      if (r.yearsAgo <= 0.25) r.flags.push("very-recent")
    }
  }

  // Reconnect heuristic: weighted score combining staleness, missing
  // company, presence of email (so the user can actually reach out),
  // and very recent additions (gentle "say hi" prompts).
  for (const r of rows) {
    let s = 0
    if (r.yearsAgo != null) s += Math.min(0.5, r.yearsAgo / 10)
    if (r.flags.includes("missing-company")) s += 0.15
    if (r.flags.includes("missing-position")) s += 0.05
    if (r.email) s += 0.1
    if (r.flags.includes("very-recent")) s += 0.2
    r.reconnectScore = Math.round(s * 100) / 100
  }

  // Aggregations -----------------------------------------------------
  const monthGrowthMap: Record<string, number> = {}
  const yearGrowthMap: Record<string, number> = {}
  const companyMap: Record<string, { name: string; count: number; sampleIds: string[] }> = {}
  const positionMap: Record<string, { keyword: string; count: number; sampleIds: string[] }> = {}
  const domainMap: Record<string, { domain: string; count: number; kind: "work" | "personal"; sampleIds: string[] }> = {}
  const industryMap: Record<string, { industry: string; count: number; sampleIds: string[] }> = {}

  for (const r of rows) {
    if (r.connectedMonth) monthGrowthMap[r.connectedMonth] = (monthGrowthMap[r.connectedMonth] || 0) + 1
    if (r.connectedYear) yearGrowthMap[String(r.connectedYear)] = (yearGrowthMap[String(r.connectedYear)] || 0) + 1
    if (r.companyKey && r.company) {
      const e = companyMap[r.companyKey] = companyMap[r.companyKey] || { name: r.company, count: 0, sampleIds: [] }
      e.count += 1
      if (e.sampleIds.length < 12) e.sampleIds.push(r.id)
    }
    if (r.positionKeyword) {
      const e = positionMap[r.positionKeyword] = positionMap[r.positionKeyword] || { keyword: r.positionKeyword, count: 0, sampleIds: [] }
      e.count += 1
      if (e.sampleIds.length < 12) e.sampleIds.push(r.id)
    }
    if (r.emailDomain && r.emailDomainKind) {
      const e = domainMap[r.emailDomain] = domainMap[r.emailDomain] || { domain: r.emailDomain, count: 0, kind: r.emailDomainKind, sampleIds: [] }
      e.count += 1
      if (e.sampleIds.length < 12) e.sampleIds.push(r.id)
    }
    {
      const e = industryMap[r.industry] = industryMap[r.industry] || { industry: r.industry, count: 0, sampleIds: [] }
      e.count += 1
      if (e.sampleIds.length < 12) e.sampleIds.push(r.id)
    }
  }

  const monthlyGrowth = Object.keys(monthGrowthMap).sort().map(m => ({ month: m, count: monthGrowthMap[m] }))
  const yearlyGrowthRaw = Object.keys(yearGrowthMap).sort()
  let cumulative = 0
  const yearlyGrowth = yearlyGrowthRaw.map(y => {
    cumulative += yearGrowthMap[y]
    return { year: Number(y), count: yearGrowthMap[y], cumulative }
  })
  const meanMonthly = monthlyGrowth.length
    ? monthlyGrowth.reduce((s, m) => s + m.count, 0) / monthlyGrowth.length
    : 0
  const spikes = monthlyGrowth
    .filter(m => meanMonthly > 0 && m.count >= meanMonthly * 2.5 && m.count >= 4)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map(m => ({ month: m.month, count: m.count, label: linkedInSpikeLabel(m.month, m.count) }))

  const companyLeaderboard = Object.values(companyMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
  const positionKeywords = Object.values(positionMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
  const emailDomains = Object.values(domainMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
  const industries = Object.values(industryMap)
    .sort((a, b) => b.count - a.count)

  // Audit + reconnect queue -----------------------------------------
  const missingEmail = rows.filter(r => r.flags.includes("missing-email"))
  const missingCompany = rows.filter(r => r.flags.includes("missing-company"))
  const missingPosition = rows.filter(r => r.flags.includes("missing-position"))
  const veryRecent = rows.filter(r => r.flags.includes("very-recent")).slice(-12).reverse()
  const staleOld = rows.filter(r => r.flags.includes("stale-old"))
  const duplicateNameClusters = Object.entries(dupNames)
    .filter(([, ids]) => ids.length >= 2)
    .map(([name, ids]) => ({ name, ids }))
    .slice(0, 8)
  const duplicateUrlClusters = Object.entries(dupUrls)
    .filter(([, ids]) => ids.length >= 2)
    .map(([url, ids]) => ({ url, ids }))
    .slice(0, 8)

  const reconnectQueue = rows
    .filter(r => r.reconnectScore > 0)
    .sort((a, b) => b.reconnectScore - a.reconnectScore)
    .slice(0, 24)
    .map(r => ({
      id: r.id,
      score: r.reconnectScore,
      reasons: reconnectReasons(r),
    }))

  const summary = {
    contactCount: rows.length,
    period: latestDate && earliestDate ? `${earliestDate} → ${latestDate}` : "(empty)",
    durationLabel: durationLabel(earliestDate, latestDate),
    yearWindow: latestDate && earliestDate
      ? `${earliestDate.slice(0, 4)} → ${latestDate.slice(0, 4)}`
      : "",
    withEmail: rows.filter(r => r.email).length,
    withCompany: rows.filter(r => r.company).length,
    withPosition: rows.filter(r => r.position).length,
    withUrl: rows.filter(r => r.url).length,
    distinctCompanies: Object.keys(companyMap).length,
    distinctPositions: Object.keys(positionMap).length,
    distinctEmailDomains: Object.keys(domainMap).length,
    distinctIndustries: Object.keys(industryMap).length,
    topCompany: companyLeaderboard[0]?.name || null,
    topCompanyCount: companyLeaderboard[0]?.count || 0,
    topIndustry: industries[0]?.industry || null,
    topPositionKeyword: positionKeywords[0]?.keyword || null,
    topDomain: emailDomains[0]?.domain || null,
    workEmailShare: rows.length > 0
      ? Math.round((rows.filter(r => r.emailDomainKind === "work").length / rows.length) * 100) / 100
      : 0,
    referenceDate: latestDate || null,
  }

  const audit = {
    missingEmail: { count: missingEmail.length, sampleIds: missingEmail.slice(0, 12).map(r => r.id) },
    missingCompany: { count: missingCompany.length, sampleIds: missingCompany.slice(0, 12).map(r => r.id) },
    missingPosition: { count: missingPosition.length, sampleIds: missingPosition.slice(0, 12).map(r => r.id) },
    staleOld: { count: staleOld.length, sampleIds: staleOld.slice(0, 12).map(r => r.id) },
    veryRecent: { count: veryRecent.length, sampleIds: veryRecent.slice(0, 12).map(r => r.id) },
    duplicateNameClusters,
    duplicateUrlClusters,
  }

  const data = {
    format: "linkedin-connections",
    rows,
    monthlyGrowth,
    yearlyGrowth,
    spikes,
    companyLeaderboard,
    positionKeywords,
    emailDomains,
    industries,
    reconnectQueue,
    audit,
    summary,
    meta: {
      ...meta,
      headers,
      detectedColumns: Object.fromEntries(
        Object.entries(cols).filter(([_, v]) => v >= 0).map(([k, v]) => [k, headers[v as number]])
      ),
    },
  }

  const sample = {
    summary,
    yearlyGrowth,
    spikes,
    companyLeaderboardTop: companyLeaderboard.slice(0, 6),
    industriesTop: industries.slice(0, 6),
    emailDomainsTop: emailDomains.slice(0, 6),
    positionKeywordsTop: positionKeywords.slice(0, 6),
    auditCounts: {
      missingEmail: missingEmail.length,
      missingCompany: missingCompany.length,
      missingPosition: missingPosition.length,
      staleOld: staleOld.length,
      veryRecent: veryRecent.length,
      duplicateNames: duplicateNameClusters.length,
      duplicateUrls: duplicateUrlClusters.length,
    },
    firstRows: rows.slice(0, 4).map(stripLinkedInRow),
    lastRows: rows.slice(-4).map(stripLinkedInRow),
    headers,
  }

  const summaryLine = `LinkedIn connections — ${rows.length} contacts spanning ${summary.period} across ${Object.keys(companyMap).length} companies and ${Object.keys(industryMap).length} industries.`

  return {
    contentType: "linkedin-connections",
    summary: summaryLine,
    sample,
    data,
    meta: {
      ...meta,
      shape: "linkedin-connections",
      contactCount: rows.length,
      period: summary.period,
      distinctCompanies: summary.distinctCompanies,
    },
  }
}

function field(r: string[], i: number): string {
  if (i < 0 || i >= r.length) return ""
  return (r[i] || "").trim()
}

function stripLinkedInPreamble(raw: string): string {
  // LinkedIn often prefixes the file with a 1-3 line "Notes:" block
  // that explains the export. Find the first line that looks like the
  // canonical header and drop everything before it. If we can't find
  // one, return the original — the caller will fail loudly.
  const lines = raw.split(/\r?\n/)
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const lower = lines[i].toLowerCase().replace(/^[﻿]/, "")
    if (/\bfirst\s*name\b/.test(lower) && /\blast\s*name\b/.test(lower) && /\bconnected\s*on\b/.test(lower)) {
      return lines.slice(i).join("\n")
    }
  }
  return raw
}

function maskEmail(email: string): string {
  const at = email.indexOf("@")
  if (at <= 0) return email
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (local.length <= 2) return `${local[0] || "•"}•@${domain}`
  return `${local[0]}${"•".repeat(Math.min(4, local.length - 2))}${local[local.length - 1]}@${domain}`
}

function sanitizeLinkedInUrl(url: string): string {
  // The export sometimes includes tracking params; strip query/hash so
  // we can detect duplicates. Don't follow the URL.
  return url.split(/[?#]/)[0].replace(/\/+$/, "")
}

function topPositionKeyword(title: string): string | null {
  // Quick keyword extraction: prefer first noun chunk from a known
  // ladder, else the first non-trivial word. Returned values group
  // titles like "Senior Software Engineer at Acme" → "Software Engineer".
  const t = title.replace(/\s+at\s+.*$/i, "").trim()
  const ladders: RegExp[] = [
    /(software|product|data|design|hardware|mechanical|electrical|machine\s*learning|ml|ai|research|qa|devops|sre|platform|security|growth|customer|sales|marketing|brand|content|operations|chief\s*of\s*staff|account|partnerships?|recruit|talent|people|finance|investment|portfolio)\s+(engineer|manager|lead|designer|scientist|director|partner|associate|analyst|architect|writer|recruiter|coach|specialist|consultant|developer|owner|advisor|coordinator|executive)\b/i,
    /\b(ceo|cto|coo|cfo|cmo|founder|co[-\s]?founder|chief\s*of\s*staff)\b/i,
    /\b(engineer|designer|manager|director|founder|partner|recruiter|analyst|consultant|coach|developer|scientist|writer|professor|lecturer|nurse|doctor|attorney|lawyer|paralegal|architect|owner|investor|associate|advisor|editor|journalist|student|intern|fellow|pm)\b/i,
  ]
  for (const re of ladders) {
    const m = re.exec(t)
    if (m) {
      const k = (m[1] && m[2] ? `${m[1]} ${m[2]}` : m[0]).toLowerCase().replace(/\s+/g, " ")
      return k.replace(/\b\w/g, c => c.toUpperCase())
    }
  }
  return null
}

function inferLinkedInIndustry(position: string | null, company: string | null): string {
  const haystack = `${position || ""} ${company || ""}`.trim()
  if (!haystack) return "Other"
  for (const [re, label] of LINKEDIN_INDUSTRY_KEYWORDS) {
    if (re.test(haystack)) return label
  }
  return "Other"
}

function reconnectReasons(r: LinkedInRow): string[] {
  const out: string[] = []
  if (r.yearsAgo != null && r.yearsAgo >= 5) out.push("connected " + Math.round(r.yearsAgo) + "y ago")
  if (r.flags.includes("missing-company")) out.push("missing current company")
  if (r.flags.includes("very-recent")) out.push("just connected")
  if (r.email) out.push("has email")
  return out
}

function linkedInSpikeLabel(month: string, count: number): string {
  const d = new Date(month + "-01T00:00:00Z")
  const monthName = d.toLocaleString("en-US", { month: "long", timeZone: "UTC" })
  return `${monthName} ${month.slice(0, 4)}: ${count} new connections`
}

function parseLinkedInDate(s: string): string {
  if (!s) return ""
  const t = s.trim()
  // "12 May 2024"
  const dmy = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/.exec(t)
  if (dmy) {
    const m = monthIndex(dmy[2])
    if (m > 0) return `${dmy[3]}-${m.toString().padStart(2, "0")}-${dmy[1].padStart(2, "0")}`
  }
  // "May 12, 2024" / "May 12 2024"
  const mdy = /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/.exec(t)
  if (mdy) {
    const m = monthIndex(mdy[1])
    if (m > 0) return `${mdy[3]}-${m.toString().padStart(2, "0")}-${mdy[2].padStart(2, "0")}`
  }
  // ISO 8601
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  // M/D/YYYY
  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(t)
  if (us) {
    const yyyy = us[3].length === 2 ? "20" + us[3] : us[3]
    return `${yyyy}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`
  }
  return ""
}

function monthIndex(name: string): number {
  const map: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
    january: 1, february: 2, march: 3, april: 4, june: 6, july: 7,
    august: 8, september: 9, october: 10, november: 11, december: 12,
  }
  return map[name.toLowerCase()] || 0
}

function stripLinkedInRow(r: LinkedInRow): Pick<LinkedInRow, "id" | "fullName" | "company" | "position" | "connectedOn" | "industry" | "emailMasked" | "emailDomainKind"> {
  return {
    id: r.id,
    fullName: r.fullName,
    company: r.company,
    position: r.position,
    connectedOn: r.connectedOn,
    industry: r.industry,
    emailMasked: r.emailMasked,
    emailDomainKind: r.emailDomainKind,
  }
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

// ----------------------------------- browser-history

interface BrowserVisit {
  id: string
  ts: string
  title: string
  url: string
  domain: string
  host: string
  path: string
  query: string
  queryMasked: boolean
  visitCount: number
  typedCount: number
  transition: "typed" | "link" | "auto" | "reload" | "form" | "other"
  isTyped: boolean
  isSearch: boolean
  searchQuery: string | null
  topic: string
  topicInferred: boolean
  bucket: "work" | "personal" | "search" | "other"
  hour: number
  dow: number
  date: string
  isLateNight: boolean
}

const BH_TOPIC_DOMAINS: Array<[RegExp, string]> = [
  [/^(github|gitlab|bitbucket)\.com$/i, "work-tools"],
  [/^(linear|notion|atlassian|jira|trello|asana|monday|airtable|coda|clickup)\.(com|so|app)$/i, "work-tools"],
  [/^(slack|figma|miro|loom|zoom|webex|teams\.microsoft|meet\.google)\.(com|us)$/i, "work-tools"],
  [/^(vercel|netlify|render|fly\.io|railway|heroku|cloudflare|aws\.amazon|azure\.microsoft|console\.cloud\.google|gcp)\.com$/i, "work-tools"],
  [/^(stripe|paddle|chargebee|recurly|quickbooks|gusto|brex|ramp|mercury)\.com$/i, "work-tools"],
  [/^(stackoverflow|stackexchange|superuser|serverfault)\.com$/i, "coding-help"],
  [/^(developer\.mozilla|mdn\.io|dev\.to|hashnode|medium|towardsdatascience|css-tricks|smashingmagazine)\.com$/i, "coding-help"],
  [/^(npmjs|pypi|crates\.io|rubygems|hex\.pm|pkg\.go\.dev|maven|nuget)\.(org|com|io)$/i, "coding-help"],
  [/^(docs\.|readthedocs|devdocs|reactjs|nextjs|vuejs|angular|rust-lang|python|nodejs|postgresql|sqlite|mongodb)\.(org|com|io|app)$/i, "coding-help"],
  [/^(reddit|news\.ycombinator|lobste\.rs|x|twitter|bsky\.app|bluesky|mastodon|threads|linkedin|facebook|instagram|tiktok|pinterest|snapchat|tumblr)\.(com|app)$/i, "social"],
  [/^(youtube|spotify|twitch|netflix|disneyplus|hulu|hbomax|max|appletv|primevideo|peacocktv|paramountplus|crunchyroll|soundcloud|bandcamp|mixcloud)\.(com|tv)$/i, "media"],
  [/^(amazon|ebay|etsy|walmart|target|bestbuy|costco|aliexpress|shopify|wayfair|ikea|homedepot|lowes|wish|temu|shein|zara|uniqlo|nordstrom|macys)\.com$/i, "shopping"],
  [/^(chase|bankofamerica|wellsfargo|citi|capitalone|usbank|hsbc|barclays|santander|mint|personalcapital|empower|fidelity|schwab|vanguard|robinhood|coinbase|kraken|gemini|paypal|venmo|wise|revolut|sofi|ally)\.com$/i, "finance-admin"],
  [/^(irs|ssa|usps|dmv|gov|usa|treasury|hmrc|gov\.uk|service\.gov\.uk)\.(gov|com|uk)$/i, "finance-admin"],
  [/^(google\.com\/maps|maps\.google|maps\.apple|booking|kayak|expedia|priceline|hotels|orbitz|tripadvisor|airbnb|vrbo|aa|delta|united|southwest|jetblue|alaskaair|britishairways|lufthansa|airfrance|emirates|qantas)\.(com|co\.uk)$/i, "travel"],
  [/^(mychart|patient|kp|kaiserpermanente|webmd|healthline|drugs|mayoclinic|nhs|nih|pubmed|ncbi\.nlm\.nih)\.(com|org|uk|gov)$/i, "health"],
  [/^(en\.wikipedia|wikipedia|wikimedia|wiktionary|notion\.so|confluence|wayback|archive)\.(org|so|com)$/i, "docs-knowledge"],
  [/^(google|bing|duckduckgo|kagi|brave\.com\/search|search\.brave|yandex|baidu|ecosia|qwant|startpage|perplexity|you)\.(com|ai)$/i, "search"],
  [/^(nytimes|bbc|reuters|theguardian|washingtonpost|wsj|ft|economist|apnews|bloomberg|cnbc|cnn|axios|politico|vox|theatlantic|newyorker|aljazeera|npr|abcnews|nbcnews|cbsnews)\.(com|co\.uk)$/i, "news"],
  // Synthetic demo / fixture brands under the IANA-reserved `.example` TLD
  // (RFC 2606). These never match real browsing traffic; they exist so the
  // privacy-safe examples under `examples/browser-history/` classify with the
  // same precision as real exports.
  [/^(devhub|tracklane|pagebook|pixelboard|huddle|glidedeploy|cloudbench)\.example$/i, "work-tools"],
  [/^(quokka|webcodex|pkgsmith|buildbits)\.example$/i, "coding-help"],
  [/^(openpedia|manualbase)\.example$/i, "docs-knowledge"],
  [/^(findr|searchgo|quietfind)\.example$/i, "search"],
  [/^(redbox|hackerwire|microblog|worknet)\.example$/i, "social"],
  [/^(streamtube|tunestream|livecast)\.example$/i, "media"],
  [/^(bigmart|craftshop|outdoorco)\.example$/i, "shopping"],
  [/^(investview|friendlybank|paywire|taxportal)\.example$/i, "finance-admin"],
  [/^(mapsguide|bookstay|skywings)\.example$/i, "travel"],
  [/^(caremap|wellnessread)\.example$/i, "health"],
  [/^(dailyledger|worldwire|pressglobe)\.example$/i, "news"],
]

const BH_TOPIC_TITLE: Array<[RegExp, string]> = [
  [/\b(pull request|merge request|issue|commit|branch|repo|pr review|cherry-pick|rebase)\b/i, "work-tools"],
  [/\b(stack ?overflow|how to|error|exception|undefined|cannot|fix|debug|tutorial|cheat ?sheet)\b/i, "coding-help"],
  [/\b(api|sdk|reference|docs?|documentation|guide)\b/i, "docs-knowledge"],
  [/\b(news|breaking|live updates|election|stocks?|market)\b/i, "news"],
  [/\b(reddit|hacker news|tweet|post|reply|thread|subreddit)\b/i, "social"],
  [/\b(buy|cart|order|shipping|return|product|amazon|review)\b/i, "shopping"],
  [/\b(bank|account|statement|invoice|tax|refund|payment|wire|transfer|w-?2|1099)\b/i, "finance-admin"],
  [/\b(flight|hotel|trip|booking|reservation|itinerary|map|directions)\b/i, "travel"],
  [/\b(symptom|dosage|insurance claim|appointment|prescription)\b/i, "health"],
  [/\b(watch|video|episode|season|playlist|track|album|listen|stream)\b/i, "media"],
]

const BH_TOPIC_BUCKET: Record<string, "work" | "personal" | "search" | "other"> = {
  "work-tools": "work",
  "coding-help": "work",
  "docs-knowledge": "work",
  "news": "personal",
  "social": "personal",
  "media": "personal",
  "shopping": "personal",
  "finance-admin": "personal",
  "travel": "personal",
  "health": "personal",
  "search": "search",
  "other": "other",
}

// Common multi-part TLDs we collapse to eTLD+1.
const BH_PSL_2 = new Set([
  "co.uk","org.uk","ac.uk","gov.uk","nhs.uk",
  "com.au","net.au","org.au","gov.au","edu.au",
  "co.jp","ne.jp","or.jp","ac.jp","go.jp",
  "co.nz","net.nz","org.nz","govt.nz",
  "com.br","org.br","gov.br",
  "com.mx","gob.mx",
  "com.cn","org.cn","gov.cn","edu.cn",
  "co.in","gov.in","ac.in","org.in",
  "com.hk","org.hk","gov.hk",
  "com.sg","gov.sg","edu.sg",
])

function eTldPlusOne(host: string): string {
  if (!host) return ""
  const h = host.toLowerCase().replace(/^www\./, "").replace(/^m\./, "")
  const parts = h.split(".")
  if (parts.length <= 2) return h
  const last2 = parts.slice(-2).join(".")
  const last3 = parts.slice(-3).join(".")
  if (BH_PSL_2.has(last2)) return last3
  return last2
}

function bhTransition(raw: string): "typed" | "link" | "auto" | "reload" | "form" | "other" {
  const t = (raw || "").toLowerCase().trim()
  if (!t) return "other"
  if (/^typed/.test(t)) return "typed"
  if (/^link/.test(t)) return "link"
  if (/^auto|^subframe|^manual_subframe|^generated|^start_page|^bookmark/.test(t)) return "auto"
  if (/^reload/.test(t)) return "reload"
  if (/^form/.test(t)) return "form"
  // Numeric Chromium transition codes: low byte is the type.
  const n = Number(t)
  if (Number.isFinite(n)) {
    const core = n & 0xff
    if (core === 1) return "link"
    if (core === 2) return "typed"
    if (core === 3) return "auto"
    if (core === 7) return "form"
    if (core === 8) return "reload"
    if (core === 0) return "link"
  }
  return "other"
}

function bhInferTopic(domain: string, host: string, title: string): { topic: string; inferred: boolean } {
  const lookup = (h: string): string | null => {
    for (const [re, t] of BH_TOPIC_DOMAINS) if (re.test(h)) return t
    return null
  }
  const direct = lookup(domain) || lookup(host)
  if (direct) return { topic: direct, inferred: false }
  for (const [re, t] of BH_TOPIC_TITLE) if (re.test(title || "")) return { topic: t, inferred: true }
  return { topic: "other", inferred: true }
}

function bhParseTimestamp(raw: string): string | null {
  if (!raw) return null
  const trimmed = String(raw).trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (Number.isFinite(n) && /^\d+(\.\d+)?$/.test(trimmed)) {
    // Heuristic: distinguish ms vs s vs us vs Chromium-epoch microseconds.
    if (n > 1e16) {
      // Chromium "WebKit time": microseconds since 1601-01-01.
      const ms = (n / 1000) - 11_644_473_600_000
      const d = new Date(ms)
      if (!isNaN(d.getTime())) return d.toISOString()
    }
    if (n > 1e14) { // microseconds since unix epoch
      const d = new Date(n / 1000)
      if (!isNaN(d.getTime())) return d.toISOString()
    }
    if (n > 1e12) { // milliseconds since unix epoch
      const d = new Date(n)
      if (!isNaN(d.getTime())) return d.toISOString()
    }
    if (n > 1e9) { // seconds since unix epoch
      const d = new Date(n * 1000)
      if (!isNaN(d.getTime())) return d.toISOString()
    }
  }
  // Try standard parse.
  const d = new Date(trimmed.includes(" ") && !trimmed.includes("T") ? trimmed.replace(" ", "T") : trimmed)
  if (!isNaN(d.getTime())) return d.toISOString()
  return null
}

const BH_SEARCH_HOSTS = /^(www\.)?(google\.[a-z.]+|bing\.com|duckduckgo\.com|kagi\.com|search\.brave\.com|brave\.com|yandex\.[a-z.]+|baidu\.com|ecosia\.org|qwant\.com|startpage\.com|perplexity\.ai|you\.com|findr\.example|searchgo\.example|quietfind\.example)$/i

function bhExtractSearchQuery(host: string, query: string): string | null {
  if (!query) return null
  if (!BH_SEARCH_HOSTS.test(host)) return null
  // Search engines use q=, query=, p= (yahoo), wd= (baidu), text= (yandex).
  const m = query.match(/(?:^|&)(q|query|p|wd|text)=([^&#]*)/i)
  if (!m) return null
  try {
    return decodeURIComponent((m[2] || "").replace(/\+/g, " ")).trim() || null
  } catch {
    return (m[2] || "").trim() || null
  }
}

function bhShouldMaskQuery(query: string): boolean {
  if (!query) return false
  if (/(?:^|[?&])(password|token|key|auth|session|access_token|id_token|refresh_token|secret)=/i.test(query)) return true
  if (/@/.test(decodeURIComponentSafe(query))) return true
  // Long digit-only chunks look like account / order numbers.
  if (/(?:^|[=&])\d{8,}(?:&|$)/.test(query)) return true
  return false
}

function decodeURIComponentSafe(s: string): string {
  try { return decodeURIComponent(s.replace(/\+/g, " ")) } catch { return s }
}

function parseBrowserHistoryCsv(raw: string, meta: ParsedFile["meta"]): ParsedFile {
  const rows = parseCsv(raw)
  if (rows.length < 2) throw new Error("browser-history: no rows")
  const header = rows[0].map(h => h.trim().toLowerCase())
  const body = rows.slice(1)
  const findIdx = (...names: RegExp[]): number => {
    for (let i = 0; i < header.length; i++) {
      const name = header[i]
      for (const re of names) if (re.test(name)) return i
    }
    return -1
  }
  const colUrl = findIdx(/^url$/, /^urls?\.url$/, /^visit_url$/, /^link$/)
  const colTitle = findIdx(/^title$/, /^urls?\.title$/, /^page[_ -]?title$/, /^name$/)
  const colTime = findIdx(
    /^visit[ _-]?time$/, /^last[ _-]?visit[ _-]?time$/, /^last[ _-]?visit[ _-]?date$/,
    /^visited[ _-]?on$/, /^visit[ _-]?date$/, /^visited[ _-]?at$/,
    /^timestamp$/, /^time$/, /^date$/,
  )
  const colVisitCount = findIdx(/^visit[ _-]?count$/, /^urls?\.visit_count$/, /^visits$/)
  const colTypedCount = findIdx(/^typed[ _-]?count$/, /^urls?\.typed_count$/)
  const colTransition = findIdx(/^transition([ _-]?type)?$/, /^visits?\.transition$/)
  if (colUrl < 0 || colTime < 0) throw new Error("browser-history: missing url or visit_time column")

  const records = body
    .filter(r => r.length > Math.max(colUrl, colTime))
    .map((r, i): BrowserVisit | null => normalizeVisit(
      r[colUrl] || "",
      colTitle >= 0 ? (r[colTitle] || "") : "",
      r[colTime] || "",
      colVisitCount >= 0 ? Number(r[colVisitCount] || 1) : 1,
      colTypedCount >= 0 ? Number(r[colTypedCount] || 0) : 0,
      colTransition >= 0 ? r[colTransition] || "" : "",
      i,
    ))
    .filter((v): v is BrowserVisit => v !== null)

  return finalizeBrowserHistory(records, meta)
}

function parseBrowserHistoryJson(raw: string, meta: ParsedFile["meta"]): ParsedFile {
  let data: unknown = JSON.parse(raw)
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const o = data as Record<string, unknown>
    if (Array.isArray(o.history)) data = o.history
    else if (Array.isArray(o.entries)) data = o.entries
    else if (Array.isArray(o.visits)) data = o.visits
    else if (Array.isArray(o.urls)) data = o.urls
  }
  if (!Array.isArray(data)) throw new Error("browser-history: expected JSON array")
  const records: BrowserVisit[] = []
  data.forEach((r, i) => {
    if (!r || typeof r !== "object") return
    const o = r as Record<string, unknown>
    const url = (o.url as string) || (o.URL as string) || (o.visit_url as string) || (o.link as string) || ""
    const title = (o.title as string) || (o.Title as string) || (o.name as string) || ""
    const time =
      (o.visit_time as string | number) ??
      (o.visitTime as string | number) ??
      (o.last_visit_time as string | number) ??
      (o.lastVisitTime as string | number) ??
      (o.last_visit_date as string | number) ??
      (o.visited_at as string | number) ??
      (o.timestamp as string | number) ??
      (o.time as string | number) ??
      (o.date as string | number) ??
      (o.date_added as string | number) ?? ""
    const visitCount = Number((o.visit_count as number) ?? (o.visitCount as number) ?? 1)
    const typedCount = Number((o.typed_count as number) ?? (o.typedCount as number) ?? 0)
    const transition = String((o.transition as string) ?? (o.transition_type as string) ?? "")
    const visit = normalizeVisit(url, title, String(time), visitCount, typedCount, transition, i)
    if (visit) records.push(visit)
  })
  return finalizeBrowserHistory(records, meta)
}

function normalizeVisit(
  rawUrl: string,
  rawTitle: string,
  rawTime: string,
  visitCount: number,
  typedCount: number,
  transitionRaw: string,
  idx: number,
): BrowserVisit | null {
  if (!rawUrl) return null
  const ts = bhParseTimestamp(rawTime)
  if (!ts) return null
  let host = ""
  let pth = "/"
  let query = ""
  try {
    const u = new URL(rawUrl)
    host = u.hostname.toLowerCase()
    pth = u.pathname || "/"
    query = u.search ? u.search.slice(1) : ""
  } catch {
    // Fall back to a regex split when URL constructor refuses (e.g. about:blank).
    const m = rawUrl.match(/^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)([^?#]*)(?:\?([^#]*))?/i)
    if (!m) return null
    host = m[2].toLowerCase()
    pth = m[3] || "/"
    query = m[4] || ""
  }
  // Skip browser-internal noise.
  if (/^chrome|^edge|^brave|^moz-extension|^chrome-extension|^about|^view-source/.test(rawUrl)) {
    return null
  }
  const domain = eTldPlusOne(host)
  const title = (rawTitle || "").trim() || (host + pth)
  const transition = bhTransition(transitionRaw)
  const isTyped = transition === "typed" || (Number.isFinite(typedCount) && typedCount > 0)
  const isSearch = BH_SEARCH_HOSTS.test(host)
  const searchQuery = isSearch ? bhExtractSearchQuery(host, query) : null
  const queryMasked = bhShouldMaskQuery(query)
  const { topic, inferred } = bhInferTopic(isSearch ? "search" : domain, host, title)
  const finalTopic = isSearch ? "search" : topic
  const bucket = BH_TOPIC_BUCKET[finalTopic] || "other"
  const d = new Date(ts)
  const hour = d.getUTCHours()
  const dow = d.getUTCDay()
  const date = d.toISOString().slice(0, 10)
  const isLateNight = hour >= 0 && hour < 4
  const id = "h_" + String(idx + 1).padStart(6, "0")
  return {
    id, ts, title, url: rawUrl, domain, host, path: pth, query, queryMasked,
    visitCount: Number.isFinite(visitCount) && visitCount > 0 ? Math.floor(visitCount) : 1,
    typedCount: Number.isFinite(typedCount) && typedCount > 0 ? Math.floor(typedCount) : 0,
    transition, isTyped, isSearch, searchQuery,
    topic: finalTopic, topicInferred: inferred || isSearch,
    bucket, hour, dow, date, isLateNight,
  }
}

function finalizeBrowserHistory(visits: BrowserVisit[], meta: ParsedFile["meta"]): ParsedFile {
  visits.sort((a, b) => a.ts.localeCompare(b.ts))
  const totalCount = visits.length
  if (!totalCount) throw new Error("browser-history: no usable visits")

  const firstTs = visits[0].ts
  const lastTs = visits[visits.length - 1].ts
  const dateRange = `${firstTs.slice(0, 10)} → ${lastTs.slice(0, 10)}`
  const durLabel = durationLabel(firstTs.slice(0, 10), lastTs.slice(0, 10))

  // Domains.
  const domAgg: Record<string, { count: number; hosts: Set<string>; first: string; last: string; topics: Record<string, number>; sampleTitles: Array<{ title: string; ts: string; path: string; topic: string }> }> = {}
  for (const v of visits) {
    const d = v.domain || v.host || "(unknown)"
    if (!domAgg[d]) domAgg[d] = { count: 0, hosts: new Set(), first: v.ts, last: v.ts, topics: {}, sampleTitles: [] }
    const a = domAgg[d]
    a.count += 1
    a.hosts.add(v.host)
    if (v.ts < a.first) a.first = v.ts
    if (v.ts > a.last) a.last = v.ts
    a.topics[v.topic] = (a.topics[v.topic] || 0) + 1
    if (a.sampleTitles.length < 5) a.sampleTitles.push({ title: v.title, ts: v.ts, path: v.path, topic: v.topic })
  }
  const domains = Object.entries(domAgg)
    .map(([domain, a]) => ({
      domain,
      hosts: a.hosts.size,
      count: a.count,
      share: a.count / totalCount,
      first: a.first.slice(0, 10),
      last: a.last.slice(0, 10),
      topic: topKey(a.topics) || "other",
      sampleTitles: a.sampleTitles,
    }))
    .sort((a, b) => b.count - a.count)

  // Topics.
  const topicAgg: Record<string, { count: number; domains: Set<string> }> = {}
  for (const v of visits) {
    if (!topicAgg[v.topic]) topicAgg[v.topic] = { count: 0, domains: new Set() }
    topicAgg[v.topic].count += 1
    topicAgg[v.topic].domains.add(v.domain || v.host)
  }
  const topics = Object.entries(topicAgg)
    .map(([topic, a]) => ({
      topic,
      count: a.count,
      domains: a.domains.size,
      share: a.count / totalCount,
      bucket: BH_TOPIC_BUCKET[topic] || "other",
    }))
    .sort((a, b) => b.count - a.count)

  // Buckets.
  const bucketAgg: Record<string, number> = {}
  for (const v of visits) bucketAgg[v.bucket] = (bucketAgg[v.bucket] || 0) + 1
  const bucketTotals = (["work", "personal", "search", "other"] as const).map(b => ({
    bucket: b,
    count: bucketAgg[b] || 0,
    share: totalCount ? (bucketAgg[b] || 0) / totalCount : 0,
  }))

  // Time aggregates.
  const monthAgg: Record<string, { count: number; days: Set<string> }> = {}
  const weekAgg: Record<string, number> = {}
  const dayAgg: Record<string, number> = {}
  const hourCounts = new Array(24).fill(0)
  const dowCounts = new Array(7).fill(0)
  const heatmap = Array.from({ length: 7 }, () => new Array(24).fill(0))
  const weekdayHeatmap = Array.from({ length: 7 }, () => new Array(24).fill(0))
  const weekendHeatmap = Array.from({ length: 7 }, () => new Array(24).fill(0))
  for (const v of visits) {
    const month = v.date.slice(0, 7)
    if (!monthAgg[month]) monthAgg[month] = { count: 0, days: new Set() }
    monthAgg[month].count += 1
    monthAgg[month].days.add(v.date)
    const week = isoWeek(v.date)
    weekAgg[week] = (weekAgg[week] || 0) + 1
    dayAgg[v.date] = (dayAgg[v.date] || 0) + 1
    hourCounts[v.hour] += 1
    dowCounts[v.dow] += 1
    heatmap[v.dow][v.hour] += 1
    if (v.dow >= 1 && v.dow <= 5) weekdayHeatmap[v.dow][v.hour] += 1
    else weekendHeatmap[v.dow][v.hour] += 1
  }
  const monthTotals = Object.entries(monthAgg)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, a]) => ({ month, count: a.count, activeDays: a.days.size }))
  const weekTotals = Object.entries(weekAgg)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, count]) => ({ week, count }))

  // Returners — same URL visited 5+ times.
  const urlAgg: Record<string, { count: number; ids: string[]; first: string; last: string; title: string; domain: string }> = {}
  for (const v of visits) {
    const k = v.url
    if (!urlAgg[k]) urlAgg[k] = { count: 0, ids: [], first: v.ts, last: v.ts, title: v.title, domain: v.domain }
    urlAgg[k].count += 1
    urlAgg[k].ids.push(v.id)
    if (v.ts < urlAgg[k].first) urlAgg[k].first = v.ts
    if (v.ts > urlAgg[k].last) urlAgg[k].last = v.ts
    if (v.title && v.title.length > urlAgg[k].title.length) urlAgg[k].title = v.title
  }
  const returners = Object.entries(urlAgg)
    .filter(([, a]) => a.count >= 5)
    .map(([url, a]) => ({
      url,
      title: a.title,
      domain: a.domain,
      timesVisited: a.count,
      firstSeen: a.first.slice(0, 10),
      lastSeen: a.last.slice(0, 10),
      cadenceLabel: cadenceLabel(a.first.slice(0, 10), a.last.slice(0, 10), a.count),
      sampleIds: a.ids.slice(0, 6),
    }))
    .sort((a, b) => b.timesVisited - a.timesVisited)
    .slice(0, 10)

  // Sessions — ≥4 visits within 30-min gaps.
  const sessions = detectBrowserSessions(visits, 30)

  // Repeated searches — same search query 3+ times.
  const searchAgg: Record<string, { count: number; engine: string; lastSeen: string }> = {}
  for (const v of visits) {
    if (!v.isSearch || !v.searchQuery) continue
    const key = v.searchQuery.toLowerCase()
    if (bhShouldMaskQuery("q=" + v.searchQuery)) continue
    if (!searchAgg[key]) searchAgg[key] = { count: 0, engine: v.host, lastSeen: v.ts }
    searchAgg[key].count += 1
    if (v.ts > searchAgg[key].lastSeen) searchAgg[key].lastSeen = v.ts
  }
  const repeatedSearches = Object.entries(searchAgg)
    .filter(([, a]) => a.count >= 3)
    .map(([query, a]) => ({
      query, engine: a.engine, count: a.count, lastSeen: a.lastSeen.slice(0, 10),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // Counts.
  const lateNightCount = visits.filter(v => v.isLateNight).length
  const typedCount = visits.filter(v => v.isTyped).length
  const busiestDay = Object.entries(dayAgg).sort((a, b) => b[1] - a[1])[0] || null
  const busiestWeek = Object.entries(weekAgg).sort((a, b) => b[1] - a[1])[0] || null

  const summary = {
    totalCount,
    uniqueDomains: domains.length,
    uniqueUrls: Object.keys(urlAgg).length,
    dateRange,
    durationLabel: durLabel,
    activeDays: Object.keys(dayAgg).length,
    activeMonths: monthTotals.length,
    busiestDay: busiestDay ? { date: busiestDay[0], count: busiestDay[1] } : null,
    busiestWeek: busiestWeek ? { week: busiestWeek[0], count: busiestWeek[1] } : null,
    lateNightCount,
    lateNightShare: totalCount ? lateNightCount / totalCount : 0,
    typedCount,
    typedShare: totalCount ? typedCount / totalCount : 0,
    sessionCount: sessions.length,
    returnerCount: returners.length,
    repeatedSearchCount: repeatedSearches.length,
    topDomain: domains[0]?.domain || null,
    topDomainShare: domains[0]?.share || 0,
    topTopic: topics[0]?.topic || null,
    topTopicShare: topics[0]?.share || 0,
    workShare: totalCount ? (bucketAgg.work || 0) / totalCount : 0,
    personalShare: totalCount ? (bucketAgg.personal || 0) / totalCount : 0,
    searchShare: totalCount ? (bucketAgg.search || 0) / totalCount : 0,
  }

  const data = {
    format: "browser-history",
    rows: visits,
    summary,
    domains,
    topics,
    bucketTotals,
    monthTotals,
    weekTotals,
    hourCounts,
    dowCounts,
    heatmap,
    weekdayHeatmap,
    weekendHeatmap,
    returners,
    sessions,
    repeatedSearches,
    meta: { ...meta, shape: "browser-history" },
  }

  const sample = {
    summary,
    topDomains: domains.slice(0, 8),
    topics,
    bucketTotals,
    monthTotals,
    hourCounts,
    dowCounts,
    returners: returners.slice(0, 6),
    sessions: sessions.slice(0, 4),
    repeatedSearches: repeatedSearches.slice(0, 6),
    firstVisits: visits.slice(0, 6),
    lastVisits: visits.slice(-3),
  }

  const lateLabel = totalCount ? Math.round(summary.lateNightShare * 100) + "%" : "0%"
  const summaryLine =
    `Browser history — ${totalCount} visits across ${summary.uniqueDomains} domains (${dateRange}, ${durLabel}). ` +
    `Top domain: ${summary.topDomain || "—"}. Late-night share: ${lateLabel}.`

  return {
    contentType: "browser-history",
    summary: summaryLine,
    sample,
    data,
    meta: {
      ...meta,
      shape: "browser-history",
      totalCount,
      uniqueDomains: summary.uniqueDomains,
      uniqueUrls: summary.uniqueUrls,
      dateRange,
    },
  }
}

interface BrowserSession {
  start: string
  end: string
  durationMin: number
  count: number
  topDomain: string | null
  topTopic: string | null
  sampleTitles: string[]
  itemIds: string[]
  looksLikeResearch: boolean
}

function detectBrowserSessions(visits: BrowserVisit[], gapMinutes: number): BrowserSession[] {
  if (!visits.length) return []
  const sorted = [...visits].sort((a, b) => a.ts.localeCompare(b.ts))
  const gapMs = gapMinutes * 60_000
  const sessions: BrowserSession[] = []
  let cur: { start: number; end: number; ids: string[]; titles: string[]; domains: Record<string, number>; topics: Record<string, number>; hasSearch: boolean } | null = null
  for (const v of sorted) {
    const t = Date.parse(v.ts)
    if (!Number.isFinite(t)) continue
    if (cur && t - cur.end <= gapMs) {
      cur.end = t
      cur.ids.push(v.id)
      const d = v.domain || v.host || "(unknown)"
      cur.domains[d] = (cur.domains[d] || 0) + 1
      cur.topics[v.topic] = (cur.topics[v.topic] || 0) + 1
      if (cur.titles.length < 6) cur.titles.push(v.title)
      if (v.isSearch) cur.hasSearch = true
    } else {
      if (cur) sessions.push(finalizeBhSession(cur))
      cur = { start: t, end: t, ids: [v.id], titles: [v.title], domains: {}, topics: {}, hasSearch: v.isSearch }
      const d = v.domain || v.host || "(unknown)"
      cur.domains[d] = 1
      cur.topics[v.topic] = 1
    }
  }
  if (cur) sessions.push(finalizeBhSession(cur))
  // Only keep sessions with ≥4 visits.
  return sessions.filter(s => s.count >= 4).sort((a, b) => b.durationMin - a.durationMin)
}

function finalizeBhSession(s: { start: number; end: number; ids: string[]; titles: string[]; domains: Record<string, number>; topics: Record<string, number>; hasSearch: boolean }): BrowserSession {
  const topDom = Object.entries(s.domains).sort((a, b) => b[1] - a[1])[0]
  const topTopic = Object.entries(s.topics).sort((a, b) => b[1] - a[1])[0]
  const uniqueDomains = Object.keys(s.domains).length
  return {
    start: new Date(s.start).toISOString(),
    end: new Date(s.end).toISOString(),
    durationMin: Math.max(1, Math.round((s.end - s.start) / 60_000)),
    count: s.ids.length,
    topDomain: topDom ? topDom[0] : null,
    topTopic: topTopic ? topTopic[0] : null,
    sampleTitles: s.titles.slice(0, 6),
    itemIds: s.ids,
    looksLikeResearch: s.hasSearch && uniqueDomains >= 3,
  }
}

// ----------------------------------- shared utilities

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
