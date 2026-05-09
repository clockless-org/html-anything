# html-anything

[![skills.sh](https://skills.sh/b/clockless-org/html-anything)](https://skills.sh/clockless-org/html-anything)

An [Agent Skill](https://agentskills.io) that turns files, folders, and URLs into one self-contained interactive HTML page. It is not a format converter: the agent samples the source, finds the interesting structure, designs the page, and inlines the full data so the output works offline.

Good inputs:

```text
WhatsApp export       -> relationship timeline, emoji map, searchable messages
Google Maps stars     -> personal atlas with place clusters and notes
Spotify history       -> year-by-year listening story
50K-row CSV           -> charts, outlier cards, virtualized drill-down table
PDF / DOCX / Markdown -> TL;DR, claim cards, decisions, action items
CI log / stack trace  -> failure summary, hypotheses, copyable ticket notes
Obsidian vault        -> concept map, hubs, stale notes, TODOs
```

## Preview

[Open the live preview page](https://clockless-org.github.io/html-anything/examples/) or browse the checked-in examples under [`examples/`](./examples).

[![html-anything preview screenshot](./docs/preview.png)](https://clockless-org.github.io/html-anything/examples/)

## Install the Skill

Use one of these.

### Codex

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
git clone https://github.com/clockless-org/html-anything "${CODEX_HOME:-$HOME/.codex}/skills/html-anything"
```

Restart Codex so it loads the new skill.

### Claude Code

```bash
mkdir -p ~/.claude/skills
git clone https://github.com/clockless-org/html-anything ~/.claude/skills/html-anything
```

Restart Claude Code so it loads `SKILL.md`.

### Agent Skills CLI

```bash
npx skills add clockless-org/html-anything
```

To update a manual install later:

```bash
git -C "${CODEX_HOME:-$HOME/.codex}/skills/html-anything" pull
```

## Use It

Ask your agent in plain language:

```text
Use html-anything to convert ~/Downloads/_chat.txt into an interactive HTML page.
```

```text
Use html-anything on my Spotify history. Walk me through the export first.
```

```text
Make a one-page HTML dashboard from ./data/customers.csv.
```

```text
Turn this repo into a browsable architecture explainer:
https://github.com/clockless-org/html-anything
```

If you name a source but do not have the file yet, the skill starts with export instructions. For example, "my WhatsApp chat", "my Spotify history", "my Google Maps stars", and "my Apple Health export" all trigger a short export walkthrough before conversion.

By default the output is written next to the input as `<input-name>.html`, unless you ask for a different path. The output is a single file: inline CSS, inline JS, inline data, works by double-clicking, and can be emailed or hosted as static HTML.

## Standalone CLI

The CLI uses the same prompt pack as the skill. It accepts local files and directories; URL handling is better in skill mode because the agent can fetch and inspect the page first.

```bash
git clone https://github.com/clockless-org/html-anything
cd html-anything
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # or OPENAI_API_KEY=sk-...
npx tsx src/cli.ts examples/csv/input.csv --out /tmp/customers.html
```

Options:

```bash
npx tsx src/cli.ts <input> --out output.html --title "My Report" --model claude-sonnet-4-6
```

## Supported Sources

Skill mode supports every prompt in [`prompts/`](./prompts). The CLI supports local files and directories through the parsers in [`src/parse/`](./src/parse).

| Source | Inputs | Prompt |
|---|---|---|
| Generic table | `.csv`, `.tsv` | [`csv.md`](./prompts/csv.md) |
| JSON | `.json` | [`json.md`](./prompts/json.md) |
| JSONL / NDJSON events | `.jsonl`, `.ndjson`, line-delimited JSON in `.json`, `.log`, `.txt` | [`jsonl.md`](./prompts/jsonl.md) |
| Logs | `.log`, `.txt`; access logs, syslog, app logs, error logs | [`log.md`](./prompts/log.md) |
| Markdown document | `.md`, `.markdown`, `.mdown`, `.mkd` | [`markdown.md`](./prompts/markdown.md) |
| PDF | `.pdf` | [`pdf.md`](./prompts/pdf.md) |
| Word document | `.docx` | [`docx.md`](./prompts/docx.md) |
| Email archive | `.eml`, `.mbox`, Gmail Takeout mbox | [`email.md`](./prompts/email.md) |
| Meeting transcript | `.vtt`, `.srt`, timecoded Zoom / Teams / Meet `.txt` | [`transcript.md`](./prompts/transcript.md) |
| WhatsApp | `_chat.txt` export | [`whatsapp.md`](./prompts/whatsapp.md) |
| Slack | Channel JSON export, workspace zip `messages.json` | [`slack.md`](./prompts/slack.md) |
| Discord | DiscordChatExporter `.json` or `.csv` | [`discord.md`](./prompts/discord.md) |
| Telegram | Telegram Desktop `result.json` | [`telegram.md`](./prompts/telegram.md) |
| iMessage-style chat | CSV with date, sender/from/isFromMe, and message/body/text columns | [`imessage.md`](./prompts/imessage.md) |
| Generic multi-sender chat | Chat-shaped CSV from another platform | [`multi-sender-chat.md`](./prompts/multi-sender-chat.md) |
| Git diff | `.diff`, raw `git diff` output | [`git-diff.md`](./prompts/git-diff.md) |
| PR patch | `.patch`, `git format-patch`, GitHub PR patch | [`pr-review.md`](./prompts/pr-review.md) |
| CI / build / test log | GitHub Actions, GitLab CI, CircleCI, Buildkite, Jenkins, `npm test`, `pytest`, `go test` | [`ci-log.md`](./prompts/ci-log.md) |
| Stack trace | Python, Node / JS, Java, Go, Ruby, Rust, .NET | [`stack-trace.md`](./prompts/stack-trace.md) |
| Bank transactions | Bank or credit-card CSV exports | [`bank-transactions.md`](./prompts/bank-transactions.md) |
| Invoices / receipts | CSV with invoice number, customer, amount, status, due dates | [`invoices.md`](./prompts/invoices.md) |
| Accounting export | QuickBooks, Xero, Wave general-ledger or P&L exports | [`quickbooks.md`](./prompts/quickbooks.md) |
| Calendar | `.ics`, `.ical`; Google Calendar, Outlook, Apple Calendar, Fastmail | [`ics-calendar.md`](./prompts/ics-calendar.md) |
| Issue tracker | Linear, Jira, GitHub Issues, Asana, ClickUp, generic tracker CSV | [`issue-tracker.md`](./prompts/issue-tracker.md) |
| Trello | Trello board JSON export | [`trello-board.md`](./prompts/trello-board.md) |
| Obsidian vault | Directory of `.md` files with `[[wikilinks]]` | [`obsidian-vault.md`](./prompts/obsidian-vault.md) |
| Notion export | Notion "Markdown & CSV" workspace export directory | [`notion-export.md`](./prompts/notion-export.md) |
| Markdown folder | Hugo, Jekyll, MkDocs, Bear exports, generic notes folders | [`markdown-folder.md`](./prompts/markdown-folder.md) |
| GPX route | `.gpx` workouts and routes from Strava, Garmin, Komoot, Apple Health, Wahoo, Suunto | [`gpx.md`](./prompts/gpx.md) |
| KML route | `.kml` from Google Earth, Google My Maps, saved-place exports | [`kml.md`](./prompts/kml.md) |
| Travel itinerary | Multi-day itinerary CSV with date, location, type/title/time/notes/cost | [`travel-itinerary.md`](./prompts/travel-itinerary.md) |
| Location history | Google Takeout-style JSON or flat CSV with timestamp, latitude, longitude | [`location-history.md`](./prompts/location-history.md) |
| Browser bookmarks | Netscape bookmarks HTML from Chrome, Firefox, Safari, Edge, Pinboard, Raindrop | [`bookmarks.md`](./prompts/bookmarks.md) |
| Bibliography | BibTeX `.bib`, RIS `.ris` from Zotero, Mendeley, EndNote, Google Scholar, JabRef | [`bibliography.md`](./prompts/bibliography.md) |
| URL list | Plain `.txt` or Markdown with one URL per line | [`url-list.md`](./prompts/url-list.md) |
| Reading list | Pocket, Instapaper, Raindrop, Matter, Readwise Reader, Omnivore CSV / JSON | [`reading-list.md`](./prompts/reading-list.md) |
| Google Maps saved places | Google Takeout saved places / starred places export | [`google-maps-stars.md`](./prompts/google-maps-stars.md) |
| Spotify history | Spotify Privacy export or Extended Streaming History | [`spotify-history.md`](./prompts/spotify-history.md) |
| Twitch history | Twitch data request export, viewing history, chat history | [`twitch-history.md`](./prompts/twitch-history.md) |
| Apple Health | Apple Health `export.zip`, `export.xml`, workout routes | [`iphone-health.md`](./prompts/iphone-health.md) |
| GitHub repo URL | `github.com/owner/repo` URLs, best in skill mode | [`github-repo.md`](./prompts/github-repo.md) |
| Article URL | Blog posts, news pages, long-form webpages, best in skill mode | [`url-article.md`](./prompts/url-article.md) |
| Medical visit notes | `.md`, `.txt` summaries; organizational summary only | [`medical-visit.md`](./prompts/medical-visit.md) |
| Lab results | CSV with test/value/reference-range columns; organizational summary only | [`lab-results.md`](./prompts/lab-results.md) |
| Legal chronology | `.md`, `.txt` case chronology; organizational summary only | [`legal-chronology.md`](./prompts/legal-chronology.md) |
| Anything else | Plain text or unknown file shape | [`default.md`](./prompts/default.md) |

## Important Defaults

- Outputs are single-file HTML. No multi-file apps, no server required.
- Outputs are offline. Geo pages do not use map tiles; research pages do not fetch saved URLs or favicons.
- The generated HTML embeds the source data client-side. Treat the `.html` file as sensitive as the original export.
- Sensitive-record sources are for organization and review only. They do not provide medical, legal, tax, accounting, immigration, or insurance advice.
- The LLM only sees a representative sample. The full source data is injected afterward as JSON and rendered client-side.

## Add a Source

Most new sources only need a prompt:

1. Add `prompts/<source-name>.md`.
2. Describe export instructions, data shape, must-have views, and source-specific safety rules.
3. Add a small synthetic example under `examples/<source-name>/`.
4. Regenerate examples with `npm run examples` when practical.

Add a parser in [`src/parse/`](./src/parse) only when the CLI needs deterministic preprocessing, such as PDF text extraction, archive walking, binary formats, huge files, or source-specific sniffing. See [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md) for the parser contract.

## License

[Apache 2.0](./LICENSE)
