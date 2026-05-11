/**
 * AI chat-export parser. Handles three "everyday AI chat history"
 * formats with one shared dispatcher + sub-parser model:
 *
 *   - chatgpt-export — OpenAI's `conversations.json` shape (an array of
 *                      conversations, each with a `mapping` graph of
 *                      message nodes keyed by uuid). Detected by the
 *                      `mapping` + `current_node` shape on the first
 *                      conversation.
 *   - claude-chat-export — Anthropic-style export. Either a top-level
 *                      array of `{ name, chat_messages: [...] }` or a
 *                      `{ conversations: [...] }` wrapper with
 *                      `chat_messages` / `messages` per item. Sender
 *                      role lives under `sender` (`human` / `assistant`)
 *                      or `role`.
 *   - ai-chat-log    — markdown / plain text "User: ... Assistant: ..."
 *                      transcripts. One file per conversation OR a
 *                      single file containing several conversations
 *                      separated by `## Conversation N` / `# Title` /
 *                      `---`.
 *
 * The parser normalizes all three into a unified `conversations` array
 * plus shared aggregations (timeline, topic clusters, model breakdown,
 * reusable-prompt and important-answer heuristics, unresolved-thread
 * callouts). The LLM (or the shared fallback template) then designs the
 * "AI work-memory atlas" page from the same shape regardless of source.
 *
 * The parser is heuristic-only — topic clustering is a coarse
 * keyword roll-up, "reusable prompt" / "important answer" /
 * "unresolved thread" flags are surface-pattern hints, not verdicts.
 * The page must label them as such; the family prompt enforces that.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Parser, ParsedFile } from "../types.js"

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AiChatFormat = "chatgpt-export" | "claude-chat-export" | "generic-conversations-json" | "ai-chat-log-md"

/**
 * `ParsedFile.contentType` is one of these. We collapse the markdown-log
 * and generic-JSON formats under the umbrella `ai-chat-export` content
 * type so a single per-source prompt (`prompts/sources/ai-chat-export.md`) covers
 * both, while the more-specific ChatGPT and Claude prompts handle their
 * own quirks.
 */
export type AiChatContentType = "chatgpt-export" | "claude-chat-export" | "ai-chat-export"

export type AiChatRole = "user" | "assistant" | "system" | "tool"

export interface AiChatMessage {
  id: string
  role: AiChatRole
  text: string
  ts?: string                // ISO date (UTC YYYY-MM-DD HH:MM)
  tsEpoch?: number
  model?: string
  wordCount: number
  charCount: number
  codeBlockCount: number
  hasCode: boolean
}

export interface AiChatConversation {
  id: string
  title: string
  createdEpoch?: number
  createdIso?: string
  updatedEpoch?: number
  updatedIso?: string
  messageCount: number
  userCount: number
  assistantCount: number
  systemCount: number
  toolCount: number
  wordCount: number
  assistantWordCount: number
  userWordCount: number
  codeBlockCount: number
  hasCode: boolean
  models: string[]
  topic: string
  kind: "code" | "writing" | "planning" | "research" | "chat" | "other"
  firstUserPrompt: string
  firstAssistantReply: string
  lastUserText?: string
  lastUserEpoch?: number
  lastAssistantEpoch?: number
  durationSec?: number
  isUnresolved: boolean
  unresolvedReason?: string
  messages: AiChatMessage[]
}

export interface AiChatTimelineBucket { weekOf: string; count: number }
export interface AiChatMonthBucket { month: string; count: number }
export interface AiChatTopicCluster { name: string; count: number; conversationIds: string[] }
export interface AiChatModelStat { model: string; count: number; messageCount: number }
export interface AiChatKindStat { kind: AiChatConversation["kind"]; count: number }
export interface AiChatReusablePrompt { id: string; conversationId: string; text: string; sharedKeywords: string[]; ts?: string }
export interface AiChatImportantAnswer { id: string; conversationId: string; preview: string; charCount: number; ts?: string }
export interface AiChatUnresolved { id: string; title: string; lastUserText: string; lastTs?: string; gapDays?: number; reason: string }

