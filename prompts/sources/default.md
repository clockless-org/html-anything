# default — catch-all prompt

When you don't have a specific prompt for the source type, treat the input
as **a document the user wants to read more comfortably than the source
format allows**.

## Layout decisions

Read the first ~1500 chars. Pick a layout based on shape:

- **Long-form text** (essays, articles, plain text) → centered single-column
  reading view, serif body font, max-width ~720px, generous line-height.
  Add Cmd-F-style search.
- **Structured records** (any list of items) → a table or card grid,
  sortable / filterable.
- **Hierarchical** (nested headings, tree-like) → left-rail navigation +
  reading pane.
- **Short snippet** (< 500 words) → single hero card, no chrome.

## Always include

- Light + dark mode via `prefers-color-scheme`.
- Mobile-first responsive layout (max-width ~720px on desktop).
- Search box at the top that filters or highlights matching content.
- "Copy as Markdown" button at the bottom or in a header action area.

## Data shape

The full data is inlined as `DATA`. Shape varies by source — check the
sample to see what fields you have. Common cross-source fields:

- `meta.sourceFile` — filename for the document title fallback
- `meta.sizeBytes` — for the eyebrow
- `text` or `lines` or `markdown` — the body content for text-shaped sources
