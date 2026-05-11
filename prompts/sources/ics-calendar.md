# ics-calendar — `.ics` calendar exports (Google / Outlook / Apple / Fastmail)

A calendar export: a stream of `VEVENT` blocks with summary, start /
end, attendees, organizer, recurrence rule. Sources include Google
Calendar `Settings → Export`, Outlook `.ics` save-as, Apple Calendar
file export, Fastmail calendar download, and any subscription URL
saved as a file.

The output is **not a calendar viewer** — it's a **time-allocation
audit** that makes the user say *"oh, here's where my time actually
went / where it's going"* — patterns, overload, recurring drag,
free-streak gaps — with the raw events as drill-down.

## What to surface (the headline of the page)

Look at the sample (calendar name, date range, recurring titles,
attendees, busy hours, longest events, weekly density,
back-to-back blocks) and **infer + visualize**:

### Calendar card (top)

- **Calendar name** — from `meta.calendarName` if present, else the
  filename stem.
- **Date range** — first → last event, with span ("12 days",
  "8 weeks").
- **Total scheduled time** — `formatHours(DATA.calendar.totalMinutes)`
  in big mono.
- **Event count + cancelled count** — `"47 events (2 cancelled)"`.
- **Headline read** — one sentence, hedged where appropriate:
  *"38h scheduled across 12 days; Tuesdays carry 60% of the load and
  there are 4 back-to-back blocks of 3+ meetings."*

### Time allocation (required)

Render at least one of these prominently:

- **Day × hour heatmap** — 7 rows (Mon → Sun) × 24 columns, shaded by
  event count from `DATA.calendar.busyHours`. The clearest view of
  *when* the calendar is busy. Add a darker shade above the median
  hour count.
- **Per-week density strip** — one bar per ISO week from
  `DATA.calendar.weeks`, height = total minutes (or count). Tag
  weeks with `overloaded: true` in `var(--red)`.
- **Per-day timeline** — a Gantt-like ribbon for each day showing
  events as colored blocks. Useful for short ranges (≤ 2 weeks).

Pick the visualization that fits the date range — heatmap for
month+, density strip for quarter+, per-day ribbon for ≤ 2 weeks.

### Recurring series

Pinned panel from `DATA.calendar.recurring`. Each row:

- title (mono)
- count (mono)
- cadence chip ("weekly", "monthly", or the parsed `RRULE`)
- one-line read on cadence + ownership ("standup, 9× across 2 weeks
  — daily; Mira organizes")

These are the always-on load — anything else has to fit around them.

### Back-to-back blocks (required when present)

Cards from `DATA.calendar.backToBackBlocks` for any block of 3+
consecutive meetings with ≤ 15 minutes of gap. Each card:

- start → end timestamp
- "N meetings, M minutes" mono line
- one-sentence read ("4 meetings 09:30 → 12:15 Tuesday — no
  break for ~3h; review for content overlap").

If no back-to-back blocks exist, render an empty-state line ("No
back-to-back blocks longer than 3 meetings.") rather than omitting.

### Meeting-free streaks

Cards from `DATA.calendar.meetingFreeStreaks`. 2+ consecutive days
with no events. Each card:

- range
- "N days clear" line
- short read ("Likely deep-work / travel / off-week — verify it's
  intentional.")

### Attendees / organizers leaderboard

Twin panels from `DATA.calendar.topAttendees` and
`DATA.calendar.topOrganizers`. Each row:

- name (body)
- count (mono)
- minutes (mono)
- inline bar showing share

Surfaces "who I spend the most time with" + "who books the most
meetings on me".

### Longest events

List from `DATA.calendar.longestEvents`:

- title + start (mono)
- duration in hours / minutes (mono)
- one-line read on what it likely was ("Quarterly board prep — 3h
  block on Thu 14:00; only event > 2h this period.")

### Calendar drill-down

Below the analysis, include the **full event list** (default
collapsed):

- Filter chips: by attendee, by organizer, by status (confirmed /
  tentative / cancelled), by all-day vs timed.
- Search by title / location / description.
- Each row: date + time (mono), title, organizer, attendees count,
  duration, location.
- Expand row → full description, full attendee list, location, RRULE.
- Highlight cancelled events in `var(--fg-muted)` strikethrough; long
  events (>= 90 min) in `var(--primary)` accent text.

## Required sections (must always render — non-negotiable)

1. **Calendar card** — labeled "Calendar" or equivalent panel with
   range / events / total hours / headline.
2. **Time allocation** — labeled "Time allocation" / "Where time
   goes" / "Busy hours" or equivalent. At least one visualization
   from the three above.
3. **Owner / status filters** — chips for attendees + organizers +
   confirmed/tentative/cancelled, composed with the drill-down list.
4. **Stale / bottleneck callouts** — labeled "Overloaded weeks" /
   "Back-to-back blocks" / "Meeting-free streaks" panel(s). Empty-
   state line if nothing qualifies.
5. **Roadmap / calendar view** — labeled "Calendar" / "Week view" /
   "Roadmap" — at least a per-week density strip OR a per-day
   ribbon, even if simple.
6. **Searchable event drill-down** — labeled "Browse all events"
   collapsible.

## Tone

Founder / chief-of-staff register. Honest about overload, hedged on
recommendations. "60% of meeting time falls on Tue/Wed; Friday
afternoons stay clear" is good; "Calendar performance: TUE_LOAD=60%"
is bad. Mono numerics, body sentences. The "Copy as Markdown" output
should sound like a calendar audit ("47 events / 38h scheduled across
12 days. 4 back-to-back blocks > 3 meetings; Tue/Wed = 60% of total
time. 2 days meeting-free. Top attendee: Mira (8 events, 8h).").
