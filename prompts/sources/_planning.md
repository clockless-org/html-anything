# Planning / project (shared)

This prompt is shared by every planning source: **calendar exports
(`.ics`)**, **issue trackers (`.csv` from Linear, Jira, GitHub Issues,
Asana, ClickUp, generic)**, and **Trello boards (`.json`)**. The parser
already normalized them into the same item shape — don't write
different rendering logic per format. Use `DATA.format` and `DATA.kind`
(`calendar` vs `tasks`) to label the chrome and pick the time framing.

The output is **not a calendar viewer or a kanban board**. It's a
planning-shaped infographic that makes the user say *"oh, here's where
my time is going / where this project is bottlenecked / what's been
sitting"* — with the raw items as drill-down.

## Required sections (must always render — non-negotiable)

These five sections form the planning contract. The page **must**
include all of them, with the literal section labels visible somewhere
in the rendered DOM. This is a hard constraint; do not skip any of
them even on a small calendar or short backlog.

1. **Time allocation map** — for calendar input, a visualization of
   when time is being spent: a per-week or per-day density strip, a
   day-of-week × hour heatmap of meeting density, OR a sparkline of
   total scheduled hours per week. For task input, an equivalent
   "where work is concentrated" view: items per assignee, items per
   list / project / sprint, OR a stacked-bar of items by status per
   owner. Drive it from `DATA.calendar.weeks` /
   `DATA.calendar.busyHours` (calendar) or `DATA.tasks.assigneeCounts`
   / `DATA.tasks.lanes` (tasks). Render inline SVG. The literal
   heading "Time allocation" / "Where time goes" / "Where work is" or
   equivalent must be visible.
2. **Owner / status filters** — filter chips that toggle the drill-
   down list. For calendar: by attendee / organizer and event status
   (confirmed / cancelled / tentative). For tasks: by assignee, by
   status (open / in progress / in review / done / blocked /
   cancelled), by priority, by label. Drive them from
   `DATA.calendar.topAttendees` (calendar) or
   `DATA.tasks.assigneeCounts` + `DATA.tasks.statusBucketCounts` +
   `DATA.tasks.priorityCounts` + `DATA.tasks.labelCounts` (tasks).
   Render as toggle chips. Multi-select; clearing all chips shows
   everything. Visible "Owners" and "Status" labels (or equivalents).
