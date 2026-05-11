# Editorial Carousel Style

Use this style when article-like or argument-shaped content should become a
**shareable editorial carousel**: brand strategy essays, founder letters,
trend explainers, campaign manifestos, executive summaries, Substack / Medium
posts, market-research takeaways, reading-list syntheses, and lightweight PDF
or DOCX reports that benefit from a small deck of ideas.

This style is modeled on a premium social magazine carousel. It must feel like
the reference template: warm paper, black ink, grayscale editorial imagery,
serif/script/mono type mixing, folios, volume badges, starbursts, large
numbered principles, and a horizontal row of fixed-format slides. It is not an
app shell, not a dashboard, not a long article page, and not a landing page.

## Underlying System: Editorial Carousel

The carousel itself is the page skeleton. The first viewport should be a row
of 480 x 600-ish editorial slides on a warm gray tabletop background, with no
hero block, top app bar, section cards, KPI row, or explanatory chrome.

Base scaffold:

1. **Carousel stage** - `<body>` or the main shell is a horizontal scroll
   surface with `overflow-x: auto`, `scroll-snap-type: x mandatory`, generous
   outer padding, and a `.carousel-track` / `.spread-track` row.
2. **Fixed editorial slides** - 4-8 `.slide` / `.spread` panels with stable
   width/height, off-white paper, `2.5rem`-style padding, subtle paper shadow,
   and `display:flex; flex-direction:column; justify-content:space-between`.
3. **Magazine metadata** - every slide has `.top-meta` and `.bottom-nav` /
   folio treatment: uppercase mono kicker, `VOLUME`, `METHOD`, `FIN`, page
   count like `03 / 05`, and optional starburst.
4. **Argument sequence** - each slide has one move: cover thesis, problem
   quote, principle/method, visual shift, closing CTA. Do not make one dense
   report spread.
5. **Evidence and utility layer** - search/copy/evidence controls are allowed,
   but they must be visually subordinate: a small fixed mono `TOOLS` tab or
   drawer. They must never replace the carousel stage or create an app header.

Component vocabulary:

- Required primitives: `.carousel-track`, `.slide`, `.top-meta`,
  `.bottom-nav`, `.pill-badge`, `.starburst`, `.mix-title-container`,
  `.t-serif`, `.t-script`, `.manifesto-block`, `.bg-image` or local
  `.art-print`, `.step-number`, `.content-wrapper`, `.massive-mix`,
  `.profile-circle`, `.cta-btn`.
- The cover should use mixed title lines: uppercase serif words plus one or
  two oversized script words.
- Quote/problem slides should use a large italic serif pull quote and a short
  mono manifesto block.
- Principle slides should use oversized outline or low-contrast step numbers.
- Shift/closing slides may invert one slide to charcoal ink with off-white
  type; do not make the whole page dark.

## Visual Language

Match the reference aesthetic closely:

- Background outside slides: `#d1cdc5` or very close warm gray.
- Slide paper: `#F2EFEB`; alternate paper: `#EBE7DD`; ink: `#131211`.
- Fonts: `Playfair Display` for serif display, `Pinyon Script` for script
  emphasis, `Space Mono` for metadata and body notes.
- Slide size: default `--slide-w: 480px`, `--slide-h: 600px`, with responsive
  reduction on mobile while preserving the 4:5-ish social carousel ratio.
- Use `letter-spacing: 0.05em` only for mono metadata. Large serif display can
  use slight negative letter spacing when needed to fit.
- Imagery must be grayscale, cropped, and partially behind text. If source
  images are not available, create local inline SVG/CSS art panels that mimic
  black-and-white architecture, statue, shadow, paper, or portrait fragments.
  Do not fetch remote image URLs at render time.
- Manifesto copy is small mono text, often lowercase, justified, and sometimes
  two-column.

## Required Modules

- 4-8 editorial slides in a horizontal scroll-snap carousel.
- Cover slide with volume badge and mixed serif/script title lockup.
- Problem or thesis slide with large italic serif quote.
- At least one numbered principle/method slide.
- One high-contrast shift or closing slide.
- Page counts / folios on all slides.
- Search across slide copy and evidence.
- Copy current slide and copy summary actions.
- Evidence drawer/browser with short source labels or excerpts.

## Interaction Model

- Native horizontal scrolling is primary. Add previous/next or dot controls
  as quiet secondary tools; swipe/trackpad gestures must not be the only way to
  move through the issue.
- Arrow keys may move between slides.
- Search marks matching slides without restructuring them.
- Evidence links open a compact bottom/side drawer and focus the matching
  source excerpt.
- Copy actions should copy slide-ready text, not raw HTML.
- Controls must be keyboard reachable with visible focus states. Dots/buttons
  need accessible names such as "Go to spread 3".
- Keep horizontal overflow inside the carousel, not on `body`.

## Avoid

- A top navigation bar, command bar, dashboard toolbar, or marketing hero.
- Full-page dark mode that overrides the paper carousel look.
- KPI cards, chart grids, sortable tables, or dense report modules as primary
  content.
- Rounded app cards nested inside slides.
- Remote image URLs, stock-photo dependence, or decorative images unrelated to
  the source.
- More than 8 primary slides unless explicitly requested.
- A normal article column with carousel styling sprinkled on top.

## Implementation Notes

- Use CSS scroll-snap and small vanilla JS only.
- Preserve the fixed slide silhouette on desktop and mobile.
- Make text fit inside every slide; shorten and synthesize aggressively.
- Keep utility UI small and out of the main composition.
- Respect `prefers-reduced-motion` for animated drawer/search transitions.
