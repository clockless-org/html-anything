/**
 * htmlize: ParsedFile → single self-contained HTML.
 *
 * The LLM gets:
 *  - what kind of content this is (`contentType`, `summary`)
 *  - a small representative sample
 *  - the schema / structure metadata
 *
 * It returns a complete HTML document with a `__DATA__` placeholder.
 * We replace that placeholder with the FULL data inlined as a JSON
 * literal — the LLM never has to see (or process) the full file.
 *
 * This split is the whole point of the architecture:
 *  - LLM designs *the experience* (what UI, what filters, what shape)
 *  - Code injects *the data* (whole file, no truncation)
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import type { ConverterOptions, LlmHelper, ParsedFile } from "./types.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROMPTS_DIR = path.resolve(__dirname, "..", "prompts")

const BASE_PROMPT = `You are designing a single self-contained HTML page that is the **best possible reading and interaction experience** for the specific content in front of you.

You are not converting the file — you are designing the right reading UX *for this content*. Same content type means different layouts depending on shape:
- A 2-person friend chat → bubble timeline grouped by day
- A 200-person Slack channel → folded by sender, top-contributors view
- A 50-row sales CSV → sortable table
- A 50,000-row CSV → summary charts + virtualized rows

Produce a complete \`<!doctype html>\` document with these properties:
1. **Single file.** Inline ALL CSS in <style>, ALL JS in <script>. No external resources except a Google Font import if useful (pick one). No CDNs for libraries.
2. **Mobile-first responsive.** Looks right on phone, scales up.
3. **Light + dark mode** via prefers-color-scheme. Tasteful, modern type.
4. **Search and copy by default.** Cmd-F-style search box that filters or highlights. Copy buttons where they help.
5. **Self-contained.** Must work offline by double-clicking the file.

The full data is given to you as a JSON object, but **embed it via the literal placeholder \`__DATA__\`** inside a <script> tag:
\`\`\`
<script>const DATA = __DATA__;</script>
\`\`\`
The host program will substitute \`__DATA__\` with the full data after you respond. You only see a sample, but write JS that handles the *full* shape using the schema in the user message.

Return ONLY the HTML, starting with \`<!doctype html>\`. No markdown fences, no commentary.`

export async function htmlize(
  parsed: ParsedFile,
  llm: LlmHelper,
  options: ConverterOptions = {},
): Promise<string> {
  // Two prompts get loaded for every conversion:
  //   1. _design.md — Clockless design tokens (colors, fonts, spacing).
  //      Non-negotiable; applied to every output for brand consistency.
  //   2. <contentType>.md — source-specific guidance (what to analyze,
  //      what to visualize, data shape). Falls back to default.md.
  // The skill (Claude Code mode) reads the same two files, so both
  // modes converge on identical output styling.
  const designPrompt = await loadPromptFile("_design.md")
  const sourcePrompt = await loadSourcePrompt(parsed.contentType)
  const userPrompt = buildUserPrompt(parsed, options, designPrompt, sourcePrompt)

  const raw = await llm.ask(`${BASE_PROMPT}\n\n---\n\n${userPrompt}`, {
    model: options.model || "claude-sonnet-4-6",
    maxTokens: options.maxTokens ?? 16384,
  })

  const html = stripMarkdownFence(raw).trim()
  if (!html.toLowerCase().startsWith("<!doctype")) {
    // The model occasionally prefaces output despite instructions; rescue.
    const idx = html.toLowerCase().indexOf("<!doctype")
    if (idx > 0) return injectData(html.slice(idx), parsed.data)
    throw new Error(`htmlize: model returned non-HTML output (first 200 chars: ${html.slice(0, 200)})`)
  }
  return injectData(html, parsed.data)
}

function buildUserPrompt(
  parsed: ParsedFile,
  options: ConverterOptions,
  designPrompt: string,
  sourcePrompt: string,
): string {
  const title = options.title || parsed.meta.sourceFile.replace(/\.[^.]+$/, "")
  return [
    `Content type: ${parsed.contentType}`,
    `Summary: ${parsed.summary}`,
    `Document title: ${title}`,
    "",
    "## Design system (apply to every output, regardless of source)",
    designPrompt,
    "",
    "## Source-specific guidance",
    sourcePrompt,
    "",
    "## Schema + stats",
    "(Describes the FULL data, not just the sample below.)",
    "```json",
    JSON.stringify(parsed.meta, null, 2),
    "```",
    "",
    "## Representative sample",
    "(The FULL data has the same shape; design for the full data.)",
    "```json",
    JSON.stringify(parsed.sample, null, 2).slice(0, 16000),
    "```",
    "",
    "Now produce the HTML.",
  ].join("\n")
}

async function loadPromptFile(name: string): Promise<string> {
  try {
    return await fs.readFile(path.join(PROMPTS_DIR, name), "utf8")
  } catch {
    return ""
  }
}

async function loadSourcePrompt(contentType: string): Promise<string> {
  // Pick the most specific prompt available, then prepend any shared
  // family prompt so multi-format families (markdown / pdf / docx) get
  // identical insight-first guidance without duplicating it.
  const candidates = [
    `${contentType}.md`,                                              // exact
    `${contentType.replace(/-(chat|tabular|document|data)$/, "")}.md`, // strip suffix
    "default.md",
  ]
  const seen = new Set<string>()
  let body = ""
  for (const name of candidates) {
    if (seen.has(name)) continue
    seen.add(name)
    const content = await loadPromptFile(name)
    if (content) { body = content; break }
  }
  const familyPrompt = familyFor(contentType)
  if (!familyPrompt) return body
  const shared = await loadPromptFile(familyPrompt)
  if (!shared) return body
  return `${shared}\n\n---\n\n${body}`
}

function familyFor(contentType: string): string | null {
  // Long-form documents share insight-first guidance.
  if (
    contentType === "markdown-document" ||
    contentType === "pdf-document" ||
    contentType === "docx-document"
  ) {
    return "_document.md"
  }
  // Multi-sender chat formats share the heatmap / leaderboard /
  // decisions-and-actions / drill-down contract. WhatsApp keeps its
  // bespoke 1:1-relationship framing — it has its own prompt — so it
  // stays out of this family.
  if (
    contentType === "slack-chat" ||
    contentType === "discord-chat" ||
    contentType === "telegram-chat" ||
    contentType === "imessage-chat" ||
    contentType === "multi-sender-chat"
  ) {
    return "_chat.md"
  }
  return null
}

function injectData(html: string, data: unknown): string {
  const json = JSON.stringify(data)
  // JSON.stringify doesn't escape `</script>` — guard against the data
  // containing it and breaking out of the inline <script>.
  const safe = json.replace(/<\/script/gi, "<\\/script")
  if (!html.includes("__DATA__")) {
    // Fallback: prepend a <script> defining DATA before </body> if the
    // model forgot the placeholder. Better than dropping all the data.
    const inject = `<script>const DATA = ${safe};</script>`
    return html.replace(/<\/body>/i, `${inject}\n</body>`)
  }
  return html.replace(/__DATA__/g, safe)
}

function stripMarkdownFence(s: string): string {
  // Models sometimes wrap output in ```html ... ``` despite instructions.
  const fence = /^```(?:html)?\s*\n([\s\S]*?)\n```\s*$/.exec(s.trim())
  return fence ? fence[1] : s
}
