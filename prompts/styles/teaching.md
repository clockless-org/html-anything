# Teaching Style

Use this style when the user asks for a teaching site, tutorial, lesson,
interactive explainer, course page, "teach me", or any educational page where
the user should move through a guided learning sequence.

For app-like **object/system/spec exploration** briefs — anatomy,
architecture, science, products, mechanisms, specs — make the object/model the
main teaching surface inside this style.

The page should feel like a guided learning artifact, not a paper, blog
post, or dashboard. The user should be able to learn by looking,
changing something, checking themselves, and moving to the next idea.

For mixed briefs that need both a guided explanation and an object model, keep
the step rail and use the object stage as the main teaching surface.

Canonical object-lab reference:
`prompts/styles/references/teaching/object-lab.html`.

Canonical object-lab assets:
`prompts/styles/references/teaching/assets/planets/`.

A prompt like "Create a three-panel interactive teaching studio about the
solar system, with a selectable model, compare controls, and live inspector"
should produce a first viewport matching that reference's structure:

1. a left lesson/control rail with the title, short objective, mode controls,
   and object list;
2. a central visual model stage that changes when the learner selects an
   object or mode;
3. a right inspector with selected-object facts, why-it-matters explanation,
   and comparison controls.

For exact solar-system or planet-object-lab requests, use the reference HTML as
the template-level target. Keep the light teal classroom-grid shell, frosted
panels, compressed dark model stage, live inspector, comparison bars, and
planet PNG treatment. Do not reinterpret it as a dark space dashboard, a
timeline encyclopedia, or a generic educational article.

This object-lab pattern should generalize to anatomy, architecture, product,
scientific, mechanical, or system-exploration briefs.

## Underlying System: Lesson Lab

This is a classroom-lab system. The first screen is the lesson apparatus
or object stage, not a hero page.

Base scaffold:

1. **Lesson workbench** — main visual stage on the left/center, lesson rail
   close by, current explanation attached to the stage.
2. **Step rail** — 4-7 steps that mutate the stage, highlighted object, or
   example state.
3. **Try-it controls** — sliders, toggles, selectors, or prediction buttons
   placed next to the visual they change.
4. **Concept drawer** — compact cards for vocabulary, misconception, and
   "why this matters".
5. **Check panel** — one immediate-feedback quiz/prediction/reflection.

Component vocabulary:

- `.lesson-shell`, `.lesson-stage`, `.step-rail`, `.try-control`,
  `.annotation-layer`, `.concept-drawer`, `.check-yourself`, `.recap-strip`.
- Object-lab variants may also use `.object-lab`, `.object-list`,
  `.object-stage`, `.model-stage`, `.inspector-panel`, `.compare-control`, and
  `.stage-note`, but keep at least four of the base lesson classes as aliases
  or wrapper classes so style compliance remains easy to audit.
- Use arrows, labels, callouts, progress, and stateful controls more than
  generic cards.

Interaction model:

- Every step changes visible state.
- Controls should teach causality: reveal, compare, scrub, orbit, layer,
  simulate, or test a prediction.
- Keep explanatory text attached to the thing being explained.

## Page Shape

- Open with the actual lesson surface: a visual stage, simulator, annotated
  diagram, timeline, map, model, or worked example. Do not start with a
  marketing hero.
- Add a compact lesson rail or stepper with 4-7 named steps. Each step changes
  the main visual, explanation, or highlighted evidence.
- Pair every important concept with a visible example, contrast, or
  mini-interaction.
- Include at least one "try it" control where the learner can change a value,
  select an object, scrub time, reveal layers, compare states, or answer a
  small check.
- End with a short recap panel: 3 takeaways, 1 common misconception, and 1 next
  thing to explore.

## Visual Language

- Use the Clockless tokens from `prompts/styles/_design.md`, then apply the
  teaching object-lab token override from the reference:
  `--primary: #0f766e`, `--primary-container: #115e59`,
  `--secondary-container: #f59e0b`, `--bg: #f6fbfb`,
  `--surface-container-low: #edf7f5`, `--fg-1: #10201f`,
  `--fg-2: #304c49`, `--fg-muted: #647b78`, and a teal-to-amber
  `--gradient-text`.
- Teaching object labs are light-mode classroom surfaces. Do not switch the
  page chrome to a dark space/science theme just because the subject is space.
  The main visual stage can be dark when the model needs contrast, but it must
  sit inside the light teaching workbench.
- Use the reference panel presentation: full-height three-column workbench,
  light teal grid background, floating translucent panels with
  `backdrop-filter`, large headline rail, rounded inspector cards, segmented
  mode controls, and a dark framed model canvas/stage in the middle panel.
- Prefer a clean classroom-lab surface: warm background, high-contrast labels,
  clear annotations, and restrained accent color.
- Make diagrams concrete. Use generated bitmap assets for rich subjects when
  useful, and SVG/CSS/canvas for labels, arrows, paths, charts, and deterministic
  models.
- For planet/object subjects, reuse available reference assets first. Copy
  matching files into the output's `assets/` folder and reference them from the
  HTML instead of falling back to pure CSS spheres when bitmap models exist.
- Keep controls close to the thing they affect. Avoid remote settings panels
  unless the lesson needs a dense simulator.
- Use motion only to teach: orbit, flow, reveal, growth, before/after, or
  cause/effect. Provide a pause/reduce-motion path for looping animation.

## Teaching Voice

- Explain in short, direct blocks. Prefer "Notice...", "Try...", "Compare...",
  and "This matters because..." over academic section prose.
- Use everyday analogies only when they clarify the model.
- Label uncertainty and simplifications. If a model is simplified for learning,
  say so in the UI.
- Do not over-claim. For current science, health, legal, finance, or other
  high-stakes topics, verify facts and keep caveats visible.

## Required Modules

- **Objective**: one sentence stating what the learner will understand or do.
- **Lesson stage** (or **object stage** for explorer briefs): the main
  interactive visual or worked example.
- **Step rail** (lessons) **or entity selector** (object explorers):
  ordered states / chips that change the stage and explanation.
- **Concept cards** (lessons) **or live inspector panel** (explorers):
  3-6 compact ideas with examples, or a persistent panel whose facts
  update with the selected entity.
- **Try it / mode controls**: learner-controlled input — toggle, slider,
  selector, scale, compare, layer, scrub, orbit, focus, exploded view,
  or prediction.
- **Check yourself** (lessons; optional for explorers): one lightweight
  quiz, prediction, or reflection prompt with immediate feedback.
- **Recap or comparison bench**: takeaways/misconception/next
  exploration for lessons; side-by-side metrics or proportional bars for
  explorers.

## Avoid

- A long article layout with charts dropped between paragraphs.
- Generic "overview / features / benefits" landing pages.
- Dozens of disconnected facts with no learning sequence.
- Dense academic copy, abstract methodology sections, or citation-like clutter
  unless the user explicitly asks for a research-style lesson.
- Decorative visuals that do not help the learner reason about the topic.

## Implementation Notes

- Keep the page static and local-first: inline CSS and JS, no external JS/CDN.
- For exact reference matches, start from the reference scaffold and adapt the
  data/content. Do not create a new unrelated scaffold with the same class
  names.
- Make keyboard and touch interaction usable. Buttons must have clear labels or
  accessible titles.
- On mobile, the lesson stage stays first, then the step rail, then details.
- Verify the main stage is nonblank and the primary interaction changes visible
  state before handoff.
