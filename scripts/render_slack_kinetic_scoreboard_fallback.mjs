#!/usr/bin/env node
/**
 * Render the checked-in Slack demo with the kinetic-scoreboard style.
 *
 * The canonical path is still parser -> htmlize -> LLM. This deterministic
 * renderer keeps the public example available without an API key and acts as
 * a style fidelity fixture for Kinetic Championship.
 */
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const inputPath = path.join(ROOT, "examples", "slack", "input.json")
const outputPath = path.join(ROOT, "examples", "slack", "output.html")

const raw = JSON.parse(await fs.readFile(inputPath, "utf8"))
const data = buildData(raw)
await fs.writeFile(outputPath, renderHtml(data), "utf8")
console.log(`Rendered ${path.relative(ROOT, outputPath)} (${data.totalMessages} messages).`)

function buildData(input) {
  const userById = new Map()
  for (const msg of input.messages || []) {
    if (!msg.user) continue
    const profile = msg.user_profile || {}
    const real = profile.real_name || profile.display_name || profile.name || msg.user
    const display = maskName(real)
    userById.set(msg.user, {
      id: msg.user,
      real,
      display,
      handle: profile.display_name || profile.name || display.toLowerCase().replace(/\W+/g, ""),
    })
  }

  const messages = (input.messages || [])
    .filter(msg => msg.type === "message" && msg.ts)
    .map((msg, index) => {
      const user = userById.get(msg.user) || { id: msg.user || "unknown", display: "Unknown", handle: "unknown" }
      const date = slackDate(msg.ts)
      const reactions = (msg.reactions || []).reduce((sum, reaction) => sum + Number(reaction.count || 0), 0)
      const text = cleanSlackText(msg.text || "", userById)
      return {
        id: `m${index + 1}`,
        senderId: user.id,
        sender: user.display,
        handle: user.handle,
        timestamp: date.toISOString(),
        date: date.toISOString().slice(0, 10),
        time: date.toISOString().slice(11, 16),
        hour: date.getUTCHours(),
        text,
        wordCount: words(text).length,
        reactions,
        reactionNames: (msg.reactions || []).map(reaction => reaction.name),
        files: (msg.files || []).map(file => file.name || file.mimetype || "file"),
        threadTs: msg.thread_ts || "",
        replyCount: Number(msg.reply_count || 0),
        isDecision: /decision|approved|approving|going with|leaving the rollout|logged|ship it|go to 100|hold the 100/i.test(text),
        isAction: /action item|can you|please|need|will|take a pass|pull|ship|fix|write|add|send|look|merge|deploy/i.test(text),
        isQuestion: /\?|\bwhat\b|\bwhen\b|\bwho\b|\bcan you\b|\bwant me\b/i.test(text),
      }
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  const days = [...new Set(messages.map(msg => msg.date))]
  const senderStats = new Map()
  for (const msg of messages) {
    const existing = senderStats.get(msg.senderId) || {
      id: msg.senderId,
      display: msg.sender,
      handle: msg.handle,
      count: 0,
      words: 0,
      reactions: 0,
      decisions: 0,
      actions: 0,
      questions: 0,
      threads: 0,
      files: 0,
      hours: Array.from({ length: 24 }, () => 0),
      fragments: [],
      firstSeen: msg.timestamp,
      lastSeen: msg.timestamp,
    }
    existing.count += 1
    existing.words += msg.wordCount
    existing.reactions += msg.reactions
    existing.decisions += msg.isDecision ? 1 : 0
    existing.actions += msg.isAction ? 1 : 0
    existing.questions += msg.isQuestion ? 1 : 0
    existing.threads += msg.threadTs ? 1 : 0
    existing.files += msg.files.length
    existing.hours[msg.hour] += 1
    existing.firstSeen = existing.firstSeen < msg.timestamp ? existing.firstSeen : msg.timestamp
    existing.lastSeen = existing.lastSeen > msg.timestamp ? existing.lastSeen : msg.timestamp
    existing.fragments.push(...words(msg.text).slice(0, 5))
    senderStats.set(msg.senderId, existing)
  }

  const senders = [...senderStats.values()].map(sender => {
    const activeDays = new Set(messages.filter(msg => msg.senderId === sender.id).map(msg => msg.date)).size || 1
    const score = sender.count * 120 + sender.words * 2 + sender.reactions * 45 + sender.decisions * 135 + sender.actions * 70 + sender.threads * 34 + sender.files * 50
    const peakHour = sender.hours.reduce((best, value, hour) => value > sender.hours[best] ? hour : best, 0)
    const uniqueFragments = [...new Set(sender.fragments.filter(word => word.length > 2))]
    return {
      ...sender,
      score,
      pace: +(sender.count / activeDays).toFixed(1),
      peakHour,
      fragments: uniqueFragments.slice(0, 60),
    }
  }).sort((a, b) => b.score - a.score)

  const lanePlayers = senders.slice(0, 4).map((sender, index) => ({
    ...sender,
    rank: index + 1,
    lane: `0${index + 1}`,
    accent: ["#E63946", "#2A9D8F", "#457B9D", "#F4A261"][index] || "#0D0D0D",
    phase: ["CONCENTRIC", "CONTROL", "RECOVERY", "ECCENTRIC"][index] || "PULSE",
    load: `${Math.max(70, Math.round(sender.score / 34))}KG`,
  }))

  const hourTotals = Array.from({ length: 24 }, () => 0)
  const heat = []
  for (const day of days) {
    const row = { date: day, hours: Array.from({ length: 24 }, () => 0), total: 0 }
    for (const msg of messages.filter(item => item.date === day)) {
      row.hours[msg.hour] += 1
      row.total += 1
      hourTotals[msg.hour] += 1
    }
    heat.push(row)
  }

  const topicDefs = [
    ["rollout", ["rollout", "ramp", "100%", "25%", "3%", "launch", "live"]],
    ["engineering", ["PR", "merged", "deployed", "config", "feature", "selector", "ci"]],
    ["design", ["design", "header", "motion", "sheet", "empty", "option"]],
    ["quality", ["qa", "blocker", "green", "fix", "bug", "sentry", "device"]],
    ["performance", ["lcp", "latency", "layout", "render", "perf", "budget"]],
    ["decisions", ["decision", "approved", "approving", "ship", "go", "hold"]],
  ]
  const topics = topicDefs.map(([label, keys]) => {
    const hits = messages.filter(msg => keys.some(key => msg.text.toLowerCase().includes(key.toLowerCase())))
    return { label, count: hits.length, sample: hits.slice(0, 3).map(msg => msg.text) }
  }).sort((a, b) => b.count - a.count)

  const topReactions = new Map()
  for (const msg of messages) {
    for (const name of msg.reactionNames) topReactions.set(name, (topReactions.get(name) || 0) + 1)
  }

  return {
    source: "Slack export",
    channel: input.channel || "channel",
    dateRange: {
      start: messages[0]?.date || "",
      end: messages[messages.length - 1]?.date || "",
    },
    totalMessages: messages.length,
    totalSenders: senders.length,
    totalReactions: messages.reduce((sum, msg) => sum + msg.reactions, 0),
    threadCount: messages.filter(msg => msg.threadTs).length,
    fileCount: messages.reduce((sum, msg) => sum + msg.files.length, 0),
    senders,
    lanePlayers,
    heat,
    hourTotals,
    decisions: messages.filter(msg => msg.isDecision).slice(0, 12),
    actionItems: messages.filter(msg => msg.isAction).slice(0, 14),
    threads: messages.filter(msg => msg.threadTs || msg.replyCount).slice(0, 10),
    topics,
    topReactions: [...topReactions.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    messages,
  }
}

function slackDate(ts) {
  const sec = Number(String(ts).split(".")[0])
  return new Date(sec * 1000)
}

function maskName(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return parts[0] || "Member"
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

function cleanSlackText(text, userById) {
  return String(text)
    .replace(/<@([A-Z0-9]+)>/g, (_, id) => `@${userById.get(id)?.handle || "member"}`)
    .replace(/<!here>/g, "@here")
    .replace(/<#([A-Z0-9]+)\|([^>]+)>/g, "#$2")
    .replace(/<https?:\/\/([^|>]+)\|([^>]+)>/g, "$2")
    .replace(/<([^>]+)>/g, "$1")
}

function words(text) {
  return String(text).toLowerCase().match(/[a-z0-9%+-]{2,}/g) || []
}

function scriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}

function renderHtml(data) {
  return `<!doctype html>
<html lang="en" data-ha-style="kinetic-scoreboard">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Slack Channel - Kinetic Championship</title>
<style>
:root {
  color-scheme: light;
  --paper: #f0efea;
  --ink: #0d0d0d;
  --muted: #676158;
  --rule: rgba(13, 13, 13, .28);
  --soft-rule: rgba(13, 13, 13, .11);
  --panel: #fffdf7;
  --danger: #e63946;
  --blue: #457b9d;
  --green: #2a9d8f;
  --amber: #f4a261;
  --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  --sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  min-height: 100vh;
  background:
    linear-gradient(rgba(13,13,13,.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(13,13,13,.055) 1px, transparent 1px),
    var(--paper);
  background-size: 20px 20px;
  color: var(--ink);
  font-family: var(--sans);
  overflow-x: hidden;
}
button, input { font: inherit; }
.kinetic-arena {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr;
  border-bottom: 2px solid var(--ink);
}
.championship-header {
  min-height: 92px;
  display: grid;
  grid-template-columns: minmax(520px, .95fr) minmax(420px, 1fr) 150px;
  align-items: stretch;
  border-bottom: 2px solid var(--ink);
  background: rgba(240,239,234,.94);
}
.event-lockup {
  padding: 14px 18px 12px;
  border-right: 2px solid var(--ink);
}
.mono {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--muted);
}
h1 {
  margin: 4px 0 0;
  max-width: 760px;
  font-size: clamp(34px, 4.7vw, 60px);
  line-height: .82;
  letter-spacing: -.05em;
  text-transform: uppercase;
  font-weight: 950;
}
.scoreboard-leaderboard {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-right: 2px solid var(--ink);
}
.leader-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 9px 12px;
  min-width: 0;
  border-right: 1px solid var(--soft-rule);
  border-bottom: 1px solid var(--soft-rule);
  font-family: var(--mono);
  text-transform: uppercase;
  cursor: pointer;
}
.leader-row:nth-child(3n) { border-right: 0; }
.leader-row strong { font-size: 18px; }
.leader-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.leader-row[aria-pressed="true"] { background: var(--ink); color: var(--paper); }
.arena-controls {
  display: grid;
  grid-template-rows: 1fr 1fr;
  min-width: 150px;
}
.arena-controls button,
.arena-controls label {
  border: 0;
  border-bottom: 1px solid var(--ink);
  background: transparent;
  color: var(--ink);
  padding: 12px;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: .14em;
  text-transform: uppercase;
  cursor: pointer;
}
.arena-controls label {
  display: grid;
  gap: 6px;
  cursor: default;
}
.arena-controls input { width: 100%; accent-color: var(--danger); }
.competitor-lanes {
  display: grid;
  grid-template-columns: repeat(4, minmax(245px, 1fr));
  min-height: 0;
}
.competitor-lane {
  position: relative;
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-height: 640px;
  border-right: 2px solid var(--ink);
  background:
    linear-gradient(rgba(13,13,13,.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(13,13,13,.035) 1px, transparent 1px);
  background-size: 20px 20px;
  cursor: pointer;
  outline: 0;
  transition: background-color 160ms ease, transform 160ms ease;
}
.competitor-lane:last-child { border-right: 0; }
.competitor-lane.is-selected { background-color: rgba(255,255,255,.36); }
.competitor-lane:focus-visible { box-shadow: inset 0 0 0 4px var(--danger); }
.lane-header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: start;
  padding: 14px 14px 12px;
  border-bottom: 2px solid var(--ink);
}
.lane-no, .lane-rank {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: .14em;
  text-transform: uppercase;
}
.lane-name {
  min-width: 0;
  text-transform: uppercase;
}
.lane-name h2 {
  margin: 0;
  font-size: clamp(18px, 2.4vw, 30px);
  line-height: .9;
  letter-spacing: -.04em;
  font-weight: 950;
}
.lane-name p { margin: 5px 0 0; color: var(--muted); font: 11px/1.1 var(--mono); text-transform: uppercase; }
.lane-score {
  grid-column: 1 / -1;
  margin-top: 8px;
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
}
.lane-score strong {
  font-size: clamp(42px, 5vw, 84px);
  line-height: .78;
  letter-spacing: -.08em;
  font-weight: 950;
}
.lane-score span { color: var(--muted); font: 11px/1 var(--mono); text-transform: uppercase; }
.kinetic-body {
  position: relative;
  min-height: 0;
  overflow: hidden;
  padding: 18px 10px;
}
.fiducial {
  position: absolute;
  width: 18px;
  height: 18px;
  color: var(--ink);
  font: 700 18px/18px var(--mono);
  opacity: .72;
}
.fiducial.a { top: 12px; left: 12px; }
.fiducial.b { top: 12px; right: 12px; }
.fiducial.c { bottom: 12px; left: 12px; }
.fiducial.d { bottom: 12px; right: 12px; }
.activity-strips {
  position: absolute;
  inset: 52px 24px 64px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}
.text-line {
  height: 8px;
  overflow: hidden;
  white-space: nowrap;
  color: var(--ink);
  font: 700 8px/8px var(--mono);
  letter-spacing: .02em;
  text-transform: uppercase;
  opacity: .82;
  transform-origin: center;
  background: color-mix(in srgb, var(--lane-accent) 12%, transparent);
}
.barbell-track {
  position: absolute;
  left: 50%;
  top: 68px;
  bottom: 72px;
  width: 2px;
  transform: translateX(-50%);
  background: repeating-linear-gradient(to bottom, rgba(13,13,13,.18), rgba(13,13,13,.18) 8px, transparent 8px, transparent 16px);
}
.kinetic-bar {
  position: absolute;
  left: 50%;
  top: 45%;
  width: min(210px, 72%);
  height: 8px;
  transform: translate(-50%, -50%);
  background: var(--ink);
  transition: opacity 160ms ease;
}
.kinetic-bar::before,
.kinetic-bar::after {
  content: "";
  position: absolute;
  top: 50%;
  width: 20px;
  height: 54px;
  border: 5px solid var(--ink);
  background: var(--paper);
  transform: translateY(-50%);
}
.kinetic-bar::before { left: -26px; }
.kinetic-bar::after { right: -26px; }
.sweat-word {
  position: absolute;
  left: var(--x);
  top: var(--y);
  color: var(--lane-accent);
  font: 900 11px/1 var(--mono);
  text-transform: uppercase;
  opacity: .82;
  transform: rotate(var(--r));
}
.lane-tooltip {
  position: absolute;
  z-index: 3;
  left: 14px;
  right: 14px;
  bottom: 54px;
  padding: 10px;
  border: 2px solid var(--ink);
  background: var(--panel);
  font: 11px/1.35 var(--mono);
  text-transform: uppercase;
  opacity: 0;
  transform: translateY(8px);
  pointer-events: none;
  transition: opacity 160ms ease, transform 160ms ease;
}
.competitor-lane:hover .lane-tooltip,
.competitor-lane:focus-visible .lane-tooltip,
.competitor-lane.is-selected .lane-tooltip {
  opacity: 1;
  transform: translateY(0);
}
.telemetry-footer {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-top: 2px solid var(--ink);
  font: 10px/1.2 var(--mono);
  letter-spacing: .08em;
  text-transform: uppercase;
}
.telemetry-footer div {
  padding: 10px;
  border-right: 1px solid var(--ink);
}
.telemetry-footer div:last-child { border-right: 0; }
.telemetry-footer strong { display: block; font-size: 13px; letter-spacing: 0; }
.evidence-pit {
  padding: clamp(20px, 4vw, 58px);
  background: var(--paper);
  border-top: 2px solid var(--ink);
}
.pit-header {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 24px;
  align-items: end;
  margin-bottom: 24px;
}
.pit-header h2 {
  margin: 0;
  max-width: 760px;
  font-size: clamp(32px, 5vw, 72px);
  line-height: .86;
  letter-spacing: -.06em;
  text-transform: uppercase;
}
.copy-summary {
  margin-top: 14px;
  border: 2px solid var(--ink);
  background: var(--ink);
  color: var(--paper);
  padding: 10px 12px;
  font: 800 11px/1 var(--mono);
  letter-spacing: .12em;
  text-transform: uppercase;
  cursor: pointer;
}
.pit-kpis {
  display: grid;
  grid-template-columns: repeat(4, auto);
  border: 2px solid var(--ink);
}
.pit-kpis div { padding: 10px 14px; border-right: 1px solid var(--ink); font-family: var(--mono); text-transform: uppercase; }
.pit-kpis div:last-child { border-right: 0; }
.pit-kpis strong { display: block; font-size: 24px; font-family: var(--sans); letter-spacing: -.04em; }
.pit-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  border: 2px solid var(--ink);
  background: var(--panel);
}
.pit-panel {
  grid-column: span 4;
  min-height: 270px;
  padding: 16px;
  border-right: 1px solid var(--ink);
  border-bottom: 1px solid var(--ink);
}
.pit-panel.wide { grid-column: span 8; }
.pit-panel.full { grid-column: 1 / -1; }
.pit-panel h3 {
  margin: 0 0 14px;
  font: 900 15px/1 var(--sans);
  text-transform: uppercase;
  letter-spacing: -.02em;
}
.heatmap {
  display: grid;
  gap: 4px;
}
.heat-row {
  display: grid;
  grid-template-columns: 78px repeat(24, 1fr);
  gap: 2px;
  align-items: center;
}
.heat-label { color: var(--muted); font: 10px/1 var(--mono); }
.heat-cell {
  aspect-ratio: 1;
  min-width: 6px;
  border: 1px solid rgba(13,13,13,.08);
  background: color-mix(in srgb, var(--danger) calc(var(--v) * 70%), #f7f4ed);
}
.bar-row {
  display: grid;
  grid-template-columns: 110px 1fr auto;
  gap: 10px;
  align-items: center;
  margin: 9px 0;
  font: 11px/1 var(--mono);
  text-transform: uppercase;
}
.bar-track { height: 10px; background: rgba(13,13,13,.08); border: 1px solid rgba(13,13,13,.14); }
.bar-fill { height: 100%; width: calc(var(--v) * 100%); background: var(--ink); }
.evidence-list {
  display: grid;
  gap: 10px;
  max-height: 300px;
  overflow: auto;
  padding-right: 4px;
}
.evidence-item {
  display: grid;
  gap: 4px;
  padding: 10px;
  border: 1px solid var(--ink);
  background: rgba(240,239,234,.55);
}
.evidence-item b { font: 800 11px/1 var(--mono); text-transform: uppercase; }
.evidence-item span { color: var(--muted); font: 12px/1.35 var(--sans); }
.match-log {
  margin-top: 24px;
  border: 2px solid var(--ink);
  background: var(--panel);
}
.log-head {
  display: grid;
  grid-template-columns: 1fr minmax(220px, 340px);
  gap: 16px;
  padding: 14px;
  border-bottom: 2px solid var(--ink);
  align-items: center;
}
.log-head h3 { margin: 0; font-size: 22px; text-transform: uppercase; letter-spacing: -.03em; }
.search-box {
  width: 100%;
  border: 2px solid var(--ink);
  background: var(--paper);
  color: var(--ink);
  padding: 10px 12px;
  font-family: var(--mono);
  text-transform: uppercase;
}
.record-list {
  max-height: 540px;
  overflow: auto;
}
.record {
  display: grid;
  grid-template-columns: 150px 160px 1fr auto;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--soft-rule);
  align-items: start;
}
.record.is-hot { background: color-mix(in srgb, var(--danger) 10%, transparent); }
.record .when, .record .who, .record .flags { font: 11px/1.2 var(--mono); text-transform: uppercase; color: var(--muted); }
.record .txt { font-size: 14px; line-height: 1.35; }
.empty { padding: 20px; color: var(--muted); font-family: var(--mono); text-transform: uppercase; }
.privacy-note {
  margin-top: 18px;
  color: var(--muted);
  font: 12px/1.45 var(--mono);
  text-transform: uppercase;
}
@media (max-width: 1100px) {
  .championship-header { grid-template-columns: 1fr; }
  .event-lockup, .scoreboard-leaderboard { border-right: 0; }
  .arena-controls { grid-template-columns: 1fr 1fr; grid-template-rows: auto; }
  .competitor-lanes { overflow-x: auto; grid-template-columns: repeat(4, minmax(280px, 72vw)); }
  .pit-header { grid-template-columns: 1fr; }
  .pit-kpis { grid-template-columns: repeat(2, 1fr); }
  .pit-panel, .pit-panel.wide { grid-column: 1 / -1; }
  .record { grid-template-columns: 1fr; }
  .log-head { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { transition-duration: 1ms !important; animation-duration: 1ms !important; animation-iteration-count: 1 !important; }
}
</style>
</head>
<body>
<main>
  <section class="kinetic-arena" aria-label="Kinetic Championship">
    <header class="championship-header">
      <div class="event-lockup">
        <div class="mono">Source // ${escapeHtml(data.source)} // #${escapeHtml(data.channel)} // ${escapeHtml(data.dateRange.start)} to ${escapeHtml(data.dateRange.end)}</div>
        <h1>Kinetic Championship</h1>
      </div>
      <div class="scoreboard-leaderboard" id="leaderboard" aria-label="Leaderboard"></div>
      <div class="arena-controls">
        <button type="button" id="motion-toggle">Pause motion</button>
        <label>Speed <input id="speed" type="range" min="0.35" max="1.65" value="0.85" step="0.05"></label>
      </div>
    </header>
    <section class="competitor-lanes" id="lanes" aria-label="Competitor lanes"></section>
  </section>

  <section class="evidence-pit" aria-label="Post-match evidence">
    <header class="pit-header">
      <div>
        <div class="mono">Post-match analysis // linked to selected lane</div>
        <h2>Launch Channel Evidence Pit</h2>
        <button class="copy-summary" type="button" id="copy-summary">Copy as Markdown</button>
      </div>
      <div class="pit-kpis" aria-label="Event summary">
        <div><strong>${data.totalMessages}</strong>messages</div>
        <div><strong>${data.totalSenders}</strong>senders</div>
        <div><strong>${data.threadCount}</strong>threaded plays</div>
        <div><strong>${data.totalReactions}</strong>reactions</div>
      </div>
    </header>
    <div class="pit-grid">
      <section class="pit-panel wide">
        <h3>Activity heatmap</h3>
        <div class="heatmap" id="heatmap"></div>
      </section>
      <section class="pit-panel">
        <h3>Topics</h3>
        <div id="topics"></div>
      </section>
      <section class="pit-panel">
        <h3>Decisions</h3>
        <div class="evidence-list" id="decisions"></div>
      </section>
      <section class="pit-panel">
        <h3>Action items</h3>
        <div class="evidence-list" id="actions"></div>
      </section>
      <section class="pit-panel">
        <h3>Threads</h3>
        <div class="evidence-list" id="threads"></div>
      </section>
    </div>
    <section class="match-log">
      <div class="log-head">
        <div>
          <div class="mono">Browse all ${data.totalMessages} messages</div>
          <h3>Match log</h3>
        </div>
        <input class="search-box" id="search" type="search" placeholder="Search messages / topics">
      </div>
      <div class="record-list" id="records"></div>
    </section>
    <footer class="privacy-note">Generated locally - the full Slack export is embedded in this HTML and rendered in your browser. For sharing, prefer an anonymized export.</footer>
  </section>
</main>
<script id="ha-data">const DATA = ${scriptJson(data)};</script>
<script>
(function () {
  const lanesEl = document.getElementById('lanes');
  const leaderboardEl = document.getElementById('leaderboard');
  const heatmapEl = document.getElementById('heatmap');
  const topicsEl = document.getElementById('topics');
  const decisionsEl = document.getElementById('decisions');
  const actionsEl = document.getElementById('actions');
  const threadsEl = document.getElementById('threads');
  const recordsEl = document.getElementById('records');
  const searchEl = document.getElementById('search');
  const copyEl = document.getElementById('copy-summary');
  const speedEl = document.getElementById('speed');
  const toggleEl = document.getElementById('motion-toggle');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = {
    selected: DATA.lanePlayers[0] ? DATA.lanePlayers[0].id : '',
    phase: .28,
    speed: Number(speedEl.value || .85),
    paused: reduceMotion,
    query: ''
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function clamp(min, max, value) {
    return Math.max(min, Math.min(max, value));
  }

  function formatScore(value) {
    return Math.round(value).toLocaleString('en-US');
  }

  function select(id) {
    state.selected = id;
    renderLeaderboard();
    renderLaneSelection();
    renderEvidence();
    renderRecords();
  }

  function renderLeaderboard() {
    leaderboardEl.innerHTML = DATA.senders.map(function (sender, index) {
      return '<button class="leader-row" type="button" data-id="' + esc(sender.id) + '" aria-pressed="' + (sender.id === state.selected ? 'true' : 'false') + '">' +
        '<strong>#' + (index + 1) + '</strong><span>' + esc(sender.display) + '</span><b>' + formatScore(sender.score) + '</b></button>';
    }).join('');
    Array.from(leaderboardEl.querySelectorAll('button')).forEach(function (button) {
      button.addEventListener('click', function () { select(button.dataset.id); });
    });
  }

  function lineText(player, index) {
    const fragments = player.fragments && player.fragments.length ? player.fragments : [player.display, 'launch', 'ship', 'review'];
    const start = index % fragments.length;
    const words = [];
    for (let i = 0; i < 18; i++) words.push(fragments[(start + i) % fragments.length]);
    return words.join(' / ');
  }

  function renderLanes() {
    lanesEl.innerHTML = DATA.lanePlayers.map(function (player) {
      const lines = Array.from({ length: 58 }, function (_, i) {
        return '<div class="text-line" data-line="' + i + '">' + esc(lineText(player, i)) + '</div>';
      }).join('');
      const sweat = (player.fragments || []).slice(0, 5).map(function (word, i) {
        const x = 18 + ((i * 17 + player.rank * 11) % 58);
        const y = 19 + ((i * 13 + player.rank * 7) % 52);
        const rot = ((i * 17) % 42) - 20;
        return '<span class="sweat-word" style="--x:' + x + '%;--y:' + y + '%;--r:' + rot + 'deg">' + esc(word) + '</span>';
      }).join('');
      return '<article class="competitor-lane" tabindex="0" role="button" data-id="' + esc(player.id) + '" style="--lane-accent:' + esc(player.accent) + '">' +
        '<header class="lane-header">' +
          '<div class="lane-no">Lane ' + esc(player.lane) + '</div>' +
          '<div class="lane-name"><h2>' + esc(player.display) + '</h2><p>@' + esc(player.handle) + ' // peak ' + String(player.peakHour).padStart(2, '0') + ':00 UTC</p></div>' +
          '<div class="lane-rank">Rank #' + player.rank + '</div>' +
          '<div class="lane-score"><strong data-score="' + player.score + '">0</strong><span>activity score</span></div>' +
        '</header>' +
        '<div class="kinetic-body">' +
          '<span class="fiducial a">+</span><span class="fiducial b">+</span><span class="fiducial c">+</span><span class="fiducial d">+</span>' +
          '<div class="activity-strips">' + lines + '</div>' +
          '<div class="barbell-track"></div><div class="kinetic-bar"></div>' +
          sweat +
          '<div class="lane-tooltip">Selected insight: ' + player.display + ' carried ' + player.count + ' messages, ' + player.actions + ' action cues, and ' + player.decisions + ' decision calls. Click to filter the evidence pit.</div>' +
        '</div>' +
        '<footer class="telemetry-footer"><div>Phase<strong>' + esc(player.phase) + '</strong></div><div>Load<strong>' + esc(player.load) + '</strong></div><div>Pace<strong>' + player.pace + '/day</strong></div></footer>' +
      '</article>';
    }).join('');
    Array.from(lanesEl.querySelectorAll('.competitor-lane')).forEach(function (lane) {
      lane.addEventListener('click', function () { select(lane.dataset.id); });
      lane.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select(lane.dataset.id);
        }
      });
    });
    renderLaneSelection();
  }

  function renderLaneSelection() {
    Array.from(document.querySelectorAll('.competitor-lane')).forEach(function (lane) {
      lane.classList.toggle('is-selected', lane.dataset.id === state.selected);
    });
  }

  function selectedMessages(list) {
    const selectedInLanes = DATA.lanePlayers.some(function (player) { return player.id === state.selected; });
    if (!selectedInLanes) return list;
    return list.filter(function (msg) { return msg.senderId === state.selected; });
  }

  function renderHeatmap() {
    const max = Math.max(1, ...DATA.heat.flatMap(function (row) { return row.hours; }));
    heatmapEl.innerHTML = DATA.heat.map(function (row) {
      return '<div class="heat-row"><div class="heat-label">' + esc(row.date.slice(5)) + '</div>' +
        row.hours.map(function (value, hour) {
          return '<div class="heat-cell" title="' + esc(row.date + ' ' + hour + ':00 - ' + value + ' messages') + '" style="--v:' + (value / max).toFixed(3) + '"></div>';
        }).join('') + '</div>';
    }).join('');
  }

  function renderTopics() {
    const max = Math.max(1, ...DATA.topics.map(function (topic) { return topic.count; }));
    topicsEl.innerHTML = DATA.topics.map(function (topic) {
      return '<div class="bar-row"><span>' + esc(topic.label) + '</span><div class="bar-track"><div class="bar-fill" style="--v:' + (topic.count / max).toFixed(3) + '"></div></div><b>' + topic.count + '</b></div>';
    }).join('');
  }

  function renderList(el, list, emptyText) {
    const filtered = selectedMessages(list);
    el.innerHTML = filtered.length ? filtered.map(function (msg) {
      return '<div class="evidence-item"><b>' + esc(msg.sender) + ' // ' + esc(msg.date) + ' ' + esc(msg.time) + '</b><span>' + esc(msg.text) + '</span></div>';
    }).join('') : '<div class="empty">' + esc(emptyText) + '</div>';
  }

  function renderEvidence() {
    renderHeatmap();
    renderTopics();
    renderList(decisionsEl, DATA.decisions, 'No decision calls for this lane.');
    renderList(actionsEl, DATA.actionItems, 'No action items for this lane.');
    renderList(threadsEl, DATA.threads, 'No threaded plays for this lane.');
  }

  function renderRecords() {
    const query = state.query.trim().toLowerCase();
    const laneFiltered = selectedMessages(DATA.messages);
    const filtered = laneFiltered.filter(function (msg) {
      if (!query) return true;
      return (msg.text + ' ' + msg.sender + ' ' + msg.date).toLowerCase().includes(query);
    });
    recordsEl.innerHTML = filtered.length ? filtered.map(function (msg) {
      const flags = []
      if (msg.isDecision) flags.push('decision');
      if (msg.isAction) flags.push('action');
      if (msg.reactions) flags.push(msg.reactions + ' rxn');
      if (msg.files.length) flags.push('file');
      return '<article class="record ' + (msg.isDecision || msg.isAction ? 'is-hot' : '') + '">' +
        '<div class="when">' + esc(msg.date) + '<br>' + esc(msg.time) + '</div>' +
        '<div class="who">' + esc(msg.sender) + '<br>@' + esc(msg.handle) + '</div>' +
        '<div class="txt">' + esc(msg.text) + '</div>' +
        '<div class="flags">' + esc(flags.join(' / ')) + '</div>' +
      '</article>';
    }).join('') : '<div class="empty">No records match this filter.</div>';
  }

  function updateMotion() {
    const p = state.phase;
    const lift = Math.sin(p * Math.PI * 2) * .5 + .5;
    Array.from(document.querySelectorAll('.competitor-lane')).forEach(function (lane, laneIndex) {
      const player = DATA.lanePlayers[laneIndex];
      const skew = laneIndex * .09;
      const local = (lift + skew) % 1;
      const scoreEl = lane.querySelector('[data-score]');
      if (scoreEl) {
        const base = Number(scoreEl.dataset.score || 0);
        scoreEl.textContent = formatScore(base * (.72 + local * .28));
      }
      const bar = lane.querySelector('.kinetic-bar');
      if (bar) {
        const y = 72 - local * 44;
        bar.style.top = y + '%';
        bar.style.width = (58 + local * 18) + '%';
      }
      Array.from(lane.querySelectorAll('.text-line')).forEach(function (line, i) {
        const y = i / 57;
        const shoulders = .34 + .34 * Math.exp(-Math.pow((y - .22) * 7, 2));
        const torso = .22 + .48 * Math.exp(-Math.pow((y - .47) * 4.4, 2));
        const legs = .14 + .24 * Math.exp(-Math.pow((y - .75) * 5, 2));
        const width = clamp(.18, .94, Math.max(shoulders, torso, legs) * (.82 + local * .18));
        const lean = (local - .5) * 18 * (y - .35);
        line.style.width = (width * 100) + '%';
        line.style.marginLeft = ((100 - width * 100) / 2 + lean) + '%';
        line.style.opacity = String(.46 + local * .36 + (player.rank === 1 ? .08 : 0));
      });
    });
  }

  function tick() {
    if (!state.paused) state.phase = (state.phase + .0042 * state.speed) % 1;
    updateMotion();
    window.requestAnimationFrame(tick);
  }

  searchEl.addEventListener('input', function () {
    state.query = searchEl.value || '';
    renderRecords();
  });
  copyEl.addEventListener('click', function () {
    const top = DATA.senders.slice(0, 4).map(function (sender, index) {
      return (index + 1) + '. ' + sender.display + ' - ' + sender.count + ' messages, score ' + Math.round(sender.score);
    }).join('\\n');
    const decisions = DATA.decisions.slice(0, 5).map(function (msg) {
      return '- ' + msg.sender + ': ' + msg.text;
    }).join('\\n');
    const markdown = '# Slack kinetic championship\\n\\n' +
      'Channel: #' + DATA.channel + '\\n' +
      'Range: ' + DATA.dateRange.start + ' to ' + DATA.dateRange.end + '\\n' +
      'Messages: ' + DATA.totalMessages + '\\n\\n' +
      '## Leaderboard\\n' + top + '\\n\\n' +
      '## Decisions\\n' + decisions + '\\n';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(markdown).then(function () {
        copyEl.textContent = 'Copied';
        window.setTimeout(function () { copyEl.textContent = 'Copy as Markdown'; }, 1200);
      });
    }
  });
  speedEl.addEventListener('input', function () {
    state.speed = Number(speedEl.value || .85);
  });
  toggleEl.addEventListener('click', function () {
    state.paused = !state.paused;
    toggleEl.textContent = state.paused ? 'Resume motion' : 'Pause motion';
  });

  renderLeaderboard();
  renderLanes();
  renderEvidence();
  renderRecords();
  updateMotion();
  if (reduceMotion) toggleEl.textContent = 'Resume motion';
  window.requestAnimationFrame(tick);
})();
</script>
</body>
</html>
`
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]))
}
