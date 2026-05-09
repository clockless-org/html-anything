/**
 * WeChat / Weixin chat export parser.
 *
 * This intentionally targets the "relationship report" use case rather
 * than a plain transcript viewer. It accepts the formats commonly produced
 * by WeChatMsg / 留痕 and similar scripts: HTML, CSV/TSV, TXT, JSON, and
 * DOCX. The output includes the normalized message log plus the precomputed
 * relationship-analysis aggregations the prompt needs for calendar heatmaps,
 * hourly activity, relative enthusiasm, word specificity, contribution
 * ratings, and rough lexical sentiment.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as mammoth from "mammoth"
import type { Parser, ParsedFile } from "../types.js"
import { buildChatStats, type ChatMsg } from "./chat-shared.js"

interface WeChatMsg extends ChatMsg {
  type?: string
  rawSender?: string
  raw?: Record<string, unknown>
}

interface ParsedTs {
  tsEpoch: number
  date: string
  time: string
  ts: string
}

interface PendingTextMsg {
  ts: ParsedTs
  sender: string
  text: string
}

const WECHAT_HINT_RE = /微信|wechat|weixin|wechatmsg|留痕|聊天记录|wxid_/i
const HTML_BOOKMARKS_RE = /NETSCAPE-Bookmark-file-1|<TITLE>\s*Bookmarks\s*<\/TITLE>/i
const MEDIA_RE = /\[?(图片|照片|视频|语音|表情|文件|位置|红包|转账|链接|拍一拍|image|photo|video|voice|sticker|file|location)\]?/i

const TIME_KEYS = [
  "time", "date", "datetime", "timestamp", "createtime", "createtimeutc",
  "strtime", "msgtime", "create_time", "createat", "createdat",
  "发送时间", "时间", "日期",
]
const SENDER_KEYS = [
  "sender", "from", "talker", "remark", "nickname", "username", "name",
  "displayname", "contact", "wxid", "发送人", "发言人", "昵称", "联系人", "好友",
]
const TEXT_KEYS = [
  "content", "text", "message", "msg", "strcontent", "msgcontent", "plain",
  "body", "消息", "内容", "正文", "文本",
]
const ISSEND_KEYS = ["issend", "is_send", "isfromme", "fromme", "self", "direction", "方向", "是否发送"]
const TYPE_KEYS = ["type", "msgtype", "typename", "type_name", "subtype", "消息类型", "类型"]
const WECHAT_SPECIFIC_KEYS = [
  "strcontent", "createtime", "msgsvrid", "issend", "talker", "roomname",
  "wxid", "msgtype", "reserved", "compresscontent",
]

const STOPWORDS = new Set([
  "the", "and", "you", "your", "yours", "me", "my", "mine", "we", "our", "ours",
  "they", "them", "their", "that", "this", "there", "here", "what", "when", "where",
  "why", "how", "for", "with", "from", "have", "has", "had", "will", "would",
  "could", "should", "just", "really", "very", "also", "then", "than", "but",
  "not", "are", "was", "were", "been", "being", "can", "cant", "don't", "dont",
  "yes", "yeah", "okay", "ok", "lol", "haha", "我", "你", "他", "她", "它", "我们", "你们", "他们", "她们",
  "这个", "那个", "就是", "然后", "因为", "所以", "但是", "还是", "不是", "没有", "可以",
  "一个", "什么", "怎么", "这么", "那么", "真的", "感觉", "现在", "今天", "明天", "昨天",
  "时候", "一下", "一样", "已经", "可能", "应该", "需要", "不用", "不能", "不要", "哈哈",
  "哈哈哈", "啊", "呀", "呢", "吧", "吗", "啦", "了", "的", "是", "在", "有", "就", "都",
  "也", "和", "还", "很", "好", "把", "被", "给", "对", "到", "去", "来", "说", "看",
])

const RELATIONSHIP_TERMS = new Set([
  "爱", "爱你", "喜欢", "想你", "想", "宝贝", "宝宝", "老婆", "老公", "亲亲", "抱抱",
  "晚安", "早安", "可爱", "想见", "见面", "约会", "吃饭", "一起", "回家", "开心",
  "love", "miss", "miss you", "babe", "baby", "darling", "honey", "goodnight",
  "good morning", "morning", "night", "cute", "date", "dinner", "kiss", "hug",
  "together", "home", "happy",
])

const POSITIVE_WORDS = [
  "爱", "爱你", "喜欢", "想你", "宝贝", "宝宝", "亲亲", "抱抱", "可爱", "开心",
  "快乐", "舒服", "期待", "好棒", "棒", "谢谢", "感动", "幸福", "晚安", "早安",
  "哈哈", "笑死", "想见", "好看", "好吃", "温柔",
  "love", "miss you", "babe", "baby", "cute", "happy", "thanks", "thank you",
  "goodnight", "good morning", "kiss", "hug", "together", "excited",
]

const NEGATIVE_WORDS = [
  "生气", "难过", "伤心", "烦", "累", "焦虑", "不开心", "讨厌", "吵架", "委屈",
  "哭", "崩溃", "压力", "失望", "难受", "不想", "别烦", "冷", "痛苦", "emo",
  "sad", "angry", "upset", "tired", "sorry", "stress", "stressed", "anxious",
  "missed", "fight", "hurt", "cry", "worried",
]

export const parser: Parser = {
  name: "wechat",
  matches: [".html", ".htm", ".csv", ".tsv", ".txt", ".json", ".docx"],
  async detect(filepath: string): Promise<boolean> {
    const ext = path.extname(filepath).toLowerCase()
    const basename = path.basename(filepath).toLowerCase()
    try {
      if (ext === ".csv" || ext === ".tsv") {
        const head = await readHead(filepath, 8192)
        return looksLikeWeChatCsv(head, basename)
      }
      if (ext === ".json") {
        const raw = await fs.readFile(filepath, "utf8")
        return looksLikeWeChatJson(raw, basename)
      }
      if (ext === ".html" || ext === ".htm") {
        const head = await readHead(filepath, 128_000)
        if (HTML_BOOKMARKS_RE.test(head)) return false
        return WECHAT_HINT_RE.test(head + " " + basename) && countTimestampHints(stripHtmlToText(head)) >= 2
      }
      if (ext === ".txt") {
        const head = await readHead(filepath, 64_000)
        return (WECHAT_HINT_RE.test(head + " " + basename) && countTimestampHints(head) >= 2) ||
          countWeChatLineHits(head) >= 3
      }
      if (ext === ".docx") {
        const text = await extractDocxText(filepath)
        return WECHAT_HINT_RE.test(text + " " + basename) && countTimestampHints(text) >= 2
      }
    } catch {
      return false
    }
    return false
  },
  async parse(filepath: string): Promise<ParsedFile> {
    const ext = path.extname(filepath).toLowerCase()
    const sourceFile = path.basename(filepath)
    const stat = await fs.stat(filepath)
    let messages: WeChatMsg[] = []
    let sourceFormat = ext.replace(/^\./, "") || "unknown"

    if (ext === ".csv" || ext === ".tsv") {
      const raw = await fs.readFile(filepath, "utf8")
      messages = parseDelimited(raw, sourceFile, ext === ".tsv" ? "\t" : undefined)
      sourceFormat = ext === ".tsv" ? "tsv" : "csv"
    } else if (ext === ".json") {
      const raw = await fs.readFile(filepath, "utf8")
      messages = parseJsonMessages(raw, sourceFile)
      sourceFormat = "json"
    } else if (ext === ".html" || ext === ".htm") {
      const raw = await fs.readFile(filepath, "utf8")
      messages = parseTextTranscript(stripHtmlToText(raw), sourceFile, "html")
      sourceFormat = "html"
    } else if (ext === ".docx") {
      const text = await extractDocxText(filepath)
      messages = parseTextTranscript(text, sourceFile, "docx")
      sourceFormat = "docx"
    } else {
      const raw = await fs.readFile(filepath, "utf8")
      messages = parseTextTranscript(raw, sourceFile, "txt")
      sourceFormat = "txt"
    }

    messages = normalizeMessages(messages)
    const stats = buildChatStats(messages, {
      sourceFile,
      sizeBytes: stat.size,
      platform: "wechat",
      sourceFormat,
    })
    const insights = buildRelationshipChatInsights(messages)
    const meta: Record<string, unknown> & { sourceFile: string; sizeBytes: number } = {
      ...stats.meta,
      sourceFormat,
      activeDayRatio: insights.activeDayRatio,
      busiestDay: insights.busiestDay,
      longestGapHours: insights.longestGapHours,
      relationshipKeywordCount: insights.relationshipKeywords.reduce((n, w) => n + w.count, 0),
    }

    const senderNames = Array.isArray(meta.senders) ? (meta.senders as string[]) : []
    return {
      contentType: "wechat-chat",
      summary: `WeChat chat export (${sourceFormat}), ${messages.length} messages between ${senderNames.length} sender${senderNames.length === 1 ? "" : "s"} (${senderNames.join(", ")}), ${meta.dateRange}.`,
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
        platform: "wechat",
        sourceFormat,
        ...insights,
      },
      meta,
    }
  },
}

async function readHead(filepath: string, n: number): Promise<string> {
  const fd = await fs.open(filepath, "r")
  const buf = Buffer.alloc(n)
  const { bytesRead } = await fd.read(buf, 0, buf.length, 0)
  await fd.close()
  return buf.subarray(0, bytesRead).toString("utf8")
}

function looksLikeWeChatCsv(head: string, basename: string): boolean {
  const firstLine = head.split(/\r?\n/, 1)[0] || ""
  const cells = parseDelimitedRows(firstLine + "\n", detectSep(firstLine))[0] || []
  const normalized = cells.map(normalizeKey)
  const keySet = new Set(normalized)
  const hasWeChatSpecific = normalized.some(k => WECHAT_SPECIFIC_KEYS.includes(k)) || WECHAT_HINT_RE.test(head + " " + basename)
  const hasTime = normalized.some(k => TIME_KEYS.map(normalizeKey).includes(k))
  const hasText = normalized.some(k => TEXT_KEYS.map(normalizeKey).includes(k))
  const hasSenderOrDirection = normalized.some(k => SENDER_KEYS.map(normalizeKey).includes(k) || ISSEND_KEYS.map(normalizeKey).includes(k))
  const hasChineseChatTrio = cells.some(c => /发送人|发言人|昵称|联系人/.test(c)) &&
    cells.some(c => /内容|消息|正文|文本/.test(c)) &&
    cells.some(c => /时间|日期/.test(c))
  return (hasWeChatSpecific && hasTime && hasText) || (hasChineseChatTrio && hasSenderOrDirection)
}

function looksLikeWeChatJson(head: string, basename: string): boolean {
  if (WECHAT_HINT_RE.test(basename)) return true
  try {
    const parsed = JSON.parse(head)
    const records = findRecordArray(parsed).slice(0, 20)
    if (records.length < 2) return false
    let hits = 0
    for (const r of records) {
      const keys = Object.keys(r).map(normalizeKey)
      const hasSpecific = keys.some(k => WECHAT_SPECIFIC_KEYS.includes(k))
      const hasTime = keys.some(k => TIME_KEYS.map(normalizeKey).includes(k))
      const hasText = keys.some(k => TEXT_KEYS.map(normalizeKey).includes(k))
      if ((hasSpecific && hasText) || (hasTime && hasText && keys.some(k => ISSEND_KEYS.map(normalizeKey).includes(k)))) hits++
    }
    return hits >= 2
  } catch {
    return WECHAT_HINT_RE.test(head) && countTimestampHints(head) >= 2
  }
}

function countTimestampHints(text: string): number {
  return (text.match(/\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?\s*(?:上午|下午|晚上|凌晨|中午)?\s*\d{1,2}:\d{2}/g) || []).length
}

function countWeChatLineHits(text: string): number {
  let hits = 0
  for (const line of text.split(/\r?\n/).slice(0, 200)) {
    const parsed = parseDatePrefix(line)
    if (!parsed) continue
    if (/[\u4e00-\u9fff\w .-]{1,40}[：:]/.test(parsed.rest)) hits++
  }
  return hits
}

async function extractDocxText(filepath: string): Promise<string> {
  const buf = await fs.readFile(filepath)
  const extracted = await mammoth.extractRawText({ buffer: buf })
  return extracted.value
}

function parseDelimited(raw: string, sourceFile: string, sepOverride?: string): WeChatMsg[] {
  const sep = sepOverride || detectSep(raw)
  const rows = parseDelimitedRows(raw, sep)
  const header = rows.shift() || []
  const lower = header.map(normalizeKey)
  const timeIdx = findKey(lower, TIME_KEYS)
  const senderIdx = findKey(lower, SENDER_KEYS)
  const textIdx = findKey(lower, TEXT_KEYS)
  const isSendIdx = findKey(lower, ISSEND_KEYS)
  const typeIdx = findKey(lower, TYPE_KEYS)
  const talkerIdx = findKey(lower, ["talker", "remark", "nickname", "contact", "好友", "联系人"])

  const out: WeChatMsg[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const tsRaw = cell(row, timeIdx)
    const text = cleanText(cell(row, textIdx))
    const ts = parseDateTime(tsRaw)
    if (!ts || (!text && !cell(row, typeIdx))) continue
    const isFromMe = parseIsSend(cell(row, isSendIdx))
    const fallbackTalker = cell(row, talkerIdx)
    const sender = cleanSender(cell(row, senderIdx) || (isFromMe === true ? "我" : fallbackTalker || "对方"))
    const type = cell(row, typeIdx)
    out.push({
      id: `m_${String(i + 1).padStart(6, "0")}`,
      ...ts,
      sender,
      rawSender: cell(row, senderIdx),
      text: text || mediaPlaceholder(type),
      isFromMe,
      isMedia: MEDIA_RE.test(text || type),
      type,
      raw: Object.fromEntries(header.map((h, idx) => [h, row[idx] || ""])),
    })
  }
  return out
}

function parseJsonMessages(raw: string, sourceFile: string): WeChatMsg[] {
  const parsed = JSON.parse(raw)
  const records = findRecordArray(parsed)
  const out: WeChatMsg[] = []
  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    const get = (keys: string[]) => valueForKeys(r, keys)
    const ts = parseDateTime(String(get(TIME_KEYS) ?? ""))
    const text = cleanText(String(get(TEXT_KEYS) ?? ""))
    const type = String(get(TYPE_KEYS) ?? "")
    if (!ts || (!text && !type)) continue
    const isFromMe = parseIsSend(String(get(ISSEND_KEYS) ?? ""))
    const senderRaw = String(get(SENDER_KEYS) ?? "")
    out.push({
      id: `m_${String(i + 1).padStart(6, "0")}`,
      ...ts,
      sender: cleanSender(senderRaw || (isFromMe === true ? "我" : "对方")),
      rawSender: senderRaw,
      text: text || mediaPlaceholder(type),
      type,
      isFromMe,
      isMedia: MEDIA_RE.test(text || type),
      raw: r,
    })
  }
  return out
}

function findRecordArray(root: unknown): Record<string, unknown>[] {
  if (Array.isArray(root)) return root.filter(isRecord)
  if (!isRecord(root)) return []
  const preferred = ["messages", "msgs", "records", "data", "chat", "list", "rows"]
  for (const k of preferred) {
    const v = root[k]
    if (Array.isArray(v)) return v.filter(isRecord)
  }
  for (const v of Object.values(root)) {
    if (Array.isArray(v) && v.filter(isRecord).length >= 2) return v.filter(isRecord)
  }
  return []
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function valueForKeys(record: Record<string, unknown>, keys: string[]): unknown {
  const wanted = new Set(keys.map(normalizeKey))
  for (const [k, v] of Object.entries(record)) {
    if (wanted.has(normalizeKey(k))) return v
  }
  return undefined
}

function parseTextTranscript(raw: string, sourceFile: string, sourceFormat: string): WeChatMsg[] {
  const out: WeChatMsg[] = []
  let pending: PendingTextMsg | null = null
  const lines = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)

  const flush = () => {
    if (!pending) return
    const text = cleanText(pending.text)
    if (text || pending.sender) {
      out.push({
        id: `m_${String(out.length + 1).padStart(6, "0")}`,
        ...pending.ts,
        sender: cleanSender(pending.sender || "对方"),
        text: text || "[非文本消息]",
        isMedia: MEDIA_RE.test(text),
      })
    }
    pending = null
  }

  for (const line of lines) {
    if (/^(微信聊天记录|wechat|weixin|聊天记录|消息记录)$/i.test(line)) continue
    const parsed = parseDatePrefix(line)
    if (parsed) {
      flush()
      const split = splitSenderAndText(parsed.rest)
      pending = {
        ts: parsed.ts,
        sender: split.sender,
        text: split.text,
      }
      continue
    }
    const tsOnly = parseDateTime(line)
    if (tsOnly) {
      flush()
      pending = { ts: tsOnly, sender: "", text: "" }
      continue
    }
    if (pending && !pending.sender && isLikelySenderLine(line)) {
      pending.sender = line
      continue
    }
    if (pending) {
      pending.text += (pending.text ? "\n" : "") + line
    }
  }
  flush()
  return out
}

function parseDatePrefix(line: string): { ts: ParsedTs; rest: string } | null {
  const m = /^\s*[\[(【]?\s*((?:\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\s*(?:星期.)?\s*(?:上午|下午|晚上|凌晨|中午)?\s*\d{1,2}:\d{2}(?::\d{2})?)\s*[\])】]?\s*(.*)$/.exec(line)
  if (!m) return null
  const ts = parseDateTime(m[1])
  return ts ? { ts, rest: m[2] || "" } : null
}

function splitSenderAndText(rest: string): { sender: string; text: string } {
  const cleaned = rest.trim()
  const m = /^(.{1,48}?)[：:]\s*(.*)$/.exec(cleaned)
  if (m) return { sender: m[1].trim(), text: m[2] || "" }
  return { sender: "", text: cleaned }
}

function isLikelySenderLine(line: string): boolean {
  if (line.length > 48) return false
  if (parseDatePrefix(line) || parseDateTime(line)) return false
  return !/[。！？!?，,]/.test(line)
}

function normalizeMessages(messages: WeChatMsg[]): WeChatMsg[] {
  const normalized = messages
    .filter(m => isFinite(m.tsEpoch) && (m.text || m.sender))
    .map(m => ({
      ...m,
      sender: cleanSender(m.sender || (m.isFromMe ? "我" : "对方")),
      text: cleanText(m.text || ""),
      isMedia: m.isMedia || MEDIA_RE.test(m.text || m.type || ""),
    }))
    .sort((a, b) => a.tsEpoch - b.tsEpoch)
  normalized.forEach((m, i) => { m.id = `m_${String(i + 1).padStart(6, "0")}` })
  return normalized
}

export function buildRelationshipChatInsights(messages: ChatMsg[]) {
  const senders = Array.from(new Set(messages.map(m => m.sender)))
  const dateCounts = new Map<string, number>()
  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: 0,
    bySender: Object.fromEntries(senders.map(s => [s, 0])) as Record<string, number>,
  }))
  const monthly = new Map<string, {
    month: string
    total: number
    bySender: Record<string, number>
    activeDays: Set<string>
    sentiment: { positive: number; negative: number; score: number }
  }>()
  const senderWordCounts = new Map<string, Map<string, number>>()
  const senderTokenTotals = new Map<string, number>()
  const wordTotals = new Map<string, number>()
  const relationshipCounts = new Map<string, number>()
  const emojiCounts = new Map<string, Map<string, number>>()
  const replyGaps = new Map<string, number[]>()
  const initiations = new Map<string, number>()

  let longestGapMs = 0
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    dateCounts.set(m.date, (dateCounts.get(m.date) || 0) + 1)
    const hour = parseInt(m.time.slice(0, 2), 10)
    if (isFinite(hour) && hourly[hour]) {
      hourly[hour].count++
      hourly[hour].bySender[m.sender] = (hourly[hour].bySender[m.sender] || 0) + 1
    }
    const month = m.date.slice(0, 7)
    const monthStats = monthly.get(month) || {
      month,
      total: 0,
      bySender: Object.fromEntries(senders.map(s => [s, 0])),
      activeDays: new Set<string>(),
      sentiment: { positive: 0, negative: 0, score: 0 },
    }
    monthStats.total++
    monthStats.bySender[m.sender] = (monthStats.bySender[m.sender] || 0) + 1
    monthStats.activeDays.add(m.date)
    const sentiment = scoreSentiment(m.text)
    monthStats.sentiment.positive += sentiment.positive
    monthStats.sentiment.negative += sentiment.negative
    monthStats.sentiment.score += sentiment.score
    monthly.set(month, monthStats)

    const tokens = tokenizeText(m.text)
    const senderMap = senderWordCounts.get(m.sender) || new Map<string, number>()
    for (const token of tokens) {
      senderMap.set(token, (senderMap.get(token) || 0) + 1)
      wordTotals.set(token, (wordTotals.get(token) || 0) + 1)
      senderTokenTotals.set(m.sender, (senderTokenTotals.get(m.sender) || 0) + 1)
      if (RELATIONSHIP_TERMS.has(token)) relationshipCounts.set(token, (relationshipCounts.get(token) || 0) + 1)
    }
    senderWordCounts.set(m.sender, senderMap)

    const senderEmoji = emojiCounts.get(m.sender) || new Map<string, number>()
    for (const emoji of extractEmojis(m.text)) senderEmoji.set(emoji, (senderEmoji.get(emoji) || 0) + 1)
    emojiCounts.set(m.sender, senderEmoji)

    const prev = messages[i - 1]
    if (prev) {
      const gap = m.tsEpoch - prev.tsEpoch
      if (gap > longestGapMs) longestGapMs = gap
      if (prev.sender !== m.sender && gap > 0 && gap <= 1000 * 60 * 60 * 24 * 7) {
        const minutes = gap / 60000
        const arr = replyGaps.get(m.sender) || []
        arr.push(minutes)
        replyGaps.set(m.sender, arr)
      }
      if (gap >= 1000 * 60 * 60 * 4) initiations.set(m.sender, (initiations.get(m.sender) || 0) + 1)
    } else {
      initiations.set(m.sender, (initiations.get(m.sender) || 0) + 1)
    }
  }

  const first = messages[0]
  const last = messages[messages.length - 1]
  const totalDays = first && last
    ? Math.max(1, Math.round((last.tsEpoch - first.tsEpoch) / 86_400_000) + 1)
    : 0
  const calendarHeatmap = Array.from(dateCounts.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count, month: date.slice(0, 7), year: date.slice(0, 4), dow: new Date(`${date}T00:00:00`).getDay() }))
  const busiestDay = calendarHeatmap.slice().sort((a, b) => b.count - a.count)[0] || null
  const monthlyStats = Array.from(monthly.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(m => ({
      month: m.month,
      total: m.total,
      activeDays: m.activeDays.size,
      bySender: m.bySender,
      senders: senders.map(sender => {
        const sent = m.bySender[sender] || 0
        const received = m.total - sent
        return {
          sender,
          sent,
          received,
          share: m.total ? sent / m.total : 0,
          enthusiasmIndex: m.total ? (sent - received) / m.total : 0,
        }
      }),
      sentiment: m.sentiment,
    }))

  const topWords = topEntries(wordTotals, 120).map(([word, count]) => ({ word, count }))
  const wordSpecificity: Record<string, Array<{ word: string; count: number; specificity: number; share: number; score: number }>> = {}
  const specificitySmoothing = 12
  const vocabSize = Math.max(1, wordTotals.size)
  for (const sender of senders) {
    const own = senderWordCounts.get(sender) || new Map<string, number>()
    const ownTotal = senderTokenTotals.get(sender) || 1
    const rows: Array<{ word: string; count: number; specificity: number; share: number }> = []
    for (const [word, count] of own.entries()) {
      if (count < 2) continue
      const otherCount = senders
        .filter(s => s !== sender)
        .reduce((n, s) => n + (senderWordCounts.get(s)?.get(word) || 0), 0)
      const otherTotal = senders
        .filter(s => s !== sender)
        .reduce((n, s) => n + (senderTokenTotals.get(s) || 0), 0) || 1
      const ownRate = (count + specificitySmoothing) / (ownTotal + specificitySmoothing * vocabSize)
      const otherRate = (otherCount + specificitySmoothing) / (otherTotal + specificitySmoothing * vocabSize)
      const specificity = (ownRate - otherRate) / (ownRate + otherRate || 1)
      if (specificity <= 0) continue
      rows.push({ word, count, specificity, share: ownRate })
    }
    const ranked = rows
      .sort((a, b) => b.specificity - a.specificity || b.count - a.count)
      .slice(0, 80)
    const maxCount = Math.max(1, ...ranked.map(r => r.count))
    wordSpecificity[sender] = ranked.map((r, index) => {
      const countNorm = Math.log1p(r.count) / Math.log1p(maxCount)
      const rankNorm = ranked.length <= 1 ? 1 : 1 - index / (ranked.length - 1)
      const score = Math.max(0.12, Math.min(0.91, 0.22 + r.specificity * 0.38 + countNorm * 0.18 + rankNorm * 0.12))
      return { ...r, score: +score.toFixed(3) }
    })
  }

  const contributionWords = topEntries(wordTotals, 100).map(([word, count]) => {
    const bySender = Object.fromEntries(senders.map(s => [s, senderWordCounts.get(s)?.get(word) || 0]))
    const shares = Object.fromEntries(senders.map(s => [s, count ? (bySender[s] || 0) / count : 0]))
    const dominantSender = senders.slice().sort((a, b) => (bySender[b] || 0) - (bySender[a] || 0))[0] || ""
    return { word, count, bySender, shares, dominantSender, contributionRating: shares[dominantSender] || 0 }
  })

  const emojiStats = Object.fromEntries(Array.from(emojiCounts.entries()).map(([sender, map]) => [
    sender,
    topEntries(map, 30).map(([emoji, count]) => ({ emoji, count })),
  ]))

  const sentimentTimeline = monthlyStats.map(m => ({
    month: m.month,
    positive: m.sentiment.positive,
    negative: m.sentiment.negative,
    score: m.sentiment.score,
    normalizedScore: m.total ? m.sentiment.score / m.total : 0,
  }))

  const replyStatsBySender = Object.fromEntries(Array.from(replyGaps.entries()).map(([sender, gaps]) => [
    sender,
    summarizeNumbers(gaps),
  ]))

  return {
    calendarHeatmap,
    hourlyDistribution: hourly,
    monthlyStats,
    topWords,
    wordSpecificity,
    contributionWords,
    emojiStats,
    sentimentTimeline,
    relationshipKeywords: topEntries(relationshipCounts, 50).map(([word, count]) => ({ word, count })),
    replyStatsBySender,
    initiationsBySender: Object.fromEntries(senders.map(s => [s, initiations.get(s) || 0])),
    activeDayRatio: totalDays ? calendarHeatmap.length / totalDays : 0,
    busiestDay,
    longestGapHours: longestGapMs ? +(longestGapMs / 3_600_000).toFixed(2) : 0,
  }
}

function parseDateTime(raw: string): ParsedTs | null {
  const s = String(raw || "").trim()
  if (!s) return null
  if (/^\d{10,13}$/.test(s)) {
    const n = parseInt(s, 10)
    return formatTs(s.length === 13 ? n : n * 1000)
  }
  const normalized = s.replace(/\s+/g, " ")
  const m = /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:\s*星期.)?\s*(上午|下午|晚上|凌晨|中午)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(normalized)
  if (m) {
    let hour = parseInt(m[5], 10)
    const minute = parseInt(m[6], 10)
    const second = m[7] ? parseInt(m[7], 10) : 0
    const period = m[4] || ""
    if ((period === "下午" || period === "晚上") && hour < 12) hour += 12
    if ((period === "凌晨") && hour === 12) hour = 0
    const ts = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), hour, minute, second).getTime()
    return formatTs(ts)
  }
  const mdy = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(normalized)
  if (mdy) {
    const yearRaw = parseInt(mdy[3], 10)
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw
    const ts = new Date(year, parseInt(mdy[1], 10) - 1, parseInt(mdy[2], 10), parseInt(mdy[4], 10), parseInt(mdy[5], 10), mdy[6] ? parseInt(mdy[6], 10) : 0).getTime()
    return formatTs(ts)
  }
  const fallback = Date.parse(s)
  return isFinite(fallback) ? formatTs(fallback) : null
}

function formatTs(ms: number): ParsedTs {
  const d = new Date(ms)
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  return { tsEpoch: ms, date, time, ts: `${date} ${time}` }
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

function parseIsSend(raw: string): boolean | undefined {
  const s = String(raw || "").trim().toLowerCase()
  if (!s) return undefined
  if (/^(1|true|yes|y|me|self|sent|send|发送|我|自己|outgoing)$/.test(s)) return true
  if (/^(0|false|no|n|received|recv|接收|对方|incoming)$/.test(s)) return false
  return undefined
}

function cell(row: string[], idx: number): string {
  return idx >= 0 ? (row[idx] || "") : ""
}

function findKey(headers: string[], keys: string[]): number {
  const wanted = new Set(keys.map(normalizeKey))
  return headers.findIndex(h => wanted.has(h))
}

function normalizeKey(s: string): string {
  return String(s || "").toLowerCase().replace(/[\s_\-()（）:：]/g, "")
}

function detectSep(raw: string): string {
  const line = raw.split(/\r?\n/, 1)[0] || ""
  const counts: Record<string, number> = { ",": 0, "\t": 0, ";": 0, "|": 0 }
  for (const ch of line) if (ch in counts) counts[ch]++
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || ","
}

function parseDelimitedRows(raw: string, sep: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === sep) { row.push(field); field = "" }
      else if (ch === "\r") { /* skip */ }
      else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = "" }
      else field += ch
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

