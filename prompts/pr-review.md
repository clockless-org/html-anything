# pr-review — pull-request patches and PR pages

A pull-request artifact: either a `git format-patch` mailbox (each
commit as its own `From <hash>\nFrom: …\nDate: …\nSubject: …` block
followed by a unified diff), a GitHub `.patch` URL download, or a PR
page that contains both metadata and the diff. The output is a **PR
review guide** — what changed, what's risky, what the commit history
implies, and what a reviewer should check before approving.

The right output makes the user say *"oh, here's how I'd review this
PR"* — title and body summarized, commit history as a story, file
risk map, and the diff as drill-down.

## What to surface (the headline of the page)

Look at the sample (PR title / body / branch info, commit list with
authors / dates / subjects, file footprint with adds/dels per file,
sample hunks) and **infer + visualize**:

### PR card (top)

- **Title + branch** — `feature/x → main`, author, date range of
  commits ("authored over 4 days · last commit 3h ago").
- **Body summary** — 2–3 sentence editorial recap of what the PR
  body claims this change does. Pulled from the description block.
  If the body is empty or templated, say so ("Description is the
  default template; lean on the diff and commits.").
- **Footprint** — files changed, total additions, total deletions,
  hunks, commits. One-line sentence form.
- **Shape** — one-sentence read on whether the PR is a tight focused
  change, a sprawling refactor, or a feature drop. Label it as a
  hypothesis.

### Commit timeline

Render commits as a vertical timeline (top to bottom = oldest to
newest, or grouped if there's a clear "fixup" cluster). Each commit:

- short hash (mono), author, relative time
- subject line
- a small chip with files changed / +adds / −dels for that commit
- a "fixup" or "wip" tag if the subject matches `fixup!` / `wip:` /
  `tmp:` patterns — useful to spot commits a reviewer probably
  doesn't need to read line-by-line

Highlight any commit whose subject or body contradicts the PR title
("PR title says 'add feature X', commit 4/7 says 'revert feature X'
— hypothesis: rebase needed.")

### Risk map by file (the insight layer)

Same shape as the git-diff pack — every changed file as a row with
path, status, +/-, and a one-sentence risk note. **Plus** for PR
review:

- A "Reviewers should check" line per file: e.g. "this file is the
  auth boundary — confirm the new `verifySession` handles the empty-
  token case", or "schema migration — confirm backwards
  compatibility with deployed services".
- A "Tests touched?" badge (green/red) per file pair: did the change
  to `src/X.ts` come with a change to `tests/X.test.ts` (or
  `X_test.py`, `X.spec.ts`, etc.). If no test was touched alongside,
  flag it as a hypothesis: "No matching test file change — worth
  asking the author if there's coverage."

### Reviewer's checklist (non-negotiable section)

A first-class panel of concrete, evidence-based items the reviewer
should confirm. Each item is a one-line imperative pulled from the
actual change:

- "Confirm the new `parseHeader` handles empty input — old code
  returned `null`, new code throws."
- "Verify the migration in `0042_add_user_kind.sql` runs against a
  populated table without locking."
- "Check that `featureFlag.isEnabled('newAuth')` is wired in the
  service that calls this."

Aim for 4–10 items, sorted by risk. Generic items ("did you write
tests") are not allowed — every item must reference something
specific in the diff.

### The diff itself

Below the analysis, include the **full unified diff** as a drill-
down (default collapsed):

- Per-commit grouping if the source provides it — each commit's
  subject + diff in its own collapsible panel, in chronological
  order.
- Per-file jump-nav inside each commit.
- Side-by-side view available on wide viewports; default unified on
  narrow.
- Cmd-F-style search across the diff with match highlights.
- A "copy hunk" button on each `@@` header so reviewers can lift a
  chunk into a comment.

## Required sections (must always render — non-negotiable)

1. **Review checklist** — labeled panel of evidence-based verify
   items. 4–10 entries.
2. **Risk hotspots** — labeled "Risk hotspots" section, 2–6 highest-
   risk files / hunks, each with a one-sentence why-risky and a
   "Hypothesis" chip.
3. **Commits** — labeled "Commits" timeline. Empty state ("This
   patch contains a single commit.") if only one.
4. **Risk map by file** — labeled section showing every changed
   file with adds/dels/risk-note/test-touched.
5. **Collapsible raw diff** — full diff, default collapsed, with
   per-commit grouping where the source provides it. Visible "Diff"
   or "Raw diff" label.
6. **Copy summary** — labeled "Copy summary" button putting a
   Markdown recap (PR title, footprint, top hotspots, checklist) on
   the clipboard. The output should be paste-ready into a PR review
   comment.

## Data shape

```ts
DATA = {
  kind: "pr-review",
  pr: {
    title?: "Add session-expiry verification",
    body?: "...PR description text...",
    branch?: "feature/session-expiry",
    base?: "main",
    author?: "Alex Chen <alex@acme.co>",
    url?: "https://github.com/owner/repo/pull/123"
  },
  commits: [
    {
      id: "c_0001",
      hash: "abcd1234",
      shortHash: "abcd123",
      author: "Alex Chen <alex@acme.co>",
      authorName: "Alex Chen",
      date: "2026-05-04 10:32:00",
      subject: "session: verify expiry before issuing token",
      body: "...optional commit message body...",
      fileIds: ["f_0001", "f_0003"],          // files this commit touched
      additions: 42, deletions: 7
    }
  ],
  files: [
    {
      id: "f_0001",
      path: "src/auth/session.ts",
      status: "modified" | "added" | "deleted" | "renamed",
      language: "typescript",
      additions: 84, deletions: 22,
      isBinary: false,
      hasMatchingTestChange: true,             // hypothesis-only flag
      hunks: [/* same shape as git-diff */]
    }
  ],
  totals: {
    files: 12,
    additions: 287, deletions: 94,
    hunks: 23, commits: 4,
    byStatus: { modified: 9, added: 2, deleted: 1, renamed: 0 },
    byLanguage: { typescript: 7, python: 2, sql: 1 }
  },
  meta: { sourceFile, sizeBytes, format: "git-format-patch" | "github-pr-patch" }
}
```

The `commits` array is empty / single-entry for plain unified diffs;
the prompt should render gracefully in that case (the pack still has
files + totals, just no per-commit timeline).

## Tone

Senior-reviewer-grade. Specific, hedged, decision-oriented. Refer to
files / hashes / line numbers in `var(--font-mono)` inline. The
"Copy summary" output should sound like a thoughtful review comment
a reviewer would actually post — not a list of metrics.
