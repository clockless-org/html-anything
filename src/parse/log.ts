/**
 * Log parser — common server / web / application log formats.
 *
 * Detects one of:
 *   - access-log : Apache / Nginx Common (CLF) or Combined Log Format
 *                  `IP - - [date] "METHOD path HTTP/x" status size [...]`
 *   - syslog     : RFC 3164  `Mar 12 10:14:22 host app[pid]: msg`
 *   - error-log  : timestamped lines with explicit severity
 *                  `[2026-04-12 09:14:00] ERROR msg`  /  `2026-04-12T09:14:00Z ERROR msg`
 *   - app-log    : timestamped lines without an explicit severity (fallback)
 *
 * Multi-line stack traces and continuation lines (any non-timestamped
 * line) get folded into the parent event's `raw` field — the `message`
 * stays the parent's one-line summary so the table reads cleanly.
 *
 * The parser only normalizes — it does NOT classify decisions / actions
 * / true incidents. That's the LLM's job in the log prompt; trying to
 * regex it here would be fragile.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Parser, ParsedFile } from "../types.js"
import { aggregate, type RawEvent, formatEpoch, splitDateTime } from "./event-stream-shared.js"

type LogFormat = "access-log" | "error-log" | "syslog" | "app-log"

const CLF_RE = /^(\S+)\s+(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+"([A-Z]+)\s+(\S+)(?:\s+(\S+))?"\s+(\d{3})\s+(\S+)(?:\s+"([^"]*)"\s+"([^"]*)")?(?:\s+(\d+))?/
const SYSLOG_RE = /^(<\d+>)?(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+([\w./-]+?)(?:\[(\d+)\])?:\s*(.*)$/
const ISO_LINE_RE = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\s*(.*)$/
const BRACKET_LINE_RE = /^\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\]\s*(.*)$/
const SEVERITY_TOKEN_RE = /^(?:\[)?(FATAL|ERROR|ERR|CRIT|CRITICAL|ALERT|EMERG|WARN|WARNING|NOTICE|INFO|DEBUG|TRACE|VERBOSE)(?:\])?\b/i
const PRIVATE_IP_RE = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|127\.|fe80:|::1$)/i

export const parser: Parser = {
  name: "log",
  matches: [".log", ".txt"],
  async detect(filepath: string): Promise<boolean> {
    try {
      const fd = await fs.open(filepath, "r")
      const buf = Buffer.alloc(16 * 1024)
      const { bytesRead } = await fd.read(buf, 0, buf.length, 0)
      await fd.close()
      const sample = buf.subarray(0, bytesRead).toString("utf8").replace(/\r\n/g, "\n")
      const lines = sample.split("\n").map(l => l.trim()).filter(Boolean).slice(0, 50)
      if (lines.length < 3) return false
      // Refuse JSONL — let the jsonl parser handle it. Only count lines
      // that actually parse as JSON (a `[` prefix alone could be a
      // bracket-timestamp like `[2026-04-12 09:14:00]`, not JSONL).
      let jsonHits = 0
      for (const l of lines) {
        if (!l.startsWith("{") && !l.startsWith("[")) continue
        try { JSON.parse(l); jsonHits++ } catch { /* not jsonl-shaped */ }
      }
      if (jsonHits >= Math.floor(lines.length * 0.5)) return false
      let hits = 0
      for (const l of lines) {
        if (CLF_RE.test(l) || SYSLOG_RE.test(l) || ISO_LINE_RE.test(l) || BRACKET_LINE_RE.test(l)) hits++
      }
      return hits >= Math.max(3, Math.floor(lines.length * 0.6))
    } catch {
      return false
    }
  },
  async parse(filepath: string): Promise<ParsedFile> {
    const raw = await fs.readFile(filepath, "utf8")
    const rawLines = raw.split(/\r?\n/)
    const trimmedLines = rawLines.filter(l => l.trim().length > 0)

    const format = detectFormat(trimmedLines)

    const events: RawEvent[] = []
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i]
      if (!line.trim()) continue
      const ev = parseLine(line, format, events.length)
      if (ev) {
        events.push(ev)
      } else if (events.length > 0) {
        // Continuation / stack-trace line — fold into prior event's raw.
        const prev = events[events.length - 1]
        prev.raw = prev.raw + "\n" + line
      }
    }

    // Sort + reassign ids for clean drill-down indexing.
    events.sort((a, b) => a.tsEpoch - b.tsEpoch)
    events.forEach((e, i) => { e.id = `e_${String(i + 1).padStart(6, "0")}` })

    const agg = aggregate(events)

    // For access logs, fold a 4xx / 5xx top-error rollup into the
    // outliers panel even when the source has no explicit severity.
    if (format === "access-log") {
      const statusMap = new Map<string, number>()
      for (const e of events) {
        const status = e.fields?.status as string | number | undefined
        if (status === undefined) continue
        const code = String(status)
        const cls = code[0]
        if (cls === "4" || cls === "5") statusMap.set(code, (statusMap.get(code) || 0) + 1)
      }
      const errors = Array.from(statusMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3)
      for (const [code, count] of errors) {
        agg.outliers.push({
          kind: "top-error",
          label: `HTTP ${code}`,
          detail: `${count}× across the stream`,
          ts: null,
        })
      }
      // Promote 5xx counts into severityCounts so the severity panel
      // has something to show on a pure access log.
      let serverErrors = 0, clientErrors = 0
      for (const e of events) {
        const status = e.fields?.status as string | number | undefined
        if (status === undefined) continue
        const cls = String(status)[0]
        if (cls === "5") serverErrors++
        else if (cls === "4") clientErrors++
      }
      if (serverErrors > 0) agg.severityCounts.error += serverErrors
      if (clientErrors > 0) agg.severityCounts.warn += clientErrors
      // Recompute error rate so the headline reflects 5xx as errors.
      const totalEvents = events.length || 1
      agg.errorCount = agg.severityCounts.error
      agg.errorRate = Math.round((agg.errorCount / totalEvents) * 10000) / 100
    }

    const meta = {
      sourceFile: path.basename(filepath),
      sizeBytes: Buffer.byteLength(raw, "utf8"),
      format,
      eventCount: events.length,
      errorCount: agg.errorCount,
      errorRate: agg.errorRate,
      timeRange: agg.timeRange,
      durationLabel: agg.durationLabel,
      bucketSize: agg.bucketSize,
      sourceCount: agg.sourceCount,
    }

    const accessExtras = format === "access-log" ? buildAccessExtras(events) : null

    const sample = {
      ...meta,
      severityCounts: agg.severityCounts,
      topCategories: agg.categoryCounts.slice(0, 10),
      topMessages: agg.topMessages.slice(0, 8),
      topSources: agg.topSources.slice(0, 8),
      topErrors: agg.topErrors.slice(0, 6),
      outliers: agg.outliers,
      accessExtras,
      first: events.slice(0, 12).map(stripBigEvent),
      last: events.slice(-4).map(stripBigEvent),
    }

    return {
      contentType: "log-events",
      summary:
        `${labelFormat(format)}: ${events.length} events` +
        (agg.errorCount > 0 ? ` (${agg.errorCount} errors, ${agg.errorRate}% error rate)` : "") +
        `, ${agg.timeRange}.`,
      sample,
      data: { events, ...agg, accessExtras, ...meta },
      meta,
    }
  },
}

