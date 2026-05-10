---
name: html-anything
description: Turn any file or URL into a single self-contained interactive HTML infographic — analyze the content, extract patterns, visualize them, then inline the original data so users can drill in.
when_to_use: User says "convert to HTML", "render as HTML", "make a webpage from", "analyze and visualize", asks for an "interactive" or "browsable" version of a file, or pastes a file path / URL with a request to view, share, understand, or get insights from it.
---

# html-anything

You are turning a file or URL into a **single self-contained HTML page
that surfaces the insights in the content**, not a faithful re-render of
the source. Think infographic + analysis dashboard, not document viewer.

The output should make the user say *"I learned something I didn't know
from the raw file"* — patterns, timelines, distributions, outliers,
themes — visualized as the headline. The original data goes inline so
the user can drill in, but it's the **drill-down**, not the lede.

Examples of the right shape:

- **2-person WhatsApp or WeChat / 微信 export** → mock-academic
  relationship report: calendar heatmap, hourly chat rhythm, monthly
  relative enthusiasm, signature words, high-frequency word
  contribution, lexical sentiment, and relationship-keyword extraction.
  Keep shareable reports aggregate-first; do not include a raw-message
  appendix unless the user explicitly asks for one.
- **200-person Slack channel** → top contributors leaderboard, channel
  activity heatmap by day-of-week + hour, topic cloud, recent
  highlights — full message log behind a "Show all messages" tab.
- **50K-row sales CSV** → summary stats, category breakdown chart,
  outlier callouts, time-series line — sortable table behind a
  "Browse rows" tab.
- **Long PDF / article** → 3-bullet TL;DR, pulled key quotes, section
  nav with one-line summaries — full text as a reading-mode toggle.
- **GitHub repo** → "what is this" 2-paragraph summary, architecture
  sketch, the 3 files that explain it, file tree as drill-down.

Your job is to **look at a sample, find what's interesting in it**,
design the analysis + charts + visual story, then ship the HTML+CSS+JS
that renders all of it. The full data is inlined into the HTML for
client-side rendering of the drill-down sections.

## Behavior

