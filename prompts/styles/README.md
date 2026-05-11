# Style Catalog

These style prompts define the reusable **design systems + layout systems** for
html-anything. Source prompts answer "what is in this input?" Style prompts
answer "what system should shape the HTML experience?"

Styles are not skins. A style must change the page shell, first viewport,
component vocabulary, interaction model, density, chart grammar, and voice.
The shared contract is [`_system.md`](./_system.md).

The default is `auto`: the agent picks a style from the request and source.

## Current Styles

| Style | Use when | Core shape |
|---|---|---|
| `default` | The input does not clearly fit a specialized style | Clean live page with strong summary, useful sections, practical drill-down |
| `teaching` | Tutorial, lesson, "teach me", interactive object/system/spec exploration | Visual stage (or object stage), step rail / entity selector, try-it controls, check-yourself / live inspector |
| `relationship` | 1:1 chats and intimate message exports | Aggregate-first relationship rhythm report with anonymized evidence |
| `living-essay` | Reflective essays, Kindle highlights, idea notes, and concept-heavy reading archives | Manuscript stage with sticky question rail, concept weave, highlighted passages, and evidence folio |
| `dashboard` | Operational, tabular, finance, admin, log, planning data | Dense KPIs, charts, filters, flags, searchable table |
| `timeline-story` | Personal histories — chronological (orders, listening, health) and topical (Notion / Obsidian vaults) | Scroll-driven story with timeline spine, chapters, rhythm strip, drawer |
| `map-atlas` | Places, routes, trips, rideshare, location/photo geodata | Spatial atlas with map/route stage, place drawer, filters, waypoint browser |
| `network-map` | People, senders, contacts, communities, payments, professional networks | Relationship graph with entity inspector, clusters, hubs, linked records |
| `document` | Essays, articles, reading lists, research collections, PDFs, DOCX, legal/medical/lab records, policy docs | Document review with cover, reading rail, body sheet, evidence/citations, drill-down |
| `developer` | Repos, diffs, PRs, CI logs, traces | Evidence-based technical report with risks, hotspots, raw evidence |

## System Names

| Style | Underlying system |
|---|---|
| `default` | Insight Brief |
| `teaching` | Lesson Lab |
| `relationship` | Rhythm Report |
| `living-essay` | Concept Weave |
| `dashboard` | Ops Console |
| `timeline-story` | Timeline Story |
| `map-atlas` | Map Atlas |
| `network-map` | Network Map |
| `document` | Document Review |
| `developer` | Evidence Workbench |

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

For html-anything, keep Clockless tokens from `prompts/_design.md` as the brand
base. Borrow archetypes, not brand identities:

- warm workspace systems → `default`, `document`, `timeline-story`
- precision product / dark app systems → `dashboard`, `developer`
- cinematic stage / object galleries → `teaching`
- temporal / scrollytelling systems → `timeline-story`
- spatial atlas systems → `map-atlas`
- graph / network systems → `network-map`
- broadsheet / media systems → `document`
- playful canvas systems → `teaching`

## Use Case Routing

| Use case | Prefer |
|---|---|
| "My listening/watch/browsing/order/reading year" | `timeline-story` |
| "My Kindle highlights / reflective reading notes / concept essay" | `living-essay` |
| "My Notion / Obsidian / markdown knowledge base" | `timeline-story` |
| "Where I went / saved / traveled / rode" | `map-atlas` |
| "Who I know / talk to / pay / email" | `network-map` |
| "Operate this queue / ledger / incident / backlog" | `dashboard` |
| "Teach this idea or explore this object/system/spec" | `teaching` |
| "Analyze this 1:1 relationship chat" | `relationship` |
| "Read/synthesize this argument or research set" | `document` |
| "Review this diff/log/trace/repo" | `developer` |
| "Review this formal/high-stakes document" | `document` |

Do not ask users to pick from these by default. Choose internally unless the
user explicitly asks for style options.
