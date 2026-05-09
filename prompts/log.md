# log — server / web / application logs

The shared event-stream contract above (volume histogram, severity
breakdown, outliers, top sources, drill-down table) applies fully.
This file adds log-specific notes.

## What's distinctive about log data

- **There are several common shapes.** The parser detected one of:
  - `access-log` — Apache/Nginx Common or Combined Log Format. Has
    method, path, status, bytes, optional referrer + user-agent.
    `category` is "GET 200" / "POST 500" style.
  - `error-log` — application error log with explicit severity
    levels (`[ERROR] ...`, `WARN ...`, `2026-04-12 14:20:00 ERROR
    msg`). `severity` is filled.
  - `syslog` — `Mar 12 10:14:22 host app[pid]: msg`. `source` is the
    host, `category` is the app/program name.
  - `app-log` — generic timestamped lines (`[2026-04-12 09:14:00]
    LEVEL msg`). `severity` is filled when present.
  Use the `format` field on `DATA` to label the chrome and decide
  which sub-panels to render.

- **Status code is the headline for access logs.** If `format ===
  "access-log"`, surface a status-code donut (2xx / 3xx / 4xx / 5xx)
  in addition to the severity panel. Hits with `4xx` / `5xx` should
  go in the outliers panel as `top-error` cards (top failing paths
  with their status code and count).

- **Endpoints / paths are the leaderboard.** For access logs,
  `topMessages` is normalized request lines (e.g. "GET /api/users")
  and `topSources` is client IPs. Surface both — the path
  leaderboard is the "what is this server serving" answer; the IP
  leaderboard is the "is anyone hammering us" answer. Badge any IP
  with > 5% of total traffic as a potential abuse signal.

- **Latency belongs in its own panel.** If records have
  `fields.duration_ms` / `fields.response_time` (some access log
  variants do), render a p50/p95/p99 strip plus a small histogram.
  Skip if no latency is present.

- **Stack traces don't get drilled into.** For error logs, multi-
  line stack traces are folded into the parent event by the parser
  (the trace is in `raw`, the summary is in `message`). Render a
  "show stack trace" toggle on the row when expanded; don't try to
  pretty-print the trace as a separate panel.

- **Bursts matter more than averages.** A log that's mostly quiet
  with a 30-second burst of errors is more interesting than a
  steady 1% error rate. The parser flagged top-1% buckets in
  `outliers` with `kind: "burst"`. Pin them on the histogram and
  surface them as cards above the drill-down.

## Source-specific layout hints

- Headline card: "{format} · {eventCount} events · {timeRange} ·
  {errorRate}% error rate" + one editorial sentence the LLM writes
  from the sample ("Nginx access log with steady 88% 2xx, two
  short 5xx bursts at 14:23 and 14:41 mostly hitting `/checkout`,
  one IP — `192.0.2.42` — generated 6.1% of all requests").

- For access logs, place the status-code donut next to the volume
  histogram. They tell complementary stories — "how busy" + "how
  healthy".

- The drill-down table should show `ts | severity | category |
  source | message` as default columns. For access logs, prefer
  `ts | status | method | path | ip | bytes | ua` instead — the
  table is the access-log line back in tabular form.

- For error logs, render error events with `var(--red)` left-border
  emphasis and warn events with `var(--yellow)`. Info / debug stay
  neutral. Make the severity filter chips visually match.

- If the source IP / hostname is private (`10.*`, `192.168.*`,
  `172.16.*`-`172.31.*`), label it as "internal" in the source
  leaderboard chip; if it's public, leave it bare. Lets the user
  see at a glance whether the dominant caller is internal or
  external.

## Synthetic-data caveat

Logs are easy to fake but the patterns matter. When the LLM writes
the editorial summary sentence, ground it in numbers visible in the
sample (counts, time ranges, top messages) — don't invent customer
names, regions, or system identifiers that aren't in the data. If
the sample doesn't show enough to make a confident call, write a
shorter, more cautious sentence ("12,400 access-log entries over
roughly 90 minutes — most traffic on `/api/*` paths.").
