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
import type { ConverterOptions, LlmHelper, ParsedFile } from "./types.js"

const SYSTEM_PROMPT = `You are designing a single self-contained HTML page that is the **best possible reading and interaction experience** for a specific file's content.

You are not converting the file — you are designing the right reading UX *for this content*. Same content type means different layouts depending on shape:
- A 2-person friend chat → bubble timeline grouped by day, simple search
- A 200-person Slack channel → folded by sender, top-contributors view
- A 50-row sales CSV → sortable table
- A 50,000-row CSV → paginated/virtualized + summary charts
- A 5-page recipe PDF → recipe card UI; a 500-page report → TOC + reading view

Produce a complete \`<!doctype html>\` document with these properties:
1. **Single file.** Inline ALL CSS in <style>, ALL JS in <script>. No external resources except a Google Font import if useful (pick one). No CDNs for libraries.
2. **Mobile-first responsive.** Looks right on phone, scales up.
3. **Light + dark mode** via prefers-color-scheme. Tasteful, modern type. System fonts as fallback.
4. **Search and copy by default.** Cmd-F-style search box that filters or highlights. Copy buttons where they help.
5. **Interactive only when it helps.** Sort columns, filter senders, toggle views, jump to date — yes. Animations for animations' sake — no.
6. **Self-contained.** Must work offline by double-clicking the file. No network calls at runtime.

The full data is given to you as a JSON object, but **embed it via the literal placeholder \`__DATA__\`** inside a <script> tag like:
\`\`\`
<script>const DATA = __DATA__;</script>
\`\`\`
The host program will substitute \`__DATA__\` with the full data after you respond. You only see a sample, but write the JS to handle the *full* shape (use the schema described in the user message).

Return ONLY the HTML, starting with \`<!doctype html>\`. No markdown fences. No commentary. No leading "Here is the HTML:" — just the document.`

export async function htmlize(
  parsed: ParsedFile,
  llm: LlmHelper,
  options: ConverterOptions = {},
): Promise<string> {
  const userPrompt = buildUserPrompt(parsed, options)

  const raw = await llm.ask(`${SYSTEM_PROMPT}\n\n---\n\n${userPrompt}`, {
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

function buildUserPrompt(parsed: ParsedFile, options: ConverterOptions): string {
  const title = options.title || parsed.meta.sourceFile.replace(/\.[^.]+$/, "")
  return [
    `Content type: ${parsed.contentType}`,
    `Summary: ${parsed.summary}`,
    `Document title: ${title}`,
    "",
    "Schema and stats (use these to design the layout — they describe the FULL data, not just the sample below):",
    "```json",
    JSON.stringify(parsed.meta, null, 2),
    "```",
    "",
    "Representative sample (the FULL data has the same shape; design for the full data):",
    "```json",
    JSON.stringify(parsed.sample, null, 2).slice(0, 16000),
    "```",
    "",
    "Now produce the HTML.",
  ].join("\n")
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
