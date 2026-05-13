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
import type { ConverterOptions, HtmlAnythingStyle, LlmHelper, ParsedFile } from "./types.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROMPTS_DIR = path.resolve(__dirname, "..", "prompts")

interface StyleCatalogEntry {
  id?: string
  system?: string
  mode?: string
  summary?: string
  useCases?: string[]
  triggers?: string[]
  bestSources?: string[]
  example?: string | null
  preview?: string | null
  referenceHtml?: string | null
  referenceAssets?: string[]
  coreScaffold?: string[]
  requiredPrimitives?: string[]
  avoid?: string[]
}

export interface StyleReferenceAsset {
  sourcePath: string
  outputRelativePath: string
}

const BASE_PROMPT = `You are designing a single self-contained HTML page that is the **best possible reading and interaction experience** for the specific content in front of you.

You are not converting the file — you are designing the right reading UX *for this content*. Same content type means different layouts depending on shape:
- A 2-person friend chat → bubble timeline grouped by day
- A 200-person Slack channel → folded by sender, top-contributors view
- A 50-row sales CSV → sortable table
- A 50,000-row CSV → summary charts + virtualized rows

Produce a complete \`<!doctype html>\` document with these properties:
1. **Single file.** Inline ALL CSS in <style>, ALL JS in <script>. No external resources except a Google Font import if useful (pick one). No CDNs for libraries.
2. **Mobile-first responsive.** Looks right on phone, scales up.
3. **Light + dark mode** via prefers-color-scheme unless the selected style explicitly declares a dark-only surface. Tasteful, modern type.
4. **Search and copy by default.** Cmd-F-style search box that filters or highlights. Copy buttons where they help.
5. **Self-contained.** Must work offline by double-clicking the file.
6. **Style fidelity.** The selected style is a design system + layout system, not a palette. Reproduce the style's first viewport, component vocabulary, layout scaffold, interaction model, and motion grammar. Do not generate a generic report and recolor it.

The selected style is binding. Build from the selected style's scaffold first,
then adapt source-specific modules into that scaffold. Do not produce a generic
\`hero + KPI cards + chart cards + table\` page when the style prompt specifies a
different system. If the style prompt includes a reference contract or
compliance gate, treat it as non-negotiable.

The full data is given to you as a JSON object, but **embed it via the literal placeholder \`__DATA__\`** inside a <script> tag:
\`\`\`
<script>const DATA = __DATA__;</script>
\`\`\`
The host program will substitute \`__DATA__\` with the full data after you respond. You only see a sample, but write JS that handles the *full* shape using the schema in the user message.

Before returning, silently audit the HTML against:
- the design tokens,
- the selected style's required scaffold, class names, and interactions,
- the source prompt's required analytical modules,
- responsive behavior and offline constraints.

If the audit fails, revise the HTML before returning it. Return ONLY the HTML,
starting with \`<!doctype html>\`. No markdown fences, no commentary.`

const STYLE_COMPLIANCE_PROMPT = `## Final style-compliance gate

Before returning the HTML, silently audit the page against the selected style:

- The root tag is \`<html ... data-ha-style="{selectedStyle}">\`.
- The first viewport visibly matches the selected style's scaffold, not a generic \`hero + KPI cards + chart cards\` shell.
- The HTML uses the selected style's component vocabulary and class names.
- Source-required modules are present, but translated into the selected style's native layout system.
- The primary interaction is style-native and backed by the inlined \`DATA\`.
- Motion follows the style's motion grammar and respects \`prefers-reduced-motion\`.
- The page is complete, offline-capable, mobile-responsive, and includes \`<script>const DATA = __DATA__;</script>\`.

If any check fails, rewrite the HTML before answering.`

