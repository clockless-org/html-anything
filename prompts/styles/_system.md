# Structural Style System Contract

Styles in html-anything are **design systems + layout systems**, not CSS
themes.

The selected style must decide the generated page's:

- information architecture,
- first viewport composition,
- layout scaffold,
- component vocabulary,
- density and reading rhythm,
- chart grammar,
- interaction model,
- visual tone,
- copy voice.

Do not create one generic report and then recolor it. Build from the
selected system's skeleton first, then fill it with source-specific analysis.

## Style Fidelity Contract

Style fidelity is a hard requirement. A generated page is wrong if it satisfies
the source prompt but does not visibly inhabit the selected style.

When a style is derived from a reference HTML, design, screenshot, or motion
study, preserve the reference's core invariants:

- first viewport geometry,
- dominant layout scaffold,
- typography roles,
- color/surface palette,
- component vocabulary,
- spacing rhythm,
- interaction model,
- motion grammar,
- negative space,
- what is deliberately absent.

Do not "improve" a style by adding generic product chrome, hero blocks, KPI
cards, dashboards, or grids unless that exact style calls for them. If the
reference is sparse, the generated page must stay sparse. If the reference is
an app/workbench, the generated page must feel like an app/workbench. If the
reference is a manuscript, the generated page must begin as a manuscript.

Before writing the final HTML, internally answer:

1. What are the 5-8 visual/structural invariants of this style?
2. Which source-required modules must be translated into that system?
3. What generic html-anything/default pattern would violate the style?

The final HTML must pass that self-check.

## Catalog Metadata Preflight

html-anything keeps compact style metadata in `prompts/styles/catalog.json`.
This borrows a useful pattern from Open Design: the skill-level instructions
stay simple, while each design system carries its own examples, required
primitives, and anti-patterns.

Before generating, use the injected catalog metadata to answer:

1. What underlying system is this page supposed to inhabit?
2. Which example/preview proves the visual target?
3. Which primitives must appear in the HTML?
4. Which generic fallback would make the output feel fake?

If catalog metadata and the full style prompt differ, the full style prompt
wins on visual detail; the catalog wins on routing, example linkage, and
checklist completeness.

## Reference Example Pass

If the catalog entry names `referenceHtml`, read that file before generating
the new page. Reference files live under `prompts/styles/references/` so the
installed skill has the same target surface as the checked-in demo. If
`referenceHtml` is absent, fall back to `examples/<example>/output.html` when
that file exists.

Reference packs are style-scoped:

- `prompts/styles/references/<style>/<name>.html`
- `prompts/styles/references/<style>/assets/...`

For exact usage matches, the reference HTML is the strongest contract: copy
the first viewport geometry, token overrides, surface language, class
vocabulary, primary interaction model, and local asset pattern, then adapt the
content. Do not rely on the prose prompt alone when a checked-in reference
already demonstrates the target.

Also inspect `referenceAssets` and `examples/<example>/assets/` when present.
Reuse matching assets before generating CSS-only substitutes or new images.
When a `referenceAssets` path contains `/assets/`, copy that subtree into the
output folder's `assets/` directory, preserving the relative path after
`/assets/`.

For looser matches, extract the example's invariants without cloning its
content. Never copy visible demo-only style badges or gallery harness chrome
into real generated outputs.

## Required Generation Order

1. Choose the page system from the selected style.
2. If the catalog names `referenceHtml`, inspect it and `referenceAssets`; if
   not, inspect the example `output.html` and assets when available.
3. Extract or recall the style invariants, especially any reference-derived
   first viewport, token system, surface language, asset treatment, and motion
   grammar.
4. Sketch the first viewport around that system.
5. Choose modules from the source prompt.
6. Translate those modules into the style's component vocabulary.
7. Write HTML/CSS/JS with style-specific class names and layout primitives.
8. Audit the generated HTML against the selected style and example before
   returning it.

## What Counts As A Real Style

A real style changes at least five of these:

- page shell,
- navigation / control placement,
- primary visual surface,
- section rhythm,
- chart geometry,
- card density,
- typography role,
- interaction pattern,
- empty / caveat / evidence treatment,
- drill-down location.