interface AiChatAggregations {
  weeklyHistogram: AiChatTimelineBucket[]
  monthlyHistogram: AiChatMonthBucket[]
  hourCounts: number[]                 // 24
  dowCounts: number[]                  // 7 (0=Sun..6=Sat, UTC)
  topicClusters: AiChatTopicCluster[]
  modelBreakdown: AiChatModelStat[]
  kindBreakdown: AiChatKindStat[]
  longestConversations: Array<{ id: string; title: string; messageCount: number; wordCount: number }>
  reusablePrompts: AiChatReusablePrompt[]
  importantAnswers: AiChatImportantAnswer[]
  unresolvedThreads: AiChatUnresolved[]
  totals: {
    conversations: number
    messages: number
    userMessages: number
    assistantMessages: number
    codeBlocks: number
    activeDays: number
    withModel: number
  }
  activeRange: string
  topModels: string[]
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export const parser: Parser = {
  name: "ai-chat-export",
  matches: [".json", ".md", ".markdown", ".txt"],
  async detect(filepath: string): Promise<boolean> {
    const ext = path.extname(filepath).toLowerCase()
    if (ext === ".json") {
      try {
        const raw = await fs.readFile(filepath, "utf8")
        const parsed = JSON.parse(raw)
        return looksLikeChatGptExport(parsed) || looksLikeClaudeExport(parsed) || looksLikeGenericConversationsJson(parsed)
      } catch { return false }
    }
    if (ext === ".md" || ext === ".markdown" || ext === ".txt") {
      try {
        const head = await readHead(filepath, 4096)
        return looksLikeAiChatLog(head)
      } catch { return false }
    }
    return false
  },
  async parse(filepath: string): Promise<ParsedFile> {
    const ext = path.extname(filepath).toLowerCase()
    const raw = await fs.readFile(filepath, "utf8")
    const meta: Record<string, unknown> & { sourceFile: string; sizeBytes: number } = {
      sourceFile: path.basename(filepath),
      sizeBytes: Buffer.byteLength(raw, "utf8"),
    }
    if (ext === ".json") {
      const parsed = JSON.parse(raw)
      if (looksLikeChatGptExport(parsed)) return finishParse(parseChatGptExport(parsed), "chatgpt-export", meta)
      if (looksLikeClaudeExport(parsed)) return finishParse(parseClaudeExport(parsed), "claude-chat-export", meta)
      if (looksLikeGenericConversationsJson(parsed)) return finishParse(parseGenericConversationsJson(parsed), "generic-conversations-json", meta)
      // Should not happen — detect would have refused
      return finishParse([], "generic-conversations-json", meta)
    }
    return finishParse(parseAiChatLogMarkdown(raw, path.basename(filepath, ext)), "ai-chat-log-md", meta)
  },
}

async function readHead(filepath: string, n: number): Promise<string> {
  const fd = await fs.open(filepath, "r")
  const buf = Buffer.alloc(n)
  const { bytesRead } = await fd.read(buf, 0, buf.length, 0)
  await fd.close()
  return buf.subarray(0, bytesRead).toString("utf8")
}

function finishParse(
  conversations: AiChatConversation[],
  format: AiChatFormat,
  meta: Record<string, unknown> & { sourceFile: string; sizeBytes: number },
): ParsedFile {
  const aggs = buildAggregations(conversations)
  const totalMessages = aggs.totals.messages
  const contentType = formatToContentType(format)

  meta.format = format
  meta.kind = "ai-chat-export"
  meta.platform = formatToPlatform(format)
  meta.conversationCount = conversations.length
  meta.messageCount = totalMessages
  meta.userMessageCount = aggs.totals.userMessages
  meta.assistantMessageCount = aggs.totals.assistantMessages
  meta.codeBlockCount = aggs.totals.codeBlocks
  meta.activeDays = aggs.totals.activeDays
  meta.activeRange = aggs.activeRange
  meta.topModels = aggs.topModels
  meta.unresolvedCount = aggs.unresolvedThreads.length

  const platform = formatToPlatform(format)
  const summary = `${platform}: ${conversations.length} conversation${conversations.length === 1 ? "" : "s"} (${totalMessages} messages, ${aggs.totals.codeBlocks} code blocks${aggs.activeRange === "(empty)" ? "" : `, ${aggs.activeRange}`})${aggs.topModels.length ? `, models seen: ${aggs.topModels.slice(0, 3).join(", ")}` : ""}.`

  return {
    contentType,
    summary,
    sample: buildSample(conversations, aggs),
    data: {
      kind: "ai-chat-export",
      format,
      platform,
      conversations,
      ...aggs,
      meta: { ...meta },
    },
    meta,
  }
}

function formatToContentType(format: AiChatFormat): AiChatContentType {
  if (format === "chatgpt-export") return "chatgpt-export"
  if (format === "claude-chat-export") return "claude-chat-export"
  return "ai-chat-export"
}

function formatToPlatform(format: AiChatFormat): string {
  switch (format) {
    case "chatgpt-export": return "ChatGPT export"
    case "claude-chat-export": return "Claude chat export"
    case "generic-conversations-json": return "Generic AI chat export"
    case "ai-chat-log-md": return "AI chat log"
  }
}

// ===========================================================================
// ChatGPT export — array of { title, mapping, current_node, ... }
// ===========================================================================

interface ChatGptMapping {
  [nodeId: string]: {
    id?: string
    parent?: string | null
    children?: string[]
    message?: {
      id?: string
      author?: { role?: string; name?: string | null }
      create_time?: number | null
      content?: { content_type?: string; parts?: unknown[]; text?: string } | string
      metadata?: { model_slug?: string; default_model_slug?: string }
      status?: string
    } | null
  }
}

function looksLikeChatGptExport(o: unknown): boolean {
  if (!Array.isArray(o) || o.length === 0) return false
  const first = o[0] as Record<string, unknown> | undefined
  if (!first || typeof first !== "object") return false
  const mapping = first.mapping as Record<string, unknown> | undefined
  if (!mapping || typeof mapping !== "object") return false
  // Mapping nodes typically have an `id` and `message` (or `children`).
  const sample = Object.values(mapping).slice(0, 3)
  if (!sample.length) return false
  const looksRight = sample.some(n => {
    if (!n || typeof n !== "object") return false
    const r = n as Record<string, unknown>
    return ("message" in r) || ("children" in r) || ("parent" in r)
  })
  return looksRight && (("title" in first) || ("current_node" in first) || ("conversation_id" in first))
}

function parseChatGptExport(parsed: unknown): AiChatConversation[] {
  const arr = parsed as Array<Record<string, unknown>>
  const out: AiChatConversation[] = []
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i]
    if (!c || typeof c !== "object") continue
    const id = String(c.conversation_id || c.id || `c_${String(i + 1).padStart(4, "0")}`)
    const title = String(c.title || `Conversation ${i + 1}`).trim() || `Conversation ${i + 1}`
    const createTimeSec = numberOrNull(c.create_time as unknown)
    const updateTimeSec = numberOrNull(c.update_time as unknown)
    const createTime = createTimeSec != null ? Math.round(createTimeSec * 1000) : undefined
    const updateTime = updateTimeSec != null ? Math.round(updateTimeSec * 1000) : undefined
    const mapping = (c.mapping || {}) as ChatGptMapping
    const currentNode = (c.current_node as string | undefined) || pickLeafNode(mapping)
    const ordered = walkChatGptMapping(mapping, currentNode)
    const messages: AiChatMessage[] = []
    let mid = 0
    for (const node of ordered) {
      const m = node.message
      if (!m) continue
      const role = normalizeRole(m.author?.role || "user")
      const text = extractChatGptMessageText(m.content)
      // ChatGPT seeds an empty system / "tool" node we skip for noise.
      if (!text) continue
      const epoch = m.create_time != null ? Math.round(m.create_time * 1000) : undefined
      const model = m.metadata?.model_slug || m.metadata?.default_model_slug || undefined
      mid++
      messages.push(buildMessage(`m_${String(mid).padStart(4, "0")}`, role, text, epoch, model))
    }
    if (!messages.length) continue
    out.push(buildConversationFromMessages(id, title, messages, createTime, updateTime))
  }
  return out
}

