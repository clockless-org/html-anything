# google-photos-takeout — your Google Photos library, metadata only

A normal user's Google Photos camera roll — every photo and video
they have stored — from the official Google Takeout export. Output is
a **personal photo-memory atlas**: years of travel, devices, album
clusters, busy days, forgotten trips, and missing metadata — built
**entirely from sidecar JSON**, never from the actual image or video
files.

The interesting story is **the human shape of years of camera roll**,
not "your folder of JSON in HTML form". A raw `Takeout/Google Photos/`
directory is unusable; a good page makes the user say *"oh — Italy
2024 was 412 photos, my Pixel 8 took over from the iPhone 13 in
March, and I have 38 photos with no timestamp at all."*

This prompt is part of the experiential pack (Spotify, YouTube,
Twitch, Amazon, Kindle, etc.). Frame it as a personal photo-memory
atlas, not a storage audit. No "you have too many photos" voice.

## Export instructions (surface to the user before converting)

Google Photos lives inside the Google Takeout flow:

1. Go to [takeout.google.com](https://takeout.google.com).
2. Click **"Deselect all"**, then scroll to **"Google Photos"** and
   check it. Optionally click **"All photo albums included"** to pick
   only specific albums (the full library can be hundreds of
   gigabytes).
3. Click **"Next step"**, choose a one-time export, **"Send download
   link via email"**, **".zip"**, and a chunk size large enough to
   keep the export to one or two parts (50 GB is fine for most
   users).
4. Submit. Google emails a download link in **a few hours to a few
   days** depending on library size.
5. Unzip every part. Inside, look for
   `Takeout/Google Photos/<album-name>/` folders. Each folder
   contains the actual media files (`*.jpg`, `*.heic`, `*.mp4`, …)
   plus a sidecar JSON next to each one (`*.jpg.json`,
   `*.heic.json`, `*.mp4.json`). Some albums also contain an
   `metadata.json` describing the album itself.
6. Drop the **folder** into Claude Code:
   `convert this Google Photos Takeout to HTML: ~/Downloads/Takeout/Google Photos`.

The conversion **never reads the actual image or video files**. It
walks the directory, parses sidecar JSON only, and never copies,
opens, or hashes any binary. Real photos stay where they are.

If the user wants an **immediate** answer without exporting, there
is no equivalent for Google Photos — the Takeout flow is the path.

## Source shapes the parser handles

- **`*.jpg.json` / `*.heic.json` / `*.mp4.json` / `*.mov.json` /
  `*.png.json`** — per-media sidecar. Canonical Takeout shape:

  ```json
  {
    "title": "IMG_20250712_143015.jpg",
    "description": "",
    "imageViews": "0",
    "creationTime": { "timestamp": "1720793415", "formatted": "…" },
    "photoTakenTime": { "timestamp": "1720793415", "formatted": "…" },
    "geoData": { "latitude": 64.1466, "longitude": -21.9426, "altitude": 12.5 },
    "geoDataExif": { "latitude": 0, "longitude": 0, "altitude": 0 },
    "googlePhotosOrigin": {
      "mobileUpload": { "deviceFolder": { "localFolderName": "Camera" }, "deviceType": "ANDROID_PHONE" }
    },
    "favorited": false,
    "trashed": false,
    "archived": false
  }
  ```

  Some sidecars use `.suppl.json` instead of `.json` when the base
  filename is long; the parser tolerates both.

- **`metadata.json`** at the album-folder root — describes the album
  itself (`title`, `date`, optional `geoData`, `access`).

- **Folder layout** — each direct subfolder of `Google Photos/` is an
  album. There is usually one auto-album per year named
  `Photos from YYYY` plus user-named albums (`"Iceland 2024"`,
  `"Beach Day"`, …). Folders are flat — sidecars do not recurse
  beyond a single level.

Detection: input is a **directory** that contains at least 6 sidecar
JSON files matching the photo/video extension pattern, OR is named
`Google Photos` (case-insensitive) and contains an album subfolder
that does. The parser walks one level of subfolders by default and
caps at a few thousand sidecars to keep the page responsive.

## What to surface (the experience)

This is meant to feel like **scrolling through years of personal
camera roll as an atlas**. Cards on a wall, not a storage report.

### Hero strip (required)

One row, big, brand-anchored:

- **Total media** + **photo / video split** — *"3,540 photos · 218
  videos"*.
- **Date range** + duration — *"4 years 2 months · 612 active days
  with photos"*.
- **Albums** — count + busiest album. *"12 albums · busiest: Italy
  2024 (412 items)"*.
- **Geotag coverage** — *"68% of photos carry coordinates"*.
- **Top device** — *"Pixel 8 · 1,920 photos"*.

One short editorial sentence the LLM extracts: *"Italy 2024 was your
biggest month (412 photos in two weeks); the Pixel 8 took over from
the iPhone 13 in March, and 38 photos came in with no timestamp."*

### Activity timeline (required)

Two stacked views, user-toggleable:

- **Monthly bar chart** — total media per month with the busiest
  month flagged. Stacked or color-coded photos vs videos. Empty
  months rendered as `—` rather than 0.
- **Yearly heatmap (year × month)** — wider zoom, one row per year,
  one cell per month, colored by media count. Useful for spotting
  the months where life was lived through the camera.

Use inline SVG (no Chart.js, no CDNs).

Below the bars, a **day-of-week × hour-of-day heatmap** showing
*when* photos are taken. Saturdays at 11am? Tuesday lunchtimes? It
usually surprises.

### Places view (required)

A panel labeled **"Places"** with an inline-SVG **scatter** of every
photo's `(latitude, longitude)` projected onto a 1000-wide cosine-
corrected viewBox (no map tiles, no Google Maps, no
OpenStreetMap, no geocoding service). Dot density encodes count;
hover surfaces the date and album.

Below the scatter, a **clustered region list** built by binning lat/
lon to a coarse grid (~1° cells) and listing the top 10 cells by
count, with the date range of photos in each cell and a synthetic
label like *"Cluster around 40.4 N, 14.2 E — 218 photos, Apr–May
2024"*. **Never call a geocoder.** If you do not have a name for a
cluster, do not invent one.

If the file has zero geotagged photos, replace the panel with **"No
geotagged photos in this export"** — *"Geotagging was off, or these
came from a camera that doesn't write GPS."*

### Album explorer (required)

A grid labeled **"Albums"** with one card per album, sorted by item
count. Each card shows:

- **Album title** (from `metadata.json` or folder name).
- **Item count** + **photo/video split**.
- **Date span** — first → last photo date in the album.
- **Top device** for that album.
- **Representative tile mosaic** — a 4-wide grid of synthetic CSS
  color tiles whose colors hash from the photo filenames in the
  album. **Never** load real images. The mosaic is a privacy-safe
  visual signature, not a thumbnail.
- **Overlap signal** — when an album shares ≥3 photos by filename
  with another album (e.g. `Photos from 2024` always re-includes
  album content), surface a small *"shares N items with X"* line.

### Camera & device story (required)

A panel labeled **"Cameras & devices"** with a leaderboard of the
top devices used to take photos in the export. Each row:

- **Device label** (from `googlePhotosOrigin.mobileUpload.deviceType`
  or EXIF `Make`/`Model` when present in sidecar fields, or
  `"unknown device"` for sidecars that omit it).
- **Item count** + share % + tiny sparkline of monthly count.
- **First-seen → last-seen** date — when the device entered and left
  the user's life.
- **Photo / video share** — *"96% photos / 4% videos"*.

### Bursts & duplicates (required)

A short row of insight cards:

- **Burst clusters** — sequences of ≥4 photos taken within a
  ~3-minute window. For each: start time, count, top album, sample
  filenames. Drill-down filters the table to those rows.
- **Edited/original pairs** — pairs where the same base filename
  exists with and without an `-EDITED` suffix (Google's edit
  workflow). *"42 originals were re-edited inside Google Photos."*
- **Visual duplicates** — sidecars that share `photoTakenTime` +
  filesize-class within the same album, suggesting an upload twice.
  Heuristic-only.
- **Missing metadata** — count of records without `photoTakenTime`,
  without `geoData`, or without any device hint. *"38 photos came
  with no timestamp; 1,140 had no geotag."*

Every callout is **observational, not prescriptive**. Never say *"you
should clean up duplicates"*; say *"this is what your library looks
like"*.

### Drill-down (required)

A collapsible **"Browse all N media"** section with the full
sidecar metadata inlined. Inside:

- Full-text search across filename / album / device.
- Filter chips: top albums, devices, year, photo-only, video-only,
  favorites, archived, geotagged-only, missing-metadata-only.
- Columns: **Taken** (ISO date or `—` when missing), **Filename**
  (truncate, full on hover), **Album**, **Device**, **Type**.
- Click a row → expand to show the original sidecar fields (raw
  filename, photoTakenTime, creationTime, geoData lat/lng/altitude,
  device label, googlePhotosOrigin, favorited / archived / trashed,
  description if present).
- Virtualized or paginated — Takeout exports can hit thousands of
  rows.

## Privacy / synthetic-data constraint (HARD)

This source carries a strong personal-life signal — when you were
where, what device you owned, who you took photos with. Treat it as
sensitive.

- **Never read the actual photo or video files.** The parser walks
  sidecar JSON only. Do not open `*.jpg`, `*.heic`, `*.mp4`,
  `*.mov`, or `*.png` for any purpose — not for thumbnails, not for
  hashing, not for image content. Filename + sidecar metadata is the
  whole input.
- **Never embed real images.** The page never renders an `<img
  src="…/IMG_20250712_143015.jpg">`. The album mosaic uses CSS
  color tiles only; thumbnails are hashed-from-filename gradients,
  not photo content.
- **No external map tiles.** The Places scatter is **inline SVG
  only** — no Leaflet, no Mapbox, no Google Maps, no
  OpenStreetMap, no MapTiler, no tile fetch of any kind. Project
  lat/lon onto a cosine-corrected equirectangular viewBox; render a
  faint graticule rather than a basemap.
- **No geocoding.** Do not fetch place names from any service. If
  you do not have the name, surface the coordinates only.
- **No external photo services.** No `lh3.googleusercontent.com`,
  `photos.google.com` thumbnail fetch, no Google Photos API. The
  Takeout `url` field is preserved on row-expand only as a copyable
  string — not as a clickable link, not auto-fetched.
- **The synthetic example is fully fake.** Fake filenames, fake
  album names, fake device strings, fake coordinates that fall in
  the open ocean or remote land far from any real city, fake
  timestamps. Do not commit real exports.
- **Footer must include a privacy line** explaining the page reads
  metadata only, never opened the binaries, and never made a network
  call.

## Tone

Personal, observational, dignified. Like a friend going through your
camera roll with you. *"Iceland 2024 was your biggest single trip —
412 photos in 11 days. The first one was 2024-09-12 at 06:14 UTC,
just after dawn. The Pixel 8 was your daily driver until early March
2025, when the iPhone 16 took over."* Not *"Your library has 4,328
photos and 218 videos totaling 84 GB."*. Specific to the file.

Use the Clockless tokens (Space Grotesk + Plus Jakarta Sans, brand
orange `--primary`, surface cream in light mode, proper tabular-nums
for counts). This is part of the html-anything family — never a
Google Photos imitation. **Do not use Google product blue or red.**
The brand color stays Clockless orange.

## Always include

- "Copy as Markdown" button at the bottom that captures the album /
  device / burst summary as a shareable note (no filenames or
  coordinates leak — keep it aggregate).
- Light + dark mode via `prefers-color-scheme`.
- Mobile-first responsive — cards stack, charts shrink but stay
  readable.
- Tabular-nums for every numeric column.
- A footer line:
  > *Generated locally — your Google Photos library never left your
  > machine. The page reads sidecar metadata only and never opened
  > the actual photos or videos. Place clusters are derived from
  > coordinates already present in the export, not from any
  > geocoding service. The page does not fetch from
  > photos.google.com, lh3.googleusercontent.com, Google APIs, map
  > tile providers, or any third party.*

## Data shape

```ts
DATA = {
  format: "google-photos-takeout",
  rows: [
    {
      id: "gp_000001",
      filename: "IMG_20250712_143015.jpg",
      album: "Photos from 2025" | null,
      isVideo: false,
      ext: "jpg",
      ts: "2025-07-12T14:30:15.000Z" | null,
      tsCreation: "2025-07-12T14:30:15.000Z" | null,
      year: "2025" | null,
      month: "2025-07" | null,
      date: "2025-07-12" | null,
      hour: 14 | null,
      dow: 0 | null,
      hasTimestamp: true,
      lat: 64.1466 | null,
      lng: -21.9426 | null,
      altitude: 12.5 | null,
      hasGeo: true,
      device: "ANDROID_PHONE — Pixel 8" | null,
      deviceKind: "android" | "ios" | "camera" | "web" | "unknown",
      favorited: false,
      archived: false,
      trashed: false,
      isEdited: false,
      sidecarFile: "Photos from 2025/IMG_20250712_143015.jpg.json",
      raw: { /* full sidecar content, abbreviated to ≤2 KB per row */ }
    }
  ],
  summary: {
    totalCount: 256,
    photoCount: 217,
    videoCount: 39,
    albumCount: 6,
    deviceCount: 4,
    dateRange: "2024-01-04 → 2025-11-09",
    durationLabel: "1 year 10 months",
    activeDays: 188,
    activeMonths: 22,
    busiestDay: { date: "2024-09-15", count: 28 },
    busiestMonth: { month: "2024-09", count: 92 },
    busiestYear: { year: "2024", count: 174 },
    geoCount: 174,
    geoShare: 0.68,
    favoritedCount: 8,
    archivedCount: 5,
    trashedCount: 2,
    editedPairCount: 6,
    burstCount: 5,
    duplicateCount: 4,
    missingTimestampCount: 12,
    missingGeoCount: 82,
    missingDeviceCount: 28,
    topAlbum: { name: "Iceland 2024", count: 92 },
    topDevice: "ANDROID_PHONE — Pixel 8",
    topDeviceCount: 152
  },
  albums: [
    {
      name: "Iceland 2024",
      itemCount: 92,
      photoCount: 80,
      videoCount: 12,
      first: "2024-09-12",
      last: "2024-09-23",
      topDevice: "ANDROID_PHONE — Pixel 8",
      sampleFilenames: [...],
      mosaicHashes: [...]   // 8 deterministic 0–360 hue values for CSS tiles
    },
    ...
  ],
  devices: [
    {
      name: "ANDROID_PHONE — Pixel 8",
      kind: "android",
      itemCount: 152,
      share: 0.59,
      photoCount: 145,
      videoCount: 7,
      first: "2024-03-04",
      last: "2025-11-09",
      monthly: [{ month: "2024-03", count: 12 }, ...]
    },
    ...
  ],
  monthTotals: [
    { month: "2024-01", count: 12, photo: 11, video: 1, days: 6 },
    ...
  ],
  yearTotals: [
    { year: "2024", count: 174, photo: 158, video: 16 },
    ...
  ],
  yearMonthHeatmap: {
    years: ["2024", "2025"],
    cells: [/* per-year array of 12 ints */]
  },
  hourCounts: [/* 24 ints */],
  dowCounts:  [/* 7 ints, 0=Sun */],
  heatmap:    [/* 7 × 24 ints */],
  places: {
    points: [{ lat, lng, count, sampleId }, ...],   // unique-ish, projected
    clusters: [
      {
        label: "Cluster around 64.1 N, -21.9 E",
        lat: 64.146, lng: -21.94,
        count: 92,
        first: "2024-09-12",
        last: "2024-09-23",
        sampleIds: [...]
      },
      ...
    ],
    bbox: { minLat, maxLat, minLng, maxLng } | null
  },
  bursts: [
    {
      start: "2024-09-15T11:42:01.000Z",
      end:   "2024-09-15T11:44:07.000Z",
      durationSec: 126,
      count: 6,
      album: "Iceland 2024",
      sampleFilenames: ["IMG_…0142.jpg", ...],
      itemIds: ["gp_000123", ...]
    },
    ...
  ],
  editedPairs: [
    { base: "IMG_20250712_143015", original: "gp_000041", edited: "gp_000042" },
    ...
  ],
  duplicates: [
    {
      ts: "2024-09-15T11:42:01.000Z",
      album: "Iceland 2024",
      sampleIds: ["gp_000123", "gp_000124"],
      reason: "same photoTakenTime + same album"
    },
    ...
  ],
  meta: { sourceDir, fileCount, sidecarCount, shape: "google-photos-takeout" }
}
```

The parser pre-computes `summary` / `albums` / `devices` /
`monthTotals` / `yearTotals` / `yearMonthHeatmap` / `hourCounts` /
`dowCounts` / `heatmap` / `places` / `bursts` / `editedPairs` /
`duplicates` — do **not** re-derive them on the client. Walking
thousands of rows to compute burst clusters and per-device
sparklines freezes mobile browsers. Use the pre-aggregated arrays
directly; iterate over `rows` only for the drill-down table render.
