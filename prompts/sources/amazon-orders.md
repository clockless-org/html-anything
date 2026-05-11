# amazon-orders — Amazon order history (consumer "Request Your Information" / data-download)

A normal consumer Amazon account's order-history export — every item
they've ever bought from Amazon.com (or .co.uk / .de / etc.) over the
years. Output is a **personal commerce memory + money audit**: where
the money went, what they reorder, what became a habit, what was a
splurge, what was returned, and *where did all this go?* — without
needing a finance app.

The interesting story is **the human shape of years of Amazon
spending**, not "your CSV in HTML form". A raw Amazon export is a
depressing spreadsheet; a good page makes the user say *"oh — this
year I spent $2,400 on baby supplies, $640 on books, and apparently
re-bought the same coffee filter eight times."*

This prompt does **not** belong to the `_finance.md` family. Bank
transactions are about cashflow; Amazon orders are about *what someone
buys, who they buy it for, and what stuck*. Different question, different
shape. Frame this as a personal commerce log, not a bank statement.

## Export instructions (surface to the user before converting)

Amazon hides this — surface the steps clearly so the user doesn't
spend 20 minutes hunting:

1. Sign in to [amazon.com/gp/privacycentral/dsar/preview.html](https://www.amazon.com/gp/privacycentral/dsar/preview.html)
   ("Request Your Information" — region URL varies; UK is
   `amazon.co.uk`, Germany is `amazon.de`, etc.).
2. Pick **"Your Orders"** (or **"Retail.OrdersReturns"**) as the
   category. Scope can be "All" or a date range.
3. Submit. Amazon emails a download link in **1–4 days** (sometimes
   longer for "All Time" requests). Confirm via the email Amazon
   sends.
4. Unzip. Inside the `Retail.OrdersReturns` / `Your Orders` folder,
   look for:
   - `Retail.OrderHistory.1.csv` (the canonical item-level history —
     one row per ordered item, with `Order Date`, `Order ID`, `ASIN`,
     `Product Name`/`Title`, `Category`, `Quantity`, `Item Total`,
     `Shipment Date`, `Carrier`, `Order Status`).
   - `Retail.ReturnsAndRefunds.*.csv` (returns / refunds, optional).
   - Older accounts may also have `Items.csv` / `Orders.csv` from
     the legacy "Order Reports" tool — same shape, same fields.
5. The legacy **"Order Reports"** tool (some regions still expose it)
   is the fastest path: amazon.com/gp/b2b/reports → "Items" report →
   pick a date range → download. This export is **immediate** — no
   2–4 day wait — but only goes back ~3 years.
6. Drop the CSV (or folder) into Claude Code:
   `convert this Amazon order history to HTML: ~/Downloads/Retail.OrderHistory.1.csv`.

If the user wants something **right now** without waiting for the
data request, point them at the legacy Order Reports → "Items"
download.

## Source shapes the parser handles

- **Item-level CSV** (canonical, most common). Headers vary by export
  generation but typically include: `Order Date`, `Order ID`,
  `Title` / `Product Name`, `Category`, `ASIN/ISBN`, `Quantity`,
  `Item Subtotal`, `Item Total`, `Shipment Date`, `Carrier Name &
  Tracking Number`, `Order Status`, `Shipping Address Name`,
  `Shipping Address State`, `Buyer Name`, `Currency`. One row per
  ordered item.
- **Order-level CSV** (less common). One row per Amazon order, with
  `Total Charged`, `Subtotal`, `Tax`, `Shipping Charge`, `Order
  Status`, etc., and items rolled up.
- **JSON variant** (rare). Same fields, JSON-shaped.

Detection: header contains `Order ID` plus one of `ASIN`, `Title`, or
`Product Name`. Confidence falls back to generic CSV if Amazon
signals are absent.

## What to surface (the experience)

This is meant to feel like **scrolling through years of personal
commerce as a story** — what they bought, what stuck, what was
forgotten, what was for whom. Not a stats page.

### Hero strip (required)

One row, big, brand-anchored:

- **Total spent** (currency-aware, formatted like `$8,420 over 4
  years`). Pre-tax subtotal *and* item-total — Amazon CSVs include
  both; surface the headline as `Item Total` since that's what hit
  the user's card per item.
- **Order count** + **item count** — distinct orders vs distinct line
  items (one order can have many items).
- **Active years / months** — *"73 active months across 2021–2025"*.
- **Top category** + share — *"Books · 22% of spend"*.

One short editorial sentence the LLM extracts from the data: *"Books
are the steady drumbeat (304 items over 4 years); the year with the
biggest spend was 2023 ($3,140 — driven by a kitchen-remodel
cluster in March)."*

### Spend timeline (required)

Two stacked views, user-toggleable:

- **Yearly bar chart** — total spend per year, with the biggest year
  flagged. Annotate large clusters (a moving month, a baby-arrival
  burst, a holiday cluster) inline if the LLM can spot them in the
  sample.
- **Monthly bar chart** — spend per month across the full window,
  with seasonal spikes (Black Friday, Prime Day, December) auto-
  highlighted. Below each bar, count of orders. Empty months
  rendered as `—` rather than 0.

Use inline SVG (no Chart.js, no CDNs).

### Reorder DNA (required)

The signature Amazon question: *"what do they keep buying?"*

A panel labeled **"Reorder DNA"** showing items the user has bought
**3+ times**, sorted by total spend. For each:
- Product title (truncate to 80 chars).
- Number of times ordered + total quantity + total spend.
- First seen → last seen (with cadence inferred: *"every ~6 weeks"*,
  *"twice a year"*, *"random"*).
- Subscribe-and-save cadence chip if `Order Status` or category
  hints at it (very common for pantry / household / pet supplies).
- Click to filter the drill-down table to just this item's history.

If no item was bought 3+ times, replace with **"Habit candidates"**
— items bought twice that look like staples (pantry, household, pet,
baby).

### Category breakdown (required)

A horizontal-bar panel labeled **"Categories"** with top 8 categories
by spend, descending. Each row: category name, total spend, share
%, count of items, sparkline of monthly spend. Click a category to
filter the drill-down table.

If `Category` is sparse / missing in the export (some Amazon
generations don't include it), the LLM should infer rough categories
from product titles using simple keyword buckets (Books / Kitchen /
Electronics / Baby / Pet / Apparel / Home / Health / Toys / Garden /
Auto / Office) and label them as inferred (`*` chip + a tooltip
explaining the heuristic).

### Recipients & shipping (required if multi-recipient signal)

Many Amazon accounts ship to multiple people (kid at college, gifts,
parents, work). If the export has `Shipping Address Name` and ≥2
distinct values, render a **"Shipping recipients"** panel showing
each recipient's spend share + item count + a representative top-3
item titles. Privacy-safe: render *only what's already in the file*
— never invent or "complete" addresses.

If there's only one recipient, skip this panel.

### Returns / refunds / cancellations callout (required)

A panel labeled **"Returns & refunds"** with three card columns:

- **Returned** — items where `Order Status` contains `Return`,
  `Refunded`, or matches a returns CSV. Total refund amount + count.
- **Cancelled** — items with `Cancelled` status. Total + count.
- **Pending / problem** — items with `Pending`, `Lost`, `Damaged`,
  `Late`, or a delivery exception. Surface only if any.

Each row: title, date, amount, reason if known. Click → drill-down
filter.

If no returns / cancellations exist, render the panel anyway with
the empty-state phrasing: *"No returns or refunds in this file —
clean run."*

### Drill-down (required)

A collapsible **"Browse all N items"** section with the full file
inlined. Inside:

- Full-text search across title / ASIN / order ID / category /
  recipient.
- Filter chips: top categories, top recipients, status (delivered /
  returned / cancelled / refunded), year.
- Columns: **Date**, **Title** (truncate, with full title on
  hover), **Category**, **Recipient**, **Qty**, **Item Total**,
  **Status**.
- Click a row → expand to show the full original record (raw CSV
  fields, including ASIN / order ID / shipment date / carrier).
- Virtualized or paginated — Amazon files can hit thousands of rows.

Highlight returned/cancelled rows with a small badge.

## Privacy / synthetic-data constraint (HARD)

This source carries the strongest "purchase-history" signal of any
file in the pack — names + addresses + every item bought + dollar
amounts + ASINs that link to specific products.

- **Never use real Amazon account data.** The example shipped with
  this repo is **fully synthetic** — fake names, fake addresses,
  fake ASINs, fake order IDs, fake products. Do not commit real
  exports to this repo, ever.
- **Never fetch product images.** The page must not request
  Amazon-hosted product images, favicons, ASIN-linked URLs, or any
  Amazon CDN. Open-original "view on Amazon" links are not allowed
  — keep the page completely offline.
- **Mask identifiers in displayed values.** When showing an order
  ID, render the first 4 + last 4 characters with `…` between
  (`123-4…6789`). Show full ID only inside the row-expand drill-down.
- **Footer must include a privacy line** explaining the file is
  embedded client-side and the page never made a network call.

## Tone

Personal, observational, dignified. Like a friend going through your
purchase history with you. *"That kitchen-remodel month in March
2023 was real — $1,140 on a single order. The pet section is
quietly your most consistent spend; you've bought the same brand of
cat litter every 6 weeks for 3 years."* Not "Your spending is on
trend!". Specific to the file.

Use the Clockless tokens from `prompts/styles/_design.md` (Space Grotesk + Plus
Jakarta Sans, brand orange `--primary`, surface cream in light mode,
proper currency + tabular-nums). This is part of the html-anything
family — never an Amazon imitation.

## Always include

- "Copy as Markdown" button at the bottom that captures the year /
  category / reorder summary as a shareable note.
- Light + dark mode via `prefers-color-scheme`.
- Mobile-first responsive — cards stack, charts shrink but stay
  readable.
- Currency-aware formatting using whatever currency the export
  carried. Default to `$` if absent. Group separators (`$1,420.50`).
  Tabular-nums for every numeric column.
- A footer line:
  > *Generated locally — your Amazon export never left your machine.
  > The full purchase list is embedded in this HTML and rendered
  > offline in your browser. Order IDs are masked in summary views;
  > full IDs appear only when you expand a row.*

## Data shape

```ts
DATA = {
  format: "amazon-orders",
  subtype: "items" | "orders",
  rows: [
    {
      id: "amz_000001",
      date: "2023-03-14",                  // Order Date
      shipDate: "2023-03-15" | null,
      title: "Hydro Flask 32oz Wide Mouth Bottle",
      asin: "B07GQRZ1XX" | null,
      orderId: "111-1234567-1234567",
      category: "Kitchen" | null,
      categoryInferred: false,             // true if LLM/heuristic guessed
      quantity: 1,
      itemSubtotal: 39.95,                 // pre-tax
      itemTotal: 43.45,                    // signed positive (spend)
      currency: "USD",
      status: "Delivered" | "Returned" | "Refunded" | "Cancelled" | "Pending",
      recipient: "Sam Reyes" | null,
      shipState: "NY" | null,
      carrier: "AMZL_US" | null,
      flags: ["return"] | ["cancelled"] | ["refund"] | [],
      raw: { ... }                         // original CSV row for drill-down
    }
  ],
  summary: {
    rowCount: 247,
    orderCount: 178,
    distinctItemCount: 192,                // distinct titles
    totalSpend: 8420.42,                   // sum of itemTotal
    totalSubtotal: 7820.10,
    refundedAmount: 312.40,
    refundedCount: 6,
    cancelledCount: 3,
    currencySymbol: "$",
    currencyCode: "USD",
    period: "2021-04-04 → 2025-12-30",
    durationLabel: "4 years 8 months",
    activeMonths: 49,
    distinctCategories: 11,
    distinctRecipients: 3,
    topCategory: "Books",
    topCategoryShare: 0.22,
  },
  yearTotals: [
    { year: "2021", spend: 1240.50, orders: 28, items: 34, topCategory: "Books" },
    ...
  ],
  monthTotals: [
    { month: "2023-03", spend: 1140.00, orders: 12, items: 17 },
    ...
  ],
  categoryTotals: [
    { category: "Books", spend: 1840.20, items: 73, share: 0.22, inferred: false, monthly: [...] },
    ...
  ],
  reorders: [
    {
      key: "B07GQRZ1XX",
      title: "Hydro Flask 32oz Wide Mouth Bottle",
      timesOrdered: 5,
      totalQuantity: 6,
      totalSpend: 217.25,
      firstSeen: "2022-04-01",
      lastSeen: "2024-08-10",
      cadenceLabel: "every ~6 months",
      cadenceTag: "habit" | "subscribe" | "splurge-rebuy",
      sampleItemIds: ["amz_000031","amz_000094",...]
    },
    ...
  ],
  recipients: [
    { name: "Sam Reyes", spend: 4820.10, items: 142, share: 0.57, topItems: [...] },
    ...
  ],
  returnsAndRefunds: {
    returned: [{ id, title, date, amount, reason }],
    cancelled: [{ id, title, date, amount }],
    problem: [{ id, title, date, amount, kind: "late"|"lost"|"damaged" }],
  },
  meta: {
    sourceFile, sizeBytes,
    headers, detectedColumns,
    currencyCode, currencySymbol,
  }
}
```

The parser pre-computes `summary` / `yearTotals` / `monthTotals` /
`categoryTotals` / `reorders` / `recipients` / `returnsAndRefunds` —
do **not** re-derive them on the client. Walking thousands of items
to compute reorder cadence freezes mobile browsers. Use the
pre-aggregated arrays directly; iterate over `rows` only for the
drill-down table render.
