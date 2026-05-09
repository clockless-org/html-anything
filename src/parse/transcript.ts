/**
 * Meeting-transcript parser. Handles three timecoded conversation
 * formats with one shared cue model:
 *
 *   - WebVTT (`.vtt`)              — Zoom, Teams, Meet, YouTube exports
 *   - SubRip (`.srt`)              — caption files, common Zoom export
 *   - Zoom / Teams text (`.txt`)   — older non-VTT transcript dumps
 *                                    (numbered cue blocks or
 *                                     `HH:MM:SS Speaker\nbody` blocks)
 *
 * Speakers are extracted from one of three signals, in order:
 *   1. WebVTT voice tags: `<v Sam Reyes>...</v>`
 *   2. Cue body prefix:   `Sam Reyes: ...`
 *   3. Block-level header line that comes before the timestamp range
 *
 * The parser only normalizes — it does NOT classify decisions / actions
 * / questions. That's the LLM's job in the transcript prompt; trying to
 * regex it here would be fragile (and the prompt has the context to
 * choose which turns are real action items vs. throwaway "I'll grab a
 * coffee").
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Parser, ParsedFile } from "../types.js"

interface Cue {
  id: string
  startMs: number
  endMs: number
  durationMs: number
  startLabel: string
  speaker: string | null
  text: string
}

interface SpeakerStat {
  name: string
  cueCount: number
  wordCount: number
  talkSeconds: number
  sharePct: number
}

type TranscriptFormat = "vtt" | "srt" | "transcript-txt"

const SRT_RANGE = /(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})/
const VTT_RANGE = /((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)/
const SIMPLE_TS_LINE = /^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+?)\s*$/
const VOICE_TAG = /<v(?:\.[\w-]+)?\s+([^>]+?)>([\s\S]*?)<\/v>/
const SPEAKER_PREFIX = /^([A-Za-z][\p{L}\p{M}\p{N}'.\- ]{0,40}?):\s+(.+)$/u

export const parser: Parser = {
  name: "transcript",
  matches: [".vtt", ".srt", ".txt"],
  async detect(filepath: string): Promise<boolean> {
    try {
      const ext = path.extname(filepath).toLowerCase()
      if (ext === ".vtt") return true
      if (ext === ".srt") return true
      // For .txt we have to disambiguate from WhatsApp / plain text.
      // Be strict: require either a WEBVTT header, several SRT-shaped
      // numbered cues, or several Zoom-style "HH:MM:SS Speaker\nbody"
      // blocks. Two hits beats spurious matches in plain prose.
      const fd = await fs.open(filepath, "r")
      const buf = Buffer.alloc(8192)
      const { bytesRead } = await fd.read(buf, 0, buf.length, 0)
      await fd.close()
      const sample = buf.subarray(0, bytesRead).toString("utf8").replace(/\r\n/g, "\n")
      if (/^\s*WEBVTT\b/.test(sample)) return true
      const srtHits = (sample.match(/\n\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/g) || []).length
      if (srtHits >= 2) return true
      // Older Zoom non-VTT export: `HH:MM:SS Speaker\nbody`.
      const zoomHits = sample
        .split("\n")
        .filter(line => /^\d{1,2}:\d{2}:\d{2}\s+[A-Z][\p{L}\p{M}'.\- ]{0,40}\s*$/u.test(line)).length
      return zoomHits >= 2
    } catch {
      return false
    }
  },
  async parse(filepath: string): Promise<ParsedFile> {
    const raw = await fs.readFile(filepath, "utf8")
    const ext = path.extname(filepath).toLowerCase()
    const format = pickFormat(ext, raw)

    let cues: Cue[]
    if (format === "vtt") cues = parseVtt(raw)
    else if (format === "srt") cues = parseSrt(raw)
    else cues = parseTextTranscript(raw)

    const durationMs = cues.length ? cues[cues.length - 1].endMs : 0
    const speakers = aggregateSpeakers(cues, durationMs)
    const speakerCount = speakers.length

    const meta: Record<string, unknown> & { sourceFile: string; sizeBytes: number } = {
      sourceFile: path.basename(filepath),
      sizeBytes: Buffer.byteLength(raw, "utf8"),
      format,
      durationMs,
      durationLabel: formatDuration(durationMs),
      cueCount: cues.length,
      speakerCount,
      speakers: speakers.map(s => ({
        name: s.name,
        cueCount: s.cueCount,
        wordCount: s.wordCount,
        talkSeconds: s.talkSeconds,
        sharePct: s.sharePct,
      })),
      hasSpeakerLabels: speakers.some(s => s.name && s.name !== "Unknown"),
    }

    // Sample for the LLM: enough context to design the page without
    // dragging in the full transcript. First/last cues anchor the
    // opening/closing tone; longest cues + each speaker's first turn
    // give the LLM voice samples to pull headline copy from.
    const longestCues = cues
      .slice()
      .sort((a, b) => b.text.length - a.text.length)
      .slice(0, 8)
      .sort((a, b) => a.startMs - b.startMs)
    const speakerOpeners: Cue[] = []
    const seenSpeakers = new Set<string>()
    for (const c of cues) {
      const key = c.speaker || "Unknown"
      if (seenSpeakers.has(key)) continue
      seenSpeakers.add(key)
      speakerOpeners.push(c)
      if (speakerOpeners.length >= 8) break
    }

    const sample = {
      ...meta,
      first: cues.slice(0, 12).map(stripCue),
      last: cues.slice(-4).map(stripCue),
      longestCues: longestCues.map(stripCue),
      speakerOpeners: speakerOpeners.map(stripCue),
    }

    return {
      contentType: "transcript",
      summary:
        `Meeting transcript (${format.toUpperCase()}): ${cues.length} cue${cues.length === 1 ? "" : "s"}, ` +
        `${speakerCount} speaker${speakerCount === 1 ? "" : "s"}, ${formatDuration(durationMs)}.`,
      sample,
      data: { cues, speakers, ...meta },
      meta,
    }
  },
}

// ---------------------------------------------------------------------------
// Format pickers
// ---------------------------------------------------------------------------

function pickFormat(ext: string, raw: string): TranscriptFormat {
  if (ext === ".vtt") return "vtt"
  if (ext === ".srt") return "srt"
  // .txt — sniff
  if (/^\s*WEBVTT\b/.test(raw)) return "vtt"
  if (/\n\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/.test(raw)) return "srt"
  return "transcript-txt"
}

// ---------------------------------------------------------------------------
// VTT
// ---------------------------------------------------------------------------

function parseVtt(raw: string): Cue[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n")
  // Trim WEBVTT header + any STYLE / NOTE / REGION blocks at top.
  let i = 0
  if (i < lines.length && /^\s*WEBVTT/.test(lines[i])) i++
  const cues: Cue[] = []
  let counter = 0
  while (i < lines.length) {
    while (i < lines.length && lines[i].trim() === "") i++
    if (i >= lines.length) break
    // STYLE / NOTE / REGION blocks: skip until blank line.
    if (/^(NOTE|STYLE|REGION)\b/.test(lines[i])) {
      while (i < lines.length && lines[i].trim() !== "") i++
      continue
    }
    // Optional cue identifier line that is not a timestamp.
    let identifier = ""
    if (!VTT_RANGE.test(lines[i]) && i + 1 < lines.length && VTT_RANGE.test(lines[i + 1])) {
      identifier = lines[i].trim()
      i++
    }
    const tsLine = lines[i] || ""
    const m = VTT_RANGE.exec(tsLine)
    if (!m) {
      // Not a cue line we recognize; skip.
      i++
      continue
    }
    i++
    const bodyLines: string[] = []
    while (i < lines.length && lines[i].trim() !== "") {
      bodyLines.push(lines[i])
      i++
    }
    const startMs = parseTimecode(m[1])
    const endMs = parseTimecode(m[2])
    if (!isFinite(startMs) || !isFinite(endMs)) continue
    const rawBody = bodyLines.join("\n").trim()
    const { speaker, text } = extractSpeaker(rawBody)
    if (!text) continue
    counter++
    cues.push({
      id: identifier || `c_${String(counter).padStart(4, "0")}`,
      startMs,
      endMs,
      durationMs: Math.max(0, endMs - startMs),
      startLabel: formatTimestampLabel(startMs),
      speaker,
      text,
    })
  }
  return mergeAdjacentSameSpeaker(cues)
}

// ---------------------------------------------------------------------------
// SRT
// ---------------------------------------------------------------------------

function parseSrt(raw: string): Cue[] {
  const text = raw.replace(/\r\n/g, "\n").replace(/^﻿/, "")
  const blocks = text.split(/\n\s*\n/)
  const cues: Cue[] = []
  let counter = 0
  for (const block of blocks) {
    const blockLines = block.split("\n").map(l => l.trimEnd())
    let li = 0
    // Optional numeric id line.
    if (blockLines[li] && /^\d+$/.test(blockLines[li].trim())) li++
    const tsLine = blockLines[li] || ""
    const m = SRT_RANGE.exec(tsLine)
    if (!m) continue
    li++
    const bodyLines = blockLines.slice(li).filter(l => l.trim() !== "")
    if (!bodyLines.length) continue
    const startMs = parseTimecode(m[1])
    const endMs = parseTimecode(m[2])
    if (!isFinite(startMs) || !isFinite(endMs)) continue
    const rawBody = bodyLines.join("\n").trim()
    const { speaker, text: bodyText } = extractSpeaker(rawBody)
    if (!bodyText) continue
    counter++
    cues.push({
      id: `c_${String(counter).padStart(4, "0")}`,
      startMs,
      endMs,
      durationMs: Math.max(0, endMs - startMs),
      startLabel: formatTimestampLabel(startMs),
      speaker,
      text: bodyText,
    })
  }
  return mergeAdjacentSameSpeaker(cues)
}

// ---------------------------------------------------------------------------
// Plain-text transcript: Zoom non-VTT export, Teams text dumps.
//
// Recognized shapes (any one is enough):
//   A) `HH:MM:SS Speaker\nbody\n\n`
//   B) `HH:MM Speaker\nbody\n\n`
//   C) numbered cue blocks (SRT-without-extension; handled in parseSrt
//      after format sniff)
// ---------------------------------------------------------------------------

function parseTextTranscript(raw: string): Cue[] {
  const text = raw.replace(/\r\n/g, "\n").replace(/^﻿/, "")
  const blocks = text.split(/\n\s*\n/)
  const cues: Cue[] = []
  let counter = 0
  for (const block of blocks) {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean)
    if (!lines.length) continue
    const head = lines[0]
    const m = SIMPLE_TS_LINE.exec(head)
    if (!m) continue
    const startMs = parseTimecode(m[1])
    if (!isFinite(startMs)) continue
    const rest = m[2].trim()
    const speaker = looksLikeSpeaker(rest) ? rest : null
    const bodyLines = lines.slice(1)
    if (speaker) {
      const body = bodyLines.join(" ").trim()
      if (!body) continue
      counter++
      cues.push({
        id: `c_${String(counter).padStart(4, "0")}`,
        startMs,
        endMs: startMs,
        durationMs: 0,
        startLabel: formatTimestampLabel(startMs),
        speaker,
        text: body,
      })
    } else {
      // `HH:MM:SS something the speaker said` — speaker is missing.
      const body = [rest, ...bodyLines].join(" ").trim()
      const { speaker: ss, text: tt } = extractSpeaker(body)
      counter++
      cues.push({
        id: `c_${String(counter).padStart(4, "0")}`,
        startMs,
        endMs: startMs,
        durationMs: 0,
        startLabel: formatTimestampLabel(startMs),
        speaker: ss,
        text: tt,
      })
    }
  }
  // Estimate end times from the next cue's start so talk-time is meaningful.
  for (let i = 0; i < cues.length; i++) {
    const next = cues[i + 1]
    if (next && next.startMs > cues[i].startMs) {
      cues[i].endMs = next.startMs
      cues[i].durationMs = cues[i].endMs - cues[i].startMs
    } else if (cues[i].endMs === cues[i].startMs) {
      // last cue or nondecreasing: estimate from word count at ~165 wpm
      const words = cues[i].text.split(/\s+/).filter(Boolean).length
      const ms = Math.round((words / 165) * 60 * 1000)
      cues[i].endMs = cues[i].startMs + Math.max(2000, ms)
      cues[i].durationMs = cues[i].endMs - cues[i].startMs
    }
  }
  return mergeAdjacentSameSpeaker(cues)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTimecode(s: string): number {
  const cleaned = s.trim().replace(",", ".")
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(cleaned)
  if (!m) return NaN
  const h = m[1] ? parseInt(m[1], 10) : 0
  const mm = parseInt(m[2], 10)
  const ss = parseInt(m[3], 10)
  const ms = m[4] ? parseInt(m[4].padEnd(3, "0").slice(0, 3), 10) : 0
  return h * 3600000 + mm * 60000 + ss * 1000 + ms
}

function formatTimestampLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "0s"
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s ? `${s}s` : ""}`.trim()
  return `${s}s`
}

function extractSpeaker(rawBody: string): { speaker: string | null; text: string } {
  // 1) Voice tag: `<v Speaker Name>body</v>`
  const voice = VOICE_TAG.exec(rawBody)
  if (voice) {
    return {
      speaker: voice[1].trim(),
      text: stripCueMarkup(voice[2].trim()),
    }
  }
  // 2) Body prefix on the first line: `Speaker Name: body`
  const firstLineEnd = rawBody.indexOf("\n")
  const firstLine = firstLineEnd === -1 ? rawBody : rawBody.slice(0, firstLineEnd)
  const restLines = firstLineEnd === -1 ? "" : rawBody.slice(firstLineEnd + 1)
  const sp = SPEAKER_PREFIX.exec(firstLine)
  if (sp && looksLikeSpeaker(sp[1])) {
    const text = [sp[2].trim(), restLines.trim()].filter(Boolean).join(" ")
    return { speaker: sp[1].trim(), text: stripCueMarkup(text) }
  }
  return { speaker: null, text: stripCueMarkup(rawBody) }
}

function looksLikeSpeaker(s: string): boolean {
  // Heuristic: short, mostly letters / spaces, no sentence punctuation.
  const t = s.trim()
  if (!t || t.length > 40) return false
  if (/[?!]/.test(t)) return false
  if (/\d/.test(t) && !/^\d/.test(t)) return false  // allow "2 of us" style as not a speaker
  if ((t.match(/\s/g) || []).length > 5) return false
  // Must look like a name or role: starts with letter, not an entire sentence.
  if (!/^[A-Za-z]/.test(t)) return false
  return true
}

function stripCueMarkup(s: string): string {
  return s
    .replace(/<\/?v(?:\.[\w-]+)?(?:\s+[^>]*)?>/g, "")
    .replace(/<\/?c(?:\.[\w-]+)?>/g, "")
    .replace(/<\d{1,2}:\d{2}:\d{2}(?:\.\d+)?>/g, "")  // VTT timestamp anchors mid-cue
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
}

function mergeAdjacentSameSpeaker(cues: Cue[]): Cue[] {
  // Caption files often split a single utterance into 2-3 second cues.
  // Merge adjacent cues from the same speaker if the gap between them
  // is < 1.5s — that gives the LLM and the rendered transcript a more
  // human-feeling turn structure without losing timestamp granularity.
  if (cues.length < 2) return cues
  const out: Cue[] = []
  let prev: Cue | null = null
  for (const c of cues) {
    if (
      prev &&
      prev.speaker === c.speaker &&
      c.startMs - prev.endMs < 1500 &&
      (prev.text + " " + c.text).length < 600
    ) {
      prev.endMs = Math.max(prev.endMs, c.endMs)
      prev.durationMs = prev.endMs - prev.startMs
      prev.text = (prev.text + " " + c.text).replace(/\s+/g, " ").trim()
      continue
    }
    prev = { ...c }
    out.push(prev)
  }
  // Reassign sequential ids so the merged stream has a clean index.
  out.forEach((c, i) => { c.id = `c_${String(i + 1).padStart(4, "0")}` })
  return out
}

function aggregateSpeakers(cues: Cue[], totalMs: number): SpeakerStat[] {
  const map = new Map<string, SpeakerStat>()
  let totalSpoken = 0
  for (const c of cues) {
    const key = c.speaker || "Unknown"
    const cur = map.get(key) || { name: key, cueCount: 0, wordCount: 0, talkSeconds: 0, sharePct: 0 }
    cur.cueCount++
    cur.wordCount += (c.text.match(/\S+/g) || []).length
    const seconds = Math.max(0, Math.round(c.durationMs / 1000))
    cur.talkSeconds += seconds
    totalSpoken += seconds
    map.set(key, cur)
  }
  const denom = totalSpoken || Math.max(1, Math.round(totalMs / 1000))
  for (const s of map.values()) {
    s.sharePct = Math.round((s.talkSeconds / denom) * 1000) / 10
  }
  return Array.from(map.values()).sort((a, b) => b.talkSeconds - a.talkSeconds)
}

function stripCue(c: Cue): Cue {
  if (c.text.length <= 320) return c
  return { ...c, text: c.text.slice(0, 320) + "…" }
}
