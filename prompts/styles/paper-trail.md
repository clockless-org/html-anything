# Paper Trail Style

Use this style when the source should feel like a tactile bundle of artifacts:
travel itineraries, trip folders, hotel stays, event schedules, receipts,
invoices, purchase trails, tickets, reservation lists, or any archive where
the user should sort through evidence as if it were laid out on a desk.

This style is especially good when the user asks for a vintage hotel, passport,
field-note, ticket-stub, receipt, folio, key-card, or printed-collateral feel.
It is an explicit style override; do not use it just because data has dates.

## Underlying System: Paper Trail

This is a physical-artifact exploration system. The first viewport should look
like a working surface with stacked documents, tickets, cards, tabs, or slips.
The page should feel usable, not decorative: every paper object represents a
real slice of the source.

## Post Post Reference Contract

When `paper-trail` is selected, the Post Post hotel key-card reference is the
default visual target. Reproduce its **composition, layering, motion, and
material vocabulary** as closely as possible while still binding every artifact
to the user's source data. Do not drift into a generic dashboard, report, or
card grid.

The first viewport must follow this composition before inventing a new one:

- a narrow left rail with back action, brand/source title, source metadata, and
  3-4 quiet navigation links;
- a large central desk with three overlapping artifacts: muted receipt sheet in
  back, terracotta guide card in the middle, mustard key card in front;
- a circular stamp, vertical edge note, tear line, day/room badge, and one
  round primary action;
- a small strip of practical notes under the stack, then the detailed folio
  controls and source drawer below.

### Reference Shell

Use these semantic classes and proportions in the generated HTML:

- `.paper-shell` as the app root.
- `.paper-rail` on the left: `24-28vw` on desktop, full-width header on mobile,
  warm paper background, right border, back circle button, large stacked
  source/brand title, mono metadata, and muted vertical nav links.
- `.paper-main` as the scrollable/right work area.
- `.artifact-desk` as the first viewport surface.
- `.artifact-stage` as a relative, centered stage around `860-920px` wide and
  `600-640px` tall on desktop.

### Reference Artifact Stack

The first viewport must include these three overlapping artifacts, in this
layer order:

1. `.receipt-sheet` - back/right artifact.
   - About `400px x 580px`, top `24-40px`, right `0-24px`, `rotate(3deg)`.
   - Muted warm-gray stock (`#D1D1C9`) or a token-derived equivalent.
   - Has `.vertical-note` on the left edge, a circular `.official-stamp` near
     the top right, source-derived fields at the bottom, and a dashed
     `.tear-line` at the bottom.
2. `.guide-card` - middle artifact.
   - About `380px x 550px`, top `0-16px`, left `90-130px`, `rotate(-2deg)`.
   - Terracotta stock (`#C65D3B`) or a token-derived equivalent.
   - Has a partially off-card rotating circular text/stamp motif, central
     icon/route mark, short source-derived guidance text, and right-edge
     vertical contact/source note.
3. `.key-card` - front artifact.
   - About `420px x 540px`, top `48-72px`, left `0`, nearly unrotated.
   - Mustard stock (`#FFC233`) or a token-derived equivalent.
   - Has a top half-circle notch/cutout, large two-line headline with the
     second line italic/indented, a centered symbolic icon, a triangular
     day/room/source badge, and one round primary action button.

The stack must use light rotations and shadows to create depth, with hover or
selected-state movement that feels like lifting a card. On mobile, the three
artifacts stack vertically in the same order and keep the same visual identity.

### Reference Material Aliases

Every output still includes the Clockless tokens from `prompts/_design.md`.
For this explicit reference style, additionally define these aliases in `:root`
and use them for the artifact materials:

```css
--paper-reference-mustard: #FFC233;
--paper-reference-terracotta: #C65D3B;
--paper-reference-warm-gray: #D1D1C9;
--paper-reference-ink: #1F1F1F;
--paper-reference-paper: #F4F1EA;
```

In dark mode, keep the same hue relationships but tune values for contrast.
For this reference style, prefer preserving the light paper world with
`color-scheme: light`; do not auto-swap the first viewport to navy, slate, or a
dark app shell just because `prefers-color-scheme: dark` is active. If you add a
dark-mode accommodation, it must still look like warm paper under lower light,
not a separate dark dashboard. Do not replace these with a purple/blue
gradient, a neutral SaaS palette, or a marketing hero.

### Reference Texture And Details

Use these details where the source supports them:

- low-contrast inline SVG noise texture on `body` and each `.paper-card`;
- circular text path or stamp animation in the upper-right/background;
- dashed tear lines, perforation hints, edge labels, stamp chips, and mono
  printed fields;
- a bottom quick-note strip with 3 practical source-derived facts;
- precise, source-bound copy in every visible artifact.

Use only inline CSS/JS and the allowed Google Fonts from `_design.md`. Do not
use Tailwind, Phosphor, or any external JS/icon CDN from the reference file.

Base scaffold:

1. **Artifact desk** - a first-screen stack of 3-6 source-shaped objects:
   itinerary cards, receipt strips, tickets, key cards, stamps, labels, or
   ledger slips. The most important artifact is the active one.
2. **Folio rail** - compact navigation by day, status, category, person,
   vendor, place, or document section. It can look like tabs, binder labels,
   room keys, file dividers, or stamp marks.
3. **Receipt / docket tape** - a vertical or horizontal sequence for time,
   transactions, stops, actions, or evidence. Use perforation, rule lines,
   mono numerics, and small status chips.
4. **Stamp callouts** - conflicts, totals, overdue items, anomalies, open
   questions, or noteworthy moments shown as stamped labels or margin notes.
