# legal-chronology — case timelines (`.md` / `.txt`)

A free-text chronology of a legal matter: filings, hearings,
discovery dates, motion deadlines, party correspondence, and
exhibits. Often an attorney's case file, a paralegal's running
log, or a self-represented party's notebook.

The output is **not legal advice** — it's an organizational summary
that surfaces *what filings happened when, who the parties are,
which deadlines are documented, what exhibits are referenced, and
what the user should ask their attorney about*, with the chronology
as drill-down.

> **Hard rule.** This output never says a filing is *"timely"* /
> *"untimely"*, never computes a statute of limitations, never
> says a party *"must"* / *"should"* / *"is required to"* do
> anything the document doesn't already say, and never opines on
> the merits of any motion, claim, or defense. Deadlines are
> labeled *"date listed on this document"*. The footer makes clear
> the page is not legal advice.

## What to surface (in addition to the family contract)

### Case header

A small card naming:

- **Case caption** (verbatim quote, including v. / vs. notation).
- **Docket / case number** (verbatim, monospace).
- **Court / venue** (verbatim).
- **Matter type** (verbatim — only what the document says).
- **Period** the chronology covers.

### Deadline map

A small calendar lane showing every date the chronology mentions
where a party "must respond by", "is due", "is set for", or "is
calendared for". Render dates listed in the document only — do
not compute filing windows from rules of civil procedure.

Each deadline card:

- Date (in monospace).
- Source — the chronology line that named it (clickable, jumps
  to the drill-down).
- "Days from today" — a soft chip; never a verdict like
  "passed" / "you missed it". Use *"date listed on this
  document"* + a relative chip.
- A small `Inferred` pill on every parsed deadline.

### Filings & motions list

Every filing the chronology mentions: date, party who filed it,
title (verbatim), exhibit numbers if listed. No motion is marked
"granted" / "denied" unless the chronology itself says so — and
even then, surface it as a quoted ruling, not an editorial verdict.

### Open legal questions (next-question list)

Phrase as questions to bring to your attorney, e.g.:

- *"Ask counsel whether the missing reply-brief date on the
  motion to dismiss is an oversight or whether the chronology
  simply hasn't been updated."*
- *"Ask whether the discovery cutoff listed on 2026-06-15 was
  acknowledged in writing by opposing counsel — the chronology
  shows the date but no responsive filing yet."*
- *"Ask whether the exhibit list referenced as 'Exhibit C' is
  attached to your case file — the chronology cites it but no
  document number is recorded."*

Never imperative ("respond by Friday", "file a motion to compel").
Always inquisitive ("ask whether…").

### Parties + roles

Required by the family contract. For legal chronologies the role
column is especially important — render every party with one of:
*Plaintiff / Defendant / Petitioner / Respondent / Counsel for X /
Court / Witness / Expert / Third party / Other*. Source from the
chronology text only.

## Tone

Paralegal-grade. Tight, factual, no exclamation marks, no editorial
adjectives ("egregious", "frivolous", "strong", "weak"). Quotes
from the record stay in monospace. Names of parties and counsel
appear in body type. Dates and docket numbers in monospace.

## Required sections (must always render)

All six from `_sensitive.md` plus:

- Case header card (caption / docket / court / matter / period).
- Deadline map labeled "Deadlines".
- Filings list labeled "Filings".

## Caveat — included in the footer (non-negotiable)

> *Organizational summary, not legal advice. Dates, parties,
> filings, and deadlines are inferred from the chronology's text —
> verify against the original case file and ask your attorney
> before relying on anything here. Deadlines listed in this page
> are dates the document mentions; they are not legal computations
> of filing windows or statutes of limitations.*
