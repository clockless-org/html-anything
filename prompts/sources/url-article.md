# url-article — long-form web pages

A blog post, news article, Medium / Substack / personal site post,
HN comment thread, etc. The user wants a clean reading view.

## What to fetch

Use `WebFetch` on the URL with a prompt like:
> "Extract the main article content as markdown. Include the title,
> author, date if visible, and the body. Skip navigation, comments, ads,
> related articles, footers."

Sometimes the article is rendered via JS only — if WebFetch returns
nothing useful, tell the user the URL needs JavaScript and suggest
saving the rendered page to disk first.

## Layout

A **stripped reading view**. Like Reader Mode, but better designed.

- Centered single column, max-width ~680px.
- Serif body font (Iowan Old Style, Garamond fallback). Generous leading.
- Header: title, author, date, source domain, reading time estimate.
- Quote callouts pulled from the body (LLM picks 1–3 strong ones).
- Anchored headings.
- "Open original" link in the header.
- "Copy as Markdown" button.

## Inferred richer features (apply when present in the source)

- **Code blocks** → syntax highlighting (~50-line client-side tokenizer).
- **Images** → preserve, with a click-to-zoom overlay.
- **Tables** → render with the same styling as the csv prompt's tables
  (sortable if the table has a clear header).
- **Footnotes / asides** → tooltip on hover desktop, expandable on mobile.

## Always include

- Light + dark mode.
- Reading-time estimate.
- Cmd-F-style search.
- "Copy as Markdown" of the entire article.
- Print-friendly stylesheet.

## Data shape

```ts
DATA = {
  url: "https://...",
  title: "...",
  author: "...",
  date: "...",
  domain: "...",
  body: "raw markdown",      // rendered client-side
  pulledQuotes?: ["...", "..."],
}
```

## Tone

Editorial, calm. The page should feel like the article it's wrapping,
not like a "view" or a "wrapper". Strip everything that isn't reading.
