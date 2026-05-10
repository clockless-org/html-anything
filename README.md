# html-anything

[![skills.sh](https://skills.sh/b/clockless-org/html-anything)](https://skills.sh/clockless-org/html-anything)

Turn files, folders, and URLs into one self-contained interactive HTML report.

It is not a format converter. The agent samples the source, finds the interesting structure, designs the right charts and views, then inlines the full data into a single live `.html` file you can open, email, or host as static HTML.

## Preview

- [Open all live examples](https://clockless-org.github.io/html-anything/examples/)
- [Highlighted example: realistic couple chat report](https://clockless-org.github.io/html-anything/examples/wechat-couple/output.html)

[![Realistic couple chat report screenshot](./docs/relationship-preview.png)](https://clockless-org.github.io/html-anything/examples/wechat-couple/output.html)

The highlighted example uses a synthetic WeChat-style couple chat: 52K messages over two years, with quiet days, work delays, short replies, small arguments, repairs, images, voice notes, transfers, and anonymized evidence snippets.

## Install

### Codex

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
git clone https://github.com/clockless-org/html-anything "${CODEX_HOME:-$HOME/.codex}/skills/html-anything"
```

Restart Codex so it loads the skill.

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

## Use

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

If you name a source but do not have the file yet, the skill starts with export instructions first. For example: "my WeChat chat", "my WhatsApp chat", "my Spotify history", "my Google Maps stars", or "my Apple Health export".

The result is a live `.html` file, not markdown: inline CSS, inline JS, inline data, works offline by double-clicking.

## Supported Sources

| | Source | Inputs | Live HTML example |
|---|---|---|---|
| 💬 | WeChat / 微信 relationship chat | WeChatMsg / 留痕 exports: `.html`, `.csv`, `.txt`, `.json`, `.docx` | [Couple chat report](https://clockless-org.github.io/html-anything/examples/wechat-couple/output.html) |
| 💬 | WhatsApp relationship chat | `_chat.txt` export | [WhatsApp report](https://clockless-org.github.io/html-anything/examples/whatsapp/output.html) |
| 💬 | Slack | Channel JSON export, workspace zip `messages.json` | [Slack report](https://clockless-org.github.io/html-anything/examples/slack/output.html) |
| 💬 | Discord | DiscordChatExporter `.json` or `.csv` | [Discord report](https://clockless-org.github.io/html-anything/examples/discord/output.html) |
| 💬 | Telegram | Telegram Desktop `result.json` | [Telegram report](https://clockless-org.github.io/html-anything/examples/telegram/output.html) |
| 💬 | iMessage-style / generic chat | CSV with date, sender/from/isFromMe, message/body/text columns | Live HTML generated from your export |
| 📊 | CSV / TSV tables | `.csv`, `.tsv` | [CSV dashboard](https://clockless-org.github.io/html-anything/examples/csv/output.html) |
| 📊 | JSON | `.json` | Live HTML generated from your file |
| 📊 | JSONL / NDJSON events | `.jsonl`, `.ndjson`, line-delimited JSON in `.json`, `.log`, `.txt` | [Event stream report](https://clockless-org.github.io/html-anything/examples/jsonl/output.html) |
| 📟 | Logs | `.log`, `.txt`; access logs, syslog, app logs, error logs | [Access log](https://clockless-org.github.io/html-anything/examples/log-access/output.html), [error log](https://clockless-org.github.io/html-anything/examples/log-error/output.html) |
| 📄 | Markdown | `.md`, `.markdown`, `.mdown`, `.mkd` | [Reading view](https://clockless-org.github.io/html-anything/examples/markdown/output.html) |
| 📄 | PDF | `.pdf` | [PDF report](https://clockless-org.github.io/html-anything/examples/pdf/output.html) |
| 📄 | Word document | `.docx` | [DOCX report](https://clockless-org.github.io/html-anything/examples/docx/output.html) |
| 📬 | Email archive | `.eml`, `.mbox`, Gmail Takeout mbox | [Mailbox report](https://clockless-org.github.io/html-anything/examples/email/output.html) |
| 🎙️ | Meeting transcript | `.vtt`, `.srt`, timecoded Zoom / Teams / Meet `.txt` | [Sales call](https://clockless-org.github.io/html-anything/examples/transcript-sales-call/output.html), [product review](https://clockless-org.github.io/html-anything/examples/transcript-product-meeting/output.html) |
| 🧑‍💻 | Git diff | `.diff`, raw `git diff` output | [Diff review](https://clockless-org.github.io/html-anything/examples/git-diff/output.html) |
| 🧑‍💻 | PR patch | `.patch`, `git format-patch`, GitHub PR patch | [PR review](https://clockless-org.github.io/html-anything/examples/pr-review/output.html) |
| 🧑‍💻 | CI / build / test log | GitHub Actions, GitLab CI, CircleCI, Buildkite, Jenkins, `npm test`, `pytest`, `go test` | [CI failure report](https://clockless-org.github.io/html-anything/examples/ci-log/output.html) |
| 🧑‍💻 | Stack trace | Python, Node / JS, Java, Go, Ruby, Rust, .NET | [Stack trace report](https://clockless-org.github.io/html-anything/examples/stack-trace/output.html) |
| 💵 | Bank transactions | Bank or credit-card CSV exports | Live HTML generated from your statement |
| 💵 | Invoices / receipts | CSV with invoice number, customer, amount, status, due dates | Live HTML generated from your invoice export |
| 💵 | Accounting export | QuickBooks, Xero, Wave general-ledger or P&L exports | Live HTML generated from your export |
| 🤝 | Venmo / PayPal social payments | Venmo statement CSV, PayPal Activity CSV — counterparty leaderboard, story clusters, reimbursement loops | [Venmo activity](https://clockless-org.github.io/html-anything/examples/venmo-paypal-payments/output.html) |
| 📅 | Calendar | `.ics`, `.ical`; Google Calendar, Outlook, Apple Calendar, Fastmail | Live HTML generated from your calendar |
| ✅ | Issue tracker / Trello | Linear, Jira, GitHub Issues, Asana, ClickUp, Trello JSON | Live HTML generated from your board |
| 🧠 | Obsidian / Notion / Markdown folder | Directories of markdown, Notion "Markdown & CSV" export | Live HTML generated from your workspace |
| 🗺️ | GPX / KML routes | `.gpx`, `.kml` | Live HTML generated from your route |
| 🗺️ | Travel itinerary / location history | Itinerary CSV, Google Takeout-style location JSON/CSV | Live HTML generated from your trip |
| 🔖 | Bookmarks / URL list / reading list | Bookmarks HTML, URL text files, Pocket / Instapaper / Raindrop / Matter / Omnivore exports | [Market research bookmarks](https://clockless-org.github.io/html-anything/examples/bookmarks-market-research/output.html) |
| 📚 | Bibliography | BibTeX `.bib`, RIS `.ris` | [Academic reading list](https://clockless-org.github.io/html-anything/examples/reading-list-academic/output.html) |
| 🌍 | Google Maps saved places | Google Takeout saved places / starred places export | [Saved places atlas](https://clockless-org.github.io/html-anything/examples/google-maps-stars/output.html) |
| 🎧 | Spotify history | Spotify Privacy export or Extended Streaming History | [Spotify history](https://clockless-org.github.io/html-anything/examples/spotify-history/output.html) |
| 🟣 | Twitch history | Twitch data request export, viewing history, chat history | [Twitch history](https://clockless-org.github.io/html-anything/examples/twitch-history/output.html) |
| ❤️ | Apple Health | Apple Health `export.zip`, `export.xml`, workout routes | [Health story](https://clockless-org.github.io/html-anything/examples/iphone-health/output.html) |
| 📦 | Amazon order history | Amazon "Request Your Information" / legacy Order Reports CSV (`Retail.OrderHistory.*.csv`, `Items.csv`) | [Amazon orders](https://clockless-org.github.io/html-anything/examples/amazon-orders/output.html) |
| ▶️ | YouTube watch history | Google Takeout `Takeout/YouTube and YouTube Music/history/watch-history.json` | [YouTube watch history](https://clockless-org.github.io/html-anything/examples/youtube-watch-history/output.html) |
| 📖 | Kindle highlights | `My Clippings.txt` from a Kindle device, plus per-book Kindle Notebook HTML emails | [Kindle highlights](https://clockless-org.github.io/html-anything/examples/kindle-highlights/output.html) |
| 📷 | Google Photos library (Takeout) | Google Takeout `Takeout/Google Photos/` folder of `*.jpg.json` / `*.heic.json` / `*.mp4.json` sidecars + per-album `metadata.json` | [Google Photos library](https://clockless-org.github.io/html-anything/examples/google-photos-takeout/output.html) |
| 🌐 | GitHub repo URL | `github.com/owner/repo` URLs, best in skill mode | Live HTML generated from the repo |
| 🌐 | Article URL | Blog posts, news pages, long-form webpages, best in skill mode | Live HTML generated from the page |
| 🩺 | Sensitive records | Medical visit notes, lab-results CSVs, legal chronologies | [Medical visit](https://clockless-org.github.io/html-anything/examples/medical-visit/output.html), [lab results](https://clockless-org.github.io/html-anything/examples/lab-results/output.html), [legal chronology](https://clockless-org.github.io/html-anything/examples/legal-chronology/output.html) |
| 🤖 | AI chat exports | ChatGPT `conversations.json`, Claude chat export, generic `{conversations: [...]}` JSON, plain markdown `User:` / `Assistant:` logs | [ChatGPT export](https://clockless-org.github.io/html-anything/examples/chatgpt-export/output.html), [saved AI chat log](https://clockless-org.github.io/html-anything/examples/ai-chat-log/output.html) — heuristic, offline-only, no calls back to OpenAI / Anthropic |
| ✨ | Anything else | Plain text or unknown file shape | Live HTML generated from the source |

## Standalone CLI

The CLI uses the same source pack as the skill. It accepts local files and directories; URL handling is better in skill mode because the agent can fetch and inspect the page first.

```bash
git clone https://github.com/clockless-org/html-anything
cd html-anything
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # or OPENAI_API_KEY=sk-...
npx tsx src/cli.ts examples/csv/input.csv --out /tmp/customers.html
```

## Defaults

- Outputs are single-file live HTML. No server required.
- Outputs work offline. Geo pages do not use map tiles.
- The generated HTML embeds source data client-side. Treat it as sensitive as the original export.
- Sensitive-record sources are for organization and review only, not medical, legal, tax, accounting, immigration, or insurance advice.
- The agent sees a representative sample; the full source data is injected afterward and rendered client-side.

## License

[Apache 2.0](./LICENSE)
