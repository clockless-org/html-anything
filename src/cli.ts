#!/usr/bin/env node
/**
 * html-anything CLI.
 *
 * Pipeline: input file → parser → ParsedFile → htmlize (LLM) → HTML.
 *
 *   html-anything <input>             write <input-stem>.html alongside
 *   html-anything <input> --out X     write to X
 *   html-anything <input> --title T   override the document title
 *   html-anything <input> --model M   override the LLM model
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { pickParser } from "./parse/index.js"
import { parser as knowledgeBaseParser } from "./parse/knowledge-base.js"
import { parser as photosTakeoutParser } from "./parse/photos-takeout.js"
import { getStyleReferenceAssets, htmlize, selectStyleForContent } from "./htmlize.js"
import { makeLlm } from "./llm.js"
import type { ConverterOptions, HtmlAnythingStyle, Parser } from "./types.js"

interface ParsedArgs {
  input: string
  out?: string
  options: ConverterOptions
  help: boolean
  version: boolean
}

const PKG_VERSION = "0.1.0"

function parseArgs(argv: string[]): ParsedArgs {
  let input = ""
  let out: string | undefined
  let title: string | undefined
  let style: ConverterOptions["style"] | undefined
  let model: string | undefined
  let maxTokens: number | undefined
  let help = false
  let version = false

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "-h" || a === "--help") help = true
    else if (a === "-V" || a === "--version") version = true
    else if (a === "--out" || a === "-o") out = argv[++i]
    else if (a === "--title") title = argv[++i]
    else if (a === "--style") style = parseStyle(argv[++i])
    else if (a === "--model") model = argv[++i]
    else if (a === "--max-tokens") maxTokens = parseInt(argv[++i] || "", 10)
    else if (a.startsWith("-")) throw new Error(`unknown flag: ${a}`)
    else if (!input) input = a
    else throw new Error(`unexpected positional argument: ${a}`)
  }

  return { input, out, options: { title, style, model, maxTokens }, help, version }
}

const STYLES = new Set<HtmlAnythingStyle | "auto">([
  "auto",
  "default",
  "teaching",
  "love-romance-3d",
  "living-essay",
  "dashboard",
  "soft-saas",
  "kinetic-scoreboard",
  "timeline-story",
  "global-travel",
  "map-atlas",
  "network-map",
  "document",
  "kami-reading",
  "digital-eguide",
  "editorial-carousel",
  "architectural-spread",
  "terminal-cli",
  "developer",
])

function parseStyle(value: string | undefined): ConverterOptions["style"] {
  if (!value) throw new Error("--style requires a value")
  if (!STYLES.has(value as HtmlAnythingStyle | "auto")) {
    throw new Error(`unknown style: ${value} (expected ${[...STYLES].join(", ")})`)
  }
  return value as ConverterOptions["style"]
}

const HELP = `\
html-anything — turn any file into a beautiful, interactive HTML

Usage:
  html-anything <input>                     write <input-stem>.html alongside
  html-anything <input> --out OUT           write to OUT
  html-anything <input> --title "Title"     override the document title
  html-anything <input> --style STYLE       auto, teaching, love-romance-3d, ...
  html-anything <input> --model MODEL       LLM model (default: claude-sonnet-4-6)
  html-anything <input> --max-tokens N      LLM output budget (default: 16384)

Required env: ANTHROPIC_API_KEY (or OPENAI_API_KEY).

The LLM designs the reading experience for *this specific content* — the same
input type renders differently depending on shape (2-person chat → bubble
timeline; 200-person channel → folded by sender). The full data is inlined
into the output; the LLM only ever sees a representative sample.

Default style is auto. Auto injects one of the built-in style prompts
(teaching, love-romance-3d, living-essay, dashboard,
kinetic-scoreboard, timeline-story, global-travel, map-atlas, network-map, document, kami-reading,
editorial-carousel, developer, or default) based on the parsed content type.
Explicit overrides also include digital-eguide, architectural-spread, and
terminal-cli.
`

async function main() {
  let args: ParsedArgs
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (err) {
    console.error(`html-anything: ${(err as Error).message}\n`)
    console.error(HELP)
    process.exit(2)
  }

  if (args.version) { console.log(PKG_VERSION); return }
  if (args.help || !args.input) { console.log(HELP); return }

  const filepath = path.resolve(args.input)
  let stat: Awaited<ReturnType<typeof fs.stat>>
  try {
    stat = await fs.stat(filepath)
  } catch {
    console.error(`html-anything: input not found: ${filepath}`)
    process.exit(1)
    return
  }

  let parser: Parser | null
  if (stat.isDirectory()) {
    if (photosTakeoutParser.detect && await photosTakeoutParser.detect(filepath)) parser = photosTakeoutParser
    else if (knowledgeBaseParser.detect && await knowledgeBaseParser.detect(filepath)) parser = knowledgeBaseParser
    else parser = null
  } else {
    parser = await pickParser(filepath)
  }
  if (!parser) {
    const reason = stat.isDirectory()
      ? "(directory: no Google Photos sidecars and no markdown files found)"
      : (path.extname(filepath) || "(no extension)")
    console.error(`html-anything: no parser for ${reason}`)
    process.exit(1)
  }
  process.stderr.write(`→ parsing as ${parser.name}…\n`)
  const parsed = await parser.parse(filepath)
  process.stderr.write(`  ${parsed.summary}\n`)

  const llm = makeLlm()
  if (!llm) {
    console.error(`html-anything: ANTHROPIC_API_KEY (or OPENAI_API_KEY) required for LLM-driven rendering.`)
    console.error(`              See https://github.com/clockless-org/html-anything for setup.`)
    process.exit(1)
  }

  process.stderr.write(`→ designing page…\n`)
  const selectedStyle = selectStyleForContent(parsed.contentType, args.options)
  const html = await htmlize(parsed, llm, args.options)

  const outPath = args.out
    ? path.resolve(args.out)
    : stat.isDirectory()
      ? path.join(path.dirname(filepath), `${path.basename(filepath)}.html`)
      : path.join(path.dirname(filepath), `${path.basename(filepath, path.extname(filepath))}.html`)
  await fs.writeFile(outPath, html, "utf8")
  const copiedAssets = await copyReferencedStyleAssets(selectedStyle, path.dirname(outPath), html)
  if (copiedAssets.length > 0) {
    process.stderr.write(`→ copied style assets: ${copiedAssets.join(", ")}\n`)
  }
  console.log(`✓ ${path.basename(outPath)} (${(html.length / 1024).toFixed(1)} KB) — open in your browser`)
}

async function copyReferencedStyleAssets(style: HtmlAnythingStyle, outDir: string, html: string): Promise<string[]> {
  const assets = await getStyleReferenceAssets(style)
  const copied: string[] = []
  for (const asset of assets) {
    const htmlPath = asset.outputRelativePath.split(path.sep).join("/")
    if (!html.includes(htmlPath)) continue
    const target = path.join(outDir, asset.outputRelativePath)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.cp(asset.sourcePath, target, { recursive: true })
    copied.push(asset.outputRelativePath)
  }
  return copied
}

main().catch(err => {
  console.error(`html-anything: ${(err as Error).message}`)
  process.exit(1)
})
