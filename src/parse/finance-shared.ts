/**
 * Shared aggregation for the finance pack (bank-transactions /
 * invoices / quickbooks parsers). They all produce the same `DATA`
 * shape — see prompts/sources/_finance.md for the contract — so column
 * detection, recurring-vendor detection, duplicate detection,
 * anomaly classification, and category rollups live here once.
 *
 * The per-source parsers' job is to read the CSV, decide which
 * subtype it is, and turn each row into a `RawTxn`. This module
 * turns that array into the aggregated arrays the LLM and the
 * rendered page consume.
 */
// ---------------------------------------------------------------------------
// Column detection
// ---------------------------------------------------------------------------

/**
 * Detect which CSV columns map to the canonical finance fields.
 * Returns `null` for fields the file doesn't carry. Callers use this
 * to extract per-row values without hard-coding bank-by-bank schemas.
 *
 * The matchers run in order — the first header that matches a slot
 * wins. Slots are intentionally separate so a file with both
 * `merchant` and `description` columns picks the merchant one for
 * the merchant slot and the description one for the memo slot.
 */
export interface DetectedColumns {
  date: number | null
  amount: number | null               // signed amount (single column)
  debit: number | null                // separate debit column
  credit: number | null               // separate credit column
  merchant: number | null
  description: number | null
  category: number | null
  memo: number | null
  account: number | null
  balance: number | null
  status: number | null
  dueDate: number | null
  issuedDate: number | null
  paidDate: number | null
  customer: number | null
  invoiceNumber: number | null
  classCol: number | null              // QuickBooks class
  type: number | null                  // GL "Type" column (Invoice / Bill / Check / Deposit)
  currency: number | null
}

