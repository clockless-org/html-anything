# markdown-folder — generic directory of markdown files

Any folder of `.md` files that isn't recognizably Notion or Obsidian:
Hugo / Jekyll / Astro `content/` directories, dumped Bear exports,
generic "Notes" folders, MkDocs `docs/`, README sets, an `INPUT/`
directory of reading notes — anything where the user has a pile of
markdown they want to *see* as a whole.

## What's distinctive about this source

- **Linking convention is unknown.** Generic markdown folders may use
  relative `[text](path/to/note.md)` links, or have no internal
  linking at all. The parser already resolved both wikilinks and
  relative markdown links — use whatever showed up. If
  `totalOutboundLinks` is small (< noteCount), the corpus is
  *list-shaped*, not *graph-shaped*; lean into a sortable list, not
  a graph.
- **Frontmatter varies.** Hugo / Jekyll posts always have YAML
  frontmatter (date, tags, draft, etc.); raw notes folders rarely do.
  Surface `note.tags` only if `topTags` is meaningful (≥ 3 tags with
  ≥ 2 notes each); otherwise prefer folder-based theme clusters from
  `DATA.themeClusters` (the parser falls back to top-folder grouping
  when tags are sparse).
- **Folder structure is the navigation.** Without wikilinks or page
  IDs, the directory tree IS the structure. Top-level folders should
  appear as the primary axis in the drill-down — group notes by
  folder by default, with tag / search filters layered on top.

## Rendering preference

Bias the layout toward the *shape that fits the data*:

- **Static-site content directories** (Hugo / Jekyll / Astro) — most
  notes have frontmatter, most have publication dates. Surface a
  "publication timeline" panel from `note.updatedFromFrontmatter` and
  a posts-by-tag view. Treat the corpus as a pseudo-blog index.
- **Reading-notes folders** (book summaries, paper notes) — often
  no internal links, lots of headings, long word counts. Lean on
  `longestNotes` and tag clusters; the concept map collapses to a
  list-graph.
- **Documentation folders** (MkDocs / Docusaurus) — heavy internal
  linking (relative `.md` links), short pages, hierarchical folders.
  Lean on the page-tree structure and the hub leaderboard.

## Tone

"Tour of the folder" register. "47 notes across 6 folders, 14 are
about engineering, 8 about reading. The longest note is the 2024
strategy retro at 3,200 words." Sentences in the cards, metrics in
the charts. Direct.

## See also

The shared knowledge-base contract above defines the required
sections — this prompt is the per-source supplement that biases
rendering toward whichever sub-shape the folder turns out to be.
