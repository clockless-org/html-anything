# multi-sender-chat — generic / unknown-source CSV

The shared multi-chat contract above (heatmap, leaderboard, decisions,
topics, drill-down) applies fully. This is the catch-all for chat
exports whose source can't be confidently identified — usually CSV
files with `Date / Sender / Message` columns from ad-hoc tools.

## Treatment

- Trust the unified shape. The platform-agnostic `DATA` is exactly
  what every other chat parser emits; nothing here is missing relative
  to slack/discord/telegram beyond per-platform niceties (reactions,
  threads, replies are all optional).
- Don't invent a brand for the channel. The chrome should read as
  "Chat log · {messageCount} messages from {senderCount} people". No
  per-platform color, no per-platform icon.
- If you spot in the sample that the senders look like a mix of agents
  and a single customer (one repeating non-agent name + multiple
  team-shaped names), frame the page as a customer-support chat:
  surface response latency, action items ("we'll send the replacement
  by Friday"), and outcome ("resolved" vs "still open").
- If the senders look balanced (no obvious agent/customer asymmetry),
  treat it as a generic group chat: lead with the leaderboard and
  topic clusters.
- Privacy footer is mandatory: this is the source whose provenance
  the user is least sure about, so the "stays local, embed only what
  you'd share" reminder matters most here.
