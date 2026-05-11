# Interactive Learning Style

Use this style for app-like educational artifacts where the learner should
explore a concrete object, system, anatomy, architecture, mechanism, product,
spec, simulation, or spatial model. It is especially good for prompts like
"explore this system", "make an interactive studio", "let me inspect the parts",
"teach this through a model", or "build a learning app for X".

Prefer `teaching` when the output is primarily a guided lesson, tutorial,
course page, or worked example. Prefer `interactive-learning` when the output
should feel like a usable exploration studio whose object/model is the
interface.

## Identity

This is a **Learning Studio**: a warm, tactile, object-first interface where the
learner manipulates a central stage and learns from nearby controls,
annotations, inspectors, and comparison tools.

The first screen is not a hero, article, or dashboard. It is the lab bench
itself: left-side object/entity catalog, central interactive stage, right-side
live inspector, and lower comparison/gallery surfaces when the source supports
them.

Reference qualities:

- Warm paper workspace, soft biological/product-lab colors, ink-like text.
- A large central canvas/model/diagram that carries the page.
- Controls are close to the thing they change.
- Side rails feel like studio tools, not marketing cards.
- Hand-note labels are welcome when they clarify, but never let whimsy reduce
  legibility.

## Design Tokens

This style may override the shared Clockless tokens. Centralize every visual
decision in CSS variables and use them throughout the page.

```css
:root {
  color-scheme: light;

  --paper: #fbf7ee;
  --paper-deep: #f1eadc;
  --paper-wash: #f6f0e4;
  --ink: #28231c;
  --ink-soft: #4b4236;
  --muted: #80786d;
  --line: rgba(91, 78, 60, 0.16);
  --line-strong: rgba(84, 74, 58, 0.28);

  --accent: #8260b7;
  --accent-2: #2f8f7b;
  --accent-3: #d8874a;
  --accent-soft: color-mix(in srgb, var(--accent) 14%, #ffffff);
  --good: #2f8f7b;
  --warn: #b7791f;
  --bad: #b94b4b;

  --bg: #f2ecdf;
  --surface: var(--paper);
  --surface-container-lowest: #fffaf1;
  --surface-container-low: #f8f1e5;
  --surface-container: #f1eadc;
  --surface-container-high: #e8decc;

  --fg-1: var(--ink);
  --fg-2: var(--ink-soft);
  --fg-muted: var(--muted);
  --border: var(--line);
  --border-strong: var(--line-strong);
  --primary: var(--accent);
  --secondary: var(--accent-2);

  --font-headline: "Iowan Old Style", "Baskerville", "Libre Baskerville", Georgia, serif;
  --font-body: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-note: "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive;
  --font-mono: "SF Mono", Menlo, ui-monospace, monospace;

  --space-xs: 4px; --space-sm: 8px; --space-md: 12px;
  --space-lg: 16px; --space-xl: 20px; --space-2xl: 24px;
  --space-3xl: 32px; --space-4xl: 48px; --space-5xl: 64px;

  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 8px;
  --radius-xl: 8px;
  --radius-pill: 999px;

  --shadow-soft: 0 8px 26px rgba(78, 66, 48, 0.10);
  --shadow-stage: 0 18px 50px rgba(78, 66, 48, 0.12);
}
```

Use a soft paper background:

- `radial-gradient(circle at 8% 6%, rgba(255,255,255,.78), transparent 26rem)`
- `linear-gradient(135deg, #f6f0e4, #efe7d8)`

Cards/panels may use subtle translucent paper fills, but keep borders visible.
Do not use glassmorphism, neon gradients, dark cyberpunk palettes, or large
marketing-style hero compositions.

## Information Architecture

First viewport composition:

1. **Studio topbar** — object/system title, one compact purpose line, and 2-4
   tool shortcuts (guide, layers, compare, export/copy).
2. **Left rail: entity/object catalog** — selectable objects, parts, chapters,
   examples, or states with thumbnail-like mini previews.
3. **Center stage** — the main model/diagram/simulator/worked object. This is
   the visual anchor and must be visible before scrolling.
4. **Stage controls** — view mode, layers, focus, zoom/reset, compare, scrub,
   annotation toggles, or simulation controls attached to the stage.
5. **Right rail: live inspector** — selected entity/part facts, attributes,
   explanatory note, mastery/prompt/check panel.
6. **Lower bench** — comparison cards, related examples, mini gallery, or recap
   only after the main studio is established.

Do not lead with a generic "Welcome to..." block. The learner should be able to
click, toggle, or select something in the first viewport.

## Layout System

- Use a three-column app shell on desktop:
  `left rail (240-300px) / center stage (fluid) / right rail (300-380px)`.
- The center stage should be the largest surface and may have a minimum height
  around 620-820px when content supports it.
- Use 8px max panel radius. Never put UI cards inside other cards; rails contain
  panels, panels contain rows/controls.
