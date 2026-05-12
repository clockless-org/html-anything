/**
 * The core abstraction.
 *
 * - **Parser**: file (or directory) → structured JSON (`ParsedFile`).
 *   Per-format. Cheap, deterministic, no LLM. Just turns bytes into a
 *   shape an LLM can reason about ("here's the schema, here are 10
 *   sample records, here are the column types").
 *
 * - **htmlize**: ParsedFile + LLM → single self-contained HTML.
 *   The LLM looks at the schema and a small sample of the data, decides
 *   what reading + interaction UX is best for this *specific content*
 *   ("two-person chat in 2026-01 → bubble timeline; 50K-row sales CSV
 *   → sortable table + monthly chart"), and writes the HTML+CSS+JS that
 *   renders it. The full data is inlined into that HTML at the end —
 *   the LLM never sees all of it, only a sample big enough to design
 *   the page.
 *
 * Design goal: the LLM's job is to design the *reading experience for
 * this file*. The parser's job is to make that file legible to the LLM
 * in the first place.
 */
export interface Parser {
  name: string
  /** File extensions (with leading dot). MIME types accepted too. */
  matches: readonly string[]
  /** Optional content sniffer for ambiguous extensions (e.g. WhatsApp .txt). */
  detect?: (filepath: string) => Promise<boolean> | boolean
  /** Read the file (or directory) and return a structured representation. */
  parse: (filepath: string) => Promise<ParsedFile>
}

export interface ParsedFile {
  /** Short label the LLM uses to anchor the design ("whatsapp-chat", "csv-tabular", "long-form-text", "code-tree"). */
  contentType: string
  /** Free-form description for the LLM: "80-message chat between 2 senders, 2026-01-04 to 2026-02-02, no media." */
  summary: string
  /** A small representative sample the LLM sees verbatim. ~5-20 KB. */
  sample: unknown
  /** The full data, inlined into the final HTML. Can be much larger. */
  data: unknown
  /** Metadata stamped into the output (size, source filename, counts). */
  meta: {
    sourceFile: string
    sizeBytes: number
    [key: string]: unknown
  }
}

export interface ConverterOptions {
  /** Override the document title. Defaults to filename or LLM-derived. */
  title?: string
  /** Page style prompt to use. Defaults to auto-selection from the content type. */
  style?: HtmlAnythingStyle | "auto"
  /** Model to use. Default: claude-sonnet-4-6 (page generation needs frontier-class). */
  model?: string
  /** Max output tokens for the LLM. Default 16384. */
  maxTokens?: number
}

export type HtmlAnythingStyle =
  | "default"
  | "teaching"
  | "love-romance-3d"
  | "living-essay"
  | "dashboard"
  | "soft-saas"
  | "kinetic-scoreboard"
  | "timeline-story"
  | "global-travel"
  | "map-atlas"
  | "network-map"
  | "document"
  | "kami-reading"
  | "digital-eguide"
  | "editorial-carousel"
  | "architectural-spread"
  | "terminal-cli"
  | "developer"

export interface LlmHelper {
  /** One-shot prompt → text. Used by htmlize to design the page. */
  ask: (prompt: string, opts?: { model?: string; maxTokens?: number }) => Promise<string>
}
