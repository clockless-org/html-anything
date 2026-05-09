/**
 * JSONL / NDJSON parser — line-delimited JSON. Each line is one
 * structured event. The parser:
 *
 *   1. Reads the file and parses every non-blank line as JSON.
 *   2. For each record, hunts for a timestamp / severity / category /
 *      message / source field using a fixed list of common synonyms so
 *      heterogeneous streams (Pino, Bunyan, Loki, Fluentd, custom
 *      app-event lines, audit logs, ML traces) all funnel into the same
 *      `RawEvent` shape.
 *   3. Walks the first ~200 records to infer a schema (field name,
 *      type, fill rate, example values).
 *   4. Hands the events to the shared event-stream aggregator
 *      (timeBuckets / topMessages / topErrors / outliers / etc.).
 *
 * Detection triggers on `.jsonl` / `.ndjson` (always), and on
 * `.json` / `.log` / `.txt` when ≥80% of the first 50 non-blank lines
 * parse as JSON objects. That last case lets a `.json` file dressed
 * up as an array-of-objects fall through to the existing json parser
 * — only true line-delimited streams are claimed here.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Parser, ParsedFile } from "../types.js"
import { aggregate, type RawEvent, formatEpoch, splitDateTime } from "./event-stream-shared.js"

interface SchemaField {
  field: string
  type: string                  // "string" | "number" | "boolean" | "object" | "array" | "null" | "mixed"
  fillPct: number               // share of records (0..100) where the field is non-null
  examples: string[]            // up to 3 distinct example values, stringified + truncated
}

const TS_KEYS = ["ts", "time", "timestamp", "@timestamp", "datetime", "date", "_time", "eventTime", "event_time", "created_at", "createdAt", "logged_at"]
const SEVERITY_KEYS = ["severity", "level", "lvl", "log_level", "logLevel", "loglevel"]
const MESSAGE_KEYS = ["msg", "message", "text", "log", "body", "summary", "description", "event", "action"]
const CATEGORY_KEYS = ["category", "type", "kind", "channel", "logger", "name", "tag", "event_type", "eventType", "event_name", "topic"]
const SOURCE_KEYS = ["source", "host", "hostname", "server", "service", "app", "application", "origin", "ip", "client_ip", "remote_addr"]

export const parser: Parser = {
  name: "jsonl",
  matches: [".jsonl", ".ndjson", ".json", ".log", ".txt"],
  async detect(filepath: string): Promise<boolean> {
    const ext = path.extname(filepath).toLowerCase()
    if (ext === ".jsonl" || ext === ".ndjson") return true
    // For .json / .log / .txt: only claim when the file is line-delimited
    // JSON, not a single JSON document or plain text.
    try {
      const fd = await fs.open(filepath, "r")
      const buf = Buffer.alloc(16 * 1024)
      const { bytesRead } = await fd.read(buf, 0, buf.length, 0)
      await fd.close()
      const sample = buf.subarray(0, bytesRead).toString("utf8").replace(/\r\n/g, "\n")
      const lines = sample.split("\n").map(l => l.trim()).filter(Boolean).slice(0, 50)
      if (lines.length < 3) return false
      // A whole-file array of objects starts with "[" — that's the json
      // parser's job, not jsonl.
      if (lines[0].startsWith("[")) return false
      if (lines[0].startsWith("{") && lines.length === 1) return false
      let hits = 0
      for (const l of lines) {
        if (!l.startsWith("{") && !l.startsWith("[")) continue
        try { JSON.parse(l); hits++ } catch { /* not jsonl-shaped */ }
      }
      return hits >= Math.max(3, Math.floor(lines.length * 0.8))
    } catch {
      return false
    }
  },
  async parse(filepath: string): Promise<ParsedFile> {
    const raw = await fs.readFile(filepath, "utf8")
    const lines = raw.split(/\r?\n/)

    const records: { line: number; record: Record<string, unknown>; raw: string }[] = []
    let parseErrors = 0
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      try {
        const parsed = JSON.parse(line)
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          records.push({ line: i + 1, record: parsed as Record<string, unknown>, raw: line })
        } else {
          // Wrap arrays / scalars under a synthetic envelope so they
          // still flow through the pipeline.
          records.push({
            line: i + 1,
            record: { value: parsed } as Record<string, unknown>,
            raw: line,
          })
        }
      } catch {
        parseErrors++
      }
    }

    const events: RawEvent[] = records.map((r, i) => buildEvent(r.record, r.raw, i))
    events.sort((a, b) => a.tsEpoch - b.tsEpoch)
    events.forEach((e, i) => { e.id = `e_${String(i + 1).padStart(6, "0")}` })

    const schema = inferSchema(records.map(r => r.record))
    const agg = aggregate(events)

    // Add schema-quality outliers: any inferred field that's present in
    // a small minority (e.g. < 25%) of records is a candidate "this
    // field is rare" callout. Up to 2.
    if (events.length >= 50) {
      const sparse = schema.filter(s => s.fillPct > 0 && s.fillPct < 25).slice(0, 2)
      for (const s of sparse) {
        agg.outliers.push({
          kind: "schema",
          label: `Field \`${s.field}\` is sparse`,
          detail: `Present in ${s.fillPct}% of events (${s.type})`,
          ts: null,
        })
      }
    }

    const ext = path.extname(filepath).toLowerCase()
    const format = ext === ".ndjson" ? "ndjson" : "jsonl"

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
      schemaFields: schema.length,
      parseErrors,
    }

    const sample = {
      ...meta,
      schema: schema.slice(0, 25),
      severityCounts: agg.severityCounts,
      topCategories: agg.categoryCounts.slice(0, 10),
      topMessages: agg.topMessages.slice(0, 8),
      topSources: agg.topSources.slice(0, 8),
      topErrors: agg.topErrors.slice(0, 6),
      outliers: agg.outliers,
      first: events.slice(0, 12).map(stripBigEvent),
      last: events.slice(-4).map(stripBigEvent),
    }

    return {
      contentType: "jsonl-events",
      summary:
        `JSONL/NDJSON event stream: ${events.length} events` +
        (agg.errorCount > 0 ? ` (${agg.errorCount} errors, ${agg.errorRate}% error rate)` : "") +
        `, ${agg.timeRange}, ${schema.length} inferred fields.`,
      sample,
      data: { events, schema, ...agg, ...meta },
      meta,
    }
  },
}

