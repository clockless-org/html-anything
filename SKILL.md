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

- **2-person WhatsApp chat** → relationship card (cadence, response
  time, who initiates), conversation arc timeline highlighting the 5–10
  meaningful turns the LLM picked, topic clusters, emoji frequency
  graph, then the messages themselves as a collapsible thread.
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

1. **Identify the source.**
   - File: use extension + content sniff (`Read` the file).
   - URL: match against patterns (github.com/owner/repo, medium.com/*,
     substack.com/*, etc.) (`WebFetch` the URL).

2. **Read [`prompts/_design.md`](./prompts/_design.md) first.** It has
   the Clockless design tokens (colors, fonts, spacing, radius, shadow
   scales, the Google Fonts import line) every output must use. Apply
   these regardless of source type. They are non-negotiable so all
   html-anything outputs feel like one product line.

3. **Look up the matching source prompt** in `prompts/<source-type>.md`.
   The source prompt covers what's specific to this content type
   (analytical structure, data shape, choice of visualizations).
   If no specific prompt fits, use `prompts/default.md`.

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
   - URL article: first 2-3K chars of the rendered text + meta.
   - Repo: README + tree + 3 key files.

5. **Design the page**, applying the design tokens from `_design.md`
   plus the source-specific guidance. Universal requirements:
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
| [`prompts/whatsapp.md`](./prompts/whatsapp.md) | WhatsApp `_chat.txt` export — 1:1 / small-group relationship framing |
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
| [`prompts/github-repo.md`](./prompts/github-repo.md) | github.com/owner/repo URLs |
| [`prompts/url-article.md`](./prompts/url-article.md) | Blog posts, news articles, long-form web pages |
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
drill-down. WhatsApp keeps its bespoke 1:1-relationship framing and is
**not** part of this family.

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
