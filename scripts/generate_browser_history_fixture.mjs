#!/usr/bin/env node
/**
 * Deterministic synthetic-data generator for the browser-history example.
 * Produces a realistic-shaped CSV with the columns commonly emitted by
 * "History Trends Unlimited" and similar Chromium-history exporters:
 *
 *   url,title,visit_time,visit_count,typed_count,transition
 *
 * The generated file covers:
 *   - 38 fake domains across 11 topic clusters
 *   - ~420 visits over 6 months
 *   - research sessions: a few afternoons where 8–14 visits cluster
 *     across GitHub / Stack Overflow / docs / a Google search
 *   - rabbit holes: long sessions on Reddit / YouTube / Wikipedia
 *   - returners: a handful of URLs (Notion doc, dashboard, calendar)
 *     visited 6+ times
 *   - repeated searches: a few queries that show up 3–5 times
 *   - typed visits: a mix of address-bar typing vs. clicked links
 *   - a couple of late-night spikes (Reddit + YouTube after midnight)
 *
 * Privacy: every domain, page title, and search query is invented.
 * No real browsing activity is referenced. Order numbers, account
 * IDs, and tokens never appear. URLs avoid logged-in paths and any
 * shape that could resemble a real personal account.
 *
 * Usage:
 *   node scripts/generate_browser_history_fixture.mjs > examples/browser-history/input.csv
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const SEED = 0x42524857 // "BRHW"
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "examples/browser-history/input.csv")
const END_MS = Date.UTC(2025, 9, 12, 0, 0, 0) // 2025-10-12Z
const SPAN_DAYS = 184 // ~6 months
const TARGET_COUNT = 420

function mulberry32(seed) {
  let s = seed >>> 0
  return function () {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(SEED)
function pick(arr) { return arr[Math.floor(rand() * arr.length)] }
function chance(p) { return rand() < p }
function randint(lo, hi) { return Math.floor(rand() * (hi - lo + 1)) + lo }

// ----------------------------------------------------------------------------
// Fake domains grouped by topic.
// ----------------------------------------------------------------------------

const SITES = [
  // work-tools
  { domain: "github.com",        topic: "work-tools",   pages: [
    ["/clockless-org/html-anything", "html-anything · clockless-org · GitHub"],
    ["/clockless-org/html-anything/pull/142", "Add browser-history support · Pull Request #142"],
    ["/clockless-org/html-anything/issues", "Issues · clockless-org/html-anything"],
    ["/clockless-org/html-anything/blob/main/SKILL.md", "html-anything/SKILL.md at main"],
    ["/orgs/clockless-org/repositories", "Repositories · clockless-org"],
  ]},
  { domain: "linear.app",        topic: "work-tools",   pages: [
    ["/clockless/issue/CLO-109", "CLO-109 — Browser history use case"],
    ["/clockless/inbox", "Inbox · Linear"],
    ["/clockless/team/PRO/active", "Active issues · Project"],
  ]},
  { domain: "notion.so",         topic: "work-tools",   pages: [
    ["/Q3-launch-plan-abc", "Q3 launch plan"],
    ["/Engineering-handbook-xyz", "Engineering handbook"],
    ["/Decision-log-pqr", "Decision log"],
  ]},
  { domain: "figma.com",         topic: "work-tools",   pages: [
    ["/file/abc/Onboarding-flow", "Onboarding flow – Figma"],
    ["/file/def/Brand-tokens", "Brand tokens – Figma"],
  ]},
  { domain: "slack.com",         topic: "work-tools",   pages: [
    ["/client/T0/C1", "#general — Acme"],
    ["/client/T0/C2", "#engineering — Acme"],
  ]},
  { domain: "vercel.com",        topic: "work-tools",   pages: [
    ["/clockless/html-anything-preview", "html-anything preview · Vercel"],
    ["/clockless/html-anything/deployments", "Deployments · html-anything"],
  ]},
  { domain: "console.cloud.google.com", topic: "work-tools", pages: [
    ["/run", "Cloud Run · Google Cloud"],
    ["/billing", "Billing · Google Cloud"],
  ]},

  // coding-help
  { domain: "stackoverflow.com", topic: "coding-help",  pages: [
    ["/questions/12345/postgres-covering-index", "Postgres covering index — best practice — Stack Overflow"],
    ["/questions/45678/typescript-conditional-types", "TypeScript conditional type unions — Stack Overflow"],
    ["/questions/91011/svg-text-rendering", "SVG text rendering off by 1px — Stack Overflow"],
    ["/questions/22334/regex-multiline", "JavaScript regex multiline matching — Stack Overflow"],
  ]},
  { domain: "developer.mozilla.org", topic: "coding-help", pages: [
    ["/en-US/docs/Web/CSS/grid-template-areas", "grid-template-areas — CSS · MDN"],
    ["/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl", "Intl — JavaScript · MDN"],
    ["/en-US/docs/Web/API/URL", "URL — Web APIs · MDN"],
  ]},
  { domain: "npmjs.com",         topic: "coding-help",  pages: [
    ["/package/typescript", "typescript — npm"],
    ["/package/zod", "zod — npm"],
  ]},
  { domain: "dev.to",            topic: "coding-help",  pages: [
    ["/posts/svg-text-baseline-tricks", "SVG text-baseline tricks — DEV"],
  ]},

  // docs-knowledge
  { domain: "wikipedia.org",     topic: "docs-knowledge", pages: [
    ["/wiki/Public_Suffix_List", "Public Suffix List — Wikipedia"],
    ["/wiki/Sourdough", "Sourdough — Wikipedia"],
    ["/wiki/Antikythera_mechanism", "Antikythera mechanism — Wikipedia"],
  ]},
  { domain: "readthedocs.io",    topic: "docs-knowledge", pages: [
    ["/projects/sqlalchemy/en/latest/", "SQLAlchemy documentation"],
  ]},

  // search
  { domain: "google.com",        topic: "search",       searchQueries: [
    "postgres covering index size",
    "typescript narrow type from string",
    "svg text vertical-align baseline",
    "sourdough proof temperature",
    "best portable espresso maker",
    "next.js app router cache headers",
    "decode chromium webkit time",
    "weekend road trip 3 hours from sf",
  ]},
  { domain: "duckduckgo.com",    topic: "search",       searchQueries: [
    "postgres covering index size",
    "css grid template-areas examples",
  ]},
  { domain: "kagi.com",          topic: "search",       searchQueries: [
    "decode chromium webkit time",
  ]},

  // social
  { domain: "reddit.com",        topic: "social",       pages: [
    ["/r/programming", "/r/programming"],
    ["/r/coffee/comments/abc/portable_espresso", "What's your favorite portable espresso? : r/coffee"],
    ["/r/sourdough/comments/def/proofing", "Cold proofing question : r/sourdough"],
    ["/r/AskHistorians/comments/ghi/antikythera", "Antikythera mechanism — what we know : r/AskHistorians"],
    ["/r/woodworking", "/r/woodworking"],
  ]},
  { domain: "news.ycombinator.com", topic: "social",   pages: [
    ["/", "Hacker News"],
    ["/item?id=1234567", "A small database in 200 lines | Hacker News"],
    ["/newest", "New | Hacker News"],
  ]},
  { domain: "x.com",             topic: "social",       pages: [
    ["/home", "Home / X"],
    ["/i/notifications", "Notifications / X"],
  ]},
  { domain: "linkedin.com",      topic: "social",       pages: [
    ["/feed/", "Feed | LinkedIn"],
  ]},

  // media
  { domain: "youtube.com",       topic: "media",        pages: [
    ["/watch?v=fakeid001", "How a B-tree pages to disk — Mongoose Garage — YouTube"],
    ["/watch?v=fakeid002", "Beans and rice, but on purpose — Spice Drawer — YouTube"],
    ["/watch?v=fakeid003", "Restoring a 1940s woodworking plane — Brick and Mortar — YouTube"],
    ["/watch?v=fakeid004", "1 hour of soft piano for the late shift — Lofi Buoy — YouTube"],
    ["/feed/subscriptions", "Subscriptions — YouTube"],
    ["/results?search_query=fake-query", "Search results — YouTube"],
  ]},
  { domain: "open.spotify.com",  topic: "media",        pages: [
    ["/playlist/abc", "Late shift — Playlist"],
    ["/album/def", "Forgotten records of 1979"],
  ]},
  { domain: "twitch.tv",         topic: "media",        pages: [
    ["/directory/category/software-and-game-development", "Software and Game Development streams"],
  ]},

  // shopping
  { domain: "amazon.com",        topic: "shopping",     pages: [
    ["/dp/B000FAKE01", "Portable espresso maker — manual lever"],
    ["/dp/B000FAKE02", "Stainless steel mixing bowl set"],
    ["/dp/B000FAKE03", "Hand plane no.4 — restoration project"],
    ["/best-sellers", "Amazon Best Sellers"],
  ]},
  { domain: "etsy.com",          topic: "shopping",     pages: [
    ["/listing/abc/handmade-bowl", "Handmade ceramic bowl — Etsy"],
  ]},
  { domain: "rei.com",           topic: "shopping",     pages: [
    ["/product/123/headlamp", "Lightweight headlamp — REI"],
  ]},

  // finance-admin
  { domain: "fidelity.com",      topic: "finance-admin", pages: [
    ["/accounts/portfolio", "Portfolio summary — Fidelity"],
    ["/research/news", "Market news — Fidelity"],
  ]},
  { domain: "ally.com",          topic: "finance-admin", pages: [
    ["/banking/checking", "Checking account — Ally"],
  ]},
  { domain: "stripe.com",        topic: "finance-admin", pages: [
    ["/dashboard/payments", "Payments — Stripe Dashboard"],
  ]},
  { domain: "irs.gov",           topic: "finance-admin", pages: [
    ["/forms-pubs", "Forms and Publications — IRS"],
  ]},

  // travel
  { domain: "google.com",        topic: "travel", isMaps: true, pages: [
    ["/maps/place/Half+Moon+Bay", "Half Moon Bay — Google Maps"],
    ["/maps/dir/SF/Mendocino", "Directions to Mendocino — Google Maps"],
  ]},
  { domain: "airbnb.com",        topic: "travel", pages: [
    ["/s/Mendocino--CA--United-States/homes", "Mendocino · Airbnb"],
  ]},
  { domain: "delta.com",         topic: "travel", pages: [
    ["/flightinfo", "Flight information — Delta"],
  ]},

  // health
  { domain: "mychart.org",       topic: "health", pages: [
    ["/MyChart/Visits", "Upcoming visits — MyChart"],
  ]},
  { domain: "healthline.com",    topic: "health", pages: [
    ["/nutrition/sourdough-bread", "Is sourdough bread healthy? — Healthline"],
  ]},

  // news
  { domain: "nytimes.com",       topic: "news", pages: [
    ["/section/world", "World — The New York Times"],
    ["/section/technology", "Technology — The New York Times"],
  ]},
  { domain: "bbc.com",           topic: "news", pages: [
    ["/news", "BBC News"],
  ]},
  { domain: "apnews.com",        topic: "news", pages: [
    ["/", "AP News"],
  ]},
]

function pickHourForTopic(topic) {
  if (topic === "social") return chance(0.45) ? randint(20, 23) : (chance(0.4) ? randint(0, 2) : randint(11, 14))
  if (topic === "media") return chance(0.55) ? randint(20, 23) : (chance(0.4) ? randint(0, 2) : randint(15, 19))
  if (topic === "search" || topic === "coding-help") return chance(0.6) ? randint(10, 17) : randint(20, 22)
  if (topic === "work-tools") return chance(0.7) ? randint(9, 17) : randint(20, 22)
  if (topic === "shopping") return chance(0.5) ? randint(20, 22) : randint(12, 14)
  if (topic === "news") return chance(0.6) ? randint(7, 9) : randint(17, 19)
  if (topic === "travel") return chance(0.5) ? randint(20, 22) : randint(12, 14)
  if (topic === "health") return randint(9, 17)
  if (topic === "docs-knowledge") return chance(0.5) ? randint(10, 16) : randint(20, 22)
  return randint(10, 22)
}

function fakeUrl(site, page) {
  if (site.isMaps) return "https://www.google.com" + page[0]
  return "https://www." + site.domain + page[0]
}

function fakeSearchUrl(site, query) {
  const enc = encodeURIComponent(query).replace(/%20/g, "+")
  if (site.domain === "google.com") return "https://www.google.com/search?q=" + enc + "&hl=en"
  if (site.domain === "duckduckgo.com") return "https://duckduckgo.com/?q=" + enc + "&t=h_"
  if (site.domain === "kagi.com") return "https://kagi.com/search?q=" + enc
  return "https://" + site.domain + "/?q=" + enc
}

function pickPage(site) {
  if (site.searchQueries) {
    const q = pick(site.searchQueries)
    return { url: fakeSearchUrl(site, q), title: q + " — " + (site.domain === "google.com" ? "Google Search" : site.domain === "duckduckgo.com" ? "DuckDuckGo" : "Kagi") }
  }
  const p = pick(site.pages)
  return { url: fakeUrl(site, p), title: p[1] }
}

const events = []

// 1) Base distribution.
const base = TARGET_COUNT - 90 // leave headroom for sessions / returners / late-night
for (let i = 0; i < base; i++) {
  const site = pick(SITES)
  const page = pickPage(site)
  let dayOffset = Math.floor(rand() * SPAN_DAYS)
  if (chance(0.18)) dayOffset = 90 + randint(0, 16) // a "vacation" lull window
  const hour = pickHourForTopic(site.topic)
  const minute = randint(0, 59)
  const second = randint(0, 59)
  const ts = END_MS - dayOffset * 86_400_000 + hour * 3_600_000 + minute * 60_000 + second * 1000
  events.push({ site, page, ts, isTyped: chance(0.18) })
}

// 2) Inject 4 research sessions.
function addResearchSession(centerDayOffset, hourStart) {
  const search = pick(SITES.filter(s => s.searchQueries))
  const so = SITES.find(s => s.domain === "stackoverflow.com")
  const mdn = SITES.find(s => s.domain === "developer.mozilla.org")
  const gh = SITES.find(s => s.domain === "github.com")
  const npm = SITES.find(s => s.domain === "npmjs.com")
  const sequence = [search, so, mdn, search, gh, so, npm, gh, mdn]
  const pages = sequence.map(s => pickPage(s))
  let cursor = END_MS - centerDayOffset * 86_400_000 + hourStart * 3_600_000 + randint(0, 14) * 60_000
  for (let i = 0; i < pages.length; i++) {
    events.push({ site: sequence[i], page: pages[i], ts: cursor, isTyped: i === 0 })
    cursor += randint(2, 9) * 60_000
  }
}
addResearchSession(160, 14)
addResearchSession(95,  20)
addResearchSession(40,  10)
addResearchSession(7,   16)

// 3) Inject 2 rabbit-hole sessions (Reddit + YouTube).
function addRabbitHole(centerDayOffset, hourStart, site) {
  const count = randint(8, 14)
  let cursor = END_MS - centerDayOffset * 86_400_000 + hourStart * 3_600_000 + randint(0, 14) * 60_000
  for (let i = 0; i < count; i++) {
    events.push({ site, page: pickPage(site), ts: cursor, isTyped: i === 0 })
    cursor += randint(3, 12) * 60_000
  }
}
addRabbitHole(122, 23, SITES.find(s => s.domain === "reddit.com"))
addRabbitHole(28,  0,  SITES.find(s => s.domain === "youtube.com"))

// 4) Inject returners — same URL visited 6+ times.
const RETURNERS = [
  { site: SITES.find(s => s.domain === "notion.so"),     page: ["/Q3-launch-plan-abc", "Q3 launch plan"], times: 9 },
  { site: SITES.find(s => s.domain === "linear.app"),    page: ["/clockless/inbox", "Inbox · Linear"],     times: 8 },
  { site: SITES.find(s => s.domain === "github.com"),    page: ["/clockless-org/html-anything/pull/142", "Add browser-history support · Pull Request #142"], times: 6 },
  { site: SITES.find(s => s.domain === "vercel.com"),    page: ["/clockless/html-anything/deployments", "Deployments · html-anything"], times: 7 },
  { site: SITES.find(s => s.domain === "fidelity.com"),  page: ["/accounts/portfolio", "Portfolio summary — Fidelity"], times: 5 },
]
for (const r of RETURNERS) {
  const url = fakeUrl(r.site, r.page)
  for (let i = 0; i < r.times; i++) {
    const dayOffset = Math.floor(rand() * SPAN_DAYS)
    const hour = pickHourForTopic(r.site.topic)
    const ts = END_MS - dayOffset * 86_400_000 + hour * 3_600_000 + randint(0, 59) * 60_000
    events.push({ site: r.site, page: { url, title: r.page[1] }, ts, isTyped: r.site.domain === "linear.app" || r.site.domain === "notion.so" })
  }
}

// 5) Inject repeated searches — same query 3-5 times.
const REPEATED = [
  { query: "postgres covering index size", times: 4 },
  { query: "decode chromium webkit time", times: 3 },
  { query: "best portable espresso maker", times: 3 },
]
const google = SITES.find(s => s.domain === "google.com" && s.searchQueries)
for (const r of REPEATED) {
  for (let i = 0; i < r.times; i++) {
    const dayOffset = Math.floor(rand() * SPAN_DAYS)
    const hour = pickHourForTopic("search")
    const ts = END_MS - dayOffset * 86_400_000 + hour * 3_600_000 + randint(0, 59) * 60_000
    const url = fakeSearchUrl(google, r.query)
    events.push({ site: google, page: { url, title: r.query + " — Google Search" }, ts, isTyped: true })
  }
}

// Sort newest-last so visit_count aggregation reads naturally; the parser handles either order.
events.sort((a, b) => a.ts - b.ts)

// Aggregate visit_count + typed_count per URL.
const urlAgg = new Map()
for (const e of events) {
  const k = e.page.url
  if (!urlAgg.has(k)) urlAgg.set(k, { count: 0, typed: 0 })
  const a = urlAgg.get(k)
  a.count += 1
  if (e.isTyped) a.typed += 1
}

// Materialize CSV.
const header = "url,title,visit_time,visit_count,typed_count,transition\n"
const lines = [header]
function csvCell(s) {
  const v = String(s == null ? "" : s)
  if (/[",\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"'
  return v
}
for (const e of events) {
  const a = urlAgg.get(e.page.url)
  const transition = e.isTyped ? "typed" : (chance(0.92) ? "link" : "auto")
  lines.push([
    csvCell(e.page.url),
    csvCell(e.page.title),
    csvCell(new Date(e.ts).toISOString()),
    String(a.count),
    String(a.typed),
    transition,
  ].join(",") + "\n")
}

await fs.mkdir(path.dirname(OUT), { recursive: true })
await fs.writeFile(OUT, lines.join(""), "utf8")
console.log("Wrote " + OUT + " (" + events.length + " visits, " + urlAgg.size + " unique URLs)")
