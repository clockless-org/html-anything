/**
 * Developer-artifact parser. Handles four formats with one shared
 * dispatcher + sub-parser model:
 *
 *   - git-diff      — unified diff (no PR metadata)
 *   - pr-review     — `git format-patch` mailbox or GitHub PR patch
 *                     (one or more `From <hash>\nFrom: …\nDate: …
 *                     \nSubject:` blocks each followed by a diff)
 *   - ci-log        — CI / build / test log with failure markers
 *                     (GitHub Actions, GitLab CI, CircleCI, Buildkite,
 *                     Jenkins, generic `npm test` / `pytest` output)
 *   - stack-trace   — runtime stack trace dominant content
 *                     (Python, JS / Node, Java, Go, Ruby, Rust, .NET)
 *
 * The `detect()` step claims `.diff`, `.patch`, and any `.log` /
 * `.txt` whose content shape matches one of these formats. Inside
 * `parse()` we sniff again to pick the sub-parser — the same `.txt`
 * could be a stack trace pasted from a logger or a CI log captured
 * from a terminal.
 *
 * The parser only normalizes (extract files / hunks / lines /
 * frames / errors / failing tests). It does NOT classify risk,
 * pick hypotheses, or score severity — that's the LLM's job in the
 * developer-artifact prompts. Trying to do it here would be fragile
 * and would also lock the inferred read out of the LLM's design
 * surface.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Parser, ParsedFile } from "../types.js"

// ---------------------------------------------------------------------------
// Public parser
// ---------------------------------------------------------------------------

type Kind = "git-diff" | "pr-review" | "ci-log" | "stack-trace"

const DIFF_HEAD_LINE = /^(?:diff --git |--- |\+\+\+ |@@ )/m
const PATCH_FROM_LINE = /^From [0-9a-f]{7,40} /m
const STACK_PYTHON = /^Traceback \(most recent call last\):/m
const STACK_JS = /^(?:[A-Z][\w]*Error|TypeError|RangeError|SyntaxError|Error|AggregateError):.*\n(?:\s+at .+\n?){1,}/m
const STACK_JAVA = /^\s*(?:Exception in thread .*|[\w.$]+(?:Exception|Error)(?::.*)?)\n(?:\s+at [\w$.<>]+\(.+?\)\n?)+/m
const STACK_GO = /^panic: .+\n\ngoroutine \d+/m
const STACK_RUBY = /^[\w/.\- ]+:\d+:in `[^']+': .+ \(.+(?:Error|Exception)\)/m
const STACK_RUST = /thread '[^']+' panicked at /m
const STACK_CSHARP = /^[\w.]+(?:Exception|Error): .+\n\s+at [\w.<>]+\(/m

// CI sniffers tolerate a leading timestamp prefix because GitHub Actions
// (and most CI providers) emit `<ISO timestamp>Z <line>` to stdout, so
// the marker is rarely at column 0 in a captured log.
const CI_GHA_GROUP = /(?:^|\s)##\[(?:group|endgroup|error|warning|notice|debug)\]/m
const CI_GITLAB_SECTION = /(?:^|\s)section_(?:start|end):\d+:[a-zA-Z0-9_]+/m
const CI_NPM_ERR = /(?:^|\s)npm ERR! /m
const CI_PYTEST_FAIL = /(?:^|\n)=+\s*FAILURES\s*=+/m
const CI_JEST_FAIL = /(?:^|\s)FAIL\s+\S+\.test\.[jt]sx?\b/m
const CI_GO_FAIL = /(?:^|\s)---\s+FAIL: /m
const CI_GENERIC_ERROR_RUN = /(?:^|\s)(?:Error: Process completed with exit code \d+|Build failed|FAILED\s+\()/m

export const parser: Parser = {
  name: "developer-artifact",
  matches: [".diff", ".patch", ".log", ".txt"],
  async detect(filepath: string): Promise<boolean> {
    const ext = path.extname(filepath).toLowerCase()
    // .diff and .patch are us by extension. Other parsers don't claim them.
    if (ext === ".diff" || ext === ".patch") return true
    // For .log / .txt we have to sniff. Be strict: the content has to
    // strongly look like one of our four formats, because text.ts is
    // the catch-all that picks up plain logs and notes.
    try {
      const fd = await fs.open(filepath, "r")
      const buf = Buffer.alloc(16 * 1024)
      const { bytesRead } = await fd.read(buf, 0, buf.length, 0)
      await fd.close()
      const sample = buf.subarray(0, bytesRead).toString("utf8").replace(/\r\n/g, "\n")
      return classifyContent(sample) !== null
    } catch {
      return false
    }
  },
  async parse(filepath: string): Promise<ParsedFile> {
    const raw = (await fs.readFile(filepath, "utf8")).replace(/\r\n/g, "\n")
    const ext = path.extname(filepath).toLowerCase()
    const kind = pickKind(ext, raw)

    const meta: Record<string, unknown> & { sourceFile: string; sizeBytes: number } = {
      sourceFile: path.basename(filepath),
      sizeBytes: Buffer.byteLength(raw, "utf8"),
      format: kind,
    }

    if (kind === "stack-trace") return parseStackTrace(raw, meta)
    if (kind === "ci-log") return parseCiLog(raw, meta)
    if (kind === "pr-review") return parsePrReview(raw, meta)
    return parseGitDiff(raw, meta)
  },
}

function pickKind(ext: string, raw: string): Kind {
  // Patches with `From <hash>` mailbox blocks are PR-shaped.
  if (PATCH_FROM_LINE.test(raw) && DIFF_HEAD_LINE.test(raw)) return "pr-review"
  if (ext === ".diff" || ext === ".patch") {
    return DIFF_HEAD_LINE.test(raw) ? "git-diff" : "git-diff"
  }
  const sniffed = classifyContent(raw)
  return sniffed ?? "git-diff"
}

function classifyContent(sample: string): Kind | null {
  // Order matters: PR (mailbox + diff) before plain diff; CI log
  // before stack-trace because traces often appear *inside* CI logs.
  if (PATCH_FROM_LINE.test(sample) && DIFF_HEAD_LINE.test(sample)) return "pr-review"
  if (DIFF_HEAD_LINE.test(sample)) return "git-diff"
  if (looksLikeCiLog(sample)) return "ci-log"
  if (looksLikeStackTrace(sample)) return "stack-trace"
  return null
}

function looksLikeCiLog(sample: string): boolean {
  // Strong signals: provider-specific markers. Any one is enough.
  if (CI_GHA_GROUP.test(sample)) return true
  if (CI_GITLAB_SECTION.test(sample)) return true
  if (CI_NPM_ERR.test(sample)) return true
  if (CI_PYTEST_FAIL.test(sample)) return true
  if (CI_JEST_FAIL.test(sample)) return true
  if (CI_GO_FAIL.test(sample)) return true
  if (CI_GENERIC_ERROR_RUN.test(sample)) return true
  // Soft signal: an ANSI escape stream with timestamped lines and at
  // least one `error:` / `FAIL` line. Two hits to avoid false positives
  // on plain prose with the word "error".
  const ansiHits = (sample.match(/\x1b\[\d{1,2}(?:;\d{1,2})*m/g) || []).length
  const failHits = (sample.match(/^(?:\s*\[?error\]?:|\s*FAIL\s|\s*PASS\s)/gim) || []).length
  return ansiHits >= 4 && failHits >= 2
}

function looksLikeStackTrace(sample: string): boolean {
  return (
    STACK_PYTHON.test(sample) ||
    STACK_JS.test(sample) ||
    STACK_JAVA.test(sample) ||
    STACK_GO.test(sample) ||
    STACK_RUBY.test(sample) ||
    STACK_RUST.test(sample) ||
    STACK_CSHARP.test(sample)
  )
}

// ===========================================================================
// git-diff parser
// ===========================================================================

interface DiffLine {
  kind: "context" | "add" | "del"
  oldNum: number | null
  newNum: number | null
  text: string
}

interface DiffHunk {
  id: string
  header: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  context: string
  lines: DiffLine[]
}

interface DiffFile {
  id: string
  path: string
  oldPath: string
  newPath: string
  status: "modified" | "added" | "deleted" | "renamed"
  language: string | null
  additions: number
  deletions: number
  isBinary: boolean
  hunks: DiffHunk[]
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@\s*(.*)$/

function parseUnifiedDiff(raw: string): DiffFile[] {
  const lines = raw.split("\n")
  const files: DiffFile[] = []
  let cur: DiffFile | null = null
  let curHunk: DiffHunk | null = null
  let oldNum = 0
  let newNum = 0
  let fileCounter = 0
  let hunkCounter = 0

  function pushFile(f: DiffFile) {
    files.push(f)
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith("diff --git ")) {
      cur = newFileFromDiffGit(line, ++fileCounter)
      curHunk = null
      continue
    }
    if (cur && line.startsWith("new file mode")) {
      cur.status = "added"
      continue
    }
    if (cur && line.startsWith("deleted file mode")) {
      cur.status = "deleted"
      continue
    }
    if (cur && (line.startsWith("rename from ") || line.startsWith("rename to "))) {
      cur.status = "renamed"
      if (line.startsWith("rename from ")) cur.oldPath = line.slice("rename from ".length).trim()
      else cur.newPath = line.slice("rename to ".length).trim()
      cur.path = cur.newPath || cur.path
      continue
    }
    if (cur && line.startsWith("Binary files ")) {
      cur.isBinary = true
      continue
    }
    if (line.startsWith("--- ")) {
      // Some diffs (svn-style, raw `diff -u`) skip the `diff --git` header.
      if (!cur) {
        cur = blankFile(++fileCounter)
        pushFile(cur)
      }
      cur.oldPath = stripDiffPath(line.slice(4))
      continue
    }
    if (line.startsWith("+++ ")) {
      if (!cur) {
        cur = blankFile(++fileCounter)
        pushFile(cur)
      }
      cur.newPath = stripDiffPath(line.slice(4))
      cur.path = cur.newPath !== "/dev/null" ? cur.newPath : (cur.oldPath || cur.path)
      cur.language = languageForPath(cur.path)
      // We push the file when we see the +++ header (after we know the path)
      // — except when we've already pushed it (svn-style above).
      if (!files.includes(cur)) pushFile(cur)
      continue
    }

    if (cur && line.startsWith("@@")) {
      const m = HUNK_HEADER.exec(line)
      if (!m) continue
      const oldStart = parseInt(m[1], 10)
      const oldLinesCount = m[2] ? parseInt(m[2], 10) : 1
      const newStart = parseInt(m[3], 10)
      const newLinesCount = m[4] ? parseInt(m[4], 10) : 1
      curHunk = {
        id: `h_${String(++hunkCounter).padStart(4, "0")}`,
        header: line,
        oldStart, oldLines: oldLinesCount,
        newStart, newLines: newLinesCount,
        context: m[5] ? m[5].trim() : "",
        lines: [],
      }
      cur.hunks.push(curHunk)
      oldNum = oldStart
      newNum = newStart
      continue
    }

    if (curHunk && cur) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        curHunk.lines.push({ kind: "add", oldNum: null, newNum, text: line.slice(1) })
        cur.additions++
        newNum++
        continue
      }
      if (line.startsWith("-") && !line.startsWith("---")) {
        curHunk.lines.push({ kind: "del", oldNum, newNum: null, text: line.slice(1) })
        cur.deletions++
        oldNum++
        continue
      }
      if (line.startsWith(" ") || line === "") {
        curHunk.lines.push({ kind: "context", oldNum, newNum, text: line.slice(1) })
        oldNum++
        newNum++
        continue
      }
      if (line.startsWith("\\")) {
        // "\ No newline at end of file" — preserve as context for fidelity.
        curHunk.lines.push({ kind: "context", oldNum: null, newNum: null, text: line })
        continue
      }
    }
  }

  // De-duplicate the case where the svn-style fallback pushed twice.
  const seen = new Set<DiffFile>()
  return files.filter(f => (seen.has(f) ? false : (seen.add(f), true)))
}

function newFileFromDiffGit(line: string, counter: number): DiffFile {
  // `diff --git a/path b/path` — extract both sides.
  const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(line)
  const oldPath = m ? m[1] : ""
  const newPath = m ? m[2] : ""
  const out: DiffFile = {
    id: `f_${String(counter).padStart(4, "0")}`,
    path: newPath || oldPath,
    oldPath,
    newPath,
    status: "modified",
    language: languageForPath(newPath || oldPath),
    additions: 0,
    deletions: 0,
    isBinary: false,
    hunks: [],
  }
  return out
}

function blankFile(counter: number): DiffFile {
  return {
    id: `f_${String(counter).padStart(4, "0")}`,
    path: "",
    oldPath: "",
    newPath: "",
    status: "modified",
    language: null,
    additions: 0,
    deletions: 0,
    isBinary: false,
    hunks: [],
  }
}

function stripDiffPath(s: string): string {
  let v = s.trim()
  // strip optional `a/` / `b/` prefix produced by `git diff`
  if (v.startsWith("a/") || v.startsWith("b/")) v = v.slice(2)
  // strip optional trailing tab + timestamp produced by `diff -u`
  const tab = v.indexOf("\t")
  if (tab !== -1) v = v.slice(0, tab)
  return v
}

const LANG_BY_EXT: Record<string, string> = {
  ".ts": "typescript", ".tsx": "tsx", ".js": "javascript", ".jsx": "jsx", ".mjs": "javascript",
  ".py": "python", ".rb": "ruby", ".go": "go", ".rs": "rust", ".java": "java",
  ".kt": "kotlin", ".swift": "swift", ".scala": "scala", ".php": "php",
  ".cs": "csharp", ".cpp": "cpp", ".cc": "cpp", ".c": "c", ".h": "c", ".hpp": "cpp",
  ".sql": "sql", ".sh": "shell", ".bash": "shell", ".zsh": "shell",
  ".yml": "yaml", ".yaml": "yaml", ".toml": "toml", ".json": "json",
  ".md": "markdown", ".html": "html", ".css": "css", ".scss": "scss",
  ".lock": "lockfile", ".gradle": "gradle",
}

function languageForPath(p: string | undefined): string | null {
  if (!p) return null
  const ext = path.extname(p).toLowerCase()
  if (LANG_BY_EXT[ext]) return LANG_BY_EXT[ext]
  // package manifests with no extension
  const base = path.basename(p)
  if (base === "Dockerfile") return "dockerfile"
  if (base === "Makefile") return "makefile"
  if (base.startsWith(".env")) return "env"
  return null
}

function parseGitDiff(raw: string, meta: Record<string, unknown> & { sourceFile: string; sizeBytes: number }): ParsedFile {
  const files = parseUnifiedDiff(raw)
  const totals = computeDiffTotals(files)
  meta.totals = totals

  const sample = {
    ...meta,
    files: files.slice(0, 40).map(f => sampleFile(f, 8)),
    fileSummary: files.map(f => ({
      id: f.id,
      path: f.path,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      hunkCount: f.hunks.length,
      isBinary: f.isBinary,
      language: f.language,
    })),
    largestHunks: pickLargestHunks(files, 6),
  }

  return {
    contentType: "git-diff",
    summary:
      `Unified diff: ${totals.files} file${totals.files === 1 ? "" : "s"}, ` +
      `+${totals.additions} / −${totals.deletions} across ${totals.hunks} hunk${totals.hunks === 1 ? "" : "s"}.`,
    sample,
    data: { kind: "git-diff", files, totals, ...meta },
    meta,
  }
}

function computeDiffTotals(files: DiffFile[]) {
  const byStatus: Record<string, number> = { modified: 0, added: 0, deleted: 0, renamed: 0 }
  const byLanguage: Record<string, number> = {}
  let additions = 0, deletions = 0, hunks = 0
  for (const f of files) {
    additions += f.additions
    deletions += f.deletions
    hunks += f.hunks.length
    byStatus[f.status] = (byStatus[f.status] || 0) + 1
    if (f.language) byLanguage[f.language] = (byLanguage[f.language] || 0) + 1
  }
  return { files: files.length, additions, deletions, hunks, byStatus, byLanguage }
}

function sampleFile(f: DiffFile, maxHunks: number) {
  return {
    id: f.id, path: f.path, status: f.status, language: f.language,
    additions: f.additions, deletions: f.deletions,
    isBinary: f.isBinary,
    hunks: f.hunks.slice(0, maxHunks).map(sampleHunk),
  }
}

function sampleHunk(h: DiffHunk) {
  // Keep at most ~24 lines per hunk in the sample so the LLM payload
  // stays bounded; the FULL hunk goes into DATA via injectData.
  const cap = 24
  const head = h.lines.slice(0, cap)
  return {
    id: h.id, header: h.header, context: h.context,
    oldStart: h.oldStart, oldLines: h.oldLines,
    newStart: h.newStart, newLines: h.newLines,
    sampleLines: head,
    truncated: h.lines.length > cap,
    totalLines: h.lines.length,
  }
}

function pickLargestHunks(files: DiffFile[], n: number) {
  const all: Array<{ filePath: string; hunk: DiffHunk; size: number }> = []
  for (const f of files) {
    for (const h of f.hunks) {
      all.push({ filePath: f.path, hunk: h, size: h.lines.length })
    }
  }
  return all.sort((a, b) => b.size - a.size).slice(0, n).map(x => ({
    filePath: x.filePath,
    ...sampleHunk(x.hunk),
  }))
}

// ===========================================================================
// pr-review parser
// ===========================================================================

interface Commit {
  id: string
  hash: string
  shortHash: string
  author: string
  authorName: string
  date: string
  subject: string
  body: string
  fileIds: string[]
  additions: number
  deletions: number
}

function parsePrReview(raw: string, meta: Record<string, unknown> & { sourceFile: string; sizeBytes: number }): ParsedFile {
  // `git format-patch` mailbox: each commit starts with `From <hash> Mon Sep ...`
  // followed by `From: …\nDate: …\nSubject: …\n\n<body>\n---\n<diffstat>\n\n<diff>\n--\n2.x.x\n`
  // (or close to it).
  const blocks = splitFormatPatchBlocks(raw)

  // Parse PR-level metadata from the first cover-letter block when present.
  // GitHub `.patch` downloads usually have one block per commit; cover letter
  // is rare but we still fall back gracefully.
  const pr: Record<string, unknown> = {}
  if (blocks.length && blocks[0].subject) {
    pr.title = blocks[0].subject.replace(/^\[PATCH(?:\s+\d+\/\d+)?\]\s*/, "")
    if (blocks[0].author) pr.author = blocks[0].author
  }

  const commits: Commit[] = []
  const allFiles: DiffFile[] = []
  let commitCounter = 0

  for (const block of blocks) {
    const c: Commit = {
      id: `c_${String(++commitCounter).padStart(4, "0")}`,
      hash: block.hash || "",
      shortHash: block.hash ? block.hash.slice(0, 7) : "",
      author: block.author || "",
      authorName: block.authorName || "",
      date: block.date || "",
      subject: (block.subject || "").replace(/^\[PATCH(?:\s+\d+\/\d+)?\]\s*/, ""),
      body: block.body || "",
      fileIds: [],
      additions: 0,
      deletions: 0,
    }
    const files = parseUnifiedDiff(block.diff)
    for (const f of files) {
      // Re-id files so they're unique across the PR (parser scopes ids per call)
      f.id = `f_${String(allFiles.length + 1).padStart(4, "0")}`
      allFiles.push(f)
      c.fileIds.push(f.id)
      c.additions += f.additions
      c.deletions += f.deletions
    }
    commits.push(c)
  }

  // Hypothesis-only flag: did each touched code file come with a matching
  // test file change? Test path conventions: same basename + `.test.` /
  // `.spec.` / `_test.` / `_spec.`, or a sibling `tests/` directory.
  const allPaths = new Set(allFiles.map(f => f.path))
  for (const f of allFiles) {
    ;(f as DiffFile & { hasMatchingTestChange?: boolean }).hasMatchingTestChange =
      hasMatchingTest(f.path, allPaths)
  }

  const totals = {
    ...computeDiffTotals(allFiles),
    commits: commits.length,
  }
  meta.totals = totals

  const sample = {
    ...meta,
    pr,
    commits: commits.map(c => ({
      id: c.id, hash: c.hash, shortHash: c.shortHash,
      authorName: c.authorName, date: c.date,
      subject: c.subject,
      bodyPreview: (c.body || "").slice(0, 320),
      fileCount: c.fileIds.length,
      additions: c.additions, deletions: c.deletions,
    })),
    files: allFiles.slice(0, 40).map(f => ({
      ...sampleFile(f, 6),
      hasMatchingTestChange: (f as DiffFile & { hasMatchingTestChange?: boolean }).hasMatchingTestChange,
    })),
    fileSummary: allFiles.map(f => ({
      id: f.id, path: f.path, status: f.status,
      additions: f.additions, deletions: f.deletions,
      hunkCount: f.hunks.length, isBinary: f.isBinary,
      language: f.language,
      hasMatchingTestChange: (f as DiffFile & { hasMatchingTestChange?: boolean }).hasMatchingTestChange,
    })),
    largestHunks: pickLargestHunks(allFiles, 6),
  }

  return {
    contentType: "pr-review",
    summary:
      `Pull-request patch: ${commits.length} commit${commits.length === 1 ? "" : "s"}, ` +
      `${totals.files} file${totals.files === 1 ? "" : "s"}, ` +
      `+${totals.additions} / −${totals.deletions}.`,
    sample,
    data: { kind: "pr-review", pr, commits, files: allFiles, totals, ...meta },
    meta,
  }
}

