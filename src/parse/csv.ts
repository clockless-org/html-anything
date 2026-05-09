/**
 * Parse CSV / TSV into structured rows. RFC-4180-ish, no deps.
 * Detects separator (comma / tab / semicolon / pipe) from the first line.
 * Detects numeric columns by sampling — useful for the LLM when it
 * decides whether to lay rows out as a table or as charts.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Parser, ParsedFile } from "../types.js"

export const parser: Parser = {
  name: "csv",
  matches: [".csv", ".tsv"],
  async parse(filepath: string): Promise<ParsedFile> {
    const raw = await fs.readFile(filepath, "utf8")
    const sep = path.extname(filepath).toLowerCase() === ".tsv" ? "\t" : detectSep(raw)
    const rows = parseCsv(raw, sep)
    const headers = rows[0] || []
    const data = rows.slice(1)

    const numericCols: string[] = []
    for (let c = 0; c < headers.length; c++) {
      const sampleSize = Math.min(50, data.length)
      let hits = 0
      for (let r = 0; r < sampleSize; r++) {
        const v = data[r]?.[c] || ""
        if (/^-?[\d,]+(\.\d+)?$/.test(v.replace(/[$%\s]/g, ""))) hits++
      }
      if (sampleSize > 0 && hits / sampleSize >= 0.7) numericCols.push(headers[c])
    }

    const meta = {
      sourceFile: path.basename(filepath),
      sizeBytes: Buffer.byteLength(raw, "utf8"),
      rowCount: data.length,
      columnCount: headers.length,
      headers,
      numericColumns: numericCols,
      separator: sep === "\t" ? "tab" : sep,
    }

    // Sample: header + first 5 + last 2. Keeps the prompt small while
    // letting the LLM see both the schema and a sense of the value
    // distribution.
    const sampleRows = [
      ...data.slice(0, 5),
      ...(data.length > 7 ? data.slice(-2) : []),
    ]

    return {
      contentType: "csv-tabular",
      summary: `${data.length}-row CSV with ${headers.length} columns (${numericCols.length} numeric: ${numericCols.slice(0, 4).join(", ")}${numericCols.length > 4 ? "…" : ""}).`,
      sample: { ...meta, sampleRows },
      data: { rows: data, ...meta },
      meta,
    }
  },
}

function detectSep(raw: string): string {
  const line = raw.split(/\r?\n/, 1)[0] || ""
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0, "|": 0 }
  for (const ch of line) if (ch in counts) counts[ch]++
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return best && best[1] > 0 ? best[0] : ","
}

function parseCsv(raw: string, sep: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let i = 0
  let inQuotes = false
  while (i < raw.length) {
    const ch = raw[i]
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false
        i++
      } else { field += ch; i++ }
    } else {
      if (ch === '"') { inQuotes = true; i++; continue }
      if (ch === sep) { row.push(field); field = ""; i++; continue }
      if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue }
      if (ch === "\r") { i++; continue }
      field += ch
      i++
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}
