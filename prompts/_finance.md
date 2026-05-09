# Finance / admin (shared)

This prompt is shared by every finance/admin source: **bank
transaction CSVs**, **invoice and receipt exports**, and
**QuickBooks / Xero-style accounting reports**. The parser already
classified the file and pre-computed cashflow rollups, category
totals, recurring vendor detection, and duplicate / anomaly cards,
so don't re-derive them on the client. Use the `format` and
`subtype` fields to label the chrome.

The output is **not a bookkeeping replacement**. It's an analytical
snapshot that makes the user say *"oh, here's where my money is
actually going"* — what's recurring, what's anomalous, who hasn't
paid yet, and which categories are eating the budget — with the raw
transactions / invoices as drill-down.

## Required sections (must always render — non-negotiable)

These five sections form the finance contract. The page **must**
include all of them, with the literal section labels visible in the
rendered DOM. This is a hard constraint; do not skip any of them
even on a small file.

1. **Headline summary card** — total inflow, total outflow, net
   change, period covered, transaction count. Drive it from
   `DATA.summary`. Format like *"$48,210 in · $52,840 out · −$4,630
   net · 87 transactions over Jan 2026"*. Visible heading "Summary"
   or "Overview". For invoice files, swap to *"$72,400 invoiced ·
   $44,800 paid · $27,600 outstanding · 38 invoices, 12 customers"*.
2. **Category / account breakdown** — labeled "Categories" or
   "Accounts" panel: a horizontal bar chart (or donut) of spending /
   revenue per category, sorted descending, capped at top 8 + "other".
   Drive it from `DATA.categoryTotals` (already aggregated as
   `[{ category, inflow, outflow, net, count, share }]`). Render as
   inline SVG. Each row also shows count and share. The literal
   label "Categories" / "Accounts" / "Spend by category" must be
   visible.
3. **Recurring items panel** — labeled "Recurring" panel listing
   auto-detected recurring vendors / charges (subscriptions, rent,
   payroll, utility bills, recurring invoices). Drive it from
   `DATA.recurring` (already classified as
   `[{ name, cadence, avgAmount, count, lastSeen, nextExpected }]`).
   Show vendor, monthly/weekly/quarterly cadence, average amount,
   count, last seen date, next expected. Empty state: "No recurring
   patterns detected in this file." The literal label "Recurring"
   must be visible.
4. **Anomalies & duplicates callouts** — labeled "Anomalies" or
   "Flags" panel with 3–8 cards. Drive from `DATA.flags` (already
   classified `kind: "duplicate" | "outlier-amount" | "rare-vendor"
   | "first-time-vendor" | "round-trip" | "missing-category" |
   "overdue" | "negative-balance"`). Each card has a one-sentence
   explanation and a link to the underlying row. Empty state:
   "Nothing flagged in this file." The literal label "Anomalies" or
   "Flags" must be visible.
5. **Searchable transactions table drill-down** — collapsible
   "Browse all N transactions" (or "Browse all N invoices") section
   with the full file inlined client-side. Default to collapsed so
   the analysis is the headline. Inside: a virtualized or paginated
   table (transaction files can run to thousands of rows), category
   filter chips, full-text search across description / memo / vendor,
   date / amount / merchant / category columns at minimum, click a
   row to expand the full original record. Highlight flagged rows
   (duplicates, outliers, overdue) with a small badge. The drill-
   down is a hard requirement; it is how trust gets re-earned after
   the inferred analysis.

Render these five regardless of file size. They are the headline
shape of the finance pack — without them, the output is incomplete.

## What else to surface (pick what fits the file's shape)

