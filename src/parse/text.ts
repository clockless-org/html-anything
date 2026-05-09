/**
 * Catch-all text parser. Used for `.txt`, `.log`, and any file the
 * other parsers don't claim. Gives the LLM enough sample to decide
 * the right reading layout.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Parser, ParsedFile } from "../types.js"

export const parser: Parser = {
  name: "text",
  matches: [".txt", ".log", ".text", "*"],
  async parse(filepath: string): Promise<ParsedFile> {
    const raw = await fs.readFile(filepath, "utf8")
    const lines = raw.split("\n")
    const meta = {
      sourceFile: path.basename(filepath),
      sizeBytes: Buffer.byteLength(raw, "utf8"),
      lineCount: lines.length,
      wordCount: raw.split(/\s+/).filter(Boolean).length,
    }
    return {
      contentType: "plain-text",
      summary: `Plain text file, ${lines.length} lines, ${meta.wordCount} words.`,
      sample: {
        ...meta,
        opening: raw.slice(0, 1500),
        closing: raw.length > 3000 ? raw.slice(-500) : "",
      },
      data: { text: raw, lines, ...meta },
      meta,
    }
  },
}
