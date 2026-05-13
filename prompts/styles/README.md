# Style Catalog

These style prompts define the reusable **design systems + layout systems** for
html-anything. Source prompts answer "what is in this input?" Style prompts
answer "what system should shape the HTML experience?"

Styles are not skins. A style must change the page shell, first viewport,
component vocabulary, interaction model, density, chart grammar, and voice.
The shared contract is [`_system.md`](./_system.md). The compact catalog is
[`catalog.json`](./catalog.json): it keeps each style's routing triggers,
source fit, example, preview, required primitives, and avoid rules in one
machine-checkable place.

The default is `auto`: the agent picks a style from the request and source.

## Current Styles

| Style | Use when | Core shape |
|---|---|---|
| `default` | The input does not clearly fit a specialized style | Clean live page with strong summary, useful sections, practical drill-down |
| `teaching` | Tutorial, lesson, "teach me", interactive explainers, course-like pages | Visual stage, step rail, try-it controls, concept cards, check-yourself, recap |
| `love-romance-3d` | Couple chats or romance-themed relationship recaps that need a soft 3D keepsake look | 3D icon-stage cover, candy-glass metrics, pulse boards, and privacy-first evidence |
| `living-essay` | Reflective essays, Kindle highlights, idea notes, and concept-heavy reading archives | Mycelium writing environment with a vertical question capsule, spore words, living SVG threads, and quiet appendix |
| `dashboard` | Operational, tabular, finance, admin, log, planning data | Dense KPIs, charts, filters, flags, searchable table |
| `soft-saas` | Support inboxes, email campaigns, onboarding, customer-success queues, and lightweight SaaS metrics | Airy SaaS app canvas with profile/source card, central metric bloom, campaign panels, leaderboard, and activity strip |
| `kinetic-scoreboard` | Multi-participant activity streams, team chats, work races, ranked contributors | Full-viewport championship lanes with kinetic bodies, live ranks, telemetry, and linked evidence pits |
| `timeline-story` | Personal histories — chronological (orders, listening, health) and topical (Notion / Obsidian vaults) | Scroll-driven story with timeline spine, chapters, rhythm strip, drawer |
| `global-travel` | Travel history, Uber/Lyft trip exports, and personal mobility recaps that should open on an airy dotted world map | Centered travel section with selector, dotted map, warm pins, callout, and metric runway |
| `map-atlas` | Places, routes, trips, location/photo geodata | Spatial atlas with map/route stage, place drawer, filters, waypoint browser |
| `network-map` | Personal/professional networks, senders, contacts, communities, payments | Relationship graph with entity inspector, clusters, hubs, linked records |
| `document` | Essays, articles, reading lists, research collections, PDFs, DOCX, legal/medical/lab records, policy docs | Document review with cover, reading rail, body sheet, evidence/citations, drill-down |
| `kami-reading` | Long prose, DOCX memos, articles, essays, and manuscripts that should feel calm and easy to read | Warm parchment document with serif cover, inline contents, printable chapter sections, progress, and source appendix |
| `architectural-spread` | Long-form visual explainers, object-focused articles, manifestos, and split-screen editorial requests | Full-screen architectural split spread with visual object, cream content panel, serif italic emphasis, anchors, and dots |
| `digital-eguide` | E-guides, PDF guides, creator guides, playbooks, lead magnets, downloadable course previews | Two-page guide spread with cover, TOC, inside lesson, pull quote, steps, exercise strip |
| `editorial-carousel` | Brand strategy essays, founder letters, article takeaways, lightweight reports meant to be shared as a sequence | Magazine-like issue with cover, spread rail, 4-8 argument spreads, evidence drawer, copy actions |
| `terminal-cli` | Explicit terminal, CLI, shell, mainframe, hacker-console, or tmux requests | Dark-only shell work surface with prompt, status rail, terminal panes, command controls, and raw console |
| `developer` | Repos, PRs, CI logs, traces | Terminal evidence workbench with risks, hotspots, raw evidence |

## System Names

| Style | Underlying system |
|---|---|
| `default` | Insight Brief |
| `teaching` | Lesson Lab |
| `love-romance-3d` | Keepsake 3D Rhythm |
| `living-essay` | Mycelium Writing Environment |
| `dashboard` | Ops Console |
| `soft-saas` | Soft SaaS Console |
| `kinetic-scoreboard` | Kinetic Championship |
| `timeline-story` | Timeline Story |
| `global-travel` | Global Travel Map |
| `map-atlas` | Map Atlas |
| `network-map` | Network Map |
| `document` | Document Review |
| `kami-reading` | Kami Longform Reader |
| `architectural-spread` | Architectural Editorial Spread |
| `digital-eguide` | Digital E-Guide Spread |
| `editorial-carousel` | Editorial Carousel |
| `terminal-cli` | Terminal CLI |
| `developer` | Terminal Evidence Workbench |

## Notes From DESIGN.md Libraries