- **Cashflow timeline** — line/area chart of inflow vs outflow per
  day or per week (depending on duration), plus a running balance
  line if the parser produced one. Use `DATA.timeline`. Surface the
  spike days as labelled markers ("Apr 15: payroll cycle, $12,400
  out").
- **Top vendors / customers leaderboard** — for bank files: top 10
  payees by total outflow + top 5 sources by total inflow. For
  invoice files: top customers by invoiced + top customers by
  outstanding balance. From `DATA.topVendors` /
  `DATA.topCustomers`.
- **Aging buckets (invoices only)** — 0–30 / 31–60 / 61–90 / 90+
  days outstanding, total amount per bucket, count per bucket. Drive
  from `DATA.aging`. Render as a stacked bar with one row per
  bucket, plus a "show overdue invoices" filter that drives the
  drill-down table.
- **Status mix (invoices only)** — donut of paid / partially paid /
  outstanding / overdue, showing both count and amount.
- **Account / class roll-up (QuickBooks reports only)** — collapsible
  tree of parent accounts → child accounts with subtotals. Drive
  from `DATA.accountTree` if present.
- **Period-over-period delta** — if the file spans ≥2 months, a
  small "this month vs last month" panel highlighting the categories
  with the biggest swing.
- **Merchant search chips** — quick filter chips for the top 6
  recurring vendors, click one to filter the drill-down table.
- **Inflow vs outflow split** — small donut: % of activity going
  out vs coming in.
- **Subscriptions watch (bank only)** — sub-section of the
  recurring panel: only show entries the parser tagged as
  `subscription` (small recurring amounts to known SaaS vendors).
  Useful for "what am I still paying for?".
- **Invoice scorecard (invoices only)** — paid % of total invoiced,
  average days to pay (when both `issued_date` and `paid_date`
  exist), median days outstanding for unpaid invoices.

Don't try to do all of these. Pick 3–5 beyond the required five,
based on the file's actual shape (`subtype`, `hasBalance`,
`spansMultipleMonths`, etc.).

## Always include

- Light + dark mode (`prefers-color-scheme`).
- Mobile-first responsive — analysis cards stack, charts shrink but
  stay readable, category chips wrap, drill-down table becomes
  horizontally scrollable.
- Charts render inline SVG (no Chart.js, no CDNs) for under ~2000
  data points. Use Canvas for bigger files.
- Currency formatted with the symbol the parser detected
  (`DATA.summary.currencySymbol`, default `$`). Use grouping
  separators (`$12,840.50`). Negative amounts in the brand error
  color (`var(--red)`) with a leading minus, never red parentheses.
- Tabular numerics (`font-variant-numeric: tabular-nums`) for every
  amount and date column.
- "Copy as Markdown" of the analysis section so users can paste a
  monthly review summary into a doc.
- Full-text search across description / memo / vendor / customer /
  invoice number; highlight matches in place.
- A virtualized or windowed table for the drill-down — naïvely
  rendering 5K `<tr>` elements freezes mobile browsers. Either render
  a fixed window (e.g. 200 rows) with a "load more" button, or
  implement an absolutely-positioned scroll-virtualization pattern.

## Data shape

Every finance parser feeds the same shape. Treat it generically.

