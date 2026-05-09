/**
 * Knowledge-base parser. Handles three "folder of markdown" flavors with one
 * shared dispatcher:
 *
 *   - notion-export    — Notion's "Markdown & CSV" export format. Filenames
 *                        end in a 32-hex page ID (e.g. `My Page abc123…0.md`)
 *                        and link to one another via the same suffix.
 *   - obsidian-vault   — a vault with `[[wikilinks]]` between notes; usually
 *                        has a top-level `.obsidian/` directory.
 *   - markdown-folder  — a generic directory of `.md` files (Hugo content
 *                        directories, dumped Bear exports, "Notes" folders).
 *
 * The parser walks the directory recursively, builds per-note metadata,
 * resolves inbound + outbound links into a backlink graph, surfaces TODOs /
 * stale notes / orphans / theme clusters, and inlines every note's full body
 * for client-side rendering. The LLM never sees the full corpus — it sees a
 * representative sample of notes plus the aggregations.
 *
 * Parser is invoked by the CLI when the input path is a directory. The
 * generic file picker doesn't get involved because directories don't have
 * a file extension.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Parser, ParsedFile } from "../types.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type KbKind = "notion-export" | "obsidian-vault" | "markdown-folder"

interface Note {
  id: string
  path: string
  filename: string
  title: string
  tags: string[]
  wordCount: number
  headingCount: number
  headings: { level: number; text: string }[]
  outboundLinks: string[]
  inboundLinks: string[]
  outboundCount: number
  inboundCount: number
  todoOpenCount: number
  todoTotalCount: number
  todos: { line: string; done: boolean }[]
  updatedFromFrontmatter?: string
  updatedEpoch?: number
  ageDays?: number
  isStale: boolean
  isOrphan: boolean
  excerpt: string
  raw: string
  notionPageId?: string
}

interface Frontmatter {
  title?: string
  tags?: string[]
  updated?: string
  date?: string
  status?: string
  owner?: string
  [k: string]: unknown
}

const SUPPORTED_EXTS = new Set([".md", ".markdown", ".mdown", ".mkd"])
const SKIP_DIRS = new Set([".git", ".obsidian", "node_modules", ".trash", ".trash-folder", ".DS_Store", "dist", "build"])
const STALE_DAYS_THRESHOLD = 60
const NOTION_HEX_SUFFIX = / [0-9a-f]{32}(?=\.[a-z]+$|$)/i
const NOTION_HEX_ANYWHERE = /[0-9a-f]{32}/i
const MAX_FILES = 1000
const MAX_TOTAL_BYTES = 10 * 1024 * 1024
const MAX_RAW_BYTES_PER_FILE = 256 * 1024

// ---------------------------------------------------------------------------
// Public parser
// ---------------------------------------------------------------------------

export const parser: Parser = {
  name: "knowledge-base",
  matches: ["*"],
  async detect(filepath: string): Promise<boolean> {
    try {
      const st = await fs.stat(filepath)
      if (!st.isDirectory()) return false
      const found = await findMarkdownFiles(filepath)
      return found.length > 0
    } catch {
      return false
    }
  },
  async parse(filepath: string): Promise<ParsedFile> {
    const root = path.resolve(filepath)
    const stat = await fs.stat(root)
    if (!stat.isDirectory()) {
      throw new Error(`knowledge-base: ${root} is not a directory`)
    }
    const files = await findMarkdownFiles(root)
    if (files.length === 0) {
      throw new Error(`knowledge-base: no markdown files under ${root}`)
    }

    const notes: Note[] = []
    let totalBytes = 0
    for (const filePath of files) {
      if (notes.length >= MAX_FILES) break
      const rel = path.relative(root, filePath).split(path.sep).join("/")
      const fileStat = await fs.stat(filePath)
      if (totalBytes + fileStat.size > MAX_TOTAL_BYTES) continue
      let raw: string
      try {
        raw = await fs.readFile(filePath, "utf8")
      } catch {
        continue
      }
      if (Buffer.byteLength(raw, "utf8") > MAX_RAW_BYTES_PER_FILE) {
        raw = raw.slice(0, MAX_RAW_BYTES_PER_FILE)
      }
      totalBytes += Buffer.byteLength(raw, "utf8")
      notes.push(buildNote(rel, raw, fileStat.mtimeMs))
    }

    if (notes.length === 0) {
      throw new Error(`knowledge-base: every markdown file under ${root} exceeded the byte budget`)
    }

    resolveLinks(notes)
    annotateAges(notes)

    const kind = classifyKind(root, notes, await listTopLevel(root))
    const aggregations = buildAggregations(notes, kind)
    const meta: Record<string, unknown> & { sourceFile: string; sizeBytes: number } = {
      sourceFile: path.basename(root),
      sizeBytes: totalBytes,
      kind,
      noteCount: notes.length,
      orphanCount: aggregations.orphans.length,
      staleCount: aggregations.stale.length,
      todoOpenCount: aggregations.todoStats.openCount,
      todoTotalCount: aggregations.todoStats.totalCount,
      uniqueTagCount: aggregations.topTags.length,
      uniqueOutboundLinks: aggregations.totalOutboundLinks,
      hubNote: aggregations.topHubs[0]?.title,
    }
    if (kind === "notion-export") meta.notionPageCount = notes.filter(n => n.notionPageId).length

    const summary = describeKind(kind, notes, aggregations)

    return {
      contentType: kind,
      summary,
      sample: buildSample(notes, aggregations, kind),
      data: {
        kind,
        notes,
        ...aggregations,
        meta: { ...meta },
      },
      meta,
    }
  },
}

// ---------------------------------------------------------------------------
// Directory walking
// ---------------------------------------------------------------------------

async function findMarkdownFiles(root: string): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string): Promise<void> {
    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    } catch {
      return
    }
    entries.sort((a, b) => a.localeCompare(b))
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue
      if (name.startsWith(".")) continue
      const full = path.join(dir, name)
      let st: Awaited<ReturnType<typeof fs.stat>>
      try {
        st = await fs.stat(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        await walk(full)
      } else if (st.isFile()) {
        const ext = path.extname(name).toLowerCase()
        if (SUPPORTED_EXTS.has(ext)) out.push(full)
      }
    }
  }
  await walk(root)
  return out
}

async function listTopLevel(root: string): Promise<string[]> {
  try {
    return await fs.readdir(root)
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Per-note construction
// ---------------------------------------------------------------------------

function buildNote(relPath: string, raw: string, mtimeMs: number): Note {
  const filename = relPath.split("/").pop() || relPath
  const { frontmatter, body } = splitFrontmatter(raw)
  const stripped = stripCodeFences(body)
  const headings = extractHeadings(body)
  const tags = mergeUnique(extractFrontmatterTags(frontmatter), extractInlineTags(stripped))
  const wordCount = stripped.split(/\s+/).filter(Boolean).length
  const todos = extractTodos(body)
  const titleFromFrontmatter = typeof frontmatter.title === "string" ? frontmatter.title.trim() : ""
  const titleFromHeading = headings.find(h => h.level === 1)?.text || headings[0]?.text || ""
  const baseName = filename.replace(/\.(md|markdown|mdown|mkd)$/i, "")
  const cleanedFromFilename = stripNotionHashSuffix(baseName).replace(/_/g, " ").trim()
  const title = titleFromFrontmatter || titleFromHeading || cleanedFromFilename || baseName
  const notionPageId = extractNotionId(filename) || undefined
  const updatedFromFrontmatter = pickFrontmatterDate(frontmatter)
  const updatedEpoch = updatedFromFrontmatter
    ? Date.parse(updatedFromFrontmatter)
    : Number.isFinite(mtimeMs)
      ? mtimeMs
      : undefined
  const outbound = extractOutboundLinks(body)
  const id = makeId(relPath)
  return {
    id,
    path: relPath,
    filename,
    title,
    tags,
    wordCount,
    headingCount: headings.length,
    headings,
    outboundLinks: outbound,
    inboundLinks: [],
    outboundCount: outbound.length,
    inboundCount: 0,
    todoOpenCount: todos.filter(t => !t.done).length,
    todoTotalCount: todos.length,
    todos,
    updatedFromFrontmatter,
    updatedEpoch: Number.isFinite(updatedEpoch) ? updatedEpoch : undefined,
    isStale: false,
    isOrphan: false,
    excerpt: makeExcerpt(stripped),
    raw,
    notionPageId,
  }
}

function makeId(relPath: string): string {
  return relPath.replace(/\.(md|markdown|mdown|mkd)$/i, "").toLowerCase()
}

function makeExcerpt(body: string): string {
  const collapsed = body.replace(/^\s*#{1,6}.*$/gm, "").replace(/\s+/g, " ").trim()
  return collapsed.slice(0, 280)
}

function splitFrontmatter(raw: string): { frontmatter: Frontmatter; body: string } {
  if (!raw.startsWith("---")) return { frontmatter: {}, body: raw }
  const end = raw.indexOf("\n---", 3)
  if (end < 0) return { frontmatter: {}, body: raw }
  const block = raw.slice(3, end).trim()
  const after = raw.slice(end + 4).replace(/^\r?\n/, "")
  return { frontmatter: parseSimpleYaml(block), body: after }
}

function parseSimpleYaml(text: string): Frontmatter {
  const out: Frontmatter = {}
  const lines = text.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim() || line.trim().startsWith("#")) { i++; continue }
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line)
    if (!m) { i++; continue }
    const key = m[1]
    let valueText = m[2]
    if (!valueText) {
      const sub: string[] = []
      i++
      while (i < lines.length && /^\s+- /.test(lines[i])) {
        sub.push(lines[i].replace(/^\s+- /, "").trim().replace(/^['"]|['"]$/g, ""))
        i++
      }
      out[key] = sub
      continue
    }
    if (valueText.startsWith("[") && valueText.endsWith("]")) {
      out[key] = valueText
        .slice(1, -1)
        .split(",")
        .map(p => p.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean)
    } else {
      out[key] = valueText.replace(/^['"]|['"]$/g, "")
    }
    i++
  }
  return out
}

function extractFrontmatterTags(fm: Frontmatter): string[] {
  if (!fm) return []
  const t = (fm as Record<string, unknown>).tags
  if (Array.isArray(t)) return t.map(String).map(s => s.trim()).filter(Boolean)
  if (typeof t === "string") return t.split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
  return []
}

function extractInlineTags(body: string): string[] {
  const out = new Set<string>()
  const re = /(?:^|[\s(\[>])#([A-Za-z][\w/-]{1,40})/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) out.add(m[1])
  return Array.from(out)
}

function extractHeadings(body: string): { level: number; text: string }[] {
  const out: { level: number; text: string }[] = []
  for (const line of body.split(/\r?\n/)) {
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
    if (m) out.push({ level: m[1].length, text: m[2].trim() })
  }
  return out
}

function extractTodos(body: string): { line: string; done: boolean }[] {
  const out: { line: string; done: boolean }[] = []
  for (const line of body.split(/\r?\n/)) {
    const m = /^\s*[-*]\s*\[([ xX])\]\s+(.+?)\s*$/.exec(line)
    if (m) {
      out.push({ line: m[2].trim(), done: m[1].toLowerCase() === "x" })
      continue
    }
    if (/\b(TODO|FIXME)\s*[:\-]/.test(line)) {
      out.push({ line: line.trim(), done: false })
    }
  }
  return out
}

function extractOutboundLinks(body: string): string[] {
  const out = new Set<string>()
  const stripped = stripCodeFences(body)

  const wikilink = /\[\[([^\]\n|#]+)(?:#[^\]\n|]+)?(?:\|[^\]\n]+)?\]\]/g
  let m: RegExpExecArray | null
  while ((m = wikilink.exec(stripped)) !== null) {
    const target = m[1].trim()
    if (target) out.add(`wiki:${target.toLowerCase()}`)
  }

  const mdLink = /\[[^\]]+\]\(([^)]+)\)/g
  while ((m = mdLink.exec(stripped)) !== null) {
    const url = m[1].trim()
    if (/^https?:|^mailto:|^#/.test(url)) continue
    const noFragment = url.replace(/#.*$/, "")
    const cleaned = decodeURI(noFragment).replace(/\\\s/g, " ")
    if (!cleaned) continue
    if (/\.(md|markdown|mdown|mkd)$/i.test(cleaned) || NOTION_HEX_ANYWHERE.test(cleaned)) {
      out.add(`md:${cleaned.toLowerCase()}`)
    }
  }
  return Array.from(out)
}

function stripCodeFences(body: string): string {
  const lines = body.split(/\r?\n/)
  let inFence = false
  const kept: string[] = []
  for (const line of lines) {
    if (/^```/.test(line)) { inFence = !inFence; continue }
    if (inFence) continue
    kept.push(line)
  }
  return kept.join("\n")
}

function stripNotionHashSuffix(name: string): string {
  return name.replace(NOTION_HEX_SUFFIX, "").trim()
}

function extractNotionId(filename: string): string | null {
  const m = NOTION_HEX_SUFFIX.exec(filename)
  if (!m) return null
  return m[0].trim()
}

function pickFrontmatterDate(fm: Frontmatter): string | undefined {
  for (const k of ["updated", "modified", "lastModified", "date", "created"]) {
    const v = (fm as Record<string, unknown>)[k]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Cross-note resolution
// ---------------------------------------------------------------------------

function resolveLinks(notes: Note[]): void {
  const byTitle = new Map<string, Note>()
  const byBaseName = new Map<string, Note>()
  const byPath = new Map<string, Note>()
  const byNotionId = new Map<string, Note>()
  for (const n of notes) {
    byTitle.set(n.title.toLowerCase(), n)
    byBaseName.set(stripNotionHashSuffix(n.filename.replace(/\.(md|markdown|mdown|mkd)$/i, "")).toLowerCase(), n)
    byBaseName.set(n.filename.replace(/\.(md|markdown|mdown|mkd)$/i, "").toLowerCase(), n)
    byPath.set(n.path.toLowerCase(), n)
    byPath.set(n.id, n)
    if (n.notionPageId) {
      const compact = n.notionPageId.toLowerCase().replace(/-/g, "")
      byNotionId.set(compact, n)
    }
  }

  for (const n of notes) {
    const resolved: string[] = []
    for (const link of n.outboundLinks) {
      const target = resolveSingleLink(link, n, byTitle, byBaseName, byPath, byNotionId)
      if (target && target.id !== n.id) resolved.push(target.id)
    }
    const unique = Array.from(new Set(resolved))
    n.outboundLinks = unique
    n.outboundCount = unique.length
  }

  const inbound = new Map<string, Set<string>>()
  for (const n of notes) inbound.set(n.id, new Set())
  for (const n of notes) {
    for (const targetId of n.outboundLinks) {
      inbound.get(targetId)?.add(n.id)
    }
  }
  for (const n of notes) {
    const ids = Array.from(inbound.get(n.id) || [])
    n.inboundLinks = ids
    n.inboundCount = ids.length
    n.isOrphan = n.inboundCount === 0
  }
}

function resolveSingleLink(
  raw: string,
  fromNote: Note,
  byTitle: Map<string, Note>,
  byBaseName: Map<string, Note>,
  byPath: Map<string, Note>,
  byNotionId: Map<string, Note>,
): Note | null {
  if (raw.startsWith("wiki:")) {
    const target = raw.slice(5)
    return byTitle.get(target) || byBaseName.get(target) || null
  }
  if (raw.startsWith("md:")) {
    const target = raw.slice(3)
    const fromDir = path.posix.dirname(fromNote.path).toLowerCase()
    const candidatePath = fromDir === "."
      ? target.replace(/^\.\//, "")
      : path.posix.normalize(path.posix.join(fromDir, target))
    const direct = byPath.get(candidatePath.toLowerCase())
    if (direct) return direct
    const baseName = path.posix.basename(target).replace(/\.(md|markdown|mdown|mkd)$/i, "")
    const titleHit = byTitle.get(baseName.toLowerCase())
    if (titleHit) return titleHit
    const baseHit = byBaseName.get(baseName.toLowerCase())
    if (baseHit) return baseHit
    const cleaned = stripNotionHashSuffix(baseName).toLowerCase()
    const cleanedHit = byTitle.get(cleaned) || byBaseName.get(cleaned)
    if (cleanedHit) return cleanedHit
    const idMatch = NOTION_HEX_ANYWHERE.exec(target)
    if (idMatch) {
      const compact = idMatch[0].toLowerCase().replace(/-/g, "")
      const hit = byNotionId.get(compact)
      if (hit) return hit
    }
  }
  return null
}

function annotateAges(notes: Note[]): void {
  const now = Date.now()
  for (const n of notes) {
    if (n.updatedEpoch != null && Number.isFinite(n.updatedEpoch)) {
      n.ageDays = Math.max(0, Math.floor((now - n.updatedEpoch) / 86_400_000))
      n.isStale = n.ageDays >= STALE_DAYS_THRESHOLD
    } else {
      n.ageDays = undefined
      n.isStale = false
    }
  }
}

// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------

interface Aggregations {
  topHubs: Array<{ id: string; title: string; path: string; inboundCount: number; outboundCount: number }>
  orphans: Array<{ id: string; title: string; path: string; updatedFromFrontmatter?: string; ageDays?: number }>
  stale: Array<{ id: string; title: string; path: string; ageDays: number; updatedFromFrontmatter?: string }>
  todoStats: { openCount: number; totalCount: number; topNotesByOpenTodos: Array<{ id: string; title: string; path: string; openCount: number }> }
  topTodos: Array<{ noteId: string; noteTitle: string; line: string }>
  topTags: Array<{ tag: string; count: number; notes: string[] }>
  themeClusters: Array<{ name: string; tag?: string; noteIds: string[]; size: number }>
  longestNotes: Array<{ id: string; title: string; path: string; wordCount: number }>
  graph: { nodes: Array<{ id: string; title: string; size: number }>; edges: Array<{ from: string; to: string }> }
  totalOutboundLinks: number
  totalInboundLinks: number
  totalNotes: number
  totalTags: number
}

function buildAggregations(notes: Note[], _kind: KbKind): Aggregations {
  const topHubs = notes
    .slice()
    .sort((a, b) => b.inboundCount - a.inboundCount || b.outboundCount - a.outboundCount)
    .slice(0, 8)
    .filter(n => n.inboundCount > 0 || n.outboundCount > 0)
    .map(n => ({ id: n.id, title: n.title, path: n.path, inboundCount: n.inboundCount, outboundCount: n.outboundCount }))

  const orphans = notes
    .filter(n => n.isOrphan)
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0))
    .slice(0, 12)
    .map(n => ({ id: n.id, title: n.title, path: n.path, updatedFromFrontmatter: n.updatedFromFrontmatter, ageDays: n.ageDays }))

  const stale = notes
    .filter(n => n.isStale)
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0))
    .slice(0, 12)
    .map(n => ({ id: n.id, title: n.title, path: n.path, ageDays: n.ageDays || 0, updatedFromFrontmatter: n.updatedFromFrontmatter }))

  const todoNotes = notes
    .filter(n => n.todoOpenCount > 0)
    .sort((a, b) => b.todoOpenCount - a.todoOpenCount)
    .slice(0, 8)
    .map(n => ({ id: n.id, title: n.title, path: n.path, openCount: n.todoOpenCount }))
  const totalOpen = notes.reduce((s, n) => s + n.todoOpenCount, 0)
  const totalTodos = notes.reduce((s, n) => s + n.todoTotalCount, 0)
  const topTodos: Aggregations["topTodos"] = []
  for (const n of notes) {
    for (const t of n.todos) {
      if (t.done) continue
      topTodos.push({ noteId: n.id, noteTitle: n.title, line: t.line })
      if (topTodos.length >= 30) break
    }
    if (topTodos.length >= 30) break
  }

  const tagCounts = new Map<string, { count: number; notes: Set<string> }>()
  for (const n of notes) {
    for (const t of n.tags) {
      const cur = tagCounts.get(t) || { count: 0, notes: new Set<string>() }
      cur.count += 1
      cur.notes.add(n.id)
      tagCounts.set(t, cur)
    }
  }
  const topTags = Array.from(tagCounts.entries())
    .map(([tag, v]) => ({ tag, count: v.count, notes: Array.from(v.notes).slice(0, 12) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 16)

  const themeClusters: Aggregations["themeClusters"] = topTags
    .filter(t => t.count >= 2)
    .slice(0, 8)
    .map(t => ({ name: t.tag, tag: t.tag, noteIds: t.notes, size: t.count }))
  if (themeClusters.length === 0) {
    const topFolders = new Map<string, string[]>()
    for (const n of notes) {
      const dir = path.posix.dirname(n.path)
      if (dir === ".") continue
      const top = dir.split("/")[0]
      const arr = topFolders.get(top) || []
      arr.push(n.id)
      topFolders.set(top, arr)
    }
    for (const [name, ids] of topFolders.entries()) {
      if (ids.length >= 2) themeClusters.push({ name, noteIds: ids.slice(0, 12), size: ids.length })
    }
    themeClusters.sort((a, b) => b.size - a.size)
  }

  const longestNotes = notes
    .slice()
    .sort((a, b) => b.wordCount - a.wordCount)
    .slice(0, 6)
    .map(n => ({ id: n.id, title: n.title, path: n.path, wordCount: n.wordCount }))

  const graph = buildGraph(notes)

  return {
    topHubs,
    orphans,
    stale,
    todoStats: { openCount: totalOpen, totalCount: totalTodos, topNotesByOpenTodos: todoNotes },
    topTodos,
    topTags,
    themeClusters,
    longestNotes,
    graph,
    totalOutboundLinks: notes.reduce((s, n) => s + n.outboundCount, 0),
    totalInboundLinks: notes.reduce((s, n) => s + n.inboundCount, 0),
    totalNotes: notes.length,
    totalTags: tagCounts.size,
  }
}

function buildGraph(notes: Note[]): Aggregations["graph"] {
  const nodes = notes.map(n => ({
    id: n.id,
    title: n.title,
    size: Math.max(4, Math.min(32, n.inboundCount + Math.ceil(n.outboundCount / 2))),
  }))
  const edges: Array<{ from: string; to: string }> = []
  for (const n of notes) {
    for (const target of n.outboundLinks) edges.push({ from: n.id, to: target })
  }
  return { nodes, edges }
}

function classifyKind(_root: string, notes: Note[], topLevel: string[]): KbKind {
  if (topLevel.includes(".obsidian")) return "obsidian-vault"
  const notionLike = notes.filter(n => n.notionPageId).length
  if (notionLike >= Math.max(2, Math.ceil(notes.length * 0.3))) return "notion-export"
  const wikilinkUsers = notes.filter(n => /\[\[[^\]]+\]\]/.test(n.raw)).length
  if (wikilinkUsers >= Math.max(2, Math.ceil(notes.length * 0.25))) return "obsidian-vault"
  return "markdown-folder"
}

function describeKind(kind: KbKind, notes: Note[], agg: Aggregations): string {
  const label = kind === "notion-export" ? "Notion export" : kind === "obsidian-vault" ? "Obsidian-style vault" : "Markdown folder"
  const links = `${agg.totalOutboundLinks} cross-note link${agg.totalOutboundLinks === 1 ? "" : "s"}`
  const orph = `${agg.orphans.length} orphan${agg.orphans.length === 1 ? "" : "s"}`
  const stale = `${agg.stale.length} stale (>${STALE_DAYS_THRESHOLD}d)`
  const todos = `${agg.todoStats.openCount} open TODO${agg.todoStats.openCount === 1 ? "" : "s"}`
  return `${label}: ${notes.length} notes, ${links}, ${orph}, ${stale}, ${todos}.`
}

// ---------------------------------------------------------------------------
// Sample (what the LLM sees)
// ---------------------------------------------------------------------------

function buildSample(notes: Note[], agg: Aggregations, kind: KbKind): Record<string, unknown> {
  const head = notes.slice(0, 8).map(noteSample)
  const tail = notes.length > 12 ? notes.slice(-3).map(noteSample) : []
  return {
    kind,
    noteCount: notes.length,
    sample: [...head, ...tail],
    topHubs: agg.topHubs,
    orphans: agg.orphans,
    stale: agg.stale,
    topTodos: agg.topTodos.slice(0, 12),
    todoStats: { openCount: agg.todoStats.openCount, totalCount: agg.todoStats.totalCount, topNotesByOpenTodos: agg.todoStats.topNotesByOpenTodos },
    topTags: agg.topTags,
    themeClusters: agg.themeClusters,
    longestNotes: agg.longestNotes,
    graphSummary: {
      nodes: agg.graph.nodes.length,
      edges: agg.graph.edges.length,
      densest: agg.topHubs[0]?.title,
    },
    totalOutboundLinks: agg.totalOutboundLinks,
    totalInboundLinks: agg.totalInboundLinks,
  }
}

function noteSample(n: Note) {
  return {
    id: n.id,
    title: n.title,
    path: n.path,
    tags: n.tags,
    wordCount: n.wordCount,
    headingCount: n.headingCount,
    headings: n.headings.slice(0, 6),
    outboundCount: n.outboundCount,
    inboundCount: n.inboundCount,
    todoOpenCount: n.todoOpenCount,
    isOrphan: n.isOrphan,
    isStale: n.isStale,
    ageDays: n.ageDays,
    updatedFromFrontmatter: n.updatedFromFrontmatter,
    excerpt: n.excerpt,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mergeUnique(...arrays: string[][]): string[] {
  const out = new Set<string>()
  for (const arr of arrays) for (const v of arr) out.add(v)
  return Array.from(out)
}
