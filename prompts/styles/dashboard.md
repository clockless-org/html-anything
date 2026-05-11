# Dashboard Style

Use this style for CSVs, spreadsheets, finance/admin data, logs, issue trackers,
calendar exports, operational records, and other structured datasets.

## Underlying System: Ops Console

This is an operational console system. It should feel built for repeated
scanning, filtering, and deciding.

Base scaffold:

1. **Command bar** — title, period/source, search, filters, export/copy
   action, and active chips in one compact row.
2. **KPI rail** — dense metric cells with tabular numbers and variance/context.
3. **Primary work surface** — trend, heatmap, funnel, queue, or status board
   large enough to compare quickly.
4. **Flag queue** — anomalies, stale items, duplicates, failed jobs, or
   attention-needed rows.
5. **Data grid** — searchable/sortable table or virtualized row list.

Component vocabulary:

- `.ops-shell`, `.command-bar`, `.kpi-rail`, `.work-surface`,
  `.filter-strip`, `.flag-queue`, `.data-grid`, `.row-detail`.
- Prefer compact rows, tabs, segmented controls, chips, and table/grid
  structures over roomy storytelling cards.

Interaction model:

- Filters update charts, flags, and rows together.
- Table search is always near the command bar or grid.
- Use color semantically: error, warning, success, selected, muted.

## Page Shape

- Put the decision surface first: KPIs, status, trend, and highest-priority
  flags.
- Use dense but readable panels, not marketing cards.
- Include filters and search when records are numerous.
- Show distributions, outliers, breakdowns, trends, and stale/duplicate/anomaly
  callouts.
- Put raw rows behind a searchable table or drill-down, not as the lead.

## Visual Language

- Use the Clockless tokens from `prompts/styles/_design.md`.
- Quiet, utilitarian, scan-friendly.
- Compact typography and stable grid tracks.
- Use color semantically and sparingly.
- Keep charts legible at mobile widths.
- Values must be readable without hovering. Tooltips can add detail, but main
  values, legends, and threshold meanings should be visible.
- Wide tables need contained overflow or a card/list fallback on mobile.

## Required Modules

- KPI strip.
- Primary trend or heatmap.
- Breakdown chart.
- Flag/anomaly cards.
- Filter/search controls.
- Searchable detail table.

## Avoid

- Oversized hero sections.
- Decorative gradients or image-heavy composition.
- Too many chart colors.
- Hiding caveats for finance, legal, medical, or other sensitive data.

## Implementation Notes

- Use tabular numerics where possible.
- Make sorting/filtering client-side and local.
- Never provide tax, accounting, investment, legal, or medical advice.
