import * as fs from "node:fs/promises"
import * as path from "node:path"

const OUT_DIR = path.resolve("examples/wechat-couple")
const INPUT = path.join(OUT_DIR, "input.csv")
const OUTPUT = path.join(OUT_DIR, "output.html")

const senders = ["Partner A", "Partner B"]
const start = new Date(2024, 0, 1)
const dayCount = 731
const rng = mulberry32(20260509)

const stopwords = new Set(`
the and you your yours me my mine we our ours they them their that this there here what when where why how for with from have has had will would could should just really very also then than but not are was were been being can cant dont okay ok yeah yes lol haha lmao im youre its ill ive id lets about still like into over under after before again because maybe actually today tomorrow yesterday tonight morning night
`.trim().split(/\s+/))

const positiveWords = [
  "love", "miss", "cute", "happy", "thanks", "thank", "goodnight", "morning",
  "kiss", "hug", "together", "excited", "proud", "sweet", "cozy", "perfect",
  "favorite", "beautiful", "safe", "home",
]

const negativeWords = [
  "sad", "angry", "upset", "tired", "sorry", "stress", "stressed", "anxious",
  "worried", "hurt", "fight", "cry", "lonely", "hard", "busy",
]

const relationshipTerms = new Set([
  "love", "miss", "goodnight", "morning", "babe", "baby", "cute", "date",
  "dinner", "kiss", "hug", "together", "home", "sorry", "safe", "late",
  "wait", "call", "talk", "repair", "quiet", "fight", "sleep",
])

const profiles = {
  [senders[0]]: {
    shortRate: 0.56,
    questionRate: 0.36,
    typoRate: 0.035,
    burstRate: 0.46,
    mediaRate: 0.065,
    habits: ["omg", "wait", "lol", "pls", "i swear", "no because"],
    short: ["?", "wait", "ah", "omg", "lol", "nooo", "tired", "look", "arrived", "where are you", "eat what", "fine", "not funny", "miss you"],
  },
  [senders[1]]: {
    shortRate: 0.24,
    questionRate: 0.18,
    typoRate: 0.012,
    burstRate: 0.22,
    mediaRate: 0.04,
    habits: ["ok", "one sec", "i'll check", "don't rush", "my bad", "heading out"],
    short: ["ok", "sure", "got it", "one sec", "on my way", "meeting", "saw it", "my bad", "eat first", "don't rush", "home", "later"],
  },
}

const topicLines = {
  food: {
    a: ["what are we eating", "i want noodles", "don't buy milk, we still have some", "i bought coffee already", "can we not do spicy today", "i am starving"],
    b: ["rice or noodles", "i can cook eggs", "there is soup at home", "i ordered delivery", "don't get another iced drink", "i saved you some"],
  },
  work: {
    a: ["my manager moved the meeting again", "i am drowning in slides", "today is so stupid", "i might be late after work", "i need to complain for five minutes", "presentation is finally done"],
    b: ["deploy ran late so i was stuck for a while", "code review is still going", "i have one more meeting before i can leave", "bug is fixed but i need to watch it", "i'll reply after standup, not ignoring you", "laptop is about to die so i'll call later"],
  },
  commute: {
    a: ["train is packed", "i missed the bus", "i am at the gate", "traffic is not moving", "send me the address again", "i'm downstairs"],
    b: ["i'm on line 2 and the train is crawling", "ten minutes if traffic behaves", "parking is impossible near your building", "wait near the lobby so i can find you", "i'll pick you up after this last call", "train is delayed again, sorry"],
  },
  plans: {
    a: ["are we still going tomorrow", "you booked it right", "i can leave at seven", "don't forget your id", "movie or dinner first", "we need to decide"],
    b: ["reservation is 7:30", "tickets are in my email", "i can move it to sunday", "bring the charger", "let's do the later show", "i'll check the weather"],
  },
  chores: {
    a: ["laundry is still in the machine", "can you take the package", "trash day is tomorrow", "we need paper towels", "i paid the electricity bill", "the sink is weird again"],
    b: ["i'll take the package", "dishwasher is running", "i ordered detergent", "rent went through", "i'll clean it tonight", "leave the receipt on the table"],
  },
  sleep: {
    a: ["i'm so sleepy", "wake me up at eight", "don't let me nap", "goodnight", "i can't sleep", "call me for two minutes"],
    b: ["sleep first", "alarm set", "goodnight", "close your laptop", "i'll call after shower", "you need rest"],
  },
  conflict: {
    a: ["you disappeared again", "i was waiting", "why didn't you say anything", "that felt bad", "you always say one sec", "i don't want to guess"],
    b: ["i know, sorry, i should have sent one message", "meeting ran over and i handled it badly", "i wasn't ignoring you, but i get why it felt like that", "i should have texted before disappearing", "can we talk later when i can actually focus", "i hear you, i'm not trying to make excuses"],
  },
  repair: {
    a: ["i don't want to fight", "i just needed you to tell me", "okay, i understand now", "can we reset", "i'm sorry for snapping", "come home safe"],
    b: ["i'm sorry too, next time i'll say it earlier", "next time i'll say it earlier instead of vanishing", "let's talk after dinner when we're both calmer", "i care, i'm just bad at texting during work", "not trying to dismiss you, i was overloaded", "we're okay, i don't want this to sit overnight"],
  },
  affection: {
    a: ["miss you a little", "you looked cute today", "i saved this meme for you", "come here", "i like us", "goodnight babe"],
    b: ["miss you too", "proud of you", "that was cute", "home safe, babe", "i like our life", "goodnight"],
  },
  family: {
    a: ["my mom asked about sunday", "your sister texted me", "family dinner got moved", "dad is being dramatic again", "should i bring fruit", "they asked if you are coming"],
    b: ["mom said saturday works", "bring nothing, seriously", "i'll call them later", "family chat is chaos", "we can leave early", "i'll handle it"],
  },
  money: {
    a: ["how much was dinner", "i transferred you", "why is delivery so expensive", "we should stop buying coffee", "split this one?", "i forgot to pay you back"],
    b: ["got the transfer", "i paid already", "don't worry about it", "send me half later", "budget says no more takeout", "receipt is in the bag"],
  },
}

const dayTypes = {
  normal: { label: "ordinary workday", range: [35, 92], mood: "flat", weights: { food: 18, work: 22, commute: 14, plans: 10, chores: 10, sleep: 10, affection: 5, family: 4, money: 3, conflict: 2, repair: 2 } },
  busy: { label: "busy low-contact day", range: [5, 28], mood: "distracted", weights: { work: 34, commute: 14, food: 13, sleep: 13, plans: 6, chores: 5, affection: 3, conflict: 5, repair: 2, money: 2, family: 3 } },
  date: { label: "date or meet-up day", range: [12, 46], mood: "offline together", weights: { plans: 28, commute: 20, food: 18, affection: 8, money: 8, sleep: 6, chores: 4, work: 4, family: 2, repair: 2 } },
  conflict: { label: "small argument", range: [88, 220], mood: "tense then repair", weights: { conflict: 36, repair: 20, sleep: 8, plans: 8, food: 7, work: 6, commute: 5, affection: 4, chores: 3, money: 3 } },
  cold: { label: "quiet or cold day", range: [0, 10], mood: "quiet", weights: { work: 22, sleep: 20, conflict: 15, food: 12, commute: 10, repair: 8, plans: 6, affection: 2, chores: 3, money: 2 } },
  distance: { label: "distance / travel day", range: [64, 176], mood: "checking in", weights: { commute: 24, plans: 16, affection: 14, sleep: 13, food: 11, work: 8, family: 5, repair: 4, money: 3, conflict: 2 } },
  weekend: { label: "weekend errands", range: [24, 96], mood: "logistics", weights: { chores: 22, food: 18, plans: 18, family: 12, commute: 8, money: 7, affection: 5, sleep: 5, work: 2, repair: 2, conflict: 1 } },
}