If two styles would share the same `hero + KPI cards + chart cards + table`
structure, the implementation is wrong.

## Interaction And Motion Contract

Generated pages should feel alive where interaction improves understanding.
Every style should include at least two meaningful interactions when the data
supports them.

Good interaction primitives:

- period scrubber,
- stepper / lesson state,
- object/entity selector + live inspector,
- hover/click tooltip,
- filter chips,
- linked highlighting across chart + list,
- compare mode,
- reveal layer,
- collapsible evidence,
- search with highlighted matches,
- keyboard-accessible tabs,
- copy/export action,
- raw-data detail drawer.

Good motion primitives:

- staged first-load reveal,
- count-up numbers,
- path drawing,
- node/cluster focus,
- timeline cursor,
- chart bar growth,
- smooth linked-filter transitions,
- scroll-triggered section reveal with `IntersectionObserver`,
- subtle selected-state motion.

Rules:

- Motion must explain state or guide attention, not decorate.
- Always respect `prefers-reduced-motion`.
- Keep animations short: 120-280ms for UI state, up to 800ms for chart/stage
  introduction.
- Use CSS transitions/keyframes and small vanilla JS only. No animation
  libraries.

## Anti-Slop Gate

Borrow this discipline from design-system skills: never let the generated page
look like a generic AI demo.

- No filler labels such as "Feature One", "Insight Two", or unsupported
  placeholder metrics.
- No fake precision. If a value is estimated or synthetic, label it honestly.
- No generic product chrome when the selected style does not call for it.
- No decorative icon repeated next to every heading just to make the page feel
  designed.
- No default purple/blue gradient hero unless the style explicitly requires
  that visual system.
- No source claims that are not grounded in the parsed content, verified
  public facts, or clearly marked sample data.

## UI Quality Gate

Apply these UI/UX checks to every style. They come from the UI/UX Pro Max
quality rubric and are not optional, even when a reference style is highly
expressive.

Accessibility:

- Normal text must meet at least WCAG AA contrast (4.5:1). Tiny mono labels,
  captions, axes, and watermark-like metadata must still remain readable or be
  nonessential.
- Every interactive element must have an accessible name. Icon-only buttons
  need `aria-label`; custom clickable regions need a keyboard path.
- Visible focus states are required. Do not remove focus rings; make them
  style-native instead.
- Do not communicate meaning by color alone. Pair color with text, shape,
  pattern, icon, or numeric labels.
- Meaningful images and generated media need useful `alt` text. Decorative
  images should be marked decorative.

Touch and responsive behavior:

- Primary touch targets should be at least 44px where possible, with enough
  spacing to avoid accidental taps.
- Pages should not create accidental body-level horizontal overflow. If a
  style intentionally uses a horizontal stage or carousel, contain it in a
  visible scroller and provide buttons, dots, rail labels, or keyboard controls
  so it is not gesture-only.
- Use mobile-first responsive constraints. Fixed-format surfaces need
  `max-width`, `aspect-ratio`, wrapping, or contained overflow so text and
  controls do not break the viewport.

Charts and dense visuals:

- Chart values must not be hover-only. Include visible labels, a legend with
  ticks, an adjacent summary, or a data/list/table fallback.
- Word clouds, network graphs, heatmaps, 3D scenes, and map/canvas visuals are
  supplementary unless paired with a readable list/table/detail view.
- Heatmaps need scale labels or numeric/tooltips; network maps need an
  adjacency/entity list; 3D/spatial scenes need a 2D or tabular fallback when
  the data matters.

Motion:

- Respect `prefers-reduced-motion`.
- Keep animation work to transform/opacity where practical; avoid layout
  thrash from animating width/height/top/left in tight loops.
- Animate only what explains state or guides attention. Avoid motion pile-ups
  where many unrelated elements move at once.

## Layout Diversity Requirement

Avoid defaulting data to dashboard. First choose one of the stable use cases,
then pick a system inside it:

- **Teaching Studios** for lessons, explainers, tutorials, and object/system
  studios.
- **Files & Work Data** for spreadsheets/CSV exports, documents, PDFs, logs,
  CI output, PR patches, stack traces, repos, finance, calendars, records,
  work artifacts, and slide-style carousel outputs.