function stripHtmlToText(html: string): string {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<(br|p|div|li|tr|h[1-6]|section|article|header|footer)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
}

function decodeHtml(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
}

function cleanSender(s: string): string {
  return String(s || "")
    .replace(/^(发送人|发言人|昵称|sender|from)\s*[：:]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
}

function cleanText(s: string): string {
  return String(s || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim()
}

function mediaPlaceholder(type: string): string {
  const label = type || "非文本消息"
  return `[${label}]`
}

function tokenizeText(text: string): string[] {
  const clean = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[\d０-９]+/g, " ")
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, " ")
    .trim()
  if (!clean) return []

  const segmenter = getSegmenter()
  const out: string[] = []
  if (segmenter) {
    for (const part of segmenter.segment(clean)) {
      const token = normalizeToken(part.segment)
      if (keepToken(token)) out.push(token)
    }
  } else {
    for (const token of clean.split(/\s+/)) {
      const normalized = normalizeToken(token)
      if (keepToken(normalized)) out.push(normalized)
      if (/^[\u4e00-\u9fff]{3,}$/.test(normalized)) {
        for (let i = 0; i < normalized.length - 1; i++) {
          const bi = normalized.slice(i, i + 2)
          if (keepToken(bi)) out.push(bi)
        }
      }
    }
  }
  return out
}