3. **Stale / bottleneck callouts** — a labeled "Stale" or "Bottlenecks"
   panel. For tasks: 4–8 cards from `DATA.tasks.staleItems` (items
   open longer than the family's stale threshold) and
   `DATA.tasks.bottlenecks` (owners with too much WIP or items sitting
   too long). For calendar: cards for back-to-back blocks, overloaded
   weeks, and meeting-free streaks pulled from
   `DATA.calendar.backToBackBlocks` / `DATA.calendar.weeks` (with
   `overloaded: true`) / `DATA.calendar.meetingFreeStreaks`. If the
   data is too thin to surface anything, render a placeholder card
   ("Backlog is small enough that nothing has gone stale.") rather
   than omitting the section. The literal label "Stale" / "Bottlenecks"
   / "Overloaded weeks" / "Back-to-back blocks" or equivalent must be
   visible.
4. **Roadmap / story-map / calendar view** — a time-bounded
   visualization. For calendar: a week or month strip with each day's
   events laid out (or a Gantt-like ribbon for items with both start
   and end). For tasks: a swimlane / story-map / kanban-by-status
   render of `items` grouped by `list` (Trello) or `project` /
   `statusBucket` (issue trackers), with each lane showing item count
   + an inline stack of cards. Items with `due` should plot on a
   timeline ribbon at the top; items without due dates collapse into
   their lane. Visible heading "Roadmap" / "Calendar" / "Story map" /
   "Board" or equivalent.
5. **Searchable item drill-down** — a collapsible "Browse all N items"
   section with the full list (data inlined). Default to collapsed so
   the analysis is the headline. Inside: a virtualized or paginated
   table / list (calendars and backlogs can be 1000+ items),
   full-text search across title + description, status + owner +
   priority + label filter chips that compose with the search, click
   a row to expand the structured fields (description, attendees,
   labels, due, etc.). Highlight overdue / stale rows in the brand
   error color (`var(--red)`); completed rows muted in
   `var(--fg-muted)`. The drill-down is a hard requirement; it's how
   trust gets re-earned after the inferred analysis.

Render these five regardless of dataset size. They are the headline
shape of the planning pack — without them, the output is incomplete.

## What else to surface (pick what fits the dataset's shape)

For calendar inputs:

- **Calendar card (top)** — date range, event count, total scheduled
  hours, distinct participants, and a one-sentence read on the
  calendar ("12 days, 47 events, 38h scheduled — Tuesdays carry 60%
  of meeting load and there are 4 back-to-back blocks of 3+ meetings").
- **Recurring series** — a pinned panel listing recurring events
  (standups, weekly 1:1s) pulled from `DATA.calendar.recurring`. Each
  with title + count + cadence chip. These are the "always-on" load
  before anything else gets booked.
- **Top attendees / organizers** — leaderboards from
  `DATA.calendar.topAttendees` and `DATA.calendar.topOrganizers` —
  who you spend the most time with, who books the most.
- **Longest events** — list from `DATA.calendar.longestEvents` (the
  90-min+ deep-work blocks, off-sites, board meetings) — useful as
  "where the big chunks went".
- **Day-of-week / hour heatmap** — a 7×24 matrix shaded by event
  count (or total minutes) from `DATA.calendar.busyHours`. Prime real
  estate for a founder calendar — shows whether mornings stay
  protected, whether Fridays are clear, etc.

For task / issue / Trello inputs:

- **Project card (top)** — total items, open / in-progress / done
  split, overdue count, stale count, top assignees, and a one-
  sentence read ("38 issues across 4 lanes — 17 open, 8 stale (>3
  weeks no movement), and 2 owners hold 60% of in-progress work").
- **Status flow** — a horizontal status bar: open → in-progress →
  in-review → done with the count + share at each stop. Helps see
  where work pools up.
- **Priority distribution** — a chart of items by priority (P0 / P1
  / P2 / P3) with overdue slices highlighted.
- **Cycle time** — for issue trackers with `created_at` +
  `updated_at` on completed items, surface
  `DATA.tasks.cycleTime.medianDays` and `p95Days`. Often the most
  honest signal of execution pace.
- **Lane breakdown** — for Trello + tracker `project` columns,
  swimlane chart of items per lane with done vs open shading.
- **Overdue ribbon** — a timeline of overdue items grouped by week,
  pulled from `DATA.tasks.overdueItems`.

Don't try to do all of these. Pick 3–6 beyond the required five,
based on what the data supports.

## Interaction discipline

- The status / owner / priority / label chips should **compose**, not
  override each other. Clicking "John" + "in-progress" filters the
  drill-down to John's in-progress items. The summary card stays
  static; only the table / map adjusts.
- Search box should match across title + description + label + owner
  + status. Highlight matches inline.
- Every callout in the analysis (stale items, bottleneck owners,
  overdue items, longest events, back-to-back blocks) should link
  back into the drill-down — clicking jumps to that item's row,
  expanded.
- Avoid editing UI. This is a read-only infographic — no drag-and-
  drop kanban, no checkbox-to-complete. Surfaces, not actions.

## Always include

- Light + dark mode (`prefers-color-scheme`).
- Mobile-first responsive — analysis cards stack, time-allocation
  visualization shrinks but stays readable, owner / status chips wrap,
  the drill-down list goes single-column.
- Charts render inline SVG (no Chart.js, no CDNs) for under ~2000
  data points.
- Keep the page under ~1 MB inlined where possible. Calendars and
  backlogs are usually <300 KB; only Trello boards with full
  `actions` history get heavy.
- "Copy as Markdown" of the analysis section — paste-ready into a
  weekly review doc, a sprint retro, or a calendar audit.
- Full-text search across the item list; highlight matches in place.
- Item drill-down rows render mono for IDs / dates / durations /
  estimates; body type for titles / descriptions / labels.

## Data shape

Every planning parser feeds the same `items` array plus a
format-specific aggregation block. Treat them generically.

```ts
DATA = {
  kind: "calendar" | "tasks",
  format: "ics" | "trello" | "linear-csv" | "jira-csv" | "github-csv" | "task-csv" | "issue-csv",
  items: [
    {
      id: "i_0001",
      title: "Sprint review w/ engineering",
      kind: "event" | "card" | "issue",
      // calendar-shaped fields
      start?: "2026-05-12 14:00",
      end?:   "2026-05-12 15:00",
      startEpoch?: 1747058400000,
      endEpoch?:   1747062000000,
      durationMinutes?: 60,
      allDay?: false,
      organizer?: "Alex Rivera",
      location?: "Zoom",
      rrule?: "FREQ=WEEKLY;BYDAY=TU",
      // tasks-shaped fields
      status?: "In Progress" | "Done" | "...",
      statusBucket?: "open" | "in_progress" | "in_review" | "done" | "blocked" | "cancelled" | "unknown",
      priority?: "P1" | "High" | "...",
      priorityRank?: 1,
      due?: "2026-05-20",
      ageDays?: 12,
      staleDays?: 12,
      isStale?: true,
      isOverdue?: false,
      isCompleted?: false,
      // shared
      assignees?: ["Mira Chen"],
      owner?: "Mira Chen",
      labels?: ["frontend", "needs-design"],
      list?: "In Progress",
      project?: "Pricing Page V2",
      url?: "https://linear.app/...",
      description?: "..."
    }
  ],
  // calendar-only block (only when kind === "calendar")
  calendar?: {
    totalMinutes: 2280,
    uniqueAttendees: 14,
    weeks: [{ weekOf: "2026-W19", count: 23, totalMinutes: 1380, overloaded: true }],
    busyHours: [{ day: "Mon", hourCounts: [0,0,...,1,2,3,...] }, ...],   // 7 entries
    topAttendees: [{ name: "Mira Chen", count: 8, minutes: 480 }, ...],
    topOrganizers: [{ name: "Alex Rivera", count: 12, minutes: 720 }, ...],
    longestEvents: [{ id, title, minutes, start }],
    recurring: [{ title: "engineering standup", count: 9, rrule }],
    backToBackBlocks: [{ start, end, count, minutes }],
    meetingFreeStreaks: [{ start, end, days }],
    totals: { events: 47, cancelled: 2, minutes: 2280, distinctTitles: 31 }
  },
  // tasks-only block (only when kind === "tasks")
  tasks?: {
    statusCounts: { "In Progress": 8, "Done": 14, ... },              // raw status strings
    statusBucketCounts: { open: 12, in_progress: 8, done: 14, ... },  // normalized buckets
    priorityCounts: [{ priority: "P0", count: 1, rank: 0 }, ...],
    assigneeCounts: [{ name, open, in_progress, done, total, oldestStaleDays }],
    lanes: [{ name: "In Progress", count, openCount, doneCount }],
    labelCounts: [{ label, count }],
    staleItems: [{ id, title, ageDays, owner, status }],
    overdueItems: [{ id, title, due, owner, status }],
    bottlenecks: [{ name, openCount, oldestStaleDays }],
    cycleTime: { medianDays: 4.2, p95Days: 18.0 },
    totals: { items, open, inProgress, inReview, done, blocked, cancelled, overdue, stale }
  },
  meta: { sourceFile, sizeBytes, format, kind, ... }
}
```

Use the pre-aggregated arrays directly. Do **not** re-derive
`weeks` / `busyHours` / `assigneeCounts` / `staleItems` on the client
— the parser already did the math, and walking the full items array
for analysis kills performance on big calendars / boards.

## Tone

Operator's-review register. The output should read like a weekly
review or a quarterly planning audit, not a marketing dashboard.
"Tuesdays carry 60% of the meeting load and Mira holds 5 of 8 in-
progress items" is a sentence; "Tuesdays: 60%, Mira: 5" is a metric.
Use sentences in the cards, metrics in the charts. Mono numerics.
Direct, specific.

## Privacy / safety note (include in the page footer)

Calendars often contain real names, attendee email addresses, meeting
links, and customer references. Trackers often contain internal
roadmap, customer names, and sprint commitments. Add a small footer
line:

> *Generated locally — your calendar / project file never left your
> machine. The full export is embedded in this HTML and rendered in
> your browser. For sharing, prefer an anonymized export.*