- On tablet, move the right rail below the stage in a 2-3 panel row when useful.
- On mobile, order: topbar, center stage, key controls, entity selector, live
  inspector, lower bench. Keep the stage first.
- Long labels wrap or truncate gracefully; paths/spec names can use mono and
  `overflow-wrap:anywhere`.

## Component Vocabulary

Use style-native class names such as:

- `.learning-studio`, `.studio-topbar`, `.studio-brand`, `.studio-tools`
- `.entity-rail`, `.entity-row`, `.mini-preview`, `.favorite-dot`
- `.studio-stage`, `.stage-title`, `.stage-canvas`, `.stage-annotation`
- `.view-card`, `.mode-switcher`, `.layer-toggle`, `.stage-toolbar`
- `.inspector-rail`, `.detail-hero`, `.attribute-list`, `.learning-panel`
- `.note-card`, `.mastery-meter`, `.tutor-prompt`, `.check-panel`
- `.comparison-bench`, `.micro-gallery`, `.comparison-modal`

Use buttons for real commands, segmented controls for modes, toggles for layers,
sliders/scrubbers for numeric or temporal state, and tabs only when each tab
changes a substantial view.

## Data Allocation Rules

- **Entities / objects / records** go to the left rail and drive selection.
- **Parts / components / anatomy / schema fields** become clickable labels,
  overlays, or inspector rows.
- **Primary explanation** attaches to the stage or selected object, not a
  detached article section.
- **Quantitative attributes** become compact inspector rows, proportional bars,
  callouts, or comparison chips.
- **Temporal or process data** becomes a scrubber, stepper, or state strip tied
  to visible stage changes.
- **Raw/source detail** lives in a collapsible source drawer or "field notes"
  panel after the learning interaction, not in the first viewport.
- **Sparse data** should still produce a useful studio: one strong annotated
  diagram/model, a selector if there are multiple examples, and a check prompt.

## Visualization Grammar

- Prefer SVG/CSS/canvas for deterministic diagrams, annotated models, exploded
  views, overlays, maps, timelines, and proportional comparisons.
- Use generated or embedded bitmap assets when the subject benefits from a
  real-looking object, texture, specimen, product, or scene.
- Diagrams should have visible labels, arrows, hotspots, and layer states.
- Comparisons should use side-by-side specimen cards, proportional bars,
  overlays, or "before/after" toggles, not generic KPI cards.
- If a 3D scene is used, make it the full center stage, verify it is nonblank,
  and provide a fallback static SVG/diagram path.

## Interaction Contract

Every page using this style needs at least three meaningful interactions when
the data supports them:

- Entity/object selector updates the stage and inspector.
- Mode switcher changes the stage view (model / diagram / exploded / compare /
  process / quiz).
- Layer toggles reveal/hide annotations, parts, labels, flows, or measurements.
- Focus/reset/zoom controls keep exploration recoverable.
- A lightweight check/prediction prompt gives immediate feedback.
- Comparison modal or bench lets the learner compare two selected examples.
- Copy/export action captures a concise learning summary.

All interactions must be keyboard accessible. Use `aria-pressed`,
`aria-expanded`, labels, and visible focus states. Touch targets should be at
least 44px where possible.

## Motion

- Motion should teach state: orbit, reveal, layer fade, path drawing, growth,
  before/after, or process progression.
- Use short transitions (120-240ms) for UI state and up to 700ms for stage
  introduction/path drawing.
- Respect `prefers-reduced-motion`: stop loops, remove parallax, and keep
  interactions instant.

## Required Modules

- Studio topbar with title and one compact purpose line.
- Main interactive stage as the first-viewport anchor.
- Entity/object selector or step/state selector.
- Live inspector tied to the current selection.
- Stage controls: at least mode switcher plus one layer/toggle/scrubber/slider.
- Learning prompt/check panel with immediate feedback or suggested questions.
- Comparison, recap, or field-notes bench below the stage.

## Avoid

- A long article with a decorative image at the top.
- A dashboard of KPIs pretending to be a lesson.
- Remote settings panels that are far from the stage they control.
- Generic cards labelled "features" or "benefits".
- Overly cute handwritten labels that hurt legibility.
- Purely atmospheric art with no labels, controls, or teachable state.
- Nested card stacks, large rounded SaaS cards, and visible in-app instructions
  explaining the UI itself.

## Quality Checklist

Before returning the HTML, verify:

- The first viewport visibly contains the interactive stage.
- Changing the selector/mode/toggle changes visible state and inspector content.
- The current selection is clear in the left rail, stage, and right inspector.
- Long names and body text do not overflow on mobile.
- The page works offline with inline CSS/JS and no external JS libraries.
- The main stage has a nonblank fallback if canvas/3D/rendering fails.
- Focus states, labels, and reduced-motion behavior are present.
