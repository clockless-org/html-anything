/**
 * Shared aggregation for the event-stream pack (JSONL/NDJSON parser
 * and the log parser). Both produce the same `DATA` shape — see
 * prompts/sources/_event_stream.md for the contract — so the bucketing,
 * severity/category counts, top-N rollups, and outlier classification
 * live here once.
 *
 * The parsers' job is to turn lines into `RawEvent[]`. This module
 * turns that array into the aggregated arrays the LLM and the rendered
 * page consume.
 */

export interface RawEvent {
  id: string
  ts: string                          // "YYYY-MM-DD HH:MM:SS" (UTC) or empty
  date: string
  time: string
  tsEpoch: number                     // 0 if no timestamp parsed
  severity: string | null             // "error" | "warn" | "info" | "debug" | "trace" | null
  category: string | null             // free-form: event type, http "GET 200", etc.
  source: string | null               // ip, host, service, logger
  message: string                     // human-readable summary
  fields?: Record<string, unknown>    // structured fields (jsonl) or extracted (log)
  raw: string                         // original line, for drill-down
}

export interface TimeBucket { bucket: string; label: string; count: number; errorCount: number }
export interface CategoryCount { category: string; count: number; share: number }
export interface SeverityCounts { error: number; warn: number; info: number; debug: number; trace: number; other: number }
export interface TopMessage { message: string; count: number; share: number }
export interface TopSource { source: string; count: number; share: number }
export interface TopError { message: string; count: number; firstTs: string; lastTs: string }
export interface Outlier {
  kind: "burst" | "slow" | "rare" | "top-error" | "top-source" | "schema"
  label: string
  detail: string
  ts: string | null
}

export type BucketSize = "1m" | "5m" | "15m" | "1h" | "1d"

export interface Aggregated {
  timeBuckets: TimeBucket[]
  severityCounts: SeverityCounts
  categoryCounts: CategoryCount[]
  topMessages: TopMessage[]
  topSources: TopSource[]
  topErrors: TopError[]
  outliers: Outlier[]
  timeRange: string
  durationLabel: string
  errorCount: number
  errorRate: number                  // percent
  bucketSize: BucketSize
  sourceCount: number
}

const ERROR_SEVERITIES = new Set(["error", "fatal", "crit", "critical", "alert", "emerg", "panic"])