export async function htmlize(
  parsed: ParsedFile,
  llm: LlmHelper,
  options: ConverterOptions = {},
): Promise<string> {
  // Four prompts get loaded for every conversion:
  //   1. styles/_design.md — default Clockless design tokens (colors, fonts,
  //      spacing), unless the selected style provides a complete override.
  //   2. sources/<contentType>.md — source-specific guidance (what to
  //      analyze, what to visualize, data shape). Falls back to default.md.
  //   3. styles/catalog.json — compact style metadata: routing triggers,
  //      examples, packaged reference HTML/assets, required primitives, and
  //      anti-patterns.
  //   4. styles/<style>.md — the page-shape contract. Defaults to auto
  //      selection from the parsed source, but can be overridden.
  // The skill (Claude Code mode) reads the same four files, so both
  // modes converge on identical output styling.
  const designPrompt = await loadPromptFile(path.join("styles", "_design.md"))
  const sourcePrompt = await loadSourcePrompt(parsed.contentType)
  const selectedStyle = selectStyleForContent(parsed.contentType, options)
  const styleCatalogPrompt = await loadStyleCatalogPrompt(selectedStyle)
  const stylePrompt = await loadStylePrompt(selectedStyle)
  const userPrompt = buildUserPrompt(parsed, options, designPrompt, sourcePrompt, selectedStyle, styleCatalogPrompt, stylePrompt)

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
  selectedStyle: HtmlAnythingStyle,
  styleCatalogPrompt: string,
  stylePrompt: string,
): string {
  const title = options.title || parsed.meta.sourceFile.replace(/\.[^.]+$/, "")
  return [
    `Content type: ${parsed.contentType}`,
    `Summary: ${parsed.summary}`,
    `Document title: ${title}`,
    `Selected style: ${selectedStyle}`,
    "",
    "## Design system (apply to every output, regardless of source)",
    designPrompt,
    "",
    "## Style-specific guidance",
    styleCatalogPrompt,
    "",
    stylePrompt,
    "",
    STYLE_COMPLIANCE_PROMPT.replaceAll("{selectedStyle}", selectedStyle),
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
    "Now produce the HTML. Treat the selected style as a hard contract, not a loose visual suggestion. Silently self-check style compliance before returning.",
  ].join("\n")
}

async function loadPromptFile(name: string): Promise<string> {
  try {
    return await fs.readFile(path.join(PROMPTS_DIR, name), "utf8")
  } catch {
    return ""
  }
}

async function loadStylePrompt(style: HtmlAnythingStyle): Promise<string> {
  const system = await loadPromptFile(path.join("styles", "_system.md"))
  const body = await loadPromptFile(path.join("styles", `${style}.md`))
  if (body) return `${system}\n\n---\n\n${body}`
  const fallback = await loadPromptFile(path.join("styles", "default.md"))
  return `${system}\n\n---\n\n${fallback}`
}

async function loadStyleCatalogPrompt(style: HtmlAnythingStyle): Promise<string> {
  try {
    const catalog = await loadStyleCatalog()
    if (!catalog) return ""
    const entry = findStyleCatalogEntry(catalog, style)
    if (!entry) return ""
    const referenceHtml = await loadCatalogReference(entry.referenceHtml)
    return [
      "## Style catalog metadata",
      "",
      "This metadata is the routing and QA source of truth for the selected style. Treat it as a compact preflight checklist before applying the full style prompt.",
      "",
      `- Style id: ${style}`,
      `- Underlying system: ${entry.system || style}`,
      `- Mode: ${entry.mode || "auto"}`,
      `- Summary: ${entry.summary || ""}`,
      `- Use cases: ${(entry.useCases || []).join(", ")}`,
      `- Triggers: ${(entry.triggers || []).join(", ")}`,
      `- Best sources: ${(entry.bestSources || []).join(", ")}`,
      `- Example: ${entry.example || "(none yet)"}`,
      `- Preview: ${entry.preview || "(none yet)"}`,
      `- Reference HTML: ${entry.referenceHtml || "(none yet)"}`,
      `- Reference assets: ${(entry.referenceAssets || []).join(", ") || "(none yet)"}`,
      `- Core scaffold: ${(entry.coreScaffold || []).join(" / ")}`,
      `- Required primitives: ${(entry.requiredPrimitives || []).join(", ")}`,
      `- Avoid: ${(entry.avoid || []).join(" / ")}`,
      "",
      "Shared quality gates:",
      ...(catalog.sharedQualityGates || []).map(item => `- ${item}`),
      ...(referenceHtml ? [
        "",
        "## Canonical style reference HTML",
        "",
        "Use this as the structural target for exact usage matches. Preserve its first viewport geometry, token overrides, surface treatment, class vocabulary, asset pattern, and interaction grammar; adapt the content instead of inventing a new scaffold.",
        "",
        "```html",
        referenceHtml,
        "```",
      ] : []),
    ].join("\n")
  } catch {
    return ""
  }
}

async function loadStyleCatalog(): Promise<{ sharedQualityGates?: string[]; styles?: StyleCatalogEntry[] } | null> {
  const raw = await loadPromptFile(path.join("styles", "catalog.json"))
  if (!raw) return null
  return JSON.parse(raw) as { sharedQualityGates?: string[]; styles?: StyleCatalogEntry[] }
}

function findStyleCatalogEntry(catalog: { styles?: StyleCatalogEntry[] }, style: HtmlAnythingStyle): StyleCatalogEntry | undefined {
  return catalog.styles?.find(item => item.id === style)
}

