/**
 * Markdown parser — the lightest possible. We don't render markdown to
 * HTML here; the LLM does that when it designs the page. Our job is
 * just to expose structure (headings, word count, length) so the LLM
 * can decide whether to lay this out as one column with TOC, a 2-pane
 * reader with collapsible sections, etc.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Parser, ParsedFile } from "../types.js"

export const parser: Parser = {
  name: "markdown",
  matches: [".md", ".markdown", ".mdown", ".mkd"],
  async parse(filepath: string): Promise<ParsedFile> {
    const raw = await fs.readFile(filepath, "utf8")
    const lines = raw.split("\n")
    const headings: { level: number; text: string }[] = []
    for (const line of lines) {
      const m = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
      if (m) headings.push({ level: m[1].length, text: m[2] })
    }
    const wordCount = raw.split(/\s+/).filter(Boolean).length
    const meta = {
      sourceFile: path.basename(filepath),
      sizeBytes: Buffer.byteLength(raw, "utf8"),
      wordCount,
      lineCount: lines.length,
      headingCount: headings.length,
    }
    const summary =
      `Markdown document, ${wordCount} words, ${lines.length} lines, ` +
      `${headings.length} heading${headings.length === 1 ? "" : "s"}` +
      (headings.length ? ` (top: "${headings[0].text}")` : "")
    return {
      contentType: "markdown-document",
      summary,
      sample: {
        ...meta,
        headings: headings.slice(0, 30),
        opening: raw.slice(0, 1500),
      },
      data: { markdown: raw, headings, ...meta },
      meta,
    }
  },
}
