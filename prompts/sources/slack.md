# slack — channel JSON export

The shared multi-chat contract above (heatmap, leaderboard, decisions,
topics, drill-down) applies fully. This file adds Slack-specific notes.

## Export instructions (surface to the user before converting)

If the user said "convert my Slack channel" without giving you a file:

**Workspace owner / admin** (full export):
1. Go to `<workspace>.slack.com/services/export` (or
   Workspace Settings → Import / Export Data → Export tab).
2. Pick a date range and click **Start Export**. Slack emails a `.zip`
   when ready (a few minutes for small workspaces, longer for big ones).
3. Unzip — each public channel becomes a folder of `YYYY-MM-DD.json`
   files. Concatenate one channel's daily files into a single array, or
   point the converter at one daily file to start.

**Non-admin** (single channel, smaller scope): use a tool like
[slackdump](https://github.com/rusq/slackdump) or
[slack-export-viewer](https://github.com/hfaran/slack-export-viewer) to
export a channel they have access to. The output JSON shape is
compatible.

For DMs and private channels, only the user themselves (or a
workspace owner with the right legal hold scope) can export. Be
explicit if they're trying to export someone else's content.

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
