/**
 * Social-payments parser — Venmo and PayPal consumer activity exports.
 *
 * The interesting story is the **human layer of money**: who you keep
 * reimbursing, which trips and households create money loops, what the
 * notes say (rent / pizza / 🎁), who you net pay vs net receive over
 * time. Bank statements show merchants; Venmo/PayPal show people.
 *
 * Detection sniffs the CSV header for the source-specific signature.
 * Venmo: leading metadata rows + "Username, ID, Datetime, Type,
 * Status, Note, From, To, Amount (total), Funding Source, …".
 * PayPal: "Date, Time, Time Zone, Name, Type, Status, Currency,
 * Amount, …, From Email Address, To Email Address, Transaction ID, …".
 *
 * Output `contentType` is `venmo-paypal-payments` so htmlize loads the
 * `prompts/sources/_finance.md` family contract plus `prompts/sources/venmo-paypal-payments.md`.
 *
 * Privacy: every example shipped with this repo is fully synthetic.
 * The parser never fetches anything; it only normalizes the rows the
 * user already opened locally.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Parser, ParsedFile } from "../types.js"

// ---------------------------------------------------------------------------
// Public types (also drive the data shape consumed by the renderer)
// ---------------------------------------------------------------------------

export type SocialPaymentSource = "venmo" | "paypal"

export interface SocialTxn {
  id: string
  source: SocialPaymentSource
  date: string                 // YYYY-MM-DD
  dateEpoch: number
  amount: number               // signed: negative = sent / outflow, positive = received / inflow
  fee: number                  // signed: typically negative (fee charged) or 0
  currency: string
  type: string                 // raw Venmo "Type" or PayPal "Type" (Payment / Charge / Transfer / etc.)
  direction: "sent" | "received" | "internal" | "fee"
  status: string               // Complete / Pending / Held / Refunded / etc.
  counterparty: string | null  // The OTHER side of the transaction (never the user)
  counterpartyHandle: string | null
  isUserCounterparty: boolean  // true when this row is a self-transfer / cash-out
  note: string                 // payment note (often emoji / short text)
  story: string                // inferred bucket: rent / food / rides / travel / gifts / subscriptions / marketplace / utilities / other
  storyInferred: boolean       // always true (heuristic)
  fundingSource: string | null
  destination: string | null
  flags: string[]              // refund | fee | held | dispute | round-trip | self-transfer
  raw: Record<string, string>
}

export interface CounterpartySummary {
  name: string
  paid: number                 // total sent TO them (absolute)
  received: number             // total received FROM them (absolute)
  net: number                  // received - paid (positive = they owe you over the window net)
  count: number
  firstSeen: string
  lastSeen: string
  story: string                // dominant story bucket
  loopHint: boolean            // both directions present
}

export interface StoryBucket {
  story: string
  paid: number                 // total sent under this story
  received: number             // total received under this story
  net: number
  count: number
  share: number                // % of activity (in + out absolute)
  sampleNotes: string[]        // up to 3 example notes
}

export interface MonthlyCashflow {
  month: string                // YYYY-MM
  sent: number                 // absolute outflow
  received: number             // absolute inflow
  net: number                  // received - sent
  count: number
}

export interface LoopOrFlag {
  kind: "round-trip" | "refund" | "fee" | "held" | "dispute" | "self-transfer" | "split-batch"
  label: string
  detail: string
  rowIds: string[]
}

const STORY_KEYWORDS: Array<[RegExp, string]> = [
  // Order matters — most specific first.
  [/\b(rent|landlord|lease|sublet|deposit)\b/i, "rent"],
  [/\b(uber|lyft|ride|cab|taxi|toll|parking|car ?pool|carpool)\b/i, "rides"],
  [/\b(wifi split|internet split|electric split|water split|gas split|utilities split|electric bill|gas bill|water bill|wifi|internet|comcast|xfinity|spectrum|att|t[-\s]?mobile|verizon)\b/i, "utilities"],
  [/\b(flight|airbnb|hotel|hostel|trip|vacay|vacation|getaway|train ticket|amtrak|airfare|airbnb split|hotel split)\b/i, "travel"],
  [/\b(dinner|lunch|brunch|breakfast|pizza|sushi|tacos?|ramen|burger|pho|food|takeout|takeaway|grocery|groceries|restaurant|bar tab|drinks)\b/i, "food"],
  [/\b(gift|birthday|wedding|graduation|baby shower|anniversary|present|🎁|🎂|💐)\b/i, "gifts"],
  [/\b(spotify|netflix|hulu|hbo|max|disney|youtube premium|premium|subscription|sub|monthly fee|family plan|patreon|substack|nyt|new york times|wsj)\b/i, "subscriptions"],
  [/\b(refund|reimburs(e|ement)|paid back|paying back|pay back|venmo back|owe|owed|i owe you|iou|reimburse|repay)\b/i, "reimbursement"],
  [/\b(marketplace|sale|sold|buying|purchase|fb marketplace|craigslist|depop|poshmark|ebay|etsy)\b/i, "marketplace"],
  [/\b(coffee|cafe|matcha|latte|espresso|bagel|donut)\b/i, "food"],
  [/\b(gas|fuel|⛽)\b/i, "rides"],
  [/\b(cash out|transfer to bank|transfer to checking|to checking|withdraw)\b/i, "cash-out"],
]

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export const parser: Parser = {
  name: "social-payments",
  matches: [".csv"],
  async detect(filepath: string): Promise<boolean> {
    const base = path.basename(filepath).toLowerCase()
    if (/venmo|paypal|p2p[-_ ]?activity|peer[-_ ]?to[-_ ]?peer/i.test(base)) {
      try {
        const head = await readHead(filepath, 16384)
        return looksLikeVenmo(head) || looksLikePayPal(head)
      } catch { return false }
    }
    try {
      const head = await readHead(filepath, 16384)
      return looksLikeVenmo(head) || looksLikePayPal(head)
    } catch { return false }
  },
  async parse(filepath: string): Promise<ParsedFile> {
    const raw = await fs.readFile(filepath, "utf8")
    const head = raw.slice(0, 16384)
    const source: SocialPaymentSource = looksLikeVenmo(head) ? "venmo" : "paypal"
    const sizeBytes = Buffer.byteLength(raw, "utf8")
    const meta0 = {
      sourceFile: path.basename(filepath),
      sizeBytes,
    }
    const txns = source === "venmo" ? parseVenmo(raw) : parsePayPal(raw)
    txns.sort((a, b) => a.dateEpoch - b.dateEpoch || a.id.localeCompare(b.id))

    const summary = aggregateSummary(txns, source)
    const counterparties = aggregateCounterparties(txns)
    const stories = aggregateStories(txns)
    const monthlyCashflow = aggregateMonthly(txns)
    const recurring = detectRecurring(txns)
    const flags = detectFlags(txns)

    // Tag rows so the drill-down can show badges.
    for (const f of flags) {
      for (const id of f.rowIds) {
        const t = txns.find(t => t.id === id)
        if (t && !t.flags.includes(f.kind)) t.flags.push(f.kind)
      }
    }

    const meta = {
      ...meta0,
      shape: "venmo-paypal-payments",
      source,
      rowCount: txns.length,
      currencyCode: summary.currencyCode,
      currencySymbol: summary.currencySymbol,
      period: summary.period,
      durationLabel: summary.durationLabel,
      distinctCounterparties: summary.distinctCounterparties,
      sentTotal: summary.sentTotal,
      receivedTotal: summary.receivedTotal,
      net: summary.net,
    }

    const sample = {
      ...meta,
      summary,
      countersTop: counterparties.slice(0, 8),
      storiesTop: stories.slice(0, 6),
      monthlyPreview: monthlyCashflow.slice(0, 12),
      recurring: recurring.slice(0, 6),
      flagsTop: flags.slice(0, 8),
      firstRows: txns.slice(0, 8).map(stripBigRow),
      lastRows: txns.slice(-3).map(stripBigRow),
    }

    return {
      contentType: "venmo-paypal-payments",
      summary: buildSummaryLine(summary, source),
      sample,
      data: {
        format: "venmo-paypal-payments",
        source,
        rows: txns,
        summary,
        counterparties,
        stories,
        monthlyCashflow,
        recurring,
        flags,
        meta,
      },
      meta,
    }
  },
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

function looksLikeVenmo(head: string): boolean {
  // Venmo CSVs ship with an "Account Statement" preamble row, then the
  // canonical header row. Look for the unmistakable Venmo column trio:
  // From + To + (Amount (total) | Funding Source | Beginning Balance).
  const lower = head.toLowerCase()
  if (!/venmo|"id"\s*,\s*"datetime"|account statement/i.test(lower)) {
    if (!/from\s*,\s*to\s*,\s*amount\s*\(\s*total/i.test(lower)) return false
  }
  if (/from\s*,\s*to\s*,\s*amount\s*\(\s*total/i.test(lower)) return true
  if (/funding source\s*,\s*destination/i.test(lower)) return true
  return /\bvenmo\b/i.test(lower)
}

function looksLikePayPal(head: string): boolean {
  const lower = head.toLowerCase()
  // PayPal activity CSVs have a stable opening header row.
  if (/^"?date"?\s*,\s*"?time"?\s*,\s*"?time zone"?/i.test(head.split(/\r?\n/, 1)[0] || "")) return true
  if (/from email address\s*,\s*to email address/i.test(lower)) return true
  if (/transaction id/i.test(lower) && /receipt id/i.test(lower) && /balance/i.test(lower)) return true
  return false
}

// ---------------------------------------------------------------------------
// CSV plumbing
// ---------------------------------------------------------------------------

async function readHead(filepath: string, n: number): Promise<string> {
  const fh = await fs.open(filepath, "r")
  try {
    const buf = Buffer.alloc(n)
    const { bytesRead } = await fh.read(buf, 0, n, 0)
    return buf.slice(0, bytesRead).toString("utf8")
  } finally {
    await fh.close()
  }
}

function parseCsv(raw: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let i = 0
  let inQuotes = false
  while (i < raw.length) {
    const ch = raw[i]
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++
      } else { field += ch; i++ }
    } else {
      if (ch === '"') { inQuotes = true; i++; continue }
      if (ch === ",") { row.push(field); field = ""; i++; continue }
      if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue }
      if (ch === "\r") { i++; continue }
      field += ch; i++
    }
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

function findHeaderRow(rows: string[][], required: RegExp[]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const line = rows[i].map(c => (c || "").trim().toLowerCase())
    if (required.every(re => line.some(c => re.test(c)))) return i
  }
  return -1
}

function buildIndexer(headers: string[]): (...names: string[]) => number {
  const lower = headers.map(h => (h || "").trim().toLowerCase())
  return (...names: string[]) => {
    for (const n of names) {
      const idx = lower.indexOf(n.toLowerCase())
      if (idx >= 0) return idx
    }
    return -1
  }
}

function get(r: string[], idx: number): string {
  return idx >= 0 ? (r[idx] || "").trim() : ""
}

// ---------------------------------------------------------------------------
// Venmo
// ---------------------------------------------------------------------------

function parseVenmo(raw: string): SocialTxn[] {
  const rows = parseCsv(raw)
  const headerIdx = findHeaderRow(rows, [/^id$/, /^datetime$/, /^amount\s*\(\s*total\s*\)$/])
  if (headerIdx < 0) return []
  const headers = rows[headerIdx]
  const cx = buildIndexer(headers)
  const colId = cx("id")
  const colDatetime = cx("datetime")
  const colType = cx("type")
  const colStatus = cx("status")
  const colNote = cx("note")
  const colFrom = cx("from")
  const colTo = cx("to")
  const colAmount = cx("amount (total)", "amount(total)")
  const colTip = cx("amount (tip)")
  const colTax = cx("amount (tax)")
  const colFee = cx("amount (fee)")
  const colFundingSource = cx("funding source")
  const colDestination = cx("destination")
  const colBegBal = cx("beginning balance")
  const colEndBal = cx("ending balance")

  const usernameIdx = headers.findIndex(h => /username/i.test(h || ""))
  const username = inferUsername(rows, usernameIdx, colFrom, colTo)

  const out: SocialTxn[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.every(c => !c || !c.trim())) continue
    const id = get(r, colId) || `vm_${(i).toString().padStart(6, "0")}`
    const datetime = get(r, colDatetime)
    const dateEpoch = parseDate(datetime)
    if (!dateEpoch && !get(r, colAmount)) continue
    const date = dateEpoch ? formatDate(dateEpoch) : datetime.slice(0, 10)
    const amount = parseAmount(get(r, colAmount))
    if (!Number.isFinite(amount)) continue
    if (!datetime && !amount) continue
    const fee = parseAmount(get(r, colFee))
    const type = get(r, colType) || "Payment"
    const status = get(r, colStatus) || "Complete"
    const note = get(r, colNote)
    const from = get(r, colFrom)
    const to = get(r, colTo)
    const fundingSource = get(r, colFundingSource) || null
    const destination = get(r, colDestination) || null

    const direction = classifyVenmoDirection({ amount, type, from, to, username, fundingSource, destination })
    const counterparty = pickCounterparty({ from, to, username, direction })
    const counterpartyHandle = null
    const story = inferStory(note, type, fundingSource, destination)
    const flags: string[] = []
    if (/refund/i.test(type)) flags.push("refund")
    if (/fee/i.test(type) || Math.abs(fee) > 0) flags.push("fee")
    if (/held|on hold|review/i.test(status)) flags.push("held")
    if (/dispute/i.test(type) || /dispute/i.test(status)) flags.push("dispute")
    if (direction === "internal") flags.push("self-transfer")

    const rawObj: Record<string, string> = {}
    for (let j = 0; j < headers.length && j < r.length; j++) {
      const k = (headers[j] || `col_${j}`).trim() || `col_${j}`
      rawObj[k] = (r[j] || "").trim()
    }

    out.push({
      id: `vm_${(i).toString().padStart(6, "0")}`,
      source: "venmo",
      date,
      dateEpoch,
      amount,
      fee,
      currency: "USD",
      type,
      direction,
      status,
      counterparty,
      counterpartyHandle,
      isUserCounterparty: !counterparty,
      note,
      story: story.bucket,
      storyInferred: story.inferred,
      fundingSource,
      destination,
      flags,
      raw: rawObj,
    })
    void colTip; void colTax; void colBegBal; void colEndBal
  }
  return out
}

function inferUsername(rows: string[][], usernameIdx: number, colFrom: number, colTo: number): string {
  if (usernameIdx >= 0) {
    for (const r of rows) {
      const v = (r[usernameIdx] || "").trim()
      if (v && !/^username$/i.test(v)) return v
    }
  }
  // Fallback: look for the most-frequent "self" name across From/To.
  const counts: Record<string, number> = {}
  for (const r of rows) {
    for (const idx of [colFrom, colTo]) {
      const v = (r[idx] || "").trim()
      if (v && v.length < 60) counts[v] = (counts[v] || 0) + 1
    }
  }
  let best = ""
  let bestCount = 0
  for (const [name, count] of Object.entries(counts)) {
    if (count > bestCount) { best = name; bestCount = count }
  }
  return best
}

function classifyVenmoDirection(opts: {
  amount: number
  type: string
  from: string
  to: string
  username: string
  fundingSource: string | null
  destination: string | null
}): SocialTxn["direction"] {
  const t = (opts.type || "").toLowerCase()
  if (/transfer|standard transfer|instant transfer|cash[-\s]?out|withdraw/.test(t)) return "internal"
  if (/^fee/.test(t)) return "fee"
  if (opts.username && opts.from && opts.to) {
    if (sameName(opts.from, opts.username) && !sameName(opts.to, opts.username)) return "sent"
    if (sameName(opts.to, opts.username) && !sameName(opts.from, opts.username)) return "received"
    if (sameName(opts.from, opts.username) && sameName(opts.to, opts.username)) return "internal"
  }
  return opts.amount >= 0 ? "received" : "sent"
}

function pickCounterparty(opts: {
  from: string
  to: string
  username: string
  direction: SocialTxn["direction"]
}): string | null {
  if (opts.direction === "internal") return null
  if (!opts.username) {
    return opts.direction === "sent" ? (opts.to || null) : (opts.from || null)
  }
  if (opts.direction === "sent") return opts.to || null
  if (opts.direction === "received") return opts.from || null
  return null
}

function sameName(a: string, b: string): boolean {
  if (!a || !b) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

// ---------------------------------------------------------------------------
// PayPal
// ---------------------------------------------------------------------------

function parsePayPal(raw: string): SocialTxn[] {
  const rows = parseCsv(raw)
  const headerIdx = findHeaderRow(rows, [/^date$/, /^name$/, /^amount$/])
  if (headerIdx < 0) return []
  const headers = rows[headerIdx]
  const cx = buildIndexer(headers)
  const colDate = cx("date")
  const colTime = cx("time")
  const colName = cx("name")
  const colType = cx("type")
  const colStatus = cx("status")
  const colCurrency = cx("currency")
  const colAmount = cx("amount", "gross")
  const colFee = cx("fee", "fees")
  const colNet = cx("net")
  const colFromEmail = cx("from email address")
  const colToEmail = cx("to email address")
  const colTransactionId = cx("transaction id")
  const colNote = cx("note", "description", "subject")
  const colItemTitle = cx("item title")

  const out: SocialTxn[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.every(c => !c || !c.trim())) continue
    const dateRaw = get(r, colDate)
    const timeRaw = get(r, colTime)
    const dateEpoch = parseDate(dateRaw + (timeRaw ? " " + timeRaw : ""))
    if (!dateEpoch) continue
    const date = formatDate(dateEpoch)
    const amount = parseAmount(get(r, colAmount))
    if (!Number.isFinite(amount)) continue
    const fee = parseAmount(get(r, colFee))
    const type = get(r, colType) || "Payment"
    const status = get(r, colStatus) || "Completed"
    const counterparty = get(r, colName) || null
    const counterpartyHandle = (get(r, colFromEmail) || get(r, colToEmail) || null)
    const note = get(r, colNote) || get(r, colItemTitle) || ""
    const direction: SocialTxn["direction"] = /(transfer|withdrawal|to bank|reserves|currency conversion)/i.test(type)
      ? "internal"
      : amount < 0 ? "sent" : "received"
    const story = inferStory(note, type, null, null)
    const currency = get(r, colCurrency) || "USD"

    const flags: string[] = []
    if (/refund|reversal/i.test(type) || /reversed|refunded/i.test(status)) flags.push("refund")
    if (/fee/i.test(type) || Math.abs(fee) > 0) flags.push("fee")
    if (/held|hold|pending/i.test(status)) flags.push("held")
    if (/dispute|chargeback/i.test(type) || /dispute|chargeback/i.test(status)) flags.push("dispute")
    if (direction === "internal") flags.push("self-transfer")

    const rawObj: Record<string, string> = {}
    for (let j = 0; j < headers.length && j < r.length; j++) {
      const k = (headers[j] || `col_${j}`).trim() || `col_${j}`
      rawObj[k] = (r[j] || "").trim()
    }

    out.push({
      id: `pp_${(i).toString().padStart(6, "0")}`,
      source: "paypal",
      date,
      dateEpoch,
      amount,
      fee,
      currency,
      type,
      direction,
      status,
      counterparty: direction === "internal" ? null : counterparty,
      counterpartyHandle,
      isUserCounterparty: direction === "internal",
      note,
      story: story.bucket,
      storyInferred: story.inferred,
      fundingSource: null,
      destination: null,
      flags,
      raw: rawObj,
    })
    void colNet; void colTransactionId
  }
  return out
}

// ---------------------------------------------------------------------------
// Story inference
// ---------------------------------------------------------------------------

function inferStory(note: string, type: string, fundingSource: string | null, destination: string | null): { bucket: string; inferred: boolean } {
  const haystack = [note, type, fundingSource || "", destination || ""].join(" ")
  if (!haystack.trim()) return { bucket: "other", inferred: true }
  if (/transfer|cash[-\s]?out|to bank|to checking|withdraw/i.test(type)) return { bucket: "cash-out", inferred: true }
  for (const [re, bucket] of STORY_KEYWORDS) {
    if (re.test(haystack)) return { bucket, inferred: true }
  }
  // Emoji-only notes are common — bucket by emoji family.
  if (/🍕|🍔|🍣|🍜|☕|🥗|🥙/.test(haystack)) return { bucket: "food", inferred: true }
  if (/🎁|🎂|💐/.test(haystack)) return { bucket: "gifts", inferred: true }
  if (/🚗|🚕|🛺|⛽/.test(haystack)) return { bucket: "rides", inferred: true }
  if (/🏠|🏡|🛏️|🪟/.test(haystack)) return { bucket: "rent", inferred: true }
  if (/✈️|🏨|🚆|🛫/.test(haystack)) return { bucket: "travel", inferred: true }
  return { bucket: "other", inferred: true }
}

// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------

interface SocialPaymentSummary {
  rowCount: number
  sentTotal: number            // absolute
  receivedTotal: number        // absolute
  net: number                  // received - sent
  feeTotal: number             // absolute
  refundTotal: number          // absolute
  internalTotal: number        // absolute (cash-outs)
  currencyCode: string
  currencySymbol: string
  period: string
  durationLabel: string
  monthsActive: number
  distinctCounterparties: number
  topCounterparty: string
  topStory: string
  topStoryShare: number
  source: SocialPaymentSource
}

function aggregateSummary(txns: SocialTxn[], source: SocialPaymentSource): SocialPaymentSummary {
  const sent = sum(txns.filter(t => t.direction === "sent").map(t => Math.abs(t.amount)))
  const received = sum(txns.filter(t => t.direction === "received").map(t => Math.abs(t.amount)))
  const internal = sum(txns.filter(t => t.direction === "internal").map(t => Math.abs(t.amount)))
  const feeTotal = sum(txns.map(t => Math.abs(t.fee))) + sum(txns.filter(t => t.direction === "fee").map(t => Math.abs(t.amount)))
  const refundTotal = sum(txns.filter(t => t.flags.includes("refund")).map(t => Math.abs(t.amount)))
  const dated = txns.filter(t => t.dateEpoch > 0)
  const minDate = dated.length ? Math.min(...dated.map(t => t.dateEpoch)) : 0
  const maxDate = dated.length ? Math.max(...dated.map(t => t.dateEpoch)) : 0
  const period = minDate && maxDate ? `${formatDate(minDate)} → ${formatDate(maxDate)}` : "(no dates)"
  const durationLabel = minDate && maxDate ? formatDuration(maxDate - minDate) : "—"
  const monthsActive = new Set(dated.map(t => t.date.slice(0, 7))).size

  const counterMap = new Map<string, { count: number; total: number }>()
  for (const t of txns) {
    if (!t.counterparty) continue
    const cur = counterMap.get(t.counterparty) || { count: 0, total: 0 }
    cur.count++
    cur.total += Math.abs(t.amount)
    counterMap.set(t.counterparty, cur)
  }
  const sortedCps = Array.from(counterMap.entries()).sort((a, b) => b[1].total - a[1].total)
  const topCounterparty = sortedCps[0]?.[0] || "—"

  const storyMap = new Map<string, number>()
  for (const t of txns) {
    if (t.direction === "internal" || t.direction === "fee") continue
    storyMap.set(t.story, (storyMap.get(t.story) || 0) + Math.abs(t.amount))
  }
  const totalStoryAbs = Array.from(storyMap.values()).reduce((a, b) => a + b, 0) || 1
  const sortedStories = Array.from(storyMap.entries()).sort((a, b) => b[1] - a[1])
  const topStory = sortedStories[0]?.[0] || "other"
  const topStoryShare = sortedStories[0]?.[1] ? round1((sortedStories[0][1] / totalStoryAbs) * 100) : 0

  const currencyCode = txns.find(t => t.currency)?.currency || "USD"
  const currencySymbol = currencySymbolFor(currencyCode)

  return {
    rowCount: txns.length,
    sentTotal: round2(sent),
    receivedTotal: round2(received),
    net: round2(received - sent),
    feeTotal: round2(feeTotal),
    refundTotal: round2(refundTotal),
    internalTotal: round2(internal),
    currencyCode,
    currencySymbol,
    period,
    durationLabel,
    monthsActive,
    distinctCounterparties: counterMap.size,
    topCounterparty,
    topStory,
    topStoryShare,
    source,
  }
}

function aggregateCounterparties(txns: SocialTxn[]): CounterpartySummary[] {
  const map = new Map<string, {
    paid: number; received: number; count: number;
    first: number; last: number;
    storyCounts: Record<string, number>;
    sent: number; recvd: number;
  }>()
  for (const t of txns) {
    if (!t.counterparty) continue
    const cur = map.get(t.counterparty) || { paid: 0, received: 0, count: 0, first: 0, last: 0, storyCounts: {}, sent: 0, recvd: 0 }
    if (t.direction === "sent") { cur.paid += Math.abs(t.amount); cur.sent++ }
    else if (t.direction === "received") { cur.received += Math.abs(t.amount); cur.recvd++ }
    cur.count++
    if (!cur.first || (t.dateEpoch && t.dateEpoch < cur.first)) cur.first = t.dateEpoch
    if (t.dateEpoch && t.dateEpoch > cur.last) cur.last = t.dateEpoch
    cur.storyCounts[t.story] = (cur.storyCounts[t.story] || 0) + 1
    map.set(t.counterparty, cur)
  }
  return Array.from(map.entries())
    .map(([name, v]) => {
      const dominantStory = Object.entries(v.storyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "other"
      return {
        name,
        paid: round2(v.paid),
        received: round2(v.received),
        net: round2(v.received - v.paid),
        count: v.count,
        firstSeen: v.first ? formatDate(v.first) : "",
        lastSeen: v.last ? formatDate(v.last) : "",
        story: dominantStory,
        loopHint: v.sent > 0 && v.recvd > 0,
      }
    })
    .sort((a, b) => (b.paid + b.received) - (a.paid + a.received))
}

function aggregateStories(txns: SocialTxn[]): StoryBucket[] {
  const map = new Map<string, { paid: number; received: number; count: number; notes: Set<string> }>()
  let totalAbs = 0
  for (const t of txns) {
    if (t.direction === "internal" || t.direction === "fee") continue
    const cur = map.get(t.story) || { paid: 0, received: 0, count: 0, notes: new Set<string>() }
    if (t.direction === "sent") cur.paid += Math.abs(t.amount)
    else cur.received += Math.abs(t.amount)
    cur.count++
    if (t.note && cur.notes.size < 4 && t.note.length <= 60) cur.notes.add(t.note)
    map.set(t.story, cur)
    totalAbs += Math.abs(t.amount)
  }
  const denom = totalAbs || 1
  return Array.from(map.entries())
    .map(([story, v]) => ({
      story,
      paid: round2(v.paid),
      received: round2(v.received),
      net: round2(v.received - v.paid),
      count: v.count,
      share: round1(((v.paid + v.received) / denom) * 100),
      sampleNotes: Array.from(v.notes).slice(0, 3),
    }))
    .sort((a, b) => (b.paid + b.received) - (a.paid + a.received))
}

function aggregateMonthly(txns: SocialTxn[]): MonthlyCashflow[] {
  const map = new Map<string, { sent: number; received: number; count: number }>()
  for (const t of txns) {
    if (!t.date) continue
    const month = t.date.slice(0, 7)
    const cur = map.get(month) || { sent: 0, received: 0, count: 0 }
    if (t.direction === "sent") cur.sent += Math.abs(t.amount)
    else if (t.direction === "received") cur.received += Math.abs(t.amount)
    cur.count++
    map.set(month, cur)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      sent: round2(v.sent),
      received: round2(v.received),
      net: round2(v.received - v.sent),
      count: v.count,
    }))
}

function detectRecurring(txns: SocialTxn[]): Array<{ name: string; cadence: string; avgAmount: number; count: number; lastSeen: string; story: string }> {
  // Group by counterparty + direction + rounded amount.
  const groups = new Map<string, SocialTxn[]>()
  for (const t of txns) {
    if (!t.counterparty || t.direction === "internal" || t.direction === "fee") continue
    const key = `${t.counterparty}|${t.direction}|${Math.round(Math.abs(t.amount))}`
    const arr = groups.get(key) || []
    arr.push(t)
    groups.set(key, arr)
  }
  const out: Array<{ name: string; cadence: string; avgAmount: number; count: number; lastSeen: string; story: string }> = []
  for (const arr of groups.values()) {
    if (arr.length < 3) continue
    const dated = arr.filter(t => t.dateEpoch > 0).sort((a, b) => a.dateEpoch - b.dateEpoch)
    if (dated.length < 3) continue
    const gaps: number[] = []
    for (let i = 1; i < dated.length; i++) gaps.push((dated[i].dateEpoch - dated[i - 1].dateEpoch) / 86400000)
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length
    const cadence = avgGap < 9 ? "weekly" : avgGap < 18 ? "biweekly" : avgGap < 35 ? "monthly" : avgGap < 100 ? "quarterly" : "irregular"
    const dir = dated[0].direction === "sent" ? "you sent" : "you received"
    const avgAmount = Math.round(arr.reduce((a, b) => a + Math.abs(b.amount), 0) / arr.length * 100) / 100
    out.push({
      name: `${dir} ${dated[0].counterparty}`,
      cadence,
      avgAmount,
      count: arr.length,
      lastSeen: dated[dated.length - 1].date,
      story: dated[0].story,
    })
  }
  return out.sort((a, b) => b.avgAmount * b.count - a.avgAmount * a.count).slice(0, 10)
}

function detectFlags(txns: SocialTxn[]): LoopOrFlag[] {
  const flags: LoopOrFlag[] = []

  // Round-trip / split-batch: sent X to A and received roughly the same
  // back from A within 14 days. Strong signal of a split-the-bill loop.
  const byCounterparty = new Map<string, SocialTxn[]>()
  for (const t of txns) {
    if (!t.counterparty) continue
    const arr = byCounterparty.get(t.counterparty) || []
    arr.push(t)
    byCounterparty.set(t.counterparty, arr)
  }
  for (const [name, arr] of byCounterparty) {
    arr.sort((a, b) => a.dateEpoch - b.dateEpoch)
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i]
        const b = arr[j]
        if (a.direction === b.direction) continue
        if (b.dateEpoch - a.dateEpoch > 14 * 86400000) break
        const ratio = Math.abs(a.amount) / Math.max(Math.abs(b.amount), 0.01)
        if (ratio < 0.6 || ratio > 1.7) continue
        flags.push({
          kind: "round-trip",
          label: `Round-trip with ${name}`,
          detail: `${formatMoney(Math.abs(a.amount))} ${a.direction} on ${a.date}, then ${formatMoney(Math.abs(b.amount))} ${b.direction} on ${b.date}`,
          rowIds: [a.id, b.id],
        })
        if (flags.filter(f => f.kind === "round-trip").length >= 3) break
        break
      }
      if (flags.filter(f => f.kind === "round-trip").length >= 3) break
    }
    if (flags.filter(f => f.kind === "round-trip").length >= 3) break
  }

  // Refunds.
  for (const t of txns) {
    if (t.flags.includes("refund")) {
      flags.push({
        kind: "refund",
        label: `Refund: ${t.counterparty || t.note || t.type}`,
        detail: `${formatMoney(Math.abs(t.amount))} on ${t.date} — status ${t.status || "—"}`,
        rowIds: [t.id],
      })
      if (flags.filter(f => f.kind === "refund").length >= 3) break
    }
  }
  // Held / disputes.
  for (const t of txns) {
    if (t.flags.includes("held")) {
      flags.push({
        kind: "held",
        label: `Held / pending: ${t.counterparty || t.note || t.type}`,
        detail: `${formatMoney(Math.abs(t.amount))} on ${t.date} — ${t.status}`,
        rowIds: [t.id],
      })
      if (flags.filter(f => f.kind === "held").length >= 2) break
    }
  }
  for (const t of txns) {
    if (t.flags.includes("dispute")) {
      flags.push({
        kind: "dispute",
        label: `Dispute / chargeback: ${t.counterparty || t.note || t.type}`,
        detail: `${formatMoney(Math.abs(t.amount))} on ${t.date} — ${t.status}`,
        rowIds: [t.id],
      })
      if (flags.filter(f => f.kind === "dispute").length >= 2) break
    }
  }
  // Fees aggregate.
  const feeRows = txns.filter(t => Math.abs(t.fee) > 0 || t.direction === "fee")
  if (feeRows.length > 0) {
    const total = sum(feeRows.map(t => Math.abs(t.fee || t.amount)))
    flags.push({
      kind: "fee",
      label: `${feeRows.length} fee${feeRows.length === 1 ? "" : "s"}`,
      detail: `${formatMoney(total)} in transfer/instant fees across ${feeRows.length} rows`,
      rowIds: feeRows.slice(0, 12).map(t => t.id),
    })
  }
  // Self-transfers (cash-outs to bank).
  const selfRows = txns.filter(t => t.direction === "internal")
  if (selfRows.length > 0) {
    flags.push({
      kind: "self-transfer",
      label: `${selfRows.length} cash-out${selfRows.length === 1 ? "" : "s"}`,
      detail: `${formatMoney(sum(selfRows.map(t => Math.abs(t.amount))))} moved to your bank in ${selfRows.length} transfers`,
      rowIds: selfRows.slice(0, 12).map(t => t.id),
    })
  }
  return flags.slice(0, 12)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSummaryLine(s: SocialPaymentSummary, source: SocialPaymentSource): string {
  const fmt = (n: number) => `${s.currencySymbol}${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
  const label = source === "venmo" ? "Venmo" : "PayPal"
  return `${label} activity (${s.rowCount} transactions, ${s.distinctCounterparties} people): ${fmt(s.sentTotal)} sent, ${fmt(s.receivedTotal)} received, net ${s.net < 0 ? "−" : ""}${fmt(s.net)}, ${s.period}.`
}

function stripBigRow(t: SocialTxn): SocialTxn {
  const raw: Record<string, string> = {}
  let count = 0
  for (const [k, v] of Object.entries(t.raw)) {
    if (count >= 8) { raw["…"] = `+${Object.keys(t.raw).length - count} more`; break }
    raw[k] = (v || "").length > 80 ? v.slice(0, 80) + "…" : v
    count++
  }
  return { ...t, raw }
}

function sum(arr: number[]): number {
  let total = 0
  for (const n of arr) total += n
  return total
}
function round2(n: number): number { return Math.round(n * 100) / 100 }
function round1(n: number): number { return Math.round(n * 10) / 10 }

function parseAmount(raw: string): number {
  if (!raw) return 0
  let s = raw.trim()
  if (!s) return 0
  let negative = false
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1) }
  s = s.replace(/[$€£¥₹]/g, "").replace(/\s+/g, "").replace(/,/g, "").replace(/^\+/, "")
  if (s.startsWith("-")) { negative = !negative; s = s.slice(1) }
  // Venmo style: leading sign separated by space, e.g. "+ $100.00" or "- $4.99". Already stripped above.
  const n = parseFloat(s)
  if (!isFinite(n)) return 0
  return negative ? -n : n
}

function parseDate(raw: string): number {
  if (!raw) return 0
  const s = raw.trim()
  if (!s) return 0
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) return Date.UTC(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]))
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s)
  if (us) {
    let y = parseInt(us[3])
    if (y < 100) y += y >= 70 ? 1900 : 2000
    return Date.UTC(y, parseInt(us[1]) - 1, parseInt(us[2]))
  }
  const t = Date.parse(s)
  return isNaN(t) ? 0 : t
}

function formatDate(epoch: number): string {
  if (!epoch) return ""
  const d = new Date(epoch)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "instant"
  const days = Math.floor(ms / 86400000)
  if (days < 1) return "less than a day"
  if (days === 1) return "1 day"
  if (days < 35) return `${days} days`
  const months = Math.round(days / 30)
  if (months === 1) return "1 month"
  if (months < 18) return `${months} months`
  const years = Math.round(days / 365)
  return years === 1 ? "1 year" : `${years} years`
}

function formatMoney(n: number): string {
  return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function currencySymbolFor(code: string): string {
  switch ((code || "").toUpperCase()) {
    case "USD": case "CAD": case "AUD": case "NZD": case "SGD": return "$"
    case "EUR": return "€"
    case "GBP": return "£"
    case "JPY": case "CNY": return "¥"
    case "INR": return "₹"
    case "BRL": return "R$"
    default: return "$"
  }
}
