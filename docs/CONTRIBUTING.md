# Contributing to html-anything

The whole project is shaped to make adding a new format a small, isolated
contribution. Most of what makes `html-anything` interesting (the layout
decisions, the interactivity, the typography) is the LLM's job — your
parser just needs to make the file legible to the LLM.

## What's a "parser"

A parser is a single file in `src/parse/<format>.ts` that exports:

```ts
export const parser: Parser = {
  name: "your-format",
  matches: [".ext"],          // file extensions
  detect: async (path) => {   // optional — for ambiguous extensions
    // peek at content, return true if you claim the file
  },
  parse: async (filepath) => {
    // load the file, return a ParsedFile
  },
}
```

A `ParsedFile` is the contract between your parser and `htmlize`:

```ts
{
  contentType: "your-format",                 // a label htmlize anchors design on
  summary: "...one human-readable sentence...",
  sample: { /* small object the LLM sees verbatim — ~5-20 KB */ },
  data:   { /* full data, inlined into the output as JSON */ },
  meta:   { sourceFile, sizeBytes, ...stats },
}
```

The split between `sample` and `data` is the architectural trick:

- `sample` is what the **LLM** sees (so it can decide layout and write JS).
- `data` is what the **rendered HTML** uses (full file, no truncation).

The parser is responsible for choosing a `sample` that's both **small**
(fits in an LLM prompt easily) and **representative** (shows the schema
and value distribution well enough for the LLM to design for the full
data). Look at `src/parse/whatsapp.ts` for a clean example: the sample is
counts + first 8 + last 4 messages.

## Three rules

1. **Parsers don't render.** They emit JSON. Layout, CSS, JS — that's the
   LLM's job in `htmlize`. If you find yourself writing HTML strings in
   a parser, stop and reshape that as data instead.
2. **`sample` should be small.** The LLM sees this verbatim — keep it
   under ~16 KB stringified. For tabular data, sample rows. For chat
   logs, sample messages. For text, sample paragraphs.
3. **No external API calls.** Parsers are sync-and-fast. If the format
   needs heavy work (PDF rendering, OCR), that's fine — but it should
   still be a one-shot transformation, not a service.

## Plugin model

For now, parsers ship inside this repo (PR them to `src/parse/`).
Once the project stabilizes, the plan is npm-package auto-discovery:
any installed package named `html-anything-<name>` exporting a `parser`
gets registered at startup. If you want to ship a private parser, you
can do this today by importing the registry programmatically:

```ts
import { parsers } from "html-anything/parse"
import { parser as myParser } from "./my-parser.js"
parsers.unshift(myParser)
```

Open issue [#1](https://github.com/clockless-org/html-anything/issues)
to discuss the convention.

## Quick start

```bash
git clone https://github.com/clockless-org/html-anything
cd html-anything
npm install

# write src/parse/myformat.ts
# register it in src/parse/index.ts

# regenerate examples to make sure nothing else broke
npm run examples

# try it
npx tsx src/cli.ts ~/path/to/your/sample.myformat
```

## What we want next

In rough priority:

- **PDF** — extract text + structure (chapters, tables) → JSON for the
  LLM to design TOC + reading view + summary
- **mbox** — email archives → conversation threads
- **Slack/Discord exports** — multi-sender chat with channels
- **VTT / SRT** — meeting transcripts → speaker timeline + jumpable index
- **iMessage backup**
- **Gmail Takeout**
- **Code repo** (point at a directory, get an explainer)
- **JSON Lines / NDJSON** for log streams

Pick whichever bugs you most when its current viewer makes you sad.
