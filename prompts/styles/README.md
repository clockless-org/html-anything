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
| `teaching` | Tutorial, lesson, "teach me", interactive explainers, course-like pages | Visual stage, step rail, try-it controls, concept cards, check-yourself, recap |
| `interactive-learning` | App-like object/system studios, anatomy/architecture/spec exploration, manipulable learning models | Learning Studio with entity rail, central interactive stage, live inspector, layer/mode controls, comparison bench |
| `relationship` | 1:1 chats and intimate message exports | Aggregate-first relationship rhythm report with anonymized evidence |
| `living-essay` | Reflective essays, Kindle highlights, idea notes, and concept-heavy reading archives | Mycelium writing environment with a vertical question capsule, spore words, living SVG threads, and quiet appendix |
| `dashboard` | Operational, tabular, finance, admin, log, planning data | Dense KPIs, charts, filters, flags, searchable table |
| `timeline-story` | Personal histories — chronological (orders, listening, health) and topical (Notion / Obsidian vaults) | Scroll-driven story with timeline spine, chapters, rhythm strip, drawer |
| `map-atlas` | Places, routes, trips, rideshare, location/photo geodata | Spatial atlas with map/route stage, place drawer, filters, waypoint browser |
| `paper-trail` | Explicit tactile/printed-collateral requests: itineraries, hotel folios, receipts, tickets, reservation bundles | Artifact desk with folio tabs, receipt tape, stamp callouts, source drawer |
| `network-map` | People, senders, contacts, communities, payments, professional networks | Relationship graph with entity inspector, clusters, hubs, linked records |
| `document` | Essays, articles, reading lists, research collections, PDFs, DOCX, legal/medical/lab records, policy docs | Document review with cover, reading rail, body sheet, evidence/citations, drill-down |
| `editorial-carousel` | Brand strategy essays, founder letters, article takeaways, lightweight reports meant to be shared as a sequence | Magazine-like issue with cover, spread rail, 4-8 argument spreads, evidence drawer, copy actions |
| `developer` | Repos, diffs, PRs, CI logs, traces | Terminal evidence workbench with risks, hotspots, raw evidence |

## System Names

| Style | Underlying system |
|---|---|
| `default` | Insight Brief |
| `teaching` | Lesson Lab |
| `interactive-learning` | Learning Studio |
| `relationship` | Rhythm Report |
| `living-essay` | Mycelium Writing Environment |
| `dashboard` | Ops Console |
| `timeline-story` | Timeline Story |
| `map-atlas` | Map Atlas |
| `paper-trail` | Paper Trail |
| `network-map` | Network Map |
| `document` | Document Review |
| `editorial-carousel` | Editorial Carousel |
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
- cinematic lesson stages → `teaching`
- app-like object/system studios → `interactive-learning`
- temporal / scrollytelling systems → `timeline-story`
- spatial atlas systems → `map-atlas`
- tactile printed-artifact systems → `paper-trail`
- graph / network systems → `network-map`
- broadsheet / media systems → `document`
- premium carousel / manifesto systems → `editorial-carousel`
- playful canvas / learning studios → `teaching`, `interactive-learning`

## Use Case Routing

| Use case | Prefer |
|---|---|
| "My listening/watch/browsing/order/reading year" | `timeline-story` |
| "My Kindle highlights / reflective reading notes / concept essay" | `living-essay` |
| "My Notion / Obsidian / markdown knowledge base" | `timeline-story` |
| "Where I went / saved / traveled / rode" | `map-atlas` |
| "Make it feel like tickets / receipts / a hotel folio / travel papers" | `paper-trail` |
| "Who I know / talk to / pay / email" | `network-map` |
| "Operate this queue / ledger / incident / backlog" | `dashboard` |
| "Teach this idea as a lesson/tutorial" | `teaching` |
| "Explore this object/system/spec as an interactive app/studio" | `interactive-learning` |
| "Analyze this 1:1 relationship chat" | `relationship` |
| "Read/synthesize this argument or research set" | `document` |
| "Turn this essay into a carousel / make it feel like a magazine issue" | `editorial-carousel` |
| "Review this diff/log/trace/repo" | `developer` |
| "Review this formal/high-stakes document" | `document` |

Do not ask users to pick from these by default. Choose internally unless the
user explicitly asks for style options.

## Example Source For Paper Trail

Use [`examples/itinerary-trip/input.csv`](../../examples/itinerary-trip/input.csv)
as the first `paper-trail` example. It has flights, hotels, restaurants,
scheduled stops, costs, and overlap warnings, so the style can render a natural
desk of key cards, ticket stubs, receipt tape, and stamped conflict callouts.
