# twitch-history — Twitch viewing & chat history

The user's Twitch activity — viewing history (which streams / VODs they
watched) and / or chat history (messages they sent). Output is **a
"your year in Twitch" replay** — a scrollable wall of the streams and
streamers that filled their hours.

## Export instructions (surface to the user before converting)

Twitch's official "request my data" flow:

1. Go to
   [twitch.tv/p/legal/privacy-choices/](https://www.twitch.tv/p/legal/privacy-choices/)
   → scroll to **Request your data**. (Direct link sometimes moves —
   if so, search "Twitch data request" from logged-in account settings.)
2. Confirm identity, request the export, wait for an email.
3. Twitch sends a `.zip` after a few days with multiple CSVs. The
   relevant files:
   - **`viewing_history.csv`** — every stream / VOD they watched, with
     channel, date, duration.
   - **`messages.csv`** — every chat message they sent.
   - **`subscriptions.csv`** + **`bits.csv`** — financial activity if
     they want to include it.
4. Drop the folder into Claude Code:
   `convert my Twitch data to HTML: ~/Downloads/twitch-export`. The
   skill will detect the multi-CSV shape and use this prompt.

For a **single channel's chat log** instead (someone wants their own
chat from a specific streamer's broadcast), the standard tool is
[**RechatTool**](https://github.com/jdpurcell/RechatTool) or
[chatdownloader](https://github.com/xenova/chat-downloader) — both
output JSON the converter can consume.

## What to surface (the experience)

The user spent thousands of hours watching streams. The page should
feel like a tribute to that time — not a privacy alarm.

### Hero (top of the page)

A "year in Twitch" line: *"You watched 287 hours across 64 streamers in
2024 — your top 3 were Caedrel, ShannonZKiller, and ssumday."* Numbers
count up on first view.

### Top streamers wall

A grid of the top 12 streamers by watch time, each a card with:
- Streamer name (big, display type).
- Watch hours total + % of all hours.
- Sparkline of watch volume across the period (when this user was most
  into them).
- A one-sentence LLM observation. *"You watched ShannonZKiller almost
  exclusively on weekends — 73% of her watch hours fell on Saturday or
  Sunday."*

Click a card → a side panel with every session of that streamer.

### Chat volume (if `messages.csv` was included)

- **Activity heatmap** — day-of-week × hour, intensity by chat messages
  sent.
- **Top 10 channels by chat participation** (different from watch time —
  some users lurk most channels and chat in only a few).
- **Most-used emotes** — top 8 emotes / words, with counts. Pull the
  default Twitch emote names; if a custom-emote-only emote shows up,
  treat it as a string.

### Watch timeline (drill-down)

A vertical timeline of every session, grouped by month. Each entry is a
small row: date, streamer, duration. Clickable to open the channel
on Twitch. Searchable + filterable by channel.

### Genre / category breakdown

If the export has stream categories ("League of Legends", "Just
Chatting", "Software & Game Development"), show a stacked area chart of
hours per category over time. Reveals shifts ("you watched mostly LoL
in 2022, mostly Just Chatting in 2024").

## Always include

- A "**Copy as Markdown**" button that exports the top-streamer
  rundown as a shareable summary.
- Privacy footer: *"Your Twitch export never left your machine. The
  full history is embedded in this HTML and rendered client-side."*

## Data shape

```ts
DATA = {
  views: [
    { ts: "2024-08-12T22:14:00Z", channel: "Caedrel", category: "League of Legends",
      durationSec: 7423, vodId?: "..." }
  ],
  messages: [
    { ts: "...", channel: "...", text: "Pog", emotes: ["Pog"] }
  ],
  byChannel: { "Caedrel": { hours: 312, sessions: 187 }, ... },
  byCategory: { "League of Legends": 412, ... },
  totalHours: 287,
  totalSessions: 1842,
  dateRange: "2023-01-04 → 2024-12-30",
  meta: { sourceFile, sizeBytes }
}
```

## Tone

A bit of fandom warmth. Caedrel's name in display type. Emote counts
in mono with a subtle glow. Brand orange for accent. Don't make it
look like a parental-control dashboard — make it feel like a fan
shrine.
