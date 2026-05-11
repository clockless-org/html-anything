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
| `default` | The input does not clearly fit a specialized style | Clean live page with strong summary, useful sections, and practical drill-down |
| `teaching` | Tutorial, lesson, "teach me", explainer, course-like page | Visual stage, step rail, try-it control, check-yourself, recap |
| `interactive-studio` | Object/system/science/product/spec exploration | App-like lab with selector, stage, inspector, comparison, controls |
| `relationship` | 1:1 chats and intimate message exports | Aggregate-first relationship rhythm report with anonymized evidence |
| `dashboard` | Operational, tabular, finance, admin, log, planning data | Dense KPIs, charts, filters, flags, searchable table |
| `personal-atlas` | Hybrid personal archives and knowledge collections | Memory atlas with timelines, clusters, highlights, searchable drill-down |
| `timeline-story` | Personal histories where time is the main axis | Scroll-driven story with timeline spine, chapters, rhythm strip, memory drawer |
| `map-atlas` | Places, routes, trips, rideshare, location/photo geodata | Spatial atlas with map/route stage, place drawer, filters, waypoint browser |
| `network-map` | People, senders, contacts, communities, payments, professional networks | Relationship graph with entity inspector, clusters, hubs, linked records |
| `editorial` | Essays, articles, reading lists, research collections | Magazine-like story, section rhythm, pull quotes, claims, topic cards |
| `developer` | Repos, diffs, PRs, CI logs, traces | Evidence-based technical report with risks, hotspots, raw evidence |
| `paper` | Long documents, PDFs, DOCX, legal/medical/lab records | Conservative structured review with caveats, evidence, definitions |

## System Names

| Style | Underlying system |
|---|---|
| `default` | Insight Brief |
| `teaching` | Lesson Lab |
| `interactive-studio` | Object Studio |
| `relationship` | Rhythm Report |
| `dashboard` | Ops Console |
| `personal-atlas` | Memory Atlas |
| `timeline-story` | Timeline Story |
| `map-atlas` | Map Atlas |
| `network-map` | Network Map |
| `editorial` | Editorial Desk |
| `developer` | Evidence Workbench |
| `paper` | Review Dossier |

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

- warm workspace/editorial systems -> `default`, `editorial`, `personal-atlas`
- precision product/dark app systems -> `dashboard`, `developer`
- cinematic object galleries -> `interactive-studio`, `teaching`
- temporal/scrollytelling systems -> `timeline-story`, `personal-atlas`
- spatial atlas systems -> `map-atlas`
- graph/network systems -> `network-map`
- broadsheet/media systems -> `editorial`, `paper`
- data-infrastructure systems -> `dashboard`, `developer`
- playful canvas systems -> `teaching`, `personal-atlas`

## Use Case Routing

| Use case | Prefer |
|---|---|
| "My listening/watch/browsing/order/reading year" | `timeline-story` |
| "Where I went / saved / traveled / rode" | `map-atlas` |
| "Who I know / talk to / pay / email" | `network-map` |
| "Operate this queue / ledger / incident / backlog" | `dashboard` |
| "Teach this idea" | `teaching` |
| "Explore this object/system/spec" | `interactive-studio` |
| "Analyze this 1:1 relationship chat" | `relationship` |
| "Read/synthesize this argument or research set" | `editorial` |
| "Review this diff/log/trace/repo" | `developer` |
| "Review this formal/high-stakes document" | `paper` |

Do not ask users to pick from these by default. Choose internally unless the
user explicitly asks for style options.
