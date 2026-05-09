# Multi-sender chat (shared)

This prompt is shared by every multi-sender chat source in the pack:
**Slack**, **Discord**, **Telegram**, **iMessage**, and the generic
multi-sender CSV. WhatsApp has its own 1:1-relationship-shaped prompt
and is **not** part of this family — don't borrow framing across.

The output is **not a chat viewer**. It's a one-page infographic that
makes the user say *"oh, here's what's actually going on in this
channel"* — who carries it, when it lights up, what got decided, what's
still unanswered, and which threads were the real ones — with the raw
log as drill-down.

## Required sections (must always render — non-negotiable)

These five sections form the chat-pack contract. The page **must**
include all of them, with the literal section labels visible somewhere
in the rendered DOM. This is a hard constraint; do not skip any of them
even on a small or single-thread sample.

1. **Activity heatmap** — a 7×24 day-of-week × hour-of-day grid (or a
   responsive equivalent that preserves both axes), intensity by
   message count. Drive it from `DATA.heatmap` (already aggregated as
   `[{ dow, hour, count }]` — `dow` is `0=Sun..6=Sat` in UTC). Render
   inline SVG. Visible heading "Activity heatmap" or equivalent.
2. **Contributor leaderboard** — top senders ranked by message count,
   each row showing name, count, and that sender's share of total
   activity. Drive it from `DATA.senders` (already sorted descending).
   Visible heading "Contributors" or "Leaderboard".
3. **Decisions & action items** — a callout panel listing what got
   committed to and what was decided. Drive it from `DATA.actionable`
   (already classified `signal: "action" | "decision" | "question"`)
   plus anything else you can pull from the sample. Group by signal so
   "Decisions" / "Action items" / "Open questions" each get a sub-panel
   with the original message, sender, and timestamp. If a sub-list is
   empty, render an empty-state line ("No decisions surfaced — this
   channel is mostly chatter.") rather than omitting the section. The
   literal labels "Decisions" and "Action items" must be visible.
4. **Topic clusters** — pick 4–8 themes from the sample (planning,
   incidents, hiring, product, off-topic, …) and show a small bar
   chart or chip cloud of message volume per theme. Theme labels are
   the LLM's call from the sample. If the sample is too thin to
   support clustering (< 20 messages), render a placeholder card with
   the top 8 most-frequent non-stopword terms. Visible "Topics" label.
5. **Searchable log drill-down** — a collapsible "Browse all N
   messages" section with the full thread (data inlined). Default to
   collapsed so the analysis is the headline. Inside: bubble-style
   timeline grouped by day, sender filter chips, full-text search,
   reaction badges where present, jump-to-message links from the
   decisions / leaderboard rows. The drill-down is a hard requirement;
   it's how trust gets re-earned after the inferred analysis.

Render these five regardless of channel size. They are the headline
shape of the multi-chat pack — without them, the output is incomplete.

## What else to surface (pick what fits the channel's shape)

- **Channel card (top)** — name (channel/group/chat), platform,
  participant count, date range, total messages, active days as a
  fraction of date range, and a one-sentence read on the channel ("a
  high-tempo product channel — most activity Tue/Wed afternoons,
  carried by the top 3 contributors").
- **Volume over time** — sparkline / area chart from `DATA.volumeByDay`
  showing how busy the channel was per day or per week. Highlights
  crunch periods, quiet weeks, the ramp into and out of an incident.
- **Reactions / emoji signature** — top reactions or emojis used and
  by whom (Slack reactions, Discord reactions, Telegram reactions are
  in `DATA.topReactions` already). Skip the section gracefully if the
  source has no reactions (e.g. Telegram exports often omit them).
- **Threads of note** — the largest conversation threads (`DATA.threads`),
  each as a card showing parent message, participants, message count,
  and time span. Click-through expands the thread inside the drill-down.
- **Forwarded / cross-posted callouts** — for Telegram, surface
  forwarded messages as an "incoming context" panel. For Slack /
  Discord, surface @-mentions of `@here` / `@channel` as a "broadcast
  log" if there are 3+ in the sample.
- **Per-speaker filter** — the contributor leaderboard items should
  also act as filter chips: clicking a sender narrows the drill-down
  log to just their messages without changing the analysis cards.

Don't try to do all of these. Pick 3–5 beyond the required five, based
on what the data supports.

## Always include

- Light + dark mode (`prefers-color-scheme`).
- Mobile-first responsive — analysis cards stack, heatmap shrinks but
  stays readable (consider hiding the hour labels and keeping just
  morning / midday / evening bands on narrow viewports).
- Charts render inline SVG (no Chart.js, no CDNs) for under ~1500 data
  points. Use Canvas if the volume chart goes longer.
- Keep the page under 500 KB inlined where possible — the message log
  drives size, so prefer text-only message bodies in the drill-down.
- "Copy as Markdown" of the analysis section.
- Full-text search across the message log; highlight matches in place.

## Data shape

Every chat parser in this pack feeds the same shape. Don't write
different rendering logic for "Slack vs Discord" — use the
`platform` field to label the chrome and otherwise treat them
identically.

```ts
DATA = {
  messages: [
    {
      id: "m_0001",
      ts: "2026-04-12 09:14:00",      // sortable
      date: "2026-04-12",
      time: "09:14:00",
      tsEpoch: 1744449240000,
      sender: "Mira Park",
      text: "...",
      channel?: "#product-eng",       // platforms with a channel concept
      threadId?: "1744449200.000100", // platform-native thread anchor
      isThreadReply?: true,
      replyCount?: 4,
      replyToId?: "m_0042",           // for Telegram/Discord reply pointers
      forwardedFrom?: "Mira Park",    // Telegram only
      reactions?: [{ name: "+1", count: 2 }],
      reactionCount?: 3,
      mentionCount?: 1,
      attachmentCount?: 1,
      isMedia?: true,
      isFromMe?: true                 // iMessage owner-flagged exports
    }
  ],
  senders: [{ sender, count, firstTs, lastTs }],
  messagesPerSender: { "Mira Park": 42 },
  heatmap: [{ dow: 0..6, hour: 0..23, count }],   // pre-aggregated
  volumeByDay: [{ date, count }],                  // pre-aggregated
  threads: [{ id, parentSender, parentText, participants, messageCount, firstTs, lastTs, reactionCount }],
  actionable: [{ id, ts, sender, text, signal: "action" | "decision" | "question" }],
  topReactions: [{ name, count }],
  dateRange: "2026-04-12 → 2026-04-26",
  messageCount: 217,
  senderCount: 9,
  threadCount: 12,
  reactionCount: 84,
  mediaCount: 6,
  platform: "slack" | "discord" | "telegram" | "imessage" | "multi-sender-chat",
  channel?: "#product-eng",
  guild?: "Acme HQ"                     // Discord guild name
}
```

Use the pre-aggregated `heatmap` / `volumeByDay` / `senders` /
`threads` / `actionable` / `topReactions` arrays directly. Do **not**
re-derive them on the client — the parser already did the math, and
the client-side derivation would have to walk the full message array
again, which kills performance on big channels.

## Tone

Analytical and a touch human. Headline copy reads like an observation,
not a dashboard label. "Mira and Sam carry this channel — they wrote
58% of everything in April" is a sentence; "Top contributor share:
58%" is a metric. Use sentences in the cards, metrics in the charts.

## Privacy note (include in the page footer)

Add a small footer line. Group/team chats often contain real names and
internal context — remind the user the file is local:

> *Generated locally — your chat export never left your machine. The
> full log is embedded in this HTML and rendered in your browser. For
> sharing, prefer an anonymized export.*
