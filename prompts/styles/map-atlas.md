# Map Atlas Style

Use this style for spatial sources: saved places, rideshare histories, GPX/KML
routes, travel itineraries, photo geodata, location history, real-estate lists,
venue collections, and any archive where geography or movement is the main way
to understand the data.

## Underlying System: Map Atlas

This is a spatial exploration system. The first viewport should be anchored by
a map, route, scatterplot, floorplan, or spatial canvas.

Base scaffold:

1. **Atlas stage** — offline SVG/canvas map, route, scatter, or schematic
   place field. No external map tiles by default.
2. **Place / route drawer** — selected point, cluster, segment, city, or day
   details.
3. **Time + place controls** — period scrubber, city chips, route/layer toggles,
   category filters.
4. **Movement metrics** — distance, dwell time, frequency, cost, trip count, or
   recurrence, shown as context rather than a KPI wall.
5. **Waypoint browser** — searchable list tied to the stage.

Component vocabulary:

- `.map-shell`, `.atlas-stage`, `.place-drawer`, `.route-layer`,
  `.city-chip`, `.period-scrubber`, `.waypoint-browser`, `.movement-note`.
- Use place, route, cluster, loop, corridor, anchor city, waypoint, and segment
  language.

Interaction model:

- Clicking a point/route/cluster opens the drawer and highlights related rows.
- Period/category filters update the map and browser together.
- Route layers can be toggled without layout shift.
- The map/canvas must not be the only way to read the data. Include a place,
  route, or waypoint list that can be searched and operated by keyboard.

Motion grammar:

- Draw route paths on first reveal.
- Use subtle point pulses for selected places.
- Animate cluster focus/zoom only within the SVG/canvas bounds.
- Keep all motion disabled or simplified under `prefers-reduced-motion`.

Use-case variants:

- **Saved-place atlas** — Google Maps stars, bookmark-like place lists.
- **Mobility receipt** — Uber/Lyft travel history, commute loops.
- **Trip board** — itinerary with day lanes and city anchors.
- **Route lab** — GPX/KML with elevation/pace/segment overlays.
- **Photo place field** — Google Photos metadata without rendering private
  media.

## Avoid

- Fetching map tiles, geocoding services, or third-party APIs at render time.
- Treating a place archive like a generic table.
- Showing precise private coordinates when masking is more appropriate.
