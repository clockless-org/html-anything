/**
 * Shared shape + stat builder for the multi-chat-export pack
 * (Slack, Discord, Telegram, iMessage, generic multi-sender CSV).
 *
 * Why one shape: the chat prompt contract (`prompts/sources/_chat.md`) promises
 * the LLM a uniform schema with messages + activity heatmap data + a
 * contributor leaderboard. Centralizing the derivation here means each
 * platform parser only has to map *its* native fields onto `ChatMsg`;
 * the heatmap/leaderboard/decisions/actions inputs come from this file.
 */

export interface ChatMsgReaction { name: string; count: number }

export interface ChatMsg {
  id: string
  ts: string                  // "YYYY-MM-DD HH:MM:SS"
  date: string                // "YYYY-MM-DD"
  time: string                // "HH:MM:SS"
  tsEpoch: number             // ms since epoch
  sender: string
  text: string
  channel?: string
  threadId?: string           // platform-native thread anchor (Slack thread_ts, Discord referenced_message id)
  isThreadReply?: boolean
  replyCount?: number
  replyToId?: string          // for platforms with reply pointers (Telegram, Discord)
  forwardedFrom?: string      // Telegram forwards
  reactions?: ChatMsgReaction[]
  reactionCount?: number
  mentionCount?: number
  attachmentCount?: number
  isMedia?: boolean
  isFromMe?: boolean          // iMessage / WhatsApp owner-flagged exports
}

export interface ChatSenderStat { sender: string; count: number; firstTs: string; lastTs: string }

export interface ChatHeatCell { dow: number; hour: number; count: number }

export interface ChatVolumeBucket { date: string; count: number }

export interface ChatThreadStat {
  id: string
  parentId?: string
  parentSender?: string
  parentText?: string
  participants: string[]
  messageCount: number
  firstTs: string
  lastTs: string
  reactionCount: number
}

export interface ChatActionItem {
  id: string
  ts: string
  sender: string
  text: string
  signal: "action" | "decision" | "question"
}

export interface ChatStatsMeta {
  sourceFile: string
  sizeBytes: number
  platform: string
  channel?: string
  [key: string]: unknown
}

export interface ChatStatsResult {
  meta: Record<string, unknown> & { sourceFile: string; sizeBytes: number }
  sample: Record<string, unknown>
  derived: Record<string, unknown>
}

const ACTION_PATTERNS: Array<{ re: RegExp; signal: ChatActionItem["signal"] }> = [
  // Action items / commitments — someone is taking a thing on.
  { re: /\b(i'?ll|i will|i'?m going to|i'?m gonna|let me|i can|i'?ll take)\b.+?\b(by|before|tomorrow|today|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|cob|next week)\b/i, signal: "action" },
  { re: /\b(action item|todo|to-do|follow up|follow-up|owner:|@here please|@channel please)/i, signal: "action" },
  { re: /\b(can you|could you|please)\b.+\?/i, signal: "action" },
  // Decisions — agreement / direction set.
  { re: /\b(let'?s|we'?ll|we will|going with|decided|agreed|going to ship|ship it|approved|signed off|sign off|merge it)\b/i, signal: "decision" },
  // Open questions / asks at the message-level (only those that look like real asks, not rhetorical).
  { re: /\?$/, signal: "question" },
]

export function buildChatStats(messages: ChatMsg[], extraMeta: ChatStatsMeta): ChatStatsResult {
  const senders = aggregateSenders(messages)
  const messagesPerSender = Object.fromEntries(senders.map(s => [s.sender, s.count]))
  const dateRange = messages.length
    ? `${messages[0].date} → ${messages[messages.length - 1].date}`
    : "(empty)"
  const heatmap = buildHeatmap(messages)
  const volumeByDay = buildVolumeByDay(messages)
  const reactionCount = messages.reduce((n, m) => n + (m.reactionCount || 0), 0)
  const mediaCount = messages.filter(m => m.isMedia).length
  const threads = buildThreads(messages)
  const actionable = extractActionable(messages)
  const topReactions = topReactionsList(messages, 8)

  const meta = {
    ...extraMeta,
    messageCount: messages.length,
    senderCount: senders.length,
    senders: senders.map(s => s.sender),
    messagesPerSender,
    dateRange,
    reactionCount,
    threadCount: threads.length,
    mediaCount,
    activeDays: volumeByDay.length,
    topSenders: senders.slice(0, 8),
    topReactions,
  }

  // Sample: first 8 + last 4 messages, plus the "interesting" pins so the
  // LLM can write the headline cards without re-deriving them.
  const sample: Record<string, unknown> = {
    ...meta,
    first: messages.slice(0, 8),
    last: messages.slice(-4),
    longestThread: threads.slice().sort((a, b) => b.messageCount - a.messageCount)[0] || null,
    actionable: actionable.slice(0, 12),
    heatmapPreview: heatmap.slice(0, 20),
    volumePreview: volumeByDay.slice(-14),
  }

  const derived = {
    senders: senders,
    messagesPerSender,
    dateRange,
    messageCount: messages.length,
    senderCount: senders.length,
    reactionCount,
    threadCount: threads.length,
    mediaCount,
    heatmap,
    volumeByDay,
    threads,
    actionable,
    topReactions,
  }

  return { meta, sample, derived }
}

