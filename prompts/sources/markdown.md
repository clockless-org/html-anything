# markdown — long-form text

Long-form documents (essays, articles, reports, guides). Don't just
render the markdown — extract what the user wants to take away.

## Headline (top of the page)

- **3-bullet TL;DR** — three concise observations the LLM extracts
  from the opening + headings + sample. Each one sentence. Concrete,
  not vague (no "this article discusses…").
- **Pulled quotes** — 2–4 sentences from the body that the LLM thinks
  are the strongest lines, set as styled callouts in serif italics.
- **Reading time + word count** — small meta line in the header.

## Section navigation (left rail on desktop)

If `meta.headingCount > 5`, render a left-rail TOC with one-line
summaries the LLM writes for each major section. Mobile: collapses to
a "Jump to" dropdown at the top.

For shorter documents (≤ 5 headings), skip the TOC. Anchored
headings only.

## The full body (drill-down)

The full markdown rendered as a clean reading view in the main column.
Use `var(--font-body)` for body, `var(--font-headline)` for headings.
Max width ~720px. Generous line-height (1.6).

Inline syntax highlighting for code blocks (~50-line tokenizer for
common languages: js/ts/py/sh/json/markdown). No external highlighter.

## Always include

- Cmd-F-style search that highlights matches in the body.
- "Copy as Markdown" of the full document (`DATA.markdown` is the source).
- Print-friendly stylesheet.

## Tone

Match the document. A personal essay → serif body, generous leading,
warm dark mode. A technical spec → tighter sans, clear headings, mono
inline code with subtle background. Use the same Clockless tokens
either way; only the typographic register shifts.

## Data shape

```ts
DATA = {
  markdown: "the raw markdown text",
  headings: [{ level: 1, text: "..." }],
  wordCount: 581,
  lineCount: 90,
  headingCount: 9,
  meta: { sourceFile, sizeBytes }
}
```

The `markdown` field is the source — render it client-side with a tiny
inline parser (~80 lines covers headings, paragraphs, lists, blockquotes,
code fences, inline code, bold, italic, links). Don't pull a CDN
library.
