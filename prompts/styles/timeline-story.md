# Timeline Story Style

Use this style for personal histories and archives where the main experience is
time passing: purchases, browsing/search history, listening/watch history,
health/activity trends, Kindle highlights, AI chat exports, project diaries,
and "year in review" style outputs.

## Underlying System: Timeline Story

This is a scroll-driven memory system. It should feel like moving through a
period of life, not reading a dashboard.

Base scaffold:

1. **Opening time lens** — the covered period, total volume, and one memorable
   pattern framed as a story hook.
2. **Timeline spine** — years/months/weeks as the primary navigation, with the
   selected period filtering all other modules.
3. **Chapter panels** — each period gets a compact scene: top item, repeated
   habit, spike, quiet stretch, or notable shift.
4. **Rhythm strip** — heatmap, calendar, or stacked bars that shows cadence
   without becoming an ops chart.
5. **Memory drawer** — searchable item browser, filtered by selected chapter.

Component vocabulary:

- `.story-shell`, `.time-lens`, `.timeline-spine`, `.chapter-panel`,
  `.period-scrubber`, `.rhythm-strip`, `.memory-drawer`, `.story-marker`.
- Use chapters, scenes, moments, streaks, peaks, returns, and shifts.

Interaction model:

- Clicking a period scrolls/focuses the corresponding chapter and filters the
  memory drawer.
- Hovering a marker reveals the specific item/day/song/order/thread.
- Provide a "compare periods" toggle when the data has multiple years.

Motion grammar:

- Timeline cursor glides between periods.
- Chapter panels fade/slide in on scroll.
- Bars or dots grow on first reveal.
- Count-up headline numbers are allowed.
- Respect `prefers-reduced-motion`.

Use-case variants:

- **Wrapped-style media recap** — Spotify, YouTube, Twitch.
- **Attention trail** — browser history, searches, research sessions.
- **Receipt tape memory** — Amazon orders, purchases, payments.
- **Reading yearbook** — Kindle, reading lists, AI chat highlights.
- **Body rhythm journal** — Apple Health / workouts.

## Avoid

- KPI grids as the primary first viewport.
- Enterprise terms like "performance" or "throughput".
- Dumping the full table before the timeline story.