// ---------------------------------------------------------------------------
// Format detection (priority: access > syslog > error/app)
// ---------------------------------------------------------------------------

function detectFormat(lines: string[]): LogFormat {
  const head = lines.slice(0, 30)
  const counts = { clf: 0, syslog: 0, errored: 0, iso: 0 }
  for (const l of head) {
    if (CLF_RE.test(l)) counts.clf++
    else if (SYSLOG_RE.test(l)) counts.syslog++
    else if (BRACKET_LINE_RE.test(l) || ISO_LINE_RE.test(l)) {
      counts.iso++
      const m = BRACKET_LINE_RE.exec(l) || ISO_LINE_RE.exec(l)
      if (m && SEVERITY_TOKEN_RE.test((m[2] || "").trim())) counts.errored++
    }
  }
  const best = Math.max(counts.clf, counts.syslog, counts.iso)
  if (best === 0) return "app-log"
  if (counts.clf === best) return "access-log"
  if (counts.syslog === best) return "syslog"
  if (counts.errored >= Math.floor(counts.iso * 0.4)) return "error-log"
  return "app-log"
}

function labelFormat(f: LogFormat): string {
  if (f === "access-log") return "Web access log"
  if (f === "error-log") return "Error log"
  if (f === "syslog") return "Syslog"
  return "Application log"
}

