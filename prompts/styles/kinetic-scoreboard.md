# Kinetic Scoreboard Style

Use this style for multi-participant activity streams where entities can be
ranked by contribution, velocity, bursts, or workload over time: Slack,
Discord, team chats, sales reps, issue owners, support agents, authors,
players, or any source that has "who did how much, when, and with what effect."

This style is derived from a kinetic championship reference: a full-viewport
scoreboard with vertical lanes, stark grid paper, black rule lines, oversized
numbers, mono metadata, animated exertion, and a leaderboard that changes as
the underlying activity moves.

## Underlying System: Kinetic Championship

This is a live race / competition board system. The first viewport should feel
like a real-time championship surface, not a report, dashboard, or article.

Base scaffold:

1. **Championship header** — compact event title, source/date metadata, and a
   live leaderboard. Keep it thin and ruled, not a top app bar.
2. **Competitor lanes** — 3-6 vertical lanes spanning the first viewport.
   Each lane is a bordered world with lane number, entity name/mask, rank,
   large score/token count, and a body field.
3. **Kinetic body field** — activity becomes a moving body, bar, waveform,
   strip, stack, or other exertion form. Text/data fragments may form the
   figure. The motion must be data-backed.
4. **Telemetry footer** — each lane has phase/status/load/pace labels.
5. **Evidence pits** — below or in a side drawer, translate source-required
   modules into match analysis: heat, plays, calls, incidents, recoveries,
   raw record browser.

Component vocabulary:

- `.kinetic-arena`, `.championship-header`, `.scoreboard-leaderboard`,
  `.competitor-lanes`, `.competitor-lane`, `.lane-header`, `.lane-score`,
  `.kinetic-body`, `.barbell-track`, `.activity-strips`, `.sweat-word`,
  `.telemetry-footer`, `.evidence-pit`, `.match-log`.
- Use lane, rank, phase, load, pace, burst, recovery, heat, split, rep,
  score, and play language.

Interaction model:

- Clicking a lane selects that competitor and filters linked evidence.
- A speed/phase control should affect the kinetic animation.
- Hovering or focusing a lane reveals a concise tooltip/insight.
- The log/search below should stay linked to lane selection and source records.

Motion grammar:

- Main motion is cyclical exertion: lift, pulse, sprint, count-up, waveform,
  or lane-progress. It must be readable and loop smoothly.
- Score numbers count up or drift with the phase.
- Tiny "sweat" words/fragments can appear near the active body field, drawn
  from real topics/messages/labels.
- Rank changes, highlights, and filters should snap crisply with 120-220ms
  transitions.
- Respect `prefers-reduced-motion`; freeze at a useful phase and keep all
  controls functional.

## Visual Language

- Warm off-white page (`#F0EFEA`-like), near-black ink, thin black borders.
- Subtle grid-paper background is required in the first viewport.
- Strong uppercase display type for event/lane labels; mono type for metadata.
- Big numbers and ranks are part of the style. Let them dominate.
- Use 1-2 punchy lane accents only where data needs comparison; avoid glossy
  gradients, rounded dashboard cards, soft shadows, and conventional KPI tiles.
- First viewport can be dense, but the geometry must stay severe: straight
  rules, lanes, labels, counters, and motion.

## Required Modules

- **Event summary**: source name, date span, total records, active entities.
- **Leaderboard**: ranked entities with counts/scores and current selection.
- **Competitor lanes**: at least the top entities, each with score, rank,
  phase/load/pace, and one data-backed kinetic visual.
- **Heat / rhythm view**: time-of-day, day, or period heat translated into
  a strip, split, or pit board.
- **Calls / decisions / actions** when the source supports them. In team chats,
  expose decisions, action items, threads, and topic bursts.
- **Record browser**: searchable/filterable source records linked to selected
  competitor.

## Source Fit

Best fits:

- Slack, Discord, Telegram, group chats, team channels.
- Sales/support/activity CSVs with reps/owners/entities.
- Issue trackers by assignee/label/status.
- Meeting/transcript participation analysis.
- Sports, games, workout, event streams, logs with competing services or
  owners.

Poor fits:

- 1:1 intimate chats — use `relationship`.
- Solo reflective notes / highlights — use `living-essay`.
- Places/routes/geodata — use `map-atlas`.
- Long documents — use `document`.

## Avoid

- Generic hero + KPI cards + charts.
- Dashboard panels with rounded cards as the first screen.
- A static bar chart pretending to be kinetic.
- Exposing private names when masking is appropriate; use initials or aliases
  if the source is sensitive.
- Long prose in the first viewport. Put interpretation in evidence pits.

## Implementation Notes

- Offline-only: inline CSS/JS, no external animation or chart libraries.
- The kinetic visual can be CSS, SVG, canvas, or text strips. If using canvas,
  verify it is nonblank.
- Use source text/labels as fragments in the motion only when privacy-safe.
- On mobile, stack lanes horizontally scrollable or as a compressed two-column
  roster, with the selected lane's kinetic body first.
