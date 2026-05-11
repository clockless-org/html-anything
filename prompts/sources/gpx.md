# gpx-route — `.gpx` GPX routes & workouts

A GPX export: a stream of `<trkpt>` track points (and sometimes
`<wpt>` waypoints) with lat / lon / elevation / time. Sources include
Strava, Garmin Connect, Komoot, Apple Health, Wahoo, Suunto, route
planners, and any GPS device save-as.

The output is **not a map viewer**. It's a **workout / route audit**
that makes the user say *"oh, here's how the day actually went"* —
splits, elevation, pauses, top moves — with the raw track points as
drill-down.

## What to surface (the headline of the page)

Look at the sample (route name, activity classification, splits,
elevation profile, waypoints, pauses) and **infer + visualize**:

### Activity card (top)

- **Activity** — `DATA.activityKind` chip (run / ride / hike / walk /
  trip), with the route name.
- **Date / time** — start time → end time, span ("42 minutes",
  "5h 12m").
- **Distance** — `formatKm(DATA.totals.distanceKm)` in big mono.
- **Duration** — moving time (preferred) or elapsed time. Show both
  when they diverge enough to flag pauses.
- **Pace / speed** — pace for runs / hikes (`min:sec/km`); speed for
  rides (`km/h`).
- **Elevation gain** — `DATA.totals.elevationGainM` mono with the
  loss number alongside.
- **Headline read** — one sentence:
  *"8.4 km run on 2026-04-21 — 42 min at 5:00/km, slowest split km 6
  (5:32) on the climb, one pause at 4.2 km for 38s."*

### Route trace (required, inline SVG)

Render `DATA.tracks[i].polyline` as an inline SVG `<polyline>`. Add:

- **Start / end markers** — green dot at the first track point, red at
  the last.
- **Waypoints** — for each `DATA.waypoints[i]`, project lat/lon to
  the same viewBox (cosine-corrected, see family prompt) and draw a
  labeled marker.
- **Gradient stroke** — color shift along the polyline (start hue →
  end hue) so progression reads visually.
- **Hover** — when the user hovers over the SVG, snap to the closest
  point and show its idx + km + pace + elevation in a tooltip.

Do not embed a basemap. Add a subtle graticule (faint lines every
0.01°) instead.

### Splits (required when timestamps exist)

Horizontal bar chart of `DATA.tracks[i].splits` — each km bar's
length proportional to its duration; pace label inside the bar.

- Highlight the slowest split in `var(--red)` and the fastest in
  `var(--primary)`.
- Hover on a bar shows km marker + pace + elevation gain for that km.
- Below the bars, show median pace + standard deviation in mono.

### Elevation profile (required when ele present)

Sparkline area chart of `DATA.tracks[i].elevationProfile`. X = km
from start, Y = elevation in meters. Pin the high point and low
point with a labeled callout each ("321 m at km 4.2 — turn-around").

### Pace profile (when timestamps + paceProfile exists)

Rolling-pace sparkline from `DATA.tracks[i].paceProfile`. Reveals
where the user surged or faded; useful for runs.

### Pauses panel (when present)

Cards from `DATA.tracks[i].pauses`. Each card:

- "at km X" + duration mono
- short read ("Pause at 4.2 km for 38 seconds — turn-around or water
  stop?")

If no pauses are present, render an empty-state line ("No pauses ≥
30s — the run was continuous.") rather than omitting.

### Waypoints list (when present)

Each `DATA.waypoints[i]` as a row:

- name (body)
- lat / lon (mono, 5 dp)
- elevation (mono)
- description / time when present

Click a row to highlight that waypoint on the route trace.

### Track-point drill-down (collapsible, default closed)

Below the analysis, "Browse all N points":

- Filter chips: by track (when multiple), by "moving / paused", by
  hour-of-day.
- Search by lat / lon (with prefix match on the rounded values).
- Each row: idx + timestamp (mono) + lat / lon / ele (mono) + pace
  if computable.
- Pause rows in `var(--fg-muted)`; the slowest split highlighted.

## Required sections (must always render — non-negotiable)

1. **Stats card** — labeled "Activity" / "Workout" / "Route".
2. **Route trace** — inline SVG polyline, no map tiles.
3. **Splits or elevation timeline** — labeled "Splits" or
   "Elevation".
4. **Waypoints / pauses panel** — labeled "Waypoints" / "Pauses" /
   "Highlights" (empty-state line if neither).
5. **Browse all points** — collapsible drill-down.

## Tone

Operator's-review register. Honest about effort, hedged on inferred
context.

- "5:00/km is faster than your usual 5:18 — was today a session?"
  Good.
- "Route performance: PACE_INDEX=98" — bad.

Mono for numerics, body sentences in the cards. The "Copy as
Markdown" output should sound like a training-log entry:

> **2026-04-21 morning run — 8.4 km in 42:00 (5:00/km).**  
> 38 m gain, slowest split km 6 (5:32) on the climb, one 38s pause at
> km 4.2. Started 07:30 local, ended 08:12.
