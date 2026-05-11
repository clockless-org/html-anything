# location-history — Google-Takeout-style location history

A location-history JSON or CSV — typically **Google Takeout**
(`Records.json` / `Location History.json`), but also flat hobby CSVs
with timestamp + lat + lon columns, OwnTracks dumps, or self-tracked
exports from apps like Arc.

The output is **not a personal map**. It's a **dwell-and-movement
audit** that makes the user say *"oh, here's where I actually spent
my time / where I traveled this year"* — with raw pings as
drill-down.

> **Re-identification risk.** Location history is the strongest
> identifier in this entire pack. The output is a single offline
> `.html`, but it embeds every ping client-side — never share the
> generated page from someone else's data, and prefer a cropped /
> anonymized export for sharing your own.

## What to surface (the headline of the page)

### Footprint card (top)

- **Date range** — `DATA.meta.dateRange` ("2026-01-01 → 2026-04-09")
  with the day count.
- **Points** — total point count in mono.
- **Unique places** — `DATA.totals.uniquePlaces` (clusters at ~250 m
  resolution).
- **Top dwell** — the biggest cluster's lat/lon + dwell hours.
- **Headline read** — one sentence:
  *"99 days of pings, 18 unique places, 4 city clusters; ~70% of
  dwell time at one place — likely Home (37.77, -122.42)."*

### Footprint map (required, inline SVG)

Project `DATA.places` (or `DATA.topPlaces` for the top-N) into the
viewBox using `DATA.bbox` and the cosine-corrected projection (see
family prompt). Each place is a dot:

- **Size** — proportional to log(dwell minutes).
- **Color** — gradient from "low dwell" (light) to "high dwell"
  (saturated). Top-N labeled with rank + name (or rounded lat/lon if
  unnamed).
- **Optional thin trace** — when chronological order makes sense
  (single trip), connect places with a low-opacity path.

Subtle graticule, no basemap. Add a scale bar derived from
`bbox` + haversine.

### Top places leaderboard (required)

Each row from `DATA.topPlaces` (or `DATA.places` truncated):

- rank (mono)
- lat / lon (mono, 5 dp) — or label "(unnamed cluster)" if no name
- dwell time (mono, hours / minutes)
- visit count (mono)
- inline bar showing share of total dwell.

The first row almost always lands on Home (or the user's primary
office). Call that out in the headline read but **never name it
"Home"** — say "the largest dwell cluster" and let the user
recognize their own coords.

### Activity by hour (required)

A 24-bar histogram from `DATA.hourCounts`. X = hour of day, Y =
ping count. Reveals daily rhythm (early-bird vs night-owl signal).

### Per-day density strip

`DATA.days` as a horizontal strip — one bar per day, height =
`pointCount`, color shaded by `uniquePlaces`. Travel days light
up because they have many unique places; dwell days are dim.

### City clusters (when bbox is large)

When `bbox` spans more than ~5° of latitude, group nearby places
into city clusters on the client (~5 km bucket) and render a
**top-cities leaderboard**. For a single-city dataset, skip this.

### Activity stacked bar (when present)

Some exports include `points[].activity` (walking / driving /
still / biking). Render a per-day stacked bar of activity minutes
when ≥ 30% of pings have activity labels.

### Travel days callouts

Days where the user moved more than ~10 km between any two pings
get flagged as "travel days". Show them as cards with the day's
distance and the cities visited.

### Ping drill-down (collapsible, default closed)

Below the analysis, "Browse all N pings":

- Filter chips: by date (one per day in `DATA.days`), by activity
  when present, by accuracy bucket (when present).
- Each row: timestamp (mono), lat / lon (mono), accuracy + activity
  when present.
- Virtualize / paginate when count > 5000 — the data is inlined but
  the table can render 200 rows at a time.

## Required sections (must always render — non-negotiable)

1. **Footprint card** — labeled "Footprint" / "Where you were".
2. **Footprint map** — inline SVG, no map tiles.
3. **Top places leaderboard** — labeled "Top places".
4. **Activity by hour OR per-day density strip** — labeled
   "Activity" / "Daily rhythm".
5. **Browse all pings** — collapsible drill-down.

## Tone

Operator's-review register, but careful about claims. Lat/lon
clusters are not labeled places — never claim a cluster is "Work" or
"the gym" unless the user's data already labels it.

- *"Largest dwell cluster (37.77, -122.42) holds 73% of total dwell
  time — likely Home."* Good. (Hedged.)
- *"Home is at 37.77, -122.42."* Bad. (Asserted.)

Mono for lat/lon / counts / minutes; body for sentences. The "Copy
as Markdown" output should read like a journal entry ("12 days of
location pings — 4 city clusters, 70% time at Home, 2 travel
days.").

## Privacy note (page footer in addition to family note)

> *No reverse-geocoding ran. Place names are based on lat/lon
> clusters at ~250 m resolution; the page never sent any coordinate
> off your machine.*
