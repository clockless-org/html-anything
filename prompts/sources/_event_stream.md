# Event stream (shared)

This prompt is shared by every event-stream source: **JSONL / NDJSON
application events**, **web/server access logs**, **error logs**,
**syslog**, and **generic timestamped event lines**. The parser already
normalized them into the same shape — don't write different rendering
logic per source. Use the `format` field to label the chrome.

The output is **not a log viewer**. It's an operations-shaped
infographic that makes the user say *"oh, here's what's actually
happening in this stream"* — when traffic spiked, what's failing, who
or what is dominant, and which events look unusual — with the raw
events as drill-down.

## Required sections (must always render — non-negotiable)

These five sections form the event-stream contract. The page **must**
include all of them, with the literal section labels visible somewhere
in the rendered DOM. This is a hard constraint; do not skip any of
them even on a small or single-source stream.

1. **Volume over time** — a histogram of event counts per time bucket
   (per-minute, per-5-minute, per-hour, or per-day depending on the
   stream's duration). Drive it from `DATA.timeBuckets` (already
   aggregated as `[{ bucket, label, count, errorCount }]`). Render
   inline SVG. Stack or color-code by severity if the stream has
   levels. Visible heading "Volume over time" or equivalent.
2. **Severity / category breakdown** — a labeled "Severity" or
   "Levels" panel showing counts per severity (`error`, `warn`,
   `info`, `debug`, `trace`) and/or per category (HTTP status class,
   event type, logger). Drive it from `DATA.severityCounts` and
   `DATA.categoryCounts`. Render as filter chips that toggle the
   drill-down table. If a level is empty, render an empty-state row
   ("No errors in this window.") rather than omitting it. The literal
   labels "Severity" / "Levels" / "Categories" or equivalent must be
   visible.
