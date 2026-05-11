# quickbooks — QuickBooks / Xero / Wave CSV reports

A general-ledger or P&L-style export from QuickBooks, Xero, Wave,
or Sage. Rows are categorized accounting entries with **account**,
**class**, optional **subaccount hierarchy**, and signed amounts.
The interesting story is **how spend rolls up across accounts**,
**which accounts dominate**, and **what's unusual within the
period**.

This prompt is loaded *after* the shared `_finance.md` family
contract. The five required sections are non-negotiable; this file
adds GL/P&L-specific framing on top.

## Report-specific layout decisions

- **Account tree, not flat categories.** QuickBooks files often
  have nested accounts like `Income:Consulting:Retainers`. The
  parser builds `DATA.accountTree` if hierarchy is detectable
  (colon-delimited or indented account names). Use it: render a
  collapsible tree with subtotals at each level, expanded one level
  by default. The leaf rows hyperlink into the drill-down table
  filtered to that account.
- **Categories panel pulls from accountTree.** If `accountTree` is
  present, the required "Categories" panel renders the **top-level
  accounts only** (Income, Expenses, COGS, etc.) with subtotals,
  not every leaf account — leaves go in the tree below.
- **Class column.** If `class` (a parallel hierarchy
  QuickBooks-style) is present, surface a small "By class" panel
  with class subtotals + share. Empty state if absent.
- **Period framing.** GL/P&L exports usually cover a fixed period
  (a month, a quarter, a fiscal year). Lead with the period and
  comparable totals, not a daily timeline. If the file spans
  multiple comparable periods, render a small "Period over period"
  bar group showing each period's net.
- **Inflow vs outflow.** GL exports use signed amounts where credit
  to an Income account = inflow and debit to an Expense account =
  outflow. The parser normalizes both into the same signed
  `amount` field — positive = revenue/credit-side, negative =
  cost/debit-side. Don't second-guess the parser; trust the sign.

## What to skip for QuickBooks files

- Don't render a recurring-vendor panel as the headline — GL
  exports already classified each row into an account, so the
  recurring panel becomes redundant. Render it only if the parser
  surfaced ≥3 recurring entries; otherwise replace with the
  "By class" panel.
- Don't render aging buckets — that's invoice-only.
- Don't render a running-balance line — GL files don't have one.

## Drill-down table columns

Default columns (left to right): **Date**, **Account**, **Class**
(if present), **Description / Memo**, **Amount**. Right-align
Amount, tabular-nums. Negative amounts in `var(--red)` with a
leading `−` glyph.

## Tone

Controller / accountant register. *"$48,210 in revenue across 4
income accounts (Consulting Retainers leads at $32,000), $52,840
in expenses across 18 expense accounts (Payroll: $18,400; Rent:
$6,200; Software: $4,840) — net loss of $4,630 for January."*
Specific, line-itemed, period-anchored. Not "Profitability is
improving!". Observational only.
