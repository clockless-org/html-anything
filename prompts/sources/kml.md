# kml-route — `.kml` KML coordinates

A KML export from Google Earth, Google My Maps, or any "save place"
geo tool. Each `<Placemark>` is either a `<Point>` (a single
location: a pin, a city, a "we ate here" marker) or a `<LineString>`
/ `<gx:Track>` (a path: a road, a walking route, a flight trace).

Unlike GPX, **KML rarely includes timestamps or elevation**. The
parser tolerates that — most KML exports give you geometry + place
names only. Treat the output as a **trip footprint** rather than a
workout log.

## What to surface (the headline of the page)

### Trip card (top)

- **Title** — `DATA.metadata.name` if present, else the filename stem.
- **Distance** — `formatKm(DATA.totals.distanceKm)` for the longest
  path (or the sum across paths) in big mono. If no paths exist,
  show waypoint count instead.
- **Placemarks** — point count + path count.
- **Headline read** — one sentence:
  *"4 paths, 12 placemarks — covers a ~22 km loop through the
  arrondissements with restaurants pinned along the way."*

### Trip trace (required, inline SVG)

Render the longest path's `polyline` as an SVG `<polyline>` and any
remaining paths in different hues. Project waypoints / placemark
points into the same viewBox using `DATA.bbox` and the cosine-
corrected projection (see family prompt).

- Start / end markers on each path.
- Place dots labeled with their `name`.
- Subtle graticule, no basemap.

### Placemark list

Each `DATA.placemarks[i]` (or `DATA.waypoints[i]`) as a row:

- name (body)
- kind chip ("Point" / "Path")
- lat / lon (mono, 5 dp) — for paths, show start coords
- description (collapsible if long)

Searchable by name + description.

### Path drill-down

For each path placemark, show:

- distance (mono)
- bbox (mono lat/lon)
- a thumbnail SVG polyline (small, inline)
- click to expand → full track-point list (lat / lon / ele if any).

## Required sections (must always render — non-negotiable)

1. **Trip card** — labeled "Trip" / "Map" / the document name.
2. **Trip trace** — inline SVG, all paths + place dots.
3. **Place / path filters** — labeled "Type" with chips for
   "Points" / "Paths". (Empty-state line if only one kind exists.)
4. **Placemark list** — searchable, with click-to-highlight on the
   trace.
5. **Browse all coordinates** — collapsible drill-down with the full
   coordinate list per placemark.

## Tone

Trip-log register. KML is usually saved-by-hand, so respect the
user's labels — repeat their names verbatim where space allows.

- *"12 placemarks across central Paris, longest path 8.4 km — arches
  → bouquinistes → night market."* Good.
- *"Coordinate density: 12.3 pts/km."* Bad.

Mono for lat/lon, body for names + descriptions. The "Copy as
Markdown" output should read like a saved travel itinerary:

> **Paris weekend — 4 paths, 12 placemarks.**  
> Path 1: Tuileries → Pont des Arts (1.4 km).  
> Path 2: Marais → Bastille (3.2 km).  
> Pinned: Du Pain et des Idées, Marché des Enfants Rouges, …