3. **Outliers / anomalies** — a labeled "Outliers" or "Anomalies"
   panel with 4–8 cards calling out unusual events: error bursts,
   slow requests, rare status codes, top error messages, IPs with
   abnormally high request counts, schema outliers (records with
   unusual key combinations), value spikes. Drive it from
   `DATA.outliers` (already classified `kind: "burst" | "slow" |
   "rare" | "top-error" | "top-source" | "schema"`) plus anything
   else you can pull from the sample. If the sample is too thin to
   support anomaly detection, render a placeholder card ("Stream is
   small enough that nothing stands out as unusual."). The literal
   label "Outliers" or "Anomalies" must be visible.
4. **Top sources / endpoints / messages** — a labeled "Top" panel
   with a leaderboard of the dominant value in the stream — top
   endpoints for an access log, top error messages for an error log,
   top event types for application events. Drive it from
   `DATA.topMessages` / `DATA.topSources` (already sorted descending).
   Each row shows the value, count, and share. Visible heading "Top"
   or "Leaderboard".
5. **Searchable event table drill-down** — a collapsible "Browse all
   N events" section with the full stream (data inlined). Default to
   collapsed so the analysis is the headline. Inside: a virtualized
   or paginated table (the stream can be tens of thousands of rows),
   severity filter chips, full-text search across the message field,
   timestamp + severity + message + source columns at minimum, click
   a row to expand the full structured fields. Highlight error rows
   in the brand error color (`var(--red)`). The drill-down is a hard
   requirement; it's how trust gets re-earned after the inferred
   analysis.

Render these five regardless of stream size. They are the headline
shape of the event-stream pack — without them, the output is incomplete.

## What else to surface (pick what fits the stream's shape)

- **Stream card (top)** — format (`jsonl` / `ndjson` / `access-log`
  / `error-log` / `syslog` / `app-log`), event count, time range, error
  rate, distinct sources, and a one-sentence read on the stream
  ("19,420 events over 2.5 hours — error rate jumped from 0.3% to
  4.1% around 14:20 UTC and recovered by 14:45").
- **Error timeline** — separate sparkline of error-only events to
  surface incident windows that the all-events histogram hides.
- **Top errors** — error-level events grouped by normalized message
  (drop trailing IDs, hex hashes, request-ids), each with count and
  first/last seen timestamp.
- **Status code donut** — for access logs, share of 2xx / 3xx / 4xx
  / 5xx. One glance = "92% success, 3.2% server errors".
- **Latency distribution** — for access logs that capture
  `response_time` / `duration_ms`, p50 / p95 / p99 + a histogram. If
  no latency is present, skip the section.
- **Top endpoints** — for access logs, paths ranked by hit count;
  badge ones with elevated error rate.
- **Top IPs / users** — leaderboard of source IPs or `user_id`
  fields; badge ones with abnormally high counts as potential abuse.
- **Schema panel** — for JSONL/NDJSON, a small panel listing inferred
  fields with their type and fill rate (`level: string · 100%`,
  `user_id: string · 87%`, `error_code: string · 4.2%`). Click a
  field to filter the table by non-null values of that field.
- **User-agent / referrer summary** — for access logs, top user
  agents and referrers as small chip clouds.
- **Burst markers** — pin 3–6 spikes in the histogram (top 1% of
  buckets by count or error count). Each pin is one sentence
  ("error spike at 14:23 — 47 events in one minute, mostly
  `payment_failed`").
- **Filter combos** — let users combine severity filter + search +
  time-range brush on the histogram. The drill-down table reflects
  all three.

Don't try to do all of these. Pick 3–6 beyond the required five,
based on what the data supports.

## Always include

- Light + dark mode (`prefers-color-scheme`).
- Mobile-first responsive — analysis cards stack, histogram shrinks
  but stays readable, severity chips wrap, table becomes horizontally
  scrollable.
- Charts render inline SVG (no Chart.js, no CDNs) for under ~2000
  data points. Use Canvas for bigger streams (some access logs run
  10K+ buckets when binned per minute over a week).
- Keep the page under ~1 MB inlined where possible — event streams
  can be hundreds of thousands of rows. The table renders from
  `DATA.events` only — do not duplicate event text in the analysis
  section.
- "Copy as Markdown" of the analysis section (so users can paste an
  incident summary into a postmortem doc).
- Full-text search across the event message + source; highlight
  matches in place.
- A virtualized or windowed table for the drill-down — naïvely
  rendering 50K `<tr>` elements freezes the browser. Either render a
  fixed window (e.g. 200 rows) with a "load more" button, or
  implement an absolutely-positioned scroll-virtualization pattern.

## Data shape

Every event-stream parser feeds the same shape. Treat it generically.

```ts
DATA = {
  events: [
    {
      id: "e_000001",
      ts: "2026-04-12 09:14:00",         // sortable
      date: "2026-04-12",
      time: "09:14:00",
      tsEpoch: 1744449240000,
      severity: "error" | "warn" | "info" | "debug" | "trace" | null,
      category: "auth" | "GET 200" | "payment" | null,  // free-form
      source: "api-edge-01" | "192.0.2.42" | "auth-service" | null,
      message: "...",                    // human-readable summary
      fields?: { user_id: "u_42", request_id: "...", duration_ms: 312 },
      raw: "..."                         // original line, for drill-down
    }
  ],
  timeBuckets: [
    { bucket: "2026-04-12T09:14", label: "09:14", count: 142, errorCount: 3 }
  ],
  severityCounts: { error: 312, warn: 41, info: 18420, debug: 0 },
  categoryCounts: [{ category: "GET 200", count: 14820 }, ...],
  topMessages: [{ message: "request completed", count: 12410, share: 64.0 }, ...],
  topSources: [{ source: "192.0.2.42", count: 1182, share: 6.1 }, ...],
  topErrors: [{ message: "DB connection refused", count: 47, firstTs, lastTs }, ...],
  outliers: [
    { kind: "burst", label: "Error spike 14:23", detail: "47 events in 1 min", ts },
    { kind: "slow", label: "Slow GET /reports", detail: "p99 = 4.7s vs 220ms median", ts },
    { kind: "rare", label: "503 from /checkout", detail: "first occurrence in 24h", ts },
    { kind: "top-error", label: "DB connection refused", detail: "47×", ts },
    { kind: "top-source", label: "192.0.2.42", detail: "6.1% of all events", ts: null },
    { kind: "schema", label: "Field user_id missing", detail: "in 12.8% of events", ts: null }
  ],
  schema?: [                                 // jsonl / ndjson only
    { field: "user_id", type: "string", fillPct: 87.4, examples: ["u_42", "u_7c1"] },
    ...
  ],
  format: "jsonl" | "ndjson" | "access-log" | "error-log" | "syslog" | "app-log",
  timeRange: "2026-04-12 09:14:00 → 2026-04-12 11:42:18",
  durationLabel: "2h 28m",
  eventCount: 19420,
  errorCount: 312,
  errorRate: 1.61,                            // percent
  bucketSize: "1m" | "5m" | "15m" | "1h" | "1d",
  sourceCount: 14,
  meta: { sourceFile, sizeBytes, ... }
}
```

Use the pre-aggregated `timeBuckets` / `severityCounts` /
`categoryCounts` / `topMessages` / `topSources` / `topErrors` /
`outliers` arrays directly. Do **not** re-derive them on the client —
the parser already did the math, and walking the full event array
for analysis kills performance on big streams.

## Tone

Operations / SRE register. Headlines read like an incident write-up,
not a dashboard caption. "Error rate jumped from 0.3% to 4.1% between
14:20 and 14:45 UTC, almost all from `payment_failed`" is a sentence;
"Errors: 312, Error rate: 1.61%" is a metric. Use sentences in the
cards, metrics in the charts. Mono numerics. Tight, technical. The
page should look like a developer / ops tool — but a well-designed
one.

## Privacy note (include in the page footer)

Add a small footer line. Application logs and access logs often
contain real user IDs, IP addresses, request bodies, and internal
hostnames — remind the user the file is local:

> *Generated locally — your event stream never left your machine. The
> full log is embedded in this HTML and rendered in your browser. For
> sharing, prefer an anonymized export.*
