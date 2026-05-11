# pdf — long PDF documents

Reports, white papers, contracts, theses, research papers, slide-deck
exports. Treat as evidence: surface what's in it before reproducing
how it looks.

Read [`prompts/sources/_document.md`](./_document.md) for shared
long-document guidance (TL;DR, claim cards, section nav, 5-minute vs
full mode, search). The notes below are PDF-specific.

## What's specific to PDFs

- **Pages exist** in the data (`DATA.pages`). Use them. Section nav and
  claim-cards should jump back to the page where the claim was made
  (`#page-{n}`).
- **Page numbers in the eyebrow.** `pageCount` is meaningful; show it
  as `12 pages · 3,184 words · ~14-min read`.
- **Headings are inferred, not authoritative.** `DATA.headings` is the
  parser's best guess from formatting heuristics. If a heading looks
  spurious (e.g. a stray bold line), drop it from the section nav. Do
  not invent headings the parser didn't see.
- **Tables and figures are extracted as plain text.** Where the LLM
  sees something tabular in the sample (rows with consistent shape,
  column-like spacing), render it as an HTML table in the insight
  layer. The page-by-page reading view shows the raw extracted text.
- **Numerical claims are gold.** PDFs are usually where dollars,
  percentages, and dates live. Extract them prominently in the
  TL;DR and key-stats grid.

## Layout (recommended)

A four-block layout:

1. **Hero TL;DR** — 3 takeaways + reading-time + a single hero number
   if the LLM finds a defining figure (e.g. "GW deployed", "% IRR").
2. **Claims & evidence** — 4–8 claim cards, each linking to the page
   they came from. This is the layer that turns a 30-page PDF into
   something usable in 5 minutes.
3. **Section nav** — left rail desktop, dropdown mobile. Includes
   one-line section summaries the LLM writes.
4. **Full reading mode** — page-by-page rendering of `DATA.pages`,
   with anchor IDs so claim cards and TOC entries can link to them.

## Optional, when the data supports it

- **Glossary** — PDFs often include defined terms. If a Glossary or
  Definitions section is detected, surface it as a chip strip with
  hover/expand.
- **References / citations panel** — if a References section is
  detected, present as a numbered list, separate tab.
- **"Find numbers" view** — every $-amount, %-figure, and date the
  LLM extracts, in a single scannable list with the page number.

## Data shape

```ts
DATA = {
  pages: [{ page: 1, text: "..." }],
  headings: [{ page: 3, level: 2, text: "Cost Structure" }],
  text: "the full extracted text, all pages joined",
  pageCount: 8,
  wordCount: 3184,
  charCount: 18800,
  headingCount: 12,
  readingMinutes: 14,
  meta: { sourceFile, sizeBytes, ... }
}
```

`DATA.pages` is the source of truth for the reading view. `DATA.text`
is convenience for "Copy as text" and search.

## Rules of thumb

- If `pageCount <= 2`, drop the section nav and use a single-column
  reading view; the document is short enough.
- If `pageCount >= 20`, default to the **5-minute version**; full
  reading is opt-in.
- Never hallucinate page numbers or claims that aren't in the sample
  or headings. If the LLM is uncertain, say so explicitly in the card
  ("approximate, see p.6 for context").
