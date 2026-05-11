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

## Required Generation Order

1. Choose the page system from the selected style.
2. Sketch the first viewport around that system.
3. Choose modules from the source prompt.
4. Translate those modules into the style's component vocabulary.
5. Write HTML/CSS/JS with style-specific class names and layout primitives.

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

## Implementation Rules

- Use Clockless tokens from `prompts/_design.md` as the brand base unless the
  selected style provides a complete style-native token override. Do not let a
  shared token set flatten all styles into one look.
- Use semantic, style-specific classes such as `.lesson-stage`,
  `.atlas-timeline`, `.ops-command-bar`, `.evidence-workbench`,
  `.dossier-sheet`, not only generic `.hero`, `.card`, `.grid`.
- The first viewport should visibly reveal the selected system before the user
  scrolls.
- The primary interaction should be native to the system: a lesson stepper for
  `teaching`, selector/inspector for `interactive-studio`, filters/table for
  `dashboard`, quote/evidence browser for `editorial`, etc.
- Do not include a visible "style badge" in real generated outputs. The style
  should be obvious from the structure.