// ---------------------------------------------------------------------------
// Per-line parsing
// ---------------------------------------------------------------------------

function parseLine(rawLine: string, format: LogFormat, idx: number): RawEvent | null {
  const line = rawLine.trim()
  if (format === "access-log" || CLF_RE.test(line)) {
    const ev = parseAccessLine(line, idx)
    if (ev) return ev
  }
  if (format === "syslog" || SYSLOG_RE.test(line)) {
    const ev = parseSyslogLine(line, idx)
    if (ev) return ev
  }
  if (BRACKET_LINE_RE.test(line) || ISO_LINE_RE.test(line)) {
    return parseTimestampedLine(line, idx)
  }
  return null
}

function parseAccessLine(line: string, idx: number): RawEvent | null {
  const m = CLF_RE.exec(line)
  if (!m) return null
  const ip = m[1]
  const dateStr = m[4]
  const method = m[5]
  const path = m[6]
  const protocol = m[7] || ""
  const status = parseInt(m[8], 10)
  const sizeStr = m[9]
  const referrer = m[10] || ""
  const userAgent = m[11] || ""
  const durationStr = m[12] || ""
  const epoch = parseAccessDate(dateStr)
  const ts = epoch ? formatEpoch(epoch) : ""
  const { date, time } = splitDateTime(ts)
  const cls = String(status)[0]
  const severity = cls === "5" ? "error" : cls === "4" ? "warn" : "info"
  const fields: Record<string, unknown> = {
    ip,
    method,
    path,
    protocol,
    status,
    bytes: sizeStr === "-" ? 0 : parseInt(sizeStr, 10) || 0,
  }
  if (referrer) fields.referrer = referrer
  if (userAgent) fields.user_agent = userAgent
  if (durationStr) fields.duration_ms = parseInt(durationStr, 10) || 0
  return {
    id: `e_${String(idx + 1).padStart(6, "0")}`,
    ts, date, time, tsEpoch: epoch || 0,
    severity,
    category: `${method} ${cls}xx`,
    source: ip,
    message: `${method} ${path} → ${status}`,
    fields,
    raw: line,
  }
}

function parseAccessDate(s: string): number | null {
  // CLF date: `12/Apr/2026:09:14:23 +0000` or `12/Apr/2026:09:14:23`.
  const m = /^(\d{1,2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})(?:\s*([+-]\d{4}))?$/.exec(s)
  if (!m) return Date.parse(s) || null
  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  }
  const month = months[m[2]]
  if (month === undefined) return null
  const tz = m[7] || "+0000"
  const tzSign = tz.startsWith("-") ? -1 : 1
  const tzH = parseInt(tz.slice(1, 3), 10) || 0
  const tzM = parseInt(tz.slice(3, 5), 10) || 0
  const tzOffset = tzSign * (tzH * 60 + tzM) * 60_000
  const utc = Date.UTC(parseInt(m[3], 10), month, parseInt(m[1], 10), parseInt(m[4], 10), parseInt(m[5], 10), parseInt(m[6], 10))
  return utc - tzOffset
}