interface PatchBlock {
  hash: string | null
  author: string | null
  authorName: string | null
  date: string | null
  subject: string | null
  body: string
  diff: string
}

function splitFormatPatchBlocks(raw: string): PatchBlock[] {
  // Each commit block starts with `From <hash> <date>` at column 0.
  const lines = raw.split("\n")
  const startIdxs: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (/^From [0-9a-f]{7,40} /.test(lines[i])) startIdxs.push(i)
  }
  if (!startIdxs.length) {
    // Not a mailbox-format patch — treat the whole thing as one diff block.
    return [{
      hash: null, author: null, authorName: null,
      date: null, subject: null, body: "", diff: raw,
    }]
  }
  startIdxs.push(lines.length)
  const out: PatchBlock[] = []
  for (let i = 0; i < startIdxs.length - 1; i++) {
    const block = lines.slice(startIdxs[i], startIdxs[i + 1]).join("\n")
    out.push(parsePatchBlock(block))
  }
  return out
}

function parsePatchBlock(block: string): PatchBlock {
  const lines = block.split("\n")
  const fromHashLine = /^From ([0-9a-f]{7,40}) /.exec(lines[0] || "")
  const hash = fromHashLine ? fromHashLine[1] : null

  // Headers run until first blank line
  let i = 1
  let author: string | null = null
  let date: string | null = null
  let subject: string | null = null
  for (; i < lines.length; i++) {
    const l = lines[i]
    if (l === "") { i++; break }
    if (/^From: /i.test(l)) author = l.slice(6).trim()
    else if (/^Date: /i.test(l)) date = l.slice(6).trim()
    else if (/^Subject: /i.test(l)) {
      // Subject can wrap; collect continuation lines.
      let s = l.slice(9).trim()
      while (i + 1 < lines.length && /^\s/.test(lines[i + 1])) {
        i++
        s += " " + lines[i].trim()
      }
      subject = s
    }
  }

  // Body runs until the diff stat / `---` line, then the diff begins.
  // `git format-patch` separates body from diffstat with a `---` line on
  // its own. We scan for the first `diff --git` after that.
  let bodyEnd = lines.length
  let diffStart = lines.length
  for (let j = i; j < lines.length; j++) {
    if (lines[j] === "---" && bodyEnd === lines.length) bodyEnd = j
    if (/^diff --git /.test(lines[j]) && diffStart === lines.length) {
      diffStart = j
      if (bodyEnd === lines.length) bodyEnd = j
      break
    }
  }
  const body = lines.slice(i, bodyEnd).join("\n").trim()
  const diff = lines.slice(diffStart).join("\n")

  return {
    hash,
    author,
    authorName: author ? author.replace(/\s*<.+>$/, "").trim() : null,
    date,
    subject,
    body,
    diff,
  }
}

