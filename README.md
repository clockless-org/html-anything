# html-anything

> Turn any file into a beautiful, interactive, shareable HTML.

```
$ html-anything chat.zip
→ chat.html  (1 file, self-contained, opens in any browser)
```

WhatsApp exports, PDFs, meeting transcripts, CSVs, codebases, mbox archives —
drop in a file, get back **a single self-contained HTML** with a modern reading
experience: dark mode, search, filters, timeline, charts, navigation. No server,
no account, no install on the receiving end. Open it. Send it. Host it. Done.

Inspired by [Thariq's "Unreasonable Effectiveness of HTML"][thariq-post] and
the [HKUDS/CLI-Anything][cli-anything] thesis that **tomorrow's users are agents**:
if HTML is what humans read best, agents should produce HTML.

[thariq-post]: https://x.com/trq212
[cli-anything]: https://github.com/HKUDS/CLI-Anything

## See it

Live examples:

- [**Markdown**](https://clockless-org.github.io/html-anything/markdown/output.html) — long-form essay with search + dark mode + TL;DR
- [**WhatsApp export**](https://clockless-org.github.io/html-anything/whatsapp/output.html) — `_chat.txt` parsed into a scrollable summary
- [**CSV**](https://clockless-org.github.io/html-anything/csv/output.html) — sortable, searchable, sticky-header table

(Or open the `examples/*/output.html` files locally — every output is a single self-contained file.)

## Why

| Source format | What you get today | What you actually want |
|---|---|---|
| WhatsApp `_chat.txt` export | Raw text in a phone backup | A scrollable timeline, search, sender filters, media inline |
| 80-page PDF | A scrolling viewer | Sectioned navigation, summary, copy-anywhere |
| Meeting transcript | A wall of speaker turns | Speaker timeline, search, key-moments highlight reel |
| CSV with 50K rows | Excel chokes | Sortable, filterable, charts you can paste in Slack |
| `.mbox` archive | mailclient required | Conversation threads, search, dark-mode reading |
| Codebase | `cd` into editor | Annotated explainer with diagrams |

Existing converters (`pandoc`, format-specific viewers) produce *correct* but
*plain* output. `html-anything` is **opinionated and AI-aware** — it picks
the right reading experience for the input type, fills in structure the source
file lacks, and ships interactivity (search, filter, copy) by default.

## Install

```bash
npm install -g html-anything
# or
npx html-anything <file>
```

## Usage

```bash
html-anything chat.zip                   # WhatsApp export → chat.html
html-anything paper.pdf                  # PDF → paper.html
html-anything transcript.vtt             # Meeting → transcript.html
html-anything data.csv                   # CSV → data.html
html-anything ~/Mail/Archives            # mbox → archives.html

html-anything chat.zip --out share.html  # custom output path
html-anything paper.pdf --no-ai          # skip LLM enrichment, fast path only
html-anything chat.zip --inline-media    # base64 photos/voice into the HTML
```

The output is **a single `.html` file** with all CSS / JS / fonts / icons
inlined. Open it in any browser. Email it. Drop it in a Slack DM. Host it on
GitHub Pages, S3, or anywhere static files live.

## What's in v0

The roadmap is converters, not framework. v0 ships **3 strong converters** —
not 30 weak ones.

- ✅ **`markdown`** — markdown file → richer reading experience (TOC, search, syntax highlighting, dark mode).
- 🚧 **`whatsapp`** — `_chat.txt` + media folder → scrollable bubble timeline, search, sender filters, inline media.
- 🚧 **`csv`** — CSV (any size) → sortable, filterable table with auto-charts on numeric columns.

Stubs for `pdf`, `mbox`, `vtt` (meeting transcripts), `code-explainer` are in
`src/converters/` — picked up automatically once they implement the contract
(see [CONVERTERS.md](./docs/CONVERTERS.md)).

## How a converter works

A converter is a single file that exports two things:

```ts
export const converter: Converter = {
  // file extensions / mime types this converter handles
  matches: ['.txt', '.zip'] as const,

  // optional: a heuristic to confirm before claiming the file
  detect: (filepath: string) => boolean,

  // produce a single HTML string from the input
  render: async (input: ConverterInput) => Promise<string>,
}
```

`render` returns a self-contained HTML string. Use the shared
`<DocShell>` skeleton (in `src/shared/shell.ts`) for the layout, dark mode,
and search; fill in the body with whatever's right for your format.

LLM access is optional. When `--ai` is on (default), converters get a `llm`
helper that lets them ask Claude / GPT for things like "extract the chapters
from this PDF" or "summarize this meeting in 3 bullets." When `--no-ai` is
set, they skip it — `csv` works fine without; `code-explainer` doesn't.

## Design principles

1. **Single file out.** No multi-file SPAs, no separate CSS / JS. Email it.
   Self-contained `.html`, every time.
2. **Opinionated, not configurable.** Every converter has one good design.
   No themes, no flags, no plugins-of-plugins. Match input type → output
   experience tightly.
3. **Search and copy always.** Every output has Cmd-F search and a
   "Copy as markdown" button. Non-negotiable.
4. **Mobile-first.** The output should look right on a phone, because
   that's where most people will read what you sent.
5. **AI is a fallback for structure**, not the renderer. Converters do
   the parse + layout. The LLM fills in things the file doesn't have
   (chapter titles for an unstructured PDF, sender categorization,
   topic tags) — but the HTML is always reproducible.

## Contributing

The fastest contribution: a new converter. Pick a format that produces
ugly output today (Slack export, Notion export, `.eml`, Spotify Wrapped JSON,
your weird archive format) and write a converter for it.

See [docs/CONVERTERS.md](./docs/CONVERTERS.md) for the contract.

## License

[Apache 2.0](./LICENSE)
