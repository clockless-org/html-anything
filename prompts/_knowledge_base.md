# Knowledge base / multi-document markdown (shared)

This prompt is shared by every "folder of markdown" source: **Notion
markdown exports**, **Obsidian vaults**, and **generic markdown
directories** (Hugo content folders, Bear exports, "Notes"
directories). The parser walks the folder, builds a backlink graph,
extracts tags + TODOs, and inlines every note's full text. Don't
re-walk the corpus on the client — use the pre-built aggregations.

The output is **not a file browser or wiki clone**. It's a *concept
map* of the user's notes — what's connected, what's the hub, what's
been sitting unread, what's still on the to-do list — with the full
notes as drill-down.

## Required sections (must always render — non-negotiable)

These five sections form the knowledge-base contract. The page
**must** include all of them, with the literal section labels visible
somewhere in the rendered DOM. Hard constraint; do not skip any of
them even on a small vault.

1. **Concept map / backlink graph** — a graph or list-graph hybrid of
   notes and their connections, drawn from `DATA.graph.nodes` +
   `DATA.graph.edges` and `DATA.topHubs`. Render as inline SVG. Node
   size scales with `inboundCount` (the more notes link here, the
   bigger the hub). On vaults under ~80 notes, draw an actual force-
   directed-style or radial graph with edges visible. On larger
   vaults, fall back to a list-graph hybrid: a leaderboard of the top
   hubs with their incoming/outgoing connections shown as inline
   chips. The literal heading "Concept map" / "Connections" /
   "Backlink graph" or equivalent must be visible.
2. **Theme clusters / tag panel** — visualize how the corpus splits
   along themes. Use `DATA.topTags` (frontmatter + inline `#tag`
   tags) when present, falling back to `DATA.themeClusters` (which
   the parser fills with top-folder groupings if no tags exist). For
   each theme: name + count + a clickable pill that filters the
   drill-down. The literal heading "Themes" / "Tags" / "Clusters" or
   equivalent must be visible.
