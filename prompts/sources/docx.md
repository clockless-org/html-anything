# docx — Word documents

Internal memos, RFCs, decision docs, briefs, contracts, drafts. The
common shape: a structured document with headings, decisions / action
items, and a clear authoring voice.

Read [`prompts/sources/_document.md`](./_document.md) for shared
long-document guidance (TL;DR, claim cards, section nav, 5-minute vs
full mode, search). The notes below are DOCX-specific.

## What's specific to DOCX

- **Headings are authoritative.** Word's heading levels survived the
  conversion (`DATA.headings` is reliable, unlike PDF inference). Use
  them as the document's spine for both navigation and structure.
- **Tables survived.** mammoth converts tables to pipe-style markdown
  in `DATA.markdown`. When rendering full reading mode, parse those
  rows and emit proper HTML tables — don't just show the markdown
  pipes.
- **Lists matter.** Numbered + bulleted lists came through as
  proper markdown lists. Render them as such; resist flattening to
  paragraphs.
- **Comments / track-changes are dropped** by the parser. The body
  text is the post-acceptance version.

## Document patterns to detect

These are common in internal memos and almost always worth surfacing
in the insight layer:

- **Decision blocks** — sections labelled "Decisions", "Decided",
  "Resolutions". Render as a numbered card grid: each decision gets a
  short ID + 1-line description + a link into the section that
  justifies it.
- **Action items** — tables or lists with owner / due-date columns.
  Render as a sortable, filterable table at the top of the insight
  layer, grouped by owner.
- **Open questions** — sections labelled "Open Questions", "TBD",
  "Undecided". Surface as a callout card so reviewers can scan them
  fast.
- **Status block** — a key/value table at the top (Author, Reviewers,
  Status, Date). Promote into the document header eyebrow rather than
  leaving it inline.

When a document has none of these, fall back to a clean reading view
+ section nav, like the markdown prompt.

## Layout (recommended)

1. **Header band** — title + status block as a key/value strip. If
   "Status" is one of `{Draft, Review, Decided, Shipped}`, color the
   chip from the brand palette.
2. **TL;DR + decision cards + action-item table** — the *insight*
   layer for memos. Action-item table is sortable and filterable
   (owner, due, status).
3. **Open questions callout** — if detected, prominent enough to be
   read at a glance.
4. **Section nav** — left rail desktop, dropdown mobile.
5. **Full reading mode** — render `DATA.markdown` with a small inline
   markdown parser (headings, paragraphs, lists, blockquotes, tables,
   bold/italic/links). Anchor IDs so cards link back.

## Data shape

```ts
DATA = {
  markdown: "the full doc as markdown, mammoth-converted",
  plainText: "markdown stripped of formatting, used for word count",
  headings: [{ level: 1, text: "Proposal" }],
  wordCount: 1820,
  lineCount: 240,
  headingCount: 12,
  readingMinutes: 9,
  meta: { sourceFile, sizeBytes, ... }
}
```

The markdown field includes pipe-style tables (`| col | col |\n|---|...`)
and standard list/heading syntax. Parse it client-side rather than
shipping a markdown library.

## Rules of thumb

- If the document has explicit decision / action / status blocks, the
  insight layer should be **action-oriented** (decision IDs, owners,
  due dates). The user wants "what changed and what do I do?", not
  "what does it say?".
- If the document is a long-form essay or brief without action items,
  use the markdown / long-document layout: TL;DR, claim cards, pulled
  quotes, section nav.
- Never invent owners or due dates that aren't in the document. When
  uncertain, omit; don't guess.
