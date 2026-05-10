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
      if (ext === ".json") return looksLikeYoutube(head, base) || looksLikeSpotify(head, base)
      if (ext === ".csv") return looksLikeAmazon(head, base) || looksLikeTwitch(head, base) || looksLikeStars(head, base)
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
      if (looksLikeYoutube(raw.slice(0, 8192), base)) return parseYoutube(raw, meta)
      return parseSpotify(raw, meta)
    }
    if (ext === ".csv") {
      const firstLine = (raw.split(/\r?\n/, 1)[0] || "").toLowerCase()
      if (looksLikeAmazon(firstLine, base)) return parseAmazon(raw, meta)
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
