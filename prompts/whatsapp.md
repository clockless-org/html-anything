# whatsapp — `_chat.txt` export

A WhatsApp export. The output is **not a chat viewer** — it's an
infographic that shows the user *what their relationship with this
person/group looks like*, with the messages themselves as a drill-down.

## What to surface (the headline of the page)

Look at the sample (first 8 + last 4 messages, sender stats,
date range, message counts) and **infer + visualize**:

### Relationship card (top)

- **Period covered** — date range with total days, plus what % of those
  days had any messages (engagement frequency).
- **Cadence** — average messages/day, busiest day, longest gap, longest
  streak. Format like "talked ~12 msgs/day · 4-day longest gap · busiest
  day was 2026-01-25 (47 messages)".
- **Who leads** — for 2-person chats, the % split of who sends first
  after a 4+ hour gap (this is "who initiates"). For group chats, the
  top 3 most active senders.
- **Conversation arc** — pick the 5–10 most meaningful turns from the
  sample (a decision point, a plan being made, a milestone, a strong
  emotional moment) and pin them on a horizontal timeline. Each pin is
  one sentence the LLM writes, anchored to the date.

### Visualizations

Choose 3–5 of these based on what the data supports:

- **Activity heatmap** — day-of-week × hour-of-day cells, intensity by
  message count. Reveals "evening texter" vs "morning person" patterns.
- **Volume over time** — sparkline / area chart of messages per
  day or per week. Shows when the relationship was hot vs quiet.
- **Sender split** — donut or stacked bar of message share, with
  emoji-only-message percentage as a secondary metric.
- **Reply latency distribution** — histogram of "minutes between message
  and the next reply". Tells if the chat is fast-and-quippy or
  slow-and-deliberate.
- **Topic clusters** — pick 4–8 themes from the sample (work, food,
  travel, weekend plans, books, …) and show a small bar chart of
  message volume per theme. The LLM has to guess the themes from the
  sample — that's part of the value.
- **Emoji map** — top 8 emojis used and by whom. A surprising emoji
  signature per person.

Don't try to do all of these. Pick the 3–5 that the LLM can actually
populate from the sample + meta, and that fit the relationship's shape.

### The messages themselves

Below the analysis, include a **collapsible** "Browse all N messages"
section with the full thread (data is inlined). Default to collapsed
so the headline is the analysis, not the raw chat. Inside the panel:
bubble timeline grouped by day, sender filter chips, search, date jump.

## Always include

- Light + dark mode (`prefers-color-scheme`).
- Mobile-first responsive — analysis cards stack, charts shrink
  gracefully.
- Charts render with inline SVG (no Chart.js, no CDNs) for under ~1000
  data points. For more, use Canvas.
- Keep the page under 500 KB inlined. The full message log is in DATA;
  don't duplicate it in the rendered HTML.
- "Copy as Markdown" of the analysis section (so users can paste into
  notes / share).

## Data shape

```ts
DATA = {
  messages: [
    { ts: "2026-01-04 09:12:07", date: "2026-01-04", time: "09:12:07",
      sender: "Alex Chen", text: "...", isMedia?: boolean }
  ],
  senders: ["Alex Chen", "Mira Park"],
  messagesPerSender: { "Alex Chen": 42, "Mira Park": 41 },
  dateRange: "2026-01-04 → 2026-02-02",
  messageCount: 83,
  senderCount: 2,
  mediaCount: 1,
  meta: { sourceFile, sizeBytes, ... }
}
```

The LLM also has the schema and stats in the prompt — use those to
populate the headline cards. The full `messages` array is for the
"Browse all" drill-down, where client-side JS renders bubbles.

## Tone

Analytical but warm. Headline copy should sound like an observation
about the relationship, not a dashboard label. "You two reply to each
other in under 5 minutes 80% of the time" is a sentence; "Avg reply
latency: 4.2m" is a metric. Use sentences in the cards, metrics in the
charts.

## Privacy note (include in the page footer)

Add a small footer line: *"Generated locally — your conversation data
never left your machine. The full chat is embedded in this HTML and
rendered in your browser."*
