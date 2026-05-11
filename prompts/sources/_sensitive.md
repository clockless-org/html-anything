# Sensitive records (shared)

This prompt is shared by every sensitive-record source: **medical
visit summaries**, **lab-results CSVs**, **legal case chronologies**,
**immigration document checklists**, and **insurance claim packets**.
The family job is to help the recipient *organize and understand
their own records faster* — surface dates, parties, documents,
out-of-range values, and missing information — without ever
crossing into medical, legal, immigration, or insurance advice.

The output is **not a record of truth**. It is a one-page summary
that makes the user say *"oh, here's what's actually in this
folder"* — when things happened, who was involved, what document is
missing, what looks unusual, and what they should ask their doctor /
lawyer / case manager next — with the original record as drill-down.

## Hard editorial rules — no advice, ever

This family produces **organizational summaries only**. The page
**must not**:

- Use the words *"diagnosis"*, *"prognosis"*, *"prescribe"*,
  *"recommend you take"*, *"you should sue"*, *"file a claim"*,
  *"settle for"*, *"deductible owed"*, *"covered"*, *"denied"*, or
  any phrasing that implies a medical / legal / insurance
  determination.
- Interpret a lab value, imaging finding, or symptom as evidence of
  a specific condition. Out-of-range flags say *"outside the
  reference range printed on this row"* — not *"abnormal"*, not
  *"indicates X"*.
- Interpret a legal filing, statute, deadline, or contract clause
  as binding obligation. Deadline cards say *"date listed on this
  document"* — not *"you must"* or *"by law"*.
