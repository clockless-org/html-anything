/**
 * Parse a WhatsApp `_chat.txt` export into structured messages.
 *
 *   [2026-01-04, 09:12:07] Alex Chen: hey are we still on for sat
 *
 * → { ts, sender, text, isMedia? }
 *
 * Locale variations: matches both `[YYYY-MM-DD, HH:MM:SS]` and
 * `[M/D/YY, HH:MM AM/PM]` style prefixes. Multi-line messages are
 * concatenated to the previous record. The format is intentionally loose;
 * we only need enough structure for the LLM to design a good UI.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Parser, ParsedFile } from "../types.js"

const MSG_RE = /^\[(\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\]\s+([^:]+):\s*(.*)$/

interface Msg { ts: string; date: string; time: string; sender: string; text: string; isMedia?: boolean }

export const parser: Parser = {
  name: "whatsapp",
  matches: [".txt"],
  async detect(filepath: string): Promise<boolean> {
    try {
      const fd = await fs.open(filepath, "r")
      const buf = Buffer.alloc(2048)
      const { bytesRead } = await fd.read(buf, 0, buf.length, 0)
      await fd.close()
      const sample = buf.subarray(0, bytesRead).toString("utf8")
      let hits = 0
      for (const line of sample.split("\n")) {
        if (MSG_RE.test(line)) { if (++hits >= 2) return true }
      }
      return false
    } catch {
      return false
    }
  },
  async parse(filepath: string): Promise<ParsedFile> {
    const raw = await fs.readFile(filepath, "utf8")
    const messages: Msg[] = []
    let curr: Msg | null = null
    for (const line of raw.replace(/\r\n/g, "\n").split("\n")) {
      const m = MSG_RE.exec(line)
      if (m) {
        if (curr) messages.push(curr)
        curr = {
          ts: `${m[1]} ${m[2]}`,
          date: m[1],
          time: m[2],
          sender: m[3].trim(),
          text: m[4] || "",
          isMedia: /<Media omitted>|<image omitted>|<sticker omitted>/i.test(m[4] || ""),
        }
      } else if (curr) {
        curr.text += "\n" + line
      }
    }
    if (curr) messages.push(curr)

    const senders = Array.from(new Set(messages.map(m => m.sender)))
    const messagesPerSender: Record<string, number> = {}
    for (const m of messages) messagesPerSender[m.sender] = (messagesPerSender[m.sender] || 0) + 1
    const dateRange = messages.length
      ? `${messages[0].date} → ${messages[messages.length - 1].date}`
      : "(empty)"

    const stats = {
      sourceFile: path.basename(filepath),
      sizeBytes: Buffer.byteLength(raw, "utf8"),
      messageCount: messages.length,
      senderCount: senders.length,
      senders,
      messagesPerSender,
      dateRange,
      mediaCount: messages.filter(m => m.isMedia).length,
    }

    // Sample for the LLM: first 8 + last 4. Keeps prompt tight while showing
    // both opening tone and recent voice.
    const sample = {
      ...stats,
      first: messages.slice(0, 8),
      last: messages.slice(-4),
    }

    return {
      contentType: "whatsapp-chat",
      summary: `WhatsApp chat export, ${messages.length} messages between ${senders.length} sender${senders.length === 1 ? "" : "s"} (${senders.join(", ")}), ${dateRange}.`,
      sample,
      data: { messages, ...stats },
      meta: stats,
    }
  },
}