// ---------------------------------------------------------------------------
// Per-record extraction
// ---------------------------------------------------------------------------

function buildEvent(rec: Record<string, unknown>, rawLine: string, idx: number): RawEvent {
  const tsRaw = pickFirst(rec, TS_KEYS)
  const epoch = parseTimestamp(tsRaw)
  const ts = epoch ? formatEpoch(epoch) : ""
  const { date, time } = splitDateTime(ts)

  const severity = normalizeSeverity(pickFirst(rec, SEVERITY_KEYS))
  const message = stringValue(pickFirst(rec, MESSAGE_KEYS)) || ""
  const category = stringValue(pickFirst(rec, CATEGORY_KEYS)) || null
  const source = stringValue(pickFirst(rec, SOURCE_KEYS)) || null

  return {
    id: `e_${String(idx + 1).padStart(6, "0")}`,
    ts,
    date,
    time,
    tsEpoch: epoch || 0,
    severity,
    category,
    source,
    message: message || compactRecord(rec),
    fields: rec,
    raw: rawLine,
  }
}

function pickFirst(rec: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const k of keys) {
    if (rec[k] !== undefined && rec[k] !== null) return rec[k]
    // Try lowercase variant too.
    const lk = k.toLowerCase()
    if (lk !== k && rec[lk] !== undefined && rec[lk] !== null) return rec[lk]
  }
  return undefined
}

function stringValue(v: unknown): string {
  if (v === undefined || v === null) return ""
  if (typeof v === "string") return v
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  try { return JSON.stringify(v) } catch { return String(v) }
}

function normalizeSeverity(v: unknown): string | null {
  if (v === undefined || v === null) return null
  const s = String(v).trim().toLowerCase()
  if (!s) return null
  // Numeric syslog priority: 0=emerg..7=debug.
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10)
    if (n <= 1) return "error"           // emerg/alert/crit
    if (n <= 3) return "error"           // err
    if (n === 4) return "warn"
    if (n === 5) return "info"           // notice
    if (n === 6) return "info"
    return "debug"
  }
  if (s.startsWith("err") || s === "fatal" || s === "crit" || s === "alert" || s === "emerg" || s === "panic") return "error"
  if (s.startsWith("warn")) return "warn"
  if (s.startsWith("info") || s === "notice") return "info"
  if (s.startsWith("debug")) return "debug"
  if (s.startsWith("trace") || s === "verbose") return "trace"
  return s
}

