# html-anything

[![skills.sh](https://skills.sh/b/clockless-org/html-anything)](https://skills.sh/clockless-org/html-anything)

**Install once. Your agent answers as polished web pages whenever the content
is actually a page, not a chat message.**

`html-anything` is a Codex / Claude Code skill that turns the agent's rich
answers into self-contained HTML artifacts — analyses, reports, recaps,
dashboards, atlases, teaching sites, comparison studies, decision memos,
year-in-review pages. The skill picks the right design system from a
20-style catalog, builds a single-file `.html`, verifies it in a browser,
and hands it back. Short conversational answers stay short — you just stop
scrolling 4,000-word replies whenever the content was always going to be a
page.

It also works **on demand** for any file, folder, URL, or service export
(Amazon orders, Kindle highlights, Spotify history, WeChat / iMessage,
Google Photos Takeout, CSV / PDF / DOCX, logs, GPX, …) —
the skill figures out the source, chooses one of the 20 style systems, and
ships the HTML.

## Preview

→ **[Open the curated gallery](https://clockless-org.github.io/html-anything/examples/)** — 15 demos, organized by use case and style.

### Featured

#### [Interactive teaching site →](https://clockless-org.github.io/html-anything/examples/solar-system-studio/output.html)

[![Solar system teaching style screenshot](./docs/solar-system-studio-preview.png)](https://clockless-org.github.io/html-anything/examples/solar-system-studio/output.html)

A self-contained interactive lesson built from a single teaching brief — *"create an interactive teaching site about the solar system"*. Each planet has its own stage with orbit controls, comparison tools, and a try-it quiz. No tutoring software, no slides, no setup. Style: `teaching`.

#### [Couple chat relationship report →](https://clockless-org.github.io/html-anything/examples/wechat-couple/output.html)

[![Realistic couple chat report screenshot](./docs/relationship-preview.png)](https://clockless-org.github.io/html-anything/examples/wechat-couple/output.html)

A 1:1 chat export reduced to its **rhythm story** — who initiates, response times, peak-hour patterns, mood cadence — without ever exposing private text. Aggregate-first, anonymized evidence. Style: `relationship`.

#### [Saved places atlas →](https://clockless-org.github.io/html-anything/examples/google-maps-stars/output.html)

[![Saved places atlas screenshot](./docs/example-previews/google-maps-stars.jpg)](https://clockless-org.github.io/html-anything/examples/google-maps-stars/output.html)

Your Google Maps starred places on a personal world atlas. Hover for the note you wrote at the time, click to expand. Built from a Takeout CSV in seconds. Style: `map-atlas`.

### More demos

A small selection across the rest of the style catalog. Each links to the live page.

| Demo | One-line | Style |
|---|---|---|
| [Amazon order history →](https://clockless-org.github.io/html-anything/examples/amazon-orders/output.html) | 3 years of orders → personal commerce memory with cadence, returns, gifting. | `timeline-story` |
| [Kindle highlights →](https://clockless-org.github.io/html-anything/examples/kindle-highlights/output.html) | Highlights become a mycelium writing field with a living margin question. | `living-essay` |
| [AI tokens comic →](https://clockless-org.github.io/html-anything/examples/ai-tokens-comic/output.html) | A popular AI concept becomes a seven-page Doraemon-style knowledge comic with pocket gadgets. | `comic-book` |
| [Apple Health →](https://clockless-org.github.io/html-anything/examples/iphone-health/output.html) | Activity, sleep, and workouts become a personal rhythm story. | `timeline-story` |
| [Slack championship →](https://clockless-org.github.io/html-anything/examples/slack/output.html) | Team activity becomes ranked kinetic lanes with decisions, topics, and linked evidence. | `kinetic-scoreboard` |
| [PDF e-guide →](https://clockless-org.github.io/html-anything/examples/pdf/output.html) | A sector report becomes a two-page guide preview with TOC, lesson spread, and source drawer. | `digital-eguide` |
| [Brand positioning carousel →](https://clockless-org.github.io/html-anything/examples/editorial-carousel/output.html) | A strategy essay becomes a 5-spread magazine carousel with source evidence. | `editorial-carousel` |
| [Email support console →](https://clockless-org.github.io/html-anything/examples/email/output.html) | A mailbox archive becomes a soft SaaS console for thread health, open loops, and handoffs. | `soft-saas` |
| [Rideshare history →](https://clockless-org.github.io/html-anything/examples/rideshare-history/output.html) | Trips become commute lanes, airport runs, late-night returns, and route clusters. | `map-atlas` |
| [Long-form architectural essay →](https://clockless-org.github.io/html-anything/examples/markdown/output.html) | A narrative essay becomes a split-screen editorial object with chapter pagination. | `architectural-spread` |
| [CI terminal console →](https://clockless-org.github.io/html-anything/examples/ci-log/output.html) | A failed GitHub Actions run becomes a shell-native debugging console. | `terminal-cli` |
| [PR review →](https://clockless-org.github.io/html-anything/examples/pr-review/output.html) | A patch becomes a risk-annotated review brief with evidence. | `developer` |

→ **[See the curated gallery (15 demos) →](https://clockless-org.github.io/html-anything/examples/)**

## Install

### Recommended — Agent Skills CLI

One command, works across Claude Code, Codex, Cursor, Cline, Windsurf
and any other agent that follows the [open agent skills](https://skills.sh)
spec:

```bash
npx skills add clockless-org/html-anything
```

The CLI also pings the public skills directory, so installs feed the
[skills.sh leaderboard](https://skills.sh/clockless-org/html-anything).

### Manual install (Claude Code)

```bash
mkdir -p ~/.claude/skills
git clone https://github.com/clockless-org/html-anything ~/.claude/skills/html-anything
```

Restart Claude Code so it loads `SKILL.md`.

### Manual install (Codex)

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
git clone https://github.com/clockless-org/html-anything "${CODEX_HOME:-$HOME/.codex}/skills/html-anything"
```

Restart Codex so it loads the skill.

To update a manual install later:

```bash
git -C ~/.claude/skills/html-anything pull
```

### Publish To ClawHub

This repo includes `.clawhubignore` so ClawHub publishes only the skill bundle:
`SKILL.md` plus `prompts/`. It intentionally excludes examples, screenshots,
fixtures, generated outputs, source code, and the repo license file.

```bash
npm i -g clawhub
clawhub login
clawhub skill publish . \
  --owner YOUR_HANDLE_OR_ORG \
  --version 0.1.0 \
  --clawscan-note "Creates local HTML pages from user-provided prompts, files, folders, and URLs. Reads local files only when the user asks."
```

## Use

Ask in plain language:

```text
Use html-anything to create an interactive teaching site about the solar system.
```

```text
Explain the solar system as a beautiful interactive page.
```

```text
Use html-anything on my Amazon order history. Walk me through the export first.
```

```text
Use html-anything to turn ~/Downloads/_chat.txt into a relationship report.
```

```text
Use html-anything to make this CSV into a shareable dashboard.
```

```text
Use html-anything on this GitHub repo URL.
```

You do not always need to say "HTML". Requests like "make this easier to read",
"turn this into a visual report", "make a shareable explainer", "create a recap",
or "present this beautifully" should trigger the skill.

If you already have the file, folder, or URL, give it to the agent. If
you only know the source type, such as "Amazon orders", "Spotify history",
"1:1 chat export", or "Google Photos Takeout", the skill first explains how
to export the data, then converts it after you provide the export.

## Input And Output

| Input | What you give | What you get |
|---|---|---|
| Rich answer | A topic, analysis request, comparison, recap, brief, or teaching goal | A readable, styled HTML artifact instead of a long written answer |
| Idea | A short brief, e.g. "make a solar system teaching site" | A generated educational / interactive HTML page |
| File | CSV, JSON, Markdown, PDF, DOCX, chat export, log, transcript, statement | A live page designed for that file |
| Folder | Notes vault, Google Photos Takeout, Notion export, repo, exported archive | A browsable atlas / dashboard / audit page |
| URL | Article, GitHub repo, public webpage | A shareable HTML reading or exploration page |
| Export request | "My Amazon orders", "my Spotify history", "my relationship chat" | Export instructions first, then a live HTML page |

The output is a browser page, not a chat reply. Most outputs are a single
`output.html`. When the page needs generated images or other local
assets, the skill returns `output.html + assets/`. Ask for "single-file"
if you need everything in one HTML file.

## Automatic Styles

You do not need to choose a style. The default is `auto`.

Styles are design systems + layout systems, not CSS skins. The skill picks
the system from the content, then builds the page inside that system. A few
styles, such as `paper-trail`, are explicit overrides for a requested visual
system rather than default auto routes:

Style fidelity is part of the contract: when a style is based on a reference
HTML or screenshot, the generated page should reproduce the reference's first
viewport, component vocabulary, interaction model, motion grammar, and visual
absence rules. Source modules are translated into the style instead of forcing
every output into the same dashboard/report shape.

| Content | Style |
|---|---|
| Unknown or mixed inputs | `default` (Insight Brief) |
| Tutorials, lessons, explainers, "teach me" prompts | `teaching` (Lesson Lab) |
| App-like object/system/spec explorers, anatomy/architecture/product studios | `interactive-learning` (Learning Studio) |
| Comic book, manga, cartoon, "explain simply", PDF/document/article simplification requests | `comic-book` (Comic Book Explainer) |
| 1:1 chats and intimate message exports | `relationship` (Rhythm Report) |
| Reflective essays, Kindle highlights, idea notes, concept-heavy reading archives | `living-essay` (Mycelium Writing Environment) |
| Multi-participant activity streams, team chats, ranked contributors, owner/reps/players by workload | `kinetic-scoreboard` (Kinetic Championship) |
| Personal histories — chronological (orders, history, listening, health) **and** topical (Notion / Obsidian vaults) | `timeline-story` (Timeline Story) |
| Places, trips, routes, rideshare, geotagged photos | `map-atlas` (Map Atlas) |
| Tactile trip folders, hotel folios, receipts, tickets, reservation bundles | `paper-trail` (Paper Trail, explicit override) |
| Contacts, communities, social payments | `network-map` (Network Map) |
| Support mailboxes, email campaigns, onboarding, customer-success queues | `soft-saas` (Soft SaaS Console) |
| Finance, spreadsheets, logs, backlog, operational data | `dashboard` (Ops Console) |
| Essays, articles, reading lists, bookmarks, PDFs, DOCX, legal/medical/lab records | `document` (Document Review) |
| Visual long-form essays, object-focused articles, architectural split-screen editorial requests | `architectural-spread` (Architectural Editorial Spread) |
| E-guides, PDF guides, creator guides, playbooks, lead magnets | `digital-eguide` (Digital E-Guide Spread) |
| Brand strategy essays, founder letters, article takeaways, lightweight reports meant to be shared as a sequence | `editorial-carousel` (Editorial Carousel) |
| Explicit terminal, CLI, shell, mainframe, hacker-console requests | `terminal-cli` (Terminal CLI, explicit override) |
| Logs, diffs, stack traces, CI failures, repos | `developer` (Terminal Evidence Workbench) |

You can still steer it naturally: "make it more tutorial-like", "more
app-like", "less academic", "make it a carousel", "more dashboard-like",
or "more playful".

Reusable style prompts live in [`prompts/styles/`](./prompts/styles/).
The shared structural contract is
[`prompts/styles/_system.md`](./prompts/styles/_system.md). The internal
style catalog lives in [`prompts/styles/catalog.json`](./prompts/styles/catalog.json):
it records the five use cases plus each style's triggers, best sources,
example, preview, required primitives, and avoid rules so generation can stay
style-faithful without asking users to pick options. There is a fallback
`default` style plus 15
auto-selected styles (`teaching`,
`interactive-learning`, `comic-book`, `relationship`, `living-essay`, `dashboard`, `soft-saas`,
`kinetic-scoreboard`, `timeline-story`, `map-atlas`, `network-map`,
`document`, `architectural-spread`, `editorial-carousel`, and `developer`), plus explicit overrides
such as `paper-trail`, `digital-eguide`, `love-romance-3d`, and `terminal-cli`.

Example explicit style override:

```bash
npx tsx src/cli.ts examples/itinerary-trip/input.csv \
  --style paper-trail \
  --out /tmp/paper-trail-itinerary.html \
  --title "Tokyo + Kyoto - 8-day itinerary"

npx tsx src/cli.ts examples/pdf/input.pdf \
  --style digital-eguide \
  --out /tmp/battery-storage-guide.html \
  --title "Mid-Market Battery Storage Field Guide"
```
## Use Cases And Sources

Sources can be endless, but the skill routes them into five stable use cases.
Each use case can use one or more style systems.

| Use case | Example sources | Likely styles |
|---|---|---|
| Teaching Studios | A short teaching brief, article, lesson outline, concept note, URL, PDF/document simplification request | `teaching`, `interactive-learning`, `comic-book` |
| Files & Work Data | CSV / TSV, spreadsheet-style exports, JSON, JSONL, logs, email/support archives, bank transactions, invoices, QuickBooks, calendars, issue trackers, Markdown, PDF, DOCX, bookmarks, URL lists, bibliographies, research records, slide-style carousel outputs | `dashboard`, `soft-saas`, `document`, `architectural-spread`, `digital-eguide`, `editorial-carousel`, `paper-trail` |
| Conversation Analysis | WeChat, iMessage-style CSV, Slack, Discord, Telegram, email-style threads | `relationship`, `love-romance-3d`, `kinetic-scoreboard`, `network-map` |
| Personal Data & Places | Amazon orders, Apple Health, browser history, YouTube, Spotify, Twitch, Kindle highlights, Venmo / PayPal, AI chat exports, notes vaults, Google Maps saved places, rideshare history, GPX, KML, itinerary CSV, location history | `timeline-story`, `living-essay`, `network-map`, `map-atlas`, `paper-trail` |
| Developer Evidence | Git diff, PR patch, CI log, stack trace, GitHub repo URL | `developer`, `terminal-cli` |

Use case is user-facing; style is internal. A user can simply say "make this
CSV prettier" or "turn this into a teaching site" and the skill picks the
right system automatically.

The detailed source-specific instructions live in [`prompts/sources/`](./prompts/sources/).

## Defaults

- The skill chooses the style automatically.
- The skill samples large sources, but renders the full data where practical.
- The skill checks the page in a browser before handing it back.
- Generated pages are local-first and static. They can be opened directly or hosted anywhere static HTML works.
- Generated HTML can embed private source data client-side. Treat the output as sensitive as the original export.
- Sensitive-record outputs are for organization and review only, not medical, legal, tax, accounting, immigration, insurance, or investment advice.

## Developer Note

This repo also contains a standalone parser / CLI framework used by some
examples, but the primary product surface is the agent skill. Users should
not need to understand the internal implementation to use html-anything.

```bash
git clone https://github.com/clockless-org/html-anything
cd html-anything
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # or OPENAI_API_KEY=sk-...
npx tsx src/cli.ts examples/csv/input.csv --out /tmp/customers.html
```

## License

[Apache 2.0](./LICENSE)