5. **Source drawer** - searchable full records in a drawer, tray, or folded
   sheet, filtered by the active artifact.

Component vocabulary:

- `.paper-shell`, `.artifact-desk`, `.folio-rail`, `.paper-card`,
  `.paper-rail`, `.paper-main`, `.artifact-stage`, `.receipt-sheet`,
  `.guide-card`, `.key-card`, `.receipt-tape`, `.ticket-stub`,
  `.stamp-callout`, `.official-stamp`, `.vertical-note`, `.tear-line`,
  `.perforation`, `.source-tray`, `.desk-drawer`, `.margin-note`.
- Use artifact language: folio, slip, ticket, stamp, label, pocket, drawer,
  receipt, docket, ledger, tab, batch, and tear line.

Interaction model:

- Clicking an artifact makes it active, raises it visually, and filters the
  receipt tape plus source drawer.
- Folio tabs filter the whole desk without replacing the first viewport.
- Search lives in the source drawer or desk tray and highlights matching
  records on the tape.
- Copy actions should produce a concise Markdown folio: title, totals,
  callouts, and the filtered record list.
- Collapsible folds are preferred over modal-heavy interaction.

Motion grammar:

- On load, artifacts settle into a light stack with tiny rotations.
- Selecting an artifact should feel like lifting a card: 120-220ms translate,
  shadow, and z-index shift.
- Stamps can press in with a short scale/fade when callouts appear.
- Receipt rows can reveal in order when filters change.
- Respect `prefers-reduced-motion`; the desk must still work as a static
  layout.

## Page Shape

- The first viewport is the artifact desk, not a KPI hero or generic report.
- Put the strongest story object in front: the riskiest conflict, the main
  itinerary day, the largest receipt batch, the key decision, or the dominant
  category.
- Use summary numbers as printed fields on objects, not as a detached KPI wall.
- Use timelines as receipt tape or docket rows; use breakdowns as stamps,
  labels, or ledger columns.
- Keep the full source behind a tray/drawer after the interpretation.

## Visual Language

- Use Clockless tokens from `prompts/_design.md`; do not import extra fonts or
  invent a separate palette.
- Reinterpret the tokens materially: `--surface-container-lowest` as paper,
  `--surface-container` as aged stock, `--primary` as stamp ink, and
  `--outline-variant` as printed rules.
- Subtle paper texture is allowed with CSS gradients or inline SVG data URIs,
  but keep it low contrast and local.
- Use 0-4deg rotations sparingly on desktop; remove or reduce them on mobile.
- Rounded corners should stay modest. Tickets, cards, and slips can use small
  radius plus perforation or dashed rules.
- Typography stays on the shared fonts. Use `var(--font-headline)` for artifact
  titles, `var(--font-body)` for notes, and `var(--font-mono)` for dates,
  times, amounts, IDs, room numbers, codes, and counts.

## Required Modules

- **Artifact desk** with at least three meaningful objects derived from the
  source.
- **Folio rail** or tab strip that changes the active slice.
- **Receipt / docket tape** for the chronological, transactional, or evidential
  sequence.
- **Stamp callouts** for conflicts, flags, totals, missing information, or
  memorable records.
- **Source drawer** with search, filters, and record expansion.
- **Copy as Markdown** action when the source has reusable notes, itinerary
  items, transactions, findings, or records.

## Style Compliance Gate

Before returning the final HTML, silently verify that all of the following are
true. If any item fails, revise the HTML before returning it:

- The first viewport visibly matches the Post Post reference shell: left rail,
  centered overlapped stack, and no generic hero/KPI lead.
- The HTML contains and styles `.paper-shell`, `.paper-rail`, `.paper-main`,
  `.artifact-desk`, `.artifact-stage`, `.receipt-sheet`, `.guide-card`,
  `.key-card`, `.receipt-tape`, and `.source-tray`.
- The three reference artifact colors/materials are present through the
  `--paper-reference-*` aliases or clearly token-derived equivalents.
- The first viewport remains a warm light paper scene even when the browser
  prefers dark mode.
- The top stack has a vertical edge note, circular stamp, tear line,
  triangular/day badge, and round primary action.
- Every visible artifact uses real source-derived values, not placeholder hotel
  copy unless the user explicitly asked for fictional hotel content.
- The source prompt's required analytical modules still exist below or within
  the folio system.

## Good Example Source

Use `examples/itinerary-trip/input.csv` as the first demo source. It has hotel
stays, flights, restaurants, scheduled stops, costs, and conflicts, so the
style can naturally render the trip as a folder of key cards, ticket stubs,
receipt tape, and stamped overlap warnings:

```bash
npx tsx src/cli.ts examples/itinerary-trip/input.csv \
  --style paper-trail \
  --out /tmp/paper-trail-itinerary.html \
  --title "Tokyo + Kyoto - 8-day itinerary"
```

## Avoid

- A decorative scrapbook where papers do not map to source data.
- Replacing source-specific requirements with only visual styling.
- Large hero copy blocks, marketing layout, or floating card grids.
- Any first viewport shaped like `hero + KPI cards + chart cards + table`.
- Illegible faux-print effects, heavy stains, high-contrast texture, or
  excessive rotations.
- Using this style for dense operational monitoring where `dashboard` is the
  better system.

## Implementation Notes

- Keep all CSS and JS inline and local-first. No external JS/CDN.
- On mobile, stack artifacts into a single-column folio: active artifact first,
  folio rail second, receipt tape third, drawer last.
- Stable dimensions matter: tickets, cards, icon buttons, chips, and drawer rows
  should not shift when selected or filtered.