function parseTimestamp(v: unknown): number | null {
  if (v === undefined || v === null) return null
  if (typeof v === "number") {
    // Heuristic: < 10^11 means seconds, else ms.
    if (v <= 0) return null
    if (v < 1e11) return Math.round(v * 1000)
    return Math.round(v)
  }
  if (typeof v !== "string") return null
  const s = v.trim()
  if (!s) return null
  // Try numeric string (epoch).
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = parseFloat(s)
    if (!isFinite(n) || n <= 0) return null
    if (n < 1e11) return Math.round(n * 1000)
    return Math.round(n)
  }
  const t = Date.parse(s)
  if (!isNaN(t)) return t
  // Common log shape: "2026-04-12 09:14:00".
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(s)
  if (m) return Date.parse(`${m[1]}T${m[2]}Z`)
  return null
}

function compactRecord(rec: Record<string, unknown>): string {
  // When no message field is found, build a one-line summary from up to
  // 4 short scalar fields so the LLM and the table have something to
  // show.
  const parts: string[] = []
  for (const [k, v] of Object.entries(rec)) {
    if (parts.length >= 4) break
    if (v === null || v === undefined) continue
    if (typeof v === "object") continue
    const s = String(v).slice(0, 60)
    parts.push(`${k}=${s}`)
  }
  return parts.join(" ")
}

function stripBigEvent(e: RawEvent): RawEvent {
  // Don't ship full nested fields into the LLM sample. Keep the message
  // and a compact view of the structured fields.
  const fields = e.fields ? compactFields(e.fields) : undefined
  return {
    ...e,
    raw: e.raw.length > 400 ? e.raw.slice(0, 400) + "…" : e.raw,
    message: e.message.length > 240 ? e.message.slice(0, 240) + "…" : e.message,
    fields: fields as Record<string, unknown> | undefined,
  }
}

function compactFields(rec: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  let count = 0
  for (const [k, v] of Object.entries(rec)) {
    if (count >= 12) { out["…"] = `+${Object.keys(rec).length - count} more`; break }
    if (v === null || v === undefined) continue
    if (typeof v === "string") out[k] = v.length > 120 ? v.slice(0, 120) + "…" : v
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v
    else if (Array.isArray(v)) out[k] = `[Array(${v.length})]`
    else if (typeof v === "object") out[k] = `[Object]`
    count++
  }
  return out
}

// ---------------------------------------------------------------------------
// Schema inference
// ---------------------------------------------------------------------------

function inferSchema(records: Record<string, unknown>[]): SchemaField[] {
  const sample = records.slice(0, 200)
  if (sample.length === 0) return []
  const fields = new Map<string, { types: Map<string, number>; nonNull: number; examples: Set<string> }>()
  for (const rec of sample) {
    for (const [k, v] of Object.entries(rec)) {
      const cur = fields.get(k) || { types: new Map(), nonNull: 0, examples: new Set() }
      const t = typeOf(v)
      cur.types.set(t, (cur.types.get(t) || 0) + 1)
      if (v !== null && v !== undefined) {
        cur.nonNull++
        if (cur.examples.size < 3) {
          const s = exampleValue(v)
          if (s) cur.examples.add(s)
        }
      }
      fields.set(k, cur)
    }
  }
  const out: SchemaField[] = []
  for (const [field, v] of fields.entries()) {
    const types = Array.from(v.types.entries()).sort((a, b) => b[1] - a[1])
    const dominantType = types[0][0]
    const type = types.length > 1 && types[0][1] / sample.length < 0.85 ? "mixed" : dominantType
    out.push({
      field,
      type,
      fillPct: Math.round((v.nonNull / sample.length) * 1000) / 10,
      examples: Array.from(v.examples),
    })
  }
  return out.sort((a, b) => b.fillPct - a.fillPct)
}

function typeOf(v: unknown): string {
  if (v === null || v === undefined) return "null"
  if (Array.isArray(v)) return "array"
  return typeof v
}

function exampleValue(v: unknown): string {
  if (typeof v === "string") return v.length > 40 ? v.slice(0, 40) + "…" : v
  if (typeof v === "number" || typeof v === "boolean") return String(v)
  if (Array.isArray(v)) return `[Array(${v.length})]`
  if (typeof v === "object") return `[Object]`
  return ""
}
