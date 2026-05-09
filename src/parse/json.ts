/**
 * JSON parser — for already-structured data. Just loads, summarizes
 * the shape (top-level keys, types), and hands it to the LLM. The LLM
 * decides whether this is a list of records (table view), a config
 * tree (collapsible viewer), an API response (key-value layout), etc.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Parser, ParsedFile } from "../types.js"

export const parser: Parser = {
  name: "json",
  matches: [".json"],
  async parse(filepath: string): Promise<ParsedFile> {
    const raw = await fs.readFile(filepath, "utf8")
    const parsed = JSON.parse(raw)

    const shape = describeShape(parsed)
    const meta = {
      sourceFile: path.basename(filepath),
      sizeBytes: Buffer.byteLength(raw, "utf8"),
      shape,
    }

    // Sample: if the root is a large array, take first 5 + last 1.
    // Otherwise, show the whole thing if small, else top-level keys.
    let sample: unknown
    if (Array.isArray(parsed)) {
      sample = {
        type: "array",
        length: parsed.length,
        first: parsed.slice(0, 5),
        last: parsed.length > 6 ? parsed.slice(-1) : [],
      }
    } else if (typeof parsed === "object" && parsed !== null) {
      const entries = Object.entries(parsed).slice(0, 50)
      sample = Object.fromEntries(entries.map(([k, v]) => [k, summarize(v)]))
    } else {
      sample = parsed
    }

    return {
      contentType: "json-data",
      summary: `JSON file (${meta.sizeBytes} bytes, root shape: ${shape}).`,
      sample,
      data: parsed,
      meta,
    }
  },
}

function describeShape(v: unknown): string {
  if (Array.isArray(v)) {
    if (v.length === 0) return "empty array"
    return `array of ${v.length} (item type: ${typeof v[0]})`
  }
  if (v === null) return "null"
  if (typeof v === "object") {
    const keys = Object.keys(v as object)
    return `object with ${keys.length} keys: ${keys.slice(0, 8).join(", ")}${keys.length > 8 ? "…" : ""}`
  }
  return typeof v
}

function summarize(v: unknown): unknown {
  if (Array.isArray(v)) return v.length > 3 ? `[Array of ${v.length}]` : v
  if (typeof v === "string" && v.length > 200) return v.slice(0, 200) + "…"
  if (typeof v === "object" && v !== null) return `[Object: ${describeShape(v)}]`
  return v
}
