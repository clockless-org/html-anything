#!/usr/bin/env node
/**
 * Deterministic synthetic-data generator for the browser-history example.
 * Produces a realistic-shaped CSV with the columns commonly emitted by
 * "History Trends Unlimited" and similar Chromium-history exporters:
 *
 *   url,title,visit_time,visit_count,typed_count,transition
 *
 * The generated file covers:
 *   - ~40 invented brand domains across 11 topic clusters
 *   - ~420 visits over 6 months
 *   - research sessions: a few afternoons where 8–14 visits cluster
 *     across the fictional code-host / Q&A site / docs / search engine
 *   - rabbit holes: long sessions on the fake social + video brands
 *   - returners: a handful of URLs (planning doc, dashboard, inbox)
 *     visited 6+ times
 *   - repeated searches: a few queries that show up 3–5 times
 *   - typed visits: a mix of address-bar typing vs. clicked links
 *   - a couple of late-night spikes (social + video after midnight)
 *
 * Privacy: every domain uses the IANA-reserved `.example` TLD (RFC 2606),
 * which is guaranteed never to resolve to a real site. Every page title,
 * search query, place name, and personal name is invented for this
 * fixture. No real browsing activity, real brands, real account names,
 * real personal URLs, or real product names appear in the output.
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
// Synthetic brand domains under the IANA-reserved .example TLD (RFC 2606).
// No real product names, real services, or real personal URLs are used.
// ----------------------------------------------------------------------------

const SITES = [
  // work-tools
  { domain: "devhub.example",       topic: "work-tools",   pages: [
    ["/datapack-org/datapack-anything", "datapack-anything · datapack-org — Devhub"],
    ["/datapack-org/datapack-anything/pull/142", "Add browser-history support · Pull Request #142 — Devhub"],
    ["/datapack-org/datapack-anything/issues", "Issues · datapack-org/datapack-anything — Devhub"],
    ["/datapack-org/datapack-anything/blob/main/SKILL.md", "datapack-anything/SKILL.md at main — Devhub"],
    ["/orgs/datapack-org/repositories", "Repositories · datapack-org — Devhub"],
  ]},
  { domain: "tracklane.example",    topic: "work-tools",   pages: [
    ["/datapack/issue/DPA-109", "DPA-109 — Browser history use case — Tracklane"],
    ["/datapack/inbox", "Inbox — Tracklane"],
    ["/datapack/team/PRO/active", "Active issues · Project — Tracklane"],
  ]},
  { domain: "pagebook.example",     topic: "work-tools",   pages: [
    ["/Q3-launch-plan-abc", "Q3 launch plan — Pagebook"],
    ["/Engineering-handbook-xyz", "Engineering handbook — Pagebook"],
    ["/Decision-log-pqr", "Decision log — Pagebook"],
  ]},
  { domain: "pixelboard.example",   topic: "work-tools",   pages: [
    ["/file/abc/Onboarding-flow", "Onboarding flow — Pixelboard"],
    ["/file/def/Brand-tokens", "Brand tokens — Pixelboard"],
  ]},
  { domain: "huddle.example",       topic: "work-tools",   pages: [
    ["/client/T0/C1", "#general — Acme Workspace — Huddle"],
    ["/client/T0/C2", "#engineering — Acme Workspace — Huddle"],
  ]},
  { domain: "glidedeploy.example",  topic: "work-tools",   pages: [
    ["/datapack/datapack-anything-preview", "datapack-anything preview — Glidedeploy"],
    ["/datapack/datapack-anything/deployments", "Deployments · datapack-anything — Glidedeploy"],
  ]},
  { domain: "cloudbench.example",   topic: "work-tools",   pages: [
    ["/run", "Container Run — Cloudbench"],
    ["/billing", "Billing — Cloudbench"],
  ]},

  // coding-help
  { domain: "quokka.example",       topic: "coding-help",  pages: [
    ["/questions/12345/postgres-covering-index", "Postgres covering index — best practice — Quokka Answers"],
    ["/questions/45678/conditional-types", "Conditional type unions in a typed language — Quokka Answers"],
    ["/questions/91011/svg-text-rendering", "SVG text rendering off by 1px — Quokka Answers"],
    ["/questions/22334/regex-multiline", "Regex multiline matching — Quokka Answers"],
  ]},
  { domain: "webcodex.example",     topic: "coding-help",  pages: [
    ["/docs/Web/CSS/grid-template-areas", "grid-template-areas — CSS reference — WebCodex"],
    ["/docs/Web/JavaScript/Reference/Global_Objects/Intl", "Intl — JavaScript reference — WebCodex"],
    ["/docs/Web/API/URL", "URL — Web APIs — WebCodex"],
  ]},
  { domain: "pkgsmith.example",     topic: "coding-help",  pages: [
    ["/package/typesafe-lang", "typesafe-lang — Pkgsmith"],
    ["/package/zoneparse", "zoneparse — Pkgsmith"],
  ]},
  { domain: "buildbits.example",    topic: "coding-help",  pages: [
    ["/posts/svg-text-baseline-tricks", "SVG text-baseline tricks — Buildbits"],
  ]},

  // docs-knowledge
  { domain: "openpedia.example",    topic: "docs-knowledge", pages: [
    ["/wiki/Public_Suffix_List", "Public Suffix List — Openpedia"],
    ["/wiki/Pinegrove_cove",     "Pinegrove cove — Openpedia"],
    ["/wiki/Bronze_orrery_devices", "Bronze orrery devices — Openpedia"],
  ]},
  { domain: "manualbase.example",   topic: "docs-knowledge", pages: [
    ["/projects/sql-toolkit/en/latest/", "SQL Toolkit documentation — Manualbase"],
  ]},

  // search
  { domain: "findr.example",        topic: "search",       searchQueries: [
    "postgres covering index size",
    "narrow type from string literal",
    "svg text vertical-align baseline",
    "sourdough proof temperature",
    "best portable espresso maker",
    "ssr app router cache headers",
    "decode webkit epoch microseconds",
    "weekend road trip 3 hours from town",
  ]},
  { domain: "searchgo.example",     topic: "search",       searchQueries: [
    "postgres covering index size",
    "css grid template-areas examples",
  ]},
  { domain: "quietfind.example",    topic: "search",       searchQueries: [
    "decode webkit epoch microseconds",
  ]},

  // social
  { domain: "redbox.example",       topic: "social",       pages: [
    ["/r/programming", "/r/programming — Redbox"],
    ["/r/coffee/comments/abc/portable_espresso", "Favorite portable espresso? — r/coffee — Redbox"],
    ["/r/sourdough/comments/def/proofing", "Cold proofing question — r/sourdough — Redbox"],
    ["/r/local-history/comments/ghi/bronze-orrery", "Bronze orrery devices — what we know — r/local-history — Redbox"],
    ["/r/woodworking", "/r/woodworking — Redbox"],
  ]},
  { domain: "hackerwire.example",   topic: "social",       pages: [
    ["/", "Hackerwire"],
    ["/item?id=1234567", "A small database in 200 lines — Hackerwire"],
    ["/newest", "New — Hackerwire"],
  ]},
  { domain: "microblog.example",    topic: "social",       pages: [
    ["/home", "Home — Microblog"],
    ["/i/notifications", "Notifications — Microblog"],
  ]},
  { domain: "worknet.example",      topic: "social",       pages: [
    ["/feed/", "Feed — Worknet"],
  ]},

  // media
  { domain: "streamtube.example",   topic: "media",        pages: [
    ["/watch?v=fakeid001", "How a B-tree pages to disk — Mongoose Garage — Streamtube"],
    ["/watch?v=fakeid002", "Beans and rice, but on purpose — Spice Drawer — Streamtube"],
    ["/watch?v=fakeid003", "Restoring a 1940s woodworking plane — Brick and Mortar — Streamtube"],
    ["/watch?v=fakeid004", "1 hour of soft piano for the late shift — Lofi Buoy — Streamtube"],
    ["/feed/subscriptions", "Subscriptions — Streamtube"],
    ["/results?search_query=fake-query", "Search results — Streamtube"],
  ]},
  { domain: "tunestream.example",   topic: "media",        pages: [
    ["/playlist/abc", "Late shift — Playlist — Tunestream"],
    ["/album/def", "Forgotten records of 1979 — Tunestream"],
  ]},
  { domain: "livecast.example",     topic: "media",        pages: [
    ["/directory/category/software-and-game-development", "Software and Game Development streams — Livecast"],
  ]},

  // shopping
  { domain: "bigmart.example",      topic: "shopping",     pages: [
    ["/dp/B000FAKE01", "Portable espresso maker — manual lever — Bigmart"],
    ["/dp/B000FAKE02", "Stainless steel mixing bowl set — Bigmart"],
    ["/dp/B000FAKE03", "Hand plane no.4 — restoration project — Bigmart"],
    ["/best-sellers", "Best Sellers — Bigmart"],
  ]},
  { domain: "craftshop.example",    topic: "shopping",     pages: [
    ["/listing/abc/handmade-bowl", "Handmade ceramic bowl — Craftshop"],
  ]},
  { domain: "outdoorco.example",    topic: "shopping",     pages: [
    ["/product/123/headlamp", "Lightweight headlamp — Outdoorco"],
  ]},

  // finance-admin
  { domain: "investview.example",   topic: "finance-admin", pages: [
    ["/accounts/portfolio", "Portfolio summary — Investview"],
    ["/research/news",      "Market news — Investview"],
  ]},
  { domain: "friendlybank.example", topic: "finance-admin", pages: [
    ["/banking/checking", "Checking account — Friendlybank"],
  ]},
  { domain: "paywire.example",      topic: "finance-admin", pages: [
    ["/dashboard/payments", "Payments — Paywire Dashboard"],
  ]},
  { domain: "taxportal.example",    topic: "finance-admin", pages: [
    ["/forms-pubs", "Forms and Publications — Taxportal"],
  ]},

  // travel
  { domain: "mapsguide.example",    topic: "travel", isMaps: true, pages: [
    ["/maps/place/Cove+Point",                "Cove Point — Mapsguide"],
    ["/maps/dir/Riverbend/Pinegrove",         "Directions to Pinegrove — Mapsguide"],
  ]},
  { domain: "bookstay.example",     topic: "travel", pages: [
    ["/s/Pinegrove/homes", "Pinegrove — Bookstay"],
  ]},
  { domain: "skywings.example",     topic: "travel", pages: [
    ["/flightinfo", "Flight information — Skywings"],
  ]},

  // health
  { domain: "caremap.example",      topic: "health", pages: [
    ["/visits", "Upcoming visits — Caremap"],
  ]},
  { domain: "wellnessread.example", topic: "health", pages: [
    ["/nutrition/sourdough-bread", "Is sourdough bread healthy? — Wellnessread"],
  ]},

  // news
  { domain: "dailyledger.example",  topic: "news", pages: [
    ["/section/world",      "World — Daily Ledger"],
    ["/section/technology", "Technology — Daily Ledger"],
  ]},
  { domain: "worldwire.example",    topic: "news", pages: [
    ["/news", "Worldwire News"],
  ]},
  { domain: "pressglobe.example",   topic: "news", pages: [
    ["/", "Pressglobe"],
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
  if (site.isMaps) return "https://www.mapsguide.example" + page[0]
  return "https://www." + site.domain + page[0]
}

function fakeSearchUrl(site, query) {
  const enc = encodeURIComponent(query).replace(/%20/g, "+")
  if (site.domain === "findr.example") return "https://www.findr.example/search?q=" + enc + "&hl=en"
  if (site.domain === "searchgo.example") return "https://searchgo.example/?q=" + enc + "&t=h_"
  if (site.domain === "quietfind.example") return "https://quietfind.example/search?q=" + enc
  return "https://" + site.domain + "/?q=" + enc
}

function searchEngineLabel(domain) {
  if (domain === "findr.example") return "Findr Search"
  if (domain === "searchgo.example") return "Searchgo"
  if (domain === "quietfind.example") return "Quietfind"
  return domain
}

function pickPage(site) {
  if (site.searchQueries) {
    const q = pick(site.searchQueries)
    return { url: fakeSearchUrl(site, q), title: q + " — " + searchEngineLabel(site.domain) }
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
  const so = SITES.find(s => s.domain === "quokka.example")
  const mdn = SITES.find(s => s.domain === "webcodex.example")
  const gh = SITES.find(s => s.domain === "devhub.example")
  const npm = SITES.find(s => s.domain === "pkgsmith.example")
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

// 3) Inject 2 rabbit-hole sessions (social + media).
function addRabbitHole(centerDayOffset, hourStart, site) {
  const count = randint(8, 14)
  let cursor = END_MS - centerDayOffset * 86_400_000 + hourStart * 3_600_000 + randint(0, 14) * 60_000
  for (let i = 0; i < count; i++) {
    events.push({ site, page: pickPage(site), ts: cursor, isTyped: i === 0 })
    cursor += randint(3, 12) * 60_000
  }
}
addRabbitHole(122, 23, SITES.find(s => s.domain === "redbox.example"))
addRabbitHole(28,  0,  SITES.find(s => s.domain === "streamtube.example"))

// 4) Inject returners — same URL visited 6+ times.
const RETURNERS = [
  { site: SITES.find(s => s.domain === "pagebook.example"),    page: ["/Q3-launch-plan-abc", "Q3 launch plan — Pagebook"], times: 9 },
  { site: SITES.find(s => s.domain === "tracklane.example"),   page: ["/datapack/inbox", "Inbox — Tracklane"],            times: 8 },
  { site: SITES.find(s => s.domain === "devhub.example"),      page: ["/datapack-org/datapack-anything/pull/142", "Add browser-history support · Pull Request #142 — Devhub"], times: 6 },
  { site: SITES.find(s => s.domain === "glidedeploy.example"), page: ["/datapack/datapack-anything/deployments", "Deployments · datapack-anything — Glidedeploy"],            times: 7 },
  { site: SITES.find(s => s.domain === "investview.example"),  page: ["/accounts/portfolio", "Portfolio summary — Investview"], times: 5 },
]
for (const r of RETURNERS) {
  const url = fakeUrl(r.site, r.page)
  for (let i = 0; i < r.times; i++) {
    const dayOffset = Math.floor(rand() * SPAN_DAYS)
    const hour = pickHourForTopic(r.site.topic)
    const ts = END_MS - dayOffset * 86_400_000 + hour * 3_600_000 + randint(0, 59) * 60_000
    events.push({ site: r.site, page: { url, title: r.page[1] }, ts, isTyped: r.site.domain === "tracklane.example" || r.site.domain === "pagebook.example" })
  }
}

// 5) Inject repeated searches — same query 3-5 times.
const REPEATED = [
  { query: "postgres covering index size", times: 4 },
  { query: "decode webkit epoch microseconds", times: 3 },
  { query: "best portable espresso maker", times: 3 },
]
const findr = SITES.find(s => s.domain === "findr.example" && s.searchQueries)
for (const r of REPEATED) {
  for (let i = 0; i < r.times; i++) {
    const dayOffset = Math.floor(rand() * SPAN_DAYS)
    const hour = pickHourForTopic("search")
    const ts = END_MS - dayOffset * 86_400_000 + hour * 3_600_000 + randint(0, 59) * 60_000
    const url = fakeSearchUrl(findr, r.query)
    events.push({ site: findr, page: { url, title: r.query + " — Findr Search" }, ts, isTyped: true })
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
