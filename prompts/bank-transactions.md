# bank-transactions — bank / credit-card statement CSVs

A bank or credit-card export. The interesting story is **where the
money is going**, **what's recurring**, and **what looks unusual** —
not "the file's contents in HTML form".

This prompt is loaded *after* the shared `_finance.md` family
contract. The five required sections are non-negotiable; this file
adds bank-specific framing on top.

## Bank-specific layout decisions

- **Subtype framing.** If `subtype === "credit-card"`, frame the
  summary card as *"$X,XXX charged · $X,XXX paid down · $X,XXX
  current balance"* and skip running-balance timeline (credit-card
  exports rarely include it). If `subtype === "bank"` and the
  parser found a `balance` column, surface a running-balance line
  on the cashflow timeline.
- **Inflow vs outflow framing.** Bank/credit-card files use **signed
  amounts** in `DATA.rows[].amount` — negative is outflow, positive
  is inflow. The summary card always reports them separately and
  shows the net. Don't sum signed amounts blindly.
- **Recurring panel framing.** Sort recurring entries by absolute
  monthly cost (descending) so the biggest subscriptions / utilities
  are on top. For each entry tagged `subscription` (small, regular,
  software-shaped), show a small "subscription" chip — these are
  the ones the user might actually want to cancel.
- **Anomaly cards lead with duplicates.** A `duplicate` flag is the
  single most actionable thing in a bank file (often the user was
  charged twice). Render the duplicates panel above outliers and
  first-time vendors when both are present.
- **Cashflow timeline.** Per-day inflow vs outflow as a stacked or
  twin-bar chart. If the file spans > 60 days, switch to per-week
  bins. Mark payroll cycles, large refunds, and the day with the
  largest single outflow as labelled events.
- **Top vendors leaderboard.** Top 10 by total outflow, plus top 5
  inflow sources (often the user's employer or main client). Click
  a vendor to filter the drill-down table to just that vendor's
  rows.

## What to skip for bank files

- Don't render an aging panel — that's invoice-only.
- Don't render an account-tree panel — that's QuickBooks-only.
- Don't surface invoice statuses — bank files don't have them.

## Drill-down table columns

Default columns (left to right): **Date**, **Description**,
**Merchant**, **Category**, **Amount**, **Balance** (if
`hasBalance`). Right-align Amount and Balance, tabular-nums.
Negative amounts in `var(--red)` with a leading `−` glyph (not red
parentheses). Click a row to expand and show the original raw CSV
record.

## Tone

Personal-finance / SMB-bookkeeper register. *"$4,630 net outflow
this month — payroll cycle on Jan 15 was the largest single day
($12,400 out), and software subscriptions add up to $312/mo across
8 vendors."* Not "Your finances are looking great!". Observational,
specific to the file.
