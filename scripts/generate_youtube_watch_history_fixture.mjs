#!/usr/bin/env node
/**
 * Deterministic synthetic-data generator for the YouTube watch-history
 * example. Produces a realistic-shaped Google Takeout watch-history.json
 * covering:
 *
 *  - 28 fake channels grouped by topic (learning / coding / music /
 *    cooking / news / gaming / entertainment / late-night)
 *  - ~260 watch events over 14 months
 *  - binge clusters: a few evenings where 6–8 videos play within ~30 min
 *  - late-night spikes: a measurable share of watches between 00:00–04:00
 *  - repeat watches: a handful of videos watched 3+ times each
 *  - one "removed video" entry to exercise the missing-titleUrl path
 *  - one "from a channel without subtitles" entry (legit Takeout shape)
 *
 * Privacy: every channel, video title, and video ID is wholly invented.
 * No real YouTube content is referenced. Titles read like plausible
 * channel content without paraphrasing real videos. Video IDs follow
 * YouTube's 11-char base64-ish shape but are randomly generated and
 * deterministic across runs (seeded mulberry32).
 *
 * Usage:
 *   node scripts/generate_youtube_watch_history_fixture.mjs > examples/youtube-watch-history/input.json
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const SEED = 0x59545542 // "YTUB"
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "examples/youtube-watch-history/input.json")
const END_MS = Date.UTC(2025, 10, 9, 0, 0, 0) // 2025-11-09Z
const SPAN_DAYS = 420
const TARGET_COUNT = 260

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

// Fake YouTube-shape video IDs — 11 chars, [A-Za-z0-9_-]
const ID_ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"
function fakeVideoId() {
  let s = ""
  for (let i = 0; i < 11; i++) s += ID_ALPHA[Math.floor(rand() * ID_ALPHA.length)]
  return s
}
function fakeChannelId() {
  let s = "UC"
  for (let i = 0; i < 22; i++) s += ID_ALPHA[Math.floor(rand() * ID_ALPHA.length)]
  return s
}

// ----------------------------------------------------------------------------
// Fake channels — every name + handle is invented. Topic tag drives the
// learning-vs-entertainment heuristic in the parser.
// ----------------------------------------------------------------------------

const CHANNELS = [
  { name: "Kestrel and Compass",   topic: "learning",      titles: [
    "Why we stopped finding new antibiotics",
    "The forgotten engineer who saved Apollo 13",
    "How tide tables actually get printed",
    "A short history of the standard shipping container",
    "What economists mean by 'velocity of money'",
    "Reading old maps: the legend you were never taught",
    "How does a violin string really vibrate?",
  ]},
  { name: "Foothold Lab",          topic: "learning",      titles: [
    "Building a 1-watt FM radio from scratch",
    "I tried to grow tomatoes in pure mineral wool",
    "Reverse-engineering a 1990s pocket calculator",
    "Sourdough at 4°C: a 30-day cold ferment",
    "The cheapest way to measure soil moisture",
  ]},
  { name: "Atlas Monthly",         topic: "learning",      titles: [
    "Why every world map is wrong (in a useful way)",
    "What 'sea level' actually means",
    "The ocean current you've never heard of",
    "How borders move when rivers move",
  ]},
  { name: "Slow Ladder Studios",   topic: "learning",      titles: [
    "Learning to draw, week 1 of 52",
    "Notes on perspective from an unfinished sketchbook",
    "Painting fog without using gray",
    "How a printmaker reads light",
  ]},
  { name: "Backslash Burrito",     topic: "coding",        titles: [
    "I rewrote my side project in Rust and it got slower",
    "What 'eventual consistency' actually buys you",
    "Postgres for people who hate ORMs",
    "Why my Kubernetes cluster catches fire on Tuesdays",
    "Static types saved my weekend (this time)",
    "I hate this language but I love this one library",
  ]},
  { name: "Mongoose Garage",       topic: "coding",        titles: [
    "Building a tiny database in 200 lines",
    "How a B-tree actually pages to disk",
    "WAL, fsync, and other words your laptop hates",
    "Async without tears: a small mental model",
  ]},
  { name: "Verdant Repo",          topic: "coding",        titles: [
    "Code review without the dread",
    "Bisecting a flaky test in production",
    "Tags vs branches vs everything else",
    "Why this PR is still open (a postmortem)",
  ]},
  { name: "Mezzanine Tape",        topic: "music",         titles: [
    "Forgotten records of 1979 — Side A",
    "Forgotten records of 1979 — Side B",
    "A late-night listening room: ambient hour 1",
    "A late-night listening room: ambient hour 2",
    "Vinyl crackle and other comforts",
  ]},
  { name: "Lofi Buoy",             topic: "music",         titles: [
    "1 hour of soft piano for the late shift",
    "Rainy window jazz — long mix",
    "Slow strings for studying — extended",
  ]},
  { name: "Marbleweather",         topic: "music",         titles: [
    "Choral works recorded at low light",
    "Field recordings: a slow river in October",
    "An hour of cello, mostly Bach-ish",
  ]},
  { name: "The Pickled Onion",     topic: "entertainment", titles: [
    "We tried every brand of supermarket bread",
    "What is a sandwich, exactly?",
    "Cooking dinner with no electricity for a week",
    "I made my own ketchup and now I have feelings",
    "Office potluck cinematic universe",
  ]},
  { name: "Skylight Diner",        topic: "entertainment", titles: [
    "Driving across three states for one diner",
    "The last 24-hour pancake place in the county",
    "Reviewing roadside coffee like I'm at a wine bar",
  ]},
  { name: "Drysdale Variety",      topic: "entertainment", titles: [
    "Local theatre kid does Hamlet in a parking lot",
    "We restored a 1962 jukebox and it almost worked",
    "A short history of the small-town parade",
  ]},
  { name: "Indie Sliver",          topic: "gaming",        titles: [
    "This 1-person puzzle game ruined my week (good)",
    "I beat the hard mode without the recommended weapon",
    "A roguelite that actually respects your time",
    "Why this 30-MB game beats this 80-GB game",
  ]},
  { name: "NES Catacombs",         topic: "gaming",        titles: [
    "The strangest cartridge I've ever played",
    "Speedrun strats in a 1989 RPG nobody finished",
    "What 'difficulty' meant before save points",
  ]},
  { name: "Tide Reports",          topic: "news",          titles: [
    "What changed at the harbor this month",
    "City council, briefly, for people with day jobs",
    "Five charts about your local water bill",
    "The transit map nobody asked for, finally",
  ]},
  { name: "Slow Public",           topic: "news",          titles: [
    "Reading the budget so you don't have to",
    "What 'public comment period' actually does",
    "The zoning meeting that decided everything",
  ]},
  { name: "Spice Drawer",          topic: "cooking",       titles: [
    "Beans and rice, but on purpose",
    "What a really cheap knife can still do",
    "I tried 9 supermarket olive oils blind",
    "Stews that get better on day three",
    "The cheapest dinner that still feels like dinner",
    "Yogurt at home: just a thermos and patience",
  ]},
  { name: "Thrifty Pantry",        topic: "cooking",       titles: [
    "Lunch from leftovers, week 11",
    "Meal-prep for one without sad containers",
    "Pantry-only soup, six ways",
  ]},
  { name: "Quiet Engine",          topic: "vlog",          titles: [
    "A walk through a town nobody filmed",
    "Notes from a slow afternoon",
    "What a long Sunday looks like, unedited",
    "I sat by the same river for an hour",
  ]},
  { name: "Fern and Folio",        topic: "vlog",          titles: [
    "What I read this month, briefly",
    "A small studio, week 4",
    "Drawing the same tree twice a week",
  ]},
  { name: "Late Hour Theory",      topic: "late-night",    titles: [
    "Why your sleep app might be lying to you",
    "An hour of conspiracy talk (skeptical edition)",
    "Reading 1970s computer ads at midnight",
    "Late-night radio: a forgotten format",
  ]},
  { name: "Owl Spotted",           topic: "late-night",    titles: [
    "Long-form story for people who can't sleep",
    "A slow read of an old travelogue",
    "Insomnia, but make it productive",
  ]},
  { name: "Folded Paper",          topic: "craft",         titles: [
    "Three origami pieces in under twenty minutes",
    "Folding a cube, slowly",
    "What the crease pattern is actually telling you",
  ]},
  { name: "Brick and Mortar",      topic: "craft",         titles: [
    "Restoring a 1940s woodworking plane",
    "Sharpening a chisel, the long way",
    "Why my workbench is a hand-me-down",
  ]},
  { name: "Long Take Sports",      topic: "entertainment", titles: [
    "Why this team's defense is quietly the best",
    "An old game I keep coming back to",
    "What the box score doesn't say",
  ]},
  { name: "Mile and Marker",       topic: "vlog",          titles: [
    "A 12-mile training run, narrated",
    "The first cold morning of the year",
    "What a slow week of training looks like",
  ]},
  { name: "Pocket Geography",      topic: "learning",      titles: [
    "Three countries you keep mispronouncing",
    "The river that flows uphill (sort of)",
    "Time zones nobody planned",
    "Mapping languages in one small valley",
  ]},
]

for (const c of CHANNELS) c.id = fakeChannelId()

// ----------------------------------------------------------------------------
// Build watch events with realistic time clustering.
// ----------------------------------------------------------------------------

function dayMs() { return 86_400_000 }

function pickHour(topic) {
  // Late-night topics: 00:00–04:00 most of the time, plus a few stray afternoons.
  if (topic === "late-night") {
    if (chance(0.78)) return randint(0, 3)
    return randint(20, 23)
  }
  if (topic === "music") {
    // Music: bias to evening and late.
    return chance(0.6) ? randint(20, 23) : (chance(0.5) ? randint(0, 2) : randint(15, 18))
  }
  if (topic === "coding" || topic === "learning") {
    // Coding/learning: bias to evening + lunch.
    return chance(0.6) ? randint(19, 23) : (chance(0.5) ? randint(12, 14) : randint(8, 11))
  }
  if (topic === "vlog" || topic === "craft") {
    return chance(0.6) ? randint(10, 14) : randint(17, 21)
  }
  if (topic === "news") {
    return chance(0.7) ? randint(7, 9) : randint(17, 19)
  }
  // Default daytime + evening.
  return chance(0.5) ? randint(11, 16) : randint(18, 22)
}

const events = []

// 1) Build a base distribution of events across the span.
const base = TARGET_COUNT - 60 // leave 60 for binges + repeats
for (let i = 0; i < base; i++) {
  const ch = pick(CHANNELS)
  const titleBase = pick(ch.titles)
  // Random day in span, slight density bumps near "vacation" weeks.
  let dayOffset = Math.floor(rand() * SPAN_DAYS)
  // Bump density around two notional vacation windows (around days 110 and 280).
  if (chance(0.18)) dayOffset = 100 + randint(0, 18)
  if (chance(0.18)) dayOffset = 270 + randint(0, 14)
  const hour = pickHour(ch.topic)
  const minute = randint(0, 59)
  const second = randint(0, 59)
  const ts = END_MS - dayOffset * dayMs() + hour * 3_600_000 + minute * 60_000 + second * 1000
  events.push({ ch, title: titleBase, ts })
}

// 2) Inject 4 binge sessions (one per quarter): 6–8 same-channel videos within 30 min gaps.
function addBinge(centerDayOffset, channel, hourStart) {
  const count = randint(6, 8)
  let cursor = END_MS - centerDayOffset * dayMs() + hourStart * 3_600_000 + randint(0, 14) * 60_000
  const titles = channel.titles
  for (let i = 0; i < count; i++) {
    const title = titles[(i + randint(0, titles.length - 1)) % titles.length]
    events.push({ ch: channel, title, ts: cursor })
    cursor += randint(8, 28) * 60_000 // 8–28 min gaps so the cluster groups
  }
}
const bingeChannels = [
  CHANNELS.find(c => c.name === "Indie Sliver"),
  CHANNELS.find(c => c.name === "Spice Drawer"),
  CHANNELS.find(c => c.name === "Mezzanine Tape"),
  CHANNELS.find(c => c.name === "Backslash Burrito"),
]
addBinge(360, bingeChannels[0], 21)
addBinge(220, bingeChannels[1], 19)
addBinge(95,  bingeChannels[2], 22)
addBinge(28,  bingeChannels[3], 20)

// 3) Inject repeat-watch DNA: pick 4 videos and watch each 3–4 times spread over the span.
const REPEAT_VIDS = [
  { ch: CHANNELS.find(c => c.name === "Lofi Buoy"),       title: "1 hour of soft piano for the late shift", count: 4 },
  { ch: CHANNELS.find(c => c.name === "Mongoose Garage"), title: "Building a tiny database in 200 lines",   count: 3 },
  { ch: CHANNELS.find(c => c.name === "Spice Drawer"),    title: "Beans and rice, but on purpose",          count: 3 },
  { ch: CHANNELS.find(c => c.name === "Atlas Monthly"),   title: "Why every world map is wrong (in a useful way)", count: 3 },
]
for (const v of REPEAT_VIDS) {
  const id = fakeVideoId()
  for (let i = 0; i < v.count; i++) {
    const dayOffset = Math.floor(rand() * SPAN_DAYS)
    const hour = pickHour(v.ch.topic)
    const ts = END_MS - dayOffset * dayMs() + hour * 3_600_000 + randint(0, 59) * 60_000
    events.push({ ch: v.ch, title: v.title, ts, fixedId: id })
  }
}

// 4) Sort newest-first to match Takeout default ordering.
events.sort((a, b) => b.ts - a.ts)

// ----------------------------------------------------------------------------
// Materialize as Takeout JSON entries.
// ----------------------------------------------------------------------------

const out = []
for (const e of events) {
  const id = e.fixedId || fakeVideoId()
  const iso = new Date(e.ts).toISOString()
  out.push({
    header: "YouTube",
    title: "Watched " + e.title,
    titleUrl: "https://www.youtube.com/watch?v=" + id,
    subtitles: [{
      name: e.ch.name,
      url: "https://www.youtube.com/channel/" + e.ch.id,
    }],
    time: iso,
    products: ["YouTube"],
    activityControls: ["YouTube watch history"],
  })
}

// 5) Inject one "removed video" entry — Takeout actually emits this when the
//    video is gone. We dump it near the middle of the timeline.
{
  const ts = END_MS - 200 * dayMs() + 21 * 3_600_000
  out.push({
    header: "YouTube",
    title: "Watched a video that has been removed",
    time: new Date(ts).toISOString(),
    products: ["YouTube"],
    activityControls: ["YouTube watch history"],
  })
}

// 6) Inject one entry from a "channel without subtitles" — also a legit shape.
{
  const ts = END_MS - 50 * dayMs() + 13 * 3_600_000
  out.push({
    header: "YouTube",
    title: "Watched a private video",
    time: new Date(ts).toISOString(),
    products: ["YouTube"],
    activityControls: ["YouTube watch history"],
  })
}

// Re-sort the final list newest-first (Takeout convention).
out.sort((a, b) => Date.parse(b.time) - Date.parse(a.time))

await fs.mkdir(path.dirname(OUT), { recursive: true })
await fs.writeFile(OUT, JSON.stringify(out, null, 2) + "\n", "utf8")

console.log("Wrote " + OUT + " (" + out.length + " entries)")
