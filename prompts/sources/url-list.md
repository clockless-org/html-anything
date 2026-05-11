# url-list — plain text URL list / "tab dump"

A plain-text or markdown file with one URL per line, optionally
with a title before the URL or a note after it. Common shapes:

- Bare URLs, one per line (`https://...`)
- Markdown bullets (`- [Title](https://...)` or
  `- https://... — note about it`)
- A scratch file with `## Section` markdown headings dividing the
  links into rough buckets
- A "tab dump" — what a founder pasted from Chrome's "Copy all
  open tabs" or what an analyst dumped from a research session

The shared **research / reading-list contract** in `_research.md`
covers the five required sections and the data shape. Read that
first.

## What's specific to URL lists

- **Sections become folders.** When the input has `## Section`
  markdown headings or `Section:` lines, the parser populates
  `item.folder` with the most recent heading. Surface
  `DATA.folders` as one of your optional sections, but expect
  many items to have no folder at all if the user just dumped
  raw URLs.
- **Topics are keyword-driven.** URL lists rarely have
  hand-tagged metadata. The parser's keyword fallback fills
  `DATA.topics` from title stems. Expect the clusters to be
  noisier than for bookmarks / bibliographies — render them as
  suggestions, not as a definitive ontology. Show the literal
  cluster keyword + count, not a polished label.
- **No add-date metadata.** Plain URL lists don't have
  timestamps, so the prioritization section can't show a saving
  rhythm timeline. Substitute "Most-saved domains this list" or
  "Largest cluster, sample" — derive prioritization from
  `DATA.topics` (densest theme = highest signal of attention)
  rather than from time.
- **The tab-dump shape is dominated by duplicates.** When you
  copy all open tabs and paste into a file, you often have the
  same article open in two windows. The duplicate-callout
  section is especially important here.

## What to skip

- Don't try to fetch any of the URLs. Same offline rule as the
  rest of the research pack.
- Don't try to render link previews / OpenGraph cards.
- Don't impose a "table of contents" view if the input has no
  section headings. A flat searchable list is the correct
  default for a tab-dump shape.
