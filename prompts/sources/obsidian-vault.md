# obsidian-vault — Obsidian-style markdown vault

A directory of `.md` files cross-linked with Obsidian's `[[wikilink]]`
syntax (also any markdown folder that uses wikilinks heavily, even
without an `.obsidian/` config). The parser already resolved every
wikilink against title + filename + path and stripped aliases /
section anchors.

Lean into the **graph identity** of the vault — a working Obsidian
vault is a *web*, not a directory. The concept map is the headline
visualization. The hubs (`topHubs`) are the user's "second brain
landing pages".

## What's distinctive about this source

- **Wikilinks render as pill chips** in the drill-down note body, not
  as raw `[[Title]]`. Each chip should be a click target that scrolls
  the linked note into view (or opens it in an adjacent panel).
- **Daily notes are common** — if a folder is named `Daily/` or
  notes are named like `YYYY-MM-DD.md`, surface a "daily-note streak"
  panel: cadence, longest run, last touched. Recurring users care.
- **Frontmatter tags + inline `#tag` tags** are both first-class. The
  parser already merged them into `note.tags` and rolled them up into
  `topTags`. Render tag chips next to titles in the drill-down.
- **MOC notes** ("maps of content") are a common pattern — notes that
  exist primarily to link out. Surface them naturally as top hubs:
  notes with `outboundCount >> inboundCount` are MOCs; notes with
  `inboundCount >> outboundCount` are landing pages people refer to.
- **Embeds** (`![[Note]]`) and **block refs** (`[[Note#^block]]`)
  exist; treat them as outbound links for graph purposes (the parser
  already does this).

## Graph rendering preference

Obsidian users *expect* a graph view. For vaults under ~80 notes,
render an actual SVG graph (force-direction approximation: nodes
arranged radially around the densest hub, edges drawn as thin curves
between them, hub size scales with `inboundCount`). For larger
vaults, switch to a "list-graph" hybrid: a sorted hub leaderboard
where each hub shows its top 4–6 inbound + outbound chips inline.

## Tone

Personal-knowledge-management register. "The vault has 14 notes and
88 cross-note links — Pricing V2 is the densest hub with 11
incoming, and there are 2 stale notes in Resources/" reads right.
The output is for the *owner* of the vault, not for an outsider — be
candid, specific, and slightly opinionated about what's drifting.

## See also

The shared knowledge-base contract above defines the required
sections (concept map, themes, TODO/stale/orphan callouts, knowledge
atlas drill-down, hub leaderboard) and the data shape — this prompt
is the per-source supplement, not a replacement.
