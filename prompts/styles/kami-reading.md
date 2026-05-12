# Kami Reading Style

Use this style for long prose that should be read, annotated, skimmed, and
returned to: essays, DOCX memos, long articles, policy drafts, letters,
research notes, and plain-text manuscripts.

Underlying System: Kami Longform Reader

Reference inspiration: tw93/Kami's document constraints. Treat Kami as a
reading system, not a generic app UI. The page should feel like a restrained
digital paper object: warm, stable, typographic, and designed for sustained
attention.

## First Viewport Contract

The first viewport must immediately read as a longform reader:

1. A warm parchment canvas, never pure white.
2. A centered or slightly offset article sheet with generous margins.
3. A serif-led cover: source label, title, lede, metadata, and reading time.
4. A quiet navigation rail or reading toolbar with contents, progress, and
   density controls.
5. No dashboard cards, KPI row, marketing hero, or app-style top bar.

## Visual System

Use these tokens or very close equivalents:

```css
--parchment: #f5f4ed;
--ivory: #faf9f5;
--sand: #e8e6dc;
--border: #e8e6dc;
--border-soft: #e5e3d8;
--brand: #1B365D;
--brand-tint: #EEF2F7;
--brand-tint-strong: #E4ECF5;
--near-black: #141413;
--dark-warm: #3d3d3a;
--olive: #504e49;
--stone: #6b6a64;
```

Rules:

- Page background is parchment `#f5f4ed`; article surfaces are ivory
  `#faf9f5`.
- Ink blue `#1B365D` is the only chromatic accent and should stay below about
  five percent of the visible surface.
- Use warm grays only. Avoid neutral or blue-tinted grays.
- Use whisper shadows or ring shadows only. No hard drop shadows.
- Tags and highlights use solid hex fills, never rgba.
- No italic anywhere. Do not use `font-style: italic`, slanted captions, or
  italic quote styling.

## Typography

- English: serif for headings and body. Good stack:
  `Charter, Georgia, Palatino, "Times New Roman", serif`.
- CJK fallback for multilingual content:
  `"Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", "STSong"`.
- UI labels, buttons, overlines, and controls may use a quiet sans stack, but
  the article itself is serif.
- Serif body: weight 400. Serif headings: weight 500. Do not synthesize heavy
  bold.
- Body reading line-height: 1.5 to 1.55. Dense notes: 1.4 to 1.45. Headlines:
  1.1 to 1.3.
- Article column width should stay around 62-72 characters.

## Layout System

Build from these primitives:

- `.kami-reader`: root parchment shell with `data-ha-style="kami-reading"`.
- `.kami-cover`: opening title, lede, metadata, and source summary.
- `.kami-layout`: reader grid containing rail plus article paper.
- `.kami-rail`: sticky table of contents and reading controls.
- `.kami-paper`: central longform article surface.
- `.kami-section`: chapter-level grouping.
- `.kami-progress`: reading progress indicator.
- `.kami-source-drawer`: collapsible source/evidence appendix.

The article should be the visual center. Use the rail as support, not as a
dashboard. On mobile, stack controls above the paper and keep text readable
without horizontal scroll.

## Interaction Model

Include interactions that help reading:

- Scroll progress linked to `.kami-progress`.
- Clickable table of contents that highlights the current section.
- Density or font-size controls with accessible labels.
- Focus mode that hides peripheral rails and widens the article slightly.
- Search that highlights matching article text when useful for the source.
- Collapsible appendix for source text, extracted metadata, or evidence.

Do not make charts the primary interaction unless the source truly requires
them. Long prose should privilege reading, navigation, annotation, and source
inspection.

## Content Treatment

- Preserve the author's hierarchy and sequence.
- Convert long paragraphs into comfortable reading blocks; do not over-summarize
  away the original text.
- Pull out a small number of key claims as margin notes or quiet callouts.
- Keep caveats and source metadata visible.
- For memos, expose decisions, risks, open questions, owners, and dates as
  typographic side notes rather than KPI tiles.

## Avoid

- Generic document review shells.
- Dashboard-first pages.
- Marketing hero sections.
- Multi-color palettes.
- Cool gray backgrounds.
- Pure white canvases.
- Italic quotes.
- Heavy bold serif.
- Floating card piles.
- Claiming conclusions that are not supported by the source.

## Final Style Gate

Before finalizing, verify the page would still look like Kami if all content
were replaced by another essay: parchment, serif, ink-blue restraint, central
reader sheet, reading controls, and no generic app/dashboard grammar.