function hasMatchingTest(filePath: string, allPaths: Set<string>): boolean {
  if (!filePath || filePath === "/dev/null") return false
  const ext = path.extname(filePath)
  const dir = path.dirname(filePath)
  const base = path.basename(filePath, ext)
  // If this *is* the test file, count it as having a test change.
  if (/(?:\.|_)(?:test|spec)$/i.test(base) || /\.(?:test|spec)$/i.test(base)) return true
  if (/^(?:tests?|__tests__|spec)\//.test(filePath)) return true
  // Look for `<base>.test.<ext>` / `<base>.spec.<ext>` / `<base>_test.<ext>`
  // either in the same directory or under a parallel `tests/` directory.
  const testCandidates = [
    `${dir}/${base}.test${ext}`,
    `${dir}/${base}.spec${ext}`,
    `${dir}/${base}_test${ext}`,
    `${dir}/${base}_spec${ext}`,
    `${dir}/__tests__/${base}.test${ext}`,
    `${dir}/__tests__/${base}.spec${ext}`,
  ]
  for (const c of testCandidates) {
    if (allPaths.has(c)) return true
  }
  return false
}

// ===========================================================================
// ci-log parser
// ===========================================================================

interface RawLine { num: number; text: string; groupId: string | null }
interface CiGroup {
  id: string
  name: string
  startLine: number
  endLine: number
  lineCount: number
  status: "ok" | "fail" | "warning" | "skipped"
}
interface CiError {
  id: string
  lineNum: number
  severity: "error" | "warning"
  text: string
  groupId: string | null
}
interface FailingTest {
  id: string
  name: string
  file: string | null
  line: number | null
  message: string | null
  lineNum: number
}

function parseCiLog(raw: string, meta: Record<string, unknown> & { sourceFile: string; sizeBytes: number }): ParsedFile {
  const provider = pickProvider(raw)
  const stripped = stripAnsi(raw)
  // Pre-strip any leading per-line timestamp prefix so marker regexes
  // can anchor at column 0 the way the providers emit them at source.
  // Captured logs from GitHub Actions / GitLab CI / etc. arrive with
  // a `<ISO timestamp>Z ` (or `[ISO timestamp]`) prefix.
  const lines = stripped.split("\n").map(stripTimestampPrefix)

  const rawLines: RawLine[] = []
  const groups: CiGroup[] = []
  const errors: CiError[] = []
  let groupCounter = 0
  let errorCounter = 0
  let curGroup: CiGroup | null = null

  function endGroup(atLine: number, status?: CiGroup["status"]) {
    if (!curGroup) return
    curGroup.endLine = atLine
    curGroup.lineCount = atLine - curGroup.startLine + 1
    if (status) curGroup.status = status
    curGroup = null
  }

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1
    const text = lines[i]
    let groupId: string | null = curGroup ? curGroup.id : null

    // Group boundaries
    const ghaGroup = /^##\[group\](.*)$/.exec(text)
    const ghaEnd = /^##\[endgroup\]/.test(text)
    const ghaError = /^##\[error\](.*)$/.exec(text)
    const ghaWarning = /^##\[warning\](.*)$/.exec(text)
    const gitlabStart = /^section_start:\d+:([a-zA-Z0-9_]+)\s*(?:\[[^\]]*\])?\s*(.*)$/.exec(text)
    const gitlabEnd = /^section_end:\d+:[a-zA-Z0-9_]+/.test(text)

    if (ghaGroup) {
      endGroup(lineNum - 1)
      curGroup = {
        id: `g_${String(++groupCounter).padStart(4, "0")}`,
        name: ghaGroup[1].trim() || `step ${groupCounter}`,
        startLine: lineNum, endLine: lineNum, lineCount: 1, status: "ok",
      }
      groups.push(curGroup)
      groupId = curGroup.id
    } else if (ghaEnd) {
      endGroup(lineNum)
    } else if (gitlabStart) {
      endGroup(lineNum - 1)
      curGroup = {
        id: `g_${String(++groupCounter).padStart(4, "0")}`,
        name: (gitlabStart[2] || gitlabStart[1] || `step ${groupCounter}`).trim(),
        startLine: lineNum, endLine: lineNum, lineCount: 1, status: "ok",
      }
      groups.push(curGroup)
      groupId = curGroup.id
    } else if (gitlabEnd) {
      endGroup(lineNum)
    }

    // Error / warning markers
    if (ghaError) {
      const errText = ghaError[1].trim() || text
      errors.push({
        id: `e_${String(++errorCounter).padStart(4, "0")}`,
        lineNum, severity: "error", text: errText, groupId,
      })
      if (curGroup) curGroup.status = "fail"
    } else if (ghaWarning) {
      const warnText = ghaWarning[1].trim() || text
      errors.push({
        id: `e_${String(++errorCounter).padStart(4, "0")}`,
        lineNum, severity: "warning", text: warnText, groupId,
      })
      if (curGroup && curGroup.status === "ok") curGroup.status = "warning"
    } else {
      // Generic markers: "error:", "Error:", "FAILED", "FAIL ", "npm ERR!"
      if (
        /^\s*\[?error\]?:/i.test(text) ||
        /^npm ERR! /.test(text) ||
        /^FAIL\s+\S/.test(text) ||
        /^---\s+FAIL: /.test(text) ||
        /^\s*Error: Process completed with exit code/.test(text)
      ) {
        errors.push({
          id: `e_${String(++errorCounter).padStart(4, "0")}`,
          lineNum, severity: "error", text: text.trim(), groupId,
        })
        if (curGroup) curGroup.status = "fail"
      } else if (/^\s*\[?warning\]?:/i.test(text) || /^WARNING: /.test(text)) {
        errors.push({
          id: `e_${String(++errorCounter).padStart(4, "0")}`,
          lineNum, severity: "warning", text: text.trim(), groupId,
        })
        if (curGroup && curGroup.status === "ok") curGroup.status = "warning"
      }
    }

    rawLines.push({ num: lineNum, text, groupId })
  }
  endGroup(lines.length)

  // Failing tests — runner-specific patterns
  const failingTests = extractFailingTests(lines)

  // Status + exit code — best-effort
  let exitCode: number | null = null
  let status: "passed" | "failed" | "cancelled" | "unknown" = "unknown"
  const exitMatch = /exit(?:ed with)? code:?\s+(\d+)/i.exec(raw) || /Process completed with exit code (\d+)/.exec(raw)
  if (exitMatch) exitCode = parseInt(exitMatch[1], 10)
  if (errors.some(e => e.severity === "error") || failingTests.length > 0 || (exitCode !== null && exitCode !== 0)) {
    status = "failed"
  } else if (exitCode === 0) {
    status = "passed"
  }
  if (/cancell?ed/i.test(raw) && status === "unknown") status = "cancelled"

  const totals = {
    lines: rawLines.length,
    groups: groups.length,
    errors: errors.filter(e => e.severity === "error").length,
    warnings: errors.filter(e => e.severity === "warning").length,
    failingTests: failingTests.length,
  }
  meta.totals = totals
  meta.provider = provider
  meta.status = status
  meta.exitCode = exitCode

  // Sample: enough context for the LLM to triage without dragging the
  // full log into the prompt. First 60 lines + last 80 + ~12 lines of
  // context around each detected error (capped) + the first failing
  // test block, in order.
  const sample = {
    ...meta,
    groups,
    errors: errors.slice(0, 40),
    failingTests: failingTests.slice(0, 12),
    firstLines: rawLines.slice(0, 60).map(l => `${l.num}: ${l.text}`),
    lastLines: rawLines.slice(-80).map(l => `${l.num}: ${l.text}`),
    errorContexts: errors.slice(0, 12).map(e => contextWindow(rawLines, e.lineNum, 6, 6)),
  }

  return {
    contentType: "ci-log",
    summary:
      `CI log (${provider}): ${rawLines.length} lines, ${groups.length} step${groups.length === 1 ? "" : "s"}, ` +
      `${totals.errors} error${totals.errors === 1 ? "" : "s"}, ${totals.failingTests} failing test${totals.failingTests === 1 ? "" : "s"}, ` +
      `status: ${status}.`,
    sample,
    data: {
      kind: "ci-log", provider, status, exitCode,
      groups, errors, failingTests, totals,
      rawLines,
      ...meta,
    },
    meta,
  }
}

