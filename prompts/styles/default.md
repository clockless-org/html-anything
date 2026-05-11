# Default Style

Use this style when the request or source does not clearly demand a specialized
shape. The default should still feel designed and intentional, not like a plain
document dump.

## Underlying System: Insight Brief

This is a compact brief system for ambiguous inputs. It is not a dashboard or
article by default.

Base scaffold:

1. **Answer header** — a short direct title, one useful sentence, and 2-4
   "what matters" chips.
2. **Primary insight panel** — the single most useful chart, comparison,
   timeline, or summary surface.
3. **Evidence stack** — 3-5 sections ordered by usefulness, each with a clear
   claim and supporting rows/snippets.
4. **Local drill-down** — search/filter/browse only after the interpretation.

Component vocabulary:

- `.brief-header`, `.answer-strip`, `.primary-insight`, `.evidence-stack`,
  `.source-browser`, `.useful-chip`.
- Use cards sparingly; prefer one strong panel plus grouped evidence rows.

Interaction model:

- Search, copy, and filter only where they help.
- If the source is small, avoid heavy controls and make it read like a concise
  analyst note.

## Page Shape

- Start with a concise answer to "what is this?" and "why should I care?"
- Put the most useful summary or interaction in the first viewport.
- Organize the rest into 3-6 clear sections based on the source: highlights,
  timeline, themes, notable records, flags, and searchable detail.
- Include a drill-down when the source has many records.
- Prefer one strong visual story over many small decorative charts.

## Visual Language

- Use the Clockless tokens from `prompts/styles/_design.md`.
- Warm, clean, readable, and practical.
- Use cards only for repeated items or genuinely grouped panels.
- Use restrained accent color for the most important numbers, links, and active
  states.

## Avoid

- Generic landing-page hero copy.
- Explaining the internal pipeline.
- Showing raw data before the useful interpretation.
- Overfitting to a source type that is only weakly detected.

## Implementation Notes

- Mobile-first, inline CSS and JS, no external JS/CDN.
- Add search/filter/copy only where they help the user use the page.
- If the source is private, mask identifiers unless the user asks otherwise.