function mulberry32(seed) {
  return function rand() {
    let t = seed += 0x6d2b79f5
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function choice(arr) {
  return arr[Math.floor(rng() * arr.length)]
}

function weightedChoice(entries) {
  const pairs = Array.isArray(entries) ? entries : Object.entries(entries)
  const total = pairs.reduce((sum, pair) => sum + pair[1], 0)
  let roll = rng() * total
  for (const [value, weight] of pairs) {
    roll -= weight
    if (roll <= 0) return value
  }
  return pairs.at(-1)?.[0]
}

function randInt(min, max) {
  return Math.floor(min + rng() * (max - min + 1))
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

function pad(n) {
  return String(n).padStart(2, "0")
}

function dateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function tsString(d) {
  return `${dateKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function monthIndex(d) {
  return (d.getFullYear() - start.getFullYear()) * 12 + d.getMonth()
}

function makeDayPlan(day, d) {
  const mmdd = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const weekend = d.getDay() === 0 || d.getDay() === 6
  let type = weightedChoice({
    normal: weekend ? 28 : 55,
    busy: weekend ? 6 : 17,
    date: weekend ? 18 : 7,
    conflict: 7,
    cold: 4,
    distance: 6,
    weekend: weekend ? 30 : 4,
  })

  if (["02-14", "09-21", "12-24", "12-31"].includes(mmdd)) type = rng() < 0.68 ? "date" : "distance"
  if (day >= 414 && day <= 445 && rng() < 0.45) type = "cold"
  if (day >= 520 && day <= 548 && rng() < 0.48) type = "distance"
  if (day % 97 === 26 && rng() < 0.8) type = "conflict"

  const config = dayTypes[type]
  let count = randInt(config.range[0], config.range[1])
  if (type === "conflict" && d.getDay() >= 1 && d.getDay() <= 4) count += randInt(20, 55)
  if (type === "distance") count += randInt(0, 32)
  if (type === "normal") count += Math.round(Math.sin(day / 23) * 12)
  if (count > 0) count = Math.round(count * 1.12)
  count = clamp(count, 0, 240)

  const eventBank = {
    normal: ["workday check-ins", "food decisions", "late-night decompression"],
    busy: ["slow replies", "meeting blocks", "short practical updates"],
    date: ["where to meet", "transport timing", "offline together"],
    conflict: ["reply delay", "hurt feelings", "repair talk"],
    cold: ["few messages", "unanswered question", "late explanation"],
    distance: ["travel updates", "voice notes", "goodnight check-in"],
    weekend: ["errands", "family logistics", "takeout debate"],
  }

  return { date: dateKey(d), type, label: config.label, mood: config.mood, count, events: eventBank[type], weights: config.weights }
}

function sessionWindows(type) {
  const common = [
    { start: 8, end: 9.5, weight: 12 },
    { start: 12, end: 13.5, weight: 18 },
    { start: 18, end: 20, weight: 26 },
    { start: 22, end: 25, weight: 44 },
  ]
  if (type === "busy") return [
    { start: 8.2, end: 8.8, weight: 9 },
    { start: 12.3, end: 13, weight: 21 },
    { start: 20.5, end: 24, weight: 70 },
  ]
  if (type === "date") return [
    { start: 9, end: 11, weight: 16 },
    { start: 14, end: 17, weight: 22 },
    { start: 18, end: 19.5, weight: 20 },
    { start: 23, end: 24.8, weight: 42 },
  ]
  if (type === "conflict") return [
    { start: 8, end: 9.2, weight: 9 },
    { start: 12, end: 13.3, weight: 12 },
    { start: 17, end: 19, weight: 18 },
    { start: 21, end: 25.6, weight: 61 },
  ]
  if (type === "cold") return [
    { start: 9, end: 9.5, weight: 15 },
    { start: 18, end: 18.6, weight: 20 },
    { start: 23, end: 23.8, weight: 65 },
  ]
  if (type === "distance") return [
    { start: 7, end: 9.2, weight: 18 },
    { start: 12, end: 14, weight: 20 },
    { start: 19, end: 21.5, weight: 24 },
    { start: 22, end: 26, weight: 38 },
  ]
  return common
}

function timestampFor(d, type, index) {
  const win = weightedChoice(sessionWindows(type).map(w => [w, w.weight]))
  const rawHour = win.start + rng() * (win.end - win.start)
  const dayOffset = rawHour >= 24 ? 1 : 0
  const hour = Math.floor(rawHour % 24)
  const minute = Math.floor((rawHour - Math.floor(rawHour)) * 60)
  const burstSeconds = index % randInt(3, 9) === 0 ? randInt(0, 55) : randInt(0, 12)
  const ts = new Date(d.getFullYear(), d.getMonth(), d.getDate() + dayOffset, hour, minute, burstSeconds)
  return ts
}

function senderFor(plan, previousSender) {
  let aShare = {
    normal: 0.54,
    busy: 0.47,
    date: 0.50,
    conflict: 0.63,
    cold: 0.58,
    distance: 0.55,
    weekend: 0.52,
  }[plan.type] ?? 0.52
  aShare += rng() * 0.08 - 0.04

  if (previousSender) {
    const profile = profiles[previousSender]
    if (rng() < profile.burstRate) return previousSender
    if (rng() < 0.66) return previousSender === senders[0] ? senders[1] : senders[0]
  }
  return rng() < aShare ? senders[0] : senders[1]
}

function messageType(sender, topic, plan) {
  const profile = profiles[sender]
  if (topic === "money" && rng() < 0.035) return "transfer"
  if ((topic === "affection" || topic === "repair") && rng() < 0.06) return "sticker"
  if ((plan.type === "distance" || topic === "conflict") && rng() < 0.045) return "voice"
  if ((topic === "food" || topic === "commute" || topic === "family") && rng() < profile.mediaRate) return "image"
  if (topic === "conflict" && rng() < 0.018) return "deleted"
  return "text"
}

function typedText(type) {
  if (type === "image") return "[image]"
  if (type === "sticker") return "[sticker]"
  if (type === "voice") return `[voice ${randInt(4, 38)}s]`
  if (type === "transfer") return `[transfer $${choice(["8.50", "12.00", "18.20", "26.00", "52.00"])}]`
  if (type === "deleted") return "message deleted"
  return ""
}

function maybeTypo(text, sender) {
  if (rng() > profiles[sender].typoRate || text.length < 5) return text
  return text.replace(/\bthe\b/, "teh").replace(/\breally\b/, "realy").replace(/\bminutes\b/, "mins")
}

function messageText(sender, topic, plan, hour) {
  const profile = profiles[sender]
  const side = sender === senders[0] ? "a" : "b"
  const night = hour >= 22 || hour <= 1
  const morning = hour >= 7 && hour <= 9

  if (morning && rng() < 0.12) return sender === senders[0] ? "awake?" : "morning"
  if (night && rng() < 0.16) return sender === senders[0] ? "are you sleeping" : "sleep soon"
  if (rng() < profile.shortRate) return maybeTypo(choice(profile.short), sender)

  let line = choice(topicLines[topic]?.[side] || topicLines.food[side])
  if (rng() < 0.18) line = `${choice(profile.habits)} ${line}`
  if (rng() < profile.questionRate && !/[?]$/.test(line)) line += "?"
  if (plan.type === "cold" && rng() < 0.18) line = choice(["ok", "later", "i saw it", "not now", "fine"])
  if (plan.type === "date" && rng() < 0.08) line = choice(["i'm here", "where are you", "outside", "come down", "i got us a table"])
  if (plan.type === "conflict" && rng() < 0.12) line = choice(topicLines.conflict[side])
  return maybeTypo(line, sender)
}

function csvEscape(s) {
  const text = String(s ?? "")
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function makeMessages() {
  const messages = []
  const plans = []
  let prevSender = ""
  const endExclusive = new Date(start)
  endExclusive.setDate(start.getDate() + dayCount)
  for (let day = 0; day < dayCount; day++) {
    const d = new Date(start)
    d.setDate(start.getDate() + day)
    const plan = makeDayPlan(day, d)
    plans.push(plan)
    const n = plan.count
    for (let i = 0; i < n; i++) {
      const ts = timestampFor(d, plan.type, i)
      if (ts >= endExclusive) ts.setTime(endExclusive.getTime() - randInt(60, 7200) * 1000)
      const sender = senderFor(plan, prevSender)
      prevSender = sender
      const topic = weightedChoice(plan.weights)
      const type = messageType(sender, topic, plan)
      const text = type === "text" ? messageText(sender, topic, plan, ts.getHours()) : typedText(type)
      const emotion = topic === "conflict" ? "frustrated" : topic === "repair" ? "repairing" : topic === "affection" ? "warm" : plan.mood
      messages.push({ ts, sender, text, type, topic, emotion, dayType: plan.type })
    }
  }
  messages.sort((a, b) => a.ts - b.ts)
  messages.dayPlans = plans
  return messages
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9']+/g, " ")
    .split(/\s+/)
    .map(t => t.replace(/^'+|'+$/g, ""))
    .filter(t => t.length >= 3 && !stopwords.has(t))
}

function sentimentScore(text) {
  const lower = text.toLowerCase()
  let positive = 0
  let negative = 0
  for (const word of positiveWords) if (lower.includes(word)) positive++
  for (const word of negativeWords) if (lower.includes(word)) negative++
  return { positive, negative, score: positive - negative }
}

function topEntries(map, n) {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, n)
}

function summarizeNumbers(values) {
  if (!values.length) return { count: 0, medianMinutes: null, averageMinutes: null, p80Minutes: null }
  const sorted = values.slice().sort((a, b) => a - b)
  const at = q => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))]
  return {
    count: values.length,
    medianMinutes: +at(0.5).toFixed(1),
    averageMinutes: +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1),
    p80Minutes: +at(0.8).toFixed(1),
  }
}

function compactSender(sender) {
  return sender === senders[0] ? "A" : "B"
}

function buildRepresentativeThreads(messages) {
  const specs = [
    { title: "Most ordinary daily loop", type: "normal", topic: "food", note: "A lot of the relationship is logistics, not confession." },
    { title: "A small misunderstanding", type: "conflict", topic: "conflict", note: "The spike is mostly waiting, explaining, and repair." },
    { title: "Offline date day", type: "date", topic: "plans", note: "Meeting in person lowers the message count but raises logistics." },
    { title: "Quiet day with a late repair", type: "cold", topic: "repair", note: "Silence is visible as a data shape, not a verdict." },
  ]
  const byDate = new Map()
  for (const m of messages) {
    const date = dateKey(m.ts)
    if (!byDate.has(date)) byDate.set(date, [])
    byDate.get(date).push(m)
  }
  const threads = []
  for (const spec of specs) {
    const days = Array.from(byDate.entries())
      .map(([date, rows]) => ({ date, rows }))
      .filter(d => d.rows.some(m => m.dayType === spec.type) && d.rows.some(m => m.topic === spec.topic || m.dayType === spec.type))
    const day = days[Math.floor(days.length * 0.48)] || days[0]
    if (!day) continue
    const pivot = Math.max(0, day.rows.findIndex(m => m.topic === spec.topic))
    const startAt = Math.max(0, pivot - 1)
    const rows = day.rows.slice(startAt, startAt + 6).map(m => ({
      time: `${pad(m.ts.getHours())}:${pad(m.ts.getMinutes())}`,
      sender: compactSender(m.sender),
      text: m.text,
      type: m.type,
      topic: m.topic,
      emotion: m.emotion,
    }))
    if (rows.length) threads.push({ ...spec, date: day.date, messages: rows })
  }
  return threads
}

function analyze(messages) {
  const byDate = new Map()
  const byMonth = new Map()
  const bySender = new Map(senders.map(s => [s, 0]))
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0, bySender: Object.fromEntries(senders.map(s => [s, 0])) }))
  const wordTotals = new Map()
  const senderWordCounts = new Map(senders.map(s => [s, new Map()]))
  const senderTokenTotals = new Map(senders.map(s => [s, 0]))
  const relationshipCounts = new Map()
  const replyGaps = new Map(senders.map(s => [s, []]))
  const initiations = new Map(senders.map(s => [s, 0]))
  const endings = new Map(senders.map(s => [s, 0]))
  const topicCounts = new Map()
  const typeCounts = new Map()
  const emotionCounts = new Map()
  const dayTypeCounts = new Map()
  const style = new Map(senders.map(s => [s, { messages: 0, words: 0, short: 0, questions: 0, media: 0, bursts: 0 }]))
  let unansweredQuestions = 0
  let questionCount = 0
  let lateNightMessages = 0
  let shortMessages = 0
  let longestGapMs = 0

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    const date = dateKey(m.ts)
    const month = date.slice(0, 7)
    const hour = m.ts.getHours()
    const words = m.text.trim().split(/\s+/).filter(Boolean)
    const isShort = m.type === "text" && (m.text.length <= 14 || words.length <= 2)
    const isMedia = m.type !== "text"
    byDate.set(date, (byDate.get(date) || 0) + 1)
    bySender.set(m.sender, (bySender.get(m.sender) || 0) + 1)
    hourly[hour].count++
    hourly[hour].bySender[m.sender]++
    topicCounts.set(m.topic || "unknown", (topicCounts.get(m.topic || "unknown") || 0) + 1)
    typeCounts.set(m.type || "text", (typeCounts.get(m.type || "text") || 0) + 1)
    emotionCounts.set(m.emotion || "neutral", (emotionCounts.get(m.emotion || "neutral") || 0) + 1)
    dayTypeCounts.set(m.dayType || "unknown", (dayTypeCounts.get(m.dayType || "unknown") || 0) + 1)
    if (hour >= 22 || hour <= 1) lateNightMessages++
    if (isShort) shortMessages++
    const styleRow = style.get(m.sender)
    styleRow.messages++
    styleRow.words += words.length
    if (isShort) styleRow.short++
    if (/\?+$/.test(m.text.trim())) styleRow.questions++
    if (isMedia) styleRow.media++
    const monthStats = byMonth.get(month) || {
      month,
      total: 0,
      bySender: Object.fromEntries(senders.map(s => [s, 0])),
      activeDays: new Set(),
      sentiment: { positive: 0, negative: 0, score: 0 },
    }
    monthStats.total++
    monthStats.bySender[m.sender]++
    monthStats.activeDays.add(date)
    const sent = sentimentScore(m.text)
    monthStats.sentiment.positive += sent.positive
    monthStats.sentiment.negative += sent.negative
    monthStats.sentiment.score += sent.score
    byMonth.set(month, monthStats)

    for (const token of tokenize(m.text)) {
      wordTotals.set(token, (wordTotals.get(token) || 0) + 1)
      const own = senderWordCounts.get(m.sender)
      own.set(token, (own.get(token) || 0) + 1)
      senderTokenTotals.set(m.sender, senderTokenTotals.get(m.sender) + 1)
      if (relationshipTerms.has(token)) relationshipCounts.set(token, (relationshipCounts.get(token) || 0) + 1)
    }

    if (/\?+$/.test(m.text.trim())) {
      questionCount++
      let answered = false
      for (let j = i + 1; j < messages.length; j++) {
        const next = messages[j]
        const gap = next.ts - m.ts
        if (gap > 6 * 60 * 60 * 1000) break
        if (next.sender !== m.sender && next.type === "text") {
          answered = true
          break
        }
      }
      if (!answered) unansweredQuestions++
    }

    const prev = messages[i - 1]
    if (prev) {
      const gap = m.ts - prev.ts
      longestGapMs = Math.max(longestGapMs, gap)
      if (prev.sender !== m.sender && gap > 0 && gap <= 7 * 24 * 60 * 60 * 1000) replyGaps.get(m.sender).push(gap / 60000)
      if (prev.sender === m.sender && gap > 0 && gap <= 4 * 60 * 1000) style.get(m.sender).bursts++
      if (gap >= 4 * 60 * 60 * 1000) {
        initiations.set(m.sender, initiations.get(m.sender) + 1)
        endings.set(prev.sender, endings.get(prev.sender) + 1)
      }
    } else {
      initiations.set(m.sender, initiations.get(m.sender) + 1)
    }
  }
  if (messages.length) endings.set(messages.at(-1).sender, endings.get(messages.at(-1).sender) + 1)

  const calendarHeatmap = Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({
    date,
    count,
    month: date.slice(0, 7),
    year: date.slice(0, 4),
    dow: new Date(`${date}T00:00:00`).getDay(),
    dayType: messages.find(m => dateKey(m.ts) === date)?.dayType || "unknown",
  }))
  const monthlyStats = Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month)).map(m => ({
    month: m.month,
    total: m.total,
    activeDays: m.activeDays.size,
    bySender: m.bySender,
    senders: senders.map(sender => {
      const sent = m.bySender[sender] || 0
      const received = m.total - sent
      return { sender, sent, received, share: sent / m.total, enthusiasmIndex: (sent - received) / m.total }
    }),
    sentiment: m.sentiment,
  }))

  const wordSpecificity = {}
  const specificitySmoothing = 24
  const vocabSize = Math.max(1, wordTotals.size)
  for (const sender of senders) {
    const own = senderWordCounts.get(sender)
    const ownTotal = senderTokenTotals.get(sender) || 1
    const rows = []
    for (const [word, count] of own.entries()) {
      if (count < 18) continue
      const otherSender = senders.find(s => s !== sender)
      const otherCount = senderWordCounts.get(otherSender).get(word) || 0
      const ownRate = (count + specificitySmoothing) / (ownTotal + specificitySmoothing * vocabSize)
      const otherRate = (otherCount + specificitySmoothing) / ((senderTokenTotals.get(otherSender) || 1) + specificitySmoothing * vocabSize)
      const specificity = (ownRate - otherRate) / ((ownRate + otherRate) || 1)
      if (specificity > 0.08) rows.push({ word, count, specificity, share: ownRate })
    }
    const ranked = rows.sort((a, b) => b.specificity - a.specificity || b.count - a.count).slice(0, 34)
    const maxCount = Math.max(1, ...ranked.map(r => r.count))
    wordSpecificity[sender] = ranked.map((r, index) => {
      const countNorm = Math.log1p(r.count) / Math.log1p(maxCount)
      const rankNorm = ranked.length <= 1 ? 1 : 1 - index / (ranked.length - 1)
      const score = Math.max(0.12, Math.min(0.91, 0.22 + r.specificity * 0.38 + countNorm * 0.18 + rankNorm * 0.12))
      return { ...r, score: +score.toFixed(3) }
    })
  }

  const contributionWords = topEntries(wordTotals, 70).map(([word, count]) => {
    const counts = Object.fromEntries(senders.map(s => [s, senderWordCounts.get(s).get(word) || 0]))
    const shares = Object.fromEntries(senders.map(s => [s, counts[s] / count]))
    const dominantSender = senders.slice().sort((a, b) => counts[b] - counts[a])[0]
    return { word, count, bySender: counts, shares, dominantSender, contributionRating: shares[dominantSender] }
  })

  const sentimentTimeline = monthlyStats.map(m => ({
    month: m.month,
    positive: m.sentiment.positive,
    negative: m.sentiment.negative,
    score: m.sentiment.score,
    normalizedScore: m.sentiment.score / m.total,
  }))

  const dayPlans = messages.dayPlans || []
  const activeDays = calendarHeatmap.length
  const sortedDays = calendarHeatmap.slice().sort((a, b) => a.count - b.count)
  const replyStatsBySender = Object.fromEntries(Array.from(replyGaps.entries()).map(([sender, values]) => [sender, summarizeNumbers(values)]))
  const styleStats = Object.fromEntries(Array.from(style.entries()).map(([sender, row]) => [sender, {
    avgWords: +(row.words / Math.max(1, row.messages)).toFixed(1),
    shortShare: +(row.short / Math.max(1, row.messages)).toFixed(3),
    questionShare: +(row.questions / Math.max(1, row.messages)).toFixed(3),
    mediaShare: +(row.media / Math.max(1, row.messages)).toFixed(3),
    burstShare: +(row.bursts / Math.max(1, row.messages)).toFixed(3),
  }]))

  return {
    senders: senders.map(sender => ({ sender, count: bySender.get(sender), firstTs: tsString(messages.find(m => m.sender === sender).ts), lastTs: tsString(messages.slice().reverse().find(m => m.sender === sender).ts) })),
    messagesPerSender: Object.fromEntries(bySender.entries()),
    messageCount: messages.length,
    senderCount: senders.length,
    dateRange: `${dateKey(messages[0].ts)} -> ${dateKey(messages[messages.length - 1].ts)}`,
    activeDayRatio: calendarHeatmap.length / dayCount,
    averageDailyMessages: +(messages.length / Math.max(1, activeDays)).toFixed(1),
    years: Array.from(new Set(calendarHeatmap.map(d => Number(d.year)))).sort((a, b) => a - b).map(year => ({ year })),
    calendarHeatmap,
    dayProfiles: dayPlans.map(p => ({ date: p.date, type: p.type, label: p.label, mood: p.mood, count: p.count, events: p.events })),
    hourlyDistribution: hourly,
    monthlyStats,
    topWords: topEntries(wordTotals, 120).map(([word, count]) => ({ word, count })),
    wordSpecificity,
    contributionWords,
    sentimentTimeline,
    relationshipKeywords: topEntries(relationshipCounts, 40).map(([word, count]) => ({ word, count })),
    topicCounts: topEntries(topicCounts, 20).map(([topic, count]) => ({ topic, count })),
    typeCounts: topEntries(typeCounts, 10).map(([type, count]) => ({ type, count })),
    emotionCounts: topEntries(emotionCounts, 10).map(([emotion, count]) => ({ emotion, count })),
    dayTypeCounts: topEntries(dayTypeCounts, 10).map(([type, count]) => ({ type, count })),
    styleStats,
    interactionStats: {
      startersBySender: Object.fromEntries(initiations.entries()),
      endingsBySender: Object.fromEntries(endings.entries()),
      questionCount,
      unansweredQuestions,
      unansweredQuestionShare: +(unansweredQuestions / Math.max(1, questionCount)).toFixed(3),
      lateNightMessages,
      lateNightShare: +(lateNightMessages / Math.max(1, messages.length)).toFixed(3),
      shortMessages,
      shortMessageShare: +(shortMessages / Math.max(1, messages.length)).toFixed(3),
      quietDays: sortedDays.filter(d => d.count <= 10).length,
      conflictDays: dayPlans.filter(d => d.type === "conflict").length,
      dateDays: dayPlans.filter(d => d.type === "date").length,
    },
    representativeThreads: buildRepresentativeThreads(messages),
    replyStatsBySender,
    initiationsBySender: Object.fromEntries(initiations.entries()),
    busiestDay: calendarHeatmap.slice().sort((a, b) => b.count - a.count)[0],
    quietestDay: sortedDays[0],
    longestGapHours: +(longestGapMs / 3600000).toFixed(1),
  }
}

function svgBars(values, width = 360, height = 120, color = "#8db6ca") {
  const max = Math.max(1, ...values.map(v => v.count))
  const gap = 2
  const barW = (width - gap * (values.length - 1)) / values.length
  return `<svg viewBox="0 0 ${width} ${height}" role="img">${values.map((v, i) => {
    const h = Math.max(1, v.count / max * (height - 18))
    const x = i * (barW + gap)
    const y = height - h - 14
    return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" rx="1.8" fill="${color}" opacity="${0.35 + 0.65 * v.count / max}"><title>${v.label || v.date || v.month}: ${v.count}</title></rect>`
  }).join("")}</svg>`
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
}

function json(v) {
  return JSON.stringify(v).replace(/<\//g, "<\\/")
}

function buildHtml(analysis, fontCss = "") {
  const payload = analysis
  const range = analysis.dateRange.replace("->", "to")
  const activeDays = Math.round(analysis.activeDayRatio * dayCount)
  const busiest = analysis.busiestDay
  const topHour = analysis.hourlyDistribution.slice().sort((a, b) => b.count - a.count)[0]
  const senderSplit = analysis.senders.map((s, i) => `${i === 0 ? "A" : "B"} ${Math.round(s.count / analysis.messageCount * 100)}%`).join(" / ")
  const latestYear = analysis.years.at(-1)?.year ?? "all"
  const mediaItems = analysis.typeCounts.filter(d => d.type !== "text").reduce((sum, d) => sum + d.count, 0)
  const affectionCount = analysis.topicCounts.find(d => d.topic === "affection")?.count || 0

  return `<!doctype html>
<html lang="en" data-ha-style="love-romance-3d">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light">
<title>Couple chat - love romance 3D report</title>
<style>
${fontCss}
:root{--primary:#a03b00;--primary-2:#c94c00;--accent:#E8400D;--purple:#7b40e0;--bg:#fff8f6;--surface:#ffffff;--surface-low:#fbf2ef;--surface-mid:#f5ece9;--ink:#1e1b19;--body:#594138;--muted:#8d7166;--border:rgba(0,0,0,.06);--border-strong:rgba(0,0,0,.12);--rose:#d54b68;--rose-soft:#ffe2e8;--blue:#2c7894;--blue-soft:#dff3f7;--green:#10b981;--shadow-sm:0 1px 2px rgba(30,27,25,.04);--shadow-md:0 4px 12px rgba(30,27,25,.08);--shadow-lg:0 8px 24px rgba(30,27,25,.12);--shadow-accent:0 12px 32px rgba(160,59,0,.16);--headline:"Space Grotesk",ui-sans-serif,system-ui,sans-serif;--sans:Inter,"Plus Jakarta Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--mono:"SF Mono",Menlo,Consolas,monospace;--ease:cubic-bezier(.4,0,.2,1)}
*{box-sizing:border-box}html{scroll-behavior:smooth;color-scheme:light}body{margin:0;overflow-x:hidden;background:linear-gradient(135deg,rgba(201,76,0,.12) 0%,rgba(201,76,0,.04) 26%,transparent 52%),linear-gradient(315deg,rgba(123,64,224,.055) 0%,transparent 42%),linear-gradient(135deg,#fffaf8 0%,#fff3ef 38%,#f7ede9 72%,#f1e8e5 100%);color:var(--ink);font-family:var(--sans);line-height:1.55;-webkit-font-smoothing:antialiased}.shell,.hero,.hero-copy,.hero-panel,.metric-grid,.metric,.layout,.layout>*,.section,.chart-grid,.chart-grid>*,.two-up,.two-up>*,.words-layout,.words-layout>*,.bars,.bars>*,.mini-chart,.word-cloud,.word-panel,.insight{min-width:0}h1,h2,h3,p,strong{overflow-wrap:break-word}.shell{width:min(1220px,calc(100vw - 48px));margin:0 auto;padding:42px 0 80px}.nav button,.pill{min-height:34px;border:1px solid var(--border);border-radius:9999px;background:#fff;color:var(--body);padding:0 14px;font:700 12px/1 var(--sans);cursor:pointer;transition:transform .18s var(--ease),box-shadow .18s var(--ease),border-color .18s var(--ease),background .18s var(--ease)}.nav button:hover,.pill:hover{transform:translateY(-2px);border-color:#e1bfb2;box-shadow:var(--shadow-md)}.pill.active,.nav button.active{background:linear-gradient(135deg,#a03b00,#c94c00);color:#fff;border-color:transparent;box-shadow:0 8px 24px rgba(160,59,0,.15)}.hero{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(360px,.95fr);gap:28px;align-items:stretch;margin-bottom:28px}.hero-copy{padding:34px 0 18px}.eyebrow{font:800 12px/1 var(--sans);letter-spacing:.18em;text-transform:uppercase;color:var(--primary);margin:0 0 16px}.hero h1{margin:0;font:700 clamp(46px,7vw,90px)/.9 var(--headline);letter-spacing:-.045em;max-width:760px}.text-gradient{background:linear-gradient(135deg,#a03b00 0%,#7b40e0 100%);-webkit-background-clip:text;background-clip:text;color:transparent}.lede{max-width:690px;margin:24px 0 0;color:var(--body);font-size:18px;line-height:1.75}.hero-panel{border:1px solid var(--border);border-radius:28px;background:rgba(255,255,255,.62);box-shadow:var(--shadow-lg);padding:18px;backdrop-filter:blur(18px) saturate(1.35)}.metric-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.metric{min-height:112px;border:1px solid var(--border);border-radius:18px;background:#fff;padding:18px;box-shadow:var(--shadow-sm);transition:transform .18s var(--ease),box-shadow .18s var(--ease)}.metric:hover{transform:translateY(-4px);box-shadow:var(--shadow-md)}.metric .tag{font:800 11px/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}.metric strong{display:block;margin-top:16px;font:700 32px/.95 var(--headline);letter-spacing:-.04em}.metric span{display:block;margin-top:8px;color:var(--body);font-size:13px}.layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:24px;align-items:start}.insight{position:sticky;top:24px;border:1px solid var(--outline,rgba(0,0,0,.1));border-radius:22px;background:#fff;box-shadow:var(--shadow-md);padding:20px}.insight .mini{font:800 11px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--primary);margin-bottom:12px}.insight h2{margin:0 0 10px;font:700 22px/1.1 var(--headline);letter-spacing:-.025em}.insight p{margin:0;color:var(--body);font-size:14px}.insight dl{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 0 0}.insight dt{font:800 10px/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}.insight dd{margin:4px 0 0;font:700 18px/1 var(--headline);letter-spacing:-.02em}.section{margin:0 0 24px;padding:24px;border:1px solid var(--border);border-radius:22px;background:rgba(255,255,255,.78);box-shadow:var(--shadow-sm)}.section:hover{box-shadow:var(--shadow-md)}.section-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:18px}.section h2{margin:0;font:700 28px/1.05 var(--headline);letter-spacing:-.03em}.section p{margin:8px 0 0;color:var(--body)}.controls{display:flex;gap:8px;flex-wrap:wrap}.chart-grid{display:grid;grid-template-columns:minmax(270px,.68fr) minmax(0,1fr);gap:22px}.mini-chart{border:1px solid var(--border);border-radius:18px;background:#fff;padding:16px}.mini-chart h3,.card-title{margin:0 0 10px;font:700 15px/1.2 var(--headline);letter-spacing:-.01em}.mini-chart svg,.chart svg{width:100%;height:auto;display:block}.calendar-wrap{display:grid;grid-template-columns:1fr 1fr;gap:16px;overflow:auto;padding-bottom:4px}.year{min-width:310px}.year h3{margin:0 0 10px;font:700 18px/1 var(--headline);letter-spacing:-.02em}.months{display:grid;gap:7px}.month{display:grid;grid-template-columns:28px repeat(7,1fr);gap:2px;align-items:center}.month-name{font:800 9px/1 var(--sans);letter-spacing:.08em;color:var(--muted);text-align:right;padding-right:4px}.day{height:18px;min-width:18px;border:1px solid rgba(255,255,255,.7);border-radius:5px;background:#f8e6e0;color:#563b33;font:700 9px/1 var(--sans);cursor:pointer;transition:transform .15s var(--ease),outline-color .15s var(--ease)}.day:hover,.day.active{transform:scale(1.08);outline:2px solid var(--primary);outline-offset:1px}.spacer{visibility:hidden}.legend{display:flex;align-items:center;gap:8px;margin-top:12px;color:var(--muted);font:700 11px/1 var(--sans)}.gradient{width:140px;height:8px;border-radius:9999px;background:linear-gradient(90deg,#fff1eb,#ffb597,#c94c00)}.two-up{display:grid;grid-template-columns:1fr 1fr;gap:18px}.hour-callout{margin-top:14px;padding:16px 18px;border-radius:18px;background:linear-gradient(135deg,rgba(160,59,0,.1),rgba(123,64,224,.08));font:700 24px/1.1 var(--headline);letter-spacing:-.03em}.balance{display:grid;gap:8px}.balance-row{display:grid;grid-template-columns:72px 1fr 54px;gap:10px;align-items:center;font-size:12px}.track{height:12px;border-radius:9999px;background:#f5ece9;overflow:hidden}.fill{height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--rose),var(--blue))}.bubble-chart{display:grid;grid-template-columns:64px 72px 72px 1fr;gap:5px 12px;align-items:center}.bubble-chart .head{font:800 11px/1 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--muted);text-align:center}.bubble-chart .mon{font:700 12px/1 var(--sans);text-align:right;color:var(--body)}.bubble{border-radius:50%;margin:auto;border:1px solid currentColor;background:currentColor;opacity:.34}.words-layout{display:grid;grid-template-columns:minmax(0,1fr) 290px;gap:20px;align-items:start}.word-cloud{position:relative;min-height:310px;border:1px solid var(--border);border-radius:20px;background:#fff;overflow:hidden}.word-cloud button{position:absolute;border:0;background:transparent;font-family:var(--headline);font-weight:700;color:rgba(160,59,0,var(--a));transform:translate(-50%,-50%) rotate(var(--r));white-space:nowrap;cursor:pointer;transition:transform .18s var(--ease),color .18s var(--ease)}.word-cloud button:hover{color:var(--purple);transform:translate(-50%,-50%) rotate(var(--r)) scale(1.06)}.word-panel{border:1px solid var(--border);border-radius:20px;background:#fff;padding:18px;box-shadow:var(--shadow-sm)}.word-panel h3{margin:0 0 8px;font:700 22px/1.05 var(--headline);letter-spacing:-.025em}.word-panel p{font-size:13px}.bars{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px}.bar-svg text{font-family:var(--sans)}.mirror{overflow:auto}.mirror svg{min-width:900px}.keyword-cloud{display:flex;flex-wrap:wrap;gap:10px}.keyword-cloud button{border:1px solid var(--border);border-radius:9999px;background:#fff;padding:8px 12px;color:var(--primary);font:700 15px/1 var(--headline);letter-spacing:-.02em;cursor:pointer;transition:transform .18s var(--ease),box-shadow .18s var(--ease)}.keyword-cloud button.big{font-size:clamp(24px,4vw,50px);padding:12px 18px}.keyword-cloud button:hover{transform:translateY(-3px);box-shadow:var(--shadow-md)}.sentiment svg{width:100%;height:auto}.stat-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}.stat-card{border:1px solid var(--border);border-radius:18px;background:#fff;padding:16px;min-height:112px}.stat-card strong{display:block;font:700 30px/.95 var(--headline);letter-spacing:-.035em}.stat-card span{display:block;margin-top:10px;color:var(--body);font-size:13px}.hbar{display:grid;gap:10px}.hbar-row{display:grid;grid-template-columns:92px minmax(0,1fr) 70px;align-items:center;gap:12px;font-size:13px}.hbar-row b{color:var(--body)}.hbar-track{height:14px;border-radius:9999px;background:#f5ece9;overflow:hidden}.hbar-fill{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--rose),var(--blue))}.threads{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.thread{border:1px solid var(--border);border-radius:20px;background:#fff;padding:18px}.thread h3{margin:0;font:700 18px/1.1 var(--headline);letter-spacing:-.02em}.thread .note{margin:8px 0 14px;color:var(--body);font-size:13px}.msg{display:grid;grid-template-columns:34px 48px minmax(0,1fr);gap:10px;padding:7px 0;border-top:1px solid rgba(0,0,0,.05);font-size:13px}.msg:first-of-type{border-top:0}.msg .who{font:800 11px/1 var(--sans);color:var(--primary)}.msg .time{font:700 11px/1 var(--mono);color:var(--muted)}.foot{margin-top:34px;padding:18px 4px 0;border-top:1px solid var(--border);color:var(--muted);font-size:13px}.tip{position:fixed;pointer-events:none;background:#1e1b19;color:#fff;padding:9px 11px;border-radius:12px;font:700 12px/1.3 var(--sans);opacity:0;transform:translate(10px,10px);z-index:20;box-shadow:var(--shadow-lg)}@media(max-width:980px){.hero,.layout,.chart-grid,.two-up,.words-layout,.bars,.threads{grid-template-columns:1fr}.insight{position:relative;top:0;order:-1}.nav{display:none}.metric-grid{grid-template-columns:1fr 1fr}.calendar-wrap{grid-template-columns:1fr}.year{min-width:520px}.stat-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:640px){.shell{width:calc(100vw - 28px);max-width:calc(100vw - 28px);padding:24px 0 56px}.hero-copy{padding-top:10px}.hero h1{font-size:38px}.section h2{font-size:25px}.lede{font-size:16px}.metric-grid,.stat-grid{grid-template-columns:1fr}.metric strong{font-size:31px}.section{padding:18px;overflow:hidden}.section-head{display:block}.controls{margin-top:14px}.calendar-wrap{display:block;max-width:100%;overflow-x:auto}.year{width:520px;min-width:520px}.bubble-chart{overflow-x:auto}.hour-callout{font-size:22px}.bars{overflow-x:auto}.bar-svg{min-width:520px}.hbar-row{grid-template-columns:80px minmax(0,1fr) 52px}.msg{grid-template-columns:28px 42px minmax(0,1fr)}}@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
.tip.insight-tip{width:min(320px,calc(100vw - 32px));padding:16px 18px;border:1px solid var(--border);border-radius:18px;background:rgba(255,255,255,.96);color:var(--ink);box-shadow:0 18px 44px rgba(30,27,25,.18),0 3px 10px rgba(30,27,25,.08);backdrop-filter:blur(18px) saturate(1.2);transform:translate(0,0);font:400 14px/1.45 var(--sans)}.tip.insight-tip .mini{margin-bottom:10px;font:800 10px/1 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--primary)}.tip.insight-tip h2{margin:0 0 7px;font:700 20px/1.08 var(--headline);letter-spacing:-.025em}.tip.insight-tip p{margin:0;color:var(--body)}.tip.insight-tip dl{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0 0}.tip.insight-tip dt{font:800 10px/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}.tip.insight-tip dd{margin:4px 0 0;font:700 17px/1 var(--headline);letter-spacing:-.02em}
html[data-ha-style="love-romance-3d"]{--primary:#d9355d;--primary-2:#ff7d9c;--accent:#f04d72;--purple:#8f2b5d;--bg:#fff5f7;--surface:#fffafc;--surface-low:#fff0f4;--surface-mid:#f9dfe7;--ink:#29161c;--body:#663744;--muted:#906b75;--border:rgba(217,53,93,.16);--border-strong:rgba(217,53,93,.26);--rose:#f04d72;--rose-soft:#ffe2ea;--blue:#45a6b7;--blue-soft:#ddf6f8;--gold:#f4bd55;--shadow-sm:0 1px 2px rgba(93,20,43,.05);--shadow-md:0 9px 22px rgba(93,20,43,.10);--shadow-lg:0 18px 48px rgba(93,20,43,.14);--shadow-accent:0 20px 42px rgba(217,53,93,.22)}html[data-ha-style="love-romance-3d"] body{background:linear-gradient(120deg,rgba(240,77,114,.12),transparent 44%),linear-gradient(300deg,rgba(69,166,183,.10),transparent 45%),linear-gradient(rgba(217,53,93,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(217,53,93,.035) 1px,transparent 1px),#fff5f7;background-size:auto,auto,28px 28px,28px 28px,auto}html[data-ha-style="love-romance-3d"] .shell{padding-top:30px}.romance-3d-shell .hero{grid-template-columns:minmax(0,.92fr) minmax(390px,1.08fr);gap:30px;align-items:center}.romance-3d-shell .eyebrow{color:var(--primary);letter-spacing:.14em}.romance-3d-shell .hero h1{max-width:680px;letter-spacing:-.025em}.romance-3d-shell .text-gradient{background:linear-gradient(135deg,#d9355d 0%,#ff7d9c 46%,#45a6b7 100%);-webkit-background-clip:text;background-clip:text;color:transparent}.romance-3d-shell .hero-panel{position:relative;overflow:hidden;border-color:rgba(217,53,93,.18);border-radius:8px;background:linear-gradient(145deg,rgba(255,255,255,.92),rgba(255,239,244,.82));box-shadow:0 26px 60px rgba(93,20,43,.16),inset 0 1px 0 rgba(255,255,255,.9)}.romance-3d-shell .hero-panel:before{content:"";position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.55),transparent 36%,rgba(69,166,183,.06));pointer-events:none}.icon-stage{position:relative;z-index:1;display:grid;grid-template-columns:1.15fr .85fr .85fr;grid-template-rows:90px 78px;gap:12px;margin-bottom:16px}.memory-token{appearance:none;position:relative;border:1px solid rgba(255,255,255,.72);border-radius:26px;background:linear-gradient(145deg,#fff,#ffe1ea 54%,#ffc1d0);box-shadow:inset -10px -12px 18px rgba(134,23,58,.12),inset 10px 10px 18px rgba(255,255,255,.72),0 18px 32px rgba(217,53,93,.18);cursor:pointer;transition:transform .2s var(--ease),box-shadow .2s var(--ease),filter .2s var(--ease)}.memory-token:before{content:"";position:absolute;inset:10px auto auto 12px;width:28px;height:12px;border-radius:999px;background:rgba(255,255,255,.72);filter:blur(.2px);transform:rotate(-18deg)}.memory-token:after{content:"";position:absolute;left:18%;right:18%;bottom:-11px;height:15px;border-radius:50%;background:rgba(93,20,43,.16);filter:blur(8px)}.memory-token:hover,.memory-token:focus-visible{transform:translateY(-5px) rotate(var(--tilt,0deg));box-shadow:inset -10px -12px 18px rgba(134,23,58,.12),inset 10px 10px 18px rgba(255,255,255,.72),0 24px 42px rgba(217,53,93,.25);outline:2px solid rgba(69,166,183,.45);outline-offset:3px}.memory-token i{position:absolute;display:block}.token-heart{grid-row:span 2;--tilt:-3deg}.token-heart i{left:50%;top:50%;width:55px;height:55px;background:linear-gradient(135deg,#ff87a0,#f04d72 58%,#b72b4e);border-radius:13px;transform:translate(-50%,-42%) rotate(-45deg);box-shadow:inset -7px -9px 14px rgba(93,20,43,.18),inset 6px 5px 12px rgba(255,255,255,.45)}.token-heart i:before,.token-heart i:after{content:"";position:absolute;width:55px;height:55px;border-radius:50%;background:inherit}.token-heart i:before{left:0;top:-28px}.token-heart i:after{left:28px;top:0}.token-letter{--tilt:4deg;background:linear-gradient(145deg,#fffdf7,#ffe4c0 50%,#f4bd55)}.token-letter i{left:50%;top:52%;width:62px;height:42px;border-radius:8px;background:linear-gradient(145deg,#fff,#ffd8e1);transform:translate(-50%,-50%);box-shadow:inset -5px -7px 10px rgba(93,20,43,.10),0 8px 14px rgba(93,20,43,.13)}.token-letter i:before{content:"";position:absolute;inset:0;background:linear-gradient(145deg,transparent 48%,rgba(217,53,93,.22) 49% 51%,transparent 52%),linear-gradient(35deg,transparent 48%,rgba(217,53,93,.18) 49% 51%,transparent 52%);border-radius:inherit}.token-ring{--tilt:-5deg;background:linear-gradient(145deg,#fff,#e2f7fa 54%,#9adce5)}.token-ring i{left:50%;top:56%;width:48px;height:48px;border:10px solid #f4bd55;border-radius:50%;transform:translate(-50%,-50%);box-shadow:inset 0 0 0 3px rgba(255,255,255,.55),0 8px 16px rgba(88,55,10,.18)}.token-ring i:before{content:"";position:absolute;left:50%;top:-25px;width:28px;height:24px;background:linear-gradient(135deg,#fff,#bff4fb 48%,#45a6b7);clip-path:polygon(50% 0,100% 42%,50% 100%,0 42%);transform:translateX(-50%);filter:drop-shadow(0 5px 7px rgba(69,166,183,.26))}.token-chat{--tilt:5deg;background:linear-gradient(145deg,#fff,#ffe1ea 52%,#ff9bb2)}.token-chat i{left:50%;top:48%;width:68px;height:45px;border-radius:17px;background:linear-gradient(145deg,#fff,#ffebf0 44%,#ff8fab);transform:translate(-50%,-50%);box-shadow:inset -8px -8px 13px rgba(134,23,58,.12),0 9px 16px rgba(93,20,43,.14)}.token-chat i:before{content:"";position:absolute;left:16px;top:14px;width:9px;height:9px;border-radius:50%;background:#f04d72;box-shadow:16px 0 0 #f4bd55,32px 0 0 #45a6b7}.token-chat i:after{content:"";position:absolute;right:10px;bottom:-7px;border-width:9px 2px 0 13px;border-style:solid;border-color:#ff8fab transparent transparent transparent}.romance-3d-shell .metric,.romance-3d-shell .section,.romance-3d-shell .mini-chart,.romance-3d-shell .stat-card,.romance-3d-shell .thread,.romance-3d-shell .word-panel,.romance-3d-shell .word-cloud{border-radius:8px;border-color:var(--border);background:rgba(255,255,255,.86);box-shadow:0 10px 26px rgba(93,20,43,.075)}.romance-3d-shell .keepsake-metric{position:relative;overflow:hidden;background:linear-gradient(145deg,#fff,#fff4f7 58%,#ffe1ea)}.romance-3d-shell .keepsake-metric:after{content:"";position:absolute;right:-22px;top:-22px;width:70px;height:70px;border-radius:24px;background:linear-gradient(135deg,rgba(255,125,156,.34),rgba(69,166,183,.18));transform:rotate(18deg)}.romance-3d-shell .metric strong,.romance-3d-shell .stat-card strong{color:#29161c}.romance-3d-shell .pill{border-color:rgba(217,53,93,.18);background:#fff8fa}.romance-3d-shell .pill.active,.romance-3d-shell .nav button.active{background:linear-gradient(135deg,#f04d72,#b72b4e);box-shadow:0 12px 26px rgba(217,53,93,.18)}.romance-3d-shell .day{border-radius:9px;background:#ffe8ee;color:#6c2136}.romance-3d-shell .day:hover,.romance-3d-shell .day.active{outline-color:#45a6b7}.romance-3d-shell .gradient{background:linear-gradient(90deg,#fff2f6,#ff9bb2,#d9355d)}.romance-3d-shell .hour-callout{border-radius:8px;background:linear-gradient(135deg,rgba(240,77,114,.12),rgba(69,166,183,.10));color:#29161c}.romance-3d-shell .hbar-fill,.romance-3d-shell .fill{background:linear-gradient(90deg,#f04d72,#45a6b7)}.romance-3d-shell .bubble{box-shadow:inset -4px -5px 8px rgba(93,20,43,.12),inset 4px 3px 7px rgba(255,255,255,.5),0 8px 14px rgba(93,20,43,.12);opacity:.58}.romance-3d-shell .keyword-cloud button{background:linear-gradient(145deg,#fff,#fff0f4);border-color:rgba(217,53,93,.18);color:#b72b4e}.privacy-ribbon{border-top-color:rgba(217,53,93,.18);color:#7b535d}@media(max-width:980px){.romance-3d-shell .hero{grid-template-columns:1fr}.icon-stage{grid-template-columns:1fr 1fr 1fr;grid-template-rows:84px 76px}.token-heart{grid-row:auto}}@media(max-width:640px){.icon-stage{grid-template-columns:1fr 1fr;grid-template-rows:76px 76px}.memory-token{border-radius:20px}.romance-3d-shell .hero h1{font-size:38px}}
@keyframes loveFloat{0%,100%{transform:translateY(0) rotate(var(--r0,0deg)) scale(1)}50%{transform:translateY(-9px) rotate(var(--r1,4deg)) scale(1.035)}}@keyframes loveBreath{0%,100%{transform:translateY(0) scale(1);filter:saturate(1)}50%{transform:translateY(-4px) scale(1.035);filter:saturate(1.15)}}@keyframes loveSpin{to{transform:rotate(360deg)}}@keyframes loveWiggle{0%,100%{transform:rotate(var(--r0,-3deg)) translateY(0)}35%{transform:rotate(var(--r1,4deg)) translateY(-5px)}70%{transform:rotate(var(--r2,-1deg)) translateY(1px)}}@keyframes loveBlink{0%,100%{opacity:.45;filter:saturate(1)}50%{opacity:1;filter:saturate(1.25)}}@keyframes loveBar{0%,100%{filter:drop-shadow(0 0 0 rgba(240,77,114,0));opacity:.72}50%{filter:drop-shadow(0 8px 12px rgba(240,77,114,.20));opacity:1}}@keyframes loveSlide{0%{background-position:0 50%}100%{background-position:180% 50%}}@keyframes loveTextGlow{0%,100%{text-shadow:0 0 0 rgba(240,77,114,0);filter:saturate(1)}50%{text-shadow:0 8px 18px rgba(240,77,114,.18);filter:saturate(1.18)}}@keyframes loveCardBreath{0%,100%{transform:translateY(0);box-shadow:0 10px 26px rgba(93,20,43,.075)}50%{transform:translateY(-3px);box-shadow:0 14px 30px rgba(93,20,43,.105)}}.romance-3d-shell .playful-section{position:relative;overflow:hidden;isolation:isolate}.romance-3d-shell .playful-section.mirror{overflow:auto}.romance-3d-shell .playful-section>*{position:relative;z-index:1}.romance-3d-shell .playful-section:before,.romance-3d-shell .playful-section:after{content:"";position:absolute;pointer-events:none;z-index:0}.romance-3d-shell #reality:before{right:26px;top:22px;width:58px;height:54px;border-radius:18px;background:linear-gradient(145deg,#fff,#ffdce6 42%,#f04d72);clip-path:polygon(50% 92%,7% 52%,7% 23%,28% 8%,50% 26%,72% 8%,93% 23%,93% 52%);box-shadow:inset -8px -9px 16px rgba(93,20,43,.14),inset 8px 7px 12px rgba(255,255,255,.58),0 16px 22px rgba(217,53,93,.16);animation:loveBreath 4.8s ease-in-out infinite}.romance-3d-shell #reality:after{right:92px;top:82px;width:24px;height:24px;background:linear-gradient(145deg,#fff8d6,#f4bd55);clip-path:polygon(50% 0,62% 34%,98% 35%,69% 56%,80% 92%,50% 71%,20% 92%,31% 56%,2% 35%,38% 34%);filter:drop-shadow(0 8px 10px rgba(244,189,85,.28));animation:loveSpin 8s linear infinite}.romance-3d-shell .message-pulse:before{right:28px;top:24px;width:66px;height:46px;border-radius:18px;background:radial-gradient(circle at 24px 23px,#f04d72 0 4px,transparent 5px),radial-gradient(circle at 34px 23px,#f4bd55 0 4px,transparent 5px),radial-gradient(circle at 44px 23px,#45a6b7 0 4px,transparent 5px),linear-gradient(145deg,#fff,#ffe4ec 48%,#ff9db4);box-shadow:inset -8px -9px 14px rgba(93,20,43,.12),0 14px 22px rgba(217,53,93,.16);animation:loveWiggle 5.2s ease-in-out infinite}.romance-3d-shell .message-pulse:after{right:48px;top:83px;width:30px;height:12px;border:5px solid #ff9db4;border-top:0;border-left-color:transparent;border-radius:0 0 18px 18px;transform:rotate(-18deg);filter:drop-shadow(0 7px 8px rgba(217,53,93,.18));animation:loveBlink 2.8s ease-in-out infinite}.romance-3d-shell .soft-lane:before{right:30px;top:24px;width:54px;height:54px;border:10px solid #f4bd55;border-radius:50%;box-shadow:inset 0 0 0 3px rgba(255,255,255,.65),0 13px 20px rgba(88,55,10,.15);animation:loveSpin 9s linear infinite}.romance-3d-shell .soft-lane:after{right:42px;top:12px;width:30px;height:26px;background:linear-gradient(135deg,#fff,#c8f4fa 46%,#45a6b7);clip-path:polygon(50% 0,100% 42%,50% 100%,0 42%);filter:drop-shadow(0 8px 10px rgba(69,166,183,.25));animation:loveFloat 4.6s ease-in-out infinite;--r0:-4deg;--r1:7deg}.romance-3d-shell #topics:before{right:28px;top:24px;width:58px;height:52px;border-radius:12px;background:linear-gradient(90deg,transparent 40%,rgba(255,255,255,.64) 41% 59%,transparent 60%),linear-gradient(0deg,transparent 45%,rgba(183,43,78,.23) 46% 56%,transparent 57%),linear-gradient(145deg,#fff7fb,#ffb2c4 50%,#f04d72);box-shadow:inset -8px -10px 14px rgba(93,20,43,.13),0 15px 22px rgba(217,53,93,.16);animation:loveBreath 5.4s ease-in-out infinite}.romance-3d-shell #topics:after{right:87px;top:18px;width:32px;height:26px;border-radius:50% 50% 40% 40%;background:linear-gradient(145deg,#fff,#ffe4c0 48%,#f4bd55);clip-path:polygon(50% 0,68% 28%,100% 30%,74% 52%,82% 100%,50% 74%,18% 100%,26% 52%,0 30%,32% 28%);filter:drop-shadow(0 8px 9px rgba(244,189,85,.28));animation:loveSpin 7.8s linear infinite reverse}.romance-3d-shell #words:before{right:26px;top:24px;width:68px;height:48px;border-radius:18px;background:radial-gradient(circle at 25px 24px,#d9355d 0 4px,transparent 5px),radial-gradient(circle at 38px 24px,#f4bd55 0 4px,transparent 5px),radial-gradient(circle at 51px 24px,#45a6b7 0 4px,transparent 5px),linear-gradient(145deg,#fff,#ffeaf0 48%,#ff9eb6);box-shadow:inset -8px -9px 14px rgba(93,20,43,.12),0 15px 22px rgba(217,53,93,.15);animation:loveFloat 4.9s ease-in-out infinite;--r0:3deg;--r1:-5deg}.romance-3d-shell #words:after{right:54px;top:67px;border-width:13px 4px 0 18px;border-style:solid;border-color:#ff9eb6 transparent transparent transparent;filter:drop-shadow(0 7px 7px rgba(217,53,93,.15));animation:loveBlink 3.1s ease-in-out infinite}.romance-3d-shell .mirror:before{right:28px;top:24px;width:58px;height:58px;border:9px solid rgba(69,166,183,.72);border-right-color:#f04d72;border-bottom-color:#f4bd55;border-radius:50%;box-shadow:0 14px 22px rgba(69,166,183,.15);animation:loveSpin 10s linear infinite}.romance-3d-shell .mirror:after{right:43px;top:39px;width:27px;height:27px;border-radius:9px;background:linear-gradient(145deg,#fff,#ffdce6 48%,#f04d72);clip-path:polygon(50% 92%,7% 52%,7% 23%,28% 8%,50% 26%,72% 8%,93% 23%,93% 52%);filter:drop-shadow(0 8px 10px rgba(217,53,93,.2));animation:loveBreath 3.8s ease-in-out infinite}.romance-3d-shell #mood:before{right:28px;top:24px;width:60px;height:56px;border-radius:18px;background:linear-gradient(145deg,#fff,#ffdce5 38%,#f04d72);clip-path:polygon(50% 92%,7% 52%,7% 23%,28% 8%,50% 26%,72% 8%,93% 23%,93% 52%);box-shadow:inset -8px -10px 15px rgba(93,20,43,.13),0 16px 22px rgba(217,53,93,.18);animation:loveBreath 3.2s ease-in-out infinite}.romance-3d-shell #mood:after{right:94px;top:28px;width:28px;height:28px;background:linear-gradient(145deg,#fff8d6,#f4bd55);clip-path:polygon(50% 0,62% 34%,98% 35%,69% 56%,80% 92%,50% 71%,20% 92%,31% 56%,2% 35%,38% 34%);filter:drop-shadow(0 8px 10px rgba(244,189,85,.28));animation:loveSpin 6.8s linear infinite}.romance-3d-shell #snippets:before{right:26px;top:24px;width:72px;height:50px;border-radius:11px;background:linear-gradient(145deg,transparent 48%,rgba(217,53,93,.24) 49% 51%,transparent 52%),linear-gradient(35deg,transparent 48%,rgba(217,53,93,.20) 49% 51%,transparent 52%),linear-gradient(145deg,#fff,#ffe6ed 48%,#ff9eb6);box-shadow:inset -8px -9px 14px rgba(93,20,43,.12),0 14px 22px rgba(217,53,93,.15);animation:loveFloat 5s ease-in-out infinite;--r0:-2deg;--r1:4deg}.romance-3d-shell #snippets:after{right:52px;top:35px;width:24px;height:24px;border-radius:8px;background:linear-gradient(145deg,#fff7d7,#f4bd55);clip-path:polygon(50% 92%,7% 52%,7% 23%,28% 8%,50% 26%,72% 8%,93% 23%,93% 52%);filter:drop-shadow(0 7px 8px rgba(244,189,85,.22));animation:loveBreath 3.7s ease-in-out infinite}.romance-3d-shell .stat-card,.romance-3d-shell .thread,.romance-3d-shell .word-panel,.romance-3d-shell .mini-chart{animation:loveCardBreath 6.4s ease-in-out infinite}.romance-3d-shell .stat-card:nth-child(2n),.romance-3d-shell .thread:nth-child(2n),.romance-3d-shell .mini-chart:nth-child(2n){animation-delay:-2.1s}.romance-3d-shell .stat-card:nth-child(3n),.romance-3d-shell .mini-chart:nth-child(3n){animation-delay:-3.7s}.romance-3d-shell #monthlyBars rect,.romance-3d-shell #typeBars rect,.romance-3d-shell #sentiment rect,.romance-3d-shell .bar-svg .word-hit{transform-box:fill-box;transform-origin:center bottom;animation:loveBar 3.9s ease-in-out infinite}.romance-3d-shell #monthlyBars rect:nth-child(3n),.romance-3d-shell #typeBars rect:nth-child(2n),.romance-3d-shell #sentiment rect:nth-child(2n),.romance-3d-shell .bar-svg .word-hit:nth-of-type(3n){animation-delay:-1.4s}.romance-3d-shell #monthlyBars rect:nth-child(4n),.romance-3d-shell #sentiment rect:nth-child(3n){animation-delay:-2.6s}.romance-3d-shell .hbar-fill,.romance-3d-shell .fill{background-size:180% 100%;animation:loveSlide 4.8s linear infinite}.romance-3d-shell .bubble-chart .bubble{animation:loveBreath 4.1s ease-in-out infinite}.romance-3d-shell .bubble-chart .bubble:nth-child(3n){animation-delay:-1.2s}.romance-3d-shell .bubble-chart .bubble:nth-child(4n){animation-delay:-2.3s}.romance-3d-shell .word-cloud button{animation:loveTextGlow 5.5s ease-in-out infinite}.romance-3d-shell .word-cloud button:nth-child(3n){animation-delay:-1.7s}.romance-3d-shell .word-cloud button:nth-child(4n){animation-delay:-3s}.romance-3d-shell .keyword-cloud button{animation:loveBreath 5.8s ease-in-out infinite}.romance-3d-shell .keyword-cloud button:nth-child(2n){animation-delay:-1.8s}.romance-3d-shell .keyword-cloud button:nth-child(3n){animation-delay:-3.4s}.romance-3d-shell .day:not(.spacer):nth-child(7n){animation:loveBlink 4.6s ease-in-out infinite}.romance-3d-shell .day:not(.spacer):nth-child(11n){animation:loveBreath 5.2s ease-in-out infinite}.romance-3d-shell .msg .who{animation:loveTextGlow 4.4s ease-in-out infinite}.romance-3d-shell .msg:nth-child(2n) .who{animation-delay:-1.7s}@media(max-width:640px){.romance-3d-shell .playful-section:before{right:14px;top:14px;opacity:.62;transform:scale(.74)}.romance-3d-shell .playful-section:after{right:64px;top:22px;opacity:.58;transform:scale(.7)}.romance-3d-shell .stat-card,.romance-3d-shell .thread,.romance-3d-shell .word-panel,.romance-3d-shell .mini-chart{animation-duration:7.8s}}@media(prefers-reduced-motion:reduce){.romance-3d-shell *,.romance-3d-shell *:before,.romance-3d-shell *:after{animation:none!important;transition:none!important}}
.romance-3d-shell .keyword-cloud button{animation-name:loveTextGlow}.romance-3d-shell .day:not(.spacer):nth-child(11n){animation-name:loveBlink}@media(max-width:640px){.romance-3d-shell .word-cloud{display:flex;flex-wrap:wrap;align-content:flex-start;gap:8px;min-height:0;padding:14px}.romance-3d-shell .word-cloud button,.romance-3d-shell .word-cloud button:hover{position:static!important;transform:none!important;white-space:nowrap;border:1px solid rgba(217,53,93,.16);border-radius:9999px;background:linear-gradient(145deg,#fff,#fff0f4);padding:7px 10px;font:700 18px/1 var(--headline)!important;color:#b72b4e}.romance-3d-shell .word-cloud button:nth-child(-n+10){font-size:22px!important}}@media(prefers-reduced-motion:reduce){.romance-3d-shell *,.romance-3d-shell *:before,.romance-3d-shell *:after{animation:none!important;transition:none!important}}
</style>
</head>
<body>
<div class="shell romance-3d-shell">
  <header class="hero">
    <div class="hero-copy">
      <p class="eyebrow">love romance 3D report</p>
      <h1>Couple chat, <span class="text-gradient">real shape.</span></h1>
      <p class="lede">Two years of anonymized synthetic couple chat, generated from daily events instead of polished love notes: errands, slow replies, short texts, quiet days, small fights, and repair attempts.</p>
    </div>
    <div class="hero-panel">
      <div class="icon-stage romance-icon-stage" role="group" aria-label="Love and romance 3D insight shortcuts">
        <button class="memory-token token-heart" type="button" data-title="Messages" data-body="${analysis.messageCount.toLocaleString()} anonymized synthetic messages make up this rhythm report." data-stat-a="Messages" data-value-a="${analysis.messageCount.toLocaleString()}" data-stat-b="Range" data-value-b="${range}" aria-label="Open messages insight"><i></i></button>
        <button class="memory-token token-letter" type="button" data-title="Active days" data-body="${activeDays} days had at least one message, which is more useful than a romantic headline." data-stat-a="Active days" data-value-a="${activeDays}" data-stat-b="Span share" data-value-b="${Math.round(analysis.activeDayRatio * 100)}%" aria-label="Open active days insight"><i></i></button>
        <button class="memory-token token-ring" type="button" data-title="Sender split" data-body="Contribution is close, but rhythm and timing differ by partner." data-stat-a="Split" data-value-a="${senderSplit}" data-stat-b="Peak hour" data-value-b="${String(topHour.hour).padStart(2, "0")}:00" aria-label="Open sender split insight"><i></i></button>
        <button class="memory-token token-chat" type="button" data-title="Privacy first" data-body="This page favors aggregate patterns and tiny evidence snippets over raw message browsing." data-stat-a="Evidence" data-value-a="Anonymized" data-stat-b="Raw log" data-value-b="Not embedded" aria-label="Open privacy insight"><i></i></button>
      </div>
      <div class="metric-grid">
        <div class="metric keepsake-metric"><div class="tag">messages</div><strong>${analysis.messageCount.toLocaleString()}</strong><span>${range}</span></div>
        <div class="metric keepsake-metric"><div class="tag">active days</div><strong>${activeDays}</strong><span>${Math.round(analysis.activeDayRatio * 100)}% of the two-year span</span></div>
        <div class="metric keepsake-metric"><div class="tag">avg per active day</div><strong>${analysis.averageDailyMessages}</strong><span>Includes quiet and conflict days.</span></div>
        <div class="metric keepsake-metric"><div class="tag">longest silence</div><strong>${analysis.longestGapHours}h</strong><span>Gap between two messages.</span></div>
        <div class="metric keepsake-metric"><div class="tag">busiest day</div><strong>${busiest.count}</strong><span>${busiest.date}</span></div>
        <div class="metric keepsake-metric"><div class="tag">sender split</div><strong>${senderSplit}</strong><span>Close, but not behaviorally identical.</span></div>
      </div>
    </div>
  </header>

  <main>
    <div>
      <section class="section playful-section" id="reality">
        <div class="section-head">
          <div><p class="eyebrow">reality checks</p><h2>The unglamorous parts are the signal.</h2><p>This demo keeps sweet language restrained and gives weight to silence, logistics, media, short replies, and unfinished questions.</p></div>
        </div>
        <div class="stat-grid">
          <div class="stat-card"><strong>${Math.round(analysis.interactionStats.shortMessageShare * 100)}%</strong><span>short or one-word messages</span></div>
          <div class="stat-card"><strong>${Math.round(analysis.interactionStats.lateNightShare * 100)}%</strong><span>sent after 22:00 or before 02:00</span></div>
          <div class="stat-card"><strong>${analysis.interactionStats.unansweredQuestions}</strong><span>questions with no reply inside six hours</span></div>
          <div class="stat-card"><strong>${analysis.interactionStats.quietDays}</strong><span>days with ten messages or fewer</span></div>
          <div class="stat-card"><strong>${mediaItems.toLocaleString()}</strong><span>images, voice notes, stickers, transfers, deletes</span></div>
          <div class="stat-card"><strong>${Math.round(affectionCount / analysis.messageCount * 100)}%</strong><span>explicit affection-topic messages</span></div>
        </div>
      </section>

      <section class="section playful-section message-pulse" id="rhythm">
        <div class="section-head">
          <div><p class="eyebrow">frequency map</p><h2>When the conversation lit up.</h2><p>Click a day, hour, month, or word to open an aggregate insight tooltip.</p></div>
          <div class="controls" id="yearControls">
            <button class="pill" data-year="all">All years</button>
            ${analysis.years.map(year => `<button class="pill${year.year === latestYear ? " active" : ""}" data-year="${year.year}">${year.year}</button>`).join("")}
          </div>
        </div>
        <div class="chart-grid">
          <div>
            <div class="mini-chart"><h3>Monthly volume</h3><div id="monthlyBars"></div></div>
            <div class="mini-chart" style="margin-top:12px"><h3>Daily texture</h3><div id="dailyBars"></div><div class="legend"><span>low</span><div class="gradient"></div><span>${busiest.count}</span></div></div>
          </div>
          <div class="calendar-wrap" id="calendar"></div>
        </div>
      </section>

      <section class="section playful-section soft-lane" id="balance">
        <div class="section-head">
          <div><p class="eyebrow">timing and balance</p><h2>Late-night shape, starts, endings, and reply lag.</h2><p>Volume imbalance is not affection. It mostly reflects work, bursts, silence, and who starts a thread after a gap.</p></div>
          <div class="controls"><button class="pill active" data-balance="bubble">Bubbles</button><button class="pill" data-balance="share">Share bars</button></div>
        </div>
        <div class="two-up">
          <div class="chart"><h3 class="card-title">Hourly rhythm</h3><div id="hours"></div><div class="hour-callout">Peak hour: ${String(topHour.hour).padStart(2, "0")}:00.</div></div>
          <div class="chart"><h3 class="card-title">Monthly balance</h3><div id="enthusiasm"></div></div>
        </div>
      </section>

      <section class="section playful-section" id="topics">
        <div class="section-head">
          <div><p class="eyebrow">real life topics</p><h2>Mostly logistics, work, food, and waiting.</h2><p>The synthetic generator now starts from daily states and events, so the topic mix is intentionally less romantic.</p></div>
        </div>
        <div class="two-up">
          <div class="mini-chart"><h3>Topic mix</h3><div id="topicBars"></div></div>
          <div class="mini-chart"><h3>Message types</h3><div id="typeBars"></div></div>
        </div>
      </section>

      <section class="section playful-section" id="words">
        <div class="section-head">
          <div><p class="eyebrow">language fingerprints</p><h2>The words that became habits.</h2><p>Click a word to see who owns it and how strongly it shows up.</p></div>
          <div class="controls" id="senderControls"></div>
        </div>
        <div class="words-layout">
          <div class="word-cloud" id="cloud"></div>
          <aside class="word-panel" id="wordPanel"></aside>
        </div>
        <div class="bars" id="specificity"></div>
      </section>

      <section class="section playful-section mirror">
        <div class="section-head">
          <div><p class="eyebrow">shared words</p><h2>Contribution split, word by word.</h2><p>Each row shows the same word split across both anonymized partners. Red leans Partner A, blue leans Partner B.</p></div>
        </div>
        <div id="contribution"></div>
      </section>

      <section class="section playful-section" id="mood">
        <div class="section-head">
          <div><p class="eyebrow">mood and affection</p><h2>Soft signals, not verdicts.</h2><p>Lexicon sentiment is rough. It reads words, not the relationship, and it should never decide who loves whom more.</p></div>
        </div>
        <div class="two-up">
          <div class="sentiment" id="sentiment"></div>
          <div><h3 class="card-title">Relationship keywords</h3><div class="keyword-cloud" id="loveWords"></div></div>
        </div>
      </section>

      <section class="section playful-section evidence-card" id="snippets">
        <div class="section-head">
          <div><p class="eyebrow">evidence snippets</p><h2>Tiny anonymized examples behind the charts.</h2><p>Not a raw-message appendix: just a few synthetic excerpts that explain why the aggregate signals look the way they do.</p></div>
        </div>
        <div class="threads" id="threads"></div>
      </section>

      <div class="foot privacy-ribbon">Generated locally from ${analysis.messageCount.toLocaleString()} synthetic messages. This shareable report embeds aggregate metrics, not the raw message log. Treat real chat exports as private and anonymize before sharing.</div>
    </div>
  </main>
</div>
<div class="tip" id="tip"></div>
<script>const DATA=${json(payload)};</script>
<script>
const rose="#f04d72", blue="#45a6b7", orange="#d9355d";
const $=s=>document.querySelector(s);
const tip=$("#tip");
const fmt=new Intl.NumberFormat("en-US");
const senderA=DATA.senders[0]?.sender||"Partner A", senderB=DATA.senders[1]?.sender||"Partner B";
let yearFilter="${latestYear}", balanceMode="bubble", senderFilter="both";
let pinnedTip=false, lastPoint={x:window.innerWidth-360,y:120};
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function senderColor(sender){return sender===senderA?rose:blue}
function senderLabel(sender){return sender}
document.addEventListener("pointermove",e=>{lastPoint={x:e.clientX,y:e.clientY}});
document.addEventListener("pointerdown",e=>{lastPoint={x:e.clientX,y:e.clientY};if(!e.target.closest("[data-insight]")){pinnedTip=false;hideTip(true)}});
function placeTip(x,y){
  const margin=16,w=tip.offsetWidth||320,h=tip.offsetHeight||120;
  tip.style.left=Math.max(margin,Math.min(window.innerWidth-w-margin,x+14))+"px";
  tip.style.top=Math.max(margin,Math.min(window.innerHeight-h-margin,y+14))+"px";
}
function showTip(e,text){if(pinnedTip)return;tip.className="tip";tip.innerHTML=text;tip.style.opacity=1;placeTip(e.clientX,e.clientY)}
function hideTip(force=false){if(!pinnedTip||force)tip.style.opacity=0}
function monthLabel(m){const p=m.split("-");return new Date(Number(p[0]),Number(p[1])-1,1).toLocaleDateString("en-US",{month:"short",year:"2-digit"})}
function setInsight(title,body,stats){
  const pairs=Object.entries(stats||{}).slice(0,4).map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>').join("");
  pinnedTip=true;
  tip.className="tip insight-tip";
  tip.innerHTML='<div class="mini">selected insight</div><h2>'+esc(title)+'</h2><p>'+esc(body)+'</p>'+(pairs?'<dl>'+pairs+'</dl>':'');
  tip.style.opacity=1;
  placeTip(lastPoint.x,lastPoint.y);
  requestAnimationFrame(()=>placeTip(lastPoint.x,lastPoint.y));
}
function renderMiniBars(id,rows,color){
  const max=Math.max(1,...rows.map(r=>r.count)),w=360,h=112,p=8,g=3,bw=(w-p*2-g*(rows.length-1))/rows.length;
  $("#"+id).innerHTML='<svg viewBox="0 0 '+w+' '+h+'">'+rows.map((r,i)=>{const bh=Math.max(2,r.count/max*(h-22));const x=p+i*(bw+g);const y=h-bh-12;return '<rect x="'+x.toFixed(2)+'" y="'+y.toFixed(2)+'" width="'+bw.toFixed(2)+'" height="'+bh.toFixed(2)+'" rx="4" fill="'+color+'" opacity="'+(.25+.75*r.count/max).toFixed(2)+'"><title>'+esc(r.label||r.date||r.month)+' '+fmt.format(r.count)+'</title></rect>'}).join("")+'</svg>';
}
function renderSparkline(id,rows){
  const w=360,h=112,p=8,max=Math.max(1,...rows.map(r=>r.count)),step=(w-p*2)/Math.max(1,rows.length-1);
  const pts=rows.map((r,i)=>[p+i*step,h-14-r.count/max*(h-26)]);
  const line=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(2)+' '+p[1].toFixed(2)).join(" ");
  const area=line+' L '+(w-p)+' '+(h-12)+' L '+p+' '+(h-12)+' Z';
  const peaks=rows.slice().sort((a,b)=>b.count-a.count).slice(0,5).map(r=>{const i=rows.indexOf(r),pt=pts[i];return '<circle cx="'+pt[0].toFixed(2)+'" cy="'+pt[1].toFixed(2)+'" r="3.5" fill="#f04d72"><title>'+r.date+' '+fmt.format(r.count)+'</title></circle>'}).join("");
  $("#"+id).innerHTML='<svg viewBox="0 0 '+w+' '+h+'"><path d="'+area+'" fill="rgba(240,77,114,.12)"/><path d="'+line+'" fill="none" stroke="#f04d72" stroke-width="2.5" stroke-linecap="round"/>'+peaks+'</svg>';
}
function renderControls(){
  const yearChoices=["all",...DATA.years.map(y=>String(y.year))];
  $("#yearControls").innerHTML=yearChoices.map(y=>'<button class="pill '+(yearFilter===y?"active":"")+'" data-year="'+y+'">'+(y==="all"?"All years":y)+'</button>').join("");
  $("#yearControls").querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{yearFilter=b.dataset.year;renderCalendar();renderControls()}));
  $("#senderControls").innerHTML=["both",...DATA.senders.map(s=>s.sender)].map(s=>'<button class="pill '+(senderFilter===s?"active":"")+'" data-sender="'+s+'">'+(s==="both"?"Both":senderLabel(s))+'</button>').join("");
  $("#senderControls").querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{senderFilter=b.dataset.sender;renderSpecificity()}));
  document.querySelectorAll("[data-balance]").forEach(b=>b.addEventListener("click",()=>{balanceMode=b.dataset.balance;document.querySelectorAll("[data-balance]").forEach(x=>x.classList.toggle("active",x===b));renderEnthusiasm()}));
}
function renderCalendar(){
  const root=$("#calendar");
  const years=yearFilter==="all"?DATA.years.map(y=>y.year):[Number(yearFilter)];
  root.innerHTML=years.map(year=>{
    const months=Array.from({length:12},(_,m)=>String(year)+"-"+String(m+1).padStart(2,"0"));
    return '<div class="year"><h3>'+year+'</h3><div class="months">'+months.map(month=>{
      const days=DATA.calendarHeatmap.filter(d=>d.month===month);
      const blanks=days.length?new Date(days[0].date+"T00:00:00").getDay():0;
      const cells=Array.from({length:blanks},()=>'<div class="day spacer"></div>').join("")+days.map(d=>{
        const alpha=(0.07+0.93*d.count/DATA.busiestDay.count).toFixed(3);
        return '<button class="day" style="background:rgba(213,75,104,'+alpha+')" data-date="'+d.date+'" data-count="'+d.count+'">'+Number(d.date.slice(-2))+'</button>';
      }).join("");
      return '<div class="month"><div class="month-name">'+month.slice(5)+'</div>'+cells+'</div>';
    }).join("")+'</div></div>';
  }).join("");
  root.querySelectorAll(".day:not(.spacer)").forEach(el=>{
    el.addEventListener("mouseenter",e=>showTip(e,el.dataset.date+"<br>"+Number(el.dataset.count).toLocaleString()+" messages"));
    el.addEventListener("mouseleave",hideTip);
    el.addEventListener("click",()=>{root.querySelectorAll(".day").forEach(d=>d.classList.remove("active"));el.classList.add("active");setInsight(el.dataset.date,fmt.format(Number(el.dataset.count))+" messages landed on this day.",{"Messages":fmt.format(Number(el.dataset.count)),"Share of peak":Math.round(Number(el.dataset.count)/DATA.busiestDay.count*100)+"%","Year":el.dataset.date.slice(0,4)})});
  });
}
function renderHours(){
  const w=610,h=230,p=28,max=Math.max(...DATA.hourlyDistribution.map(d=>d.count));
  const bw=(w-p*2)/24;
  const bars=DATA.hourlyDistribution.map((d,i)=>{const bh=d.count/max*(h-p*2);const x=p+i*bw;const y=h-p-bh;return '<rect x="'+x+'" y="'+y+'" width="'+(bw-3)+'" height="'+bh+'" fill="'+blue+'" opacity=".55" data-hour="'+i+'" data-count="'+d.count+'"><title>'+i+':00 '+d.count+'</title></rect>'}).join("");
  const pts=DATA.hourlyDistribution.map((d,i)=>[p+i*bw+bw/2,h-p-d.count/max*(h-p*2)]).map(p=>p.join(",")).join(" ");
  $("#hours").innerHTML='<svg viewBox="0 0 '+w+' '+h+'"><g opacity=".25">'+[0,1,2,3,4].map(i=>'<line x1="'+p+'" x2="'+(w-p)+'" y1="'+(p+i*(h-p*2)/4)+'" y2="'+(p+i*(h-p*2)/4)+'" stroke="#8d7166"/>').join("")+'</g>'+bars+'<polyline points="'+pts+'" fill="none" stroke="'+orange+'" stroke-dasharray="4 5" stroke-width="2"/>'+DATA.hourlyDistribution.map((d,i)=>'<text x="'+(p+i*bw+bw/2)+'" y="'+(h-5)+'" text-anchor="middle" font-size="10" fill="#594138">'+(i+1)+'</text>').join("")+'</svg>';
  $("#hours").querySelectorAll("rect").forEach(r=>r.addEventListener("click",()=>setInsight(r.dataset.hour.padStart(2,"0")+":00 hour",fmt.format(Number(r.dataset.count))+" messages appeared in this hour across the two-year span.",{"Messages":fmt.format(Number(r.dataset.count)),"Hour":r.dataset.hour+":00"})));
}
function renderEnthusiasm(){
  if(balanceMode==="share"){
    $("#enthusiasm").innerHTML='<div class="balance">'+DATA.monthlyStats.map(m=>{const first=m.bySender[senderA]||0,total=Math.max(1,m.total),pct=Math.round(first/total*100);return '<button class="balance-row" style="border:0;background:transparent;text-align:left;cursor:pointer" data-month="'+m.month+'"><span>'+monthLabel(m.month)+'</span><span class="track"><span class="fill" style="display:block;width:'+pct+'%"></span></span><span>'+pct+'%</span></button>'}).join("")+'</div>';
    $("#enthusiasm").querySelectorAll("[data-month]").forEach(b=>b.addEventListener("click",()=>{const m=DATA.monthlyStats.find(x=>x.month===b.dataset.month);setInsight(monthLabel(m.month),fmt.format(m.total)+" messages in this month.",{[senderLabel(senderA)]:fmt.format(m.bySender[senderA]||0),[senderLabel(senderB)]:fmt.format(m.bySender[senderB]||0),"Active days":m.activeDays})}));
    return;
  }
  const max=Math.max(...DATA.monthlyStats.flatMap(m=>m.senders.map(s=>Math.abs(s.enthusiasmIndex))));
  $("#enthusiasm").innerHTML='<div class="bubble-chart"><div></div><div class="head">'+senderLabel(senderA)+'</div><div class="head">'+senderLabel(senderB)+'</div><div></div>'+DATA.monthlyStats.map(m=>{const dots=m.senders.map(s=>{const size=8+46*Math.abs(s.enthusiasmIndex)/(max||1);const color=senderColor(s.sender);return '<button class="bubble" data-month="'+m.month+'" data-sender="'+s.sender+'" style="width:'+size+'px;height:'+size+'px;color:'+color+'" title="'+senderLabel(s.sender)+' E='+s.enthusiasmIndex.toFixed(3)+'"></button>'}).join("");return '<div class="mon">'+monthLabel(m.month)+'</div>'+dots+'<div style="font-size:12px;color:#594138">'+fmt.format(m.total)+' msgs</div>'}).join("")+'</div>';
  $("#enthusiasm").querySelectorAll(".bubble").forEach(b=>b.addEventListener("click",()=>{const m=DATA.monthlyStats.find(x=>x.month===b.dataset.month),s=m.senders.find(x=>x.sender===b.dataset.sender);setInsight(senderLabel(b.dataset.sender)+" in "+monthLabel(m.month),senderLabel(b.dataset.sender)+" sent "+fmt.format(s.sent)+" and received "+fmt.format(s.received)+" that month.",{"Index":s.enthusiasmIndex.toFixed(3),"Share":Math.round(s.share*100)+"%","Month total":fmt.format(m.total)})}));
}
function barSvg(rows,color){
  const value=r=>r.score??r.specificity??r.count;
  const max=Math.max(1,...rows.map(value));
  return '<svg class="bar-svg" viewBox="0 0 520 '+(rows.length*18+24)+'">'+rows.map((r,i)=>{const v=value(r);const w=v/max*360; const y=20+i*18; return '<text x="0" y="'+(y+10)+'" font-size="11" fill="#594138">'+esc(r.word)+'</text><rect class="word-hit" data-word="'+esc(r.word)+'" x="110" y="'+y+'" width="'+w+'" height="11" rx="4" fill="'+color+'" opacity="'+(.4+.6*v/max)+'"/><text x="'+(118+w)+'" y="'+(y+10)+'" font-size="9" fill="#8d7166">'+(r.score?r.score.toFixed(2):(r.specificity?r.specificity.toFixed(2):r.count))+'</text>'}).join("")+'</svg>';
}
function renderSpecificity(){
  const senders=senderFilter==="both"?DATA.senders:DATA.senders.filter(s=>s.sender===senderFilter);
  $("#specificity").innerHTML=senders.map(s=>{const color=senderColor(s.sender);return '<div><h3 class="card-title">'+senderLabel(s.sender)+"'s signature words</h3>"+barSvg(DATA.wordSpecificity[s.sender]||[],color)+'</div>'}).join("");
  $("#specificity").querySelectorAll(".word-hit").forEach(el=>el.addEventListener("click",()=>showWord(el.dataset.word)));
}
function renderContribution(){
  const rows=DATA.contributionWords.slice(0,48), w=920, rowH=22, labelW=140, barX=180, barW=560, max=Math.max(...rows.map(r=>r.count));
  $("#contribution").innerHTML='<svg viewBox="0 0 '+w+' '+(rows.length*rowH+48)+'"><text x="'+barX+'" y="14" font-size="11" font-weight="800" fill="#8d7166">'+senderLabel(senderA)+'</text><text x="'+(barX+barW)+'" y="14" font-size="11" font-weight="800" text-anchor="end" fill="#8d7166">'+senderLabel(senderB)+'</text>'+rows.map((r,i)=>{const y=34+i*rowH;const a=(r.shares[senderA]||0)*barW;const b=(r.shares[senderB]||0)*barW;const op=.25+.75*r.count/max;return '<text x="0" y="'+(y+12)+'" font-size="12" font-weight="700" fill="#594138">'+esc(r.word)+'</text><rect x="'+barX+'" y="'+y+'" width="'+barW+'" height="13" rx="6.5" fill="#f5ece9"/><rect x="'+barX+'" y="'+y+'" width="'+a+'" height="13" rx="6.5" fill="'+rose+'" opacity="'+op+'"/><rect x="'+(barX+a)+'" y="'+y+'" width="'+b+'" height="13" rx="6.5" fill="'+blue+'" opacity="'+op+'"/><text x="'+(barX+barW+18)+'" y="'+(y+12)+'" font-size="11" fill="#8d7166">'+fmt.format(r.count)+'</text><rect x="0" y="'+(y-3)+'" width="'+w+'" height="'+rowH+'" fill="transparent" data-word="'+esc(r.word)+'"><title>'+esc(r.word)+' '+r.count+'</title></rect>'}).join("")+'</svg>';
  $("#contribution").querySelectorAll("[data-word]").forEach(el=>el.addEventListener("click",()=>showWord(el.dataset.word)));
}
function renderCloud(){
  const words=DATA.topWords.slice(0,85), max=Math.max(...words.map(w=>w.count));
  $("#cloud").innerHTML=words.map((w,i)=>{const x=8+(i*37%84), y=12+(i*53%76), size=13+w.count/max*44, rot=(i%9===0?90:(i%6===0?-90:0));return '<button style="left:'+x+'%;top:'+y+'%;font-size:'+size+'px;--a:'+(0.20+w.count/max*.78).toFixed(2)+';--r:'+rot+'deg" data-word="'+esc(w.word)+'">'+esc(w.word)+'</button>'}).join("");
  $("#cloud").querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>showWord(b.dataset.word)));
}
function renderSentiment(){
  const rows=DATA.sentimentTimeline,w=540,h=220,p=32,max=Math.max(...rows.map(r=>Math.abs(r.normalizedScore)),.001);
  const zero=h/2;
  $("#sentiment").innerHTML='<svg viewBox="0 0 '+w+' '+h+'"><line x1="'+p+'" x2="'+(w-p)+'" y1="'+zero+'" y2="'+zero+'" stroke="#e1bfb2"/>'+rows.map((r,i)=>{const bw=(w-p*2)/rows.length-4;const x=p+i*((w-p*2)/rows.length)+2;const bh=Math.abs(r.normalizedScore)/max*(h/2-p);const y=r.normalizedScore>=0?zero-bh:zero;const color=r.normalizedScore>=0?rose:blue;return '<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+bh+'" rx="4" fill="'+color+'" opacity=".75" data-month="'+r.month+'"><title>'+r.month+' '+r.normalizedScore.toFixed(3)+'</title></rect>'}).join("")+'</svg>';
  $("#sentiment").querySelectorAll("rect").forEach(r=>r.addEventListener("click",()=>{const row=DATA.sentimentTimeline.find(x=>x.month===r.dataset.month);setInsight(monthLabel(row.month),"Lexicon score for this month is "+row.normalizedScore.toFixed(3)+". Treat it as texture, not diagnosis.",{"Positive":row.positive,"Negative":row.negative,"Score":row.normalizedScore.toFixed(3)})}));
}
function renderLoveWords(){
  $("#loveWords").innerHTML=DATA.relationshipKeywords.slice(0,24).map((k,i)=>'<button class="'+(i<3?'big':'')+'" data-word="'+esc(k.word)+'">'+esc(k.word)+' <span style="font-family:var(--sans);font-size:12px;color:#8d7166">x '+fmt.format(k.count)+'</span></button>').join("");
  $("#loveWords").querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>showWord(b.dataset.word)));
}
function renderHorizontalBars(id,rows,labelKey,valueKey,color){
  const max=Math.max(1,...rows.map(r=>r[valueKey]));
  $("#"+id).innerHTML='<div class="hbar">'+rows.map(r=>{const pct=Math.max(3,r[valueKey]/max*100);return '<button class="hbar-row" style="border:0;background:transparent;text-align:left;cursor:pointer" data-label="'+esc(r[labelKey])+'" data-value="'+r[valueKey]+'"><b>'+esc(r[labelKey])+'</b><span class="hbar-track"><span class="hbar-fill" style="width:'+pct+'%;background:'+color+'"></span></span><span>'+fmt.format(r[valueKey])+'</span></button>'}).join("")+'</div>';
  $("#"+id).querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>setInsight(b.dataset.label,fmt.format(Number(b.dataset.value))+" messages in this bucket.",{"Share":Math.round(Number(b.dataset.value)/DATA.messageCount*100)+"%","Count":fmt.format(Number(b.dataset.value))})));
}
function renderThreads(){
  $("#threads").innerHTML=DATA.representativeThreads.map(t=>'<article class="thread evidence-card"><h3>'+esc(t.title)+'</h3><p class="note">'+esc(t.date)+' · '+esc(t.note)+'</p>'+t.messages.map(m=>'<div class="msg"><span class="who">'+esc(m.sender)+'</span><span class="time">'+esc(m.time)+'</span><span>'+esc(m.text)+'</span></div>').join("")+'</article>').join("");
}
function showWord(word, shouldOpen=true){
  const top=DATA.topWords.find(w=>w.word===word);
  const contrib=DATA.contributionWords.find(w=>w.word===word);
  const aSpec=(DATA.wordSpecificity[senderA]||[]).find(w=>w.word===word);
  const bSpec=(DATA.wordSpecificity[senderB]||[]).find(w=>w.word===word);
  const count=top?.count||contrib?.count||aSpec?.count||bSpec?.count||0;
  const owner=contrib?.dominantSender||((aSpec?.specificity||0)>(bSpec?.specificity||0)?senderA:senderB);
  $("#wordPanel").innerHTML='<h3>'+esc(word)+'</h3><p>This word appears '+fmt.format(count)+' times in the aggregate vocabulary model.</p><dl><div><dt>Leans</dt><dd>'+esc(senderLabel(owner))+'</dd></div><div><dt>'+senderLabel(senderA)+' share</dt><dd>'+Math.round(((contrib?.shares?.[senderA])||0)*100)+'%</dd></div><div><dt>'+senderLabel(senderB)+' share</dt><dd>'+Math.round(((contrib?.shares?.[senderB])||0)*100)+'%</dd></div></dl>';
  if(shouldOpen)setInsight("Word: "+word,"Vocabulary signal only. This panel shows aggregate counts and sender lean without exposing raw messages.",{"Count":fmt.format(count),"Leans":senderLabel(owner)});
}
function boot(){
  renderControls();
  document.querySelectorAll(".memory-token").forEach(token=>token.addEventListener("click",()=>setInsight(token.dataset.title,token.dataset.body,{[token.dataset.statA]:token.dataset.valueA,[token.dataset.statB]:token.dataset.valueB})));
  renderMiniBars("monthlyBars",DATA.monthlyStats.map(m=>({label:monthLabel(m.month),count:m.total})),"#f04d72");
  renderSparkline("dailyBars",DATA.calendarHeatmap.map(d=>({date:d.date,count:d.count})));
  renderCalendar();renderHours();renderEnthusiasm();renderHorizontalBars("topicBars",DATA.topicCounts.slice(0,10),"topic","count","linear-gradient(90deg,var(--rose),#f4bd55)");renderHorizontalBars("typeBars",DATA.typeCounts,"type","count","linear-gradient(90deg,var(--blue),#8f2b5d)");renderSpecificity();renderContribution();renderCloud();renderSentiment();renderLoveWords();renderThreads();showWord(DATA.relationshipKeywords[0].word,false);
}
boot();
</script>
</body>
</html>`
}

await fs.mkdir(OUT_DIR, { recursive: true })
const messages = makeMessages()
const analysis = analyze(messages)
let fontCss = ""
try {
  const fontPath = path.resolve("..", "clockless-design-system", "fonts", "SpaceGrotesk-VariableFont_wght.ttf")
  const font = await fs.readFile(fontPath)
  fontCss = `@font-face{font-family:"Space Grotesk";src:url(data:font/ttf;base64,${font.toString("base64")}) format("truetype");font-weight:300 700;font-style:normal;font-display:swap}`
} catch {
  fontCss = ""
}
const csv = [
  "CreateTime,Sender,StrContent,Type,Topic,Emotion,DayType",
  ...messages.map(m => [tsString(m.ts), m.sender, m.text, m.type, m.topic, m.emotion, m.dayType].map(csvEscape).join(",")),
].join("\n") + "\n"
await fs.writeFile(INPUT, csv, "utf8")
await fs.writeFile(OUTPUT, buildHtml(analysis, fontCss), "utf8")
console.log(`Generated ${INPUT} (${messages.length.toLocaleString()} messages)`)
console.log(`Generated ${OUTPUT}`)
