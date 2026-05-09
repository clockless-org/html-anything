# invoices — invoice / receipt / billing exports

An invoice or receipt CSV — accounts-receivable rows with
customer, amount, and status. The interesting story is **who hasn't
paid yet**, **what's overdue**, **how aged the receivables are**,
and **which customers drive the most billing**.

This prompt is loaded *after* the shared `_finance.md` family
contract. The five required sections are non-negotiable; this file
adds invoice-specific framing on top.

## Invoice-specific layout decisions

- **Summary card framing.** Replace the bank-style inflow / outflow
  card with *"$X,XXX invoiced · $X,XXX paid · $X,XXX outstanding ·
  $X,XXX overdue · N invoices, M customers"*. Treat `outstanding`
  and `overdue` as separate numbers — overdue is a strict subset of
  outstanding (past `dueDate`).
- **Required: aging buckets.** Render an "Aging" panel with the
  classic 0–30 / 31–60 / 61–90 / 90+ buckets, total amount per
  bucket and count per bucket, as a stacked bar (or four numbered
  cards). Drive from `DATA.aging`. The literal label "Aging" must
  be visible. Click a bucket to filter the drill-down table to just
  invoices in that age range.
- **Status mix donut.** Donut showing the share of paid /
  partially-paid / outstanding / overdue, both by count and by
  dollar amount. A two-state donut would be misleading — always
  show all four states even if some are 0.
- **Top customers leaderboard.** Top 10 customers by total
  invoiced, with three sub-amounts per row: invoiced, paid,
  outstanding. Highlight customers with > 30 days of unpaid
  invoices.
- **Anomaly cards lead with overdue.** For an invoice file, the
  most actionable flag is `overdue`. Render the overdue cards on
  top, then duplicates, then outliers.
- **Invoice scorecard (when timestamps allow).** If both
  `issuedDate` and `paidDate` exist on paid invoices, compute and
  show: average days to pay, median days to pay, % paid within 30
  days. If they don't exist, omit the scorecard — don't fake the
  numbers.

## What to skip for invoice files

- Don't render a running-balance line — invoices don't have one.
- Don't render a "subscriptions watch" panel — that's bank-only.
- Don't render an account-tree panel — that's QuickBooks-only.

## Drill-down table columns

Default columns (left to right): **Invoice #**, **Issued**,
**Customer**, **Amount**, **Due**, **Paid**, **Status**. Right-
align Amount, tabular-nums. Status as a coloured chip:
- `paid` → green chip
- `partially paid` → amber chip
- `outstanding` → neutral chip
- `overdue` → red chip
Click a row to expand and show the raw CSV record + a "days since
due" line for overdue invoices.

## Tone

A/R analyst register. *"$72,400 invoiced across 38 invoices and 12
customers — $27,600 still outstanding, $8,400 of that is more than
60 days overdue, all from one customer (Northwind Co.)."* Specific,
quantitative, no judgment about the customer. The page is a
collection / cashflow tool, not a complaint letter generator.
