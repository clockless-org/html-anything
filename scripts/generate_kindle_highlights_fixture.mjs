#!/usr/bin/env node
/**
 * Deterministic synthetic-data generator for the Kindle highlights
 * example. Produces a realistic-shaped `My Clippings.txt` covering:
 *
 *  - 6 fake books with fake authors (one with no author metadata)
 *  - ~85 clippings: highlights, notes, bookmarks
 *  - duplicate-extension pattern: a couple of highlights that the
 *    reader extended (Kindle re-saves the longer version, so the
 *    file ends up with two near-identical records at the same loc)
 *  - notes attached to highlights (same loc, within 5 minutes)
 *  - a few bookmarks with no body text
 *  - one book with bookmarks only
 *  - a non-English (Korean) clipping to exercise the lang fallback
 *  - both English-month dates ("Wednesday, March 15, 2023 9:42:15 PM")
 *    and the older "Loc. 345-347 | Added on …" form
 *
 * Privacy: every title, author, and quote is wholly invented prose —
 * no real book passages, no real author names. Quote text is short
 * (5–25 words) and hand-crafted to read like plausible self-help /
 * non-fiction / fiction excerpts without paraphrasing real works.
 *
 * Seeded mulberry32 RNG for reproducibility — re-running this script
 * gives the same file.
 *
 * Usage:
 *   node scripts/generate_kindle_highlights_fixture.mjs > examples/kindle-highlights/input.txt
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const SEED = 0x4b696e64  // "Kind"
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "examples/kindle-highlights/input.txt")

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
function randint(lo, hi) { return Math.floor(rand() * (hi - lo + 1)) + lo }
function pick(arr) { return arr[Math.floor(rand() * arr.length)] }
function chance(p) { return rand() < p }

// ---------------------------------------------------------------------------
// Fake books
// ---------------------------------------------------------------------------

const BOOKS = [
  {
    title: "The Habit of Attention",
    author: "Jia Mwangi",
    pages: 248,
    locStart: 100,
    themes: ["attention", "focus", "habit", "morning", "ritual", "noticing", "practice", "patience", "stillness", "rhythm"],
    style: "self-help",
  },
  {
    title: "Small Engines, Long Roads",
    author: "Aleksandr Volkov",
    pages: 312,
    locStart: 220,
    themes: ["movement", "engine", "road", "patience", "repair", "weather", "memory", "father", "rust", "season"],
    style: "memoir",
  },
  {
    title: "A Quiet Country",
    author: "Maeve Tindall",
    pages: 196,
    locStart: 80,
    themes: ["countryside", "river", "language", "silence", "neighbor", "harvest", "family", "house", "winter", "sound"],
    style: "fiction",
  },
  {
    title: "Notes on Cities",
    author: "Hanan Boutros",
    pages: 184,
    locStart: 60,
    themes: ["city", "transit", "stranger", "balcony", "market", "neighborhood", "noise", "sidewalk", "bakery", "evening"],
    style: "essay",
  },
  {
    title: "How to Read the Tide",
    author: "Mira Salonen",
    pages: 224,
    locStart: 140,
    themes: ["tide", "current", "boat", "harbor", "fisherman", "cold", "rope", "knot", "weather", "stillness"],
    style: "non-fiction",
  },
  {
    // Author intentionally missing — exercises the no-author branch.
    title: "Field Notes — Volume Three",
    author: null,
    pages: 0,            // No real pagination
    locStart: 50,
    themes: ["forest", "moss", "trail", "owl", "fern", "creek", "moonlight", "snow", "lichen", "cold"],
    style: "field-journal",
  },
]

// Hand-written invented sentences keyed by (style, theme-bucket). Each
// is short and obviously made up — no real-book paraphrasing.
const SENTENCES = {
  "self-help": [
    "Attention is the soft tissue of will; it tears easily and heals on its own time.",
    "A morning ritual works when it is small enough to survive a bad night.",
    "Focus is not a skill you discover, it is a skill you keep showing up for.",
    "The fastest way to ruin a habit is to make it a punishment.",
    "Practice trains the patience that talent assumes you already have.",
    "Stillness is not the absence of movement; it is movement that has agreed on a direction.",
    "Noticing what you avoid is most of the work of changing it.",
    "If a routine cannot survive your worst day, it will not save your best one.",
    "Rhythm is what you are left with when motivation has gone home.",
    "Most habits are not broken — they are slowly outvoted.",
  ],
  "memoir": [
    "My father fixed engines the way other men told stories — slowly, and with the same hand.",
    "There is a kind of road that returns the favor; you keep driving it until it remembers you.",
    "We measured the year by which weather had broken us last.",
    "Rust is patient. It does not argue. It just waits for you to come back to the part you ignored.",
    "Memory is the only mile we ever drive twice.",
    "The garage smelled like winter and gasoline; that combination still means home to me.",
    "He never said he was proud, only that the engine sounded right.",
    "Long roads teach you that arriving is a kind of weather, not a kind of place.",
    "We repaired what we could and named what we couldn't.",
    "Every town we slept in had a different shade of evening, and the same cheap coffee.",
  ],
  "fiction": [
    "The river at the back of the house had not changed in any of the languages of the village.",
    "Winter came in by the door, like a neighbor who had been told to stop knocking.",
    "She listened to the silence between the cousins as if it were a contract.",
    "The harvest season pulled the family into the same rooms it had always pulled them into.",
    "Sound carried across the field the way rumor carries across a small town — unevenly and on purpose.",
    "He spoke as though every sentence were a window he had just unstuck.",
    "The house had three kinds of quiet, and none of them were peace.",
    "Years later, she still flinched at the word 'home' the way one flinches at an old joke.",
    "The orchard was a polite excuse for them to stand near each other.",
    "When her grandmother sang, the kitchen widened for a moment, and everyone pretended not to notice.",
  ],
  "essay": [
    "Cities reveal themselves at the moment a stranger asks for directions and the answer takes too long.",
    "Every sidewalk is a lecture on how a neighborhood is allowed to live.",
    "The bakery at the corner is the most accurate map of the block.",
    "Transit teaches the city to its commuters in fragments, like an unreliable narrator.",
    "What we call noise is mostly other people insisting on being included.",
    "A balcony is a city resident's smallest country.",
    "The market does not lie — but it does change the subject.",
    "Walking is the only honest review a city ever receives.",
    "Evening light is the time when a neighborhood stops performing for itself.",
    "Cities die on Mondays and resurrect on Thursdays, in approximately that order.",
  ],
  "non-fiction": [
    "A tide is not a measurement; it is an agreement with the moon, renewed twice a day.",
    "You learn the harbor by the order in which the boats come back.",
    "The cold of the early shift is a different cold than the cold at noon, and the rope knows the difference.",
    "Most knots are slower than they look — that is the whole reason they work.",
    "Currents do not care about your schedule, but they will tolerate it if you ask politely.",
    "The first thing a fisherman learns is that the sea is older than your plan.",
    "Stillness on the water is rarely stillness; it is usually disagreement that has not yet arrived.",
    "Wind is weather pretending to be advice.",
    "A boat trains its owner more than any owner trains a boat.",
    "Small craft survive on the discipline of paying attention to small problems first.",
  ],
  "field-journal": [
    "The forest hides its bookkeeping in the moss along the north side of every trunk.",
    "Owl call at 4:12 — second of three. The third never came, which means the fourth definitely will.",
    "Fern unfurling on the trail like a slow argument.",
    "The creek has rerouted itself two feet east since spring; nothing else has the courage.",
    "Moonlight on snow at 11pm — bright enough to read by, if your reading is patience.",
    "Lichen patch on the cedar is wider this year. Probably nothing. Probably everything.",
    "Track in the soft earth — heel narrow, no claw mark — fox, almost certainly.",
    "Cold tonight has a different smell than cold last week. Drier. The forest is rearranging.",
    "The trail is a sentence the forest never finishes.",
    "Counted seven kinds of green before noon and stopped because the eighth would have been showing off.",
  ],
}

// Notes the reader writes for themselves — short, second-person.
const NOTES = [
  "Use this in the Tuesday talk.",
  "Compare to chapter 4.",
  "Push back — feels too neat.",
  "Possibly the spine of the whole book.",
  "Quote in the Q3 review.",
  "Re-read in spring.",
  "Send to Mira.",
  "Remember to verify the source.",
  "Use this when writing the foreword.",
  "Also see chapter 7.",
  "Link to the essay on attention.",
  "This is what I was trying to say last week.",
  "Sit with this.",
  "Yes — but the second half is weaker.",
  "Borrow the structure, not the conclusion.",
]

// One non-Latin clipping (Korean) to exercise lang detection.
const NON_LATIN_BOOK = {
  title: "주의의 리듬",
  author: "이지원",
  pages: 0,
  locStart: 30,
  themes: [],
  style: "self-help",
}
const NON_LATIN_QUOTES = [
  "주의는 의지의 부드러운 살결과 같아서, 쉽게 찢어지고 스스로의 시간으로 회복된다.",
  "아침 의식은 작아야 살아남고, 살아남아야 마침내 일이 된다.",
  "리듬은 동기가 떠난 자리에 남는 것이다.",
]

// ---------------------------------------------------------------------------
// Date generator
// ---------------------------------------------------------------------------

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

function isoDate(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d))
}

function fmtDate(date, hour, minute, second) {
  const dow = DAYS_OF_WEEK[date.getUTCDay()]
  const month = MONTHS[date.getUTCMonth()]
  const day = date.getUTCDate()
  const year = date.getUTCFullYear()
  let h12 = hour % 12
  if (h12 === 0) h12 = 12
  const ap = hour < 12 ? "AM" : "PM"
  return `${dow}, ${month} ${day}, ${year} ${h12}:${String(minute).padStart(2,"0")}:${String(second).padStart(2,"0")} ${ap}`
}

// ---------------------------------------------------------------------------
// Build the file
// ---------------------------------------------------------------------------

function pickQuote(book, used) {
  const pool = SENTENCES[book.style] || SENTENCES["non-fiction"]
  // Don't repeat the same line within a single book session, but allow
  // it across books — Kindle clippings overlap in real exports.
  for (let attempt = 0; attempt < 8; attempt++) {
    const q = pick(pool)
    if (!used.has(q)) { used.add(q); return q }
  }
  return pick(pool)
}

function noteFor(theme) {
  // Cheap thematic match: pick a note that mentions the same theme,
  // else a generic one.
  return pick(NOTES)
}

function buildBookSession(book, startDate, endDate, count, idCursor) {
  // Span clippings across a window of days. Most days mid-window have
  // 2–4 clippings; bookend days are quieter.
  const records = []
  const usedQuotes = new Set()
  const totalDays = Math.max(1, Math.floor((endDate - startDate) / 86400000))
  for (let i = 0; i < count; i++) {
    const dayOffset = Math.floor(rand() * (totalDays + 1))
    const d = new Date(startDate.getTime() + dayOffset * 86400000)
    // Sunday/Saturday morning bias.
    const dow = d.getUTCDay()
    let hour
    if (dow === 0 || dow === 6) hour = randint(8, 11)
    else if (chance(0.15)) hour = randint(22, 23)
    else hour = chance(0.5) ? randint(7, 9) : randint(20, 22)
    const minute = randint(0, 59)
    const second = randint(0, 59)
    const loc = book.locStart + i * randint(35, 110) + randint(0, 12)
    const locEnd = loc + randint(2, 14)
    const page = book.pages > 0 ? Math.max(1, Math.min(book.pages, Math.round((loc - book.locStart) / 18) + 5)) : null
    let kind = "Highlight"
    const roll = rand()
    if (roll < 0.83) kind = "Highlight"
    else if (roll < 0.94) kind = "Note"
    else kind = "Bookmark"
    let body = ""
    if (kind === "Highlight") body = pickQuote(book, usedQuotes)
    else if (kind === "Note") body = noteFor()
    else body = "" // bookmark
    records.push({
      idx: idCursor + records.length,
      book,
      kind,
      loc,
      locEnd,
      page,
      d, hour, minute, second,
      body,
    })
  }
  return records
}

function emitRecord(rec, useOldFormat) {
  const header = rec.book.author ? `${rec.book.title} (${rec.book.author})` : rec.book.title
  let meta
  if (useOldFormat) {
    // Older firmware: "- Highlight Loc. 345-347 | Added on Wednesday, March 15, 2023 9:42:15 PM"
    meta = `- ${rec.kind} Loc. ${rec.loc}-${rec.locEnd} | Added on ${fmtDate(rec.d, rec.hour, rec.minute, rec.second)}`
  } else {
    const pageBit = rec.page != null ? `on page ${rec.page} | ` : ""
    meta = `- Your ${rec.kind} ${pageBit}location ${rec.loc}-${rec.locEnd} | Added on ${fmtDate(rec.d, rec.hour, rec.minute, rec.second)}`
  }
  return `${header}\n${meta}\n\n${rec.body}\n==========`
}

// ---------------------------------------------------------------------------
// Compose
// ---------------------------------------------------------------------------

const sessions = [
  // Habit of Attention — read across Mar–May 2023, dense Sunday mornings
  { book: BOOKS[0], from: isoDate(2023, 3, 4),  to: isoDate(2023, 5, 21), count: 22, oldFormat: false },
  // Small Engines — read Sep–Nov 2023, evening read
  { book: BOOKS[1], from: isoDate(2023, 9, 11), to: isoDate(2023,11, 26), count: 16, oldFormat: false },
  // A Quiet Country — read Jan–Feb 2024, weekend bias
  { book: BOOKS[2], from: isoDate(2024, 1, 14), to: isoDate(2024, 2, 25), count: 13, oldFormat: false },
  // Notes on Cities — read May 2024, holiday cluster
  { book: BOOKS[3], from: isoDate(2024, 5, 11), to: isoDate(2024, 5, 27), count: 11, oldFormat: false },
  // How to Read the Tide — Sep 2024, a few Notes attached
  { book: BOOKS[4], from: isoDate(2024, 9, 8),  to: isoDate(2024,10,  6), count: 14, oldFormat: false },
  // Field Notes Vol 3 — Jan–Feb 2025, no author + older format
  { book: BOOKS[5], from: isoDate(2025, 1, 19), to: isoDate(2025, 2, 16), count: 10, oldFormat: true },
]

let cursor = 1
const allRecords = []
for (const s of sessions) {
  const recs = buildBookSession(s.book, s.from, s.to, s.count, cursor)
  cursor += recs.length
  for (const r of recs) {
    r.oldFormat = s.oldFormat
    allRecords.push(r)
  }
}

// Inject one duplicate-extension pair: the user re-saved a longer
// version of a highlight a minute later at the same location.
const dupSource = allRecords.find(r => r.book.title === "The Habit of Attention" && r.kind === "Highlight")
if (dupSource) {
  const longer = {
    ...dupSource,
    idx: cursor++,
    d: new Date(dupSource.d.getTime() + 75 * 1000), // 1m15s later
    body: dupSource.body + " It is the only debt the future never collects.",
  }
  allRecords.push(longer)
}

// Inject 2 notes attached to highlights (same loc, +90 seconds).
let attached = 0
for (const r of allRecords.slice()) {
  if (attached >= 2) break
  if (r.kind !== "Highlight") continue
  if (r.book.title !== "How to Read the Tide" && r.book.title !== "Notes on Cities") continue
  const noteRec = {
    ...r,
    idx: cursor++,
    kind: "Note",
    d: new Date(r.d.getTime() + 90 * 1000),
    body: noteFor(),
  }
  allRecords.push(noteRec)
  attached += 1
}

// One book with bookmarks-only: a short reference the reader saved
// pages of without highlighting.
const bookmarksOnly = {
  title: "Pocket Field Reference",
  author: "Calla Reyes",
  pages: 96,
  locStart: 10,
  themes: [],
  style: "non-fiction",
}
for (let i = 0; i < 4; i++) {
  const d = isoDate(2025, 3, 4 + i * 2)
  const loc = bookmarksOnly.locStart + i * randint(60, 140)
  allRecords.push({
    idx: cursor++,
    book: bookmarksOnly,
    kind: "Bookmark",
    loc, locEnd: loc + randint(0, 4),
    page: bookmarksOnly.pages > 0 ? randint(8, 80) : null,
    d, hour: randint(7, 21), minute: randint(0, 59), second: randint(0, 59),
    body: "",
    oldFormat: false,
  })
}

// One non-Latin highlight to exercise the lang detector.
{
  const d = isoDate(2025, 4, 12)
  for (let i = 0; i < 3; i++) {
    allRecords.push({
      idx: cursor++,
      book: NON_LATIN_BOOK,
      kind: "Highlight",
      loc: NON_LATIN_BOOK.locStart + i * randint(40, 90),
      locEnd: NON_LATIN_BOOK.locStart + i * randint(40, 90) + randint(2, 8),
      page: null,
      d, hour: randint(8, 22), minute: randint(0, 59), second: randint(0, 59),
      body: NON_LATIN_QUOTES[i] || NON_LATIN_QUOTES[0],
      oldFormat: false,
    })
  }
}

// Sort chronologically (Kindle appends in clipping order, which is
// chronological).
allRecords.sort((a, b) => a.d.getTime() - b.d.getTime() || a.idx - b.idx)

const text = allRecords.map(r => emitRecord(r, r.oldFormat)).join("\n") + "\n"

await fs.mkdir(path.dirname(OUT), { recursive: true })
await fs.writeFile(OUT, text, "utf8")
console.error(`wrote ${OUT} (${allRecords.length} records, ${(text.length / 1024).toFixed(1)} KB)`)
