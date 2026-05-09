/**
 * Discord export → unified chat shape.
 *
 * Two common export shapes from `DiscordChatExporter`:
 *
 *   1. JSON. Top-level object:
 *      { guild: { id, name }, channel: { id, name, type, ... },
 *        messages: [
 *          { id, type, timestamp, timestampEdited, author: { name, nickname, isBot },
 *            content, attachments: [...], reactions: [...], mentions: [...],
 *            reference: { messageId } }
 *        ] }
 *
 *   2. CSV. First line is the literal header:
 *      "AuthorID","Author","Date","Content","Attachments","Reactions"
 *
 * Both fan into the shared `ChatMsg` shape.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Parser, ParsedFile } from "../types.js"
import { buildChatStats, type ChatMsg } from "./chat-shared.js"

interface DceJsonMessage {
  id?: string
  type?: string
  timestamp?: string
  author?: { name?: string; nickname?: string; isBot?: boolean }
  content?: string
  attachments?: Array<{ fileName?: string; id?: string }>
  reactions?: Array<{ emoji?: { name?: string }; count?: number }>
  mentions?: Array<{ name?: string; nickname?: string }>
  reference?: { messageId?: string | null }
}

interface DceJsonRoot {
  guild?: { name?: string }
  channel?: { name?: string; type?: string }
  messages?: DceJsonMessage[]
}

const DCE_CSV_HEADER = /AuthorID.+Author.+Date.+Content/i

export const parser: Parser = {
  name: "discord",
  matches: [".json", ".csv"],
  async detect(filepath: string): Promise<boolean> {
    const ext = path.extname(filepath).toLowerCase()
    if (ext === ".csv") {
      try {
        const fd = await fs.open(filepath, "r")
        const buf = Buffer.alloc(1024)
        const { bytesRead } = await fd.read(buf, 0, buf.length, 0)
        await fd.close()
        const head = buf.subarray(0, bytesRead).toString("utf8").split(/\r?\n/)[0]
        return DCE_CSV_HEADER.test(head)
      } catch { return false }
    }
    if (ext === ".json") {
      try {
        const raw = await fs.readFile(filepath, "utf8")
        const obj = JSON.parse(raw) as DceJsonRoot
        if (!obj || typeof obj !== "object") return false
        if (!Array.isArray(obj.messages)) return false
        const m = obj.messages[0]
        if (!m || typeof m !== "object") return false
        // DCE messages always have ISO timestamp + author object.
        return typeof m.timestamp === "string" && !!m.author && typeof m.author === "object"
      } catch { return false }
    }
    return false
  },
  async parse(filepath: string): Promise<ParsedFile> {
    const ext = path.extname(filepath).toLowerCase()
    const raw = await fs.readFile(filepath, "utf8")
    const messages: ChatMsg[] = []
    let channel = path.basename(filepath, ext)
    let guild: string | undefined

    if (ext === ".json") {
      const obj = JSON.parse(raw) as DceJsonRoot
      channel = obj.channel?.name || channel
      guild = obj.guild?.name
      const msgs = obj.messages || []
      for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i]
        if (!m || !m.timestamp || !m.author) continue
        if (m.type && /(ChannelPinnedMessage|RecipientAdd|RecipientRemove|ChannelNameChange|ThreadCreated)/.test(m.type)) {
          if (!m.content) continue
        }
        const tsEpoch = Date.parse(m.timestamp)
        if (!isFinite(tsEpoch)) continue
        const d = new Date(tsEpoch)
        const date = d.toISOString().slice(0, 10)
        const time = d.toISOString().slice(11, 19)
        const reactions = (m.reactions || []).map(r => ({ name: r.emoji?.name || "?", count: r.count || 0 }))
        const reactionTotal = reactions.reduce((n, r) => n + r.count, 0)
        messages.push({
          id: `m_${String(i + 1).padStart(4, "0")}`,
          ts: `${date} ${time}`,
          date, time, tsEpoch,
          sender: m.author.nickname || m.author.name || "unknown",
          text: m.content || "",
          channel,
          replyToId: m.reference?.messageId || undefined,
          reactions: reactions.length ? reactions : undefined,
          reactionCount: reactionTotal || undefined,
          mentionCount: (m.mentions || []).length || undefined,
          attachmentCount: (m.attachments || []).length || undefined,
          isMedia: (m.attachments || []).length > 0 || undefined,
        })
      }
    } else {
      // CSV
      const rows = parseCsv(raw)
      const header = rows.shift() || []
      const idx = (col: string) => header.findIndex(h => h.toLowerCase() === col.toLowerCase())
      const iId = idx("AuthorID")
      const iAuthor = idx("Author")
      const iDate = idx("Date")
      const iContent = idx("Content")
      const iAttach = idx("Attachments")
      const iReact = idx("Reactions")
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        if (!r || !r[iDate]) continue
        const tsEpoch = Date.parse(r[iDate])
        if (!isFinite(tsEpoch)) continue
        const d = new Date(tsEpoch)
        const date = d.toISOString().slice(0, 10)
        const time = d.toISOString().slice(11, 19)
        const attachStr = iAttach >= 0 ? (r[iAttach] || "") : ""
        const reactStr = iReact >= 0 ? (r[iReact] || "") : ""
        const attachmentCount = attachStr.trim() ? attachStr.split(/\n|;|\|/).filter(Boolean).length : 0
        const reactions = parseDceReactionsCell(reactStr)
        const reactionTotal = reactions.reduce((n, x) => n + x.count, 0)
        messages.push({
          id: `m_${String(i + 1).padStart(4, "0")}`,
          ts: `${date} ${time}`,
          date, time, tsEpoch,
          sender: iAuthor >= 0 ? (r[iAuthor] || `id:${r[iId] || "?"}`) : `id:${r[iId] || "?"}`,
          text: iContent >= 0 ? (r[iContent] || "") : "",
          channel,
          reactions: reactions.length ? reactions : undefined,
          reactionCount: reactionTotal || undefined,
          attachmentCount: attachmentCount || undefined,
          isMedia: attachmentCount > 0 || undefined,
        })
      }
    }

    messages.sort((a, b) => a.tsEpoch - b.tsEpoch)
    messages.forEach((m, i) => { m.id = `m_${String(i + 1).padStart(4, "0")}` })

    const stats = buildChatStats(messages, {
      sourceFile: path.basename(filepath),
      sizeBytes: Buffer.byteLength(raw, "utf8"),
      platform: "discord",
      channel,
      guild,
    })

    return {
      contentType: "discord-chat",
      summary: `Discord export (${guild ? `${guild} · ` : ""}#${channel}): ${messages.length} messages from ${stats.meta.senderCount} sender${stats.meta.senderCount === 1 ? "" : "s"}, ${stats.meta.dateRange}.`,
      sample: stats.sample,
      data: { messages, ...stats.derived, platform: "discord", channel, guild },
      meta: stats.meta,
    }
  },
}

function parseDceReactionsCell(s: string): Array<{ name: string; count: number }> {
  if (!s) return []
  // DCE writes reactions as "👍 (3); 🎉 (1)" or sometimes "thumbsup(3),tada(1)".
  const out: Array<{ name: string; count: number }> = []
  for (const part of s.split(/[;,]/)) {
    const m = part.trim().match(/^(.+?)\s*\(\s*(\d+)\s*\)$/)
    if (m) out.push({ name: m[1].trim(), count: parseInt(m[2], 10) })
  }
  return out
}

// Minimal RFC-4180 CSV reader for the Discord cell escaping. We don't pull in
// a dep — the existing codebase does the same in src/parse/csv.ts.
function parseCsv(raw: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let cell = ""
  let inQuote = false
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (inQuote) {
      if (ch === '"') {
        if (raw[i + 1] === '"') { cell += '"'; i++ }
        else inQuote = false
      } else cell += ch
    } else {
      if (ch === '"') inQuote = true
      else if (ch === ",") { cur.push(cell); cell = "" }
      else if (ch === "\r") { /* skip */ }
      else if (ch === "\n") { cur.push(cell); rows.push(cur); cur = []; cell = "" }
      else cell += ch
    }
  }
  if (cell.length > 0 || cur.length > 0) { cur.push(cell); rows.push(cur) }
  return rows
}
