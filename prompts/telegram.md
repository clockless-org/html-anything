# telegram — Telegram Desktop `result.json`

The shared multi-chat contract above (heatmap, leaderboard, decisions,
topics, drill-down) applies fully. This file adds Telegram-specific
notes.

## What's distinctive about Telegram data

- **Personal chats, groups, and channels are different surfaces.** The
  parser stamps `DATA.chatType` (one of `personal_chat`, `private_group`,
  `private_supergroup`, `private_channel`, etc.). Use it to set the
  framing:
  - `personal_chat` → 1:1 conversation, lean into "Open questions"
    and reply latency rather than leaderboard / topic clusters. The
    leaderboard still has to render (it just shows two rows).
  - `private_group` / `private_supergroup` → small-team chat;
    standard pack treatment.
  - `private_channel` / `public_channel` → broadcast-style; the
    leaderboard often has 1–2 senders. Skew the visualizations to the
    volume-over-time chart and topic clusters; flag this in copy.
- **Replies have first-class IDs.** `DATA.messages[*].replyToId` points
  to another message's id. Render a small "↳ in reply to {sender}" tag
  under reply messages in the drill-down. Reply chains are the
  closest thing Telegram has to threads.
- **Forwarded messages are common in groups.** `DATA.messages[*]`
  whose `forwardedFrom` is set are forwards. Pin the top forwarded
  sources in a "Incoming context" callout under the headline — group
  forwards usually mean "someone is bringing in a debate from
  elsewhere".
- **Reactions are sparse.** Telegram exports often omit reaction
  data entirely. If `DATA.topReactions` is empty, omit the emoji
  signature panel quietly rather than rendering an empty card.

## Source-specific layout hints

- Headline card: "{channel} ({chatType}) · {messageCount} messages
  from {senderCount} people · {dateRange}".
- The decisions / action items panel works especially well for
  customer-support and ops Telegram chats — surface ETAs and "I'll
  get back to you" lines in the action list.
- For `personal_chat` exports, also surface a "reply latency" stat
  ("you replied within an hour 68% of the time"). For larger group
  exports, skip per-pair latency and stick to the heatmap.
