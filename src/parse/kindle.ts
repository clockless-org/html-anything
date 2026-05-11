/**
 * Kindle highlights / notes / bookmarks parser.
 *
 * Two source shapes:
 *
 *   - `My Clippings.txt` (canonical): plain UTF-8 text, one record
 *     per clipping, records separated by a line of exactly
 *     `==========`. Each record is four lines:
 *
 *         Book Title (Author Name)
 *         - Your Highlight on page 23 | location 345-347 | Added on Wednesday, March 15, 2023 9:42:15 PM
 *         <blank>
 *         The clipping text (highlight body, note body, or empty for bookmarks)
 *
 *     Older firmware emits `- Highlight Loc. 345-347 | Added on …`
 *     (no `Your`, no `page`). Localized devices emit the same shape
 *     in the device language; we still detect via the leading `-`,
 *     the `==========` boundary, and the date tail.
 *
 *   - Kindle Notebook HTML email (per-book export): a single-book
 *     page with `<div class="bodyContainer">` of `noteHeading` /
 *     `noteText` / `highlight` blocks. Detected by `bodyContainer`
 *     + `noteHeading` markers; parsed into the same structured
 *     shape as `My Clippings.txt`.
 *
 * Output: a "kindle-highlights" ParsedFile shaped per
 * prompts/sources/kindle-highlights.md — rows + books + authors +
 * yearTotals + monthTotals + hourCounts + themeClusters +
 * duplicateGroups + summary, pre-aggregated so the page can render
 * thousands of clippings without recomputing on the client.
 *
 * The parser does not classify themes semantically — themeClusters
 * is a coarse keyword roll-up clearly labeled as a heuristic in the
 * prompt. The LLM does the narrative work.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Parser, ParsedFile } from "../types.js"

// ---------------------------------------------------------------------------
// Public parser
// ---------------------------------------------------------------------------

const SEPARATOR = "=========="
const KIND_RE = /\b(Highlight|Note|Bookmark|Loc\.)\b/i

interface RawRecord {
  headerLine: string
  metaLine: string
  bodyLines: string[]
}

interface Clipping {
  id: string
  bookId: string
  title: string
  author: string | null
  kind: "highlight" | "note" | "bookmark"
  page: number | null
  locationStart: number | null
  locationEnd: number | null
  date: string | null      // YYYY-MM-DD
  time: string | null      // HH:MM
  tsEpoch: number | null
  text: string
  textLength: number
  lang: "en" | "non-latin" | "unknown"
  duplicateOf: string | null
  noteAttachedTo: string | null
  raw: { headerLine: string; metaLine: string; body: string }
}

export const parser: Parser = {
  name: "kindle",
  matches: [".txt", ".html", ".htm"],
  async detect(filepath: string): Promise<boolean> {
    const ext = path.extname(filepath).toLowerCase()
    try {
      const head = await readHead(filepath, 8192)
      if (ext === ".txt") {
        // My Clippings.txt: must contain the separator AND a kind line.
        if (!head.includes(SEPARATOR)) return false
        if (KIND_RE.test(head)) return true
        // Localized devices: kind word may not be in English. Fall back
        // to detecting `- ` + a 4-digit-year date tail, which is
        // distinctive across locales.
        return /^-\s.+\b(19|20)\d{2}\b/m.test(head)
      }
      if (ext === ".html" || ext === ".htm") {
        if (!/bodyContainer/.test(head)) return false
        if (!/noteHeading/.test(head)) return false
        // Avoid clobbering the bookmarks-html parser. Netscape exports
        // start with NETSCAPE-Bookmark-file-1; Kindle Notebook does not.
        if (/NETSCAPE-Bookmark-file-1/i.test(head)) return false
        return true
      }
      return false
    } catch {
      return false
    }
  },
  async parse(filepath: string): Promise<ParsedFile> {
    const ext = path.extname(filepath).toLowerCase()
    const raw = await fs.readFile(filepath, "utf8")
    const meta: Record<string, unknown> & { sourceFile: string; sizeBytes: number } = {
      sourceFile: path.basename(filepath),
      sizeBytes: Buffer.byteLength(raw, "utf8"),
    }
    const subtype = (ext === ".html" || ext === ".htm") ? "notebook-html" : "my-clippings"
    const records = subtype === "notebook-html" ? splitNotebookHtml(raw) : splitMyClippings(raw)
    const rows = records.map((r, i) => recordToClipping(r, i + 1)).filter((c): c is Clipping => c != null)
    return finalize(rows, subtype, meta)
  },
}

async function readHead(filepath: string, n: number): Promise<string> {
  const fd = await fs.open(filepath, "r")
  const buf = Buffer.alloc(n)
  const { bytesRead } = await fd.read(buf, 0, buf.length, 0)
  await fd.close()
  return buf.subarray(0, bytesRead).toString("utf8")
}

// ===========================================================================
// `My Clippings.txt` reader
// ===========================================================================

function splitMyClippings(raw: string): RawRecord[] {
  // Strip BOM, normalize CRLF.
  const clean = raw.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const out: RawRecord[] = []
  // Split on lines that are exactly `==========` (allow trailing whitespace).
  const chunks = clean.split(/\n=+\s*\n?/)
  for (const chunk of chunks) {
    const trimmed = chunk.replace(/^\n+/, "").replace(/\n+$/, "")
    if (!trimmed) continue
    const lines = trimmed.split("\n")
    if (lines.length < 2) continue
    const headerLine = lines[0]
    const metaLine = lines[1]
    // Lines 3..N are the body (line 3 is conventionally blank but
    // some firmware skips it for empty bookmark bodies).
    const bodyLines = lines.slice(2)
    // Drop a single leading blank line if present.
    if (bodyLines.length && bodyLines[0].trim() === "") bodyLines.shift()
    out.push({ headerLine, metaLine, bodyLines })
  }
  return out
}

// ===========================================================================
// Kindle Notebook HTML email reader (per-book exports)
// ===========================================================================

function splitNotebookHtml(raw: string): RawRecord[] {
  // Pull title + author from the bookTitle / authors divs at top of body.
  const titleMatch = /<div class="bookTitle">([\s\S]*?)<\/div>/i.exec(raw)
  const authorMatch = /<div class="authors">([\s\S]*?)<\/div>/i.exec(raw)
  const bookTitle = titleMatch ? stripHtml(titleMatch[1]).trim() : "(untitled)"
  const author = authorMatch ? stripHtml(authorMatch[1]).trim().replace(/^by\s+/i, "") : null
  const records: RawRecord[] = []
  const headingRe = /<div class="noteHeading">([\s\S]*?)<\/div>\s*<div class="noteText">([\s\S]*?)<\/div>/gi
  let m: RegExpExecArray | null
  while ((m = headingRe.exec(raw)) != null) {
    const heading = stripHtml(m[1]).replace(/\s+/g, " ").trim()
    const body = stripHtml(m[2]).trim()
    // Heading: "Highlight (Yellow) - Location 345"  OR  "Note - Page 23"
    const kindMatch = /\b(Highlight|Note|Bookmark)\b/i.exec(heading)
    const pageMatch = /Page\s+(\d+)/i.exec(heading)
    const locMatch = /Location\s+(\d+)(?:-(\d+))?/i.exec(heading)
    const meta = `- ${kindMatch ? kindMatch[0] : "Highlight"}${pageMatch ? ` on page ${pageMatch[1]}` : ""}${locMatch ? ` | location ${locMatch[1]}${locMatch[2] ? "-" + locMatch[2] : ""}` : ""}`
    records.push({
      headerLine: author ? `${bookTitle} (${author})` : bookTitle,
      metaLine: meta,
      bodyLines: body ? body.split(/\n+/) : [],
    })
  }
  return records
}

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
}

// ===========================================================================
// Record → Clipping
// ===========================================================================

function recordToClipping(rec: RawRecord, idx: number): Clipping | null {
  const id = `k_${String(idx).padStart(6, "0")}`
  const { title, author } = parseHeader(rec.headerLine)
  if (!title) return null
  const meta = parseMetaLine(rec.metaLine)
  if (!meta) return null
  const text = rec.bodyLines.join("\n").trim()
  const kind = meta.kind
  // For bookmarks, text is canonically empty; if the firmware put a
  // marker like "<You have reached the clipping limit…>" in there,
  // pass it through but keep kind as bookmark.
  return {
    id,
    bookId: stableBookId(title, author),
    title,
    author,
    kind,
    page: meta.page,
    locationStart: meta.locationStart,
    locationEnd: meta.locationEnd,
    date: meta.date,
    time: meta.time,
    tsEpoch: meta.tsEpoch,
    text,
    textLength: text.length,
    lang: detectLang(text),
    duplicateOf: null,
    noteAttachedTo: null,
    raw: { headerLine: rec.headerLine, metaLine: rec.metaLine, body: text },
  }
}

function parseHeader(line: string): { title: string; author: string | null } {
  const trimmed = line.trim().replace(/^﻿/, "")
  if (!trimmed) return { title: "", author: null }
  // "Title (Author)" — by far the most common form. The dash form
  // ("Title — Author") existed on very old firmware but is unsafe
  // to detect heuristically (titles like "Field Notes — Volume Three"
  // would mis-route the volume label into the author slot), so we
  // only honor parens.
  const paren = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(trimmed)
  if (paren) {
    const title = paren[1].trim()
    const author = paren[2].trim()
    if (title && author) return { title, author }
  }
  return { title: trimmed, author: null }
}

interface MetaParts {
  kind: "highlight" | "note" | "bookmark"
  page: number | null
  locationStart: number | null
  locationEnd: number | null
  date: string | null
  time: string | null
  tsEpoch: number | null
}

function parseMetaLine(line: string): MetaParts | null {
  if (!line) return null
  const lower = line.toLowerCase()
  let kind: MetaParts["kind"]
  if (/\bhighlight\b|subrayado|destacado|markierung|surlignage|ハイライト|高亮|划线/i.test(line)) kind = "highlight"
  else if (/\bnote\b|nota|notiz|메모|笔记|메모/i.test(line)) kind = "note"
  else if (/\bbookmark\b|marcador|lesezeichen|signet|북마크|书签|ブックマーク/i.test(line)) kind = "bookmark"
  else if (/\bloc\.?\b/i.test(lower)) kind = "highlight"
  else return null
  // Page
  const pageMatch = /\b(?:on\s+)?page\s+(\d+)/i.exec(line) || /\b(?:p\.?|pg\.?|página|página|seite|페이지)\s*(\d+)/i.exec(line)
  const page = pageMatch ? parseInt(pageMatch[1], 10) : null
  // Location — accept "location 345-347" / "Loc. 345-347" / "posición 345-347"
  const locMatch = /\b(?:location|loc\.?|posición|posicion|position|posição|posizione|위치|位置)\s*(\d+)(?:\s*[-–]\s*(\d+))?/i.exec(line)
  const locationStart = locMatch ? parseInt(locMatch[1], 10) : null
  const locationEnd = locMatch && locMatch[2] ? parseInt(locMatch[2], 10) : null
  // Date — split on the canonical "Added on" / "Añadido el" / "Hinzugefügt am"
  // marker; failing that, the segment after the last `|`.
  const dateSegment = extractDateSegment(line)
  const parsed = dateSegment ? parseKindleDate(dateSegment) : null
  return {
    kind,
    page,
    locationStart,
    locationEnd,
    date: parsed?.date ?? null,
    time: parsed?.time ?? null,
    tsEpoch: parsed?.epoch ?? null,
  }
}

function extractDateSegment(line: string): string | null {
  // Match the canonical "Added on" / "Añadido el" / "Hinzugefügt am" /
  // "Ajouté le" / "Adicionado em" / "Aggiunto il" / "추가된 날짜" /
  // "添加于" / "追加日" markers.
  const re = /(?:Added on|A[ñn]adido el|Hinzugef[üu]gt am|Ajout[ée] le|Adicionado em|Aggiunto il|추가된 날짜|添加于|追加日)\s*[:：]?\s*(.+?)$/i
  const m = re.exec(line)
  if (m) return m[1].trim()
  // Fall back to the last `|` segment if it contains a 4-digit year.
  const segments = line.split("|")
  for (let i = segments.length - 1; i >= 0; i--) {
    if (/\b(19|20)\d{2}\b/.test(segments[i])) return segments[i].trim()
  }
  return null
}

const ENGLISH_MONTH = new Map([
  ["jan", 1], ["january", 1],
  ["feb", 2], ["february", 2],
  ["mar", 3], ["march", 3],
  ["apr", 4], ["april", 4],
  ["may", 5],
  ["jun", 6], ["june", 6],
  ["jul", 7], ["july", 7],
  ["aug", 8], ["august", 8],
  ["sep", 9], ["sept", 9], ["september", 9],
  ["oct", 10], ["october", 10],
  ["nov", 11], ["november", 11],
  ["dec", 12], ["december", 12],
])

function parseKindleDate(seg: string): { date: string; time: string; epoch: number } | null {
  const cleaned = seg.replace(/\s+/g, " ").trim()
  // English form: "Wednesday, March 15, 2023 9:42:15 PM"
  // Or: "March 15, 2023 9:42 PM"
  const m = /\b([A-Za-z]+),?\s+(\d{1,2}),?\s+((?:19|20)\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i.exec(cleaned)
  if (m) {
    const monthName = m[1].toLowerCase()
    const month = ENGLISH_MONTH.get(monthName) ?? -1
    if (month > 0) {
      const day = parseInt(m[2], 10)
      const year = parseInt(m[3], 10)
      let hour = parseInt(m[4], 10)
      const minute = parseInt(m[5], 10)
      const second = m[6] ? parseInt(m[6], 10) : 0
      const ap = (m[7] || "").toUpperCase()
      if (ap === "PM" && hour < 12) hour += 12
      if (ap === "AM" && hour === 12) hour = 0
      const date = `${year}-${pad(month)}-${pad(day)}`
      const time = `${pad(hour)}:${pad(minute)}`
      const epoch = Date.UTC(year, month - 1, day, hour, minute, second)
      if (Number.isFinite(epoch)) return { date, time, epoch }
    }
  }
  // ISO fallback: "2023-03-15T21:42:15"
  const iso = /(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/.exec(cleaned)
  if (iso) {
    const [, y, mo, d, h, mi, s] = iso
    const date = `${y}-${mo}-${d}`
    const time = `${h}:${mi}`
    const epoch = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0))
    if (Number.isFinite(epoch)) return { date, time, epoch }
  }
  // Numeric fallback: "15/03/2023 21:42" (DMY) or "3/15/2023 9:42 PM" (MDY)
  const num = /(\d{1,2})[\/.-](\d{1,2})[\/.-]((?:19|20)\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i.exec(cleaned)
  if (num) {
    const a = parseInt(num[1], 10)
    const b = parseInt(num[2], 10)
    const year = parseInt(num[3], 10)
    // Assume MDY — Kindle's English locale default.
    const month = a >= 1 && a <= 12 ? a : b
    const day = a >= 1 && a <= 12 ? b : a
    let hour = parseInt(num[4], 10)
    const minute = parseInt(num[5], 10)
    const second = num[6] ? parseInt(num[6], 10) : 0
    const ap = (num[7] || "").toUpperCase()
    if (ap === "PM" && hour < 12) hour += 12
    if (ap === "AM" && hour === 12) hour = 0
    const date = `${year}-${pad(month)}-${pad(day)}`
    const time = `${pad(hour)}:${pad(minute)}`
    const epoch = Date.UTC(year, month - 1, day, hour, minute, second)
    if (Number.isFinite(epoch)) return { date, time, epoch }
  }
  return null
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

function stableBookId(title: string, author: string | null): string {
  const key = `${title}|${author || ""}`.toLowerCase()
  let h = 5381
  for (let i = 0; i < key.length; i++) h = (h * 33) ^ key.charCodeAt(i)
  // Hex of unsigned int → 6 chars
  const hex = (h >>> 0).toString(16).padStart(8, "0").slice(0, 6)
  return `b_${hex}`
}

function detectLang(s: string): "en" | "non-latin" | "unknown" {
  if (!s) return "unknown"
  if (/[Ѐ-ӿ֐-׿؀-ۿऀ-ॿ぀-ヿ㐀-鿿가-힯]/.test(s)) return "non-latin"
  if (/[A-Za-z]/.test(s)) return "en"
  return "unknown"
}

// ===========================================================================
// Aggregation — books, authors, timelines, hour-of-day, themes, duplicates,
// note-to-highlight matching, summary
// ===========================================================================

function finalize(rows: Clipping[], subtype: "my-clippings" | "notebook-html", meta: Record<string, unknown> & { sourceFile: string; sizeBytes: number }): ParsedFile {
  // Mark duplicates and matched-notes BEFORE counting per-book stats so
  // the badges line up with what the user sees in the drill-down.
  markDuplicates(rows)
  markNotesAttached(rows)

  const books = buildBooks(rows)
  const authors = buildAuthors(books, rows)
  const yearTotals = buildYearTotals(rows)
  const monthTotals = buildMonthTotals(rows)
  const hourCounts = buildHourCounts(rows)
  const themeClusters = buildThemeClusters(rows)
  const duplicateGroups = buildDuplicateGroups(rows)
  const summary = buildSummary(rows, books, authors)
  const period = describeRange(rows)

  meta.format = "kindle-highlights"
  meta.kind = "kindle-highlights"
  meta.sourceFormat = subtype
  meta.encoding = "utf-8"
  meta.rowCount = rows.length
  meta.bookCount = books.length
  meta.authorCount = authors.length
  meta.highlightCount = summary.highlightCount
  meta.noteCount = summary.noteCount
  meta.bookmarkCount = summary.bookmarkCount
  meta.period = period

  const summaryLine = `${rows.length} clipping${rows.length === 1 ? "" : "s"} across ${books.length} book${books.length === 1 ? "" : "s"} (${summary.highlightCount} highlight${summary.highlightCount === 1 ? "" : "s"}, ${summary.noteCount} note${summary.noteCount === 1 ? "" : "s"}, ${summary.bookmarkCount} bookmark${summary.bookmarkCount === 1 ? "" : "s"}; ${period}).`

  return {
    contentType: "kindle-highlights",
    summary: summaryLine,
    sample: buildSample(rows, books, authors, themeClusters, yearTotals, monthTotals, summary),
    data: {
      kind: "kindle-highlights",
      format: "kindle-highlights",
      subtype,
      rows,
      books,
      authors,
      yearTotals,
      monthTotals,
      hourCounts,
      themeClusters,
      duplicateGroups,
      summary,
      meta: { ...meta },
    },
    meta,
  }
}

function markDuplicates(rows: Clipping[]): void {
  // Two duplicate patterns to collapse:
  //  1. Extended highlight — Kindle saves a new record at the same
  //     starting location when the reader drags the selection
  //     handle; earliest record wins.
  //  2. Re-highlighted text — same normalized text re-saved at a
  //     different location (rarer; happens when the reader sees a
  //     repeated passage and highlights it twice).
  // Notes and bookmarks do not dedupe (a reader may write the same
  // note on multiple highlights deliberately).
  const groupsByLoc = new Map<string, Clipping[]>()
  const groupsByText = new Map<string, Clipping[]>()
  for (const r of rows) {
    if (r.kind !== "highlight") continue
    if (r.locationStart != null) {
      const key = `${r.bookId}|${r.locationStart}`
      const arr = groupsByLoc.get(key) || []
      arr.push(r)
      groupsByLoc.set(key, arr)
    }
    if (r.text) {
      const norm = normalizeText(r.text)
      if (norm.length >= 20) {
        const key = `${r.bookId}|${norm.slice(0, 80)}`
        const arr = groupsByText.get(key) || []
        arr.push(r)
        groupsByText.set(key, arr)
      }
    }
  }
  const markGroup = (arr: Clipping[]) => {
    if (arr.length < 2) return
    arr.sort((a, b) => (a.tsEpoch ?? 0) - (b.tsEpoch ?? 0))
    const canonical = arr[0]
    for (let i = 1; i < arr.length; i++) {
      if (!arr[i].duplicateOf) arr[i].duplicateOf = canonical.id
    }
  }
  for (const arr of groupsByLoc.values()) markGroup(arr)
  for (const arr of groupsByText.values()) markGroup(arr)
}

function markNotesAttached(rows: Clipping[]): void {
  // A Note is "attached" to a Highlight when both are in the same
  // book AND at overlapping/adjacent locations AND within ~5 minutes.
  // Kindle records them as separate records, but the reader thinks
  // of them as one annotation.
  const fiveMinMs = 5 * 60 * 1000
  const highlightsByBook = new Map<string, Clipping[]>()
  for (const r of rows) {
    if (r.kind !== "highlight") continue
    const arr = highlightsByBook.get(r.bookId) || []
    arr.push(r)
    highlightsByBook.set(r.bookId, arr)
  }
  for (const r of rows) {
    if (r.kind !== "note") continue
    const candidates = highlightsByBook.get(r.bookId) || []
    let bestId: string | null = null
    let bestDist = Number.POSITIVE_INFINITY
    for (const h of candidates) {
      if (h.locationStart == null || r.locationStart == null) continue
      const locDist = Math.abs(h.locationStart - r.locationStart)
      const timeDist = h.tsEpoch != null && r.tsEpoch != null ? Math.abs(h.tsEpoch - r.tsEpoch) : 0
      if (locDist <= 25 && timeDist <= fiveMinMs && locDist < bestDist) {
        bestDist = locDist
        bestId = h.id
      }
    }
    if (bestId) r.noteAttachedTo = bestId
  }
}

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim()
}

interface BookAgg {
  id: string
  title: string
  author: string | null
  highlightCount: number
  noteCount: number
  bookmarkCount: number
  firstSeen: string | null
  lastSeen: string | null
  monthlySparkline: Array<{ month: string; count: number }>
  sampleClippingIds: string[]
}

function buildBooks(rows: Clipping[]): BookAgg[] {
  const map = new Map<string, BookAgg & { _months: Map<string, number>; _seen: number }>()
  for (const r of rows) {
    if (r.duplicateOf) continue
    const cur = map.get(r.bookId) || {
      id: r.bookId,
      title: r.title,
      author: r.author,
      highlightCount: 0,
      noteCount: 0,
      bookmarkCount: 0,
      firstSeen: null,
      lastSeen: null,
      monthlySparkline: [],
      sampleClippingIds: [],
      _months: new Map<string, number>(),
      _seen: 0,
    }
    if (r.kind === "highlight") cur.highlightCount += 1
    else if (r.kind === "note") cur.noteCount += 1
    else if (r.kind === "bookmark") cur.bookmarkCount += 1
    if (r.date) {
      if (!cur.firstSeen || r.date < cur.firstSeen) cur.firstSeen = r.date
      if (!cur.lastSeen || r.date > cur.lastSeen) cur.lastSeen = r.date
      const month = r.date.slice(0, 7)
      cur._months.set(month, (cur._months.get(month) || 0) + 1)
    }
    if (cur._seen < 5) {
      cur.sampleClippingIds.push(r.id)
      cur._seen += 1
    }
    map.set(r.bookId, cur)
  }
  return Array.from(map.values())
    .map(b => ({
      id: b.id,
      title: b.title,
      author: b.author,
      highlightCount: b.highlightCount,
      noteCount: b.noteCount,
      bookmarkCount: b.bookmarkCount,
      firstSeen: b.firstSeen,
      lastSeen: b.lastSeen,
      monthlySparkline: Array.from(b._months.entries())
        .map(([month, count]) => ({ month, count }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      sampleClippingIds: b.sampleClippingIds,
    }))
    .sort((a, b) =>
      (b.highlightCount + b.noteCount + b.bookmarkCount) -
      (a.highlightCount + a.noteCount + a.bookmarkCount)
    )
}

interface AuthorAgg { name: string; bookCount: number; clippingCount: number; share: number }

function buildAuthors(books: BookAgg[], rows: Clipping[]): AuthorAgg[] {
  const total = rows.filter(r => !r.duplicateOf).length || 1
  const map = new Map<string, { books: Set<string>; clippings: number }>()
  for (const r of rows) {
    if (r.duplicateOf) continue
    if (!r.author) continue
    const cur = map.get(r.author) || { books: new Set<string>(), clippings: 0 }
    cur.books.add(r.bookId)
    cur.clippings += 1
    map.set(r.author, cur)
  }
  return Array.from(map.entries())
    .map(([name, v]) => ({
      name,
      bookCount: v.books.size,
      clippingCount: v.clippings,
      share: v.clippings / total,
    }))
    .sort((a, b) => b.clippingCount - a.clippingCount)
}

interface YearTotal { year: string; highlights: number; notes: number; bookmarks: number }

function buildYearTotals(rows: Clipping[]): YearTotal[] {
  const map = new Map<string, YearTotal>()
  for (const r of rows) {
    if (r.duplicateOf) continue
    if (!r.date) continue
    const year = r.date.slice(0, 4)
    const cur = map.get(year) || { year, highlights: 0, notes: 0, bookmarks: 0 }
    if (r.kind === "highlight") cur.highlights += 1
    else if (r.kind === "note") cur.notes += 1
    else cur.bookmarks += 1
    map.set(year, cur)
  }
  return Array.from(map.values()).sort((a, b) => a.year.localeCompare(b.year))
}

interface MonthTotal { month: string; highlights: number; notes: number; bookmarks: number }

function buildMonthTotals(rows: Clipping[]): MonthTotal[] {
  const map = new Map<string, MonthTotal>()
  for (const r of rows) {
    if (r.duplicateOf) continue
    if (!r.date) continue
    const month = r.date.slice(0, 7)
    const cur = map.get(month) || { month, highlights: 0, notes: 0, bookmarks: 0 }
    if (r.kind === "highlight") cur.highlights += 1
    else if (r.kind === "note") cur.notes += 1
    else cur.bookmarks += 1
    map.set(month, cur)
  }
  // Fill empty months between min and max so the sparkline doesn't lie.
  const sorted = Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month))
  if (sorted.length < 2) return sorted
  const filled: MonthTotal[] = []
  const first = sorted[0].month
  const last = sorted[sorted.length - 1].month
  let [yStr, mStr] = first.split("-")
  let y = parseInt(yStr, 10)
  let m = parseInt(mStr, 10)
  const [endYStr, endMStr] = last.split("-")
  const endY = parseInt(endYStr, 10)
  const endM = parseInt(endMStr, 10)
  while (y < endY || (y === endY && m <= endM)) {
    const key = `${y}-${pad(m)}`
    filled.push(map.get(key) || { month: key, highlights: 0, notes: 0, bookmarks: 0 })
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return filled
}

function buildHourCounts(rows: Clipping[]): number[] {
  const out = new Array(24).fill(0)
  for (const r of rows) {
    if (r.duplicateOf) continue
    if (!r.time) continue
    const h = parseInt(r.time.slice(0, 2), 10)
    if (Number.isFinite(h) && h >= 0 && h <= 23) out[h] += 1
  }
  return out
}

interface ThemeCluster {
  key: string
  keyword: string
  count: number
  bookIds: string[]
  sampleClippingIds: string[]
}

const THEME_STOPWORDS = new Set("the and for with that this from your you not are was were have has but they them their there here what when where which while into upon over under just like also some many much even ever very onto onto only after before between because while their about because itself within such still then than would could should might must thing things people would been being".split(" "))

function buildThemeClusters(rows: Clipping[]): ThemeCluster[] {
  // Coarse keyword roll-up. Only Latin-script highlights contribute to
  // cluster keywords; non-Latin clippings still get rendered, just not
  // bucketed by the heuristic.
  const wordCounts = new Map<string, { ids: string[]; books: Set<string> }>()
  for (const r of rows) {
    if (r.duplicateOf) continue
    if (r.kind !== "highlight") continue
    if (r.lang !== "en") continue
    const words = (r.text || "").toLowerCase().match(/[a-z][a-z'-]{4,}/g) || []
    const seen = new Set<string>()
    for (const w of words) {
      const stem = w.replace(/(?:'s|ies|ied|ing|ed|es|s)$/, "")
      if (stem.length < 5) continue
      if (THEME_STOPWORDS.has(stem)) continue
      if (seen.has(stem)) continue
      seen.add(stem)
      const cur = wordCounts.get(stem) || { ids: [], books: new Set<string>() }
      cur.ids.push(r.id)
      cur.books.add(r.bookId)
      wordCounts.set(stem, cur)
    }
  }
  const clusters: ThemeCluster[] = []
  const used = new Set<string>()
  const sortedWords = Array.from(wordCounts.entries())
    .filter(([, v]) => v.ids.length >= 3)
    .sort((a, b) => b[1].ids.length - a[1].ids.length)
  for (const [stem, v] of sortedWords) {
    if (used.has(stem)) continue
    used.add(stem)
    // Pull two co-occurring keywords from the same clippings to enrich
    // the label, but keep counts driven by the lead stem so users
    // understand the membership rule.
    const coLabels = collectCoLabels(stem, v.ids, wordCounts, used, 2)
    for (const c of coLabels) used.add(c)
    clusters.push({
      key: stem,
      keyword: [stem, ...coLabels].join(" · "),
      count: v.ids.length,
      bookIds: Array.from(v.books).slice(0, 6),
      sampleClippingIds: v.ids.slice(0, 6),
    })
    if (clusters.length >= 8) break
  }
  return clusters
}

function collectCoLabels(stem: string, ids: string[], wordCounts: Map<string, { ids: string[]; books: Set<string> }>, used: Set<string>, n: number): string[] {
  const idSet = new Set(ids)
  const scored: Array<{ word: string; overlap: number }> = []
  for (const [other, v] of wordCounts.entries()) {
    if (other === stem || used.has(other)) continue
    if (v.ids.length < 3) continue
    let overlap = 0
    for (const id of v.ids) if (idSet.has(id)) overlap += 1
    if (overlap >= 2) scored.push({ word: other, overlap })
  }
  return scored.sort((a, b) => b.overlap - a.overlap).slice(0, n).map(s => s.word)
}

interface DuplicateGroup { key: string; clippingIds: string[]; canonicalId: string }

function buildDuplicateGroups(rows: Clipping[]): DuplicateGroup[] {
  const groups = new Map<string, DuplicateGroup>()
  for (const r of rows) {
    if (!r.duplicateOf) continue
    const canonical = rows.find(x => x.id === r.duplicateOf)
    if (!canonical) continue
    const key = `${canonical.bookId}:${canonical.locationStart ?? "?"}-${canonical.locationEnd ?? "?"}`
    const cur = groups.get(key) || { key, clippingIds: [canonical.id], canonicalId: canonical.id }
    cur.clippingIds.push(r.id)
    groups.set(key, cur)
  }
  return Array.from(groups.values()).sort((a, b) => b.clippingIds.length - a.clippingIds.length)
}

interface KindleSummary {
  rowCount: number
  bookCount: number
  authorCount: number
  highlightCount: number
  noteCount: number
  bookmarkCount: number
  period: string
  durationLabel: string
  activeMonths: number
  topAuthor: string | null
  topAuthorShare: number
  topBook: string | null
  topBookShare: number
  duplicateGroupCount: number
  notesAttachedCount: number
  bookmarksOnlyBookCount: number
}

function buildSummary(rows: Clipping[], books: BookAgg[], authors: AuthorAgg[]): KindleSummary {
  const visible = rows.filter(r => !r.duplicateOf)
  const total = visible.length || 1
  const highlightCount = visible.filter(r => r.kind === "highlight").length
  const noteCount = visible.filter(r => r.kind === "note").length
  const bookmarkCount = visible.filter(r => r.kind === "bookmark").length
  const dates = visible.map(r => r.date).filter((d): d is string => !!d).sort()
  const period = dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : "no dated clippings"
  const durationLabel = dates.length ? describeDuration(dates[0], dates[dates.length - 1]) : "—"
  const activeMonths = new Set(visible.map(r => r.date?.slice(0, 7)).filter(Boolean)).size
  const topAuthor = authors[0] || null
  const topBook = books[0] || null
  const bookmarksOnlyBookCount = books.filter(b => b.highlightCount === 0 && b.noteCount === 0 && b.bookmarkCount > 0).length
  return {
    rowCount: visible.length,
    bookCount: books.length,
    authorCount: authors.length,
    highlightCount,
    noteCount,
    bookmarkCount,
    period,
    durationLabel,
    activeMonths,
    topAuthor: topAuthor?.name ?? null,
    topAuthorShare: topAuthor ? topAuthor.clippingCount / total : 0,
    topBook: topBook?.title ?? null,
    topBookShare: topBook ? (topBook.highlightCount + topBook.noteCount + topBook.bookmarkCount) / total : 0,
    duplicateGroupCount: buildDuplicateGroups(rows).length,
    notesAttachedCount: visible.filter(r => r.noteAttachedTo).length,
    bookmarksOnlyBookCount,
  }
}

function describeRange(rows: Clipping[]): string {
  const dates = rows.filter(r => !r.duplicateOf).map(r => r.date).filter((d): d is string => !!d).sort()
  if (!dates.length) return "no dated clippings"
  return `${dates[0]} → ${dates[dates.length - 1]}`
}

function describeDuration(a: string, b: string): string {
  const start = new Date(a)
  const end = new Date(b)
  const totalMonths = Math.max(0, (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth()))
  if (totalMonths < 1) return "less than a month"
  if (totalMonths < 12) return `${totalMonths} month${totalMonths === 1 ? "" : "s"}`
  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  if (months === 0) return `${years} year${years === 1 ? "" : "s"}`
  return `${years} year${years === 1 ? "" : "s"} ${months} month${months === 1 ? "" : "s"}`
}

function buildSample(
  rows: Clipping[],
  books: BookAgg[],
  authors: AuthorAgg[],
  themes: ThemeCluster[],
  yearTotals: YearTotal[],
  monthTotals: MonthTotal[],
  summary: KindleSummary,
): Record<string, unknown> {
  // Show enough for the LLM to pick a layout but stay under the
  // ~16K-char sample budget.
  const head = rows.slice(0, 16).map(stripBigFields)
  const tail = rows.length > 24 ? rows.slice(-6).map(stripBigFields) : []
  return {
    summary,
    sampleClippings: [...head, ...tail],
    books: books.slice(0, 16),
    authors: authors.slice(0, 12),
    themes: themes.slice(0, 8),
    yearTotals,
    monthTotalsTail: monthTotals.slice(-18),
  }
}

function stripBigFields(c: Clipping): Partial<Clipping> {
  const { raw, ...rest } = c
  return { ...rest, text: c.text.length > 320 ? `${c.text.slice(0, 320)}…` : c.text }
}
