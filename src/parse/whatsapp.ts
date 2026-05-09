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
import { buildChatStats, type ChatMsg } from "./chat-shared.js"
import { buildRelationshipChatInsights } from "./wechat.js"

const MSG_RE = /^\[(\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\]\s+([^:]+):\s*(.*)$/

interface Msg extends ChatMsg {}

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
    let parsedMessages: Array<Omit<Msg, "id" | "tsEpoch">> = []
    let curr: Omit<Msg, "id" | "tsEpoch"> | null = null
    for (const line of raw.replace(/\r\n/g, "\n").split("\n")) {
      const m = MSG_RE.exec(line)
      if (m) {
        if (curr) parsedMessages.push(curr)
        const parsedTs = parseWhatsAppTs(m[1], m[2])
        curr = {
          ts: parsedTs.ts,
          date: parsedTs.date,
          time: parsedTs.time,
          sender: m[3].trim(),
          text: m[4] || "",
          isMedia: /<Media omitted>|<image omitted>|<sticker omitted>/i.test(m[4] || ""),
        }
      } else if (curr) {
        curr.text += "\n" + line
      }
    }
    if (curr) parsedMessages.push(curr)

    const messages: Msg[] = parsedMessages
      .map((m, i) => ({
        ...m,
        id: `m_${String(i + 1).padStart(6, "0")}`,
        tsEpoch: parseEpoch(m.ts),
      }))
      .filter(m => isFinite(m.tsEpoch))
      .sort((a, b) => a.tsEpoch - b.tsEpoch)
    messages.forEach((m, i) => { m.id = `m_${String(i + 1).padStart(6, "0")}` })

    const stats = buildChatStats(messages, {
      sourceFile: path.basename(filepath),
      sizeBytes: Buffer.byteLength(raw, "utf8"),
      platform: "whatsapp",
    })
    const insights = buildRelationshipChatInsights(messages)
    const meta: Record<string, unknown> & { sourceFile: string; sizeBytes: number } = {
      ...stats.meta,
      activeDayRatio: insights.activeDayRatio,
      busiestDay: insights.busiestDay,
      longestGapHours: insights.longestGapHours,
      relationshipKeywordCount: insights.relationshipKeywords.reduce((n, w) => n + w.count, 0),
    }
    const senderNames = Array.isArray(meta.senders) ? (meta.senders as string[]) : []

    return {
      contentType: "whatsapp-chat",
      summary: `WhatsApp chat export, ${messages.length} messages between ${senderNames.length} sender${senderNames.length === 1 ? "" : "s"} (${senderNames.join(", ")}), ${meta.dateRange}.`,
      sample: {
        ...stats.sample,
        ...meta,
        calendarPreview: insights.calendarHeatmap.slice(-45),
        hourlyDistribution: insights.hourlyDistribution,
        monthlyStats: insights.monthlyStats.slice(-18),
        topWords: insights.topWords.slice(0, 30),
        wordSpecificity: Object.fromEntries(Object.entries(insights.wordSpecificity).map(([k, v]) => [k, v.slice(0, 20)])),
        contributionWords: insights.contributionWords.slice(0, 30),
        sentimentTimeline: insights.sentimentTimeline.slice(-18),
        relationshipKeywords: insights.relationshipKeywords.slice(0, 20),
        replyStatsBySender: insights.replyStatsBySender,
        initiationsBySender: insights.initiationsBySender,
      },
      data: {
        messages,
        ...stats.derived,
        platform: "whatsapp",
        ...insights,
      },
      meta,
    }
  },
}

function parseWhatsAppTs(dateRaw: string, timeRaw: string): { ts: string; date: string; time: string } {
  const parts = dateRaw.split(/[/.:-]/).map(n => parseInt(n, 10))
  let year: number
  let month: number
  let day: number
  if (String(parts[0]).length === 4 || parts[0] > 31) {
    year = parts[0]
    month = parts[1]
    day = parts[2]
  } else {
    // WhatsApp's slash export is locale-dependent; MM/DD/YY is the most
    // common English export shape. Ambiguous dates still sort consistently.
    month = parts[0]
    day = parts[1]
    year = parts[2] < 100 ? 2000 + parts[2] : parts[2]
  }
  const timeMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/i.exec(timeRaw.trim())
  let hour = timeMatch ? parseInt(timeMatch[1], 10) : 0
  const minute = timeMatch ? parseInt(timeMatch[2], 10) : 0
  const second = timeMatch?.[3] ? parseInt(timeMatch[3], 10) : 0
  const ampm = timeMatch?.[4]?.toUpperCase()
  if (ampm === "PM" && hour < 12) hour += 12
  if (ampm === "AM" && hour === 12) hour = 0
  const d = new Date(year, month - 1, day, hour, minute, second)
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  return { ts: `${date} ${time}`, date, time }
}

function parseEpoch(ts: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(ts)
  if (!m) return NaN
  return new Date(
    parseInt(m[1], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[3], 10),
    parseInt(m[4], 10),
    parseInt(m[5], 10),
    parseInt(m[6], 10),
  ).getTime()
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}
