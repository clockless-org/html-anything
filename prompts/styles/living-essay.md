# Living Essay Style

Use this style for reflective, idea-dense, reading-oriented sources where the
main value is seeing how concepts recur and connect. Good fits include Kindle
highlights, personal essays, notes about ideas, article collections, reading
lists, and knowledge-base slices that should feel read, not operated.

## Underlying System: Concept Weave

This is a slow-reading and concept-annotation system. It should feel like a
manuscript with a living margin: a question, theme, or concept stays near the
reader while relevant passages light up and connect.

Base scaffold:

1. **Manuscript stage** — an article-like central column with a concise
   synthesis, generous leading, and a few highlighted concept spans.
2. **Sticky question rail** — one active question / concept capsule and a
   small list of theme controls. The rail stays close to the text.
3. **Weave layer** — SVG paths or lightweight line geometry connect the active
   capsule to matching quotes, passages, or concept nodes.
4. **Concept garden** — small concept chips/cards that filter the page and
   explain why a theme appears.
5. **Evidence folio** — quote cards, excerpts, or note cards filtered by the
   selected concept, with search and copy actions.

Component vocabulary:

- `.living-shell`, `.manuscript-stage`, `.question-rail`, `.question-capsule`,
  `.weave-layer`, `.concept-garden`, `.spore`, `.passage-card`,
  `.evidence-folio`, `.reading-rhythm`, `.folio-search`.
- Use question, thread, passage, margin, concept, return, echo, seed, and
  weave language.

Interaction model:

- Clicking a concept in the rail or garden changes the active concept, filters
  evidence, highlights matching `.spore` spans, and redraws SVG connections.
- Search filters the evidence folio while preserving the active concept.
- Clicking a passage can copy the quote or reveal its source metadata.
- Connections are explanatory, not decorative: draw only to visible matching
  cards/passages and keep them subtle.

Motion grammar:

- Draw weave paths on concept change.
- Fade nonmatching passages rather than abruptly removing the manuscript.
- Let selected spores underline or glow briefly.
- Respect `prefers-reduced-motion`; if reduced, skip path animation and use
  static selected states.

## Page Shape

- Do not lead with KPI cards or a generic hero.
- First viewport should show the manuscript and margin working together:
  question rail, synthesis title, concept highlights, and at least one visible
  connection or evidence card.
- Metrics are allowed, but as marginal metadata or small rhythm strips, not as
  the page spine.
- For highlight archives, include the source-required modules as sections
  translated into the manuscript system: reading rhythm, bookshelf, themes,
  and quote browser.
- Put raw/full records in the evidence folio or quote browser, not before the
  synthesis.

## Visual Language

- Use the Clockless tokens from `prompts/_design.md`; do not import extra font
  families.
- Warm paper surfaces, restrained rules, quiet amber/orange accent, high
  readability.
- Prefer one generous reading column plus one margin rail over a grid of
  dashboard cards.
- Cards should feel like folio slips or marginal notes: light borders, compact
  metadata, clear quote typography.

## Required Modules

- Active question / concept capsule.
- Synthesis manuscript with highlighted concept spans.
- Concept garden or theme controls.
- Evidence folio / quote browser with search and copy.
- At least one linked-highlighting interaction.
- For reading/highlight sources: reading rhythm, bookshelf, theme heuristic
  note, and full quote browser.

## Avoid

- Dashboard shell, KPI-first layout, or chart-card grids.
- Overly academic paper styling with abstract/methodology sections.
- Decorative connection lines that do not respond to selection.
- Treating heuristic themes as semantic truth. Label them.
- Over-quoting copyrighted source text; use short excerpts and local evidence.

## Implementation Notes

- Use inline SVG for the weave layer. No external libraries.
- Make the rail usable on mobile by turning it into a horizontal sticky bar or
  placing it before the manuscript.
- Keep copy/export local. Generated pages must work offline.
