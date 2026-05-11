# Living Essay Style

Use this style for reflective, idea-dense, reading-oriented sources where the
main value is seeing how concepts recur and connect. Good fits include Kindle
highlights, personal essays, notes about ideas, article collections, reading
lists, and knowledge-base slices that should feel read, not operated.

## Underlying System: Mycelium Writing Environment

This is a slow-reading manuscript system inspired by a mycelium / fermentation
writing environment. It should feel sparse, literary, and alive: a vertical
question capsule sits in the margin while thin SVG hyphae grow toward small
highlighted "spore" words in the text. It is closer to a poetic reading tool
than a product dashboard.

Base scaffold:

1. **Paper manuscript** — a single central reading column, generous leading,
   justified paragraphs, minimal metadata, and an essay-like synthesis.
2. **Vertical question capsule** — one sticky pill in the left margin, vertical
   writing mode on desktop, with a subtle pulsing border.
3. **Mycelium layer** — fixed inline SVG paths that slowly grow, sustain, and
   fade between the capsule and visible `.spore` words.
4. **Spore words** — inline terms inside the manuscript. They underline when
   connected or selected and can focus the underlying evidence.
5. **Quiet appendix** — source-specific modules such as reading rhythm,
   bookshelf, themes, and quote browser appear after the essay as simple
   ruled lists or thin strips, not as cards.

Component vocabulary:

- `.layout`, `.mycelium-layer`, `.question-zone`, `.capsule-container`,
  `.question-capsule`, `.manuscript`, `.meta-data`, `.spore`,
  `.analysis-fields`, `.seed-row`, `.book-row`, `.quote-row`,
  `.reading-rhythm`, `.folio-search`.
- Use question, soil, spore, hyphae, thread, residue, return, shelf, field, and
  fermentation language.

Interaction model:

- Clicking the capsule rotates the active question.
- Clicking a `.spore` focuses the related theme or book and updates the quiet
  appendix below.
- Mycelium paths can appear probabilistically over visible spores; they should
  feel alive, not like a static network diagram.
- Search filters the quote browser while preserving the selected spore.
- Spore/theme focus must be keyboard accessible. If the visual thread map is
  hard to operate, provide a quiet list in the appendix with the same themes.

Motion grammar:

- SVG paths grow from the capsule, pause, then recede.
- The capsule border pulses slowly.
- Selected or connected spores underline quietly.
- Respect `prefers-reduced-motion`; if reduced, skip path animation and use
  static selected states.

## Page Shape

- Do not lead with KPI cards, chart panels, a top bar, a grid, or a generic
  hero.
- First viewport should look like a quiet essay page: left vertical capsule,
  central title, metadata, paragraphs, inline spores, and living lines.
- Put metrics and source-required modules below the manuscript as simple ruled
  sections.
- For highlight archives, include reading rhythm, bookshelf, themes, and quote
  browser, but keep them subordinate to the manuscript environment.
- Put raw/full records in the evidence folio or quote browser, not before the
  synthesis.

## Visual Language

- Use the Clockless tokens from `prompts/_design.md`; do not import extra font
  families.
- Warm off-white paper (`#faf9f7`), ink text, restrained hairlines, muted
  mycelium gold (`#cfa86e`), and almost no shadows.
- Prefer one 680px manuscript column plus a 240px margin rail. Avoid wide
  app-shell layouts.
- Use large literary title type and long line-height. Body copy should feel
  like an essay, not SaaS copy.
- Avoid cards where a ruled row, simple list, or text passage would work.

## Required Modules

- Active question / concept capsule.
- Synthesis manuscript with inline `.spore` spans.
- Animated or selected mycelium links from capsule to visible spores.
- Quiet theme controls or spore rows.
- Evidence folio / quote browser with search.
- For reading/highlight sources: reading rhythm, bookshelf, theme heuristic
  note, and full quote browser.

## Avoid

- Dashboard shell, KPI-first layout, chart-card grids, or product-app chrome.
- Overly academic paper styling with abstract/methodology sections.
- Decorative connection lines that do not respond to selection.
- Treating heuristic themes as semantic truth. Label them.
- Over-quoting copyrighted source text; use short excerpts and local evidence.

## Implementation Notes

- Use inline SVG for the weave layer. No external libraries.
- Make the rail usable on mobile by turning it into a horizontal sticky bar or
  placing it before the manuscript.
- Keep copy/export local. Generated pages must work offline.