function pickProvider(raw: string): string {
  if (CI_GHA_GROUP.test(raw)) return "github-actions"
  if (CI_GITLAB_SECTION.test(raw)) return "gitlab-ci"
  if (/^---\s+CircleCI\b/m.test(raw)) return "circleci"
  if (/^~~~/m.test(raw) && /Buildkite/.test(raw)) return "buildkite"
  if (/Started by/.test(raw) && /Jenkins/i.test(raw)) return "jenkins"
  return "generic"
}

function stripAnsi(s: string): string {
  // ESC [ ... m  CSI sequence, plus a few common others.
  return s
    .replace(/\x1b\[\d{0,3}(?:;\d{0,3}){0,5}m/g, "")
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\r/g, "")
}

function stripTimestampPrefix(line: string): string {
  // GitHub Actions: `2026-05-04T16:21:08.4972145Z <line>`
  const gha = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s(.*)$/.exec(line)
  if (gha) return gha[1]
  // GitLab CI / Buildkite-style bracketed: `[2026-05-04T16:21:08+00:00] <line>`
  const bracketed = /^\[\d{4}-\d{2}-\d{2}T[\d:+.\-Z]+\]\s(.*)$/.exec(line)
  if (bracketed) return bracketed[1]
  // Jenkins console: `[Pipeline] <line>` — keep the prefix; it is the
  // marker shape Jenkins users expect to see in the output.
  return line
}