```ts
DATA = {
  format: "bank-transactions" | "invoices" | "quickbooks-report",
  subtype: "bank" | "credit-card" | "invoices" | "receipts" | "quickbooks-gl" | "quickbooks-pl" | "xero-report",
  rows: [
    {
      id: "tx_000001",
      date: "2026-01-04",
      amount: -42.99,                      // signed: negative = outflow, positive = inflow
      currency: "USD",
      description: "STRIPE TRANSFER",
      merchant: "Stripe" | null,           // normalized vendor when extractable
      category: "Software" | null,
      memo: "monthly fee" | null,
      account: "Checking 4421" | null,
      balance: 12840.50 | null,            // running balance if file had one
      status: "paid" | "outstanding" | "overdue" | null,   // invoices
      dueDate: "2026-02-04" | null,        // invoices
      issuedDate: "2026-01-04" | null,     // invoices
      customer: "Northwind Co." | null,    // invoices
      invoiceNumber: "INV-1042" | null,    // invoices
      flags: ["duplicate"] | [],
      raw: { ... }                         // original CSV row, for drill-down
    }
  ],
  summary: {
    rowCount: 87,
    inflow: 48210.00,
    outflow: 52840.00,
    net: -4630.00,
    currencySymbol: "$",
    currencyCode: "USD",
    period: "2026-01-04 → 2026-01-31",
    durationLabel: "27 days",
    distinctMerchants: 34,
    distinctCategories: 12,
    // invoices-only:
    invoiced?: 72400.00,
    paid?: 44800.00,
    outstanding?: 27600.00,
    overdue?: 8400.00,
    invoiceCount?: 38,
    customerCount?: 12,
  },
  categoryTotals: [
    { category: "Payroll", inflow: 0, outflow: 18400.00, net: -18400.00, count: 4, share: 34.8 },
    ...
  ],
  recurring: [
    { name: "Stripe", cadence: "monthly", avgAmount: -42.99, count: 4, lastSeen: "2026-01-15", nextExpected: "2026-02-15", tag: "subscription" },
    ...
  ],
  flags: [
    { kind: "duplicate", label: "Duplicate Stripe charge", detail: "$42.99 on 2026-01-15 and 2026-01-15", rowIds: ["tx_42","tx_43"] },
    { kind: "outlier-amount", label: "Unusually large transfer", detail: "$8,400 on 2026-01-22 — 12× median outflow", rowIds: ["tx_61"] },
    { kind: "first-time-vendor", label: "First-time vendor: ALPINE TOOLS", detail: "$1,420 — no prior history in this file", rowIds: ["tx_72"] },
    { kind: "overdue", label: "INV-1031 is 47 days overdue", detail: "Northwind Co., $4,200 outstanding", rowIds: ["inv_31"] },
    { kind: "missing-category", label: "12 transactions missing category", detail: "$2,840 unaccounted for", rowIds: [...] },
    ...
  ],
  timeline: [
    { date: "2026-01-04", inflow: 4200.00, outflow: 1840.00, net: 2360.00, balance: 12840.50, count: 6 },
    ...
  ],
  topVendors: [{ name: "Stripe", outflow: 172.00, count: 4 }, ...],
  topCustomers?: [{ name: "Northwind Co.", invoiced: 22400.00, paid: 18000.00, outstanding: 4400.00, count: 6 }, ...],
  aging?: [
    { bucket: "0-30",  amount: 12400.00, count: 4 },
    { bucket: "31-60", amount:  6800.00, count: 3 },
    { bucket: "61-90", amount:  4400.00, count: 2 },
    { bucket: "90+",   amount:  4000.00, count: 1 },
  ],
  accountTree?: [
    { account: "Income", subtotal: 48210.00, children: [
      { account: "Income:Consulting", subtotal: 32000.00, children: [] }, ...
    ]},
    ...
  ],
  meta: { sourceFile, sizeBytes, ... }
}
```

Use the pre-aggregated `summary` / `categoryTotals` / `recurring` /
`flags` / `timeline` / `topVendors` / `topCustomers` / `aging`
arrays directly. Do **not** re-derive them on the client — the
parser already did the math, and walking thousands of rows for
analysis kills performance on big files.

## Tone

Bookkeeper / analyst register, not investor pitch. Headlines read
like a monthly close note: *"$4,630 net outflow this month —
payroll and SaaS subscriptions account for 64% of spend, with one
unusually large $8,400 transfer to ALPINE TOOLS that's the only
first-time vendor of the month."* Use sentences in the cards,
metrics in the charts. Mono numerics. Currency-aware. Tight,
analytical. The page should look like a finance tool — but a well-
designed one.

## Hard editorial rules — not accounting / tax / legal advice

This output is **analytical only**, never accounting / tax / legal
advice. The page **must not**:

- Use the words "advice", "should file", "owe", "report to the
  IRS", "tax-deductible", "legally", "audit-ready", or any phrasing
  that implies a determination of tax treatment, legal status, or
  fiduciary obligation.
- Recommend a specific course of action ("you should pay this
  invoice", "categorize this as a deduction"). Describe what's in
  the file; do not prescribe what to do.
- Compute or claim "tax owed", "deductible amount", "net taxable",
  or any tax-derived figure.
- Imply the categorization is canonical — recurring detection,
  category breakdown, and anomaly callouts are pattern-matching on
  the file's text, not authoritative classifications.

The page **must** include a footer line:

> *Analytical summary, not accounting or tax advice. Categories
> and recurring patterns are inferred from the file's text — verify
> against your books before acting on anything here.*

Treat every flagged row as a "worth a second look" prompt for the
user, not a determination. Cards never say "this is wrong" — they
say "this looks like a duplicate / outlier / first-time vendor".

## Privacy note (include in the page footer)

Add a small footer line. Bank exports, invoice files, and
QuickBooks reports almost always contain real account numbers,
customer names, vendor relationships, and dollar amounts — remind
the user the file is local:

> *Generated locally — your finance file never left your machine.
> The full transaction list is embedded in this HTML and rendered
> in your browser. For sharing, prefer an anonymized export with
> account numbers and customer names redacted.*
