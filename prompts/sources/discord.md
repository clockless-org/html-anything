# discord — DiscordChatExporter JSON / CSV

The shared multi-chat contract above (heatmap, leaderboard, decisions,
topics, drill-down) applies fully. This file adds Discord-specific
notes.

## Export instructions (surface to the user before converting)

If the user said "convert my Discord channel" without giving you a file:

Discord doesn't have a built-in channel exporter, but
[**DiscordChatExporter**](https://github.com/Tyrrrz/DiscordChatExporter)
is the standard community tool. Two ways to run it:

**GUI (easiest)**:
1. Download DiscordChatExporter from the GitHub releases page.
2. Get a Discord user token (the GUI walks them through it — DevTools →
   Network tab → look for the `authorization` header on any request).
3. Pick the channel, choose **Format: JSON**, click Export.

**CLI**:
```bash
DiscordChatExporter.Cli export -t <user-token> -c <channel-id> -f Json
```

The output JSON is what this prompt's data-shape section expects.
Heads-up to remind the user: exporting a server they don't own is
allowed for personal use under Discord's TOS but distributing the
export isn't. The HTML output is single-file local — fine to keep,
but think before sharing.

## What's distinctive about Discord data

- **Many casual senders, long tail.** Community servers often have 20+
  participants with most posting once or twice and a small core
  carrying volume. The contributor leaderboard should show the top 8
  by name and roll the long tail into "+ N more" — don't render a
  20-row leaderboard.
- **Replies, not threads.** Discord's `reference.messageId` is
  per-message, not a thread anchor. `DATA.messages[*].replyToId` is
  the field; build "reply chains" by walking those pointers when the
  user expands a message in the drill-down. Surface the top 3 reply
  chains in the threads-of-note panel.
- **Emoji-rich.** Reactions are usually present. The emoji signature
  is more meaningful here than on Slack — render a "Top emoji" strip
  with counts. Custom emoji come through as their text name (e.g.
  `pog_dance`); render those as `:name:` text — no images.
- **Mentions matter.** Discord's `@user` and `@everyone` patterns are
  important; if the sample has @everyone usage in a community channel,
  call it out as a "broadcast" callout. `DATA.messages[*].mentionCount`
  is set when the original parser captured it.

## Source-specific layout hints

- Headline card: "{guild} · #{channel} · {messageCount} messages from
  {senderCount} people". Guild name is in `DATA.guild` for JSON
  exports; falls back to the file basename for CSV exports.
- Treat the channel as a community space by default — slightly less
  formal copy than Slack ("the regulars are…" vs. "the carriers
  are…"). Stay inside the Clockless design tokens; no Discord brand
  colors.
- The contributor leaderboard should show *avatars-as-initials*
  (first letter of the display name in a circle) — Discord exports do
  not include avatar bytes and we will not fetch any.
- Topic clusters work especially well here: pick themes from the
  sample like "memes", "help/support", "events", "off-topic",
  "moderation". These read very Discord-y and the user expects them.
