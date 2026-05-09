#!/usr/bin/env node
/**
 * Quick sanity check: pick a parser for each new example and print the
 * detected contentType + summary. No LLM calls. Run from repo root:
 *
 *   node scripts/dryrun_chat_parse.mjs
 *
 * This is a developer tool; not shipped in the npm package.
 */
import path from "node:path"
import { fileURLToPath } from "node:url"
import { pickParser } from "../dist/parse/index.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")

const inputs = [
  "examples/slack/input.json",
  "examples/discord/input.json",
  "examples/telegram/input.json",
]

for (const rel of inputs) {
  const full = path.join(root, rel)
  const parser = await pickParser(full)
  if (!parser) {
    console.log(`× ${rel} — no parser`)
    continue
  }
  const parsed = await parser.parse(full)
  console.log(`✓ ${rel}`)
  console.log(`  parser: ${parser.name}`)
  console.log(`  contentType: ${parsed.contentType}`)
  console.log(`  summary: ${parsed.summary}`)
  const m = parsed.meta
  console.log(`  messages=${m.messageCount} senders=${m.senderCount} threads=${m.threadCount} reactions=${m.reactionCount} active=${m.activeDays}d range=${m.dateRange}`)
  console.log("")
}