function aggregateSenders(messages: ChatMsg[]): ChatSenderStat[] {
  const map = new Map<string, ChatSenderStat>()
  for (const m of messages) {
    const cur = map.get(m.sender) || { sender: m.sender, count: 0, firstTs: m.ts, lastTs: m.ts }
    cur.count++
    if (m.ts < cur.firstTs) cur.firstTs = m.ts
    if (m.ts > cur.lastTs) cur.lastTs = m.ts
    map.set(m.sender, cur)
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count)
}

function buildHeatmap(messages: ChatMsg[]): ChatHeatCell[] {
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
  for (const m of messages) {
    if (!isFinite(m.tsEpoch)) continue
    const d = new Date(m.tsEpoch)
    grid[d.getUTCDay()][d.getUTCHours()]++
  }
  const out: ChatHeatCell[] = []
  for (let dow = 0; dow < 7; dow++) {
    for (let h = 0; h < 24; h++) {
      const count = grid[dow][h]
      if (count > 0) out.push({ dow, hour: h, count })
    }
  }
  return out
}

function buildVolumeByDay(messages: ChatMsg[]): ChatVolumeBucket[] {
  const map = new Map<string, number>()
  for (const m of messages) map.set(m.date, (map.get(m.date) || 0) + 1)
  return Array.from(map.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function buildThreads(messages: ChatMsg[]): ChatThreadStat[] {
  const byThread = new Map<string, ChatMsg[]>()
  for (const m of messages) {
    const key = m.threadId
    if (!key) continue
    const arr = byThread.get(key) || []
    arr.push(m)
    byThread.set(key, arr)
  }
  // Also include the parent-anchor message if it exists (parent shares ts==threadId on Slack).
  const out: ChatThreadStat[] = []
  for (const [threadId, msgs] of byThread.entries()) {
    msgs.sort((a, b) => a.tsEpoch - b.tsEpoch)
    const parent = messages.find(m => m.id !== msgs[0]?.id && (m as { threadId?: string; ts?: string }).ts && (m.threadId === threadId || (m.tsEpoch + "" === threadId)))
    const all = parent ? [parent, ...msgs] : msgs
    const participants = Array.from(new Set(all.map(m => m.sender)))
    const reactionCount = all.reduce((n, m) => n + (m.reactionCount || 0), 0)
    out.push({
      id: threadId,
      parentId: parent?.id,
      parentSender: parent?.sender,
      parentText: parent?.text?.slice(0, 200),
      participants,
      messageCount: all.length,
      firstTs: all[0].ts,
      lastTs: all[all.length - 1].ts,
      reactionCount,
    })
  }
  return out.sort((a, b) => b.messageCount - a.messageCount)
}

function extractActionable(messages: ChatMsg[]): ChatActionItem[] {
  const out: ChatActionItem[] = []
  for (const m of messages) {
    if (!m.text) continue
    const trimmed = m.text.trim()
    if (trimmed.length < 6 || trimmed.length > 280) continue
    for (const { re, signal } of ACTION_PATTERNS) {
      if (re.test(trimmed)) {
        out.push({ id: m.id, ts: m.ts, sender: m.sender, text: trimmed, signal })
        break
      }
    }
  }
  return out
}

function topReactionsList(messages: ChatMsg[], n: number): Array<{ name: string; count: number }> {
  const map = new Map<string, number>()
  for (const m of messages) {
    if (!m.reactions) continue
    for (const r of m.reactions) map.set(r.name, (map.get(r.name) || 0) + (r.count || 0))
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
}
