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
import { parser as whatsappParser } from "./whatsapp.js"
import { parser as csvParser } from "./csv.js"
import { parser as markdownParser } from "./markdown.js"
import { parser as jsonParser } from "./json.js"
import { parser as textParser } from "./text.js"

export const parsers: Parser[] = [
  whatsappParser,   // .txt with timestamp prefix
  csvParser,        // .csv / .tsv
  markdownParser,   // .md / .markdown
  jsonParser,       // .json
  textParser,       // catch-all (plain text)
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
