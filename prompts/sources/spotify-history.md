# spotify-history — your full listening history (Spotify Privacy export)

Your full Spotify listening history — every track you've played — from
the official Privacy export. Output is a **scrollable "your life on
Spotify" experience**, not a Wrapped clone (Spotify's own Wrapped is
already excellent at the year-summary thing; this skill goes deeper /
across-time / explorable).

## Export instructions (surface to the user before converting)

Spotify will email you the full data — but it takes 2–4 weeks. Tell the
user this up front so they don't think they did something wrong:

1. Go to [spotify.com/account/privacy](https://www.spotify.com/account/privacy/).
2. Scroll to **Download your data**.
3. Two options:
   - **Account data** (~5 days, lighter) — gives them roughly the last
     12 months. Smaller, faster, good enough for most uses.
   - **Extended streaming history** (~30 days, heavier) — gives every
     track they've ever played since they joined Spotify. This is the
     fun one for the "your life" experience.
4. Pick one (or both). Confirm via the email Spotify sends.
5. Wait. They'll get an email with a download link when ready.
6. Unzip. Inside, look for `Streaming_History_Music_*.json` (Account
   Data) or `endsong_*.json` (Extended) — those are the files. Multiple
   numbered files concat into one history. Drop the folder or one file
   into Claude Code: `convert this folder of JSONs to HTML`.

If the user wants something **right now** without waiting, point them
at [stats.fm](https://stats.fm) — it's a third-party service Spotify-API-
backed that shows recent listening immediately. The export-driven
experience is richer because it's the *full lifetime*, not just recent.

## What to surface (the experience)

This is meant to feel like **scrolling through your own listening
history as a story** — not a stats page. Think: a long, vertical,
year-by-year scroll where each section reveals more about that period.

### Hero strip

Total tracks played, total minutes listened, total artists / albums,
date range of the data ("3,847 days · 28,142 tracks · 1,940 hours").
One line, big, brand color.

### Year-by-year scroll (the main experience)

For each year covered:
- **Year header** — the year, large, in display type.
- **Top track of the year** — track + artist + play count, with album
  art if the export has it (otherwise a default art tile).
- **Top 5 artists** that year, as a row of cards.
- **Listening volume** — sparkline of plays per week through the year.
- **One insight sentence** the LLM extracts. *"You listened to Phoebe
  Bridgers more in October 2022 than any other artist in any other
  month — 312 plays."*
- **Discoveries** — first 5 artists that appeared in the user's top 50
  for the first time that year (the "what was new in your life" angle).

### Lifetime view (after the year scroll)

- **Top 20 artists of all time** as a tile grid, ranked by total play count.
- **Most replayed track** — the single track played most ever.
- **Listening rhythm** — heatmap of day-of-week × hour-of-day across
  the full history. Shows when this user listens.
- **Genre evolution** — if genre data is available, a stacked area
  chart of genre share over the years.

### Drill-down

A search box that filters across all tracks ever played. Type an artist,
see every play. Tracks listed with date + ms played + skip indicator.

## Animations

This is the showcase for "experience > infographic":
- Year sections **reveal on scroll** — each year fades + lifts in as
  the user scrolls into it (CSS `IntersectionObserver` + animation).
- Top-track cards have a subtle parallax on mouse move.
- Numbers count up from 0 the first time they enter view.
- The lifetime heatmap "fills in" left-to-right on first reveal.

Keep it tasteful. No autoplaying audio. No carousel that controls
itself. Animations should feel like a story being told, not a gimmick.

## Always include

- "Copy as Markdown" button at the bottom that captures the year-by-
  year highlights as a shareable summary.
- A footer line: *"All data lives in this HTML file — your Spotify
  export never left your machine."*

## Data shape

```ts
DATA = {
  plays: [
    {
      ts: "2023-04-12T18:34:11Z",
      track: "Motion Sickness",
      artist: "Phoebe Bridgers",
      album: "Stranger in the Alps",
      msPlayed: 254133,
      skipped: false,
      platform: "ios"
    }
  ],
  topPerYear: { "2022": [...], "2023": [...] },
  artistTotals: { "Phoebe Bridgers": 1287, ... },
  trackTotals: { ... },
  dateRange: "2018-06-04 → 2025-12-30",
  totalPlays: 28142,
  totalMs: 6_982_000_000,
  meta: { sourceFile, sizeBytes }
}
```

## Tone

Personal, nostalgic, dignified. Bold display headlines (Space Grotesk
600+), warm body type. Not "Spotify Wrapped" green-and-pink — use the
Clockless tokens from `prompts/styles/_design.md` so this output feels like part of
the html-anything family, not a Spotify imitation.
