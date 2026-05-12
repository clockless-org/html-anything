# Global Travel Style

Use this style for personal travel histories, rideshare exports, trip logs,
airport patterns, location-history summaries, and any source where the first
read should feel like a calm global mobility section rather than a dense atlas
or operations dashboard.

## Underlying System: Global Travel Map

This is a centered travel-history stage inspired by a pale, airy global service
map: a short headline, compact travel/source selector, a large dotted world
field with warm location pins, and a row of big numeric counters beneath it.
The page should feel like an elegant travel dossier, not a map app.

Reference-derived invariants:

1. **Centered headline block** — one strong headline, one short subtitle, then
   a compact selector + primary action row. Avoid split hero layouts.
2. **Dotted world map** — the first viewport is dominated by a low-contrast
   dotted map or point field. Use inline SVG or CSS; no external map tiles.
3. **Warm pins and one callout** — orange/coral circular pins mark anchors.
   One floating label card calls out a selected city/place/route.
4. **Metric runway** — four to six large counters sit below the map with tiny
   outline icons and uppercase labels. Numbers are the visual rhythm.
5. **Soft travel canvas** — pale blue-green background, white controls, sharp
   2-8px radii, soft shadows, dark charcoal text, coral primary action.
6. **Atlas detail below the fold** — timelines, heatmaps, money, flags, and
   drill-downs exist, but they are subordinate to the global map stage.

Base scaffold:

1. `.travel-shell` — centered page shell with generous vertical space.
2. `.global-travel-hero` — first-viewport headline, selector, dotted map, and
   metric runway.
3. `.travel-selector` — source/country/provider selector and one coral action.
4. `.global-map-stage` — inline dotted world/map field with accessible pins.
5. `.location-callout` — floating selected place/city/route summary.
6. `.travel-stat-row` — icon + large number + uppercase label metrics.
7. `.itinerary-browser` — searchable trip/waypoint list below the fold.

Component vocabulary:

- `.travel-shell`, `.global-travel-hero`, `.travel-selector`,
  `.global-map-stage`, `.dotted-world-map`, `.map-pin`, `.location-callout`,
  `.travel-stat-row`, `.travel-stat`, `.travel-detail-band`,
  `.itinerary-browser`.
- Use travel, trip, city, route, airport run, late-night return, anchor city,
  waypoint, spend, miles, and hours language.

Interaction model:

- The selector changes or focuses a provider/source/city when data supports it.
- Clicking a map pin updates the `.location-callout` and linked place list.
- The primary action scrolls to the itinerary/trip browser.
- Filters below the fold update the browser without shifting the map stage.
- Every map fact must have a text/list fallback for keyboard and screen-reader
  users.

Motion grammar:

- Pins can pulse softly on first reveal or selection.
- The selected callout may fade/slide within the map bounds.
- Counters can count up only if the value is already visible as text and
  `prefers-reduced-motion` is respected.
- Do not animate map zoom, camera travel, or layout dimensions.

Travel-history variant:

- Rename the user-facing source from "rideshare history" to **Travel history**.
  It is fine for provider chips to say Uber/Lyft because those are real source
  exports.
- Hero copy should describe trips, movement, cities, spend, miles, and hours.
- Preserve privacy defaults: addresses and coordinates are masked unless the
  user explicitly reveals them.
- Below the first viewport, keep the analytical modules required by the source
  prompt: spend timeline, when-you-travel heatmap, top places, cities, trip
  lengths, offline places scatter, money, flags, and trip browser.

## Avoid

- Remote map tiles, geocoding services, or third-party travel widgets.
- A generic dashboard-first layout with KPI cards above the map.
- Dense app chrome, sidebars, or split-screen admin panels in the first
  viewport.
- Full-bleed photographic travel hero images; this style is map-and-data-led.
- Exact addresses or precise coordinates shown by default.
