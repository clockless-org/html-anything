/**
 * iMessage / generic-chat CSV → unified chat shape.
 *
 * Apple does not ship a first-party iMessage exporter, so the shapes
 * vary. We accept any CSV whose header includes a recognizable
 * iMessage / multi-sender-chat trio: one of {Date, Timestamp}, one of
 * {Sender, From, Author, Name, IsFromMe}, and one of {Message, Body,
 * Text, Content}. Common producers we cover:
 *
 *   - iMazing / iExplorer: Date, Sender, Message, Service, Status
 *   - imessage_export.py CSV: Timestamp, Sender, Message, IsFromMe
 *   - ad-hoc Date/Sender/Message exports from Shortcuts or scripts
 *
 * If detection fires but the shape isn't recognizably iMessage (e.g. a
 * Slack `messages.csv` produced by a third-party tool), we still emit
 * `multi-sender-chat` so the LLM can fall back to the generic chat
 * prompt rather than the iMessage-specific one.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Parser, ParsedFile } from "../types.js"
import { buildChatStats, type ChatMsg } from "./chat-shared.js"

const DATE_KEYS = ["date", "timestamp", "time", "sent", "datetime"]
const SENDER_KEYS = ["sender", "from", "author", "name", "user", "handle", "display name"]
const TEXT_KEYS = ["message", "body", "text", "content"]
const ISFROMME_KEYS = ["isfromme", "is_from_me", "fromme"]
const SERVICE_KEYS = ["service", "platform"]

export const parser: Parser = {
  name: "imessage",
  matches: [".csv"],
  async detect(filepath: string): Promise<boolean> {
    try {
      const fd = await fs.open(filepath, "r")
      const buf = Buffer.alloc(2048)
      const { bytesRead } = await fd.read(buf, 0, buf.length, 0)
      await fd.close()
      const head = buf.subarray(0, bytesRead).toString("utf8")
      const headerLine = head.split(/\r?\n/, 1)[0] || ""
      const cells = parseCsvHeader(headerLine).map(c => c.toLowerCase().trim())
      if (cells.length < 3) return false
      const hasDate = cells.some(c => DATE_KEYS.includes(c))
      const hasSender = cells.some(c => SENDER_KEYS.includes(c)) || cells.some(c => ISFROMME_KEYS.includes(c))
      const hasText = cells.some(c => TEXT_KEYS.includes(c))
      // The DiscordChatExporter CSV would also satisfy the trio above,
      // so we explicitly bail on it here — Discord parser handles it.
      if (cells.includes("authorid") && cells.includes("author") && cells.includes("date") && cells.includes("content")) return false
      return hasDate && hasSender && hasText
    } catch { return false }
  },
  async parse(filepath: string): Promise<ParsedFile> {
    const raw = await fs.readFile(filepath, "utf8")
    const rows = parseCsv(raw)
    const header = (rows.shift() || []).map(s => s.trim())
    const lower = header.map(h => h.toLowerCase())
    const find = (keys: string[]) => lower.findIndex(c => keys.includes(c))
    const iDate = find(DATE_KEYS)
    const iSender = find(SENDER_KEYS)
    const iText = find(TEXT_KEYS)
    const iFromMe = find(ISFROMME_KEYS)
    const iService = find(SERVICE_KEYS)

    const messages: ChatMsg[] = []
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (!r || !r[iDate]) continue
      const tsEpoch = parseFlexibleDate(r[iDate])
      if (!isFinite(tsEpoch)) continue
      const d = new Date(tsEpoch)
      const date = d.toISOString().slice(0, 10)
      const time = d.toISOString().slice(11, 19)
      const isFromMeRaw = iFromMe >= 0 ? (r[iFromMe] || "").toLowerCase() : ""
      const isFromMe = /^(1|true|yes|y)$/.test(isFromMeRaw)
      const senderCell = iSender >= 0 ? (r[iSender] || "") : ""
      const sender = senderCell || (isFromMe ? "Me" : "Other")
      const service = iService >= 0 ? (r[iService] || "") : ""
      messages.push({
        id: `m_${String(i + 1).padStart(4, "0")}`,
        ts: `${date} ${time}`,
        date, time, tsEpoch,
        sender,
        text: iText >= 0 ? (r[iText] || "") : "",
        channel: undefined,
        isFromMe: iFromMe >= 0 ? isFromMe : undefined,
        isMedia: /image|video|attachment|audio/i.test(service) || undefined,
      })
    }

    messages.sort((a, b) => a.tsEpoch - b.tsEpoch)
    messages.forEach((m, i) => { m.id = `m_${String(i + 1).padStart(4, "0")}` })

    const headerSignature = lower.join(" ")
    // If header explicitly mentions iMessage / iMazing / Apple, we tag as iMessage; else generic.
    const looksLikeImessage = /imessage|isfromme|service/.test(headerSignature) ||
      messages.some(m => m.isFromMe !== undefined)
    const platform = looksLikeImessage ? "imessage" : "multi-sender-chat"
    const contentType = looksLikeImessage ? "imessage-chat" : "multi-sender-chat"

    const stats = buildChatStats(messages, {
      sourceFile: path.basename(filepath),
      sizeBytes: Buffer.byteLength(raw, "utf8"),
      platform,
    })

    return {
      contentType,
      summary: `${looksLikeImessage ? "iMessage-style CSV" : "Multi-sender chat CSV"} (${path.basename(filepath)}): ${messages.length} messages from ${stats.meta.senderCount} sender${stats.meta.senderCount === 1 ? "" : "s"}, ${stats.meta.dateRange}.`,
      sample: stats.sample,
      data: { messages, ...stats.derived, platform },
      meta: stats.meta,
    }
  },
}

function parseFlexibleDate(s: string): number {
  const trimmed = s.trim()
  if (/^\d{10,13}$/.test(trimmed)) {
    const n = parseInt(trimmed, 10)
    return trimmed.length === 13 ? n : n * 1000
  }
  const d = Date.parse(trimmed)
  return isFinite(d) ? d : NaN
}

function parseCsvHeader(line: string): string[] {
  return parseCsv(line + "\n")[0] || []
}

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