function parseSyslogLine(line: string, idx: number): RawEvent | null {
  const m = SYSLOG_RE.exec(line)
  if (!m) return null
  const tsStr = m[2]
  const host = m[3]
  const app = m[4]
  const message = (m[6] || "").trim()
  const epoch = parseSyslogDate(tsStr)
  const ts = epoch ? formatEpoch(epoch) : ""
  const { date, time } = splitDateTime(ts)
  // Syslog RFC3164 doesn't carry severity in the visible part — pull
  // from a leading bracketed token if the app shoved one in.
  const sev = matchSeverityToken(message)
  return {
    id: `e_${String(idx + 1).padStart(6, "0")}`,
    ts, date, time, tsEpoch: epoch || 0,
    severity: sev,
    category: app,
    source: host,
    message: stripSeverityToken(message),
    fields: { app, host, pid: m[5] ? parseInt(m[5], 10) : undefined },
    raw: line,
  }
}

function parseSyslogDate(s: string): number | null {
  // RFC 3164 lacks a year. Assume the most recent valid year that puts
  // the date in the past.
  const m = /^(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  }
  const month = months[m[1]]
  if (month === undefined) return null
  const now = new Date()
  let year = now.getUTCFullYear()
  const candidate = Date.UTC(year, month, parseInt(m[2], 10), parseInt(m[3], 10), parseInt(m[4], 10), parseInt(m[5], 10))
  if (candidate > now.getTime() + 24 * 3600 * 1000) year -= 1
  return Date.UTC(year, month, parseInt(m[2], 10), parseInt(m[3], 10), parseInt(m[4], 10), parseInt(m[5], 10))
}

function parseTimestampedLine(line: string, idx: number): RawEvent {
  const bracket = BRACKET_LINE_RE.exec(line)
  const iso = bracket ? null : ISO_LINE_RE.exec(line)
  const m = bracket || iso
  if (!m) {
    return {
      id: `e_${String(idx + 1).padStart(6, "0")}`,
      ts: "", date: "", time: "", tsEpoch: 0,
      severity: null, category: null, source: null,
      message: line, raw: line,
    }
  }
  const tsStr = m[1]
  const rest = (m[2] || "").trim()
  const epoch = Date.parse(tsStr.replace(",", ".")) || null
  const ts = epoch ? formatEpoch(epoch) : ""
  const { date, time } = splitDateTime(ts)
  // Look for `LEVEL` / `[LEVEL]` token at the start of `rest`.
  const sev = matchSeverityToken(rest)
  let after = stripSeverityToken(rest)
  // Optional `[logger]` next.
  let category: string | null = null
  const cm = /^\[([^\]]{1,80})\]\s*(.*)$/.exec(after)
  if (cm) { category = cm[1]; after = cm[2] }
  return {
    id: `e_${String(idx + 1).padStart(6, "0")}`,
    ts, date, time, tsEpoch: epoch || 0,
    severity: sev,
    category,
    source: null,
    message: after || rest,
    raw: line,
  }
}

function matchSeverityToken(s: string): string | null {
  const m = SEVERITY_TOKEN_RE.exec(s.trim())
  if (!m) return null
  const t = m[1].toLowerCase()
  if (t === "fatal" || t === "crit" || t === "critical" || t === "alert" || t === "emerg" || t === "err" || t === "error") return "error"
  if (t === "warn" || t === "warning") return "warn"
  if (t === "notice" || t === "info") return "info"
  if (t === "debug") return "debug"
  if (t === "trace" || t === "verbose") return "trace"
  return t
}

function stripSeverityToken(s: string): string {
  return s.replace(/^(?:\[)?(?:FATAL|ERROR|ERR|CRIT|CRITICAL|ALERT|EMERG|WARN|WARNING|NOTICE|INFO|DEBUG|TRACE|VERBOSE)(?:\])?\s*[-:|]?\s*/i, "").trim()
}

// ---------------------------------------------------------------------------
// Access-log extras (status donut, top endpoints, latency, etc.)
// ---------------------------------------------------------------------------