function extractFailingTests(lines: string[]): FailingTest[] {
  const out: FailingTest[] = []
  let counter = 0

  // Jest: `FAIL  src/foo.test.ts` then later `  ✕ test name` and
  // `    Error: …` / `    expect(...).toBe(...)`.
  // pytest: `FAILED tests/test_foo.py::test_bar - AssertionError: …`
  // go test: `--- FAIL: TestFoo (0.00s)`
  // mocha: `  1) Suite: test name:` followed by error block.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const pytest = /^FAILED\s+([^\s:]+)::([^\s]+)(?:\s+-\s+(.+))?$/.exec(line)
    if (pytest) {
      out.push({
        id: `ft_${String(++counter).padStart(4, "0")}`,
        name: pytest[2],
        file: pytest[1], line: null,
        message: pytest[3] || null,
        lineNum: i + 1,
      })
      continue
    }

    const goFail = /^---\s+FAIL: (\S+)\s+\(([0-9.]+)s\)$/.exec(line)
    if (goFail) {
      // Look ahead a few lines for `<file>:<line>:` to pin the location.
      let file: string | null = null
      let lineNo: number | null = null
      let msg: string | null = null
      for (let k = i + 1; k < Math.min(i + 8, lines.length); k++) {
        const m = /\s*([\w./-]+\.go):(\d+):\s*(.*)$/.exec(lines[k])
        if (m) { file = m[1]; lineNo = parseInt(m[2], 10); msg = m[3] || null; break }
      }
      out.push({
        id: `ft_${String(++counter).padStart(4, "0")}`,
        name: goFail[1], file, line: lineNo, message: msg, lineNum: i + 1,
      })
      continue
    }

    const jestX = /^\s*✕\s+(.+?)(?:\s+\((\d+)\s*ms\))?$/.exec(line)
    if (jestX) {
      // Find the most recent `FAIL  <file>` line above for context.
      let file: string | null = null
      for (let k = i - 1; k >= 0; k--) {
        const m = /^FAIL\s+(\S+)/.exec(lines[k])
        if (m) { file = m[1]; break }
        if (/^PASS\s+\S/.test(lines[k]) || /^FAIL\s+\S/.test(lines[k])) break
      }
      // Look ahead for the assertion / Error line.
      let msg: string | null = null
      for (let k = i + 1; k < Math.min(i + 12, lines.length); k++) {
        const m = /^\s+(?:Error|expect|Expected):?\s*(.+)$/.exec(lines[k])
        if (m) { msg = m[1].trim(); break }
      }
      out.push({
        id: `ft_${String(++counter).padStart(4, "0")}`,
        name: jestX[1].trim(), file, line: null, message: msg, lineNum: i + 1,
      })
      continue
    }
  }
  return out
}