- **Conversation Analysis** for private chats, relationship exports, team
  channels, and message streams.
- **Personal Data & Places** for personal exports, histories, payments,
  professional networks, reading archives, notes, location-rich exports,
  travel, routes, rides, and photo geodata.

Then choose the style system:

- **Ops Console** only for operational monitoring, finance/admin work,
  issue queues, logs, and dense tabular decision surfaces.
- **Timeline Story** for personal histories, media histories, purchases,
  reading/listening/watching, and AI chat archives.
- **Mycelium Writing Environment** for reflective essays, Kindle highlights,
  idea notes, and reading archives where a vertical margin question connects to
  inline spore words in a slow-reading manuscript.
- **Map Atlas** for saved places, routes, geotagged photos, location history,
  and spatial datasets that need a local atlas.
- **Global Travel Map** for travel history, Uber/Lyft exports, mobility
  recaps, airport patterns, and trip logs where a calm world-map stage is the
  clearest first read.
- **Kinetic Championship** for multi-participant activity streams where rank,
  contribution, bursts, workload, or competitive rhythm is the clearest first
  read.
- **Network Map** for people, senders, communities, contacts, payments, email,
  and professional networks.
- **Keepsake 3D Rhythm** for intimate 1:1 chats and romance-themed
  relationship recaps.
- **Document Review** for long, formal, or evidence-heavy documents.
- **Editorial Carousel** for arguments, research takeaways, and article-like
  sources that should become a compact shareable sequence.
- **Evidence Workbench** for PRs, CI output, stack traces, and repo evidence
  inside Files & Work Data.

## Source Vs Style

Source prompts define **what to analyze**.
Style prompts define **how the experience is shaped**.

When they conflict:

- Preserve source-specific analytical requirements.
- Preserve style-specific layout and component system.
- Adapt labels and modules so the result still feels native to the selected
  style.

Source modules may move, shrink, or change component shape to fit the style.
For example, a required "quote browser" in a manuscript style can be a quiet
ruled appendix, while the same source module in a dashboard style might become
a searchable table. The source requirement is satisfied by the information and
interaction, not by a generic component form.

## Implementation Rules

- Use Clockless tokens from `prompts/styles/_design.md` as the brand base
  unless the selected style provides a complete style-native token override.
  Do not let a shared token set flatten all styles into one look.
- Put `data-ha-style="<selected-style>"` on the root `<html>` element.
- Use semantic, style-specific classes such as `.lesson-stage`,
  `.atlas-timeline`, `.ops-command-bar`, `.evidence-workbench`,
  `.dossier-sheet`, `.kinetic-arena`, not only generic `.hero`, `.card`,
  `.grid`.
- The first viewport should visibly reveal the selected system before the user
  scrolls.
- The primary interaction should be native to the system: a lesson stepper for
  `teaching`, filters/table for `dashboard`, margin-spore links for
  `living-essay`, spread rail / evidence drawer for `editorial-carousel`,
  document review body for `document`, etc.
- Do not include a visible "style badge" in real generated outputs. The style
  should be obvious from the structure.

## Final HTML Style Audit

Before returning the HTML, verify:

- The root HTML declares the selected style with `data-ha-style`.
- The first viewport matches the style's scaffold and does not use a generic
  fallback shell.
- If a catalog `referenceHtml` exists, the output reflects that reference's
  scaffold, token overrides, surface treatment, and interaction grammar.
- At least four style-specific class names/components from the style prompt
  appear in the HTML.
- Text contrast, focus states, keyboard access, and touch targets meet the UI
  quality gate.
- Charts and visualizations have visible values or list/table fallbacks and do
  not rely on color alone.
- The page has no accidental body-level horizontal overflow. Style-native
  horizontal stages include explicit controls.
- Source-required modules are present, but translated into the style's native
  component vocabulary.
- The primary interaction is style-native and works with the inlined `DATA`.
- Motion, if present, follows the style's motion grammar and respects
  `prefers-reduced-motion`.
- The output is still a complete offline HTML file with inline CSS/JS and
  the `__DATA__` placeholder.
