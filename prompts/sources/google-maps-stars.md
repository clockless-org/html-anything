# google-maps-stars — your saved & starred places

The user's saved / starred / want-to-go list from Google Maps, exported
via Google Takeout. The output is **a personal world map** — somewhere
they can scroll through *the life they planned to live*.

## Export instructions (surface to the user before converting)

Google doesn't have a one-click "download my stars" button — it's part
of Takeout:

1. Go to [takeout.google.com](https://takeout.google.com).
2. Click **Deselect all**, then check only **Saved** (Google Maps saved
   places). They can also include **Maps (your places)** if they want
   star labels and notes.
3. Click **Next step** → **Send download link via email** → **Create
   export**.
4. Wait — Google emails a `.zip` link (a few minutes for typical
   accounts). Download and unzip.
5. Inside `Takeout/Saved/` there are CSV files: `Want to go.csv`,
   `Favourite places.csv`, `Starred places.csv`, plus any custom lists.
   The CSVs have place names + a Google Maps URL for each row (lat/long
   gets resolved via the URL). Drop one CSV into Claude Code:
   `convert this CSV to HTML: ~/Downloads/Takeout/Saved/Starred places.csv`.

The skill will detect this is a Google Maps stars export (CSV with a
Google Maps URL column) and use this prompt instead of the generic
csv prompt.

## What to surface (the experience)

Treat this like a **personal atlas of intent**. The user is looking at
a map of places they cared enough to save. The headline of the page
should be the map itself — not a table.

### Hero (top of the page, full width)

A **world map with all their places pinned**. Use a vector world map
in inline SVG (Natural Earth simplified, or just the country borders).
Pin each place. Cluster pins when they're close (city-level aggregation
when zoomed out, individual pins when zoomed in).

- Hover a pin → tooltip with name + note.
- Click a pin → side panel with details + Google Maps link.
- Double-click → zoom region.
- Pinch / scroll-wheel → zoom (smooth, with momentum on touchpads).

Animate the pins dropping in on first load — staggered, ~10ms apart.
Feels like the user is *seeing their map of the world build itself*.

### Stats strip (below the map)

- **Total places** + **countries** + **continents** covered.
- **Most-saved city** ("32 places in Tokyo") + **furthest place from home**.
- Top 3 categories if the data has them (restaurants, museums, parks).

### City breakdown

If a city has > 5 places, give it its own collapsible section: city name,
mini-map of that city's places, list of saved spots with notes.

### List view (drill-down)

A searchable / filterable table of all places. Columns: name, city,
category, date saved (if available), notes. Click a row → focuses the
hero map on that pin.

## Always include

- A "**My atlas in numbers**" callout box near the top — the kind of
  one-liner that feels personal: "you've saved 247 places across 31
  cities and 14 countries — half of them are restaurants in Tokyo."
- A "**Open in Google Maps**" link on every place card.
- The map should be usable in dark mode — invert the country fill, keep
  pins in brand orange.

## Data shape

```ts
DATA = {
  places: [
    {
      name: "Komugi Bakery",
      address: "Akasaka, Tokyo",
      lat: 35.6749, lng: 139.7363,
      mapsUrl: "https://maps.google.com/?cid=...",
      list: "Want to go",
      note: "the milk bread one",
      savedAt: "2024-09-12",  // if Takeout includes it
      category?: "Bakery"
    }
  ],
  lists: [{ name: "Want to go", count: 42 }, ...],
  countries: ["JP", "FR", ...],
  cities: { "Tokyo": 32, "Paris": 18, ... },
  meta: { sourceFile, sizeBytes, exportedAt }
}
```

## Tone

Quiet, personal, atlas-like. Not "data dashboard". The page should
feel like a coffee table book of *places I want to know*. Subdued
colors, generous whitespace, serif for place names if it fits the
overall design system, sans for stats.