interface AccessExtras {
  statusClasses: { class: "2xx" | "3xx" | "4xx" | "5xx"; count: number; share: number }[]
  topEndpoints: { path: string; count: number; share: number; errorRate: number }[]
  topIps: { ip: string; count: number; share: number; isPrivate: boolean }[]
  topUserAgents: { userAgent: string; count: number; share: number }[]
  latency: { p50: number; p95: number; p99: number; max: number; sampleCount: number } | null
}

function buildAccessExtras(events: RawEvent[]): AccessExtras {
  const total = events.length || 1
  const statusMap = new Map<"2xx" | "3xx" | "4xx" | "5xx", number>()
  const pathMap = new Map<string, { count: number; errors: number }>()
  const ipMap = new Map<string, number>()
  const uaMap = new Map<string, number>()
  const durations: number[] = []
  for (const e of events) {
    const status = (e.fields?.status as number | undefined) || 0
    const cls = (`${Math.floor(status / 100)}xx`) as "2xx" | "3xx" | "4xx" | "5xx"
    if (status >= 100 && status < 600) statusMap.set(cls, (statusMap.get(cls) || 0) + 1)
    const path = (e.fields?.path as string | undefined) || ""
    if (path) {
      const cur = pathMap.get(normalizePath(path)) || { count: 0, errors: 0 }
      cur.count++
      if (status >= 400) cur.errors++
      pathMap.set(normalizePath(path), cur)
    }
    const ip = (e.fields?.ip as string | undefined) || ""
    if (ip) ipMap.set(ip, (ipMap.get(ip) || 0) + 1)
    const ua = (e.fields?.user_agent as string | undefined) || ""
    if (ua) uaMap.set(ua, (uaMap.get(ua) || 0) + 1)
    const dur = e.fields?.duration_ms as number | undefined
    if (typeof dur === "number" && isFinite(dur) && dur >= 0) durations.push(dur)
  }
  return {
    statusClasses: Array.from(statusMap.entries())
      .map(([cls, count]) => ({ class: cls, count, share: round1((count / total) * 100) }))
      .sort((a, b) => a.class.localeCompare(b.class)),
    topEndpoints: Array.from(pathMap.entries())
      .map(([path, v]) => ({
        path,
        count: v.count,
        share: round1((v.count / total) * 100),
        errorRate: round1((v.errors / v.count) * 100),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15),
    topIps: Array.from(ipMap.entries())
      .map(([ip, count]) => ({
        ip,
        count,
        share: round1((count / total) * 100),
        isPrivate: PRIVATE_IP_RE.test(ip),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15),
    topUserAgents: Array.from(uaMap.entries())
      .map(([userAgent, count]) => ({ userAgent, count, share: round1((count / total) * 100) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    latency: durations.length >= 5 ? buildLatency(durations) : null,
  }
}

function buildLatency(values: number[]): { p50: number; p95: number; p99: number; max: number; sampleCount: number } {
  const sorted = values.slice().sort((a, b) => a - b)
  const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]
  return {
    p50: pick(0.5),
    p95: pick(0.95),
    p99: pick(0.99),
    max: sorted[sorted.length - 1],
    sampleCount: sorted.length,
  }
}

function normalizePath(p: string): string {
  // Collapse numeric / hex IDs in URL segments so "/users/42" and
  // "/users/57" both bucket as "/users/<id>". Keeps the leaderboard
  // useful when every request has a unique resource id.
  return p
    .split("?")[0]
    .split("/")
    .map(seg => /^[0-9a-f]{8,}$/i.test(seg) || /^\d+$/.test(seg) ? "<id>" : seg)
    .join("/")
}

function stripBigEvent(e: RawEvent): RawEvent {
  return {
    ...e,
    raw: e.raw.length > 400 ? e.raw.slice(0, 400) + "…" : e.raw,
    message: e.message.length > 240 ? e.message.slice(0, 240) + "…" : e.message,
  }
}

function round1(n: number): number { return Math.round(n * 10) / 10 }
