/**
 * Slack channel export → unified chat shape.
 *
 * Slack's "Export workspace data" download produces one folder per
 * channel containing dated JSON files (`2026-01-04.json`), each holding
 * an array of message objects. People also frequently feed us a single
 * stitched-together `<channel>.json` array that is the concatenation of
 * those daily files. We support both: any `.json` whose top level is an
 * array of Slack-shaped messages.
 *
 * Slack message shape (relevant fields):
 *   { ts: "1736012345.123456",     // unix epoch seconds, string
 *     user: "U01ABC",
 *     user_profile: { real_name, display_name, name },
 *     text: "...",
 *     subtype: "channel_join" | "thread_broadcast" | ...,
 *     thread_ts: "1736012000.000100",   // threading parent
 *     reactions: [{ name, count, users: [...] }],
 *     reply_count: 3 }
 *
 * The parser emits a unified chat schema (see `_chat.md`) so the LLM
 * can reuse the same heatmap / leaderboard / drill-down design across
 * Slack, Discord, Telegram, and iMessage outputs.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Parser, ParsedFile } from "../types.js"
import { buildChatStats, type ChatMsg } from "./chat-shared.js"

interface SlackMsgRaw {
  ts?: string
  user?: string
  bot_id?: string
  username?: string
  user_profile?: { real_name?: string; display_name?: string; name?: string }
  text?: string
  subtype?: string
  thread_ts?: string
  parent_user_id?: string
  reply_count?: number
  reactions?: Array<{ name: string; count: number }>
  files?: Array<{ name?: string; mimetype?: string }>
  attachments?: unknown[]
}

export const parser: Parser = {
  name: "slack",
  matches: [".json"],
  async detect(filepath: string): Promise<boolean> {
    try {
      const raw = await fs.readFile(filepath, "utf8")
      const parsed = JSON.parse(raw)
      const arr = pickMessageArray(parsed)
      if (!arr || arr.length === 0) return false
      // Look for Slack's distinctive ts format: "1736012345.123456".
      let hits = 0
      for (const m of arr.slice(0, 12)) {
        if (looksLikeSlackMessage(m)) hits++
      }
      return hits >= Math.min(2, arr.length)
    } catch {
      return false
    }
  },
  async parse(filepath: string): Promise<ParsedFile> {
    const raw = await fs.readFile(filepath, "utf8")
    const parsed = JSON.parse(raw)
    const arr = pickMessageArray(parsed) || []
    const channel = pickChannelName(parsed) || path.basename(filepath, ".json")

    const messages: ChatMsg[] = []
    for (let i = 0; i < arr.length; i++) {
      const m = arr[i] as SlackMsgRaw
      if (!m || typeof m !== "object") continue
      if (m.subtype && /channel_(join|leave|topic|purpose|name)|bot_message/.test(m.subtype) && !m.text) continue

      const tsEpoch = m.ts ? parseFloat(m.ts) * 1000 : NaN
      if (!isFinite(tsEpoch)) continue
      const d = new Date(tsEpoch)
      const date = d.toISOString().slice(0, 10)
      const time = d.toISOString().slice(11, 19)
      const sender = pickSender(m)
      const reactionTotal = (m.reactions || []).reduce((n, r) => n + (r.count || 0), 0)

      messages.push({
        id: `m_${String(i + 1).padStart(4, "0")}`,
        ts: `${date} ${time}`,
        date, time, tsEpoch,
        sender,
        text: cleanSlackText(m.text || ""),
        channel,
        threadId: m.thread_ts && m.thread_ts !== m.ts ? m.thread_ts : undefined,
        isThreadReply: !!(m.thread_ts && m.thread_ts !== m.ts),
        replyCount: m.reply_count,
        reactions: m.reactions ? m.reactions.map(r => ({ name: r.name, count: r.count })) : undefined,
        reactionCount: reactionTotal || undefined,
        attachmentCount: ((m.files || []).length + (m.attachments || []).length) || undefined,
        isMedia: (m.files && m.files.length > 0) || undefined,
      })
    }
    messages.sort((a, b) => a.tsEpoch - b.tsEpoch)
    messages.forEach((m, i) => { m.id = `m_${String(i + 1).padStart(4, "0")}` })

    const stats = buildChatStats(messages, {
      sourceFile: path.basename(filepath),
      sizeBytes: Buffer.byteLength(raw, "utf8"),
      platform: "slack",
      channel,
    })

    const senderCount = stats.meta.senderCount as number
    const dateRange = stats.meta.dateRange as string
    return {
      contentType: "slack-chat",
      summary: `Slack channel export (#${channel}): ${messages.length} messages from ${senderCount} sender${senderCount === 1 ? "" : "s"}, ${dateRange}.`,
      sample: stats.sample,
      data: { messages, ...stats.derived, platform: "slack", channel },
      meta: stats.meta,
    }
  },
}

function pickMessageArray(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>
    if (Array.isArray(obj.messages)) return obj.messages as unknown[]
  }
  return null
}

function pickChannelName(parsed: unknown): string | null {
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>
    const name = obj.channel || obj.channel_name || obj.name
    if (typeof name === "string") return name.replace(/^#/, "")
  }
  return null
}

function looksLikeSlackMessage(m: unknown): boolean {
  if (!m || typeof m !== "object") return false
  const obj = m as Record<string, unknown>
  if (typeof obj.ts !== "string") return false
  if (!/^\d{10}\.\d{1,7}$/.test(obj.ts)) return false
  // Slack messages always have either a user, bot_id, or username.
  return typeof obj.user === "string" || typeof obj.bot_id === "string" || typeof obj.username === "string" || !!obj.user_profile
}

function pickSender(m: SlackMsgRaw): string {
  const profile = m.user_profile
  if (profile) return profile.real_name || profile.display_name || profile.name || m.user || "unknown"
  if (m.username) return m.username
  if (m.user) return m.user
  if (m.bot_id) return `bot:${m.bot_id}`
  return "unknown"
}

function cleanSlackText(s: string): string {
  // Resolve common Slack mention forms into something readable. We don't
  // have the user/channel maps here, so this is a soft cleanup; the LLM
  // sees the raw token if we couldn't resolve it.
  return s
    .replace(/<@U[A-Z0-9]+\|([^>]+)>/g, "@$1")
    .replace(/<#C[A-Z0-9]+\|([^>]+)>/g, "#$1")
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, "$2 ($1)")
    .replace(/<(https?:[^>]+)>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
}
