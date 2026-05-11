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

## Required Generation Order

1. Choose the page system from the selected style.
2. Extract or recall the style invariants, especially any reference-derived
   first viewport and motion grammar.
3. Sketch the first viewport around that system.
4. Choose modules from the source prompt.
5. Translate those modules into the style's component vocabulary.
6. Write HTML/CSS/JS with style-specific class names and layout primitives.
7. Audit the generated HTML against the selected style before returning it.

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
- selector + live inspector,
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

## Layout Diversity Requirement

Avoid defaulting data to dashboard. Pick a system by use case:

- **Ops Console** only for operational monitoring, finance/admin work,
  issue queues, logs, and dense tabular decision surfaces.
- **Timeline Story** for personal histories, media histories, purchases,
  reading/listening/watching, and AI chat archives.
- **Mycelium Writing Environment** for reflective essays, Kindle highlights,
  idea notes, and reading archives where a vertical margin question connects to
  inline spore words in a slow-reading manuscript.
- **Map Atlas** for places, trips, routes, rideshare, photo geodata, and
  location history.
- **Network Map** for people, senders, communities, contacts, payments, email,
  and professional networks.
- **Rhythm Report** for intimate 1:1 chats.
- **Editorial Desk** for arguments, research, bookmarks, reading lists, and
  article-like sources.
- **Evidence Workbench** for developer artifacts.
- **Review Dossier** for long/high-stakes documents.

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

- Use Clockless tokens from `prompts/_design.md` as the brand base, but do not
  let those tokens flatten all styles into one look.
- Put `data-ha-style="<selected-style>"` on the root `<html>` element.
- Use semantic, style-specific classes such as `.lesson-stage`,
  `.atlas-timeline`, `.ops-command-bar`, `.evidence-workbench`,
  `.dossier-sheet`, not only generic `.hero`, `.card`, `.grid`.
- The first viewport should visibly reveal the selected system before the user
  scrolls.
- The primary interaction should be native to the system: a lesson stepper for
  `teaching`, selector/inspector for `interactive-studio`, filters/table for
  `dashboard`, margin-spore links for `living-essay`, quote/evidence browser
  for `editorial`, etc.
- Do not include a visible "style badge" in real generated outputs. The style
  should be obvious from the structure.

## Final HTML Style Audit

Before returning the HTML, verify:

- The root HTML declares the selected style with `data-ha-style`.
- The first viewport matches the style's scaffold and does not use a generic
  fallback shell.
- At least four style-specific class names/components from the style prompt
  appear in the HTML.
- Source-required modules are present, but translated into the style's native
  component vocabulary.
- The primary interaction is style-native and works with the inlined `DATA`.
- Motion, if present, follows the style's motion grammar and respects
  `prefers-reduced-motion`.
- The output is still a complete offline HTML file with inline CSS/JS and
  the `__DATA__` placeholder.
