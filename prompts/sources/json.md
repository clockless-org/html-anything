# json — JSON data files

Already-structured data. Layout depends entirely on the **shape** of
the root, which the parser describes in `meta.shape`.

## Layout decisions by shape

- **Root is an array of homogeneous objects** (the most common case for
  data files) → table view. Treat it like a CSV — sortable headers,
  search, virtualized rows for large arrays. See `csv.md` for full
  layout rules. Detect numeric columns by sampling.

- **Root is a single object with many keys** (config, API response,
  manifest) → key-value layout. Group nested objects into collapsible
  sections. Pretty-print + click-to-expand.

- **Root is a deeply nested tree** (e.g. AST, DOM-like) → tree view
  with collapsed branches by default. Click to expand. Use indentation
  + connecting lines.

- **Root is an array of mixed types or array of arrays** → fall back
  to a syntax-highlighted JSON viewer with collapse-by-key.

## Always include

- "Copy as JSON" / "Copy as Markdown" buttons.
- Search box that matches keys + values.
- Path-aware breadcrumb at the top when navigating into a nested object.
- Light + dark mode.

## Data shape

```ts
DATA = /* the parsed JSON object — your code in <script> needs to
  walk it generically. The parser already attached meta separately. */

// You also get:
DATA_META = {
  sourceFile: "...",
  sizeBytes: 12345,
  shape: "array of 250 (item type: object)" | "object with N keys: a, b, c…" | etc.
}
```

(The CLI inlines the full parsed JSON as `DATA`; metadata is in `DATA_META`
when present, otherwise reach into `DATA.meta`.)

## Tone

Tight, technical. Mono numerics. The page should look like a developer
tool — but a well-designed one.