const HEADER_PATTERNS: Record<keyof DetectedColumns, RegExp[]> = {
  date: [
    /^(transaction|posted|posting|tx|trans|trade|effective|entry)\s*[ _-]?\s*date$/i,
    /^date$/i,
    /^(date posted|date completed|booking date|value date)$/i,
  ],
  amount: [
    /^(amount|amt|value|total|sum|net amount|net|signed amount)$/i,
    /^amount\s*\(usd\)?$/i,
  ],
  debit: [/^(debit|withdrawal|withdrawals|payments|charge|charges|expense|out)$/i],
  credit: [/^(credit|deposit|deposits|received|inflow|in|payments? in)$/i],
  merchant: [/^(merchant|vendor|payee|name|to|from)$/i],
  description: [/^(description|details|narration|narrative|particulars|reference)$/i],
  category: [/^(category|cat|expense category|spending category|classification)$/i],
  memo: [/^(memo|notes?|note|comment|comments)$/i],
  account: [/^(account|account name|account #|account number|gl account)$/i],
  balance: [/^(balance|running balance|ending balance|account balance)$/i],
  status: [/^(status|payment status|invoice status|state)$/i],
  dueDate: [/^(due date|date due|due)$/i],
  issuedDate: [/^(issued|issue date|invoice date|created|created at|date issued|bill date)$/i],
  paidDate: [/^(paid|paid date|date paid|payment date|settled|cleared)$/i],
  customer: [/^(customer|client|bill to|bill_to|company|account name)$/i],
  invoiceNumber: [/^(invoice|invoice ?#|invoice number|invoice no\.?|inv|inv #|reference|ref)$/i],
  classCol: [/^class$/i],
  type: [/^(type|transaction type|tx type|entry type)$/i],
  currency: [/^(currency|ccy|currency code)$/i],
}

export function detectColumns(headers: string[]): DetectedColumns {
  const out: DetectedColumns = {
    date: null, amount: null, debit: null, credit: null, merchant: null,
    description: null, category: null, memo: null, account: null, balance: null,
    status: null, dueDate: null, issuedDate: null, paidDate: null,
    customer: null, invoiceNumber: null, classCol: null, type: null, currency: null,
  }
  const used = new Set<number>()
  for (const slot of Object.keys(HEADER_PATTERNS) as (keyof DetectedColumns)[]) {
    const patterns = HEADER_PATTERNS[slot]
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue
      const h = (headers[i] || "").trim()
      if (!h) continue
      if (patterns.some(p => p.test(h))) {
        out[slot] = i
        used.add(i)
        break
      }
    }
  }
  return out
}

/**
 * Look at the detected columns + a quick value sample to decide which
 * finance subtype this CSV is. Order matters — the first rule that
 * fires wins.
 *
 * Returns one of `bank`, `credit-card`, `invoices`, `quickbooks-gl`,
 * `quickbooks-pl`, or `null` if the CSV doesn't look financial at all.
 */
export type FinanceSubtype =
  | "bank"
  | "credit-card"
  | "invoices"
  | "quickbooks-gl"
  | "quickbooks-pl"
  | null

export function classifySubtype(headers: string[], rows: string[][], cols: DetectedColumns): FinanceSubtype {
  const lower = headers.map(h => (h || "").trim().toLowerCase())
  const has = (re: RegExp) => lower.some(h => re.test(h))

  // Invoice signals — the combination is what wins, not any one column.
  const invoiceSignals = [
    cols.invoiceNumber !== null,
    cols.customer !== null,
    cols.dueDate !== null || cols.status !== null,
  ].filter(Boolean).length
  if (invoiceSignals >= 2) return "invoices"
  if (cols.invoiceNumber !== null && cols.dueDate !== null) return "invoices"

  // QuickBooks / Xero P&L: a "Total" column and account-shaped first column.
  if (has(/^(total|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/) && (cols.account !== null || has(/^account$/))) {
    return "quickbooks-pl"
  }

  // QuickBooks / Xero general ledger: account + (debit/credit OR amount + type).
  const hasAccount = cols.account !== null || has(/^account/)
  const hasGlPair = cols.debit !== null && cols.credit !== null
  const hasGlAmount = cols.amount !== null && (cols.type !== null || cols.classCol !== null)
  if (hasAccount && (hasGlPair || hasGlAmount)) return "quickbooks-gl"

  // Credit-card vs bank: credit-card files lean on `purchase`, `charge`,
  // `card`, or have negative-only amounts; bank files have a balance
  // column or both inflow + outflow.
  if (has(/(card|credit ?card|charges?|purchases?)/)) return "credit-card"

  // Plain bank export: at minimum date + amount (or debit + credit).
  if (cols.date !== null && (cols.amount !== null || hasGlPair)) return "bank"

  return null
}

// ---------------------------------------------------------------------------
// Row → RawTxn extraction
// ---------------------------------------------------------------------------

export interface RawTxn {
  id: string
  date: string                          // YYYY-MM-DD when parseable
  dateEpoch: number                     // 0 if unparseable
  amount: number                        // signed: negative = outflow, positive = inflow
  currency: string
  description: string
  merchant: string | null
  category: string | null
  memo: string | null
  account: string | null
  balance: number | null
  status: string | null
  dueDate: string | null
  dueDateEpoch: number
  issuedDate: string | null
  paidDate: string | null
  customer: string | null
  invoiceNumber: string | null
  classCol: string | null
  type: string | null
  flags: string[]
  raw: Record<string, string>
}

export interface CsvHeaderShape {
  headers: string[]
  rows: string[][]
}

export function buildTxns(headers: string[], rows: string[][], cols: DetectedColumns, defaultCurrency = "USD"): RawTxn[] {
  const out: RawTxn[] = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.every(cell => !cell || !cell.trim())) continue   // skip blank rows
    const get = (idx: number | null) => (idx !== null ? (r[idx] || "").trim() : "")

    const dateStr = get(cols.date)
    const dateEpoch = parseDate(dateStr)
    const date = dateEpoch ? formatDate(dateEpoch) : dateStr.slice(0, 10)

    let amount = 0
    if (cols.amount !== null) {
      amount = parseAmount(get(cols.amount))
    } else if (cols.debit !== null || cols.credit !== null) {
      const debit = parseAmount(get(cols.debit))
      const credit = parseAmount(get(cols.credit))
      // Debit columns in bank CSVs are usually positive numbers
      // representing money out; credit columns are positive numbers
      // representing money in. Normalize to a single signed amount.
      amount = (Math.abs(credit) || 0) - (Math.abs(debit) || 0)
    }

    const currency = get(cols.currency) || defaultCurrency
    const description = get(cols.description) || get(cols.memo) || get(cols.merchant) || ""
    const merchantRaw = get(cols.merchant)
    const merchant = merchantRaw ? normalizeMerchant(merchantRaw) : (description ? extractMerchantFromDescription(description) : null)
    const category = get(cols.category) || null
    const memo = get(cols.memo) || null
    const account = get(cols.account) || null
    const balanceStr = get(cols.balance)
    const balance = balanceStr ? parseAmount(balanceStr) : null

    const statusStr = get(cols.status).toLowerCase()
    const status = statusStr ? normalizeStatus(statusStr) : null

    const dueDateStr = get(cols.dueDate)
    const dueDateEpoch = parseDate(dueDateStr)
    const dueDate = dueDateEpoch ? formatDate(dueDateEpoch) : (dueDateStr || null)
    const issuedDateEpoch = parseDate(get(cols.issuedDate))
    const issuedDate = issuedDateEpoch ? formatDate(issuedDateEpoch) : (get(cols.issuedDate) || null)
    const paidDateEpoch = parseDate(get(cols.paidDate))
    const paidDate = paidDateEpoch ? formatDate(paidDateEpoch) : (get(cols.paidDate) || null)

    const customer = get(cols.customer) || null
    const invoiceNumber = get(cols.invoiceNumber) || null
    const classCol = get(cols.classCol) || null
    const type = get(cols.type) || null

    const raw: Record<string, string> = {}
    for (let h = 0; h < headers.length; h++) {
      const key = headers[h] || `col${h + 1}`
      raw[key] = (r[h] || "").trim()
    }

    // Invoice files often have no "Date" column — fall back to Issued
    // (or Due) so timeline / recurring / period framing still work.
    const fallbackEpoch = dateEpoch || issuedDateEpoch || dueDateEpoch
    const fallbackDateStr = date || issuedDate || dueDate || ""

    out.push({
      id: `tx_${String(i + 1).padStart(6, "0")}`,
      date: fallbackDateStr || "",
      dateEpoch: fallbackEpoch,
      amount,
      currency,
      description,
      merchant,
      category: category || null,
      memo: memo || null,
      account,
      balance,
      status,
      dueDate,
      dueDateEpoch,
      issuedDate,
      paidDate,
      customer,
      invoiceNumber,
      classCol,
      type,
      flags: [],
      raw,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------

export interface CategoryTotal {
  category: string
  inflow: number
  outflow: number
  net: number
  count: number
  share: number
}

export interface TimelinePoint {
  date: string
  inflow: number
  outflow: number
  net: number
  balance: number | null
  count: number
}

export interface TopVendor {
  name: string
  outflow: number
  inflow: number
  count: number
}

export interface TopCustomer {
  name: string
  invoiced: number
  paid: number
  outstanding: number
  count: number
}

export interface AgingBucket {
  bucket: "0-30" | "31-60" | "61-90" | "90+"
  amount: number
  count: number
}

export interface RecurringEntry {
  name: string
  cadence: "weekly" | "biweekly" | "monthly" | "quarterly" | "irregular"
  avgAmount: number
  count: number
  lastSeen: string
  nextExpected: string | null
  tag: "subscription" | "payroll" | "rent" | "utility" | "income" | "other"
}

export interface FinanceFlag {
  kind:
    | "duplicate"
    | "outlier-amount"
    | "rare-vendor"
    | "first-time-vendor"
    | "round-trip"
    | "missing-category"
    | "overdue"
    | "negative-balance"
  label: string
  detail: string
  rowIds: string[]
}

export interface FinanceSummary {
  rowCount: number
  inflow: number
  outflow: number
  net: number
  currencySymbol: string
  currencyCode: string
  period: string
  durationLabel: string
  distinctMerchants: number
  distinctCategories: number
  invoiced?: number
  paid?: number
  outstanding?: number
  overdue?: number
  invoiceCount?: number
  customerCount?: number
}

export interface AggregatedFinance {
  summary: FinanceSummary
  categoryTotals: CategoryTotal[]
  recurring: RecurringEntry[]
  flags: FinanceFlag[]
  timeline: TimelinePoint[]
  topVendors: TopVendor[]
  topCustomers?: TopCustomer[]
  aging?: AgingBucket[]
  hasBalance: boolean
  spansMultipleMonths: boolean
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", CAD: "$", AUD: "$", NZD: "$", SGD: "$",
  EUR: "€", GBP: "£", JPY: "¥", CNY: "¥", INR: "₹", BRL: "R$",
}

export function aggregate(txns: RawTxn[], opts: { mode: "bank" | "invoices" | "quickbooks" }): AggregatedFinance {
  const inflow = sum(txns.filter(t => t.amount > 0).map(t => t.amount))
  const outflow = Math.abs(sum(txns.filter(t => t.amount < 0).map(t => t.amount)))
  const net = round2(inflow - outflow)

  const dated = txns.filter(t => t.dateEpoch > 0)
  const minDate = dated.length ? Math.min(...dated.map(t => t.dateEpoch)) : 0
  const maxDate = dated.length ? Math.max(...dated.map(t => t.dateEpoch)) : 0
  const period = minDate && maxDate ? `${formatDate(minDate)} → ${formatDate(maxDate)}` : "(no dates)"
  const durationLabel = minDate && maxDate ? formatDuration(maxDate - minDate) : "—"

  const merchants = new Set(txns.map(t => t.merchant).filter(Boolean) as string[])
  const categories = new Set(txns.map(t => t.category).filter(Boolean) as string[])

  const detectedCurrency = txns.find(t => t.currency)?.currency || "USD"
  const currencySymbol = CURRENCY_SYMBOLS[detectedCurrency] || detectedCurrency || "$"

  // Category totals.
  const categoryMap = new Map<string, { inflow: number; outflow: number; count: number }>()
  for (const t of txns) {
    const key = t.category || "Uncategorized"
    const cur = categoryMap.get(key) || { inflow: 0, outflow: 0, count: 0 }
    if (t.amount > 0) cur.inflow += t.amount
    else cur.outflow += Math.abs(t.amount)
    cur.count++
    categoryMap.set(key, cur)
  }
  const totalAbs = (inflow + outflow) || 1
  const categoryTotals: CategoryTotal[] = Array.from(categoryMap.entries())
    .map(([category, v]) => ({
      category,
      inflow: round2(v.inflow),
      outflow: round2(v.outflow),
      net: round2(v.inflow - v.outflow),
      count: v.count,
      share: round1(((v.inflow + v.outflow) / totalAbs) * 100),
    }))
    .sort((a, b) => (b.outflow + b.inflow) - (a.outflow + a.inflow))

  // Timeline (per day).
  const dayMap = new Map<string, { inflow: number; outflow: number; count: number; balance: number | null }>()
  for (const t of txns) {
    if (!t.dateEpoch) continue
    const cur = dayMap.get(t.date) || { inflow: 0, outflow: 0, count: 0, balance: null }
    if (t.amount > 0) cur.inflow += t.amount
    else cur.outflow += Math.abs(t.amount)
    cur.count++
    if (t.balance !== null) cur.balance = t.balance   // last seen balance per day
    dayMap.set(t.date, cur)
  }
  const timeline: TimelinePoint[] = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      inflow: round2(v.inflow),
      outflow: round2(v.outflow),
      net: round2(v.inflow - v.outflow),
      balance: v.balance !== null ? round2(v.balance) : null,
      count: v.count,
    }))

  // Top vendors.
  const vendorMap = new Map<string, { inflow: number; outflow: number; count: number }>()
  for (const t of txns) {
    const key = t.merchant || (t.description ? extractMerchantFromDescription(t.description) : null) || "(unknown)"
    const cur = vendorMap.get(key) || { inflow: 0, outflow: 0, count: 0 }
    if (t.amount > 0) cur.inflow += t.amount
    else cur.outflow += Math.abs(t.amount)
    cur.count++
    vendorMap.set(key, cur)
  }
  const topVendors: TopVendor[] = Array.from(vendorMap.entries())
    .map(([name, v]) => ({ name, inflow: round2(v.inflow), outflow: round2(v.outflow), count: v.count }))
    .sort((a, b) => (b.outflow + b.inflow) - (a.outflow + a.inflow))
    .slice(0, 25)

  // Recurring detection.
  const recurring = detectRecurring(txns)

  // Duplicate / outlier / first-time / missing-category flags.
  const allFlags = buildFlags(txns, recurring, vendorMap, opts.mode)

  // For invoice files, drop bank-shaped flag kinds entirely — invoices
  // are scheduled by design (so same-amount, same-customer rows are not
  // duplicates), have no spend-category column, and the outlier signal
  // there is "overdue", not amount.
  const workingFlags = opts.mode === "invoices"
    ? allFlags.filter(f => f.kind === "overdue" || f.kind === "rare-vendor")
    : allFlags

  // Tag rows with their flags so the drill-down table can show badges.
  for (const flag of workingFlags) {
    for (const id of flag.rowIds) {
      const t = txns.find(t => t.id === id)
      if (t && !t.flags.includes(flag.kind)) t.flags.push(flag.kind)
    }
  }

  // Invoice-specific aggregations.
  let topCustomers: TopCustomer[] | undefined
  let aging: AgingBucket[] | undefined
  const summary: FinanceSummary = {
    rowCount: txns.length,
    inflow: round2(inflow),
    outflow: round2(outflow),
    net,
    currencySymbol,
    currencyCode: detectedCurrency,
    period,
    durationLabel,
    distinctMerchants: merchants.size,
    distinctCategories: categories.size,
  }

  if (opts.mode === "invoices") {
    const inv = aggregateInvoices(txns)
    summary.invoiced = inv.invoiced
    summary.paid = inv.paid
    summary.outstanding = inv.outstanding
    summary.overdue = inv.overdue
    summary.invoiceCount = txns.length
    summary.customerCount = inv.customerCount
    topCustomers = inv.topCustomers
    aging = inv.aging

    // Add overdue flags to the front of the panel.
    const overdueRows = inv.overdueRows
    if (overdueRows.length > 0) {
      // Group by customer for cleaner cards (one card per customer with multiple overdue invoices).
      const byCustomer = new Map<string, { ids: string[]; amount: number; oldestDays: number }>()
      for (const row of overdueRows) {
        const key = row.customer || "(no customer)"
        const cur = byCustomer.get(key) || { ids: [], amount: 0, oldestDays: 0 }
        cur.ids.push(row.id)
        cur.amount += Math.abs(row.amount)
        cur.oldestDays = Math.max(cur.oldestDays, row.daysOverdue)
        byCustomer.set(key, cur)
      }
      for (const [name, v] of Array.from(byCustomer.entries()).sort((a, b) => b[1].amount - a[1].amount).slice(0, 5)) {
        const flag: FinanceFlag = {
          kind: "overdue",
          label: v.ids.length > 1 ? `${name}: ${v.ids.length} overdue invoices` : `${name}: invoice ${v.oldestDays} days overdue`,
          detail: `${currencySymbol}${formatMoney(v.amount)} outstanding (oldest ${v.oldestDays}d past due)`,
          rowIds: v.ids,
        }
        workingFlags.unshift(flag)
        // Tag the rows so the drill-down table shows the badge.
        for (const id of flag.rowIds) {
          const t = txns.find(t => t.id === id)
          if (t && !t.flags.includes(flag.kind)) t.flags.push(flag.kind)
        }
      }
    }
  }

  const hasBalance = txns.some(t => t.balance !== null)
  const spansMultipleMonths = minDate && maxDate ? new Date(maxDate).getUTCMonth() !== new Date(minDate).getUTCMonth() || new Date(maxDate).getUTCFullYear() !== new Date(minDate).getUTCFullYear() : false

  return {
    summary,
    categoryTotals,
    recurring,
    flags: workingFlags.slice(0, 12),
    timeline,
    topVendors,
    topCustomers,
    aging,
    hasBalance,
    spansMultipleMonths,
  }
}

// ---------------------------------------------------------------------------
// Recurring detection
// ---------------------------------------------------------------------------

const SUBSCRIPTION_VENDORS = /\b(stripe|notion|figma|github|slack|zoom|atlassian|jira|aws|gcp|google cloud|azure|netflix|spotify|hulu|adobe|datadog|sentry|segment|intercom|hubspot|salesforce|asana|linear|vercel|cloudflare|heroku|digitalocean|twilio|sendgrid|mailchimp|dropbox|1password|lastpass|claude|openai|anthropic|cursor)\b/i
const PAYROLL_VENDORS = /\b(payroll|gusto|adp|rippling|paychex|deel|justworks|trinet|paylocity|namely)\b/i
const RENT_VENDORS = /\b(rent|landlord|property|management|wework|regus|industrious|knotel)\b/i
const UTILITY_VENDORS = /\b(electric|water|gas|internet|comcast|xfinity|att|verizon|tmobile|spectrum|pg&?e|conedison|sce)\b/i

export function detectRecurring(txns: RawTxn[]): RecurringEntry[] {
  // Group by normalized merchant.
  const groups = new Map<string, RawTxn[]>()
  for (const t of txns) {
    const key = t.merchant || extractMerchantFromDescription(t.description || "")
    if (!key) continue
    const arr = groups.get(key) || []
    arr.push(t)
    groups.set(key, arr)
  }
  const out: RecurringEntry[] = []
  for (const [name, arr] of groups) {
    if (arr.length < 3) continue   // need ≥3 occurrences to call it recurring
    const dated = arr.filter(t => t.dateEpoch > 0).sort((a, b) => a.dateEpoch - b.dateEpoch)
    if (dated.length < 3) continue
    const gaps: number[] = []
    for (let i = 1; i < dated.length; i++) {
      gaps.push((dated[i].dateEpoch - dated[i - 1].dateEpoch) / 86400000)
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length
    const cadence = classifyCadence(avgGap)
    if (cadence === "irregular" && arr.length < 4) continue   // higher bar for irregular

    const amounts = arr.map(t => t.amount)
    const avgAmount = round2(amounts.reduce((a, b) => a + b, 0) / amounts.length)
    const lastSeen = dated[dated.length - 1].date

    let nextExpected: string | null = null
    if (cadence !== "irregular" && dated[dated.length - 1].dateEpoch) {
      const stepDays = cadence === "weekly" ? 7 : cadence === "biweekly" ? 14 : cadence === "monthly" ? 30 : 90
      nextExpected = formatDate(dated[dated.length - 1].dateEpoch + stepDays * 86400000)
    }

    let tag: RecurringEntry["tag"] = "other"
    if (avgAmount > 0) tag = "income"
    else if (PAYROLL_VENDORS.test(name)) tag = "payroll"
    else if (RENT_VENDORS.test(name)) tag = "rent"
    else if (UTILITY_VENDORS.test(name)) tag = "utility"
    else if (SUBSCRIPTION_VENDORS.test(name) || (Math.abs(avgAmount) < 500 && cadence === "monthly")) tag = "subscription"

    out.push({
      name,
      cadence,
      avgAmount,
      count: arr.length,
      lastSeen,
      nextExpected,
      tag,
    })
  }
  return out.sort((a, b) => Math.abs(b.avgAmount * b.count) - Math.abs(a.avgAmount * a.count))
}

function classifyCadence(avgDays: number): RecurringEntry["cadence"] {
  if (avgDays >= 5 && avgDays <= 9) return "weekly"
  if (avgDays >= 12 && avgDays <= 18) return "biweekly"
  if (avgDays >= 25 && avgDays <= 35) return "monthly"
  if (avgDays >= 80 && avgDays <= 100) return "quarterly"
  return "irregular"
}

// ---------------------------------------------------------------------------
// Flag detection (duplicates, outliers, first-time vendors, missing category)
// ---------------------------------------------------------------------------

function buildFlags(
  txns: RawTxn[],
  recurring: RecurringEntry[],
  vendorMap: Map<string, { inflow: number; outflow: number; count: number }>,
  mode: "bank" | "invoices" | "quickbooks",
): FinanceFlag[] {
  const flags: FinanceFlag[] = []
  const recurringSet = new Set(recurring.map(r => r.name))

  // Duplicates: same |amount|, same merchant, dates within 2 days.
  const dupSeen = new Set<string>()
  const sorted = txns.slice().sort((a, b) => a.dateEpoch - b.dateEpoch)
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j]
      if (b.dateEpoch - a.dateEpoch > 2 * 86400000) break
      if (Math.abs(a.amount - b.amount) > 0.01) continue
      if ((a.merchant || a.description || "").toLowerCase() !== (b.merchant || b.description || "").toLowerCase()) continue
      if (Math.abs(a.amount) < 0.01) continue   // skip $0 rows
      const key = [a.id, b.id].sort().join("|")
      if (dupSeen.has(key)) continue
      dupSeen.add(key)
      flags.push({
        kind: "duplicate",
        label: `Duplicate ${a.merchant || a.description || "charge"}`,
        detail: `${formatSignedAmount(a.amount, "USD")} on ${a.date} and ${b.date}`,
        rowIds: [a.id, b.id],
      })
      if (flags.length >= 3) break   // cap duplicate cards
    }
    if (flags.length >= 3) break
  }

  // Amount outliers: ≥ 8× the median absolute outflow, top 2. Skip
  // recurring vendors — payroll cycles and rent will dwarf the median
  // every month and are not "anomalies", they are the budget.
  // Bank-only: GL/P&L exports are categorized by design; the
  // accountTree is a better surface than per-row callouts there.
  const outflows = txns.filter(t => t.amount < 0).map(t => Math.abs(t.amount)).sort((a, b) => a - b)
  const medianOutflow = outflows.length ? outflows[Math.floor(outflows.length / 2)] : 0
  if (mode === "bank" && medianOutflow > 0 && txns.length >= 10) {
    const candidates = txns
      .filter(t => {
        if (t.amount >= 0 || Math.abs(t.amount) < Math.max(medianOutflow * 8, 100)) return false
        const vendor = t.merchant || extractMerchantFromDescription(t.description || "") || ""
        return !recurringSet.has(vendor)
      })
      .sort((a, b) => a.amount - b.amount)
      .slice(0, 2)
    for (const c of candidates) {
      flags.push({
        kind: "outlier-amount",
        label: `Unusually large outflow: ${c.merchant || c.description || "(unknown)"}`,
        detail: `${formatSignedAmount(c.amount, "USD")} on ${c.date} — ${Math.round(Math.abs(c.amount) / medianOutflow)}× median outflow`,
        rowIds: [c.id],
      })
    }
  }

  // First-time vendors: bank-only signal. For invoice / GL files
  // every counterparty is "named" by design, so this would just flood.
  if (mode === "bank") {
    const totalOutflow = sum(txns.filter(t => t.amount < 0).map(t => Math.abs(t.amount))) || 1
    for (const [name, v] of vendorMap) {
      if (v.count !== 1 || v.outflow < totalOutflow * 0.05 || v.outflow < 500) continue
      if (recurringSet.has(name)) continue
      const row = txns.find(t => (t.merchant || extractMerchantFromDescription(t.description || "") || "(unknown)") === name && t.amount < 0)
      if (!row) continue
      flags.push({
        kind: "first-time-vendor",
        label: `First-time vendor: ${name}`,
        detail: `${formatSignedAmount(row.amount, "USD")} on ${row.date} — no prior history in this file`,
        rowIds: [row.id],
      })
      if (flags.filter(f => f.kind === "first-time-vendor").length >= 2) break
    }
  }

  // Missing category — only when the file actually has a category
  // column. If no row has a category, there's no "missing", just a
  // file shape that doesn't carry that information.
  if (mode !== "invoices" && txns.some(t => t.category)) {
    const uncategorized = txns.filter(t => !t.category)
    if (uncategorized.length >= Math.max(5, Math.floor(txns.length * 0.1))) {
      const amount = sum(uncategorized.map(t => Math.abs(t.amount)))
      flags.push({
        kind: "missing-category",
        label: `${uncategorized.length} transactions missing category`,
        detail: `${formatMoney(amount)} unaccounted for across ${uncategorized.length} rows`,
        rowIds: uncategorized.map(t => t.id).slice(0, 25),
      })
    }
  }

  // Negative balance (only if balance column exists at all).
  const negBalance = txns.find(t => t.balance !== null && t.balance < 0)
  if (negBalance) {
    flags.push({
      kind: "negative-balance",
      label: `Account went negative on ${negBalance.date}`,
      detail: `Balance reached ${formatSignedAmount(negBalance.balance!, "USD")} after ${negBalance.merchant || negBalance.description || "transaction"}`,
      rowIds: [negBalance.id],
    })
  }

  return flags
}

// ---------------------------------------------------------------------------
// Invoice-specific aggregation
// ---------------------------------------------------------------------------

function aggregateInvoices(txns: RawTxn[]): {
  invoiced: number
  paid: number
  outstanding: number
  overdue: number
  customerCount: number
  topCustomers: TopCustomer[]
  aging: AgingBucket[]
  overdueRows: { id: string; customer: string | null; amount: number; daysOverdue: number }[]
} {
  let invoiced = 0
  let paid = 0
  let outstanding = 0
  let overdue = 0
  const customerMap = new Map<string, { invoiced: number; paid: number; outstanding: number; count: number }>()
  const buckets = { "0-30": { amount: 0, count: 0 }, "31-60": { amount: 0, count: 0 }, "61-90": { amount: 0, count: 0 }, "90+": { amount: 0, count: 0 } }
  const overdueRows: { id: string; customer: string | null; amount: number; daysOverdue: number }[] = []
  const today = Date.now()

  for (const t of txns) {
    const amt = Math.abs(t.amount)
    invoiced += amt
    const cust = t.customer || "(no customer)"
    const cur = customerMap.get(cust) || { invoiced: 0, paid: 0, outstanding: 0, count: 0 }
    cur.invoiced += amt
    cur.count++

    const isPaid = t.status === "paid"
    const isPartial = t.status === "partially paid"
    if (isPaid) {
      paid += amt
      cur.paid += amt
    } else if (isPartial) {
      paid += amt / 2   // unknown split — count half as paid for the rollup; the drill-down shows raw status
      cur.paid += amt / 2
      cur.outstanding += amt / 2
      outstanding += amt / 2
    } else {
      outstanding += amt
      cur.outstanding += amt
      // Aging bucket
      if (t.dueDateEpoch && t.dueDateEpoch < today) {
        const daysOverdue = Math.floor((today - t.dueDateEpoch) / 86400000)
        overdue += amt
        if (daysOverdue <= 30) { buckets["0-30"].amount += amt; buckets["0-30"].count++ }
        else if (daysOverdue <= 60) { buckets["31-60"].amount += amt; buckets["31-60"].count++ }
        else if (daysOverdue <= 90) { buckets["61-90"].amount += amt; buckets["61-90"].count++ }
        else { buckets["90+"].amount += amt; buckets["90+"].count++ }
        overdueRows.push({ id: t.id, customer: t.customer, amount: amt, daysOverdue })
      } else {
        // Not yet due — slot into 0-30 by convention.
        buckets["0-30"].amount += amt
        buckets["0-30"].count++
      }
    }
    customerMap.set(cust, cur)
  }

  const topCustomers: TopCustomer[] = Array.from(customerMap.entries())
    .map(([name, v]) => ({
      name,
      invoiced: round2(v.invoiced),
      paid: round2(v.paid),
      outstanding: round2(v.outstanding),
      count: v.count,
    }))
    .sort((a, b) => b.invoiced - a.invoiced)
    .slice(0, 15)

  const aging: AgingBucket[] = (Object.keys(buckets) as Array<keyof typeof buckets>).map(b => ({
    bucket: b as AgingBucket["bucket"],
    amount: round2(buckets[b].amount),
    count: buckets[b].count,
  }))

  return {
    invoiced: round2(invoiced),
    paid: round2(paid),
    outstanding: round2(outstanding),
    overdue: round2(overdue),
    customerCount: customerMap.size,
    topCustomers,
    aging,
    overdueRows,
  }
}

// ---------------------------------------------------------------------------
// QuickBooks account-tree builder
// ---------------------------------------------------------------------------

export interface AccountNode {
  account: string
  subtotal: number
  count: number
  children: AccountNode[]
}

export function buildAccountTree(txns: RawTxn[]): AccountNode[] {
  // Account names like "Income:Consulting:Retainers" → nested tree.
  const root = new Map<string, AccountNode>()
  for (const t of txns) {
    if (!t.account) continue
    const parts = t.account.split(/\s*[:>]\s*/).filter(Boolean)
    if (parts.length === 0) continue
    let map = root
    let parent: AccountNode | null = null
    for (let i = 0; i < parts.length; i++) {
      const name = parts.slice(0, i + 1).join(":")
      let node = map.get(name)
      if (!node) {
        node = { account: parts[i], subtotal: 0, count: 0, children: [] }
        map.set(name, node)
        if (parent) parent.children.push(node)
      }
      node.subtotal = round2(node.subtotal + t.amount)
      node.count++
      parent = node
      // Children of this node live in the same map but keyed by their full path.
      map = root
    }
  }
  // Return only top-level (no colon in their key).
  const tops: AccountNode[] = []
  for (const [key, node] of root) {
    if (!key.includes(":")) tops.push(node)
  }
  return tops.sort((a, b) => Math.abs(b.subtotal) - Math.abs(a.subtotal))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sum(arr: number[]): number {
  let total = 0
  for (const n of arr) total += n
  return total
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
function round1(n: number): number { return Math.round(n * 10) / 10 }

export function parseAmount(raw: string): number {
  if (!raw) return 0
  const trimmed = raw.trim()
  if (!trimmed) return 0
  // Accounting parens for negatives: "(123.45)" → -123.45
  let negative = false
  let s = trimmed
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  // Strip currency symbols, thousands separators, spaces.
  s = s.replace(/[$€£¥₹]/g, "").replace(/\s+/g, "").replace(/,/g, "")
  if (s.startsWith("-")) {
    negative = !negative
    s = s.slice(1)
  } else if (s.startsWith("+")) {
    s = s.slice(1)
  }
  const n = parseFloat(s)
  if (!isFinite(n)) return 0
  return negative ? -n : n
}

export function parseDate(raw: string): number {
  if (!raw) return 0
  const s = raw.trim()
  if (!s) return 0
  // ISO 8601 (YYYY-MM-DD) — most reliable.
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) return Date.UTC(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]))
  // US (M/D/YYYY) — also handle MM/DD/YYYY and 2-digit years.
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s)
  if (us) {
    let y = parseInt(us[3])
    if (y < 100) y += y >= 70 ? 1900 : 2000
    return Date.UTC(y, parseInt(us[1]) - 1, parseInt(us[2]))
  }
  // Dotted DE/AT (D.M.YYYY).
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s)
  if (de) return Date.UTC(parseInt(de[3]), parseInt(de[2]) - 1, parseInt(de[1]))
  // Hyphenated D-MMM-YYYY (Xero / QuickBooks default in some locales).
  const dmy = /^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{2,4})/.exec(s)
  if (dmy) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    const m = months.indexOf(dmy[2].toLowerCase())
    if (m >= 0) {
      let y = parseInt(dmy[3])
      if (y < 100) y += y >= 70 ? 1900 : 2000
      return Date.UTC(y, m, parseInt(dmy[1]))
    }
  }
  // Last resort: Date.parse — handles many ISO datetimes.
  const t = Date.parse(s)
  return isNaN(t) ? 0 : t
}