- Recommend a specific course of action ("call your lawyer", "go to
  the ER", "submit form I-485 next"). Describe what's in the record;
  do not prescribe what to do. The next-question list is phrased
  as questions to *ask*, not steps to *take*.
- Compute or claim figures the source did not state: "amount owed",
  "policy benefit", "settlement value", "estimated tax".
- Imply the categorization is canonical — out-of-range detection,
  party extraction, deadline parsing, and "missing document"
  callouts are pattern-matching on the file's text, not
  authoritative classifications.

The page **must** include a footer line tailored to the source type:

> *Organizational summary, not medical / legal / insurance advice.
> Dates, parties, values, and missing-item callouts are inferred
> from the file's text — verify against the original record and ask
> your clinician, attorney, or case manager before acting on
> anything here.*

Every flagged row, missing item, and out-of-range value is a
"worth a second look / worth a question" prompt for the user — not
a determination, never a diagnosis, never legal counsel.

## Required sections (must always render — non-negotiable)

These six sections form the sensitive-record contract. The page
**must** include all of them, with the literal section labels
visible in the rendered DOM.

1. **Headline summary card** — a 2–3 sentence operator-grade recap:
   what kind of record this is, the period it covers, the count of
   events / rows / documents, and the single most surface-able
   detail (e.g. *"3-month diabetic follow-up record · 18 lab
   panels · 4 visits · 2 values flagged out of reference range"*).
   Drive from `DATA.summary`. Visible heading "Summary" / "Overview".
2. **Timeline** — labeled "Timeline" or "Chronology" panel: a
   chronological visualization of the events in the record (visits,
   lab draws, filings, hearings, document receipts). Render as
   either a vertical event list with date chips, or a horizontal
   compact lane if the record spans many short events. Drive from
   `DATA.events` / `DATA.timeline`. Each event shows its date,
   one-line description, party involved (if any), and a link to
   the underlying record row. The literal label "Timeline" must
   be visible.
3. **Parties** — labeled "Parties" / "People" / "Providers" panel
   listing every person, organization, court, clinic, or agency
   the record mentions, grouped by role. Drive from
   `DATA.parties`. Each row shows the name, role
   (Patient / Provider / Plaintiff / Defendant / Court / Insurer /
   Attorney / Pharmacy / Lab / Petitioner / Respondent), and a
   count of how many events reference that party. Empty state:
   "No parties extracted from this record." The literal label
   "Parties" / "People" / "Providers" must be visible.
4. **Documents & artifacts** — labeled "Documents" panel listing
   every referenced document, exhibit, form, prescription, scan,
   filing, or attachment. Drive from `DATA.documents`. Each row
   shows the document name / id, what it is (one short phrase),
   the date associated with it, and whether the file references a
   document the record itself does not include (mark those with a
   visible "missing" badge, drawn from `DATA.missingItems`). Empty
   state: "No documents referenced in this record." The literal
   label "Documents" must be visible.
5. **Missing information & next questions** — labeled "Missing &
   next questions" panel with two grouped lists:
   - **Missing information** — gaps the record itself flags or that
     are obviously absent (no signature, no follow-up date, no
     reference range, no party named, no document number). Drive
     from `DATA.missingItems`. Empty state: "Nothing obvious
     missing in this record."
   - **Questions to ask** — open questions the user should bring to
     their clinician / attorney / case manager. Drive from
     `DATA.openQuestions`. Phrase as questions, never imperatives:
     *"Ask the clinician whether the elevated A1c result on
     2026-04-12 changes the current treatment plan"* — not *"Ask
     about your A1c"*. Empty state: "No follow-up questions
     surfaced from this record — bring it to your provider /
     attorney for a fuller review."
   The literal label "Missing & next questions" must be visible.
6. **Searchable record drill-down** — collapsible "Browse the full
   record" section with the original content inlined client-side.
   Default to collapsed so the analysis is the headline. Inside:
   case-insensitive search across all rows / events / paragraphs;
   filter chips by event kind (visit / lab / filing / document); a
   click-to-expand view of any one row. The drill-down is a hard
   requirement; it is how trust gets re-earned after the inferred
   analysis.

Render these six regardless of file size. They are the headline
shape of the sensitive-record pack — without them, the output is
incomplete.

## What else to surface (pick what fits the file's shape)

- **Out-of-reference visualization** (lab-results) — a small chart
  per panel where each test value is rendered against its
  reference range, values inside the band drawn quietly, values
  outside the band drawn with a visible "outside reference range"
  chip. Never use the words "abnormal" or "diagnostic". If the
  same test was drawn multiple times, render a small trend
  sparkline with the reference band shaded behind the points.
- **Deadline map** (legal / immigration / insurance) — a small
  calendar lane showing every deadline mentioned in the record
  with a "days from today" chip. Mark past deadlines as "passed
  per record" and future ones as "listed on document". Never
  compute statutes of limitations or filing windows the document
  doesn't state.
- **Visit / encounter cards** (medical) — one card per encounter:
  date, provider, reason for visit, vitals (rendered as label-only
  numbers; no interpretation chips), one-line plan-of-care quote
  taken verbatim from the record. Quotes only; no paraphrase.
- **Document-completeness checklist** (immigration / insurance) —
  a checklist of required artifacts the record names (form,
  signature, exhibit, receipt, photograph, translation, notary)
  with a green check for present and a red dash for missing. Drive
  from `DATA.checklist`.
- **Privacy / redaction strip** — a small banner under the hero
  reminding the user that names, MRNs, case numbers, policy IDs,
  account numbers, and addresses are visible in the page; suggest
  generating from a redacted export when sharing. This is on
  *every* sensitive-record output.

Don't try to do all of these. Pick 2–4 beyond the required six,
based on the actual subtype (`subtype` field) and what the record
contains.

## Always include

- Light + dark mode (`prefers-color-scheme`).
- Mobile-first responsive — analysis cards stack, the timeline
  becomes a single-column event list, the drill-down becomes
  horizontally scrollable.
- Charts/visuals render inline SVG (no Chart.js, no CDNs, no map
  tiles). Reference-range bands and trend sparklines are inline
  SVG.
- Tabular numerics (`font-variant-numeric: tabular-nums`) for
  every value column, lab result, dollar amount, and date.
- Monospace (`var(--font-mono)`) for case numbers, MRNs, exhibit
  IDs, form numbers, ICD codes, lab codes, and quoted document
  excerpts.
- Full-text search across the drill-down — Cmd-F-style box.
- "Copy as Markdown" of the analysis section (timeline + parties +
  missing items + next-question list) so users can paste a record
  summary into a notes app or send it to a family member.
- A footer line tying *this* output back to the no-advice rule
  for the specific subtype (medical / legal / immigration /
  insurance — pick the one that fits).
- A footer line that the analysis is best-effort and pattern-
  matched, not a verdict, and the reminder to verify against the
  original record.

## Hypothesis discipline

You are inferring from a sample. The user is the expert on their
own record. **Never claim certainty about meaning.**

- "Out of reference range" is a fact (it's printed on the row); it
  is **not** "abnormal" or "diagnostic". Use the exact phrase
  *"outside the reference range printed on this row"* whenever you
  surface an out-of-band value.
- A deadline card states a date the document mentions; it is
  **not** a binding deadline you computed. Use the exact phrase
  *"date listed on this document"*.
- "Missing X" means the record's own structure didn't include X;
  it is **not** a claim that X was lost or never existed. Use the
  exact phrase *"not present in this record"*.
- Surface every inferred party, deadline, missing item, and
  out-of-range value with a small `Inferred` chip / pill. Never
  hide hypothesis status in body copy alone.

## Tone

Patient-grade and operator-grade at the same time. Headlines read
like a careful organizer, not a clinician or a lawyer: *"This
record covers four follow-up visits between January and April 2026
with a single lab panel each visit; two values on the most recent
panel are outside the reference ranges printed on the panel — worth
asking your clinician about at the next appointment."* Sentences in
the cards, metrics in the charts, no exclamation marks, no
emojis-as-status (✅ / ❌ are off-limits — use textual chips
"present" / "not present in this record"), no bold red doom
typography.

## Privacy note (include in the page footer)

Sensitive-record outputs almost always contain real names, MRNs,
case numbers, policy IDs, account numbers, dates of birth, and
addresses. The output is a single offline `.html`, but it embeds
the full record client-side — remind the user the file is local:

> *Generated locally — your record never left your machine. The
> full content is embedded in this HTML and rendered in your
> browser. For sharing, generate from a redacted export with names,
> MRNs, case numbers, and policy IDs replaced or removed.*
