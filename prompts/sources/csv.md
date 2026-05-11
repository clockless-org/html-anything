# csv — tabular data

Don't render the table as the headline. **Analyze first, table second.**

## Headline (top of the page)

Look at the schema, the numeric columns list, and the sample rows.
Infer the story:

- **Summary card** — total rows, column count, the dominant numeric
  column's total / mean / range, the most common categorical value.
  Format like "$215,820 across 46 orders · West region leads with 38%
  · top product: Espresso Machine".
- **Outlier callouts** — pick 1–3 rows that stand out (highest revenue,
  unusual region, off-trend date). One sentence each, anchored to the
  cell content.

## Visualizations (3–5, picked from the data shape)

- **Category bar chart** — the dominant categorical column × the
  dominant numeric column (e.g. revenue per region). Sort descending.
- **Time series** — if there's a date column, line / area chart of the
  numeric column over time. Highlight peaks.
- **Donut / stacked bar** — proportion of one categorical column,
  capped at top 6 + "other".
- **Distribution histogram** — for a numeric column with reasonable spread.
- **Top N ranked list** — top 5 or 10 rows by the dominant numeric
  column, as a small ranked list (not a full table).

Render charts as inline SVG (no Chart.js, no CDNs). Use Clockless
brand palette per `prompts/styles/_design.md`. Up to 6 colors per chart.

## The full table (drill-down)

Below the analysis, a collapsible section labeled "Browse all N rows"
with the full sortable + searchable table. Numeric columns
right-aligned, tabular-nums. For files > 5,000 rows, virtualize the
rows (render only what's visible). DATA is already inlined.

## Data shape

```ts
DATA = {
  headers: ["order_id", "date", "region", ...],
  rows: [
    ["ORD-1042", "2026-01-04", "West", "Espresso Machine", "12", "499.00", "5988.00", "Mira Park"],
    ...
  ],
  rowCount: 46,
  columnCount: 8,
  numericColumns: ["units", "unit_price", "revenue"],
  separator: ",",
  meta: { sourceFile, sizeBytes }
}
```

## Tone

Analytical first, dry second. Headline copy is **observational
sentences**, not column labels. Use mono for IDs and numerics. The
table is the drill-down, not the show.
