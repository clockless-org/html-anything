# issue-tracker — Linear / Jira / GitHub Issues / Asana / ClickUp / generic CSV

A project / task export: a CSV of issues, tasks, or tickets where the
header row carries at least a title column (Title / Summary / Name /
Task / Issue Title) and a status column (Status / State / Stage), plus
one or more tracker-shaped columns (Assignee, Priority, Identifier,
Issue key, Project, Sprint, Cycle, Labels, Components, Due Date,
Reporter, Estimate). The flavor is auto-detected — Linear, Jira,
GitHub Issues, Asana / ClickUp, or generic — and surfaced as the
chrome label.

The output is **not a spreadsheet** — it's a **project audit** that
makes the user say *"oh, here's where this project is bottlenecked
/ what's been sitting / who's overloaded"* — with the raw issue list
as drill-down.

## What to surface (the headline of the page)

Look at the sample (status counts, priority spread, assignee load,
stale items, overdue items, labels, lanes, cycle time when present)
and **infer + visualize**:

### Project card (top)

- **Tracker flavor** — from `DATA.format` (Linear / Jira / GitHub
  Issues / Asana / ClickUp / generic). Small chip near the title.
- **Total items** — count, big mono.
- **Status split** — open / in-progress / in-review / done / blocked
  / cancelled, sourced from `DATA.tasks.statusBucketCounts`. Render
  as a stacked horizontal bar (one bar, segmented by bucket).
- **Overdue + stale counts** — twin small KPIs. Pull from
  `DATA.tasks.totals.overdue` and `DATA.tasks.totals.stale`. Stale
  threshold: ≥ 3 weeks since last update.
- **Headline read** — one sentence, hedged where appropriate:
  *"38 issues across 4 lanes — 17 open, 8 stale (>3 weeks no
  movement), and 2 owners hold 60% of in-progress work."*

### Status flow (required)

A horizontal status flow bar showing the funnel from open →
in-progress → in-review → done with the count + share at each stop.
Pull from `DATA.tasks.statusBucketCounts`. Reveals where work pools
up (e.g. lots of in-review = review bottleneck; lots of open = intake
debt).

### Assignee load

Leaderboard from `DATA.tasks.assigneeCounts`. Each row:

- name (body)
- mini stacked bar showing open / in-progress / done split
- total count (mono)
- "oldest stale" badge (mono) when `oldestStaleDays >= 21`

Sort by `(open + in_progress)` descending — the "who has the most
unfinished" view.

If `(unassigned)` rows exist with non-trivial counts, surface them
explicitly; unassigned work is usually the second-most-actionable
finding after stale work.

### Priority distribution

Bar chart of `DATA.tasks.priorityCounts` (P0 → P4 / Urgent → Trivial).
Highlight overdue slices in `var(--red)`. Useful as a "are P1 items
actually getting worked, or are we stacked on P3s?" check.

### Bottlenecks (required)

A labeled "Bottlenecks" panel with cards from
`DATA.tasks.bottlenecks`. Each card:

- name (mono)
- "N items in flight, oldest sitting M days" mono line
- one-sentence hedged read ("Mira holds 6 in-progress + 2 in-review;
  oldest moved 32 days ago — likely overloaded or blocked elsewhere.")

If no bottlenecks qualify (no owner with ≥ 4 open items or anything
≥ 21 days stale), render a placeholder card ("No single owner
clearly bottlenecked — work is distributed.").

### Stale items (required)

Cards from `DATA.tasks.staleItems`. Each card:

- title (body)
- ageDays + owner + status (mono)
- one-line hedged read ("Open 47 days, last touched by Alex in
  status 'In Progress' — worth a triage pass; may be silently
  blocked.")

If no stale items, render an empty-state card ("Backlog is small
enough or recent enough that nothing has gone stale.").

### Overdue items

If `DATA.tasks.overdueItems` is non-empty, render a small
chronological strip — rows ordered by due date, badged with how many
days overdue. Highlight in `var(--red)`. Skip the section silently if
there are no due dates in the dataset.

### Cycle time

If `DATA.tasks.cycleTime.medianDays` is non-null, render a small
panel:

- median days from create → close (mono, big)
- p95 days (mono)
- one-line hedged read ("Median ship: 4.2d; p95: 18d — long tail
  suggests a few items got stuck rather than a uniform slowdown.")

### Roadmap / story-map view

A swimlane render of `items` grouped by `list` (when from Trello) or
by `project` (when from a tracker with project / sprint / epic
columns) or by `statusBucket` (fallback). Each lane:

- header with lane name + count + open vs done split
- inline stack of cards (title mono-ish; owner avatar / initials;
  priority chip; due chip if overdue)
- click a card → expand the full row inline (description, labels,
  full assignee list, dates).

Cap at ~30 cards per lane in the static view; rest collapses into a
"+N more" link that scrolls to the drill-down filtered to that lane.

### Issue drill-down

Below the analysis, include the **full issue list** (default
collapsed):

- Filter chips composing across status (bucket), priority, owner,
  label, project / lane.
- Search by title + description + label + owner + identifier.
- Columns: identifier (mono, when present), title, status (chip),
  priority (chip), owner (mono), age (mono "12d"), due (mono red if
  overdue).
- Click row → expand description + all labels + reporter + cycle
  time + URL (link out if present).
- Highlight overdue rows red, stale rows yellow, completed rows
  muted.

## Required sections (must always render — non-negotiable)

1. **Project card** — labeled "Project" / "Backlog" / "Issues" panel
   with totals + status split + overdue + stale + headline.
2. **Status flow** — labeled "Status" / "Flow" panel with the
   open → done funnel.
3. **Owner / status / priority / label filters** — chips, composed
   with the drill-down list. "Owners" + "Status" labels visible.
4. **Bottlenecks** — labeled panel with cards or placeholder.
5. **Stale items** — labeled panel with cards or placeholder.
6. **Roadmap / story-map / lanes view** — visible heading; swimlanes
   drawn from `lanes` / `items`.
7. **Searchable issue drill-down** — labeled "Browse all issues"
   collapsible.

## Tone

PM / engineering-lead register. Honest about bottlenecks and
overload, careful not to assign blame. "Mira holds 6 in-progress
items, oldest stale 32 days — worth a triage" is good; "Mira is
slow" is not. Mono numerics, body sentences. The "Copy as Markdown"
output should sound like a sprint retro / planning audit ("38 items
across 4 lanes — 17 open, 14 done. Stale: 8 items > 21 days. Owner
load: Mira 6, Alex 4. Cycle time median 4.2d / p95 18d.").