function contextWindow(rawLines: RawLine[], anchor: number, before: number, after: number): { anchor: number; lines: string[] } {
  const start = Math.max(1, anchor - before)
  const end = Math.min(rawLines.length, anchor + after)
  const slice = rawLines.slice(start - 1, end).map(l => `${l.num}: ${l.text}`)
  return { anchor, lines: slice }
}

// ===========================================================================
// stack-trace parser
// ===========================================================================

interface Frame {
  id: string
  rawLine: string
  file: string | null
  line: number | null
  col: number | null
  function: string | null
  isApp: boolean
  isVendor: boolean
}

interface Cause {
  id: string
  type: string | null
  message: string | null
  frames: Frame[]
}

function parseStackTrace(raw: string, meta: Record<string, unknown> & { sourceFile: string; sizeBytes: number }): ParsedFile {
  const language = pickStackLanguage(raw)
  const causes: Cause[] = []
  let causeCounter = 0
  let frameCounter = 0

  function newCause(type: string | null, message: string | null): Cause {
    return {
      id: `cause_${String(++causeCounter).padStart(4, "0")}`,
      type, message, frames: [],
    }
  }
  function pushFrame(c: Cause, raw: string, parsed: Partial<Frame>) {
    const f: Frame = {
      id: `fr_${String(++frameCounter).padStart(4, "0")}`,
      rawLine: raw,
      file: parsed.file ?? null,
      line: parsed.line ?? null,
      col: parsed.col ?? null,
      function: parsed.function ?? null,
      isApp: false,
      isVendor: false,
    }
    classifyFrame(f, language)
    c.frames.push(f)
  }

  const lines = raw.split("\n")
  if (language === "python") {
    let cur: Cause | null = null
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (/^Traceback \(most recent call last\):/.test(line)) {
        cur = newCause(null, null)
        causes.push(cur)
        continue
      }
      // `During handling of the above exception, another exception occurred:`
      if (/^During handling of the above exception/.test(line) || /^The above exception was the direct cause/.test(line)) {
        // Next Traceback opens a new cause; nothing to do here.
        continue
      }
      const fileLine = /^\s+File "([^"]+)", line (\d+)(?:, in (\S+))?/.exec(line)
      if (fileLine && cur) {
        pushFrame(cur, line, {
          file: fileLine[1],
          line: parseInt(fileLine[2], 10),
          function: fileLine[3] || null,
        })
        // Source code line on the next line is fine to keep in rawLine; Python prints it after.
        continue
      }
      const exception = /^([\w.]+(?:Error|Exception|Warning|Interrupt|SystemExit)):\s*(.*)$/.exec(line)
      if (exception && cur) {
        cur.type = exception[1]
        cur.message = exception[2] || null
        continue
      }
    }
  } else if (language === "javascript") {
    // First line is `<ExceptionType>: <message>` (or `Error: …`); subsequent
    // lines are `    at <function> (<file>:<line>:<col>)` or
    // `    at <file>:<line>:<col>`.
    let cur: Cause | null = null
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const head = /^([A-Z][\w]*(?:Error|Exception|Warning))?:?\s*(.*)$/.exec(line)
      const isErrHead = /^[A-Z][\w]*(?:Error|Exception|Warning|Aggregate(?:Error)?):/.test(line) || /^Error:/.test(line)
      const causedBy = /^\s*Caused by:\s*([\w.]+(?:Error|Exception)?):?\s*(.*)$/.exec(line)
      if (isErrHead && head) {
        cur = newCause(head[1] || "Error", head[2] || null)
        causes.push(cur)
        continue
      }
      if (causedBy) {
        cur = newCause(causedBy[1] || null, causedBy[2] || null)
        causes.push(cur)
        continue
      }
      const at = /^\s+at\s+(?:(.+?)\s+\(([^)]+)\)|(.+))$/.exec(line)
      if (at && cur) {
        let func = at[1] || null
        let loc = at[2] || at[3] || ""
        const locMatch = /^(.+?):(\d+)(?::(\d+))?$/.exec(loc)
        pushFrame(cur, line, {
          function: func,
          file: locMatch ? locMatch[1] : loc || null,
          line: locMatch ? parseInt(locMatch[2], 10) : null,
          col: locMatch && locMatch[3] ? parseInt(locMatch[3], 10) : null,
        })
        continue
      }
    }
  } else if (language === "java") {
    // Java: `<Type>: <message>` then `\tat <fully.qualified.Class>.method(File.java:42)`,
    // optional `Caused by: <Type>: <message>`.
    let cur: Cause | null = null
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const head = /^(?:Exception in thread\s+"[^"]+"\s+)?([\w.$]+(?:Exception|Error)):?\s*(.*)$/.exec(line)
      const causedBy = /^\s*Caused by:\s*([\w.$]+(?:Exception|Error)):?\s*(.*)$/.exec(line)
      if (causedBy) {
        cur = newCause(causedBy[1], causedBy[2] || null)
        causes.push(cur)
        continue
      }
      if (head && /Exception|Error/.test(head[1]) && !/^\s/.test(line)) {
        cur = newCause(head[1], head[2] || null)
        causes.push(cur)
        continue
      }
      const at = /^\s+at\s+([\w.$<>]+)\((.+?)(?::(\d+))?\)$/.exec(line)
      if (at && cur) {
        pushFrame(cur, line, {
          function: at[1],
          file: at[2] || null,
          line: at[3] ? parseInt(at[3], 10) : null,
        })
      }
    }
  } else if (language === "go") {
    // Go: `panic: <message>`, then `goroutine N [state]:`, then per-frame
    // `<func>(...)\n\t<file>:<line> +0x...`.
    let cur: Cause | null = null
    let panicLine = lines.findIndex(l => /^panic:\s/.test(l))
    if (panicLine >= 0) {
      cur = newCause("panic", lines[panicLine].slice(7).trim())
      causes.push(cur)
    }
    for (let i = (panicLine >= 0 ? panicLine + 1 : 0); i < lines.length - 1; i++) {
      // Frame: a function call line followed by an indented `\t<file>:<line>`.
      const callMatch = /^(\S+)\(/.exec(lines[i])
      const locMatch = /^\t(\S+):(\d+)(?:\s.*)?$/.exec(lines[i + 1])
      if (callMatch && locMatch && cur) {
        pushFrame(cur, `${lines[i]}\n${lines[i + 1]}`, {
          function: callMatch[1],
          file: locMatch[1],
          line: parseInt(locMatch[2], 10),
        })
        i++
      }
    }
  } else if (language === "ruby") {
    // Ruby: `<file>:<line>:in '<func>': <message> (<Class>)`.
    let cur: Cause | null = null
    for (let i = 0; i < lines.length; i++) {
      const m = /^([\w/.\- ]+):(\d+):in `([^']+)'(?:: (.+) \(([\w:]+(?:Error|Exception))\))?$/.exec(lines[i])
      if (m) {
        if (m[5] && !cur) {
          cur = newCause(m[5], m[4] || null)
          causes.push(cur)
        }
        if (cur) {
          pushFrame(cur, lines[i], {
            file: m[1], line: parseInt(m[2], 10), function: m[3],
          })
        }
      }
    }
  } else if (language === "rust") {
    let cur: Cause | null = null
    const head = /^thread '([^']+)' panicked at (?:'(.+?)', |(.+):\s*)?(.*)$/.exec(raw)
    if (head) {
      cur = newCause("panic", (head[2] || head[4] || "").trim() || null)
      causes.push(cur)
    }
    for (let i = 0; i < lines.length; i++) {
      const m = /^\s*\d+:\s+(.+?)\s*$/.exec(lines[i])
      const at = /^\s+at\s+(.+?):(\d+)(?::(\d+))?$/.exec(lines[i + 1] || "")
      if (m && at && cur) {
        pushFrame(cur, `${lines[i]}\n${lines[i + 1]}`, {
          function: m[1],
          file: at[1], line: parseInt(at[2], 10),
          col: at[3] ? parseInt(at[3], 10) : null,
        })
        i++
      }
    }
  } else if (language === "csharp") {
    let cur: Cause | null = null
    for (let i = 0; i < lines.length; i++) {
      const head = /^([\w.]+(?:Exception|Error)):\s*(.+)$/.exec(lines[i])
      const inner = /^\s*---> ([\w.]+(?:Exception|Error)):\s*(.+)$/.exec(lines[i])
      if (head && !/^\s/.test(lines[i])) {
        cur = newCause(head[1], head[2] || null)
        causes.push(cur)
        continue
      }
      if (inner) {
        cur = newCause(inner[1], inner[2] || null)
        causes.push(cur)
        continue
      }
      const at = /^\s+at\s+([\w.<>]+\(.*?\))(?:\s+in\s+(.+?):line\s+(\d+))?$/.exec(lines[i])
      if (at && cur) {
        pushFrame(cur, lines[i], {
          function: at[1],
          file: at[2] || null,
          line: at[3] ? parseInt(at[3], 10) : null,
        })
      }
    }
  }

  // If we couldn't classify it cleanly, fall back to one cause with
  // the raw text and an empty frame list — the prompt will say so.
  if (causes.length === 0) {
    causes.push({
      id: `cause_0001`,
      type: null,
      message: extractFirstNonEmptyLine(lines),
      frames: [],
    })
  }

  const exception = { type: causes[0].type, message: causes[0].message }
  let frameCount = 0, appFrameCount = 0, vendorFrameCount = 0
  for (const c of causes) {
    for (const f of c.frames) {
      frameCount++
      if (f.isApp) appFrameCount++
      if (f.isVendor) vendorFrameCount++
    }
  }

  meta.language = language
  meta.frameCount = frameCount
  meta.appFrameCount = appFrameCount
  meta.vendorFrameCount = vendorFrameCount
  meta.causeChainDepth = causes.length

  const sample = {
    ...meta,
    exception,
    causes: causes.map(c => ({
      id: c.id, type: c.type, message: c.message,
      frames: c.frames.map(f => ({
        id: f.id, file: f.file, line: f.line, col: f.col,
        function: f.function, isApp: f.isApp, isVendor: f.isVendor,
        rawLine: f.rawLine.length > 200 ? f.rawLine.slice(0, 200) + "…" : f.rawLine,
      })),
    })),
    rawTextPreview: raw.slice(0, 4000),
  }

  return {
    contentType: "stack-trace",
    summary:
      `Stack trace (${language}): ${causes.length} cause${causes.length === 1 ? "" : "s"}, ` +
      `${frameCount} frame${frameCount === 1 ? "" : "s"}` +
      (frameCount > 0 ? ` (${appFrameCount} app, ${vendorFrameCount} vendor).` : "."),
    sample,
    data: {
      kind: "stack-trace", language, exception, causes,
      frameCount, appFrameCount, vendorFrameCount,
      rawText: raw,
      ...meta,
    },
    meta,
  }
}

function pickStackLanguage(raw: string): "python" | "javascript" | "java" | "go" | "ruby" | "rust" | "csharp" | "unknown" {
  if (STACK_PYTHON.test(raw)) return "python"
  if (STACK_GO.test(raw)) return "go"
  if (STACK_RUST.test(raw)) return "rust"
  if (STACK_JAVA.test(raw)) return "java"
  if (STACK_RUBY.test(raw)) return "ruby"
  if (STACK_CSHARP.test(raw)) return "csharp"
  if (STACK_JS.test(raw)) return "javascript"
  return "unknown"
}

const VENDOR_HINTS = [
  "node_modules/", "node:internal/",
  "site-packages/", "/usr/lib/python", "<frozen ",
  "/.venv/", "/venv/lib/", "/dist-packages/",
  "go/pkg/mod/", "/usr/local/go/src/",
  "/lib/ruby/gems/", "/.rbenv/", "/.rvm/",
  "rust/library/", "/rustc/",
  "/usr/local/lib/", "/usr/lib/node_modules/",
]

const APP_PATH_HINTS = [
  // Project-relative segments that almost always mean "this is the app".
  "/src/", "/app/", "/lib/", "/cmd/", "/pkg/", "/tests/", "/test/", "/spec/",
  "/internal/", "/services/", "/handlers/", "/api/", "/billing/", "/checkout/",
]

function classifyFrame(f: Frame, _language: string): void {
  const file = f.file || ""
  if (!file) {
    f.isApp = false
    f.isVendor = false
    return
  }
  // Vendor hints first — known stdlib / package-manager / framework paths.
  for (const hint of VENDOR_HINTS) {
    if (file.includes(hint)) {
      f.isVendor = true
      f.isApp = false
      return
    }
  }
  // Java-shaped fully-qualified class names: `java.base/`, `javax.*`,
  // `sun.*`, `org.springframework.*`, `Microsoft.*`, `System.*`. These
  // appear in the *function* slot for Java/.NET; the file slot in those
  // languages is a bare `Foo.java` or `Foo.cs` so we use the function
  // string as a fallback signal.
  const fnHint = f.function || ""
  if (
    /^java\./.test(fnHint) || /^javax\./.test(fnHint) || /^sun\./.test(fnHint) ||
    /^org\.springframework\./.test(fnHint) || /^Microsoft\./.test(fnHint) ||
    /^System\./.test(fnHint) ||
    /node:internal\//.test(fnHint)
  ) {
    f.isVendor = true
    f.isApp = false
    return
  }
  // App hints: relative project-shaped paths or absolute deploy paths
  // that contain a project-shape segment (`/srv/<repo>/src/...`,
  // `/app/checkout/...`, `/var/www/<repo>/lib/...`).
  if (
    /^src\//.test(file) || /^app\//.test(file) || /^lib\//.test(file) ||
    /^cmd\//.test(file) || /^pkg\//.test(file) || /^tests?\//.test(file) ||
    /^spec\//.test(file)
  ) {
    f.isApp = true
    return
  }
  for (const hint of APP_PATH_HINTS) {
    if (file.includes(hint)) {
      f.isApp = true
      return
    }
  }
  // Default: relative paths with no segment hint → tentatively app
  // (uncovered code path, treat as the bias the prompt expects).
  // Absolute paths with no app hint → unclassified (neither app nor
  // vendor); the prompt will say so.
  if (file.startsWith("/") || /^[A-Za-z]:\\/.test(file)) {
    f.isApp = false
    f.isVendor = false
    return
  }
  f.isApp = true
}

function extractFirstNonEmptyLine(lines: string[]): string | null {
  for (const l of lines) {
    if (l.trim()) return l.trim().slice(0, 240)
  }
  return null
}
