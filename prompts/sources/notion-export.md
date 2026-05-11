# notion-export — Notion "Markdown & CSV" workspace export

A folder produced by Notion's **Export → Markdown & CSV** flow. Every
page is a `.md` file whose name ends with the page's 32-character
hex ID (e.g. `Pricing V2 0a1b2c3d4e5f6789abcdef0123456789.md`).
Subpages are stored in a sibling folder of the same name (matching
hash), and links between pages are markdown-style with the same
hash suffix in the URL. Database-shaped pages are exported as `.csv`;
those go through the planning / finance / generic CSV parsers, not
this one — this prompt is for the multi-document part of the export.

## What's distinctive about this source

- **Filenames carry IDs.** Show the cleaned title (the parser already
  stripped the hash via `note.title`) prominently; the hash itself
  goes in monospace as `notionPageId` for users who want the source-
  of-truth reference.
- **Folder structure mirrors Notion's tree.** Top-level pages live at
  the export root; children live in their parent's matching folder.
  The "Folder breakdown" panel maps directly to the Notion page tree
  — surface it.
- **No wikilinks.** Notion uses `[Title](Page%20Name%20<hash>.md)`
  for cross-page links. The parser already resolved these via the
  hash-suffix index. Outbound counts are accurate; show them.
- **Database rollups** export as `.csv` siblings — the user often has
  *both* the page export and database CSVs. If you see notes that
  reference a CSV that's outside the parsed corpus, mention it as an
  "external reference" but don't try to inline it.
- **Frontmatter is rare** — Notion pages don't ship YAML frontmatter
  by default. Most metadata in `note.tags` will come from inline
  `#tag` patterns or from page-property exports the user adds. Don't
  over-promise tag clusters; if `topTags` is short, lean harder on
  `themeClusters` derived from folder structure.

## Rendering preference

The Notion mental model is **pages with structure**, not a graph. So
weight the rendering toward:

- **Page tree** — folder breakdown and a Notion-style indented list
  of titles in the drill-down. Indent by folder depth.
- **Page index / dashboard** — top-level pages get a hub-card row,
  with inbound link counts and excerpt.
- **Concept map as supplement** — still required (it's family
  contract), but smaller / secondary; the page tree is the headline
  layout for Notion exports.

## Tone

Workspace-audit register, like a "what's in this Notion?" report a
new hire might write up. "There are 47 pages, 3 top-level areas
(Engineering, Sales, People), and 14 pages haven't been touched in
60+ days" reads right. Mono for the page IDs; body type for titles.

## See also

The shared knowledge-base contract above defines the required
sections — this prompt is the per-source supplement that biases
rendering toward the page-tree shape Notion users expect.
