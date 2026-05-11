# medical-visit — clinical visit summaries (`.md` / `.txt`)

A free-text clinical summary written by or for a patient: visit
notes, discharge summaries, after-visit summaries (AVS), care-plan
documents, or a markdown chronological log of clinic / hospital
encounters. The output is **not a chart viewer** — it's an
organizational summary that surfaces *when the patient was seen,
who saw them, what was decided, and what's still pending*, with the
visit log as drill-down.

> **Hard rule.** This output organizes a record; it never
> diagnoses, prognoses, prescribes, recommends a treatment, or
> interprets a clinical finding. Out-of-range values are flagged as
> *"outside the reference range printed on this row"* — never as
> *"abnormal"* or *"indicates X"*. The footer makes clear the page
> is not medical advice.

## What to surface (in addition to the family contract)

The family contract (`_sensitive.md`) already requires summary,
timeline, parties, documents, missing & next-questions, and the
drill-down. On top of that, design for these:

### Visit / encounter cards (the headline of the page)

For each encounter, render a card showing:

- **Date** + **encounter type** (Office visit / Telehealth /
  ER / Hospital admission / Specialist consult / Lab draw).
- **Provider** — name + role (PCP, endocrinologist, NP, RN, etc).
- **Reason for visit** — verbatim quote when present, never
  paraphrased.
- **Vitals** if recorded (BP, HR, weight, temp). Render as
  label-only numbers in monospace; no green/red interpretation
  chips, no "elevated" / "low" labels.
- **Plan of care** — verbatim one-line quote of the plan section
  when present.
- **Follow-up** — date or interval the record mentions; mark "not
  present in this record" if absent.

Cards link to the underlying paragraph in the drill-down.

### Medication mentions panel

If the record references medications, list them: name, dose
(verbatim), instructions (verbatim), prescribed date if mentioned.
Do **not** classify as "active" / "discontinued" unless the record
itself does. Each row carries a small `Inferred` chip.

### Open clinical questions (next-question list)

The family contract's "Missing & next questions" section is the
operative one. Phrase items as questions to bring to the next
appointment, e.g.:

- *"Ask the clinician whether the elevated A1c result on
  2026-04-12 changes the current treatment plan."*
- *"Ask the clinic to confirm the next colonoscopy interval — the
  record names the procedure but not the recall date."*
- *"Ask whether the medication list still reflects what is
  currently being taken — three meds were started across these
  visits and one was changed."*

Never imperative ("call your doctor about your A1c"). Always
inquisitive ("ask whether…").

## Tone

Patient-organizer voice — the kind of summary a careful family
member would write before a follow-up visit. Tight, factual, no
exclamations, no bolded warnings, no emojis. The page should feel
useful to bring to an appointment, not alarming to read alone at
home.

## Required sections (must always render)

All six from `_sensitive.md` plus:

- Encounter cards row, labeled "Visits" or "Encounters".
- Medication mentions panel labeled "Medications" if any are
  referenced; otherwise the section can be omitted.

## Caveat — included in the footer (non-negotiable)

> *Organizational summary, not medical advice. Visit dates,
> providers, and out-of-reference values are inferred from the
> file's text — bring the original record to your clinician and ask
> them whether anything here changes your care.*
