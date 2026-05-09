/**
 * Parser registry. Each parser turns a file into a `ParsedFile` (structured
 * JSON + summary + sample). htmlize then takes that and asks the LLM to
 * design + render the HTML.
 *
 * Order matters: `detect`-based parsers come before pure extension matches
 * so a WhatsApp `.txt` isn't treated as plain text.
 */
import * as path from "node:path"
import type { Parser } from "../types.js"
import { parser as emailParser } from "./email.js"
import { parser as transcriptParser } from "./transcript.js"
import { parser as whatsappParser } from "./whatsapp.js"
import { parser as slackParser } from "./slack.js"
import { parser as discordParser } from "./discord.js"
import { parser as telegramParser } from "./telegram.js"
import { parser as imessageParser } from "./imessage.js"
import { parser as csvParser } from "./csv.js"
import { parser as markdownParser } from "./markdown.js"
import { parser as jsonlParser } from "./jsonl.js"
import { parser as jsonParser } from "./json.js"
import { parser as pdfParser } from "./pdf.js"
import { parser as docxParser } from "./docx.js"
import { parser as developerArtifactParser } from "./developer-artifact.js"
import { parser as logParser } from "./log.js"
import { parser as planningParser } from "./planning.js"
import { parser as financeParser } from "./finance.js"
import { parser as textParser } from "./text.js"

export const parsers: Parser[] = [
  emailParser,              // .eml / .mbox (also catches Gmail Takeout exports)
  transcriptParser,         // .vtt / .srt / timecoded .txt (Zoom, Teams, Meet, YouTube)
  whatsappParser,           // .txt with timestamp prefix
  slackParser,              // .json — Slack channel export array
  discordParser,            // .json / .csv — DiscordChatExporter
  telegramParser,           // .json — Telegram Desktop result.json
  imessageParser,           // .csv — iMessage-style / generic multi-sender chat
  planningParser,           // .ics / .json (Trello) / .csv (Linear/Jira/GitHub issue trackers)
  financeParser,            // .csv / .tsv — bank txns, invoices, QuickBooks/Xero GL & P&L
  jsonlParser,              // .jsonl / .ndjson; also detects line-delimited JSON in .json/.log/.txt
  csvParser,                // .csv / .tsv (generic tabular fallback)
  markdownParser,           // .md / .markdown
  jsonParser,               // .json (generic fallback)
  pdfParser,                // .pdf
  docxParser,               // .docx
  developerArtifactParser,  // .diff / .patch / .log / .txt — diffs, PRs, CI logs, traces
  logParser,                // .log / .txt — Apache/Nginx access logs, syslog, error/app logs
  textParser,               // catch-all (plain text)
]

export async function pickParser(filepath: string): Promise<Parser | null> {
  const ext = path.extname(filepath).toLowerCase()
  const candidates = parsers.filter(p => p.matches.includes(ext) || p.matches.includes("*"))
  for (const p of candidates) {
    if (!p.detect) return p
    if (await p.detect(filepath)) return p
  }
  return null
}
