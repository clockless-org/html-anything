# shared — long-document guidance

Used by `markdown.md`, `pdf.md`, and `docx.md`. The shape is the same:
something a person could reasonably read in 5–60 minutes, organised in
sections, where the user wants both *insight first* and *the original
text on tap*.

Treat the document as evidence. The page should answer **"what does
this document actually say?"** before it answers **"what does it
look like?"**.

## Above the fold (insight-first cards)

Always include:

- **Executive TL;DR** — 3 one-sentence observations the LLM extracts
  by reading the opening, headings, and middle sample. Concrete, not
  vague. ("The 4-tier pricing collapses to 2 + Enterprise" beats "the
  document discusses pricing.")
- **Reading-time meta** — `wordCount`, `readingMinutes`, page or
  heading count. Small, in the eyebrow.
- **Pulled quotes** — 2–4 quote-worthy lines the LLM picks from the
  body. Set as serif callouts.
- **Key terms / entities / dates** — names, dates, decisions, dollar
  amounts the LLM saw in the sample. Render as chips or a small grid.
  Only include items the LLM is confident about; don't hallucinate.

When the document has clear analytical structure (claims-with-evidence,
recommendations, decisions), surface it as **claim cards**: short
headline + 1–2 sentence supporting line + a "where in the doc" jump
link. This is the highest-leverage card type — it converts a long doc
into something a busy reader can act on without reading the whole
thing.

## Section navigation

If `headingCount > 5`, render a left-rail TOC on desktop with one-line
section descriptions the LLM writes. Mobile: collapse to a "Jump to"
dropdown at the top.

For documents with explicit page structure (PDF), prefer
*section + page* labels ("§3 Operator Software · p.6") so the user can
cite back into the original.

## Reading mode

Two reading modes, switchable by a top-right toggle:

- **5-minute version** — TL;DR + quotes + claim cards + section
  summaries. The LLM writes the section summaries from the sample.
- **Full reading mode** — render the entire document body
  client-side from the inlined `DATA`. Markdown for `.md` / `.docx`
  (use a tiny inline parser, ~80 lines for headings, paragraphs,
  lists, blockquotes, code, bold, italic, links). For PDFs, render
  page text blocks with a page divider between them.

Default to **5-minute version** when `wordCount > 1500` or `pageCount
> 4`. Default to full reading otherwise.

## Always include

- Cmd-F-style search that highlights matches across the body and
  scrolls the first hit into view.
- Print-friendly stylesheet (the user may want a clean printout of the
  insight view).
- "Copy as Markdown" of the document body (`DATA.markdown` for docx,
  `DATA.text` for pdf, `DATA.markdown` for markdown).
- A small "How I read this" footer line that names the model and
  states "the sample was analyzed; the full text is rendered
  client-side from inlined data."

## Tone

Match the document. Strategy / research deck → confident sans, tighter
type, brand-orange accent on numbers. Personal essay → serif body,
generous leading, warm dark mode. Internal memo → neutral, table-led,
mono for IDs and dates. The Clockless tokens cover both registers;
only the typographic choice shifts.