3. **TODO / stale / orphan callouts** — three labeled callout blocks.
   - **TODOs**: card with `DATA.todoStats.openCount` open items and
     5–8 representative lines from `DATA.topTodos` (each with a link
     back to its note).
   - **Stale notes**: card showing notes from `DATA.stale` (older than
     the family's stale threshold, default 60 days) with `ageDays` per
     row.
   - **Orphans**: card showing notes from `DATA.orphans` (notes with
     no inbound links) with the title + folder + age.
   If any of the three lists is empty, render the card with a friendly
   placeholder ("No open TODOs in this vault.") rather than omitting
   it. The literal labels "TODO" / "Open todos" / "Stale" / "Orphan"
   / "Unlinked" or equivalents must be visible. All three matter —
   they answer "what's owed?" "what's drifting?" "what's lonely?".
4. **Searchable knowledge atlas (drill-down)** — a collapsible
   "Browse all N notes" section with the full corpus, default
   collapsed so the analysis is the headline. Inside: virtualized or
   paginated note cards / rows showing title + path + tag chips +
   wordCount + age + open-todo count. Filter chips for tags + folder
   + status (orphan / stale / has-todos). Full-text search across
   `title` + `path` + `tags` + `excerpt`. Click a note to expand
   its full body (rendered from `note.raw`) in a side panel or
   accordion, plus an inline list of its inbound + outbound links
   with click-through to the linked notes' full bodies. The drill-
   down is a hard requirement; without it the analysis can't be
   trusted.
5. **Top-pages index / hub leaderboard** — a labeled "Hubs",
   "Most-linked notes", or "Index" section pulling
   `DATA.topHubs`. For each hub: title + inbound count + outbound
   count + a one-line excerpt. This is what tells the user "if you
   only re-read 6 notes from this vault, these are the 6". Visible
   heading "Top notes" / "Hubs" / "Most-linked" or equivalent.

Render these five regardless of vault size. They're the contract;
without them the output is incomplete.

## What else to surface (pick what fits the vault's shape)

- **Vault summary card (top)** — note count, total cross-note links,
  unique tags, total open TODOs, distinct folders, and a one-sentence
  read on the corpus ("14 notes, 88 links, 5 tags, 26 open TODOs —
  Pricing V2 is the densest hub with 11 inbound links, and the
  Resources/ folder has two stale notes from late 2025").
- **Folder breakdown** — a pinned panel showing top-level folders +
  note count per folder + open-todo count per folder.
- **Recently-touched timeline** — a horizontal date strip plotting
  notes by `updatedFromFrontmatter` / `ageDays`. Helps spot the
  rhythm: daily notes consistent? project notes only when shipped?
- **Longest notes** — list from `DATA.longestNotes` (the deep-dives,
  the pinned essays). These often deserve their own re-read pass.
- **Daily-note streak** (if the vault has a `Daily/` folder or notes
  whose titles parse as ISO dates) — the cadence visualization,
  longest run, last touched.

Don't try to do all of these. Pick 2–4 beyond the required five,
based on what the data supports.

## Interaction discipline

- The tag / folder / state filter chips should **compose**, not
  override each other. Clicking "project" + "has-todos" filters the
  drill-down to project notes with open TODOs. The summary card
  stays static; only the atlas / map adjusts.
- Search box should match across title + path + tags + excerpt.
  Highlight matches inline.
- Clicking any callout (a stale note, an orphan, a top todo, a hub)
  should jump to that note's expanded view in the drill-down.
- Avoid editing UI. This is a read-only audit — no inline TODO
  checkbox, no "rename note" action, no drag-to-reorganize. Surfaces,
  not actions.

## Always include

- Light + dark mode (`prefers-color-scheme`).
- Mobile-first responsive — graph collapses to a hub leaderboard on
  narrow viewports, theme chips wrap, callouts stack.
- Concept map renders inline SVG (no Cytoscape, no D3 imports). For
  vaults over ~150 notes, render the list-graph hybrid instead of an
  edge-heavy SVG.
- Keep the page under ~1.5 MB inlined where possible. Most vaults
  under 100 notes are <500 KB; only multi-thousand-note exports get
  heavy.
- "Copy as Markdown" of the analysis section — paste-ready into a
  weekly review, a vault audit doc, or a status update.
- Full-text search across the note list.
- Drill-down note bodies render with a tiny inline markdown parser
  (~80 lines covers headings, paragraphs, lists, blockquotes, code
  fences, inline code, bold, italic, links, wikilinks rendered as
  pill chips that jump to the linked note).

## Data shape

Every knowledge-base parser feeds the same notes array plus
aggregations. Treat them generically.

```ts
DATA = {
  kind: "notion-export" | "obsidian-vault" | "markdown-folder",
  notes: [
    {
      id: "projects/pricing v2",
      path: "Projects/Pricing V2.md",
      filename: "Pricing V2.md",
      title: "Pricing V2",
      tags: ["project", "pricing"],
      wordCount: 412,
      headingCount: 8,
      headings: [{ level: 1, text: "Pricing V2" }, ...],
      outboundLinks: ["projects/onboarding 2.0", "people/sarah kim", ...],
      inboundLinks: ["index", "people/mira chen", "projects/series a", ...],
      outboundCount: 7,
      inboundCount: 11,
      todoOpenCount: 4,
      todoTotalCount: 4,
      todos: [{ line: "Final copy pass with Alex Rivera by Friday", done: false }, ...],
      updatedFromFrontmatter: "2026-05-07",
      ageDays: 2,
      isStale: false,
      isOrphan: false,
      excerpt: "Replacing the legacy three-tier page. Live A/B running since...",
      raw: "---\ntitle: Pricing V2\n...",
      notionPageId: undefined
    }
  ],
  topHubs:        [{ id, title, path, inboundCount, outboundCount }],
  orphans:        [{ id, title, path, ageDays?, updatedFromFrontmatter? }],
  stale:          [{ id, title, path, ageDays, updatedFromFrontmatter? }],
  todoStats: {
    openCount: 26,
    totalCount: 28,
    topNotesByOpenTodos: [{ id, title, path, openCount }]
  },
  topTodos:       [{ noteId, noteTitle, line }],
  topTags:        [{ tag, count, notes: ["id1", "id2", ...] }],
  themeClusters:  [{ name, tag?, noteIds, size }],
  longestNotes:   [{ id, title, path, wordCount }],
  graph: {
    nodes: [{ id, title, size }],
    edges: [{ from: id, to: id }]
  },
  totalOutboundLinks: 88,
  totalInboundLinks: 88,
  totalNotes: 14,
  totalTags: 12,
  meta: { sourceFile, sizeBytes, kind, ... }
}
```

Use the pre-aggregated arrays directly. Do **not** re-walk the
`notes` array to derive top-hubs / orphans / stale / theme clusters
on the client — the parser already did the math, and re-deriving on
big vaults kills the page.

## Tone

Knowledge-worker register. The output should read like a quarterly
notes audit or a "second brain" review, not a marketing dashboard.
"The Resources/ folder has two stale notes from late 2025 and one
true orphan" is a sentence; "Stale: 2, Orphans: 1" is a metric. Use
sentences in the cards, metrics in the charts. Mono numerics. Direct.

## Privacy / safety note (include in the page footer)

Notion / Obsidian / personal-notes folders almost always contain
real names, customer references, internal strategy, and private
thoughts. Add a small footer line:

> *Generated locally — your vault never left your machine. The full
> note bodies are embedded in this HTML and rendered in your
> browser. For sharing, prefer an anonymized export.*