function walkChatGptMapping(mapping: ChatGptMapping, leaf: string | undefined): Array<NonNullable<ChatGptMapping[string]>> {
  // Walk parent → leaf to get the canonical thread (avoids alternative branches).
  if (!leaf || !mapping[leaf]) {
    // Fall back to a topological walk anchored at the root.
    return topologicalChatGptWalk(mapping)
  }
  const out: Array<NonNullable<ChatGptMapping[string]>> = []
  const seen = new Set<string>()
  let cur: string | undefined = leaf
  while (cur && mapping[cur] && !seen.has(cur)) {
    seen.add(cur)
    out.unshift(mapping[cur])
    cur = mapping[cur].parent || undefined
  }
  return out
}

function topologicalChatGptWalk(mapping: ChatGptMapping): Array<NonNullable<ChatGptMapping[string]>> {
  // Find root (no parent).
  const roots: string[] = []
  for (const [id, n] of Object.entries(mapping)) if (!n?.parent) roots.push(id)
  const out: Array<NonNullable<ChatGptMapping[string]>> = []
  const seen = new Set<string>()
  const visit = (nodeId: string): void => {
    if (seen.has(nodeId) || !mapping[nodeId]) return
    seen.add(nodeId)
    out.push(mapping[nodeId])
    for (const c of mapping[nodeId].children || []) visit(c)
  }
  for (const r of roots) visit(r)
  // Catch any orphan nodes
  for (const id of Object.keys(mapping)) visit(id)
  return out
}

function pickLeafNode(mapping: ChatGptMapping): string | undefined {
  // Pick the deepest assistant node by walking from any root.
  let bestId: string | undefined
  let bestDepth = -1
  for (const [id, n] of Object.entries(mapping)) {
    if (!n) continue
    if ((n.children?.length || 0) > 0) continue
    const depth = depthOf(mapping, id, new Set())
    if (depth > bestDepth) { bestDepth = depth; bestId = id }
  }
  return bestId
}

function depthOf(mapping: ChatGptMapping, id: string, seen: Set<string>): number {
  if (seen.has(id) || !mapping[id]) return 0
  seen.add(id)
  const parent = mapping[id].parent
  if (!parent) return 0
  return 1 + depthOf(mapping, parent, seen)
}

function extractChatGptMessageText(content: unknown): string {
  if (!content) return ""
  if (typeof content === "string") return content.trim()
  const c = content as { content_type?: string; parts?: unknown[]; text?: string }
  if (Array.isArray(c.parts)) {
    return c.parts
      .map(p => {
        if (typeof p === "string") return p
        if (p && typeof p === "object") {
          const r = p as { text?: string; content?: string }
          if (typeof r.text === "string") return r.text
          if (typeof r.content === "string") return r.content
        }
        return ""
      })
      .filter(Boolean)
      .join("\n")
      .trim()
  }
  if (typeof c.text === "string") return c.text.trim()
  return ""
}

// ===========================================================================
// Claude / Anthropic-style export
// ===========================================================================

interface ClaudeChatRaw {
  uuid?: string
  name?: string
  created_at?: string
  updated_at?: string
  chat_messages?: ClaudeMessageRaw[]
  messages?: ClaudeMessageRaw[]
}

interface ClaudeMessageRaw {
  uuid?: string
  sender?: string
  role?: string
  created_at?: string
  text?: string
  content?: unknown
  model?: string
  attachments?: unknown[]
}

function looksLikeClaudeExport(o: unknown): boolean {
  const arr = pickClaudeArray(o)
  if (!arr || !arr.length) return false
  const first = arr[0]
  if (!first || typeof first !== "object") return false
  const r = first as ClaudeChatRaw
  const msgs = r.chat_messages || r.messages
  if (!Array.isArray(msgs) || !msgs.length) return false
  // Distinctive Claude signal: messages have `sender` ∈ {human,assistant} OR `chat_messages` key.
  const hasClaudeShape = !!r.chat_messages || msgs.some(m => {
    if (!m || typeof m !== "object") return false
    const mm = m as ClaudeMessageRaw
    return mm.sender === "human" || mm.sender === "assistant"
  })
  return hasClaudeShape
}

function pickClaudeArray(o: unknown): ClaudeChatRaw[] | null {
  if (Array.isArray(o)) return o as ClaudeChatRaw[]
  if (o && typeof o === "object") {
    const r = o as Record<string, unknown>
    if (Array.isArray(r.conversations)) return r.conversations as ClaudeChatRaw[]
    if (Array.isArray(r.chats)) return r.chats as ClaudeChatRaw[]
    if (r.chat_messages) {
      // Single conversation export
      return [{ ...r as ClaudeChatRaw, chat_messages: r.chat_messages as ClaudeMessageRaw[] }]
    }
  }
  return null
}

function parseClaudeExport(parsed: unknown): AiChatConversation[] {
  const arr = pickClaudeArray(parsed) || []
  const out: AiChatConversation[] = []
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i] || {}
    const id = String(c.uuid || `c_${String(i + 1).padStart(4, "0")}`)
    const title = String(c.name || `Conversation ${i + 1}`).trim() || `Conversation ${i + 1}`
    const createdEpoch = parseIsoEpoch(c.created_at)
    const updatedEpoch = parseIsoEpoch(c.updated_at)
    const rawMsgs = c.chat_messages || c.messages || []
    const messages: AiChatMessage[] = []
    let mid = 0
    for (const m of rawMsgs) {
      if (!m || typeof m !== "object") continue
      const mm = m as ClaudeMessageRaw
      const role = normalizeRole(mm.sender || mm.role || "user")
      const text = extractClaudeMessageText(mm)
      if (!text) continue
      const epoch = parseIsoEpoch(mm.created_at)
      mid++
      messages.push(buildMessage(`m_${String(mid).padStart(4, "0")}`, role, text, epoch, mm.model))
    }
    if (!messages.length) continue
    out.push(buildConversationFromMessages(id, title, messages, createdEpoch, updatedEpoch))
  }
  return out
}

