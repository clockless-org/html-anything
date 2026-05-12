# Architectural Spread Style

Use this style when the user provides or asks for a visually led editorial
HTML like the reference Mars Expedition split-screen page: architectural,
minimal, object-focused, full-viewport, and more like a designed magazine
spread than a website or dashboard.

This style is especially strong for long-form essays, cultural commentary,
concept notes, design manifestos, object dossiers, visual explainers, and
single-subject articles that benefit from a large symbolic visual object.

## Underlying System: Architectural Editorial Spread

The page is a full-screen split spread:

1. **Left visual bay** — a taupe/earth-toned half-screen with a single large
   visual object centered vertically, plus one smaller inset image/object near
   the lower-left corner.
2. **Right editorial panel** — a cream content half-screen with the current
   chapter's label, headline, serif italic emphasis word, and restrained body
   copy.
3. **Absolute nav anchors** — tiny textual anchors pinned to corners:
   `Close ( X )`, `( More Visible Area )`, `Next Chapter ( + )`. They are
   part of the visual language, not app chrome.
4. **Pagination dots** — small dots at the lower center of the content panel
   for chapters/spreads.
5. **Quiet motion** — fade/slide entry, subtle object drift/rotation, no
   splashy transitions.

Do not create a scrolling article, dashboard, card grid, marketing hero, or
generic document review page.

## Reference Contract

Match these invariants from the supplied reference HTML:

- Full viewport: `body` is `height: 100vh`, centered, overflow hidden on
  desktop.
- `.architectural-viewport` is a two-column `1fr 1fr` grid.
- Left column uses muted taupe; right column uses warm cream.
- Typography pairs Helvetica-like sans with Times-style serif italic emphasis.
- Large headline is sans, 3rem-ish, light weight, tight line-height.
- Body copy is small, restrained, max-width around 320-380px.
- Navigation is text-only, absolute, tiny, and parenthesized where possible.
- Primary object is a large circular or sculptural form with internal shadow.
- Inset visual/object sits bottom-left in the visual bay.
- Corners are square. No rounded cards except the primary orb/object when the
  subject calls for it.

## Token System

Use this token base. The style is light/dark as a composed spread, not a
theme toggle: left visual bay is dark/taupe, right reading bay is cream.

```css
:root {
  color-scheme: light;
  --c-taupe: #6B655F;
  --c-cream: #EBE8E3;
  --c-moss: #2A3826;
  --c-black: #111111;
  --c-white: #FFFFFF;
  --c-ink-muted: #444444;
  --c-rule: rgba(17, 17, 17, 0.22);

  --font-sans: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  --font-serif: 'Times New Roman', Times, serif;

  --spacing-unit: 2rem;
  --page-padding: clamp(1.4rem, 4vw, 3rem);
}
```

## Component Vocabulary

Required primitives:

- `.architectural-viewport`
- `.col-visual`
- `.col-content`
- `.visual-object`
- `.visual-inset`
- `.header-label`
- `.headline`
- `.headline-serif`
- `.body-text`
- `.nav-anchor`
- `.pagination`
- `.dot`

Optional but encouraged:

- `.spread-index`
- `.source-drawer`
- `.reading-progress`
- `.animate-entry`
- `.delay-1`
- `.delay-2`

## Interaction Model

- The primary interaction is chapter/spread switching, not scrolling.
- `Next Chapter ( + )`, `Previous ( - )`, dots, and keyboard arrow keys should
  change the active spread.
- The visual object and inset should update or subtly shift per spread.
- Keep a source/detail drawer available for complete text or section list, but
  do not make the drawer the first thing the user reads.
- Every control must be keyboard accessible and have an accessible name.

## Layout Rules

- Desktop: two equal columns, full viewport.
- Mobile/tablet: stack the visual bay above content; allow document scrolling.
- The first viewport must always reveal both the visual object and the editorial
  panel.
- Avoid top bars. The reference uses corner anchors instead.
- Avoid nested cards, KPI rails, charts, heavy nav, or text-heavy sidebars.

## Visual Language

- Muted architectural palette: taupe, cream, moss/black, white.
- Sans-serif headline with one serif italic word or phrase for contrast.
- Labels are uppercase, small, bold, lightly tracked.
- Body text is small and calm; let whitespace and composition carry the drama.
- Use underline emphasis sparingly.
- Primary object should be generated from CSS, inline SVG, local/generated
  asset, or a relevant image. It must read as the subject, not as decoration.

## Good Fits

- Long-form essay transformed into chapter spreads.
- Founder/design manifesto or brand essay.
- Object-focused explainer, e.g. Mars habitat, camera, building, book, PDF.
- A small article where a single metaphor can become a strong visual object.

## Avoid

- Generic blog/article layouts.
- Large scrolling pages with all content visible at once.
- Dashboards, cards, charts, and tables in the first viewport.
- Gradient-orb decoration detached from the subject.
- Rounded SaaS components, glassmorphism, and heavy shadows.
- Loud color palettes that erase the taupe/cream editorial feel.

## Compliance Gate

Before returning HTML for this style, confirm:

- Root is `<html ... data-ha-style="architectural-spread">`.
- First viewport is a two-column `.architectural-viewport`.
- It uses `.col-visual`, `.col-content`, `.visual-object`, `.visual-inset`,
  `.headline-serif`, `.nav-anchor`, and `.pagination`.
- No top bar, card grid, KPI row, or dashboard shell appears in the first
  viewport.
- The full source can still be reached through a drawer, chapter list, or
  equivalent drill-down.
