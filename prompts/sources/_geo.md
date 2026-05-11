# Geo / travel (shared)

This prompt is shared by every geo source: **GPX routes and workouts
(`.gpx`)**, **KML coordinates (`.kml`)**, **multi-day travel itineraries
(`.csv`)**, and **location history (Google-Takeout-style `.json` or a
flat lat/lon CSV)**. The parser already normalized them into a unified
shape — don't write different rendering logic per format. Use
`DATA.kind` (`route` | `itinerary` | `location-history`) and
`DATA.format` to label the chrome and pick the framing.

The output is **not a map viewer**. It's a geo-shaped infographic that
makes the user say *"oh, here's how the route actually broke down /
what this trip looks like / where I actually spent my time"* — with
the raw points / waypoints / itinerary items as drill-down.

## Hard constraint — offline only, no map tiles

This is non-negotiable. The output is a single self-contained `.html`
that must work offline. **Do not** embed Leaflet, Mapbox, Google Maps,
OpenStreetMap tiles, or any other tile provider. **Do not** call out
to a CDN for a basemap. **Do not** use a `<script src="...">` for
mapping libraries.

Render the route geometry and place dots as **inline SVG** using the
parser's pre-projected coordinates:

- `DATA.tracks[].polyline` is already a fully-formed SVG string of the
  shape `viewBox="0 0 W H" points="x1,y1 x2,y2 ..."` — drop it inline:
  `<svg ${polyline}><polyline fill="none" stroke="..." stroke-width="3" points="..."/></svg>`
  (you'll need to split off the points). Or simply:
  `<svg viewBox="0 0 W H"><polyline points="x1,y1 ..." fill="none" .../></svg>`
- For waypoints / placemarks / dwelled places, project lat/lon into
  the same viewBox using `DATA.bbox` and a cosine-corrected
  equirectangular projection. The parser already used cosine-corrected
  longitude when computing the polyline so dots match up:
  ```
  const avgLat = (bbox.minLat + bbox.maxLat) / 2
  const lonScale = Math.cos(avgLat * Math.PI / 180)
  const W = 1000  // matches polyline viewBox
  const sx = W / ((bbox.maxLon - bbox.minLon) * lonScale)
  const sy = H / (bbox.maxLat - bbox.minLat)
  const x = (lon - bbox.minLon) * lonScale * sx
  const y = (bbox.maxLat - lat) * sy
  ```
- Add a subtle background grid or graticule (every 0.01° lat/lon)
  rather than a basemap so the SVG reads as a geometric trace, not a
  half-rendered map.
- A small north arrow + scale bar (using haversine math from `bbox`)
  is welcome — both render purely client-side from `DATA`.

Make it visually rich without leaning on a basemap: gradient stroke
along the polyline (start → end color shift), elevation-shaded path
segments, dwell-time-shaded place dots, etc. The infographic
treatment is the design surface here.

## Required sections (must always render — non-negotiable)

These five sections form the geo contract. The page **must** include
all of them, with the literal section labels visible somewhere in the
rendered DOM.

1. **Stats card (top)** — depending on `DATA.kind`:
   - `route` (GPX / KML): big mono numbers — distance, duration,
     elevation gain, average pace or speed, max speed when present.
     One-sentence headline ("8.4 km run on 2026-04-21 — 42 min at
     5:00/km, 38 m gain.").
   - `itinerary`: total days, cities, countries, item count, total
     cost when present. Headline ("7-day Tokyo + Kyoto trip, 4 cities,
     22 stops, $4,200 total.").
   - `location-history`: total points, days, unique places, date
     range. Headline ("12 days of pings, 18 unique places, 4 city
     clusters; ~70% of dwell time at 'Home'.").
2. **Route visualization** — labeled "Route" / "Map" / "Trace" /
   "Footprint":
   - For `route`: an inline-SVG polyline rendered from
     `DATA.tracks[].polyline`. Add a start dot (green) + end dot
     (red), waypoint dots labeled by `name`, and a gradient stroke if
     it reads well. For multi-track GPX, render each track in a
     different hue.
   - For `location-history`: scatter the top-N dwelled places as
     dots sized by dwell time, then optionally connect chronologically
     with a thin path. Use `DATA.places` + `DATA.bbox` for projection.
   - For `itinerary`: when items have lat/lon, render dots; otherwise
     render a horizontal day-strip showing each day's anchor city.
3. **Stats / timeline view** — labeled "Splits" / "Elevation" /
   "Timeline" / "Day by day":
   - For `route` with timestamps: km splits as a horizontal bar chart
     (pace per km, slowest split highlighted) plus the elevation
     profile as a sparkline area chart from
     `DATA.tracks[].elevationProfile`.
   - For `route` without timestamps: just the elevation profile + a
     waypoint sequence list.
   - For `itinerary`: a vertical day-by-day timeline. Each day card
     shows date + anchor city + items (time → title with type chip).
     Conflicts (overlapping items) flagged in `var(--red)`.
   - For `location-history`: an hour-of-day activity heatmap (24
     buckets from `DATA.hourCounts`) and a per-day point-count
     density strip from `DATA.days`.
4. **Waypoints / segments / places list** (filterable + searchable) —
   labeled "Waypoints" / "Places" / "Segments":
   - For `route`: the waypoint list (name + lat/lon mono + ele +
     description) + a segment list when splits exist (km marker +
     pace + elevation).
   - For `itinerary`: cities + countries + types as filter chips; the
     items list as a searchable table.
   - For `location-history`: top-N places sorted by dwell time
     (rank + lat/lon mono + minutes/hours + visit count). Filter by
     activity (walking / driving / still / biking) when present.
5. **Searchable item drill-down** (collapsible, default closed) —
   labeled "Browse all N items":
   - For `route`: every track point in a virtualized table (idx /
     timestamp / lat / lon / ele / pace), highlight pauses.
   - For `itinerary`: every item with all columns.
   - For `location-history`: every ping (downsampled to ≤ 5000 rows
     when the file is huge — the parser keeps the full list in
     `DATA.points`, but the UI table can virtualize / paginate).

Render these five regardless of dataset size. They are the headline
shape of the geo pack — without them, the output is incomplete.

## What else to surface (pick what fits the dataset's shape)

For routes:

- **Pace / speed profile** — `DATA.tracks[].paceProfile` rendered as a
  rolling sparkline. Useful for runs and rides; skip for hikes when
  noisy.
- **Pauses panel** — `DATA.tracks[].pauses` as cards (location +
  duration). Often the answer to "where did I stop?".
- **Elevation extremes** — pinned high / low points.
- **Best split** — slowest / fastest km, big-effort callouts.
- **Activity classification** — `DATA.activityKind` (run / ride / walk
  / hike / trip) as a chip near the title.

For itineraries:

- **Cities / countries leaderboards** — from `DATA.cities` /
  `DATA.countries` — counts of stops per place.
- **Type breakdown** — from `DATA.types` — flights / hotels /
  restaurants / activities. Stacked-bar or donut.
- **Cost rollup** — when `DATA.totals.totalCost` is set: total + per-
  day + per-city.
- **Conflict callouts** — from `DATA.conflicts` — same-day overlapping
  items (two restaurants at 19:00 in different cities). Flag them.
- **Day cards** — each `DATA.days[i]` as its own card with the day's
  anchor city, item count, and a tiny inline timeline bar of the day.

For location history:

- **Top places leaderboard** — top 10 by dwell time, labeled with
  reverse-geocoded names if present, otherwise by rounded lat/lon.
- **City clusters** — group nearby places (within ~5 km) into city
  clusters using a quick lat/lon bucketing on the client.
- **Activity stacked bar** — when `points[].activity` is present, show
  walking / driving / still / biking per day.
- **Travel days vs. dwell days** — flag days where the user moved
  more than ~10 km.

Don't try to do all of these. Pick 3–6 beyond the required five,
based on what the data supports.

## Interaction discipline

- Filter chips compose, never override. Selecting "France" + "hotel"
  filters the itinerary list to French hotels only; the visualization
  also dims non-matching items.
- Search across name + lat/lon + city + country + notes. Highlight
  matches inline.
- Hover / focus on a route polyline shows the index + lat/lon + ele +
  pace at that point. Click a waypoint dot to scroll the drill-down
  to that row.
- Hover on a place dot shows `place.name (visits, minutes)`.
- This is a read-only audit. No "edit", "rename place", or "split
  segment" actions.

## Always include

- Light + dark mode (`prefers-color-scheme`).
- Mobile-first responsive — the SVG scales but stays readable, stat
  cards stack, filters wrap, drill-down list goes single-column.
- Charts render inline SVG (no Chart.js, no CDNs).
- Keep the page under ~1 MB inlined where possible. Workouts under
  ~500 KB; long location histories may need point downsampling for
  the SVG (the parser already gives you a downsampled polyline).
- "Copy as Markdown" of the analysis section — paste-ready into a
  trip log, training journal, or weekly review.
- Mono numerics (lat/lon, distance, pace, elevations); body type for
  names / notes / descriptions.

## Data shape

Every geo parser feeds the same envelope; `DATA.kind` switches the
framing.

```ts
DATA = {
  kind: "route" | "itinerary" | "location-history",
  format: "gpx" | "kml" | "itinerary-csv" | "location-history-json" | "location-history-csv",

  // route only (GPX / KML)
  metadata?: { name?: string; time?: string; creator?: string },
  activityKind?: "run" | "ride" | "walk" | "hike" | "trip" | "kml-trip",
  isWorkout?: boolean,
  tracks?: [
    {
      name?: "Morning Run",
      pointCount: 320,
      bbox: { minLat, maxLat, minLon, maxLon },
      stats: {
        pointCount, distanceKm, elapsedSec, movingSec, pausedSec,
        elevationGainM, elevationLossM, minEleM, maxEleM,
        avgPaceSecPerKm, movingPaceSecPerKm, maxSpeedKmh, avgSpeedKmh,
        startTime, endTime,
      },
      polyline: 'viewBox="0 0 1000 480" points="0.0,0.0 1.2,2.4 ..."',
      splits: [{ km: 1, durationSec, paceSecPerKm, elevationGainM, ... }],
      elevationProfile: [{ km: 0.05, ele: 12.4 }, ...],
      paceProfile?: [{ km: 0.20, paceSecPerKm: 348 }, ...],
      pauses?: [{ atKm, durationSec, lat, lon, time? }],
    }
  ],
  waypoints?: [{ lat, lon, ele?, name?, description?, time? }],
  totals?: { pointCount, distanceKm, elapsedSec?, movingSec?,
              elevationGainM?, maxSpeedKmh?, startTime?, endTime?,
              trackCount },
  bbox?: { minLat, maxLat, minLon, maxLon },

  // itinerary only
  items?: [{ id, date?, dateEpoch?, dayNumber?, time?, location?,
             city?, country?, type?, title, notes?, cost?, currency?,
             durationHours? }],
  days?: [{ date, dayNumber?, items: [...] }],
  conflicts?: [{ date?, items: [...] }],
  cities?: [{ name, count }],
  countries?: [{ name, count }],
  types?: [{ name, count }],
  totals?: { items, days, cities, countries, totalCost?, costItems },

  // location-history only
  points?: [{ t, tEpoch, lat, lon, accuracy?, activity? }],
  places?: [{ key, lat, lon, visits, minutes }],
  topPlaces?: [...],          // first 100 places by dwell minutes
  days?: [{ date, pointCount, uniquePlaces }],
  hourCounts?: number[24],
  bbox?: { minLat, maxLat, minLon, maxLon },
  totals?: { points, uniquePlaces, days },

  meta: { sourceFile, sizeBytes, format, kind, ... }
}
```

Use the pre-aggregated arrays directly. Do **not** re-compute splits,
elevation profile, pace profile, places, day buckets, or hour counts
on the client — the parser already did the math, and re-walking
`points` (which can be 50K+) on the main thread will jank the page.

## Tone

Operator's-review register for routes and history; trip-log register
for itineraries.

- Routes: "8.4 km on 2026-04-21 — 42 min at 5:00/km, slowest split
  km 6 (5:32) on the climb." Honest about pace + elevation.
- Itineraries: "Day 3 in Kyoto — 4 stops; the 19:00 dinner conflicts
  with the 18:30 onsen, pick one."
- Location history: "12 days of pings, 4 city clusters, ~70% of
  dwell time at one place — likely Home."

Mono numerics, body sentences. Never claim certainty about places the
user didn't label (use "(unnamed cluster)" for ungeocoded coordinate
clusters).

## Privacy / safety note (include in the page footer)

GPS traces show home + work + travel. Location history is the
strongest re-identification signal in this whole pack. Add a small
footer line:

> *Generated locally — your route / itinerary / location data never
> left your machine. The full export is embedded in this HTML and
> rendered in your browser; no map tiles are loaded. For sharing,
> prefer an anonymized / cropped export.*