function extractClaudeMessageText(m: ClaudeMessageRaw): string {
  if (typeof m.text === "string" && m.text.trim()) return m.text.trim()
  const c = m.content
  if (typeof c === "string") return c.trim()
  if (Array.isArray(c)) {
    return c
      .map(p => {
        if (typeof p === "string") return p
        if (p && typeof p === "object") {
          const r = p as { text?: string; type?: string; content?: string }
          if (typeof r.text === "string") return r.text
          if (typeof r.content === "string") return r.content
        }
        return ""
      })
      .filter(Boolean)
      .join("\n")
      .trim()
  }
  if (c && typeof c === "object") {
    const r = c as { text?: string }
    if (typeof r.text === "string") return r.text.trim()
  }
  return ""
}

// ===========================================================================
// Generic { conversations: [...] } JSON
// ===========================================================================

function looksLikeGenericConversationsJson(o: unknown): boolean {
  const arr = pickGenericArray(o)
  if (!arr || !arr.length) return false
  const first = arr[0]
  if (!first || typeof first !== "object") return false
  const r = first as Record<string, unknown>
  const msgs = (r.messages || r.turns) as unknown
  if (!Array.isArray(msgs) || !msgs.length) return false
  // Each message must have role-ish + content-ish fields.
  const m0 = msgs[0] as Record<string, unknown> | undefined
  if (!m0 || typeof m0 !== "object") return false
  const hasRole = typeof m0.role === "string" || typeof m0.author === "string" || typeof m0.from === "string"
  const hasText = typeof m0.content === "string" || typeof m0.text === "string" || typeof m0.message === "string" || Array.isArray(m0.content)
  return hasRole && hasText
}

function pickGenericArray(o: unknown): Array<Record<string, unknown>> | null {
  if (Array.isArray(o)) {
    const first = o[0] as Record<string, unknown> | undefined
    if (first && Array.isArray(first.messages || first.turns)) return o as Array<Record<string, unknown>>
    return null
  }
  if (o && typeof o === "object") {
    const r = o as Record<string, unknown>
    if (Array.isArray(r.conversations)) return r.conversations as Array<Record<string, unknown>>
    if (Array.isArray(r.chats)) return r.chats as Array<Record<string, unknown>>
    if (Array.isArray(r.threads)) return r.threads as Array<Record<string, unknown>>
    if (Array.isArray(r.sessions)) return r.sessions as Array<Record<string, unknown>>
  }
  return null
}

function parseGenericConversationsJson(parsed: unknown): AiChatConversation[] {
  const arr = pickGenericArray(parsed) || []
  const out: AiChatConversation[] = []
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i]
    if (!c || typeof c !== "object") continue
    const id = String(c.id || c.uuid || c.conversation_id || `c_${String(i + 1).padStart(4, "0")}`)
    const title = String(c.title || c.name || `Conversation ${i + 1}`).trim() || `Conversation ${i + 1}`
    const createdEpoch = pickEpoch(c.created_at, c.create_time, c.created, c.timestamp)
    const updatedEpoch = pickEpoch(c.updated_at, c.update_time, c.updated)
    const rawMsgs = (c.messages || c.turns || []) as Array<Record<string, unknown>>
    const messages: AiChatMessage[] = []
    let mid = 0
    for (const m of rawMsgs) {
      if (!m || typeof m !== "object") continue
      const role = normalizeRole((m.role as string) || (m.author as string) || (m.from as string) || (m.sender as string) || "user")
      const text = extractGenericText(m)
      if (!text) continue
      const epoch = pickEpoch(m.created_at, m.create_time, m.timestamp, m.ts)
      const model = (m.model as string) || (m.model_slug as string) || undefined
      mid++
      messages.push(buildMessage(`m_${String(mid).padStart(4, "0")}`, role, text, epoch, model))
    }
    if (!messages.length) continue
    out.push(buildConversationFromMessages(id, title, messages, createdEpoch, updatedEpoch))
  }
  return out
}

function extractGenericText(m: Record<string, unknown>): string {
  if (typeof m.content === "string") return m.content.trim()
  if (typeof m.text === "string") return m.text.trim()
  if (typeof m.message === "string") return m.message.trim()
  if (typeof m.body === "string") return m.body.trim()
  if (Array.isArray(m.content)) {
    return (m.content as unknown[])
      .map(p => {
        if (typeof p === "string") return p
        if (p && typeof p === "object") {
          const r = p as { text?: string; content?: string; type?: string }
          if (typeof r.text === "string") return r.text
          if (typeof r.content === "string") return r.content
        }
        return ""
      })
      .filter(Boolean)
      .join("\n")
      .trim()
  }
  return ""
}

// ===========================================================================
// Markdown / plain-text "User: / Assistant:" chat log
// ===========================================================================

const ROLE_LINE_RE = /^(?:\*\*)?(user|you|me|human|assistant|ai|chatgpt|claude|gpt|model|system|tool)(?:\*\*)?\s*[:>—-]\s*(.*)$/i

function looksLikeAiChatLog(head: string): boolean {
  const lines = head.split(/\r?\n/).slice(0, 80)
  let roleHits = 0
  let userHit = false
  let asstHit = false
  for (const ln of lines) {
    const m = ROLE_LINE_RE.exec(ln.trim())
    if (!m) continue
    roleHits++
    const r = m[1].toLowerCase()
    if (r === "user" || r === "you" || r === "me" || r === "human") userHit = true
    if (r === "assistant" || r === "ai" || r === "chatgpt" || r === "claude" || r === "gpt" || r === "model") asstHit = true
  }
  return roleHits >= 2 && userHit && asstHit
}

function parseAiChatLogMarkdown(raw: string, fallbackTitle: string): AiChatConversation[] {
  // Split on conversation separators: top-level `# Heading`, `## Conversation`,
  // or a bare `---` line. Each split becomes a conversation; if no split is
  // found, the whole file is one conversation.
  const blocks = splitConversationBlocks(raw)
  const out: AiChatConversation[] = []
  let cidx = 0
  for (const block of blocks) {
    cidx++
    const messages = parseChatLogBlock(block.body)
    if (!messages.length) continue
    const id = `c_${String(cidx).padStart(4, "0")}`
    const title = block.title || `${fallbackTitle} — ${cidx}`
    const inferredEpoch = block.epoch
    out.push(buildConversationFromMessages(id, title, messages, inferredEpoch, undefined))
  }
  return out
}

