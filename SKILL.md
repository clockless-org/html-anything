---
name: html-anything
description: Turn any file or URL into a single self-contained interactive HTML infographic — analyze the content, extract patterns, visualize them, then inline the original data so users can drill in.
when_to_use: User says "convert to HTML", "render as HTML", "make a webpage from", "analyze and visualize", asks for an "interactive" or "browsable" version of a file, or pastes a file path / URL with a request to view, share, understand, or get insights from it.
---

# html-anything

You are turning a file or URL into a **single self-contained HTML page
that surfaces the insights in the content**, not a faithful re-render of
the source. Think infographic + analysis dashboard, not document viewer.

The output should make the user say *"I learned something I didn't know
from the raw file"* — patterns, timelines, distributions, outliers,
themes — visualized as the headline. The original data goes inline so
the user can drill in, but it's the **drill-down**, not the lede.

Examples of the right shape:

- **2-person WhatsApp chat** → relationship card (cadence, response
  time, who initiates), conversation arc timeline highlighting the 5–10
  meaningful turns the LLM picked, topic clusters, emoji frequency
  graph, then the messages themselves as a collapsible thread.
- **200-person Slack channel** → top contributors leaderboard, channel
  activity heatmap by day-of-week + hour, topic cloud, recent
  highlights — full message log behind a "Show all messages" tab.
- **50K-row sales CSV** → summary stats, category breakdown chart,
  outlier callouts, time-series line — sortable table behind a
  "Browse rows" tab.
- **Long PDF / article** → 3-bullet TL;DR, pulled key quotes, section
  nav with one-line summaries — full text as a reading-mode toggle.
- **GitHub repo** → "what is this" 2-paragraph summary, architecture
  sketch, the 3 files that explain it, file tree as drill-down.

Your job is to **look at a sample, find what's interesting in it**,
design the analysis + charts + visual story, then ship the HTML+CSS+JS
that renders all of it. The full data is inlined into the HTML for
client-side rendering of the drill-down sections.

## Behavior

1. **Identify the source.**
   - File: use extension + content sniff (`Read` the file).
   - URL: match against patterns (github.com/owner/repo, medium.com/*,
     substack.com/*, etc.) (`WebFetch` the URL).

2. **Look up the matching prompt** in `prompts/<source-type>.md`. The
   prompt contains source-specific guidance for design decisions and the
   data shape you'll work with. If no specific prompt fits, use
   `prompts/default.md`.

3. **Read a sample, not the whole thing.** ~5–15 KB is plenty.
   - Tabular data: header + first 5 rows + last 2 rows + column stats.
   - Chat: first 8 + last 4 messages + sender list.
   - Long text: first 1500 chars + headings + word count.
   - URL article: first 2-3K chars of the rendered text + meta.
   - Repo: README + tree + 3 key files.

4. **Design the page**, following the source-specific prompt's guidance.
   Include:
   - Light + dark mode (via `prefers-color-scheme`).
   - Mobile-first responsive layout.
   - Search box that filters or highlights matching content.
   - "Copy as Markdown" button where it makes sense.
   - Single self-contained HTML — inline CSS, inline JS, no external
     dependencies except a Google Font import if useful.

5. **Inline the full data.** Embed it as a JSON literal:
   ```html
   <script>const DATA = /* the full data here */;</script>
   ```
   Escape `</script>` to `<\/script>` inside the JSON string to keep the
   browser parser happy. The JS you wrote uses `DATA` to render rows /
   messages / sections — the LLM (you) only ever saw the sample, but the
   page renders the full thing client-side.

6. **Write the file** to `<input-stem>.html` next to the input (or
   wherever the user asked).

## Sources supported

| Prompt file | When |
|---|---|
| [`prompts/whatsapp.md`](./prompts/whatsapp.md) | WhatsApp `_chat.txt` export |
| [`prompts/csv.md`](./prompts/csv.md) | CSV / TSV tabular data |
| [`prompts/markdown.md`](./prompts/markdown.md) | Markdown documents |
| [`prompts/json.md`](./prompts/json.md) | JSON data files |
| [`prompts/github-repo.md`](./prompts/github-repo.md) | github.com/owner/repo URLs |
| [`prompts/url-article.md`](./prompts/url-article.md) | Blog posts, news articles, long-form web pages |
| [`prompts/default.md`](./prompts/default.md) | Anything else |

**Adding a new source** = drop a new `<source>.md` in `prompts/`,
following the same shape as existing ones. No code changes, no
registration step. The skill auto-finds it.

## Hard rules

- **Single file out.** No multi-file SPAs. Email-attachable.
- **Self-contained.** Must work offline by double-clicking.
- **Don't render data through the LLM.** You see the sample only. The
  full data is inlined into the HTML and rendered client-side by JS you
  write. This way the same skill handles a 50-row CSV and a 500K-row
  CSV the same way.
- **Don't write a generic template.** Read the sample. Look at the
  shape. Pick the layout that fits *this* content. A different sample of
  the same source should produce a different design.
