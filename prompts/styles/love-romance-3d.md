# Love Romance 3D Style

Use this style for couple chats, Valentine's-style recaps, romantic message
exports, and demos that should feel inspired by soft 3D love icon packs rather
than a neutral report.

## Underlying System: Keepsake 3D Rhythm

This is a keepsake interface for relationship rhythms. It borrows the visual
grammar of polished 3D romantic icons: plump forms, transparent highlights,
pink/red gradients, small gold accents, and floating objects such as hearts,
letters, rings, roses, notifications, gift boxes, and dating-app cards.

Base scaffold:

1. **3D keepsake cover** - first viewport pairs the relationship thesis with a
   clustered icon stage and the safest aggregate stats.
2. **Icon-stage metrics** - metrics sit in tactile tiles with highlight glints,
   soft shadows, and a clear label/value/supporting text structure.
3. **Message pulse board** - activity heatmaps and timeline modules use rounded
   candy-cell marks, not dense enterprise charts.
4. **Soft comparison lanes** - Person A / Person B are compared through balanced
   lanes, shared words, response rhythm, and topics.
5. **Privacy evidence drawer** - evidence stays anonymized and tiny; the page
   does not become a raw transcript viewer.

Component vocabulary:

- `.romance-3d-shell`, `.icon-stage`, `.keepsake-metric`,
  `.message-pulse`, `.memory-token`, `.soft-lane`, `.evidence-card`,
  `.privacy-ribbon`.
- Use Person A / Person B or initials by default.
- Decorative icon objects must be CSS/SVG/vector-like shapes or licensed image
  assets; do not use emoji as the icon system.

## Visual Language

- Palette: warm blush background, rose/red primary, coral highlight, cranberry
  depth, mint or sky-blue contrast for the second participant, and tiny champagne
  accents for keepsake details.
- Surfaces: light, glossy, and dimensional. Use inner highlights and soft
  drop-shadows, but keep reading areas crisp.
- Corners: use small 6-8px radius on content panels; reserve pill/circular
  shapes for controls, heatmap cells, and 3D icon objects.
- Typography: use the shared Clockless display/body stacks unless the prompt
  supplies a complete font override. Keep labels compact and not saccharine.
- Motion: 150-300ms transform/opacity transitions. Icon objects may gently lift
  on hover; respect `prefers-reduced-motion`.

## Interaction Model

- Clicking a 3D icon or metric should reveal a related aggregate insight.
- Heatmap cells, words, lanes, and evidence snippets must work by click/focus as
  well as hover.
- Filters should be period/topic/sender controls, not raw-message browsing.
- The page should feel gift-like, but the analysis must remain cautious and
  nonjudgmental.

## Required Modules

- Overview metrics.
- 3D icon-stage cover.
- Activity heatmap or pulse board.
- Interaction rhythm and response timing.
- Topic/language section.
- Small anonymized evidence snippets.
- Privacy note or ribbon.

## Avoid

- "Who loves more" claims.
- Raw transcript dumps.
- Emoji as the primary icon language.
- Stock Valentine's copy or fake product marketing language.
- A generic dashboard with pink variables.

## Style Compliance Gate

- Root is `<html ... data-ha-style="love-romance-3d">`.
- First viewport contains a visible `.icon-stage` and at least three
  `.memory-token` objects.
- At least four required primitives appear in the HTML.
- Charts and evidence are translated into keepsake/pulse components rather than
  pasted as generic cards.
- The page stays readable on mobile without horizontal body overflow.
