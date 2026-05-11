# lab-results — laboratory results CSV with reference ranges

A CSV of laboratory test results with reference ranges. Detected
when the headers contain a test/analyte column, a value/result
column, and either reference-low + reference-high columns *or* a
combined reference-range column. May span multiple draws over time
for trend display.

The output is **not a clinical interpretation tool** — it's a
patient-facing organizer that surfaces *which values are outside
the reference range printed on the row, when each draw happened,
and what the user should ask their clinician about*, with the full
panel as drill-down.

> **Hard rule.** This output never says a value is "abnormal",
> "elevated", "low", or "indicates X". It says *"outside the
> reference range printed on this row"*. It never derives a
> condition from a value, never recommends a follow-up test, and
> never compares against a population or guideline the file does
> not include. The footer makes clear the page is not medical
> advice.

## What to surface (in addition to the family contract)

### Out-of-reference panel

The most useful card on the page. List every row whose value falls
outside the reference range *as printed on that row* (not a range
you computed from population data). Show:

- **Test** name (verbatim), unit (verbatim).
- **Value** for the most recent draw.
- **Reference range** quoted from the source row.
- **Direction** — "above" or "below" the band; never "high" /
  "low" with implied severity.
- **Date drawn**, lab if named, ordering provider if named.
- **Inferred** chip — the band check is a numeric comparison, not
  a clinical determination.

Sort by direction then test name. For panels with no out-of-band
rows, show: *"No values fall outside the reference ranges printed
in this file."*

### Trend sparklines (when the same test appears more than once)

Render a small inline-SVG sparkline per unique test, with:

- The reference band shaded behind the line.
- One dot per draw, dated.
- Latest value labeled.
- Tabular numeric value chips below.

No interpretive labels ("trending up", "improving"). Just the
visual.

### Panel grouping

Group rows by **panel** (CBC, CMP, Lipid, A1c, Thyroid, etc.) when
the source includes a panel/group column. Otherwise group by
ordering date. Each panel renders as a sortable, filterable table:
test | value | unit | reference | direction | date.

### Open lab questions (next-question list)

Phrase as questions:

- *"Ask the clinician whether the LDL value of 162 mg/dL on
  2026-04-12 — outside the reference range printed on this row —
  changes the current plan."*
- *"Ask whether the missing ferritin reference range on the
  2026-03-08 draw was an oversight or whether the lab uses
  age-specific bands."*

Never imperative ("you should follow up on your LDL"). Always
inquisitive ("ask whether…").

## Detection / data shape

The CSV is detected by header pattern; the parser pre-extracts
panels, units, reference ranges, and per-row direction.

```ts
DATA = {
  format: "lab-results",
  rows: [
    {
      id: "row_001",
      test: "LDL Cholesterol",
      panel: "Lipid Panel" | null,
      value: 162,                        // null if non-numeric
      valueText: "162",                  // verbatim text
      unit: "mg/dL",
      referenceLow: 0,                   // null if not present
      referenceHigh: 100,                // null if not present
      referenceText: "<100 mg/dL",       // verbatim — used in callouts
      direction: "above" | "below" | "in-range" | "no-range" | "non-numeric",
      collectedAt: "2026-04-12",
      orderingProvider: "Dr. Lin" | null,
      lab: "Quest Diagnostics" | null,
      raw: { ... }                       // original CSV row
    }
  ],
  outOfRange: [...],                     // rows where direction is above/below
  panels: [{ name: "Lipid Panel", count: 5, outOfRangeCount: 1 }],
  trends: [{ test: "A1c", points: [{date, value, unit}], referenceLow, referenceHigh }],
  summary: {
    rowCount: 18,
    panelCount: 4,
    drawCount: 3,
    outOfRangeCount: 2,
    period: "2026-01-12 → 2026-04-12",
    durationLabel: "3 months",
  },
  meta: { sourceFile, ... }
}
```

## Tone

Patient-organizer voice. Quote the reference range exactly as
written. Use "outside the reference range printed on this row" as
the canonical phrase for out-of-band rows. Never "abnormal", never
"elevated", never "concerning".

## Required sections (must always render)

All six from `_sensitive.md` plus:

- Out-of-reference panel labeled "Outside reference range".
- Trend sparklines section labeled "Trends" when ≥1 test has ≥2
  draws; otherwise the section can be omitted.

## Caveat — included in the footer (non-negotiable)

> *Organizational summary, not medical advice. Out-of-range flags
> compare numbers to the reference range printed on the same row
> in your file — they are not a diagnosis. Bring the original lab
> report to your clinician and ask them whether any value here
> changes your care.*
