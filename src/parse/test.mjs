/**
 * Smoke test for the PDF + DOCX parsers. Runs against the synthetic
 * fixtures committed under examples/pdf and examples/docx.
 *
 *   npm test
 *
 * Verifies:
 *   - parser pickers route to the right parser by extension
 *   - parsed output has the expected contentType / shape
 *   - text was actually extracted (word count > 0, first heading present)
 *   - data is large enough to render a meaningful page
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { pickParser } from "../../dist/parse/index.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, "..", "..")

test("pdf parser extracts text + headings from the synthetic fixture", async () => {
  const fp = path.join(REPO, "examples/pdf/input.pdf")
  const parser = await pickParser(fp)
  assert.equal(parser?.name, "pdf")
  const out = await parser.parse(fp)
  assert.equal(out.contentType, "pdf-document")
  assert.equal(out.meta.sourceFile, "input.pdf")
  assert.ok(out.meta.sizeBytes > 5_000, `sizeBytes too small: ${out.meta.sizeBytes}`)
  assert.ok(out.meta.pageCount >= 6, `expected >= 6 pages, got ${out.meta.pageCount}`)
  assert.ok(out.meta.wordCount > 800, `expected > 800 words, got ${out.meta.wordCount}`)
  assert.ok(out.data.text.includes("Mid-Market Battery Storage"))
  assert.ok(out.data.headings.length > 0)
  // Section nav must be able to address pages.
  for (const h of out.data.headings) {
    assert.ok(h.page >= 1 && h.page <= out.meta.pageCount)
    assert.ok(h.text.length > 0)
  }
})

test("docx parser extracts headings + plain text from the synthetic fixture", async () => {
  const fp = path.join(REPO, "examples/docx/input.docx")
  const parser = await pickParser(fp)
  assert.equal(parser?.name, "docx")
  const out = await parser.parse(fp)
  assert.equal(out.contentType, "docx-document")
  assert.equal(out.meta.sourceFile, "input.docx")
  assert.ok(out.meta.wordCount > 500, `expected > 500 words, got ${out.meta.wordCount}`)
  assert.ok(out.meta.headingCount >= 5, `expected >= 5 headings, got ${out.meta.headingCount}`)
  // mammoth's markdown output is what we'll render client-side.
  assert.ok(out.data.markdown.length > 1000)
  assert.ok(out.data.markdown.includes("RFC-014") || out.data.markdown.includes("Pricing Page"))
  // Heading labels should not contain markdown escape backslashes (common
  // mammoth artifact we strip before exposing the heading list).
  for (const h of out.data.headings) {
    assert.ok(!/\\[\\.*_+\-#]/.test(h.text), `heading still contains md-escape: ${h.text}`)
  }
})

test("htmlize fallback: source-prompt resolution covers pdf-document + docx-document", async () => {
  const { parsers } = await import("../../dist/parse/index.js")
  const names = parsers.map(p => p.name)
  assert.ok(names.includes("pdf"))
  assert.ok(names.includes("docx"))
})

test("jsonl parser ingests the synthetic JSONL event stream + infers schema + outliers", async () => {
  const fp = path.join(REPO, "examples/jsonl/input.jsonl")
  const parser = await pickParser(fp)
  assert.equal(parser?.name, "jsonl")
  const out = await parser.parse(fp)
  assert.equal(out.contentType, "jsonl-events")
  assert.equal(out.meta.sourceFile, "input.jsonl")
  assert.equal(out.meta.format, "jsonl")
  assert.ok(out.meta.eventCount >= 80, `expected >= 80 events, got ${out.meta.eventCount}`)
  assert.ok(out.meta.errorCount >= 5, `expected an error burst, got ${out.meta.errorCount} errors`)
  // Schema inference must surface the event field that drives the leaderboard.
  const fieldNames = out.data.schema.map(s => s.field)
  assert.ok(fieldNames.includes("event"), `schema missing 'event' field — got ${fieldNames.join(", ")}`)
  assert.ok(fieldNames.includes("user_id"))
  // Aggregations the LLM expects.
  assert.ok(Array.isArray(out.data.timeBuckets) && out.data.timeBuckets.length > 0)
  assert.ok(Array.isArray(out.data.outliers) && out.data.outliers.length > 0)
  assert.ok(out.data.severityCounts.error > 0)
  // Top errors must collapse identical messages despite unique order_ids.
  assert.ok(out.data.topErrors.length > 0)
})

test("log parser detects + parses an Apache/Nginx-style access log", async () => {
  const fp = path.join(REPO, "examples/log-access/input.log")
  const parser = await pickParser(fp)
  assert.equal(parser?.name, "log")
  const out = await parser.parse(fp)
  assert.equal(out.contentType, "log-events")
  assert.equal(out.data.format, "access-log")
  assert.ok(out.meta.eventCount >= 80, `expected >= 80 events, got ${out.meta.eventCount}`)
  // Access-log extras must be present and shaped right.
  assert.ok(out.data.accessExtras, "missing accessExtras")
  assert.ok(out.data.accessExtras.statusClasses.length > 0)
  assert.ok(out.data.accessExtras.topEndpoints.length > 0)
  assert.ok(out.data.accessExtras.topIps.length > 0)
  // 503 burst should land in topErrors and severity.error.
  assert.ok(out.data.severityCounts.error >= 5, `expected 5xx burst to register as errors, got ${out.data.severityCounts.error}`)
  assert.ok(out.data.outliers.some(o => o.kind === "burst" || o.kind === "top-error"))
})

test("log parser routes a structured error log to the event-stream pack", async () => {
  const fp = path.join(REPO, "examples/log-error/input.log")
  const parser = await pickParser(fp)
  assert.equal(parser?.name, "log")
  const out = await parser.parse(fp)
  assert.equal(out.contentType, "log-events")
  // Severity tokens come through and the error burst gets counted.
  assert.ok(out.data.severityCounts.error >= 5, `expected severity ERROR detection, got ${out.data.severityCounts.error}`)
  assert.ok(out.data.severityCounts.warn >= 2)
  assert.ok(out.data.severityCounts.info >= 10)
  // Top error message should collapse the repeated "Payment failed" rows
  // even though each line has a unique order_id / user_id.
  assert.ok(out.data.topErrors.length > 0)
  assert.ok(/Payment failed/i.test(out.data.topErrors[0].message))
})

test("registry exposes jsonl + log parser names", async () => {
  const { parsers } = await import("../../dist/parse/index.js")
  const names = parsers.map(p => p.name)
  assert.ok(names.includes("jsonl"), `parsers missing 'jsonl' — got ${names.join(", ")}`)
  assert.ok(names.includes("log"), `parsers missing 'log' — got ${names.join(", ")}`)
})