export function formatDate(epoch: number): string {
  if (!epoch) return ""
  const d = new Date(epoch)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function formatDuration(ms: number): string {
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
  return Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatSignedAmount(n: number, _currency: string): string {
  const sign = n < 0 ? "−" : ""
  return `${sign}$${formatMoney(n)}`
}

export function normalizeMerchant(raw: string): string {
  // Strip trailing reference numbers, location codes, dates that bank
  // statements bolt onto the merchant string. "STRIPE *INV12345"
  // → "STRIPE". "AMAZON.COM*1AB2C3DE WA" → "AMAZON.COM".
  let s = (raw || "").trim()
  if (!s) return s
  s = s.replace(/[\*#]+[A-Z0-9\-]+\b.*/i, "").trim()
  s = s.replace(/\s+\d{1,2}\/\d{1,2}\/?\d{0,4}\s*$/i, "").trim()
  s = s.replace(/\s+\d{4,}$/i, "").trim()
  return s.slice(0, 80)
}

export function extractMerchantFromDescription(desc: string): string {
  // Best-effort: take the first 1–3 ALL-CAPS words, fall back to first
  // 3 words. Bank descriptions are usually like "STRIPE TRANSFER 09/14"
  // — pulling the leading caps token gives a stable group key.
  if (!desc) return ""
  const trimmed = desc.trim()
  const caps = trimmed.match(/^[A-Z][A-Z0-9\.\-&]+(?:\s+[A-Z][A-Z0-9\.\-&]+){0,2}/)
  if (caps) return normalizeMerchant(caps[0])
  return normalizeMerchant(trimmed.split(/\s+/).slice(0, 3).join(" "))
}

function normalizeStatus(raw: string): string {
  const s = raw.toLowerCase().trim()
  if (!s) return ""
  if (s === "paid" || s === "complete" || s === "completed" || s === "settled") return "paid"
  if (s.includes("partial")) return "partially paid"
  if (s === "overdue" || s === "past due" || s === "late") return "overdue"
  if (s === "outstanding" || s === "open" || s === "pending" || s === "due" || s === "sent" || s === "unpaid") return "outstanding"
  if (s === "draft" || s === "void" || s === "cancelled" || s === "canceled") return s
  return s
}