interface ChatLogBlock { title?: string; body: string; epoch?: number }

const HEADING_RE = /^(#{1,3})\s+(.+?)\s*$/
const SEPARATOR_RE = /^---+\s*$/
const DATE_LINE_RE = /^(?:\*\*)?(?:date|time|when|on)\s*[:>]\s*(.+?)(?:\*\*)?$/i

function splitConversationBlocks(raw: string): ChatLogBlock[] {
  const lines = raw.split(/\r?\n/)
  const blocks: ChatLogBlock[] = []
  let cur: ChatLogBlock = { body: "" }
  let bodyParts: string[] = []
  let titleSet = false
  let firstBlock = true
  const flush = (): void => {
    cur.body = bodyParts.join("\n").trim()
    if (cur.body) blocks.push(cur)
    cur = { body: "" }
    bodyParts = []
    titleSet = false
    firstBlock = false
  }
  let i = 0
  while (i < lines.length) {
    const ln = lines[i]
    const trimmed = ln.trim()
    const heading = HEADING_RE.exec(trimmed)
    if (heading) {
      const lvl = heading[1].length
      const text = heading[2].replace(/[*_`]/g, "")
      // Top-level headings always start a new conversation block (after the first).
      // Sub-headings start a new block too if we already have body content
      // for the current one.
      if (lvl <= 2 && (!firstBlock || bodyParts.length)) {
        flush()
      }
      if (!titleSet) { cur.title = text; titleSet = true }
      // Try to extract a date from the heading itself or the next line.
      cur.epoch = cur.epoch ?? parseLooseDate(text) ?? parseLooseDate(lines[i + 1] || "")
      i++
      continue
    }
    if (SEPARATOR_RE.test(trimmed) && bodyParts.length) {
      flush()
      i++
      continue
    }
    const dateMatch = DATE_LINE_RE.exec(trimmed)
    if (dateMatch && cur.epoch == null) {
      cur.epoch = parseLooseDate(dateMatch[1])
      i++
      continue
    }
    bodyParts.push(ln)
    i++
  }
  flush()
  return blocks
}

function parseChatLogBlock(body: string): AiChatMessage[] {
  const lines = body.split(/\r?\n/)
  const messages: AiChatMessage[] = []
  let curRole: AiChatRole | null = null
  let curParts: string[] = []
  let mid = 0
  let inFence = false
  let curEpoch: number | undefined
  const flush = (): void => {
    if (!curRole) { curParts = []; return }
    const text = curParts.join("\n").trim()
    if (!text) { curParts = []; return }
    mid++
    messages.push(buildMessage(`m_${String(mid).padStart(4, "0")}`, curRole, text, curEpoch))
    curParts = []
    curEpoch = undefined
  }
  for (const ln of lines) {
    if (/^```/.test(ln.trim())) {
      inFence = !inFence
      curParts.push(ln)
      continue
    }
    if (inFence) {
      curParts.push(ln)
      continue
    }
    const trimmed = ln.trim()
    const m = ROLE_LINE_RE.exec(trimmed)
    if (m) {
      flush()
      const r = m[1].toLowerCase()
      curRole = r === "user" || r === "you" || r === "me" || r === "human" ? "user"
        : r === "system" ? "system"
          : r === "tool" ? "tool"
            : "assistant"
      const rest = m[2] || ""
      // Inline timestamp like "User (2025-01-15 14:32):"
      const tsInline = /\(([^)]+)\)/.exec(trimmed)
      if (tsInline) {
        const epoch = parseLooseDate(tsInline[1])
        if (epoch != null) curEpoch = epoch
      }
      if (rest.trim()) curParts.push(rest)
      continue
    }
    curParts.push(ln)
  }
  flush()
  return messages
}

// ===========================================================================
// Shared message + conversation construction
// ===========================================================================

function buildMessage(id: string, role: AiChatRole, text: string, epochMs: number | undefined, model?: string): AiChatMessage {
  const wordCount = text.split(/\s+/).filter(Boolean).length
  const codeBlockCount = (text.match(/```/g) || []).length >> 1
  const epoch = epochMs != null && Number.isFinite(epochMs) ? Math.round(epochMs) : undefined
  const ts = epoch != null ? isoMinute(new Date(epoch)) : undefined
  return {
    id,
    role,
    text,
    ts,
    tsEpoch: epoch,
    model,
    wordCount,
    charCount: text.length,
    codeBlockCount,
    hasCode: codeBlockCount > 0,
  }
}

function buildConversationFromMessages(
  id: string,
  title: string,
  messages: AiChatMessage[],
  createTimeMs: number | undefined,
  updateTimeMs: number | undefined,
): AiChatConversation {
  // Sort by tsEpoch when available; preserve order otherwise.
  const dated = messages.filter(m => m.tsEpoch != null)
  if (dated.length === messages.length && messages.length > 1) {
    messages.sort((a, b) => (a.tsEpoch! - b.tsEpoch!))
  }
  let userCount = 0, assistantCount = 0, systemCount = 0, toolCount = 0
  let userWords = 0, assistantWords = 0, totalWords = 0, totalCode = 0
  const modelSet = new Set<string>()
  let lastUserText: string | undefined
  let lastUserEpoch: number | undefined
  let lastAssistantEpoch: number | undefined
  for (const m of messages) {
    totalWords += m.wordCount
    totalCode += m.codeBlockCount
    if (m.model) modelSet.add(m.model)
    if (m.role === "user") {
      userCount++
      userWords += m.wordCount
      lastUserText = m.text
      lastUserEpoch = m.tsEpoch
    } else if (m.role === "assistant") {
      assistantCount++
      assistantWords += m.wordCount
      lastAssistantEpoch = m.tsEpoch
    } else if (m.role === "system") {
      systemCount++
    } else if (m.role === "tool") {
      toolCount++
    }
  }
  const firstEpoch = messages[0]?.tsEpoch
  const lastEpoch = messages[messages.length - 1]?.tsEpoch
  const createdEpoch = createTimeMs != null && Number.isFinite(createTimeMs) ? Math.round(createTimeMs) : firstEpoch
  const updatedEpoch = updateTimeMs != null && Number.isFinite(updateTimeMs) ? Math.round(updateTimeMs) : lastEpoch
  const firstUser = messages.find(m => m.role === "user")
  const firstAssistant = messages.find(m => m.role === "assistant")
  const kind = inferKind(messages, totalCode)
  const topic = inferTopic(title, firstUser?.text || "", messages)
  // Unresolved heuristic: last message is user OR last assistant reply was very short
  // and the conversation is older than 14 days.
  const last = messages[messages.length - 1]
  let isUnresolved = false
  let unresolvedReason: string | undefined
  if (last?.role === "user") {
    isUnresolved = true
    unresolvedReason = "Last turn is a user message — no assistant reply on record."
  } else if (last?.role === "assistant" && last.wordCount < 10 && messages.length >= 4 && firstUser && firstUser.text.endsWith("?")) {
    isUnresolved = true
    unresolvedReason = "Final assistant reply is unusually short — may not have closed the question."
  }
  const durationSec = createdEpoch && updatedEpoch && updatedEpoch > createdEpoch ? Math.round((updatedEpoch - createdEpoch) / 1000) : undefined
  return {
    id,
    title,
    createdEpoch,
    createdIso: createdEpoch != null ? new Date(createdEpoch).toISOString().slice(0, 10) : undefined,
    updatedEpoch,
    updatedIso: updatedEpoch != null ? new Date(updatedEpoch).toISOString().slice(0, 10) : undefined,
    messageCount: messages.length,
    userCount,
    assistantCount,
    systemCount,
    toolCount,
    wordCount: totalWords,
    assistantWordCount: assistantWords,
    userWordCount: userWords,
    codeBlockCount: totalCode,
    hasCode: totalCode > 0,
    models: Array.from(modelSet),
    topic,
    kind,
    firstUserPrompt: firstUser ? truncate(firstUser.text, 320) : "",
    firstAssistantReply: firstAssistant ? truncate(firstAssistant.text, 320) : "",
    lastUserText: lastUserText ? truncate(lastUserText, 320) : undefined,
    lastUserEpoch,
    lastAssistantEpoch,
    durationSec,
    isUnresolved,
    unresolvedReason,
    messages,
  }
}

// ===========================================================================
// Aggregations + heuristics
// ===========================================================================

const KIND_KEYWORDS: Record<AiChatConversation["kind"], RegExp> = {
  code: /\b(code|function|class|bug|error|stack ?trace|refactor|typescript|python|javascript|rust|sql|api|endpoint|debug|unit test|regex|compile|deploy)\b/i,
  writing: /\b(essay|blog|article|copy|draft|edit|proofread|email|message|tweet|post|rewrite|tone|outline|paragraph|headline|caption|copywriting)\b/i,
  planning: /\b(plan|roadmap|todo|to-do|task list|schedule|agenda|sprint|milestone|prioritize|priorit(y|ies)|brainstorm|outline)\b/i,
  research: /\b(research|summarize|summary|paper|study|literature|cite|citation|background on|comparison|compare|tradeoff|tradeoffs|pros and cons|why does|what is|how does)\b/i,
  chat: /\b(remember|forget|let'?s talk|how are you|what'?s up|chat with me|tell me about yourself)\b/i,
  other: /^$/,
}

function inferKind(messages: AiChatMessage[], totalCode: number): AiChatConversation["kind"] {
  if (totalCode >= 2) return "code"
  const blob = messages.slice(0, 4).map(m => m.text).join("\n").slice(0, 4000)
  for (const kind of ["code", "writing", "planning", "research", "chat"] as const) {
    if (KIND_KEYWORDS[kind].test(blob)) return kind
  }
  return "other"
}

const STOPWORDS = new Set(("a an and are as at be been being but by can could did do does doing don't for from had has have he her here him his how i i'd i'll i'm i've if in is it it's its just like make me mine my no not now of on one or our out over so some than that the their them there these they this those to too under up us was we were what when where which while who why will with would you your yours").split(/\s+/))

function inferTopic(title: string, firstUserText: string, messages: AiChatMessage[]): string {
  // Prefer the title (already a great topic). If it's generic ("New chat",
  // "Untitled", "Conversation 1"), fall back to keywords from the first user
  // prompt + a few assistant replies.
  const t = (title || "").trim()
  if (t && !/^new chat$|^untitled|^conversation \d+$|^chat \d+$/i.test(t) && t.length <= 80) return t
  const blob = (firstUserText + " " + messages.slice(0, 3).map(m => m.text).join(" ")).toLowerCase()
  const counts = new Map<string, number>()
  for (const w of blob.match(/[a-z][a-z0-9-]{3,}/g) || []) {
    if (STOPWORDS.has(w)) continue
    counts.set(w, (counts.get(w) || 0) + 1)
  }
  const top = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w)
  return top.join(" • ") || t || "Untitled"
}

function buildAggregations(conversations: AiChatConversation[]): AiChatAggregations {
  const weekCounts = new Map<string, number>()
  const monthCounts = new Map<string, number>()
  const hourCounts = new Array(24).fill(0)
  const dowCounts = new Array(7).fill(0)
  const modelMessageCounts = new Map<string, { count: number; messageCount: number }>()
  const kindCounts = new Map<AiChatConversation["kind"], number>()
  const topicMap = new Map<string, { name: string; conversationIds: string[] }>()
  const allEpochs: number[] = []
  let totalMessages = 0
  let totalUser = 0, totalAssistant = 0
  let totalCode = 0
  let withModel = 0
  const dateSeen = new Set<string>()
  for (const c of conversations) {
    totalMessages += c.messageCount
    totalUser += c.userCount
    totalAssistant += c.assistantCount
    totalCode += c.codeBlockCount
    kindCounts.set(c.kind, (kindCounts.get(c.kind) || 0) + 1)
    if (c.createdEpoch != null) {
      const d = new Date(c.createdEpoch)
      const wk = isoWeekKey(d)
      weekCounts.set(wk, (weekCounts.get(wk) || 0) + 1)
      const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
      monthCounts.set(month, (monthCounts.get(month) || 0) + 1)
      allEpochs.push(c.createdEpoch)
    }
    for (const m of c.messages) {
      if (m.tsEpoch != null) {
        const d = new Date(m.tsEpoch)
        hourCounts[d.getUTCHours()]++
        dowCounts[d.getUTCDay()]++
        const day = d.toISOString().slice(0, 10)
        dateSeen.add(day)
      }
      if (m.model) {
        const cur = modelMessageCounts.get(m.model) || { count: 0, messageCount: 0 }
        cur.messageCount++
        modelMessageCounts.set(m.model, cur)
        withModel++
      }
    }
    for (const model of c.models) {
      const cur = modelMessageCounts.get(model) || { count: 0, messageCount: 0 }
      cur.count++
      modelMessageCounts.set(model, cur)
    }
    // Topic clustering: bucket by single-word topic (already extracted).
    const topicKey = (c.topic.split(/[•\s]+/)[0] || "other").toLowerCase().replace(/[^a-z0-9-]/g, "")
    if (topicKey) {
      const cur = topicMap.get(topicKey) || { name: c.topic, conversationIds: [] }
      cur.conversationIds.push(c.id)
      topicMap.set(topicKey, cur)
    }
  }
  // Prefer keyword-driven topic clusters (more useful than per-title clusters).
  const keywordClusters = buildKeywordTopicClusters(conversations)
  const topicClusters = keywordClusters.length >= 3
    ? keywordClusters.slice(0, 10)
    : Array.from(topicMap.entries())
      .map(([key, v]) => ({ name: v.name, count: v.conversationIds.length, conversationIds: v.conversationIds }))
      .filter(t => t.count >= 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

  const weeklyHistogram = Array.from(weekCounts.entries())
    .map(([weekOf, count]) => ({ weekOf, count }))
    .sort((a, b) => a.weekOf.localeCompare(b.weekOf))
  const monthlyHistogram = Array.from(monthCounts.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month))
  const modelBreakdown = Array.from(modelMessageCounts.entries())
    .map(([model, v]) => ({ model, count: v.count, messageCount: v.messageCount }))
    .sort((a, b) => b.messageCount - a.messageCount)
  const kindBreakdown = Array.from(kindCounts.entries())
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count)
  const longestConversations = conversations
    .slice()
    .sort((a, b) => b.messageCount - a.messageCount)
    .slice(0, 8)
    .map(c => ({ id: c.id, title: c.title, messageCount: c.messageCount, wordCount: c.wordCount }))
  const reusablePrompts = extractReusablePrompts(conversations)
  const importantAnswers = extractImportantAnswers(conversations)
  const unresolvedThreads = extractUnresolvedThreads(conversations)
  const activeRange = describeRange(allEpochs)

  return {
    weeklyHistogram,
    monthlyHistogram,
    hourCounts,
    dowCounts,
    topicClusters,
    modelBreakdown,
    kindBreakdown,
    longestConversations,
    reusablePrompts,
    importantAnswers,
    unresolvedThreads,
    totals: {
      conversations: conversations.length,
      messages: totalMessages,
      userMessages: totalUser,
      assistantMessages: totalAssistant,
      codeBlocks: totalCode,
      activeDays: dateSeen.size,
      withModel,
    },
    activeRange,
    topModels: modelBreakdown.slice(0, 5).map(m => m.model),
  }
}

function buildKeywordTopicClusters(conversations: AiChatConversation[]): AiChatTopicCluster[] {
  // Pull keywords from titles and first user prompts, weight title 3×.
  const keywordToIds = new Map<string, Set<string>>()
  const conversationKeywords = new Map<string, Set<string>>()
  for (const c of conversations) {
    const keywords = new Set<string>()
    for (const w of stemKeywords(c.title)) keywords.add(w)
    for (const w of stemKeywords(c.firstUserPrompt).slice(0, 4)) keywords.add(w)
    conversationKeywords.set(c.id, keywords)
    for (const k of keywords) {
      const set = keywordToIds.get(k) || new Set()
      set.add(c.id)
      keywordToIds.set(k, set)
    }
  }
  const clusters: AiChatTopicCluster[] = []
  for (const [k, ids] of keywordToIds.entries()) {
    if (ids.size < 2) continue
    clusters.push({ name: k, count: ids.size, conversationIds: Array.from(ids) })
  }
  clusters.sort((a, b) => b.count - a.count)
  return clusters
}

function stemKeywords(s: string): string[] {
  const words = (s || "").toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || []
  const out = new Set<string>()
  for (const w of words) {
    if (STOPWORDS.has(w)) continue
    out.add(w.replace(/(s|ed|ing)$/, ""))
  }
  return Array.from(out)
}

function extractReusablePrompts(conversations: AiChatConversation[]): AiChatReusablePrompt[] {
  // A "reusable prompt" is a user message that:
  //   - is between 30 and 800 chars (long enough to be a real prompt, short enough to reuse)
  //   - shares ≥ 2 distinctive keywords with another conversation's first user prompt
  // Output: top 12 by shared-keyword score.
  const prompts: Array<{ msg: AiChatMessage; conv: AiChatConversation; keywords: Set<string>; score: number; sharedWith: Set<string> }> = []
  for (const c of conversations) {
    for (const m of c.messages) {
      if (m.role !== "user") continue
      if (m.charCount < 30 || m.charCount > 800) continue
      const keywords = new Set(stemKeywords(m.text).filter(k => !STOPWORDS.has(k) && k.length > 4).slice(0, 12))
      if (keywords.size < 3) continue
      prompts.push({ msg: m, conv: c, keywords, score: 0, sharedWith: new Set() })
    }
  }
  for (let i = 0; i < prompts.length; i++) {
    for (let j = i + 1; j < prompts.length; j++) {
      const a = prompts[i]
      const b = prompts[j]
      if (a.conv.id === b.conv.id) continue
      let shared = 0
      for (const k of a.keywords) if (b.keywords.has(k)) shared++
      if (shared >= 2) {
        a.score += shared
        b.score += shared
        a.sharedWith.add(b.conv.id)
        b.sharedWith.add(a.conv.id)
      }
    }
  }
  return prompts
    .filter(p => p.score >= 2 && p.sharedWith.size >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(p => ({
      id: p.msg.id,
      conversationId: p.conv.id,
      text: p.msg.text,
      sharedKeywords: Array.from(p.keywords).slice(0, 6),
      ts: p.msg.ts,
    }))
}

function extractImportantAnswers(conversations: AiChatConversation[]): AiChatImportantAnswer[] {
  const out: AiChatImportantAnswer[] = []
  for (const c of conversations) {
    let bestAssistant: AiChatMessage | undefined
    for (const m of c.messages) {
      if (m.role !== "assistant") continue
      if (m.charCount < 600) continue
      if (!bestAssistant || m.charCount > bestAssistant.charCount) bestAssistant = m
    }
    if (bestAssistant) {
      out.push({
        id: bestAssistant.id,
        conversationId: c.id,
        preview: truncate(bestAssistant.text, 360),
        charCount: bestAssistant.charCount,
        ts: bestAssistant.ts,
      })
    }
  }
  out.sort((a, b) => b.charCount - a.charCount)
  return out.slice(0, 12)
}

function extractUnresolvedThreads(conversations: AiChatConversation[]): AiChatUnresolved[] {
  const now = Date.now()
  const out: AiChatUnresolved[] = []
  for (const c of conversations) {
    if (!c.isUnresolved || !c.lastUserText) continue
    const gapDays = c.lastUserEpoch ? Math.max(0, Math.floor((now - c.lastUserEpoch) / 86400000)) : undefined
    out.push({
      id: c.id,
      title: c.title,
      lastUserText: c.lastUserText,
      lastTs: c.lastUserEpoch != null ? new Date(c.lastUserEpoch).toISOString().slice(0, 10) : undefined,
      gapDays,
      reason: c.unresolvedReason || "Conversation appears to have ended without a clear resolution.",
    })
  }
  out.sort((a, b) => (b.gapDays || 0) - (a.gapDays || 0))
  return out.slice(0, 12)
}

// ===========================================================================
// Sample for the LLM
// ===========================================================================

function buildSample(conversations: AiChatConversation[], aggs: AiChatAggregations): Record<string, unknown> {
  // Show first 6 + last 2 conversations with full metadata but just first 4 messages.
  const preview = (c: AiChatConversation) => ({
    id: c.id,
    title: c.title,
    createdIso: c.createdIso,
    updatedIso: c.updatedIso,
    messageCount: c.messageCount,
    userCount: c.userCount,
    assistantCount: c.assistantCount,
    wordCount: c.wordCount,
    codeBlockCount: c.codeBlockCount,
    models: c.models,
    topic: c.topic,
    kind: c.kind,
    firstUserPrompt: c.firstUserPrompt,
    firstAssistantReply: c.firstAssistantReply,
    isUnresolved: c.isUnresolved,
    sampleMessages: c.messages.slice(0, 4).map(m => ({
      id: m.id,
      role: m.role,
      ts: m.ts,
      preview: truncate(m.text, 240),
      wordCount: m.wordCount,
      hasCode: m.hasCode,
      model: m.model,
    })),
  })
  const head = conversations.slice(0, 6).map(preview)
  const tail = conversations.length > 8 ? conversations.slice(-2).map(preview) : []
  return {
    conversationCount: conversations.length,
    sampleConversations: [...head, ...tail],
    weeklyHistogram: aggs.weeklyHistogram.slice(-26),
    monthlyHistogram: aggs.monthlyHistogram.slice(-12),
    hourCounts: aggs.hourCounts,
    dowCounts: aggs.dowCounts,
    topicClusters: aggs.topicClusters.slice(0, 8),
    modelBreakdown: aggs.modelBreakdown.slice(0, 6),
    kindBreakdown: aggs.kindBreakdown,
    longestConversations: aggs.longestConversations.slice(0, 6),
    reusablePrompts: aggs.reusablePrompts.slice(0, 6).map(p => ({ ...p, text: truncate(p.text, 280) })),
    importantAnswers: aggs.importantAnswers.slice(0, 6),
    unresolvedThreads: aggs.unresolvedThreads.slice(0, 8),
    totals: aggs.totals,
    activeRange: aggs.activeRange,
    topModels: aggs.topModels,
  }
}

// ===========================================================================
// Helpers
// ===========================================================================

function normalizeRole(r: string): AiChatRole {
  const s = r.toLowerCase()
  if (s === "user" || s === "you" || s === "human" || s === "me") return "user"
  if (s === "assistant" || s === "ai" || s === "chatgpt" || s === "claude" || s === "gpt" || s === "model") return "assistant"
  if (s === "system") return "system"
  if (s === "tool" || s === "function") return "tool"
  return "user"
}

function numberOrNull(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

function pickEpoch(...candidates: unknown[]): number | undefined {
  for (const c of candidates) {
    if (c == null) continue
    if (typeof c === "number" && Number.isFinite(c)) {
      // Could be seconds or ms. Treat anything < 5e10 as seconds.
      return c < 5e10 ? c * 1000 : c
    }
    if (typeof c === "string") {
      const e = parseIsoEpoch(c)
      if (e != null) return e
      const n = Number(c)
      if (Number.isFinite(n)) return n < 5e10 ? n * 1000 : n
    }
  }
  return undefined
}

function parseIsoEpoch(s: unknown): number | undefined {
  if (typeof s !== "string" || !s) return undefined
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : undefined
}

function parseLooseDate(s: string): number | undefined {
  if (!s) return undefined
  const trimmed = s.trim()
  if (!trimmed) return undefined
  const t = Date.parse(trimmed)
  if (Number.isFinite(t)) return t
  // YYYY-MM-DD HH:MM
  const m = /(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?/.exec(trimmed)
  if (m) {
    const ts = Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0)
    return Number.isFinite(ts) ? ts : undefined
  }
  return undefined
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n).trim() + "…"
}

function describeRange(epochs: number[]): string {
  if (!epochs.length) return "(empty)"
  const sorted = epochs.slice().sort((a, b) => a - b)
  const a = new Date(sorted[0]).toISOString().slice(0, 10)
  const b = new Date(sorted[sorted.length - 1]).toISOString().slice(0, 10)
  if (a === b) return a
  return `${a} → ${b}`
}

function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`
}

function isoMinute(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`
}
