# trello-board — Trello board JSON export (`{ lists, cards, members, labels, ... }`)

A Trello board JSON export from `Show menu → More → Print and Export
→ JSON`. Top-level shape: `{ id, name, desc, lists: [{ id, name }],
cards: [{ id, name, desc, idList, idMembers, idLabels, due, dueComplete,
dateLastActivity }], members, labels, checklists, actions }`.

The output is **not a kanban board re-render** — it's a **board
audit** that makes the user say *"oh, here's where this board is
clogged / who's loaded up / what's been sitting"* — with the raw
cards as drill-down. Read-only, no drag-and-drop.

## What to surface (the headline of the page)

Look at the sample (board name, lists, card counts per list, member
load, due dates, stale activity, labels) and **infer + visualize**:

### Board card (top)

- **Board name** — from `DATA.board.name` (also `meta.boardName`).
- **Total open cards** — `DATA.totals.items`, big mono.
- **Lane split** — `DATA.tasks.lanes` rendered as a stacked
  horizontal bar segmented by list, each segment labeled with list
  name + count.
- **Overdue + stale counts** — KPIs from `DATA.totals.overdue` /
  `DATA.totals.stale`. Stale threshold: ≥ 14 days since last
  activity.
- **Headline read** — one sentence, hedged where appropriate:
  *"34 open cards across 5 lists — 12 in 'In Progress', 8 stale
  (>2 weeks no activity), 4 overdue."*

### Lane breakdown (required, this is the headline shape for Trello)

Render `DATA.tasks.lanes` as a horizontal swimlane / stacked column
chart:

- one column per list, height proportional to card count
- color-code "in progress" lists in `var(--primary)`, "done" lists
  muted, others neutral
- each column labeled with list name + count
- click a column → filter the drill-down list to that lane

This is the *"where work is pooling"* glance for a kanban board.

### Member load

Leaderboard from `DATA.tasks.assigneeCounts`. Each row:

- member name (body)
- mini stacked bar showing distribution across lanes (open / in-
  progress / done)
- total assigned count (mono)
- "oldest stale" badge when `oldestStaleDays >= 14`

If unassigned cards exist with non-trivial counts, call them out
("12 cards have no assignee — likely the back of the backlog;
unowned work tends to age").

### Bottlenecks (required)

Cards from `DATA.tasks.bottlenecks`. Same format as the issue-
tracker pack: name, in-flight count, oldest stale days, hedged
one-sentence read.

### Stale cards (required)

Cards from `DATA.tasks.staleItems`. Each card:

- title (body)
- ageDays + lane + owner (mono)
- hedged one-line read ("In 'Doing' for 23 days, last touch by
  Alex — possibly stalled on a dependency, worth a sync.")

### Overdue cards

When `DATA.tasks.overdueItems` is non-empty, render a chronological
strip — cards ordered by `due`, badged with days overdue. Highlight
in `var(--red)`.

### Labels cloud

If `DATA.tasks.labelCounts` is non-empty, render a small chip cloud
of the top labels with count badges. Useful for a board where labels
encode area / pillar / team.

### Checklist completion (when present)

If cards in the sample carry `raw.checklistTotal > 0`, surface a
small panel:

- top 5 cards by checklist progress (`{ id, title, "X / Y" mono }`)
- one-line read on overall progress ("Of 14 cards with checklists,
  38% of items are complete.")

### Story-map / kanban view

A read-only kanban render of `items` grouped by `list`:

- columns sorted by board position (`pos` if present, else
  `lanes` order)
- each card: title (body), member initials, priority chip if
  set, due chip (red if overdue, neutral otherwise), checklist
  progress chip if `raw.checklistTotal`
- cap at ~25 cards per column in the static view; "+N more" link
  scrolls to the drill-down filtered to that lane

### Card drill-down

Below the analysis, include the **full card list** (default
collapsed):

- Filter chips composing across lane, owner, label.
- Search by title + description + label + owner.
- Each row: lane (chip), title, owner (mono initials), labels
  (chips), age, due (mono red if overdue), checklist progress (mono
  if any).
- Click row → expand description, full member list, all labels, full
  due timestamp, full checklist items if any, link to the card URL
  (`url`).

## Required sections (must always render — non-negotiable)

1. **Board card** — labeled "Board" panel with total + lane split +
   overdue + stale + headline.
2. **Time / work allocation** — labeled "Lane breakdown" or "Where
   work is" panel; the swimlane chart.
3. **Owner / status / label filters** — chips, composed with the
   drill-down. "Members" + "Lanes" labels visible.
4. **Bottlenecks** — labeled panel with cards or placeholder.
5. **Stale cards** — labeled panel with cards or placeholder.
6. **Roadmap / kanban view** — labeled "Board" view, the read-only
   kanban swimlanes.
7. **Searchable card drill-down** — labeled "Browse all cards"
   collapsible.

## Tone

PM / team-lead register. Honest about WIP overload and stuck cards,
hedged on causes ("possibly stalled on a dependency"; not "Alex
forgot"). Mono numerics, body sentences. The "Copy as Markdown"
output should sound like a board health check ("Board: 34 open across
5 lists. Lane split: Doing 12, Review 6, Done (recent) 8. Stale > 14d:
8. Overdue: 4. Top member load: Mira 9 (5 in Doing, 1 stale 23d).").
