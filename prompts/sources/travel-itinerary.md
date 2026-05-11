# travel-itinerary — multi-day trip itinerary CSV

A multi-day itinerary CSV with at minimum a date column and a
location/place/destination column. Optional time / type / title /
notes / cost columns. Sources include hand-built spreadsheets,
TripIt exports, Google Sheets travel templates, Wanderlog exports,
or Notion-database CSVs.

The output is **not a calendar viewer**. It's a **trip plan
infographic** that makes the user say *"oh, the trip really stacks
up like this"* — anchor cities, pace, conflicts, costs — with the
raw items as drill-down.

## What to surface (the headline of the page)

Look at the sample (date range, day count, cities, countries,
items per day, totals) and **infer + visualize**:

### Trip card (top)

- **Title** — derived from the filename or first-day anchor city.
- **Date range** — first → last item date, with span ("7 days, 4
  cities").
- **Item count** — total + items-per-day average.
- **Cost** — when `DATA.totals.totalCost` is set, in big mono with
  the currency symbol.
- **Headline read** — one sentence:
  *"7-day Tokyo + Kyoto trip — 4 cities, 22 stops, $4,200 total. Day
  3 has a 19:00 conflict between dinner and onsen — pick one."*

### Trip trace (when items have lat/lon)

Most itinerary CSVs are place-named without coordinates. If the
parser found lat/lon for any items, project them into a viewBox and
draw labeled dots connected chronologically with a thin path. Otherwise
show a horizontal **anchor-city strip**: a left → right strip of day
cards, each card shaded by the anchor city's color.

### Day-by-day timeline (required)

A vertical timeline. Each day card:

- date + day number + anchor city (mono date / body city)
- one-line read on the day ("Heavy day — 5 stops, 12h scheduled")
- inside: each item as a row with time (mono) → title → type chip →
  duration / cost when present
- conflicting items flagged with a small "⚠ overlap" chip and shaded
  in `var(--red)`.
- a tiny inline timeline bar at the top of each card showing item
  positions on a 24-hour scale.

### Map-shaped breakdowns

Twin panels for cities + countries (when more than one):

- **Cities** — `DATA.cities` leaderboard with stop counts. Treat the
  anchor of each day as the "primary city" — surface both leaders.
- **Countries** — `DATA.countries` for cross-border trips.

### Type breakdown

`DATA.types` as a stacked bar or donut: flights / hotels /
restaurants / activities / transport. Helps see the day's shape ("3
restaurants and 2 transport stops, no time for anything else").

### Cost rollup (when present)

Three numbers if `DATA.totals.totalCost` is set:

- total (big mono)
- per-day average
- per-city average

Plus a per-day cost bar chart. Use `currency` from any item
(currency symbol fallback to `$`).

### Conflict callouts (required when present)

Cards from `DATA.conflicts`. Each card:

- date + a "⚠ overlap" chip
- the two items + their times (mono)
- a one-sentence read ("19:00 dinner at Taishoken collides with the
  18:30 Tofuku-ji onsen — they're across the city; pick one or move
  one.").

If no conflicts exist, render an empty-state line ("No same-day
overlaps detected.") rather than omitting.

### Item drill-down (collapsible, default closed)

Below the analysis, "Browse all N items":

- Filter chips: by city, by country, by type, by date.
- Search across title + location + notes.
- Each row: date + time (mono), title, location / city, type chip,
  cost.
- Click to expand → full notes, lat/lon if present, duration.

## Required sections (must always render — non-negotiable)

1. **Trip card** — labeled "Trip" / the title.
2. **Day-by-day timeline** — labeled "Itinerary" / "Days".
3. **Filters / breakdowns** — labeled "Cities" + "Types" (and
   "Countries" if > 1).
4. **Conflict callouts** — labeled "Conflicts" or "Overlaps" (empty-
   state line if none).
5. **Browse all items** — collapsible drill-down.

## Tone

Trip-log register. Direct, friendly, hedged on recommendations.

- *"Day 3 in Kyoto — 4 stops, the 19:00 dinner conflicts with the
  onsen 30 minutes earlier."* Good.
- *"Day 3 schedule.density = 1.7."* Bad.

Mono for dates / times / costs / counts; body for titles + notes.
The "Copy as Markdown" output should sound like a trip plan ready
to drop into a doc.
