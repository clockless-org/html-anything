# browser-history — your Chrome / Edge / Brave / Safari / Firefox history

A normal user's browser history — every page they've opened in
Chrome, Edge, Brave, Safari, or Firefox. Output is a private
**digital day / attention atlas**: which sites they actually keep
returning to, what research sessions look like, where work spills
into evenings, what they shop for over and over, and which old tabs
are stale noise.

The interesting story is **the human shape of months of browsing**,
not "your CSV in HTML form". A raw history dump is unreadable; a
good page makes the user say *"oh — half my evenings are GitHub +
Stack Overflow, but my late-night browsing is Reddit and Hacker News.
I keep visiting that same Notion doc — I should bookmark it."*

This prompt is part of the experiential pack (Spotify, YouTube,
Amazon, Kindle, etc.). Frame it as a personal attention atlas, not a
productivity scorecard. No shame voice. No "screen-time tax". This
is **complementary to bookmarks** — bookmarks are intentional saves;
history is behavioral trace.

## Export instructions (surface to the user before converting)

Browsers do not ship a "download my history" button by default.
Most users come in saying *"my Chrome history"* or *"my browser
history"* without a file. Walk them through one of these reliable
paths and stop until they have a CSV/JSON in hand. Order matters:
recommend the easiest one first.

### Chromium-family (Chrome, Edge, Brave, Vivaldi, Arc) — easiest

Chromium stores history in a SQLite database called `History` that
locks while the browser is open. The friendliest export path is the
free **History Trends Unlimited** Chrome extension (or the
**Browser History** extension in Edge), which adds an in-browser
"Export to CSV" button:

1. Install **History Trends Unlimited** from the Chrome / Edge web
   store (or any equivalent "browser history exporter" extension —
   search "history export csv").
2. Open the extension's options page → **Export** tab.
3. Pick a date range (last 30 days is enough to see the shape; last
   12 months is the canonical experience).
4. Click **Export to CSV** (or **JSON** if offered).
5. Save the file — typical names: `history_export.csv`,
   `chrome_history.csv`, `BrowserHistory.csv`.
6. Drop the file into Claude Code:
   `convert this Chrome history to HTML: ~/Downloads/history_export.csv`.

### Firefox

Firefox keeps history in `places.sqlite`. Export via the free
**Export History** add-on (or any equivalent):