1. **Identify the source the user wants converted.**
   - If they pasted a path or URL → confirm it (file exists, URL fetches).
   - If they named a *kind* of data ("my WeChat chat", "my WhatsApp
     chat", "my Spotify history", "my Google Maps stars", "my Twitch
     viewing history"):
     **don't ask for the file yet.** First read the matching source
     prompt's `## Export instructions` section and walk them through
     getting the data. Most data sources need a 2–4 step export from the
     source app or service before there's a file to convert. The skill
     does this onboarding *first*; the conversion is the second half.

2. **Read [`prompts/_design.md`](./prompts/_design.md) first.** It has
   the Clockless design tokens (colors, fonts, spacing, radius, shadow
   scales, the Google Fonts import line) every output must use. Apply
   these regardless of source type. They are non-negotiable so all
   html-anything outputs feel like one product line.

3. **Look up the matching source prompt** in `prompts/<source-type>.md`.
   The source prompt covers what's specific to this content type
   (analytical structure, data shape, choice of visualizations, and
   often `## Export instructions` for how the user gets the data in the
   first place). If no specific prompt fits, use `prompts/default.md`.

4. **Read a sample, not the whole thing.** ~5–15 KB is plenty.
   - Tabular data: header + first 5 rows + last 2 rows + column stats.
   - Chat: first 8 + last 4 messages + sender list.
   - Long text: first 1500 chars + headings + word count.
   - Email archive: counts + senders + thread shapes + first 4 / last 4
     messages + a sample of the longest thread + open-loop callouts.
   - Meeting transcript: speaker stats with talk-time + first 12 cues +
     last 4 cues + each speaker's opening turn + the longest cues.
   - Event stream (JSONL / NDJSON / server log): inferred schema +
     time-bucket histogram + severity / category counts + top sources
     and messages + outlier cards + first 12 + last 4 events.
   - Finance file (bank / invoice / QuickBooks CSV): summary card
     (in / out / net or invoiced / paid / outstanding) + category or
     account breakdown + recurring vendors + flag cards (duplicate /
     outlier / first-time / overdue) + first 8 + last 3 rows.
   - Geo / route (GPX / KML / itinerary / location-history): pre-
     projected SVG polyline + bbox + km splits + elevation profile
     + pace profile + pauses (routes); day buckets + cities + types
     + conflict callouts (itineraries); top dwell clusters + hour-
     of-day counts + per-day density (location history).
   - URL article: first 2-3K chars of the rendered text + meta.
   - Repo: README + tree + 3 key files.

5. **Design the page**, applying the design tokens from `_design.md`
   plus the source-specific guidance. Aim for a page that lets the
   user **re-experience** their data — not just read it. An infographic
   is the floor, not the ceiling: where the content supports it, push
   into interactive maps, scrubbable timelines, "year in review" style
   replays, hover-to-reveal storytelling, animated reveals on scroll.
   The user should leave saying *"I lived through this again"*, not
   *"I saw a chart"*.
   Universal requirements:
   - Light + dark mode via `prefers-color-scheme` (tokens cover both).
   - Mobile-first responsive layout.
   - Search where the content has searchable items.
   - "Copy as Markdown" button where it makes sense.
   - Single self-contained HTML — inline CSS, inline JS. The only
     external resource allowed is the Google Fonts import in
     `_design.md` (Space Grotesk + Plus Jakarta Sans).

5. **Inline the full data.** Embed it as a JSON literal:
   ```html
   <script>const DATA = /* the full data here */;</script>
   ```
   Escape `</script>` to `<\/script>` inside the JSON string to keep the
   browser parser happy. The JS you wrote uses `DATA` to render rows /
   messages / sections — the LLM (you) only ever saw the sample, but the
   page renders the full thing client-side.

6. **Write the file** to `<input-stem>.html` next to the input (or
   wherever the user asked).

## Sources supported

| Prompt file | When |
|---|---|
| [`prompts/google-maps-stars.md`](./prompts/google-maps-stars.md) | Google Maps stars / saved places (via Google Takeout) — interactive personal world atlas |
| [`prompts/amazon-orders.md`](./prompts/amazon-orders.md) | Amazon "Request Your Information" / legacy Order Reports CSV — personal commerce memory + money audit (spend over years, reorder DNA, categories, recipients, returns / refunds, searchable item drill-down) |
| [`prompts/kindle-highlights.md`](./prompts/kindle-highlights.md) | Kindle `My Clippings.txt` (USB) + per-book Kindle Notebook HTML email export — personal reading-memory atlas (books shelf, monthly reading rhythm + hour-of-day strip, heuristic theme clusters, searchable quote browser with Copy-as-Markdown) |
| [`prompts/spotify-history.md`](./prompts/spotify-history.md) | Spotify Privacy export (Account Data or Extended Streaming History) — year-by-year scroll experience |
| [`prompts/twitch-history.md`](./prompts/twitch-history.md) | Twitch data request export (viewing history + chat) — top streamers wall, chat heatmap |
| [`prompts/iphone-health.md`](./prompts/iphone-health.md) | Apple Health `export.zip` (export.xml + workout-routes/) — personal health story with rings + sleep + routes |
| [`prompts/wechat.md`](./prompts/wechat.md) | WeChat / 微信 exports from WeChatMsg / 留痕 (`.html`, `.csv`, `.txt`, `.json`, `.docx`) — relationship report with calendar heatmap, relative enthusiasm, word specificity, contribution rating, sentiment trend, no raw appendix by default |
| [`prompts/whatsapp.md`](./prompts/whatsapp.md) | WhatsApp `_chat.txt` export — same detailed relationship report as WeChat: calendar heatmap, relative enthusiasm, word specificity, contribution rating, sentiment trend, no raw appendix by default |
| [`prompts/slack.md`](./prompts/slack.md) | Slack channel JSON export — multi-sender pack: heatmap, leaderboard, threaded drill-down |
| [`prompts/discord.md`](./prompts/discord.md) | DiscordChatExporter JSON / CSV — community-server pack: leaderboard with long-tail, reply chains, emoji signature |
| [`prompts/telegram.md`](./prompts/telegram.md) | Telegram Desktop `result.json` — personal/group/channel framing, reply chains, forwarded-from callouts |
| [`prompts/imessage.md`](./prompts/imessage.md) | iMessage-style CSV (Date/Timestamp + Sender/From/IsFromMe + Message/Body/Text) — bubble drill-down with right-aligned own-side messages |
| [`prompts/multi-sender-chat.md`](./prompts/multi-sender-chat.md) | Generic chat CSV from an unknown source — platform-agnostic heatmap + leaderboard + decisions |
| [`prompts/csv.md`](./prompts/csv.md) | CSV / TSV tabular data |
| [`prompts/markdown.md`](./prompts/markdown.md) | Markdown documents |
| [`prompts/pdf.md`](./prompts/pdf.md) | `.pdf` — long-form documents, reports, papers |
| [`prompts/docx.md`](./prompts/docx.md) | `.docx` — Word memos, RFCs, briefs |
| [`prompts/email.md`](./prompts/email.md) | `.eml` / `.mbox` mailboxes (including Gmail Takeout exports) |
| [`prompts/transcript.md`](./prompts/transcript.md) | `.vtt` / `.srt` / timecoded Zoom & Teams `.txt` meeting transcripts |
| [`prompts/jsonl.md`](./prompts/jsonl.md) | `.jsonl` / `.ndjson` line-delimited JSON event streams (and `.json` / `.log` / `.txt` files whose contents are line-delimited JSON) |
| [`prompts/log.md`](./prompts/log.md) | `.log` / `.txt` server logs — Apache / Nginx access logs, syslog, application error logs, generic timestamped app logs |
| [`prompts/json.md`](./prompts/json.md) | JSON data files |
| [`prompts/git-diff.md`](./prompts/git-diff.md) | `.diff`, raw `git diff` output — review checklist, risk map, collapsible diff |
| [`prompts/pr-review.md`](./prompts/pr-review.md) | `.patch` (`git format-patch` mailbox or GitHub PR `.patch`) — commit timeline, evidence-based reviewer's checklist, test-touched flags |
| [`prompts/ci-log.md`](./prompts/ci-log.md) | CI / build / test logs (GitHub Actions, GitLab CI, CircleCI, Buildkite, Jenkins, generic `npm test` / `pytest` / `go test`) — failure summary, suspected-cause hypotheses |
| [`prompts/stack-trace.md`](./prompts/stack-trace.md) | Runtime stack traces (Python, Node / JS, Java, Go, Ruby, Rust, .NET) — likely-app-frame headline, folded vendor frames, cause chain |
| [`prompts/bank-transactions.md`](./prompts/bank-transactions.md) | Bank / credit-card statement CSVs — cashflow timeline, category breakdown, recurring-vendor + duplicate + outlier panels, searchable transactions |
| [`prompts/invoices.md`](./prompts/invoices.md) | Invoice / receipt CSVs — invoiced-vs-paid-vs-outstanding card, aging buckets, top customers, overdue callouts, invoice scorecard |
| [`prompts/quickbooks.md`](./prompts/quickbooks.md) | QuickBooks / Xero / Wave general-ledger and P&L exports — collapsible account tree, top-level category rollup, class breakdown, period framing |
| [`prompts/ics-calendar.md`](./prompts/ics-calendar.md) | `.ics` / `.ical` calendar exports (Google Calendar, Outlook, Apple Calendar, Fastmail) — calendar audit: time-allocation map, busy-hours heatmap, recurring series, back-to-back blocks, meeting-free streaks |
| [`prompts/issue-tracker.md`](./prompts/issue-tracker.md) | Issue / task CSVs from Linear, Jira, GitHub Issues, Asana, ClickUp, generic project trackers — project audit: status flow, owner load, priority distribution, stale items, bottleneck callouts, swimlane drill-down |
| [`prompts/trello-board.md`](./prompts/trello-board.md) | Trello board JSON export (`{ id, name, lists, cards, members, labels }`) — board audit: lane breakdown, member load, stale + overdue cards, read-only kanban swimlanes |
| [`prompts/obsidian-vault.md`](./prompts/obsidian-vault.md) | Directory of `.md` files cross-linked with `[[wikilinks]]` (Obsidian vaults, wiki-style notes) — concept map / backlink graph, theme clusters, hub leaderboard, TODO + stale + orphan callouts, searchable knowledge atlas |
| [`prompts/notion-export.md`](./prompts/notion-export.md) | Notion "Markdown & CSV" workspace export — page tree mirroring Notion hierarchy, top-level page index, cross-page link counts, TODO + stale + orphan callouts, searchable atlas |
| [`prompts/markdown-folder.md`](./prompts/markdown-folder.md) | Generic directory of `.md` files (Hugo / Jekyll content, dumped Bear exports, "Notes" folders, MkDocs `docs/`) — folder breakdown, publication timeline, longest-notes leaderboard, TODO + stale + orphan callouts, searchable atlas |
| [`prompts/gpx.md`](./prompts/gpx.md) | `.gpx` GPX routes & workouts (Strava, Garmin, Komoot, Apple Health) — inline-SVG polyline (no map tiles), km splits, elevation profile, pace profile, pauses |
| [`prompts/kml.md`](./prompts/kml.md) | `.kml` KML coordinates (Google Earth, Google My Maps) — inline-SVG paths + place dots, placemark list |
| [`prompts/travel-itinerary.md`](./prompts/travel-itinerary.md) | multi-day itinerary CSVs (Date + Location + Type/Title/Time/Notes/Cost columns) — day-by-day timeline, anchor-city strip, conflict callouts, city / country / type breakdowns |
| [`prompts/location-history.md`](./prompts/location-history.md) | Google-Takeout-style location-history JSON / flat lat-lon CSV — inline-SVG dwell map (no map tiles), top places leaderboard, hour-of-day rhythm, per-day density |
| [`prompts/bookmarks.md`](./prompts/bookmarks.md) | Netscape-format bookmarks HTML exports (Chrome / Firefox / Safari / Edge / Pinboard / Raindrop) — research audit: topic clusters, top-domain leaderboard, folder breakdown, saving-rhythm sparkline, duplicate / stale / dead-link callouts, searchable card drill-down |
| [`prompts/bibliography.md`](./prompts/bibliography.md) | BibTeX (`.bib`) and RIS (`.ris`) bibliographies (Zotero, Mendeley, EndNote, Google Scholar, JabRef) — literature-review audit: year-coverage histogram, venue + author leaderboards, reference-type breakdown, abstract drill-down with DOI |
| [`prompts/url-list.md`](./prompts/url-list.md) | Plain `.txt` or markdown with one URL per line ("tab dump"), optionally with section headings or trailing notes — research audit: keyword-driven topic clusters, top domains, section breakdown, duplicate / dead callouts, searchable cards |
| [`prompts/reading-list.md`](./prompts/reading-list.md) | Pocket / Instapaper / Raindrop / Matter / Readwise Reader / Omnivore CSV / JSON exports — reading-queue audit: saving-rhythm timeline, top domains, status / collection breakdown, stale-inbox callouts, searchable cards |
| [`prompts/github-repo.md`](./prompts/github-repo.md) | github.com/owner/repo URLs |
| [`prompts/url-article.md`](./prompts/url-article.md) | Blog posts, news articles, long-form web pages |
| [`prompts/medical-visit.md`](./prompts/medical-visit.md) | Clinical visit summaries (`.md` / `.txt`) — care-record summary: encounters, vitals (label-only, no interpretation), medication mentions, missing-info & "ask your clinician" question list. Synthetic data only. |
| [`prompts/lab-results.md`](./prompts/lab-results.md) | Laboratory results CSV with reference ranges (header trio of test/value/reference) — out-of-reference callouts using *"outside the reference range printed on this row"*, trend sparklines for repeated tests, panel grouping. |
| [`prompts/legal-chronology.md`](./prompts/legal-chronology.md) | Free-text legal case chronologies (`.md` / `.txt`) — case header, deadline map (dates listed on the document), filings list, parties, missing-exhibit callouts, "ask your attorney" question list. Synthetic data only. |
| [`prompts/chatgpt-export.md`](./prompts/chatgpt-export.md) | OpenAI ChatGPT data export `conversations.json` — array of conversations with `mapping` graph + `current_node` + `default_model_slug`. Personal AI work-memory atlas — overview cards, weekly timeline, topic clusters, reusable-prompt + important-answer + unresolved heuristics, filterable conversation index with drill-down. |
| [`prompts/claude-chat-export.md`](./prompts/claude-chat-export.md) | Anthropic Claude chat export — `conversations.json` with `chat_messages` per conversation (`sender: human / assistant`), ISO timestamps. Same atlas as ChatGPT, with `claude-*` model labels. |
| [`prompts/ai-chat-export.md`](./prompts/ai-chat-export.md) | Generic AI chat history — `{ conversations: [...] }` JSON wrapper, OR markdown / text "User: / Assistant:" transcript (separated by `## Conversation` / `# heading` / `---`). Same atlas; degrades gracefully when timestamps / model slugs are missing. |
| [`prompts/default.md`](./prompts/default.md) | Anything else |

Long-document sources (`markdown`, `pdf`, `docx`) also load
[`prompts/_document.md`](./prompts/_document.md) — shared
insight-first guidance (TL;DR, claim cards, section nav, 5-min vs
full reading mode). New long-document sources should follow the same
pattern.

Multi-sender chat sources (`slack`, `discord`, `telegram`, `imessage`,
`multi-sender-chat`) also load
[`prompts/_chat.md`](./prompts/_chat.md) — the shared contract for
the chat pack: activity heatmap, contributor leaderboard, decisions /
action items / open questions, topic clusters, and a searchable log
drill-down. WhatsApp and WeChat keep the bespoke intimate-relationship
report framing and are **not** part of this family.

Developer-artifact sources (`git-diff`, `pr-review`, `ci-log`,
`stack-trace`) also load
[`prompts/_developer.md`](./prompts/_developer.md) — the shared
contract for the developer-artifact pack: review checklist (concrete,
evidence-based items), risk hotspots, collapsible raw diff / log /
trace, copyable Markdown summary, and **hypothesis discipline**
(every inferred cause / risk / call-site is labeled with a visible
"Hypothesis" chip; no certainty claims).

Event-stream sources (`jsonl`, `log`) also load
[`prompts/_event_stream.md`](./prompts/_event_stream.md) — the shared
contract for the event-stream pack: volume-over-time histogram,
severity / category breakdown, outlier / anomaly callouts, top sources
or endpoints leaderboard, and a searchable virtualized event-table
drill-down.

Finance / admin sources (`bank-transactions`, `invoices`,
`quickbooks-report`) also load
[`prompts/_finance.md`](./prompts/_finance.md) — the shared contract
for the finance pack: headline cashflow / invoicing summary card,
category or account breakdown, recurring-items panel,
anomaly-and-duplicate callouts, and a searchable transactions /
invoices drill-down. Outputs are **analytical only** — never
accounting, tax, or legal advice — and the family prompt enforces
a footer to that effect.

Planning sources (`ics-calendar`, `issue-tracker`, `trello-board`)
also load
[`prompts/_planning.md`](./prompts/_planning.md) — the shared
contract for the planning pack: time-allocation map, owner / status
filters, stale-and-bottleneck callouts, roadmap / calendar / story-
map view, and a searchable item drill-down. Outputs are read-only
audits, not editing tools.

Knowledge-base sources (`notion-export`, `obsidian-vault`,
`markdown-folder`) also load
[`prompts/_knowledge_base.md`](./prompts/_knowledge_base.md) — the
shared contract for the knowledge-base pack: concept map / backlink
graph, theme clusters, TODO + stale + orphan callouts, searchable
knowledge atlas drill-down, and a hub leaderboard. The CLI accepts
a directory as input (`html-anything ~/Vault`) and walks it
recursively; in skill mode, point Claude Code at the folder and it
reads the markdown files via the standard file tools.

Geo / travel sources (`gpx-route`, `kml-route`, `travel-itinerary`,
`location-history`) also load
[`prompts/_geo.md`](./prompts/_geo.md) — the shared contract for
the geo pack: stats card, inline-SVG route or footprint trace,
splits / timeline / day-by-day, waypoints / places list, and a
searchable item drill-down. **Hard rule**: outputs are **offline-
only** — never embed Leaflet, Mapbox, Google Maps, OpenStreetMap
tiles, or any other tile provider. Render geometry as inline SVG
using a cosine-corrected equirectangular projection over a faint
graticule; the parser already pre-projects polylines into a 1000-
wide viewBox.

Research / reading-list sources (`bookmarks-html`, `bibliography`,
`url-list`, `reading-list`) also load
[`prompts/_research.md`](./prompts/_research.md) — the shared
contract for the research pack: topic clusters, domain (or venue +
author) leaderboard, duplicate / stale / dead-link callouts,
reading-queue prioritization (or year histogram for bibliographies),
and a searchable card drill-down. **Hard rule**: outputs are
**offline-only** — the page never fetches any of the saved URLs at
render or click time (no favicon services, no link previews, no
OpenGraph unfurls, no dead-link verification calls). Open-original
links are plain `<a href target="_blank" rel="noopener noreferrer">`.
Duplicate, stale, and dead-link flags are heuristic-only hypotheses,
not verdicts.

Sensitive-record sources (`medical-visit`, `lab-results`,
`legal-chronology`) also load
[`prompts/_sensitive.md`](./prompts/_sensitive.md) — the shared
contract for the sensitive-record pack: timeline of events, parties
+ roles, documents (with "missing" badge for items the record
references but does not include), missing information & "ask
your clinician / attorney / case manager" question list, and a
searchable record drill-down. Subtype-specific layers add
out-of-reference callouts + trend sparklines (lab-results),
encounter cards + medications (medical-visit), and case header +
deadline map + filings list (legal-chronology). **Hard rule**:
outputs are organizational summaries — never medical, legal,
immigration, or insurance advice. The page never diagnoses,
prognoses, prescribes, recommends a treatment, computes a statute
of limitations, opines on a motion, or tells the user what to file
/ take / pay. Out-of-range lab rows are flagged with the canonical
phrase *"outside the reference range printed on this row"* —
never *"abnormal"*. Deadlines are *"dates listed on this
document"*. Examples shipped in this repo under
`examples/medical-visit/`, `examples/lab-results/`, and
`examples/legal-chronology/` are **fully synthetic**; do not commit
real records.

**Adding a new source** = drop a new `<source>.md` in `prompts/`,
following the same shape as existing ones. No code changes, no
registration step. The skill auto-finds it.

## Hard rules

- **Single file out.** No multi-file SPAs. Email-attachable.
- **Self-contained.** Must work offline by double-clicking.
- **Don't render data through the LLM.** You see the sample only. The
  full data is inlined into the HTML and rendered client-side by JS you
  write. This way the same skill handles a 50-row CSV and a 500K-row
  CSV the same way.
- **Don't write a generic template.** Read the sample. Look at the
  shape. Pick the layout that fits *this* content. A different sample of
  the same source should produce a different design.
- **Geo outputs are tile-free.** GPX / KML / itinerary / location-
  history pages render geometry as **inline SVG** only. Do not embed
  Leaflet, Mapbox, Google Maps, OpenStreetMap tiles, or any other
  basemap provider. The parser pre-projects coordinates into a
  cosine-corrected viewBox so polylines + place dots line up; add a
  faint graticule rather than a tile background.
- **Research outputs are fetch-free.** Bookmarks / bibliography /
  URL-list / reading-list pages render entirely from the file's
  metadata. Never fetch the saved URLs at render or click time — no
  favicon services, no OpenGraph unfurls, no link previews, no
  dead-link verification calls. Open-original links are plain
  `<a href target="_blank" rel="noopener noreferrer">`. Duplicate,
  stale, and dead-link flags are heuristic-only hypotheses, not
  verdicts.
