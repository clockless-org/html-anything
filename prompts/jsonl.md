# jsonl — JSON Lines / NDJSON event streams

The shared event-stream contract above (volume histogram, severity
breakdown, outliers, top sources, drill-down table) applies fully.
This file adds JSONL/NDJSON-specific notes.

## What's distinctive about JSONL data

- **Schema is inferred, not declared.** The parser walked the first
  few hundred records and produced `DATA.schema` — an array of
  `{ field, type, fillPct, examples }`. Surface it as a small
  "Schema" panel near the top: each row is a field name, its
  inferred type, fill rate (`100%` / `87%` / `4.2%`), and 2–3
  example values. Click a field to filter the drill-down table to
  rows where that field is non-null. This panel is the JSONL
  equivalent of a CSV column header — it tells the user what's in
  the file.
- **Events are arbitrary.** Unlike a web access log, a JSONL stream
  could be application events, audit log entries, ML model traces,
  IoT sensor readings, payment ledger lines, or anything else.
  Don't assume a verb-noun shape. Read the `category` /
  `severity` / `message` fields the parser pre-extracted, plus
  `fields` for the original record.
- **Timestamp is the anchor.** Every record has `ts` and `tsEpoch`
  (parser already normalized whatever timestamp field it found —
  `ts`, `time`, `timestamp`, `@timestamp`, `datetime`, `_time`).
  Use it for the histogram and table sort order.
- **Nested fields are common.** Records often have nested objects
  (`request.method`, `user.id`, `error.code`). Render row-expand in
  the drill-down table to show the full `fields` object pretty-
  printed when the user clicks a row.
- **Mixed shapes are possible.** Some streams have heterogeneous
  records (login events look different from order events).
  `DATA.schema` reflects this with low fill rates on
  type-specific fields. Surface schema outliers in the outliers
  panel.

## Source-specific layout hints

- Headline card: "{eventCount} events from {sourceCount} sources ·
  {timeRange} · {format}" + one editorial sentence the LLM writes
  from the sample ("a payments-service event log dominated by
  `order_placed` (62%) with a small but notable `payment_failed`
  cluster between 14:20 and 14:45 UTC").
- Schema panel sits above the severity / category breakdown — it
  orients the user to the field shape before they see counts.
- The drill-down table should show `ts | severity | category |
  message | source` as default columns, and let the user pick which
  inferred fields to add as extra columns from the schema panel.
- If `severity` is null across the whole stream (e.g. analytics
  events, audit log, ledger), drop the severity sub-panel and lean
  on `category` (event type) for filtering instead. Render an empty
  state in the severity panel ("This stream has no severity
  field — events are filtered by category.") rather than removing
  the section heading.
- If the stream is large enough to need windowing (>2000 events),
  use a virtualized table with a fixed visible window plus a
  "Showing N of M" indicator. Search and severity filter narrow
  the candidate set first.
