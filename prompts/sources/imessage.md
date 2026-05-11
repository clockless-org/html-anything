# imessage — CSV-style export

The shared multi-chat contract above (heatmap, leaderboard, decisions,
topics, drill-down) applies fully. This file adds iMessage-specific
notes.

iMessage CSV exports come from a handful of third-party tools (iMazing,
imessage_export, ad-hoc Shortcuts). We treat them all the same once
they're in the unified shape.

## What's distinctive about iMessage data

- **Most exports are 1:1 or small group chats.** The leaderboard often
  has 2–4 rows; render it but don't make it the headline. Lean the
  layout toward conversation arc + reply latency + topic clusters.
- **`isFromMe` exists.** When `DATA.messages[*].isFromMe` is set, the
  drill-down should render those bubbles right-aligned in a primary
  color and other-side bubbles left-aligned in surface color (real
  iMessage behavior). When `isFromMe` isn't set on the export, fall
  back to "color by sender" with consistent per-sender colors.
- **Tapbacks / reactions are rare in CSV exports.** Most exporters
  drop them. If `DATA.topReactions` is empty, omit the emoji signature
  panel.
- **Phone numbers as senders.** iMessage senders are sometimes raw
  `+1...` phone numbers when contacts don't resolve. Render those
  as-is in the leaderboard but pad with a small badge ("📱") so they
  read as "this is a number, not a contact".

## Source-specific layout hints

- Headline card: "iMessage thread · {messageCount} messages from
  {senderCount} people · {dateRange}". If there are exactly two
  senders, frame it as a 1:1 thread and show the conversation arc
  pins (see whatsapp.md for inspiration; same idea, lighter framing).
- Decisions / action items panel works well for "who's bringing
  what" / "I'll grab the kids at 4" practical chats — surface those
  as the action list with their timestamps.
- The drill-down log should look closer to a chat bubble timeline
  than to a Slack-style list. Group by day with a small date label
  between days, like the iMessage app does.
- Privacy footer should be a touch louder here: iMessage exports
  almost always contain real names and personal context.