export function aggregate(events: RawEvent[]): Aggregated {
  const total = events.length || 1
  const tsValues = events.filter(e => e.tsEpoch > 0).map(e => e.tsEpoch)
  const minTs = tsValues.length ? Math.min(...tsValues) : 0
  const maxTs = tsValues.length ? Math.max(...tsValues) : 0
  const durationMs = maxTs - minTs

  const bucketSize = pickBucketSize(durationMs)
  const timeBuckets = buildTimeBuckets(events, bucketSize, minTs, maxTs)

  const severityCounts: SeverityCounts = { error: 0, warn: 0, info: 0, debug: 0, trace: 0, other: 0 }
  const categoryMap = new Map<string, number>()
  const sourceMap = new Map<string, number>()
  const messageMap = new Map<string, { count: number; firstTs: string; lastTs: string }>()
  const errorMessageMap = new Map<string, { count: number; firstTs: string; lastTs: string }>()
  let errorCount = 0

  for (const e of events) {
    const sev = (e.severity || "").toLowerCase()
    if (sev === "error" || ERROR_SEVERITIES.has(sev)) {
      severityCounts.error++
      errorCount++
      const norm = normalizeMessage(e.message)
      const cur = errorMessageMap.get(norm) || { count: 0, firstTs: e.ts, lastTs: e.ts }
      cur.count++
      if (!cur.firstTs || (e.ts && e.ts < cur.firstTs)) cur.firstTs = e.ts
      if (!cur.lastTs || (e.ts && e.ts > cur.lastTs)) cur.lastTs = e.ts
      errorMessageMap.set(norm, cur)
    } else if (sev === "warn" || sev === "warning") severityCounts.warn++
    else if (sev === "info" || sev === "notice") severityCounts.info++
    else if (sev === "debug") severityCounts.debug++
    else if (sev === "trace" || sev === "verbose") severityCounts.trace++
    else severityCounts.other++

    if (e.category) categoryMap.set(e.category, (categoryMap.get(e.category) || 0) + 1)
    if (e.source) sourceMap.set(e.source, (sourceMap.get(e.source) || 0) + 1)

    const norm = normalizeMessage(e.message)
    if (norm) {
      const cur = messageMap.get(norm) || { count: 0, firstTs: e.ts, lastTs: e.ts }
      cur.count++
      if (!cur.firstTs || (e.ts && e.ts < cur.firstTs)) cur.firstTs = e.ts
      if (!cur.lastTs || (e.ts && e.ts > cur.lastTs)) cur.lastTs = e.ts
      messageMap.set(norm, cur)
    }
  }

  const categoryCounts: CategoryCount[] = Array.from(categoryMap.entries())
    .map(([category, count]) => ({ category, count, share: round1((count / total) * 100) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30)

  const topSources: TopSource[] = Array.from(sourceMap.entries())
    .map(([source, count]) => ({ source, count, share: round1((count / total) * 100) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25)

  const topMessages: TopMessage[] = Array.from(messageMap.entries())
    .map(([message, { count }]) => ({ message, count, share: round1((count / total) * 100) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25)

  const topErrors: TopError[] = Array.from(errorMessageMap.entries())
    .map(([message, v]) => ({ message, count: v.count, firstTs: v.firstTs, lastTs: v.lastTs }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)

  const outliers = buildOutliers({
    timeBuckets,
    topMessages,
    topSources,
    topErrors,
    eventCount: events.length,
    severityCounts,
  })

  return {
    timeBuckets,
    severityCounts,
    categoryCounts,
    topMessages,
    topSources,
    topErrors,
    outliers,
    timeRange: minTs && maxTs ? `${formatEpoch(minTs)} → ${formatEpoch(maxTs)}` : "(no timestamps)",
    durationLabel: formatDuration(durationMs),
    errorCount,
    errorRate: round2((errorCount / total) * 100),
    bucketSize,
    sourceCount: sourceMap.size,
  }
}

// ---------------------------------------------------------------------------
// Time bucketing
// ---------------------------------------------------------------------------

function pickBucketSize(durationMs: number): BucketSize {
  if (durationMs <= 0) return "1m"
  const minutes = durationMs / 60000
  if (minutes <= 90) return "1m"
  if (minutes <= 360) return "5m"
  if (minutes <= 24 * 60) return "15m"
  if (minutes <= 14 * 24 * 60) return "1h"
  return "1d"
}

function bucketSizeMs(size: BucketSize): number {
  switch (size) {
    case "1m": return 60_000
    case "5m": return 5 * 60_000
    case "15m": return 15 * 60_000
    case "1h": return 60 * 60_000
    case "1d": return 24 * 60 * 60_000
  }
}

function buildTimeBuckets(events: RawEvent[], size: BucketSize, minTs: number, maxTs: number): TimeBucket[] {
  if (!minTs || !maxTs || minTs === maxTs) return []
  const ms = bucketSizeMs(size)
  const start = Math.floor(minTs / ms) * ms
  const end = Math.ceil(maxTs / ms) * ms
  const map = new Map<number, { count: number; errorCount: number }>()
  for (let t = start; t <= end; t += ms) map.set(t, { count: 0, errorCount: 0 })
  for (const e of events) {
    if (!e.tsEpoch) continue
    const slot = Math.floor(e.tsEpoch / ms) * ms
    const cur = map.get(slot) || { count: 0, errorCount: 0 }
    cur.count++
    if (isErrorSeverity(e.severity)) cur.errorCount++
    map.set(slot, cur)
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([t, v]) => ({
      bucket: formatBucket(t, size),
      label: formatBucketLabel(t, size),
      count: v.count,
      errorCount: v.errorCount,
    }))
}

function formatBucket(epoch: number, size: BucketSize): string {
  const d = new Date(epoch)
  const pad = (n: number) => String(n).padStart(2, "0")
  const Y = d.getUTCFullYear(), M = pad(d.getUTCMonth() + 1), D = pad(d.getUTCDate())
  const h = pad(d.getUTCHours()), m = pad(d.getUTCMinutes())
  if (size === "1d") return `${Y}-${M}-${D}`
  if (size === "1h") return `${Y}-${M}-${D}T${h}`
  return `${Y}-${M}-${D}T${h}:${m}`
}

function formatBucketLabel(epoch: number, size: BucketSize): string {
  const d = new Date(epoch)
  const pad = (n: number) => String(n).padStart(2, "0")
  if (size === "1d") return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  if (size === "1h") return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00`
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

// ---------------------------------------------------------------------------
// Outlier classification
// ---------------------------------------------------------------------------

interface OutlierInputs {
  timeBuckets: TimeBucket[]
  topMessages: TopMessage[]
  topSources: TopSource[]
  topErrors: TopError[]
  eventCount: number
  severityCounts: SeverityCounts
}

function buildOutliers(inp: OutlierInputs): Outlier[] {
  const out: Outlier[] = []

  // Burst: top 1% of buckets by count, up to 3.
  if (inp.timeBuckets.length > 5) {
    const sorted = inp.timeBuckets.slice().sort((a, b) => b.count - a.count)
    const median = sorted[Math.floor(sorted.length / 2)].count || 1
    const cutoff = Math.max(median * 5, sorted[Math.max(0, Math.floor(sorted.length * 0.01))]?.count || 0)
    for (const b of sorted.slice(0, 3)) {
      if (b.count >= cutoff && b.count >= 5) {
        out.push({
          kind: "burst",
          label: `Volume spike at ${b.label}`,
          detail: `${b.count} events vs median ${median}`,
          ts: b.bucket,
        })
      }
    }
    // Error bursts: top 1% by errorCount.
    const errorSorted = inp.timeBuckets.slice().sort((a, b) => b.errorCount - a.errorCount)
    const topError = errorSorted[0]
    if (topError && topError.errorCount >= 5) {
      out.push({
        kind: "burst",
        label: `Error spike at ${topError.label}`,
        detail: `${topError.errorCount} errors in one bucket`,
        ts: topError.bucket,
      })
    }
  }

  // Top errors as outlier cards.
  for (const e of inp.topErrors.slice(0, 3)) {
    out.push({
      kind: "top-error",
      label: truncate(e.message, 80),
      detail: `${e.count}× from ${e.firstTs || "?"} to ${e.lastTs || "?"}`,
      ts: e.firstTs || null,
    })
  }

  // Dominant source (potential abuse signal).
  if (inp.topSources[0] && inp.topSources[0].share >= 5 && inp.eventCount >= 100) {
    const s = inp.topSources[0]
    out.push({
      kind: "top-source",
      label: `Dominant source: ${s.source}`,
      detail: `${s.count} events (${s.share}% of all)`,
      ts: null,
    })
  }

  // Rare: a top-message tail entry that only appears once or twice in a
  // large stream. Surface up to 2.
  const rare = inp.topMessages.filter(m => m.count <= 2 && inp.eventCount >= 200).slice(0, 2)
  for (const r of rare) {
    out.push({
      kind: "rare",
      label: `Rare event: ${truncate(r.message, 60)}`,
      detail: `${r.count}× in ${inp.eventCount} events`,
      ts: null,
    })
  }

  return out.slice(0, 8)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isErrorSeverity(sev: string | null): boolean {
  if (!sev) return false
  return sev === "error" || ERROR_SEVERITIES.has(sev.toLowerCase())
}

export function normalizeMessage(msg: string): string {
  // Replace IDs / hex hashes / numbers / quoted args so messages with
  // the same shape collapse into one bucket. Keeps the leaderboard
  // useful when every line has a unique request_id.
  return (msg || "")
    .replace(/[0-9a-f]{8,}/gi, "<id>")
    .replace(/\b\d+\.\d+\.\d+\.\d+\b/g, "<ip>")
    .replace(/"[^"]{1,80}"/g, '"<str>"')
    .replace(/'[^']{1,80}'/g, "'<str>'")
    .replace(/\b\d{4,}\b/g, "<num>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240)
}

export function formatEpoch(epoch: number): string {
  if (!epoch) return ""
  const d = new Date(epoch)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return "instant"
  const total = Math.floor(ms / 1000)
  const days = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (days > 0) return `${days}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${total}s`
}

export function splitDateTime(ts: string): { date: string; time: string } {
  if (!ts || ts.length < 19) return { date: ts.slice(0, 10), time: ts.slice(11) }
  return { date: ts.slice(0, 10), time: ts.slice(11) }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s
}

function round1(n: number): number { return Math.round(n * 10) / 10 }
function round2(n: number): number { return Math.round(n * 100) / 100 }
