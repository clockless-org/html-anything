# travel-history — Uber & Lyft personal trip-history exports

A normal consumer Uber or Lyft account's trip history — every ride
they've taken over the years. Output is a **private travel +
spending atlas**: where the rides went, what the money was, how
many hours they actually spent in cars, the late-night and airport
patterns, and the commute loops that quietly add up.

The interesting story is **the human shape of years of rides**, not
"your CSV in HTML form". A raw Uber or Lyft export is a depressing
spreadsheet of truncated addresses; a good page makes the user say
*"oh — over three years I spent $4,200 on Uber, took 31 airport
runs, and apparently did the same Home → Office trip 38 times
between 8 and 9 am."*

This prompt does **not** belong to the `_finance.md` family. Bank
transactions are about cashflow categories; travel-history trips are
about *time + place + habit + tip behavior*. Different question,
different shape. Frame this as a personal mobility log, not a
bank statement.

## Export instructions (surface to the user before converting)

Both companies hide this — surface the steps clearly so the user
doesn't spend 20 minutes hunting.

### Uber

1. Go to [uber.com/account/privacy/data](https://www.uber.com/account/privacy/data)
   ("Privacy & Data" → "Download your data"). Sign in.
2. Click **"Request your data"**. Uber lets you select categories;
   make sure **"Trip data"** (sometimes labelled "Rides" or "Order
   activity") is included. The default selection is fine for most
   users.
3. Submit. Uber emails a download link in **1–4 days** (sometimes
   longer for very old accounts). Confirm via the email.
4. Unzip. The interesting file is usually
   `Rider/trips_data.csv` (canonical trip-level history — one row
   per ride, with `Trip ID`, `Request Time (UTC)`, `Begin Trip
   Time (UTC)`, `Begin Trip Lat`, `Begin Trip Lng`, `Begin Trip
   Address`, `Dropoff Time (UTC)`, `Dropoff Lat`, `Dropoff Lng`,
   `Dropoff Address`, `Distance (miles)`, `Fare Amount`, `Fare
   Currency`, `Trip or Order Status`, `Product Type`, `City`).
   Drop that file into Claude Code:
   `convert this Uber trip history to HTML: ~/Downloads/Uber/trips_data.csv`.
5. Ride history dating back to ~2014 is typical. Older accounts
   sometimes have multiple `trips_data*.csv` files — convert them
   one at a time or `cat` them into a single CSV first.

### Lyft

1. Go to [account.lyft.com/privacy](https://account.lyft.com/privacy)
   ("Privacy & data" → "Request my data"). Sign in.
2. Pick **"Ride history"** (sometimes shown as "Rides data"). Set
   the date range to **All time** unless you want a slice.
3. Submit. Lyft emails a download link in **1–7 days**.
4. Unzip. The canonical file is usually `rides.csv` or
   `ride_history.csv` (one row per ride, with columns like
   `Ride ID`, `Requested at`, `Pickup Address`, `Dropoff Address`,
   `Distance (miles)`, `Duration`, `Cost`, `Tip`, `Total`,
   `Ride Type`, `Status`, `Pickup Lat`, `Pickup Lng`, `Dropoff
   Lat`, `Dropoff Lng`).
   Drop that file into Claude Code:
   `convert this Lyft travel history to HTML: ~/Downloads/Lyft/rides.csv`.
5. Some Lyft exports ship as JSON (`rides.json`) — the parser
   handles both.

If the user has both, convert each separately — the page is
source-aware (the title and chrome say "Uber" or "Lyft" verbatim,
never blended).

## Source shapes the parser handles

- **Uber CSV** (canonical, most common). Headers above. One row
  per requested ride, including completed, cancelled, and refunded.
- **Lyft CSV** (canonical). Headers above; the parser also handles
  the older `started_at` / `ended_at` shape with `pickup_location`
  / `dropoff_location` instead of address columns.
- **JSON variants** (rare). Same fields, JSON-shaped. Parser
  accepts top-level arrays or `{ trips: [...] }` / `{ rides: [...] }`.

Detection: header contains either
`(Begin Trip Time + Fare Amount)` or `(Trip or Order Status +
Product Type)` for Uber, or `(Pickup … + Drop-off … + Cost/Total)`
for Lyft.

## What to surface (the experience)

This is meant to feel like **scrolling through years of personal
mobility as a story** — when they took rides, where, with what
product, and what the money was. Not a stats page.

### Source-aware global travel hero (required)

One row, big, brand-anchored:

- The hero stamps the source verbatim but names the page
  **"Travel history"** — provider chips can read `UBER` / `LYFT`,
  but the visible title should not say "rideshare history".
- Use a small "stamp"
  chip that reads `UBER` / `LYFT` next to the title.
- KPIs: **Rides** (completed), **Spend** (total), **Miles**,
  **Hours in cars**, **Years**. Pull from `DATA.summary`. Use
  `DATA.summary.currencySymbol` for the spend tile.
- One editorial subtitle the renderer pre-computes from
  `DATA.summary` — e.g. *"487 rides over 2 years 8 months —
  $4,210 spent, 1,840 miles in cars, busiest week was 2025-W42
  (after Mira's wedding)."*
- A small caption underneath that explains the source in plain
  language. Uber: *"This is your Uber trip history export. Each
  row is a requested ride — completed, cancelled, or refunded.
  Addresses and coordinates are masked by default."* Lyft:
  *"This is your Lyft travel history export. Each row is a requested
  ride. Addresses and coordinates are masked by default."*

### Time views (required)

The page **must** include all three time-slicing surfaces — when
the user took rides is the headline of a mobility log.

1. **Year / month spend timeline** ("Spend timeline") — twin bars
   per month for ride count + spend. Drive from `DATA.monthly`.
   Render as inline SVG. Highlight the single biggest month inline.
   Empty months render as a dim placeholder rather than 0 bars.
   The literal label "Spend timeline" must be visible.
2. **Weekday × hour heatmap** ("When you travel") — 7×24 grid driven
   from `DATA.heatmap`. Color scale by count, with a small legend.
   Annotate the late-night quadrant (Fri/Sat 22:00–04:00) so the
   user can see weekend nights as a band. The literal label "When
   you travel" must be visible.
3. **Late-night / early-morning callout** — small card pulling
   `DATA.summary.lateNightShare` plus the count of weekend
   late-night rides from `DATA.flags` (`kind: "late-night-cluster"`).

### Mobility views (required)

1. **Top places** ("Top places") — two-column panel. Left column:
   top 8 pickup labels with count and total spend. Right column:
   top 8 dropoff labels with count. Drive from
   `DATA.pickupPlaces` / `DATA.dropoffPlaces`. The literal label
   "Top places" must be visible.
2. **Cities** ("Cities") — horizontal bars for the top 6 cities
   with ride count + spend. Drive from `DATA.cities`. Empty state:
   *"No city info in this file."* The literal label "Cities" must
   be visible.
3. **Distance buckets** ("Trip lengths") — horizontal bars for
   `DATA.distanceBuckets`. The literal label "Trip lengths" must
   be visible.
4. **Offline SVG places scatter** (only when `DATA.geo.hasCoordinates`
   is true) — render `DATA.geo.points` as inline `<circle>` dots
   inside `DATA.geo.viewBox`, with pickup and dropoff styled
   distinctly (use `var(--primary)` and `var(--accent-cyan)` /
   tertiary). **Hard rule: no map tiles, no Leaflet/Mapbox/Google
   Maps tiles, no geocoding calls. Only inline SVG over a faint
   graticule.** The parser already pre-projects coordinates into
   the viewBox using a cosine-corrected equirectangular projection,
   so coordinates render correctly without any client math.
   Below the SVG: a small toggle "Show coordinates" (default OFF)
   that swaps the bare dots for tooltips with a *coarse* lat / lng
   (rounded to 0.01°). The literal label "Places" must be visible
   when the SVG is shown.

### Money views (required)

1. **Money breakdown** ("Money") — donut or stacked bar split into
   **Fare**, **Tip**, **Fees / surcharges**, **Refunds**. Drive
   from `DATA.money`. Below it: a small bars panel with the top 6
   product types from `DATA.money.byProduct` (UberX, Uber Black,
   Uber Pool, Lyft, Lyft Lux, etc.) showing count + spend. The
   literal label "Money" must be visible.
2. **Surge / outlier callouts** — surface from
   `DATA.flags.kind === "expensive-outlier"`. Pull the row IDs and
   render a small card with the date, route, fare, and a "vs.
   median" comparison.
3. **Cancellations & refunds** — surface from
   `DATA.flags.kind === "cancelled"` and `DATA.flags.kind ===
   "refund"`. One card each, with the count and total cancellation
   fee or refund amount.

### Flags panel (required)

A "Flags" panel of cards, driven from `DATA.flags`. Each card has
one of these `kind`s — render distinct chip colors:

- `cancelled` — rider/driver/auto cancellations. Surface the count
  and any cancellation fee total.
- `refund` — refunded or reversed rides.
- `expensive-outlier` — top 3 spend outliers vs. the median.
- `long-trip` — top 3 distance outliers (≥ 25 mi).
- `airport-run` — heuristic detection from
  pickup / dropoff label matching `AIRPORT_HINTS` (already done
  in the parser).
- `late-night-cluster` — weekend rides between 10 pm and 4 am.
- `commute-loop` — same pickup → dropoff repeated ≥ 4 times.
- `no-fare` — completed rides with $0 total (rare, worth surfacing).

Empty state for any kind: *"Nothing flagged of this kind in this
file."* The literal label "Flags" must be visible.

### Drill-down trip table (required)

"Browse all N trips" section — collapsible, default to **expanded**
because rideshare exports are usually 100s to a few 1000s of rows
and the user wants to scrub through them.

- Filter chips: source (always one — render as a "stamp"), product
  type (top 6 + "other"), city (top 6), status (completed /
  cancelled / refunded), year, flag (`airport-run`, `late-night`,
  `commute-loop`, etc. — chips that toggle).
- Columns: **Date**, **Time** (HH:MM), **Day** (Mon/Tue/...),
  **Product** (chip), **Pickup**, **Dropoff**, **Miles**
  (right-aligned, tabular-nums), **Min**, **Fare**, **Tip**,
  **Total** (right-aligned, tabular-nums).
- Full-text search across pickup / dropoff / product / city /
  status / id.
- Click a row to expand and reveal the original raw fields, plus
  the precise lat / lng coordinates if present (default hidden
  behind a per-row "Show coordinates" reveal — see privacy below).
- Flagged rows render a small badge in the row (one chip per
  flag; same colors as the Flags panel).

The drill-down is a hard requirement — travel history is
intimate, and the user must be able to audit every row.

## Privacy-conscious styling (HARD)

Pickup / dropoff labels and coordinates pinpoint the user's home,
work, partner's place, doctor's office, etc. Make the page
visibly privacy-conscious.

- **Footer must explicitly state**:
  > *Generated locally — your Uber / Lyft export never left your
  > machine. The full ride list is embedded in this HTML and
  > rendered offline in your browser. Pickup / dropoff addresses
  > and coordinates are inlined as-is from the file you opened.
  > For sharing, prefer an anonymized export.*
- **Mask exact pickup / dropoff addresses by default** in the
  drill-down table. Show the first 3 + last 3 characters with
  `…` between (`123…ave`, `Hom…ome`), plus a per-row "Show
  address" reveal button. Add a page-wide toggle in the header
  (default OFF) that flips every label to its full form.
- **Mask coordinates by default**. Even in the SVG scatter, do
  not show numeric lat / lng on hover. Behind a "Show
  coordinates" toggle (default OFF), reveal a *coarse*
  lat / lng (rounded to 0.01° — about 1.1 km of resolution at
  the equator). Never show full-precision coordinates outside
  the per-row drill-down.
- **Never fetch anything.** No map tiles, no Mapbox / Leaflet /
  Google Maps tile services, no Nominatim / Geocodio / Google
  geocoding, no rideshare CDNs, no avatars, no analytics. The
  only network call allowed is the Google Fonts import shared
  with every html-anything output.
- **Privacy banner under the hero** — small, dismissable: *"This
  page never sent a network request. Addresses and coordinates
  are masked by default."*

## Data shape

```ts
DATA = {
  format: "rideshare-history",
  source: "uber" | "lyft",
  rows: [
    {
      id: "uber_000001_aBcDeF",
      source: "uber" | "lyft",
      date: "2026-03-15",
      dateEpoch: 1742054400000,
      hour: 8,                          // 0-23 from request timestamp (UTC slice)
      weekday: 2,                       // 0=Sun, 6=Sat
      productType: "UberX" | "Lyft" | "UberPool" | "Lyft Lux" | "Uber Black" | ...,
      status: "completed" | "cancelled" | "refunded" | "rider_cancelled" | ...,
      pickupLabel: "Home (synthetic)" | null,
      dropoffLabel: "SFO Terminal 2 (synthetic)" | null,
      pickupLat: 37.79 | null,           // float; renderer masks by default
      pickupLng: -122.41 | null,
      dropoffLat: 37.62 | null,
      dropoffLng: -122.38 | null,
      distanceMiles: 12.4,               // 0 for cancellations
      durationMin: 24.5,                 // 0 when missing
      fare: 28.40,                       // base fare (>= 0)
      tip: 4.00,
      fee: 6.20,                         // surcharges + taxes + booking fees aggregated
      total: 38.60,                      // overall amount paid; refunds negative
      currency: "USD",
      city: "San Francisco" | null,
      flags: ["airport-run","late-night"] | [],
      raw: { ... }                       // original CSV / JSON row
    }
  ],
  summary: {
    rowCount: 487,
    rideCount: 462,                     // completed
    cancelledCount: 22,
    refundCount: 3,
    totalSpend: 4210.00,
    refundTotal: 84.00,
    totalMiles: 1840.5,
    totalHours: 121.4,
    avgFare: 9.11,
    avgMiles: 3.98,
    avgDurationMin: 15.8,
    distinctCities: 4,
    distinctProducts: 5,
    busiestCity: "San Francisco",
    busiestMonth: "2025-10",
    busiestWeekday: "Fri",
    topPickup: "Home (synthetic)",
    topDropoff: "Office (synthetic)",
    topProduct: "UberX",
    lateNightShare: 12.4,                // % of all dated rides
    weekendShare: 28.2,
    airportShare: 6.8,
    period: "2024-01-04 → 2026-04-30",
    durationLabel: "2 years 4 months",
    monthsActive: 28,
    currencyCode: "USD",
    currencySymbol: "$",
    source: "uber" | "lyft",
  },
  monthly:  [{ month: "2024-01", count: 14, spend: 142.50, miles: 48.2,  hours:  4.5 }, ...],
  yearly:   [{ year:  "2024",    count: 184, spend: 1620.0, miles: 720.4, hours: 52.1 }, ...],
  heatmap:  [{ weekday: 0..6, hour: 0..23, count: number }, ...],   // 7*24 cells, full grid
  cities:   [{ city: "San Francisco", count: 412, spend: 3680.00 }, ...],
  pickupPlaces:  [{ label: "Home (synthetic)",  count: 88, spend: 720.00 }, ...],
  dropoffPlaces: [{ label: "Office (synthetic)", count: 76, spend: 640.00 }, ...],
  productTypes:  [{ product: "UberX", count: 380, spend: 3120.00, miles: 1420.6 }, ...],
  distanceBuckets: [
    { label: "< 1 mi",   count: 28,  share: 6.1 },
    { label: "1–3 mi",   count: 240, share: 52.0 },
    { label: "3–6 mi",   count: 120, share: 26.0 },
    { label: "6–12 mi",  count: 50,  share: 10.8 },
    { label: "12–25 mi", count: 18,  share: 3.9 },
    { label: "25+ mi",   count:  6,  share: 1.3 },
  ],
  money: {
    fare: 3520.00, tip: 380.00, fee: 310.00, refund: 84.00, total: 4210.00,
    byProduct: [{ product: "UberX", count: 380, spend: 3120.00, miles: 1420.6 }, ...]
  },
  flags: [
    { kind: "cancelled",          label: "22 cancelled rides", detail: "...", rowIds: [...] },
    { kind: "airport-run",        label: "31 airport rides",  detail: "...", rowIds: [...] },
    { kind: "commute-loop",       label: "Repeat: home (synthetic)→office (synthetic)", detail: "38 rides on this exact route — looks like a morning routine.", rowIds: [...] },
    { kind: "late-night-cluster", label: "24 weekend late-night rides", detail: "...", rowIds: [...] },
    { kind: "expensive-outlier",  label: "3 expensive rides", detail: "...", rowIds: [...] },
    { kind: "long-trip",          label: "3 long rides (25+ mi)", detail: "...", rowIds: [...] },
    { kind: "refund",             label: "3 refunds or reversals", detail: "...", rowIds: [...] },
    { kind: "no-fare",            label: "1 zero-fare ride",  detail: "...", rowIds: [...] }
  ],
  geo: {
    hasCoordinates: true,
    pointCount: 924,
    bbox: { minLat: 37.62, maxLat: 40.78, minLng: -122.43, maxLng: -73.95 },
    viewBox: { width: 1000, height: 540 },
    points: [
      { x: 412.0, y: 184.5, kind: "pickup",  count: 88, label: "Home (synthetic)" },
      ...
    ]
  },
  meta: { sourceFile, sizeBytes, source, rowCount, currencyCode, currencySymbol, period, durationLabel, totalSpend, totalMiles, distinctCities, hasCoordinates }
}
```

Use the pre-aggregated `summary` / `monthly` / `yearly` /
`heatmap` / `cities` / `pickupPlaces` / `dropoffPlaces` /
`productTypes` / `distanceBuckets` / `money` / `flags` / `geo`
arrays directly. Don't re-derive them on the client — the parser
already did the math. Walk `rows` only for the drill-down render
and the search filter.

## Tone

Personal-mobility / friend-with-a-spreadsheet register. *"Three
years of Uber adds up to ~76 hours in cars (about two work weeks)
and $4,210, but the real story is your Tue / Thu morning routine —
38 trips from Home to Office between 8 and 9 am, almost always
UberX, almost always under 4 miles."* Not "Optimize your ride
spend!". Specific to the file, observational, friendly.

## Hard editorial rules — analytical, not advice

This output is **analytical only**, never accounting / tax / safety
/ insurance advice. The page **must not**:

- Use the words "advice", "should", "tax-deductible",
  "report to the IRS", "1099", "claim as a business expense", or
  any phrasing that implies a tax determination.
- Recommend a specific course of action ("you should switch to
  Lyft Lux", "categorize this as a business deduction"). Describe
  what's in the file; do not prescribe what to do.
- Compute or claim "tax owed" or "deductible amount". Even though
  some users will use this to track business travel, never label
  rows that way.
- Imply the airport / commute-loop / late-night categorizations
  are canonical — they're heuristic pattern-matches on the user's
  own labels and timestamps, not authoritative classifications.
- Make safety / insurance claims. The page is a record of past
  rides; it does not opine on whether any single ride was safe,
  reasonable, or worth the money.

The page **must** include a footer line:
> *Analytical summary, not tax, accounting, or insurance advice.
> Airport runs, commute loops, and late-night clusters are
> inferred from your trip labels and timestamps — verify against
> your records before acting on anything here.*

## Always include

- Light + dark mode (`prefers-color-scheme`).
- Mobile-first responsive — KPI cards stack, twin bars stay
  readable, the heatmap becomes horizontally scrollable, the
  ride table becomes horizontally scrollable.
- Inline SVG charts only. No CDNs. **No tile services. No
  geocoding services.** No data fetched at render or click time.
- Currency-aware: format every amount with the symbol the parser
  detected (`DATA.summary.currencySymbol`, default `$`). Use
  grouping separators (`$1,820.00`). Tabular-nums
  (`font-variant-numeric: tabular-nums`) for every amount, miles,
  duration, and date column.
- Negative amounts (refunds) in `var(--red)` with a leading `−`
  glyph (not red parentheses).
- "Copy as Markdown" button at the bottom that captures the hero,
  top places, top product types, and headline mobility patterns
  as a shareable note (no raw rides, no addresses, no
  coordinates).
- All footer text from the privacy + analytical-only sections
  above.

## Source-specific framing

### Uber

- Each row is one of: **completed** (the canonical case),
  **rider_cancelled** / **driver_cancelled** / **no_show**, or
  **refunded** (rare). Cancellation fees show up as a small fare
  on cancelled rows; the parser keeps these.
- Product types are typically: `UberX`, `UberX Share`, `Uber
  Pool`, `Uber Comfort`, `Uber Black`, `Uber Black SUV`, `UberXL`,
  `Uber Premier`, `Uber Connect` (delivery — usually a tiny share
  of trips). Use them verbatim in the chips.
- Coordinates are usually present; the SVG scatter will render.
- The `City` column is sparse on older trips (pre-2018ish);
  empty-state the Cities panel rather than dropping it.

### Lyft

- Each row is one of: **completed**, **cancelled** (driver,
  rider, or auto), or **refunded**. Some Lyft exports use a
  boolean `cancelled` column instead of a status string — the
  parser normalizes both.
- Product types are typically: `Lyft`, `Lyft XL`, `Lyft Lux`,
  `Lyft Lux Black`, `Lyft Lux Black XL`, `Shared`, `Wait & Save`.
- Coordinates may be absent on older trips; gracefully degrade
  the SVG scatter to "no map shown — coordinates not in this
  file" when `DATA.geo.hasCoordinates` is false.
