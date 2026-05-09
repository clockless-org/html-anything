/**
 * Telegram Desktop export (`result.json`) → unified chat shape.
 *
 * Top-level shape:
 *   { name: "Customer Care",
 *     type: "personal_chat" | "private_group" | "private_channel" | "saved_messages",
 *     id: 123456789,
 *     messages: [
 *       { id, type: "message" | "service",
 *         date: "2026-04-12T10:14:33", date_unixtime: "1712923473",
 *         from: "Mira Park", from_id: "user12345",
 *         text: "..." | [ { type: "plain"|"link"|..., text } | string, ... ],
 *         reply_to_message_id?, forwarded_from?,
 *         photo?, file?, media_type?, sticker_emoji? }
 *     ] }
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Parser, ParsedFile } from "../types.js"
import { buildChatStats, type ChatMsg } from "./chat-shared.js"

interface TgMessage {
  id?: number | string
  type?: string
  date?: string
  date_unixtime?: string
  from?: string
  from_id?: string
  actor?: string
  text?: unknown
  reply_to_message_id?: number | string
  forwarded_from?: string
  photo?: string
  file?: string
  media_type?: string
  sticker_emoji?: string
}

interface TgRoot {
  name?: string
  type?: string
  id?: number | string
  messages?: TgMessage[]
}

export const parser: Parser = {
  name: "telegram",
  matches: [".json"],
  async detect(filepath: string): Promise<boolean> {
    try {
      const raw = await fs.readFile(filepath, "utf8")
      const obj = JSON.parse(raw) as TgRoot
      if (!obj || typeof obj !== "object") return false
      if (!Array.isArray(obj.messages)) return false
      if (typeof obj.type !== "string") return false
      if (!/^(personal_chat|private_group|private_supergroup|public_supergroup|private_channel|public_channel|saved_messages|bot_chat)$/.test(obj.type)) return false
      const m = obj.messages.find(x => x && x.type === "message")
      if (!m) return false
      return typeof m.date === "string" && (typeof m.from === "string" || typeof m.from_id === "string")
    } catch { return false }
  },
  async parse(filepath: string): Promise<ParsedFile> {
    const raw = await fs.readFile(filepath, "utf8")
    const obj = JSON.parse(raw) as TgRoot
    const channel = obj.name || path.basename(filepath, ".json")
    const chatType = obj.type || "telegram"

    const messages: ChatMsg[] = []
    const msgs = obj.messages || []
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i]
      if (!m) continue
      if (m.type !== "message") continue
      const tsEpoch = m.date_unixtime ? parseInt(m.date_unixtime, 10) * 1000 : (m.date ? Date.parse(m.date) : NaN)
      if (!isFinite(tsEpoch)) continue
      const d = new Date(tsEpoch)
      const date = d.toISOString().slice(0, 10)
      const time = d.toISOString().slice(11, 19)
      const text = flattenTgText(m.text).trim()
      const isMedia = !!(m.photo || m.file || m.media_type || m.sticker_emoji)
      const sender = m.from || m.actor || (m.from_id ? String(m.from_id) : "unknown")
      messages.push({
        id: `m_${String(i + 1).padStart(4, "0")}`,
        ts: `${date} ${time}`,
        date, time, tsEpoch,
        sender,
        text: text || (m.sticker_emoji ? m.sticker_emoji : (m.media_type ? `[${m.media_type}]` : "")),
        channel,
        replyToId: m.reply_to_message_id != null ? `m_tg_${m.reply_to_message_id}` : undefined,
        forwardedFrom: m.forwarded_from || undefined,
        isMedia: isMedia || undefined,
        attachmentCount: isMedia ? 1 : undefined,
      })
    }

    messages.sort((a, b) => a.tsEpoch - b.tsEpoch)
    messages.forEach((m, i) => { m.id = `m_${String(i + 1).padStart(4, "0")}` })

    const stats = buildChatStats(messages, {
      sourceFile: path.basename(filepath),
      sizeBytes: Buffer.byteLength(raw, "utf8"),
      platform: "telegram",
      channel,
      chatType,
    })

    return {
      contentType: "telegram-chat",
      summary: `Telegram ${chatType} export (${channel}): ${messages.length} messages from ${stats.meta.senderCount} sender${stats.meta.senderCount === 1 ? "" : "s"}, ${stats.meta.dateRange}.`,
      sample: stats.sample,
      data: { messages, ...stats.derived, platform: "telegram", channel, chatType },
      meta: stats.meta,
    }
  },
}

function flattenTgText(text: unknown): string {
  if (typeof text === "string") return text
  if (Array.isArray(text)) {
    return text.map(part => {
      if (typeof part === "string") return part
      if (part && typeof part === "object") {
        const p = part as { type?: string; text?: string; href?: string }
        if (p.type === "link" && p.href) return `${p.text || p.href}`
        return p.text || ""
      }
      return ""
    }).join("")
  }
  return ""
}