The VoltAgent `awesome-design-md` project is useful as a design prompt pattern,
not as a brand library to copy. It shows that a good style file should include:

- visual theme and atmosphere,
- color roles,
- typography rules,
- component behavior,
- layout principles,
- depth and elevation,
- do/don't guardrails,
- responsive behavior,
- quick agent instructions.

For html-anything, keep Clockless tokens from `prompts/styles/_design.md` as the
default brand base unless a style explicitly provides a complete token
override. Borrow archetypes, not brand identities:

- warm workspace systems → `default`, `document`, `timeline-story`
- precision product / dark app systems → `dashboard`, `developer`
- airy product analytics systems → `soft-saas`
- cinematic lesson stages → `teaching`
- temporal / scrollytelling systems → `timeline-story`
- travel-history world-map sections → `global-travel`
- kinetic lane / race / scoreboard systems → `kinetic-scoreboard`
- spatial atlas systems → `map-atlas`
- graph / network systems → `network-map`
- broadsheet / media systems → `document`
- parchment longform reader systems → `kami-reading`
- architectural split-screen editorial systems → `architectural-spread`
- creator guide / PDF guide systems → `digital-eguide`
- premium carousel / manifesto systems → `editorial-carousel`
- terminal / CLI / shell systems → `terminal-cli`
- playful canvas / learning studios → `teaching`

The Open Design repo is useful for style packaging discipline: each skill-like
style should carry a concrete design intent, implementation checklist, example
surface, and anti-pattern list. In this repo that discipline lives in
`catalog.json` plus the individual style prompt, rather than in user-facing
docs.

## Catalog Contract

Every style in `src/types.ts` must have exactly one `catalog.json` entry. Each
entry should include:

- `system`: the underlying design/layout system, not a visual mood.
- `useCases`: one or more stable user-facing use cases from the catalog.
- `triggers`: natural language cues that should route here.
- `bestSources`: source families that fit this style.
- `example` and `preview`: a concrete checked-in example when available.
- `referenceHtml` and `referenceAssets`: optional packaged style targets under
  `prompts/styles/references/<style>/` that installed agents should read before
  generating exact-match pages. Assets live under
  `prompts/styles/references/<style>/assets/` and are copied into the output
  `assets/` folder only when that style needs them.
- `coreScaffold`: the first-viewport/layout skeleton.
- `requiredPrimitives`: style-native classes that generated HTML should use.
- `avoid`: generic fallbacks or false signals the style must not produce.

The tests validate catalog completeness, prompt existence, and checked-in
example/preview paths. When adding a style, update the catalog before shipping.

## Use Case Routing

Use cases are user-facing. Styles are internal systems that one use case can
choose from.

| Use case | Includes | Prefer |
|---|---|
| Teaching Studios | Tutorials, explainers, lessons, object/system studios | `teaching` |
| Files & Work Data | CSV/spreadsheet-style exports, PDFs, DOCX, Markdown, logs, CI output, PR patches, stack traces, repos, finance, calendars, issue trackers, email/support archives, research records, slide-style carousel outputs | `dashboard`, `soft-saas`, `document`, `kami-reading`, `architectural-spread`, `digital-eguide`, `editorial-carousel`, `developer`, `terminal-cli` |
| Conversation Analysis | Couple/friend chats, WhatsApp/WeChat, team channels, message streams | `love-romance-3d`, `kinetic-scoreboard`, `network-map` |
| Personal Data & Places | Orders, health, browsing, media history, reading, payments, professional network, notes, AI chats, photos with EXIF, saved places, travel history, GPX/KML, itineraries | `timeline-story`, `global-travel`, `living-essay`, `network-map`, `map-atlas` |

Do not ask users to pick from these by default. Choose internally unless the
user explicitly asks for style options.

## Example Source For Digital E-Guide

Use [`examples/pdf/input.pdf`](../../examples/pdf/input.pdf) as the first
`digital-eguide` example. It is a compact sector report with sections,
recommendations, glossary, and citations, so the style can turn a formal PDF
into a cover page plus actionable inside spread without falling back to a
dashboard or memo.

## Example Source For Kami Reading

Use [`examples/docx/input.docx`](../../examples/docx/input.docx) as the first
`kami-reading` example. It is a long internal decision memo with hierarchy,
risks, open questions, dates, and appendix references, so the style can prove
that long work text becomes a calm reader rather than a dashboard.

## Example Source For Architectural Spread

Use [`examples/markdown/input.md`](../../examples/markdown/input.md) as the
first `architectural-spread` example. It is a short narrative essay with a
single strong metaphor, so the style can turn the thesis into a large visual
object and the sections into full-screen editorial spreads.

## Example Source For Terminal CLI

Use [`examples/ci-log/input.log`](../../examples/ci-log/input.log) as the first
`terminal-cli` example. It has GitHub Actions markers, passing setup phases,
failing Vitest assertions, an exit code, and enough raw line evidence for a
shell-native debugging console.