async function loadCatalogReference(referenceHtml?: string | null): Promise<string> {
  if (!referenceHtml) return ""
  const normalized = referenceHtml.startsWith("prompts/")
    ? referenceHtml.slice("prompts/".length)
    : referenceHtml
  const html = await loadPromptFile(normalized)
  if (!html) return ""
  return html.length > 60000
    ? `${html.slice(0, 60000)}\n<!-- Reference truncated after 60000 chars. Preserve the visible first viewport and style contract above. -->`
    : html
}

export async function getStyleReferenceAssets(style: HtmlAnythingStyle): Promise<StyleReferenceAsset[]> {
  try {
    const catalog = await loadStyleCatalog()
    if (!catalog) return []
    const entry = findStyleCatalogEntry(catalog, style)
    return (entry?.referenceAssets || []).map(referenceAsset => {
      const normalized = referenceAsset.startsWith("prompts/")
        ? referenceAsset.slice("prompts/".length)
        : referenceAsset
      return {
        sourcePath: path.join(PROMPTS_DIR, normalized),
        outputRelativePath: referenceAssetOutputPath(referenceAsset),
      }
    })
  } catch {
    return []
  }
}

function referenceAssetOutputPath(referenceAsset: string): string {
  const normalized = referenceAsset.replaceAll("\\", "/")
  const marker = "/assets/"
  const markerIndex = normalized.indexOf(marker)
  if (markerIndex >= 0) {
    return path.join("assets", normalized.slice(markerIndex + marker.length))
  }
  return path.join("assets", path.basename(normalized))
}

async function loadSourcePromptFile(name: string): Promise<string> {
  return loadPromptFile(path.join("sources", name))
}

export function selectStyleForContent(contentType: string, options: ConverterOptions = {}): HtmlAnythingStyle {
  if (options.style && options.style !== "auto") return options.style

  if (
    contentType === "wechat-chat" ||
    contentType === "whatsapp-chat"
  ) {
    return "love-romance-3d"
  }

  if (
    contentType === "git-diff" ||
    contentType === "pr-review" ||
    contentType === "ci-log" ||
    contentType === "stack-trace"
  ) {
    return "developer"
  }

  if (
    contentType === "kindle-highlights"
  ) {
    return "living-essay"
  }

  if (
    contentType === "docx-document"
  ) {
    return "kami-reading"
  }

  if (
    contentType === "pdf-document" ||
    contentType === "medical-visit" ||
    contentType === "lab-results" ||
    contentType === "legal-chronology" ||
    contentType === "markdown-document" ||
    contentType === "bookmarks-html" ||
    contentType === "bibliography" ||
    contentType === "url-list" ||
    contentType === "reading-list"
  ) {
    return "document"
  }

  if (
    contentType === "slack-chat"
  ) {
    return "kinetic-scoreboard"
  }

  if (
    contentType === "email-archive"
  ) {
    return "soft-saas"
  }

  if (
    contentType === "discord-chat" ||
    contentType === "telegram-chat" ||
    contentType === "imessage-chat" ||
    contentType === "multi-sender-chat" ||
    contentType === "venmo-paypal-payments" ||
    contentType === "vcard-contacts" ||
    contentType === "linkedin-connections"
  ) {
    return "network-map"
  }

  if (
    contentType === "google-maps-stars" ||
    contentType === "google-photos-takeout" ||
    contentType === "gpx-route" ||
    contentType === "kml-route" ||
    contentType === "travel-itinerary" ||
    contentType === "location-history"
  ) {
    return "map-atlas"
  }

  if (
    contentType === "rideshare-history" ||
    contentType === "travel-history"
  ) {
    return "global-travel"
  }

  if (
    contentType === "spotify-history" ||
    contentType === "youtube-watch-history" ||
    contentType === "twitch-history" ||
    contentType === "amazon-orders" ||
    contentType === "browser-history" ||
    contentType === "iphone-health" ||
    contentType === "chatgpt-export" ||
    contentType === "claude-chat-export" ||
    contentType === "ai-chat-export" ||
    contentType === "notion-export" ||
    contentType === "obsidian-vault" ||
    contentType === "markdown-folder"
  ) {
    return "timeline-story"
  }

  if (
    contentType === "csv-tabular" ||
    contentType === "json-data" ||
    contentType === "jsonl-events" ||
    contentType === "log-events" ||
    contentType === "transcript" ||
    contentType === "bank-transactions" ||
    contentType === "invoices" ||
    contentType === "quickbooks-report" ||
    contentType === "ics-calendar" ||
    contentType === "issue-tracker" ||
    contentType === "trello-board"
  ) {
    return "dashboard"
  }

  return "default"
}

