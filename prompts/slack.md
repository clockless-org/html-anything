# slack — channel JSON export

The shared multi-chat contract above (heatmap, leaderboard, decisions,
topics, drill-down) applies fully. This file adds Slack-specific notes.

## What's distinctive about Slack data

- **Threads are the unit of work.** A busy product channel is mostly
  a few deep threads, not a flat firehose. `DATA.threads` is sorted by
  message count — surface the top 3–5 as their own "Threads of note"
  panel, each with parent message, participants, and message count.
  When the drill-down is open, render thread replies indented under
  their parent (group on `threadId`).
- **Reactions carry signal.** A `:white_check_mark:` next to a Q3
  proposal means "approved". Surface `DATA.topReactions` as an emoji
  signature row. In the decisions sub-panel, badge any message whose
  reaction list contains a "decision" emoji (`+1`, `white_check_mark`,
  `shipit`, `approved`, `merge`).
- **`@here` / `@channel` mark broadcasts.** If the sample has 3+
  broadcast pings, add a small "Broadcast log" row showing who paged
  the channel, when, and what the message was. These are
  high-attention moments worth pinning.
- **Channel chrome.** Show the channel name as `#name` in the header
  card. If `DATA.platform === "slack"`, the chrome should feel a touch
  Slack-y (sans-serif, restrained), but stay inside the Clockless
  design tokens — no Slack purple, no Slack avatars.

## Source-specific layout hints

- Headline card: "#{channel} · {messageCount} messages from
  {senderCount} people · {dateRange}" + a sentence the LLM writes from
  the sample ("most action between 10am and 4pm Pacific, threads from
  Mira drove the most replies").
- Treat thread replies in the drill-down with a slight left indent and
  a "↳" marker before the sender name — they read very differently
  from top-level messages.
- The contributor leaderboard should call out anyone whose share is
  >25%; that sender is essentially carrying the channel and the user
  should see that at a glance.
