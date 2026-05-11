# venmo-paypal-payments — Venmo & PayPal social-payments exports

Everyday peer-to-peer payment activity from **Venmo** (transaction
CSV / statement export) and **PayPal** (Activity CSV). Same shape,
different banner: the export is the *human layer of money* — who you
keep reimbursing, which trips and households create money loops, what
the notes say, and whether you're net payer or net receiver over the
window.

This prompt is loaded **after** the shared `_finance.md` family
contract. The five required finance sections still apply (summary,
breakdown, recurring, anomalies, drill-down) — but reframed for
peer-to-peer activity. **Counterparties replace merchants. Story
clusters replace category breakdowns. Loops + refunds + fees +
holds + disputes drive the anomaly panel.**

## Source-aware framing

The first thing the page must do is identify the source. The parser
sets `DATA.source` to `venmo` or `paypal`. Use it to:

- Stamp the hero card with **Venmo** or **PayPal** — never both
  generically. Example:
  *"Venmo activity · Jan 2024 → Apr 2026 · 487 transactions across 38
  people."*
- Include a small "what kind of file is this?" caption under the
  hero that explains the source in plain language. Venmo: *"This is
  your Venmo statement export. Each row is a payment, charge, fee, or
  cash-out. Notes are the human layer."* PayPal: *"This is your
  PayPal activity export. Each row is a payment, refund, fee, or
  withdrawal. Item titles and notes are the human layer."*
- Use the source's vocabulary throughout: Venmo says *"sent / received
  / charge / cash out"*; PayPal says *"payment / refund / withdrawal
  / fee"*. Don't blend them.

## Required sections (hard constraints, in this order)

The page **must** include the following sections, with the literal
section labels visible in the rendered DOM. These satisfy and extend
the `_finance.md` five-section contract.

1. **Source-aware hero card** — one row of KPIs:
   - **Sent** (absolute outflow), **Received** (absolute inflow),
     **Net** (received − sent, signed), **Transactions**, **People**
     (distinct counterparties).
   - The hero subtitle is one editorial sentence the parser pre-
     computes, e.g.: *"Sent $4,210 across 38 people, received $3,640
     back. Roommate splits drove ~40% of the volume; one travel cluster
     in March moved $1,400 round-trip with three people."*
   - For PayPal exports, swap the *People* tile to *Counterparties*
     when most rows are merchant-shaped rather than peer-shaped.

2. **Monthly cashflow timeline** ("Monthly cashflow") — twin bars per
   month for sent vs received, plus a thin net line on top. Drive
   from `DATA.monthlyCashflow`. Render as inline SVG. Highlight the
   single biggest spend month and the single biggest receive month
   inline. Empty months render as a dim placeholder rather than 0
   bars. The literal label "Monthly cashflow" must be visible.

3. **Counterparty leaderboard** ("People") — table of the top 10–15
   counterparties by total volume (paid + received). Columns:
   **Name**, **You paid**, **You received**, **Net**, **Count**,
   **First / last seen**, dominant **Story** chip. Drive from
   `DATA.counterparties`. Net is signed (positive = they net-paid you
   over the window, negative = you net-paid them). Highlight the
   "loop" rows where both directions are present — those are the
   reimbursement / split-the-bill relationships. Click a row to filter
   the drill-down. The literal label "People" must be visible.