function getSegmenter(): Intl.Segmenter | null {
  type SegmenterCtor = new (locale: string, options: { granularity: "word" }) => Intl.Segmenter
  const maybe = (Intl as typeof Intl & { Segmenter?: SegmenterCtor }).Segmenter
  return maybe ? new maybe("zh", { granularity: "word" }) : null
}

function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/^[^\p{L}\p{N}\u4e00-\u9fff]+|[^\p{L}\p{N}\u4e00-\u9fff]+$/gu, "").trim()
}

function keepToken(token: string): boolean {
  if (!token || STOPWORDS.has(token)) return false
  if (/^[a-z]+$/.test(token) && token.length < 3) return false
  if (/^[\u4e00-\u9fff]$/.test(token) && !RELATIONSHIP_TERMS.has(token)) return false
  return token.length >= 2 || RELATIONSHIP_TERMS.has(token)
}

function extractEmojis(text: string): string[] {
  return Array.from(text.matchAll(/\p{Extended_Pictographic}/gu)).map(m => m[0])
}

function scoreSentiment(text: string): { positive: number; negative: number; score: number } {
  let positive = 0
  let negative = 0
  for (const w of POSITIVE_WORDS) if (text.includes(w)) positive++
  for (const w of NEGATIVE_WORDS) if (text.includes(w)) negative++
  return { positive, negative, score: positive - negative }
}

function topEntries<T>(map: Map<T, number>, n: number): Array<[T, number]> {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
}

function summarizeNumbers(values: number[]) {
  if (!values.length) return { count: 0, medianMinutes: null, averageMinutes: null, p80Minutes: null }
  const sorted = values.slice().sort((a, b) => a - b)
  const quantile = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))]
  const average = values.reduce((a, b) => a + b, 0) / values.length
  return {
    count: values.length,
    medianMinutes: +quantile(0.5).toFixed(1),
    averageMinutes: +average.toFixed(1),
    p80Minutes: +quantile(0.8).toFixed(1),
  }
}
