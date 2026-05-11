/**
 * Finance / admin parser. Single dispatcher for the three finance
 * subtypes:
 *   - bank transaction CSVs (Chase / BofA / generic bank exports)
 *   - credit-card statements
 *   - invoice / receipt exports (accounts-receivable rows)
 *   - QuickBooks / Xero / Wave general-ledger and P&L reports
 *
 * Detection runs the CSV through `detectColumns` + `classifySubtype`
 * to decide whether the file is finance-shaped at all. If yes, the
 * appropriate `contentType` is set so htmlize can pick the right
 * source prompt under the `prompts/sources/_finance.md` family contract.
 *
 * The shared aggregator (`finance-shared.ts`) handles all the common
 * concerns (recurring vendors, duplicates, anomalies, category
 * rollups, timeline). This parser only owns the
 * file → `RawTxn[]` extraction and contentType selection.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Parser, ParsedFile } from "../types.js"
import {
  aggregate,
  buildAccountTree,
  buildTxns,
  classifySubtype,
  detectColumns,
  type RawTxn,
  type FinanceSubtype,
} from "./finance-shared.js"

const SUBTYPE_TO_CONTENT_TYPE: Record<NonNullable<FinanceSubtype>, string> = {
  "bank": "bank-transactions",
  "credit-card": "bank-transactions",
  "invoices": "invoices",
  "quickbooks-gl": "quickbooks-report",
  "quickbooks-pl": "quickbooks-report",
}

export const parser: Parser = {
  name: "finance",
  matches: [".csv", ".tsv"],
  async detect(filepath: string): Promise<boolean> {
    try {
      const raw = await fs.readFile(filepath, "utf8")
      const sep = path.extname(filepath).toLowerCase() === ".tsv" ? "\t" : detectSep(raw)
      const rows = parseCsv(raw, sep, 30)
      if (rows.length < 2) return false
      const headers = rows[0]
      const cols = detectColumns(headers)
      const subtype = classifySubtype(headers, rows.slice(1), cols)
      return subtype !== null
    } catch {
      return false
    }
  },
  async parse(filepath: string): Promise<ParsedFile> {
    const raw = await fs.readFile(filepath, "utf8")
    const sep = path.extname(filepath).toLowerCase() === ".tsv" ? "\t" : detectSep(raw)
    const rows = parseCsv(raw, sep)
    const headers = rows[0] || []
    const dataRows = rows.slice(1)
    const cols = detectColumns(headers)
    const subtype = classifySubtype(headers, dataRows, cols) || "bank"

    const txns: RawTxn[] = buildTxns(headers, dataRows, cols)

    const mode: "bank" | "invoices" | "quickbooks" =
      subtype === "invoices" ? "invoices"
      : subtype === "quickbooks-gl" || subtype === "quickbooks-pl" ? "quickbooks"
      : "bank"

    const agg = aggregate(txns, { mode })
    const contentType = SUBTYPE_TO_CONTENT_TYPE[subtype]

    const accountTree = mode === "quickbooks" ? buildAccountTree(txns) : undefined

    const meta = {
      sourceFile: path.basename(filepath),
      sizeBytes: Buffer.byteLength(raw, "utf8"),
      format: contentType.replace("-report", ""),
      subtype,
      rowCount: txns.length,
      columnCount: headers.length,
      headers,
      detectedColumns: Object.fromEntries(
        Object.entries(cols).filter(([_, v]) => v !== null).map(([k, v]) => [k, headers[v as number]])
      ),
      currencyCode: agg.summary.currencyCode,
      currencySymbol: agg.summary.currencySymbol,
      hasBalance: agg.hasBalance,
      spansMultipleMonths: agg.spansMultipleMonths,
      period: agg.summary.period,
      durationLabel: agg.summary.durationLabel,
      separator: sep === "\t" ? "tab" : sep,
    }

    // Sample shipped to the LLM. Everything large (full rows / timeline /
    // accountTree leaves) goes in `data`, not `sample` — the prompt has
    // a 16K cap and we don't want to burn it on raw rows.
    const sample = {
      ...meta,
      summary: agg.summary,
      categoryTotalsTop: agg.categoryTotals.slice(0, 8),
      recurringTop: agg.recurring.slice(0, 6),
      flagsTop: agg.flags.slice(0, 8),
      topVendorsTop: agg.topVendors.slice(0, 8),
      topCustomersTop: agg.topCustomers?.slice(0, 8),
      aging: agg.aging,
      timelinePreview: previewTimeline(agg.timeline),
      firstRows: txns.slice(0, 8).map(stripBigRow),
      lastRows: txns.slice(-3).map(stripBigRow),
      accountTreeTopLevel: accountTree?.map(n => ({ account: n.account, subtotal: n.subtotal, count: n.count })),
    }

    const summaryLine = buildSummaryLine(agg, mode, contentType, meta.subtype)

    return {
      contentType,
      summary: summaryLine,
      sample,
      data: {
        format: contentType,
        subtype,
        rows: txns,
        ...agg,
        accountTree,
        meta,
      },
      meta,
    }
  },
}

// ---------------------------------------------------------------------------
// Helpers (CSV parsing — same RFC-4180-ish behavior as csv.ts)
// ---------------------------------------------------------------------------

function detectSep(raw: string): string {
  const line = raw.split(/\r?\n/, 1)[0] || ""
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0, "|": 0 }
  for (const ch of line) if (ch in counts) counts[ch]++
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return best && best[1] > 0 ? best[0] : ","
}

function parseCsv(raw: string, sep: string, maxRows = Infinity): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let i = 0
  let inQuotes = false
  while (i < raw.length && rows.length < maxRows) {
    const ch = raw[i]
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false
        i++
      } else { field += ch; i++ }
    } else {
      if (ch === '"') { inQuotes = true; i++; continue }
      if (ch === sep) { row.push(field); field = ""; i++; continue }
      if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue }
      if (ch === "\r") { i++; continue }
      field += ch
      i++
    }
  }
  if ((field !== "" || row.length > 0) && rows.length < maxRows) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function previewTimeline(tl: { date: string; inflow: number; outflow: number; net: number; balance: number | null; count: number }[]) {
  if (tl.length <= 12) return tl
  // Show first 4, last 4, and 4 evenly spaced middle points so the LLM
  // can see the shape without bloating the prompt with months of dailies.
  const first = tl.slice(0, 4)
  const last = tl.slice(-4)
  const middle: typeof tl = []
  const step = Math.floor(tl.length / 5)
  for (let i = 1; i <= 3; i++) {
    const idx = step * (i + 1)
    if (idx > 3 && idx < tl.length - 4) middle.push(tl[idx])
  }
  return [...first, ...middle, ...last]
}

function stripBigRow(t: RawTxn): RawTxn {
  // Keep raw small in the sample.
  const raw: Record<string, string> = {}
  let count = 0
  for (const [k, v] of Object.entries(t.raw)) {
    if (count >= 10) { raw["…"] = `+${Object.keys(t.raw).length - count} more`; break }
    raw[k] = (v || "").length > 80 ? v.slice(0, 80) + "…" : v
    count++
  }
  return { ...t, raw }
}

function buildSummaryLine(agg: ReturnType<typeof aggregate>, mode: "bank" | "invoices" | "quickbooks", contentType: string, subtype: FinanceSubtype): string {
  const cs = agg.summary.currencySymbol
  const fmt = (n: number) => `${cs}${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
  if (mode === "invoices") {
    return `Invoice file (${agg.summary.invoiceCount || 0} invoices, ${agg.summary.customerCount || 0} customers): ${fmt(agg.summary.invoiced || 0)} invoiced, ${fmt(agg.summary.paid || 0)} paid, ${fmt(agg.summary.outstanding || 0)} outstanding (${fmt(agg.summary.overdue || 0)} overdue), ${agg.summary.period}.`
  }
  if (mode === "quickbooks") {
    return `${subtype === "quickbooks-pl" ? "P&L" : "General-ledger"} report (${agg.summary.rowCount} rows): ${fmt(agg.summary.inflow)} in, ${fmt(agg.summary.outflow)} out, net ${agg.summary.net < 0 ? "−" : ""}${fmt(agg.summary.net)}, ${agg.summary.period}.`
  }
  const sub = subtype === "credit-card" ? "Credit-card" : "Bank"
  return `${sub} statement (${agg.summary.rowCount} transactions): ${fmt(agg.summary.inflow)} in, ${fmt(agg.summary.outflow)} out, net ${agg.summary.net < 0 ? "−" : ""}${fmt(agg.summary.net)}, ${agg.summary.distinctMerchants} merchants, ${agg.summary.distinctCategories} categories, ${agg.summary.period}.`
}