1. Install an "Export History" add-on from
   [addons.mozilla.org](https://addons.mozilla.org).
2. Open the add-on, choose **CSV** (or JSON), pick a date range,
   save the file (commonly `firefox-history.csv`).
3. Drop the file into Claude Code:
   `convert this Firefox history to HTML: ~/Downloads/firefox-history.csv`.

If they refuse to install an add-on, Firefox's built-in
**Library → History → Export Bookmarks** does *not* include history.
The DB-copy path below is the only fallback.

### Safari

Safari does not ship a CSV export and locks `History.db` while
running:

1. Open **Safari → File → Export → Browsing History…** (added in
   Safari 17 / macOS Sonoma).
2. Save the resulting `.json` file.
3. If you're on an older Safari, the cleanest path is to copy
   `~/Library/Safari/History.db` while Safari is **fully closed** and
   then convert to CSV with any SQLite browser — but recommend
   upgrading first.
4. Drop the file into Claude Code:
   `convert this Safari history to HTML: ~/Downloads/History.json`.

### Direct Chromium `History` SQLite copy (advanced fallback)

If the user insists on the raw DB, instruct them clearly:

1. **Quit Chrome / Edge / Brave fully** (not just close the window —
   the DB stays locked otherwise). Verify with `pgrep chrome`.
2. Copy the file out of the profile directory (do not edit in place):
   - macOS: `~/Library/Application Support/Google/Chrome/Default/History`
   - Windows: `%LOCALAPPDATA%\Google\Chrome\User Data\Default\History`
   - Linux: `~/.config/google-chrome/Default/History`
3. Open the copy in a SQLite browser (e.g.
   [DB Browser for SQLite](https://sqlitebrowser.org)) and run:
   ```sql
   SELECT urls.url, urls.title, urls.visit_count, urls.typed_count,
          datetime(visits.visit_time / 1000000 - 11644473600, 'unixepoch') AS visit_time,
          visits.transition
     FROM visits JOIN urls ON visits.url = urls.id
   ORDER BY visits.visit_time DESC;
   ```
4. **Export the result as CSV**, then drop into Claude Code as
   above. We do **not** parse the raw `History` SQLite blob in this
   skill — converting to CSV first is the reliable path.

If the user only has the binary `History` file, do not pretend to
parse it. Give them the SQLite extraction recipe above and stop
until they hand over a CSV.

## Source shapes the parser handles

The parser accepts the most common normal-user shapes:

- **CSV** with a header row containing some flavor of:
  `url`, `title`, `visit time` (or `visit_time` / `last_visit_time` /
  `time` / `timestamp` / `date`), and optional `visit count` /
  `typed count` / `transition` / `transition_type` / `host` /
  `domain`. Headers are normalized case-insensitively.
- **JSON array** of objects with the same fields (Safari export,
  History Trends Unlimited JSON dump).
- **JSON** with a top-level `history` or `entries` array.

Detection is filename-aware (`history`, `browser`, `chrome`, `edge`,
`safari`, `firefox`) **plus** content sniffing (header has `url` and
some flavor of `visit time`).

If the file is the literal Chromium `History` binary (SQLite blob,
detected by the `SQLite format 3` magic header), refuse politely and
print the SQLite extraction recipe — do not silently produce a bad
page.

## What to surface (the experience)

This is meant to feel like **looking back at months of attention as
a story**. Cards on a wall, not a stats dashboard. Privacy-first by
default — full URLs only appear in the drill-down, never in the hero
or summary cards.

### Hero strip (required)

One row, big, brand-anchored:

- **Total visits** + **unique domains** — *"4,210 visits across 318
  domains"*.
- **Date range** + duration — *"6 months · 144 active days"*.
- **Top domain** + share — *"github.com · 11% of visits"*.
- **Late-night share** — *"9% of visits between midnight and 4am"*.

One short editorial sentence the LLM extracts: *"GitHub and Stack
Overflow run the workday; late-night is mostly Hacker News and
Reddit; the busiest day was April 14, 2025 — 73 visits, mostly the
same Notion doc."*

Plus a **privacy reminder chip**: *"Your history stays on your
machine — this page never leaves your browser."*

### Activity timeline (required)

Two stacked views, user-toggleable:

- **Monthly bar chart** — visits per month, busiest month flagged.
- **Weekly bar chart** — finer grain for spotting bursts and
  vacations.

Below the bars, a **day-of-week × hour-of-day heatmap** so the user
sees *when* they reach for the browser. **Add a weekend / weekday
toggle** that recolors the heatmap so work-vs-personal rhythm is
visible. Use inline SVG (no Chart.js, no CDNs).

### Domain leaderboard (required)

A horizontal-bar panel labeled **"Domains"** with the top 12
domains by visit count, descending. Each row: domain (eTLD+1, e.g.
`github.com`, not `api.github.com`), visit count, share %, sparkline
of monthly visits, click-to-filter. The leaderboard is the spine of
the page.

eTLD+1 collapsing is required so all `*.github.com` rolls into
`github.com`. Show the host count as a sub-label when collapsed
(*"github.com — 412 visits across 6 hosts"*).

### Topic clusters (required, heuristic-flagged)

A panel labeled **"Topics"** with topic buckets derived from
domain + title keyword heuristics:

- `work-tools` (GitHub, GitLab, Linear, Notion, Slack, Figma,
  Atlassian, Vercel, AWS / GCP / Azure consoles, Stripe dashboard).
- `coding-help` (Stack Overflow, MDN, dev.to, official language /
  framework docs, npm, PyPI, crates.io, package readmes).
- `news` (NYT, BBC, Reuters, Guardian, AP, FT, WSJ, local news).
- `social` (Reddit, X / Twitter, Bluesky, Mastodon, Threads,
  LinkedIn, Facebook, Instagram, TikTok web).
- `media` (YouTube, Spotify web, Twitch, Netflix, Disney+, Hulu,
  HBO, Apple TV web, podcast directories).
- `shopping` (Amazon, eBay, Etsy, Walmart, Target, Best Buy,
  Costco, Shopify storefronts).
- `finance-admin` (banking portals, brokerages, Mint / Personal
  Capital, IRS / govt portals, paycheck / 401k / HSA portals).
- `travel` (Google Maps, Apple Maps, airline / hotel sites,
  booking.com, kayak, Airbnb).
- `health` (MyChart, patient portals, MDPI / PubMed, WebMD,
  Healthline — never imply a diagnosis).
- `docs-knowledge` (Wikipedia, Notion, Confluence, ReadTheDocs,
  Wayback Machine).
- `search` (Google, Bing, DuckDuckGo, Kagi, Brave Search — see
  noise rules below).
- `other`.

Each topic shows count + share + click-to-filter chip. Above the
panel, a **"Heuristic"** chip with a tooltip: *topics come from
domain + title keyword matches, not topic modeling, not LLM-derived;
your file is read locally.*

### Research sessions (required)

The signature browser question: *"what does a research session
actually look like?"*

A panel labeled **"Sessions"** showing clusters where ≥4 visits
occurred within ~30-minute gaps of each other. For each:

- **Start time** + duration ("Tue Apr 14 · 1hr 47min").
- **Visit count** in that cluster.
- **Top domain** of the session (the one that dominated).
- **Topic label** of that top domain.
- **Sample titles** — first ~5 page titles in the cluster (truncated,
  no full URLs in the card).
- **"Looks like research"** badge if the session crosses ≥3
  different domains and ≥1 search-engine visit (Google / DDG / Bing
  / Kagi).
- Click → drill-down filtered to those exact rows.

If no cluster qualifies, replace with **"Quiet history"** — *"No
multi-page sessions found; your browsing is in short bursts."*

### Attention audit (required)

A short row of insight cards:

- **Late-night share** — count + share + a sample of the latest
  late-night visits (titles only, no URLs in the card). *"9% of
  visits between midnight and 4am — mostly Reddit and YouTube."*
- **Work vs personal split** — pre-bucketed shares of
  `work-tools + coding-help + docs-knowledge` vs everything else.
  Frame as *"how the time split"*, not *"are you wasting time"*.
- **Rabbit holes** — the longest 2-3 sessions. Title fragment +
  domain + duration.
- **Returners** — the top URLs the user visited 5+ times each.
  Title, domain, count, first → last seen. The signature *"this is a
  bookmark in disguise"* signal.
- **Repeated searches** — search queries (extracted from
  `q=`/`query=`/`p=`) that show up 3+ times. Mask the query if it
  contains digits-only or `@` (likely an order number / email).

Every callout is **observational, not prescriptive**. Never say
*"you should browse less"*; say *"this is what your attention looked
like"*.

### Drill-down (required)

A collapsible **"Browse all N visits"** section with the full file
inlined. Inside:

- Full-text search across title / domain / topic / URL.
- Filter chips: top domains, topics, year, late-night-only,
  typed-only, transition kind.
- Columns: **Time**, **Title** (truncate; full title on hover),
  **Domain**, **Topic**, **Visits** (count from `visit_count`).
- Click a row → expand to show the original record (raw URL — only
  here, with a "copy URL" button — title, domain, ISO timestamp,
  visit count, typed count, transition type).
- Virtualized or paginated — history exports can hit thousands of
  rows.

## Privacy / synthetic-data constraint (HARD)

Browser history is one of the most sensitive normal-user files
shipped to this skill. Every URL leaks intent and identity. Treat
the output as sensitive as the original export.

- **Never use real browsing history.** The example shipped with
  this repo is **fully synthetic** — fake domains, fake titles, fake
  search queries, fake timestamps. Do not commit real exports.
- **No URLs in summary cards.** The hero, KPI strip, leaderboard,
  topics, sessions, and audit cards display **titles + domains
  only**. Full URLs appear only in the drill-down detail panel that
  the user has to click to expand.
- **Mask query strings by default.** In the drill-down detail
  panel, show the URL **path + host**, with the query string
  collapsed behind a *"show query"* control. If a query looks like
  an order number, email, ID, or token (digits-only chunks ≥5
  characters, `@`, `password=`, `token=`, `key=`, `auth=`,
  `session=`), keep it masked even when expanded.
- **No favicon fetches, no thumbnails, no embeds.** The page must
  not request `*.gstatic.com`, `t0.gstatic.com`, `s2/favicons`, or
  any third-party host. Identify domains with text only.
- **No external font calls.** Use the system sans-serif stack so
  the page works fully offline.
- **No iframe embeds and no auto-following of links.** *"Open"*
  links go to a plain `<a target="_blank" rel="noopener
  noreferrer">` so the user decides whether to click.
- **Footer must include a privacy line** explaining the file is
  embedded client-side and the page never made a network call.

## Tone

Personal, observational, dignified. Like a friend going through
your browser history with you. *"April 2025 was your biggest month
— you opened your browser on 27 of 30 days. github.com leads at
14%, but your weekends are mostly Reddit and YouTube."* Not
*"Screen time alert!"*. Specific to the file.

Use the Clockless tokens (Space Grotesk + Plus Jakarta Sans
fallback to system sans, brand orange `--primary`, surface cream in
light mode, proper tabular-nums for counts). This is part of the
html-anything family — never a Chrome / Edge / Safari / Firefox
imitation. **Do not use any browser brand color.** The brand color
stays Clockless orange.

## Always include

- **Copy as Markdown** button at the bottom that captures the
  domain / topic / session summary as a shareable note (titles +
  domains, never full URLs).
- Light + dark mode via `prefers-color-scheme`.
- Mobile-first responsive — cards stack, charts shrink but stay
  readable.
- Tabular-nums for every numeric column.
- A footer line:
  > *Generated locally — your browser history never left your
  > machine. Every visit is embedded in this HTML and rendered
  > offline in your browser. Topic labels are a heuristic
  > domain/title roll-up, not topic modeling. The page does not
  > fetch favicons, thumbnails, or any third-party content.*

## Data shape

```ts
DATA = {
  format: "browser-history",
  rows: [
    {
      id: "h_000001",
      ts: "2025-10-12T20:01:00.000Z",
      title: "GitHub - clockless-org/html-anything",
      url: "https://github.com/clockless-org/html-anything",
      domain: "github.com",          // eTLD+1 collapsed
      host: "github.com",            // raw host (subdomain preserved)
      path: "/clockless-org/html-anything",
      query: "",                      // raw query string, may be masked at render
      queryMasked: false,             // true if the parser detected sensitive bits
      visitCount: 12,
      typedCount: 1,
      transition: "typed" | "link" | "auto" | "reload" | "form" | "other",
      isTyped: true,
      isSearch: false,                // true when domain is a search engine
      searchQuery: null,              // extracted q=/query=/p= when isSearch
      topic: "work-tools",
      topicInferred: true,
      bucket: "work" | "personal" | "search" | "other",
      hour: 20,
      dow: 0,
      date: "2025-10-12",
      isLateNight: false
    }
  ],
  summary: {
    totalCount: 412,
    uniqueDomains: 38,
    uniqueUrls: 271,
    dateRange: "2025-04-12 → 2025-10-12",
    durationLabel: "6 months",
    activeDays: 144,
    activeMonths: 7,
    busiestDay: { date: "2025-04-14", count: 73 },
    busiestWeek: { week: "2025-W17", count: 191 },
    lateNightCount: 38,
    lateNightShare: 0.09,
    typedCount: 88,
    typedShare: 0.21,
    sessionCount: 12,
    returnerCount: 7,
    repeatedSearchCount: 4,
    topDomain: "github.com",
    topDomainShare: 0.14,
    topTopic: "work-tools",
    topTopicShare: 0.27,
    workShare: 0.51,
    personalShare: 0.34,
    searchShare: 0.10
  },
  domains: [
    {
      domain: "github.com",
      hosts: 6,
      count: 412,
      share: 0.14,
      first: "2025-04-12",
      last: "2025-10-12",
      topic: "work-tools",
      sampleTitles: [{ title: "...", ts: "...", path: "/...", topic: "work-tools" }, ...]
    },
    ...
  ],
  topics: [
    { topic: "work-tools", count: 612, domains: 11, share: 0.27, bucket: "work" },
    ...
  ],
  bucketTotals: [
    { bucket: "work", count: 1062, share: 0.51 },
    { bucket: "personal", count: 712, share: 0.34 },
    { bucket: "search", count: 211, share: 0.10 },
    { bucket: "other", count: 105, share: 0.05 }
  ],
  monthTotals: [
    { month: "2025-04", count: 612, activeDays: 22 },
    ...
  ],
  weekTotals: [
    { week: "2025-W15", count: 142 },
    ...
  ],
  hourCounts: [/* 24 ints */],
  dowCounts:  [/* 7 ints, 0=Sun */],
  heatmap:    [/* 7 × 24 ints */],
  weekdayHeatmap: [/* 7 × 24 ints, weekday-only when toggle is on */],
  weekendHeatmap: [/* 7 × 24 ints */],
  returners: [
    {
      url: "https://www.notion.so/...",
      title: "Q3 launch plan — Notion",
      domain: "notion.so",
      timesVisited: 9,
      firstSeen: "2025-04-21",
      lastSeen: "2025-09-30",
      cadenceLabel: "every ~3 weeks",
      sampleIds: ["h_000031", "h_000094", ...]
    },
    ...
  ],
  sessions: [
    {
      start: "2025-10-12T20:01:00.000Z",
      end:   "2025-10-12T21:48:00.000Z",
      durationMin: 107,
      count: 14,
      topDomain: "github.com",
      topTopic: "work-tools",
      sampleTitles: ["Postgres for people who hate ORMs", ...],
      itemIds: ["h_000017", ...],
      looksLikeResearch: true
    },
    ...
  ],
  repeatedSearches: [
    { query: "postgres index covering", engine: "google.com", count: 4, lastSeen: "2025-09-12" },
    ...
  ],
  meta: { sourceFile, sizeBytes, shape: "browser-history" }
}
```

The parser pre-computes `summary` / `domains` / `topics` /
`bucketTotals` / `monthTotals` / `weekTotals` / `hourCounts` /
`dowCounts` / `heatmap` / `weekdayHeatmap` / `weekendHeatmap` /
`returners` / `sessions` / `repeatedSearches` — do **not** re-derive
them on the client. Walking thousands of rows on mobile freezes the
page; iterate over `rows` only for the drill-down render.