4. **Story clusters** ("Stories") — horizontal-bar panel with the
   top 6–8 inferred story buckets (rent / food / rides / travel /
   gifts / subscriptions / reimbursement / marketplace / utilities /
   other). Drive from `DATA.stories`. Each row: bucket label, share
   %, paid + received split, transaction count, 1–3 sample notes
   (truncated to 60 chars). Story labels are explicitly **inferred
   from notes / type / funding source** — render a small `*` chip
   next to each label and a tooltip *"Heuristic — clustered from
   payment notes; not a categorical truth."* The literal label
   "Stories" must be visible. (This replaces the `_finance.md`
   "Categories" section because Venmo/PayPal don't carry categories.)

5. **Recurring panel** ("Recurring") — vendors and people the user
   pays / is paid by on a regular cadence (rent, weekly groceries
   split, monthly subscriptions split, biweekly babysitter, payroll-
   shaped inflows). Drive from `DATA.recurring`. Each row: who, paid
   vs received direction, cadence, average amount, count, last seen.
   Empty state: *"No regular reimbursement patterns detected in this
   file."* The literal label "Recurring" must be visible.

6. **Loops, refunds, fees, holds & disputes** ("Flags") — labeled
   "Flags" panel of cards. Drive from `DATA.flags`. Each card has
   one of these `kind`s — render distinct chip colors:
   - `round-trip` — *"Round-trip with NAME — sent $X then received
     ~$X back within N days."* The signature split-the-bill loop.
   - `refund` — *"Refund: NAME · status · $X."*
   - `fee` — *"$X in transfer / instant fees across N rows."*
   - `held` — *"Held / pending: NAME — $X · status."*
   - `dispute` — *"Dispute / chargeback: NAME — $X · status."*
   - `self-transfer` — *"$X moved to your bank in N transfers."*
   Empty state: *"Nothing flagged in this file."* The literal label
   "Flags" must be visible.

7. **Drill-down transaction table** ("Browse all N transactions") —
   collapsible, default to **expanded** so the file is auditable
   immediately (P2P exports are usually small enough — 100s to a few
   1000s of rows — to render without virtualization, but use the same
   "Load more" windowing pattern as the finance pack to be safe).
   - Filter chips: counterparty (top 12), story (all), direction
     (sent / received / internal), status (Complete / Pending / Held
     / Refunded), year, source (always one — but render it as a
     "stamp" chip).
   - Columns: **Date**, **Direction** (a small chip: ↗ sent · ↙
     received · ↻ internal), **Counterparty**, **Note** (privacy-
     redacted styling — see below), **Story** (chip), **Status**,
     **Amount** (signed, right-aligned, tabular-nums, negative in
     `var(--red)` with leading `−`).
   - Full-text search across counterparty / note / story / type /
     status / handle / id.
   - Click a row to expand and reveal the original raw fields. The
     full original handle / email / transaction id appears only in
     the expanded view, never in the at-a-glance row.

The drill-down is a hard requirement — peer-to-peer payments are
intimate, and the user must be able to audit every row.

## Direction & counterparty rules

- The parser pre-computes `direction` ∈ `sent | received | internal
  | fee` for every row. **Do not re-derive from amount sign on the
  client.** Internal rows (cash-outs, transfers between user's own
  accounts) must be visually distinct in the table — a small "↻"
  chip — and excluded from the People leaderboard and Stories panel.
- `counterparty` is the **other** side of the transaction (never
  the user). Rows with no counterparty are internal transfers /
  cash-outs.
- For Venmo: counterparty is `From` if direction is `received`, `To`
  if `sent`. For PayPal: counterparty is the `Name` column.

## Privacy-conscious styling (HARD)

Payment notes and counterparty names are sensitive — they often
include real people, inside jokes, addresses ("rent — 4421
Mockingbird"), or sensitive purchases. Make the page visibly
privacy-conscious:

- **Footer must explicitly state**:
  > *Generated locally — your Venmo / PayPal export never left your
  > machine. The full transaction list is embedded in this HTML and
  > rendered offline in your browser. Notes and counterparty names
  > are inlined as-is from the file you opened. For sharing, prefer
  > an anonymized export.*
- **Render notes in a redaction-style font** — slightly muted, mono
  family, with a faint underline or surface-container background,
  to signal "this is private text". Do not strip or transform the
  note content; just style it like a private quote.
- **Mask transaction IDs and email/handle identifiers** in the
  at-a-glance views. Show first 4 + last 4 with `…` between
  (`vm_00…1234`, `j…@example.com`). Show full IDs only in the
  row-expand drill-down.
- **Never fetch anything**. No avatars, no payment-rail logos hosted
  elsewhere, no "verify status" calls. The only network call allowed
  is the Google Fonts import shared with every html-anything output.
- **Privacy banner under the hero** — small, dismissable: *"This
  page never sent a network request. Everything you see is in
  this HTML file."*

## Data shape

```ts
DATA = {
  format: "venmo-paypal-payments",
  source: "venmo" | "paypal",
  rows: [
    {
      id: "vm_000001" | "pp_000001",
      source: "venmo" | "paypal",
      date: "2026-03-15",
      dateEpoch: 1742054400000,
      amount: -32.50,                 // signed: negative = sent, positive = received
      fee: 0,                          // signed (typically 0 or small negative)
      currency: "USD",
      type: "Payment" | "Charge" | "Transfer" | "Refund" | "Fee" | "Withdrawal" | ...,
      direction: "sent" | "received" | "internal" | "fee",
      status: "Complete" | "Pending" | "Held" | "Refunded" | ...,
      counterparty: "Riley Park" | null,
      counterpartyHandle: "j@example.com" | null,
      isUserCounterparty: false,
      note: "rent · 🏠 March",
      story: "rent" | "food" | "rides" | "travel" | "gifts" | "subscriptions" | "reimbursement" | "marketplace" | "utilities" | "cash-out" | "other",
      storyInferred: true,             // always true — heuristic
      fundingSource: "Venmo balance" | null,
      destination: "Bank ****4421"   | null,
      flags: ["refund"] | ["fee"] | ["round-trip"] | ["self-transfer"] | [],
      raw: { ... }                     // original CSV row, for drill-down
    }
  ],
  summary: {
    rowCount: 487,
    sentTotal: 4210.00,
    receivedTotal: 3640.00,
    net: -570.00,
    feeTotal: 18.40,
    refundTotal: 42.00,
    internalTotal: 1820.00,
    currencyCode: "USD",
    currencySymbol: "$",
    period: "2024-01-04 → 2026-04-30",
    durationLabel: "2 years 4 months",
    monthsActive: 28,
    distinctCounterparties: 38,
    topCounterparty: "Riley Park",
    topStory: "rent",
    topStoryShare: 38.4,
    source: "venmo" | "paypal",
  },
  counterparties: [
    { name: "Riley Park", paid: 1820.00, received: 1450.00, net: -370.00, count: 24, firstSeen: "2024-02-01", lastSeen: "2026-04-15", story: "rent", loopHint: true },
    ...
  ],
  stories: [
    { story: "rent", paid: 1820.00, received: 1450.00, net: -370.00, count: 24, share: 38.4, sampleNotes: ["rent · 🏠 March", "rent + utilities", "🏠"] },
    ...
  ],
  monthlyCashflow: [
    { month: "2024-01", sent: 240.00, received: 180.00, net: -60.00, count: 6 },
    ...
  ],
  recurring: [
    { name: "you sent Riley Park", cadence: "monthly", avgAmount: 600.00, count: 24, lastSeen: "2026-04-15", story: "rent" },
    ...
  ],
  flags: [
    { kind: "round-trip", label: "Round-trip with Sam Lee", detail: "$80 sent on 2026-03-12, then $80 received on 2026-03-15", rowIds: ["vm_000123","vm_000131"] },
    { kind: "fee", label: "8 fees", detail: "$18.40 in transfer/instant fees across 8 rows", rowIds: [...] },
    { kind: "self-transfer", label: "12 cash-outs", detail: "$1,820 moved to your bank in 12 transfers", rowIds: [...] },
    ...
  ],
  meta: { sourceFile, sizeBytes, source, rowCount, currencyCode, currencySymbol, period, durationLabel, distinctCounterparties, sentTotal, receivedTotal, net }
}
```

Use the pre-aggregated `summary` / `counterparties` / `stories` /
`monthlyCashflow` / `recurring` / `flags` arrays directly. Don't
re-derive them on the client — the parser already did the math.
Walk `rows` only for the drill-down render.

## Tone

Personal-finance / friend-with-a-spreadsheet register. *"You're
basically the household banker here — $1,820 sent to Riley over the
window, $1,450 back, net $370 short. Travel was the one big ad-hoc
cluster (March 2026, $1,400 round-trip with three people). Most
months you net out within $100 either way."* Not "Your social
spending is on trend!". Specific to the file, observational, friendly.

## Hard editorial rules — analytical, not advice

This output is **analytical only**, never accounting / tax / legal
advice. The page **must not**:

- Use the words "advice", "owe", "should pay", "tax-deductible",
  "report to the IRS", "1099", "P2P income", "report this", or any
  phrasing that implies a tax determination.
- Recommend a specific course of action ("you should ask Riley to
  pay you back", "categorize this as a deduction"). Describe what's
  in the file; do not prescribe what to do.
- Compute or claim "tax owed" or "deductible amount". Even though
  PayPal exports may include 1099-K-relevant rows, never label them
  that way.
- Imply the story-cluster categorization is canonical — note-based
  story clustering is pattern-matching on the user's own notes, not
  authoritative classification.

The page **must** include a footer line:
> *Analytical summary, not tax, accounting, or legal advice. Story
> clusters are inferred from your payment notes — verify against
> your records before acting on anything here.*

## Always include

- Light + dark mode (`prefers-color-scheme`).
- Mobile-first responsive — KPI cards stack, twin bars stay
  readable, counterparty table becomes horizontally scrollable, story
  clusters wrap.
- Inline SVG charts only. No CDNs. No tile services. No data fetched
  at render or click time.
- Currency-aware: format every amount with the symbol the parser
  detected (`DATA.summary.currencySymbol`, default `$`). Use grouping
  separators (`$1,820.00`). Tabular-nums (`font-variant-numeric:
  tabular-nums`) for every amount and date column.
- Negative amounts in `var(--red)` with a leading `−` glyph (not red
  parentheses).
- "Copy as Markdown" button at the bottom that captures the hero,
  top counterparties, top stories, and recurring patterns as a
  shareable note (no raw transactions).
- All footer text from the privacy + analytical-only sections above.

## Source-specific framing

### Venmo

- Each row is one of: **Payment** (you sent), **Charge** (you
  received via a charge / request), **Transfer** (cash-out from your
  Venmo balance to a bank), **Refund**, **Fee**, **Hold**.
- Notes are usually short and emoji-heavy ("🍕", "rent 🏠", "🚗",
  "thx!"). Treat emoji as first-class story signals (the parser
  already does this).
- `Funding Source` and `Destination` are useful for cash-out rows
  but uninteresting for peer rows — only surface them in the
  expanded row view.
- The header row sometimes follows a 2-3 line "Account Statement"
  preamble; the parser strips this.

### PayPal

- Each row is one of: **Payment**, **Refund**, **Reversal**,
  **Withdrawal**, **Subscription Payment**, **Fee**, **Transfer**.
- Notes are sparser — frequently fall back to the `Item Title` or
  `Subject` field. The parser already merges these into `note`.
- Some PayPal exports mix peer and merchant rows. Don't try to
  separate; let the counterparty table speak for itself (a frequent
  named individual vs a one-time merchant becomes obvious in the
  count column).