async function loadSourcePrompt(contentType: string): Promise<string> {
  // Pick the most specific prompt available, then prepend any shared
  // family prompt so multi-format families (markdown / pdf / docx) get
  // identical insight-first guidance without duplicating it.
  const candidates = [
    `${contentType}.md`,                                                     // exact
    `${contentType.replace(/-(chat|tabular|document|data|events|report|route)$/, "")}.md`, // strip suffix
    "default.md",
  ]
  const seen = new Set<string>()
  let body = ""
  for (const name of candidates) {
    if (seen.has(name)) continue
    seen.add(name)
    const content = await loadSourcePromptFile(name)
    if (content) { body = content; break }
  }
  const familyPrompt = familyFor(contentType)
  if (!familyPrompt) return body
  const shared = await loadSourcePromptFile(familyPrompt)
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
  // Developer artifacts share the review-checklist / risk-hotspots /
  // collapsible-raw / copyable-summary / hypothesis-discipline
  // contract.
  if (
    contentType === "git-diff" ||
    contentType === "pr-review" ||
    contentType === "ci-log" ||
    contentType === "stack-trace"
  ) {
    return "_developer.md"
  }
  // Event-stream sources (JSONL/NDJSON, server/access/error/syslog/app
  // logs) share the volume-histogram / severity / outliers / top
  // sources / drill-down contract.
  if (
    contentType === "jsonl-events" ||
    contentType === "log-events"
  ) {
    return "_event_stream.md"
  }
  // Finance / admin sources (bank/credit-card transactions, invoices &
  // receipts, QuickBooks/Xero GL & P&L reports) share the cashflow-
  // summary / category-breakdown / recurring-vendors / anomaly-and-
  // duplicate-callouts / searchable-drill-down contract — and the
  // hard rule that outputs are analytical, never accounting / tax
  // advice.
  if (
    contentType === "bank-transactions" ||
    contentType === "invoices" ||
    contentType === "quickbooks-report" ||
    contentType === "venmo-paypal-payments"
  ) {
    return "_finance.md"
  }
  // Planning sources (calendar exports, issue trackers, kanban boards)
  // share the time-allocation / owner-status filters / stale-bottleneck /
  // searchable-drill-down contract.
  if (
    contentType === "ics-calendar" ||
    contentType === "issue-tracker" ||
    contentType === "trello-board"
  ) {
    return "_planning.md"
  }
  // Knowledge-base sources (Notion exports, Obsidian vaults, generic
  // markdown folders) share the concept-map / theme-clusters /
  // todo-stale-orphan-callouts / searchable-knowledge-atlas / hub-
  // leaderboard contract.
  if (
    contentType === "notion-export" ||
    contentType === "obsidian-vault" ||
    contentType === "markdown-folder"
  ) {
    return "_knowledge_base.md"
  }
  // Research / reading-list sources (browser bookmarks HTML exports,
  // BibTeX / RIS bibliographies, plain URL lists, Pocket / Instapaper /
  // Raindrop reading-list exports) share the topic-clusters /
  // domain-leaderboard / duplicate-and-stale-callouts / reading-queue /
  // searchable-cards contract — and the hard rule that outputs are
  // offline-only (no URL fetching at render time).
  if (
    contentType === "bookmarks-html" ||
    contentType === "bibliography" ||
    contentType === "url-list" ||
    contentType === "reading-list"
  ) {
    return "_research.md"
  }
  // Geo / travel sources (GPX routes & workouts, KML coordinates,
  // multi-day travel itineraries, Google-Takeout-style location
  // history) share the route-or-place visualization / stats / timeline
  // / searchable-waypoints contract — and the hard rule that outputs
  // are offline-only (no map tiles).
  if (
    contentType === "gpx-route" ||
    contentType === "kml-route" ||
    contentType === "travel-itinerary" ||
    contentType === "location-history"
  ) {
    return "_geo.md"
  }
  // Sensitive-record sources (lab results CSV, medical visit /
  // legal chronology markdown). Share the timeline / parties /
  // documents / missing-and-next-questions / drill-down contract,
  // and the hard rule that outputs are organizational summaries —
  // never medical, legal, immigration, or insurance advice.
  if (
    contentType === "lab-results" ||
    contentType === "medical-visit" ||
    contentType === "legal-chronology"
  ) {
    return "_sensitive.md"
  }
  // AI chat-history sources (ChatGPT `conversations.json`, Claude
  // export-style JSON, generic `{ conversations: [...] }`, plain
  // markdown / text "User: / Assistant:" logs) share the
  // overview-cards / weekly-timeline / topic-clusters / reusable-
  // prompts / unresolved-threads / conversation-index / drill-down
  // contract — and the hard rule that outputs are offline-only and
  // never call back to OpenAI / Anthropic at render time.
  if (
    contentType === "chatgpt-export" ||
    contentType === "claude-chat-export" ||
    contentType === "ai-chat-export"
  ) {
    return "_ai_chat_export.md"
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
