# git-diff — unified diffs and patches (`.diff`, `.patch`, `git diff` output)

A unified diff: a single change-set across one or more files. No PR
metadata, no commit history — just `diff --git a/... b/...`, `--- /
+++` headers, and `@@ -..,+.. @@` hunks. The output is **not a code
viewer** — it's a review guide for *this specific change-set* with a
risk read on what's likely to break.

The right output makes the user say *"oh, here's where to focus the
review"* — which files carry the real risk, which hunks need a closer
look, and what tests / call-sites / regressions a reviewer should
check before approving.

## What to surface (the headline of the page)

Look at the sample (file list with adds/dels per file, hunk headers
with surrounding function context, language hints from extensions, the
biggest hunks verbatim) and **infer + visualize**:

### Change-set card (top)

- **Footprint** — files changed, total additions, total deletions,
  hunks. Sentence form: "12 files · +287 / −94 · 23 hunks", with the
  hottest file called out ("biggest change is `src/auth/session.ts`
  at +84 / −22 across 4 hunks").
- **Shape** — one-sentence read on what kind of change this is:
  refactor, feature add, bugfix, migration, dependency bump, generated
  code. Pulled from the file mix and hunk language. Label it as a
  hypothesis ("Hypothesis: this looks like a refactor of the session
  layer plus a small fix to `parseHeader`.")
- **Languages touched** — small chip row (.ts × 5, .py × 2, .sql × 1,
  …). Useful at a glance for "is this a frontend PR or a schema
  change".

### Risk map by file (the insight layer)

Render every changed file as a row with:

- file path, status (added / modified / deleted / renamed)
- additions (green), deletions (red), net delta
- a one-sentence risk note pulled from what changed (e.g. "Touches
  the auth boundary — confirm the new `verifySession` handles the
  empty-token case the old one swallowed.")
- a "Hypothesis" chip when the risk note is inferred from the diff
  surface (almost always — say so).

Sort by risk first, then by churn. The point is to put the highest-
risk files at the top of the reviewer's attention, not alphabetically
list them.

### Hunk timeline (visualization)

Pick at most one of these — whichever fits the change-set's shape:

- **File heatmap** — vertical bars, one per file, height = total lines
  changed, color split between adds (green) and dels (red). Glanceable
  for a 5–30 file PR.
- **Hunk strip** — horizontal lane per file, each hunk as a tick
  proportional to its size. Reveals "one big rewrite vs many small
  edits".
- **Module / directory roll-up** — group by top-level directory; one
  row per group with totals. Useful when the diff spans 50+ files —
  glanceable as "60% of churn is in `src/api/`".

Skip the visualization for tiny diffs (≤ 3 files) — the file list
already tells the whole story.

### Dependency / call-graph hint

When the sample shows function signatures changing (renamed param,
new return type, removed export), surface a "Call sites to check"
panel listing the affected symbol names with a hypothesis like
"Renamed `parseHeader` → `parseHeaders` — grep for `parseHeader\(` to
confirm no callers were missed." Mark the panel as "Hypothesis"
since you can only see the diff, not the rest of the codebase.

### The diff itself

Below the analysis, include the **full unified diff** as a drill-down
(default collapsed):

- File jump-nav at the top (sticky if the diff is long).
- Per-file collapsible panel with the file path, status badge, and
  net delta in the header.
- Inside each file: hunk-by-hunk view with `@@` headers shown as
  small chips, line numbers in `var(--font-mono)`, additions on a
  faint green tint, deletions on a faint red tint, context in
  `var(--fg-2)`. Side-by-side or unified — pick what fits the
  viewport (default to unified on mobile).
- Cmd-F-style search across the diff that highlights matches and
  jumps between them.
- A copy button on each hunk header so reviewers can lift a specific
  chunk into a review comment.

## Required sections (must always render — non-negotiable)

These five sections are part of the git-diff pack contract:

1. **Review checklist** — labeled panel of concrete verify-before-
   approve items pulled from the actual change. 4–10 items.
2. **Risk hotspots** — labeled "Risk hotspots" section listing 2–6
   highest-risk files / hunks with a one-sentence why-risky.
3. **Risk map by file** — labeled section showing every changed file
   with adds/dels/risk-note, sortable.
4. **Collapsible raw diff** — the full unified diff as drill-down,
   default collapsed, with file nav + search + copy. The literal
   label "Diff" or "Raw diff" must be visible.
5. **Copy summary** — labeled "Copy summary" button putting a
   Markdown recap on the clipboard.

Render these five regardless of diff size. They are the headline
shape of the pack — without them, the output is incomplete.

## Data shape

```ts
DATA = {
  kind: "git-diff",
  files: [
    {
      id: "f_0001",
      path: "src/auth/session.ts",
      oldPath: "src/auth/session.ts",
      newPath: "src/auth/session.ts",
      status: "modified" | "added" | "deleted" | "renamed",
      language: "typescript",            // from extension; null if unknown
      additions: 84,
      deletions: 22,
      isBinary: false,
      hunks: [
        {
          id: "h_0001",
          header: "@@ -10,7 +10,9 @@ function verifySession(token)",
          oldStart: 10, oldLines: 7,
          newStart: 10, newLines: 9,
          context: "function verifySession(token)",  // text after the second @@
          lines: [
            { kind: "context" | "add" | "del", oldNum, newNum, text }
          ]
        }
      ]
    }
  ],
  totals: {
    files: 12,
    additions: 287,
    deletions: 94,
    hunks: 23,
    byStatus: { modified: 9, added: 2, deleted: 1, renamed: 0 },
    byLanguage: { typescript: 7, python: 2, sql: 1, json: 2 }
  },
  meta: { sourceFile, sizeBytes, format: "unified-diff" }
}
```

The full `files[].hunks[].lines` array drives the raw drill-down;
`totals` feeds the change-set card; `files[].language` decides which
syntax-coloring path to pick. The parser does not classify risk —
the LLM picks risk hotspots from the hunk text + file paths.

## Tone

Reviewer-grade. Specific about what you see, hedged about what you
infer. "The deletion of the `expiry < Date.now()` check in
`session.ts` removes the expiry guard for short-lived tokens —
hypothesis: relies on the new `verifySession` doing this earlier;
worth confirming with a test" reads right. "Looks risky" does not.

Refer back to file paths and line numbers in `var(--font-mono)`
inline so the reviewer can navigate quickly.
