# youtube-watch-history — your YouTube watch history (Google Takeout)

A normal user's YouTube watch trail — every video they've watched —
from the official Google Takeout export. Output is a **personal
attention mirror**: which channels and topics dominate, what binge
sessions look like, when they reach for YouTube, what they keep
rewatching, and which old useful videos are worth rediscovering.

The interesting story is **the human shape of years of YouTube**, not
"your JSON in HTML form". A raw `watch-history.json` is unreadable;
a good page makes the user say *"oh — I watched 92 hours of cooking
this year, but my late-night YouTube is mostly ambient music, and I
keep rewatching the same database tutorial three times."*

This prompt is part of the experiential pack (Spotify, Twitch,
Amazon, Kindle, etc.). Frame it as a personal attention log, not a
productivity scorecard. No shame voice. No "screen-time tax".

## Export instructions (surface to the user before converting)

YouTube's official path lives inside Google Takeout:

1. Go to [takeout.google.com](https://takeout.google.com).
2. Click **"Deselect all"**, then scroll to **"YouTube and YouTube
   Music"** and check it.
3. Click **"All YouTube data included"** → uncheck everything except
   **"history"**. (The full export with videos and music files can be
   tens of gigabytes; you only need history for this.)
4. Optional: change **"Multiple formats"** so `history` is **JSON**
   (default is HTML, which works too but is harder to parse).
5. Click **"Next step"**, choose a one-time export, **"Send download
   link via email"**, **".zip"**, and ~50 GB max size.
6. Submit. Google emails a download link in **a few minutes to a few
   hours** — much faster than Spotify or Amazon.
7. Unzip. Inside, look for
   `Takeout/YouTube and YouTube Music/history/watch-history.json`
   (or `watch-history.html` if you left the default).
8. Drop the file into Claude Code:
   `convert this YouTube watch history to HTML: ~/Downloads/watch-history.json`.

If the user wants an **immediate** answer without exporting,
[stats.fm](https://stats.fm) is Spotify; YouTube has no equivalent
that works without OAuth. The Takeout flow is the path.

## Source shapes the parser handles

- **`watch-history.json`** (canonical). Array of objects with
  `header: "YouTube"`, `title: "Watched <video title>"`,
  `titleUrl: "https://www.youtube.com/watch?v=<id>"`,
  `subtitles: [{ name: "<channel>", url: "https://www.youtube.com/channel/<UC...>" }]`,
  `time: "<ISO-8601>"`, `products: ["YouTube"]`. The parser also
  accepts entries where `titleUrl` and `subtitles` are absent — that
  is Takeout's way of saying the video has been removed or made
  private. We surface those as **Removed / private** rows rather
  than dropping them; they are part of the user's history.
- **`watch-history.html`** (legacy / default Takeout format). The
  HTML form ships the same information inside a flat list of
  `<div class="content-cell">` cards. If the user only has the HTML,
  recommend re-running Takeout with **JSON** selected — the HTML is
  bulky and noisy. If they cannot, parsing it is best-effort.

Detection: filename `watch-history.json`, or any JSON whose first
8 KB contains `"header":"YouTube"` plus a `"time":"...T..."` ISO
field plus either a `youtube.com/watch` `titleUrl` or a `products`
array containing `"YouTube"`.

## What to surface (the experience)

This is meant to feel like **scrolling through years of personal
attention as a story**. Cards on a wall, not a stats dashboard.

### Hero strip (required)

One row, big, brand-anchored:

- **Total watches** + **unique channels** — *"3,140 watches across
  214 channels"*.
- **Date range** + duration — *"2 years 3 months · 487 active
  days"*.
- **Top channel** + share — *"Backslash Burrito · 9% of watches"*.
- **Late-night share** — *"14% of watches between midnight and 4am"*.

One short editorial sentence the LLM extracts: *"Cooking is the
steady drumbeat (412 watches over 2 years); the busiest day was
April 14, 2025 — 22 watches in one evening, mostly Mezzanine Tape
ambient mixes."*

### Activity timeline (required)

Two stacked views, user-toggleable:

- **Monthly bar chart** — total watches per month, with the busiest
  month flagged. Empty months rendered as `—` rather than 0.
- **Weekly bar chart** — finer-grained zoom, useful for spotting
  vacations and burst weeks.

Use inline SVG (no Chart.js, no CDNs).

Below the bars, a **day-of-week × hour-of-day heatmap** so the user
can see *when* they reach for YouTube. Sundays at 11pm? Tuesday
lunchtimes? It usually surprises.

### Binge sessions (required)

The signature YouTube question: *"what does a YouTube spiral
actually look like?"*

A panel labeled **"Binge sessions"** showing clusters where ≥4 videos
played within ~30 minute gaps of each other. For each:

- **Start time** + duration in minutes ("Tue Apr 14 · 2hr 18min").
- **Watch count** in that cluster.
- **Top channel** of the cluster (the one that dominated the spiral).
- **Sample titles** — first ~6 titles in the cluster.
- Click → drill-down filtered to those exact rows.

If no cluster qualifies, replace with **"Quiet history"** — *"No
binge clusters found; you watch in short bursts spread across the
day."*

### Channel leaderboard (required)

A horizontal-bar panel labeled **"Channels"** with top 10 channels by
watch count, descending. Each row: channel name, count, share %,
sparkline of monthly watches, click-to-filter. The leaderboard is
the spine of the page.

### Topic mix (required, heuristic-flagged)

A panel labeled **"Topics"** with topic buckets derived from
keyword heuristics (`learning`, `coding`, `music`, `cooking`, `news`,
`gaming`, `entertainment`, `vlog`, `craft`, `late-night`, `other`).
Each topic shows count + share + a chip linking to filtered rows.

Above the panel, a "Heuristic" chip with a tooltip explaining that
topics come from keyword matches over the title and channel name —
not topic modeling, not LLM-derived. YouTube does not include
categories in the Takeout export; this is a best-effort label.

### Attention audit (required)

A short row of insight cards:

- **Late-night share** — count + share + sample of the latest
  watches. *"14% of watches happen between midnight and 4am — your
  late-night feed is mostly ambient music."*
- **Learning vs entertainment** — bucket-totaled counts and shares
  of `learning + coding + craft + news` vs `entertainment + cooking
  + gaming + vlog` vs `music`. Frame as *"how the time split", not
  *"are you wasting time"*.
- **Rediscovery list** — videos watched 3+ times each. The
  signature *"this video taught me something I keep coming back to"*
  signal. Title, channel, count, first → last seen, cadence label.
- **Surprising streaks** — busiest single day, busiest week,
  longest binge.

Every callout is **observational, not prescriptive**. Never say
*"you should watch less"*; say *"this is what your attention looked
like"*.

### Drill-down (required)

A collapsible **"Browse all N watches"** section with the full file
inlined. Inside:

- Full-text search across title / channel / topic.
- Filter chips: top channels, topics, year, late-night-only,
  removed-only.
- Columns: **Time**, **Title** (truncate, full title on hover),
  **Channel**, **Topic**.
- Click a row → expand to show the original record (raw title,
  videoUrl, channelId, ISO timestamp, products field, removed flag).
- Virtualized or paginated — Takeout exports can hit thousands of
  rows.

## Privacy / synthetic-data constraint (HARD)

This source carries a strong attention-history signal — every video
the user has watched plus timestamps. Treat it as sensitive.

- **Never use real YouTube history.** The example shipped with this
  repo is **fully synthetic** — fake channel names, fake video
  titles, fake video IDs, fake timestamps. Do not commit real
  exports.
- **Never fetch video thumbnails.** The page must not request
  `i.ytimg.com`, `yt3.ggpht.com`, YouTube CDN, YouTube Data API, or
  any Google service. "Watch on YouTube" links go to a plain
  `<a href target="_blank" rel="noopener noreferrer">` so the user
  decides whether to click. No previews, no embeds, no oEmbed.
- **No iframe embeds.** Embedding `<iframe>` from `youtube.com`
  would phone home with cookies on every page open. Hard no.
- **Mask channel handles.** Display the channel `name` only. Do not
  attempt to derive or fetch the @handle from `channelId`.
- **Footer must include a privacy line** explaining the file is
  embedded client-side and the page never made a network call.

## Tone

Personal, observational, dignified. Like a friend going through your
watch history with you. *"April 2025 was your biggest month — you
opened YouTube on 27 of 30 days. You watched 'Beans and rice, but on
purpose' three times that month, mostly while cooking."* Not
*"Screen time alert!"*. Specific to the file.

Use the Clockless tokens (Space Grotesk + Plus Jakarta Sans, brand
orange `--primary`, surface cream in light mode, proper tabular-nums
for counts). This is part of the html-anything family — never a
YouTube imitation. **Do not use YouTube red.** The brand color stays
Clockless orange.

## Always include

- "Copy as Markdown" button at the bottom that captures the channel /
  topic / binge summary as a shareable note.
- Light + dark mode via `prefers-color-scheme`.
- Mobile-first responsive — cards stack, charts shrink but stay
  readable.
- Tabular-nums for every numeric column.
- A footer line:
  > *Generated locally — your YouTube watch history never left your
  > machine. Every watch is embedded in this HTML and rendered
  > offline in your browser. Topic labels are a heuristic keyword
  > roll-up, not topic modeling. The page does not fetch from
  > YouTube, ytimg.com, Google APIs, or any third party.*

## Data shape

```ts
DATA = {
  format: "youtube-watch-history",
  rows: [
    {
      id: "yt_000001",
      ts: "2025-10-12T20:01:00.000Z",
      title: "Postgres for people who hate ORMs",
      rawTitle: "Watched Postgres for people who hate ORMs",
      videoId: "abc123XYZ_-" | null,
      videoUrl: "https://www.youtube.com/watch?v=abc123XYZ_-" | null,
      channelName: "Backslash Burrito" | null,
      channelId: "UC..." | null,
      topic: "coding",
      topicInferred: true,
      bucket: "learning" | "music" | "entertainment" | "other",
      hour: 20,
      dow: 0,
      date: "2025-10-12",
      isLateNight: false,
      isRemoved: false
    }
  ],
  summary: {
    totalCount: 242,
    uniqueChannels: 29,
    uniqueVideos: 231,
    dateRange: "2024-09-18 → 2025-11-09",
    durationLabel: "1 year 2 months",
    activeDays: 188,
    activeMonths: 15,
    busiestDay: { date: "2025-04-14", count: 22 },
    busiestWeek: { week: "2025-W17", count: 31 },
    lateNightCount: 21,
    lateNightShare: 0.09,
    removedCount: 2,
    bingeCount: 5,
    rediscoveryCount: 4,
    topChannel: "Backslash Burrito",
    topChannelShare: 0.06,
    topTopic: "cooking",
    topTopicShare: 0.14,
    learningShare: 0.32,
    entertainmentShare: 0.45,
    musicShare: 0.11
  },
  channels: [
    {
      name: "Backslash Burrito",
      channelId: "UC...",
      count: 14,
      share: 0.058,
      first: "2024-10-03",
      last: "2025-10-12",
      topic: "coding",
      sampleTitles: [{ title: "...", ts: "...", videoId: "...", topic: "coding" }, ...]
    },
    ...
  ],
  topics: [
    { topic: "cooking", count: 33, channels: 2, share: 0.14, bucket: "entertainment" },
    ...
  ],
  bucketTotals: [
    { bucket: "learning", count: 78, share: 0.32 },
    { bucket: "music", count: 27, share: 0.11 },
    { bucket: "entertainment", count: 109, share: 0.45 },
    { bucket: "other", count: 28, share: 0.12 }
  ],
  monthTotals: [
    { month: "2024-09", count: 12, activeDays: 9 },
    ...
  ],
  weekTotals: [
    { week: "2024-W38", count: 7 },
    ...
  ],
  hourCounts: [/* 24 ints */],
  dowCounts:  [/* 7 ints, 0=Sun */],
  heatmap:    [/* 7 × 24 ints */],
  rediscoveries: [
    {
      videoId: "...",
      title: "Beans and rice, but on purpose",
      channel: "Spice Drawer",
      topic: "cooking",
      timesWatched: 3,
      firstSeen: "2025-01-08",
      lastSeen: "2025-09-21",
      cadenceLabel: "every ~3 months",
      sampleIds: ["yt_000031", "yt_000094", ...]
    },
    ...
  ],
  binges: [
    {
      start: "2025-10-12T20:01:00.000Z",
      end:   "2025-10-12T21:52:00.000Z",
      durationMin: 111,
      count: 8,
      topChannel: "Backslash Burrito",
      sampleTitles: ["Postgres for people who hate ORMs", ...],
      itemIds: ["yt_000017", ...]
    },
    ...
  ],
  meta: { sourceFile, sizeBytes, shape: "youtube-watch-history" }
}
```

The parser pre-computes `summary` / `channels` / `topics` /
`bucketTotals` / `monthTotals` / `weekTotals` / `hourCounts` /
`dowCounts` / `heatmap` / `rediscoveries` / `binges` — do **not**
re-derive them on the client. Walking thousands of rows to compute
binge clusters and topic shares freezes mobile browsers. Use the
pre-aggregated arrays directly; iterate over `rows` only for the
drill-down table render.
