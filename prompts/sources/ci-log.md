# ci-log — CI / build / test logs (`.log`, GitHub Actions, GitLab CI, …)

A continuous-integration log: a long, mostly-noise text stream from a
build / test / deploy run that ended in either success or (more
interestingly) failure. Common sources: GitHub Actions step output,
GitLab CI job log, CircleCI job log, Buildkite, Jenkins console,
generic `npm test` / `pytest` / `go test` output.

The output is **not a log viewer** — it's a **failure summary** that
makes the user say *"oh, here's why this run failed and where to
look first"*, with the raw log as drill-down.

## What to surface (the headline of the page)

Look at the sample (provider hint, group/step boundaries, error +
warning markers, failing-test signatures, exit code, first/last
chunks) and **infer + visualize**:

### Run card (top)

- **Status** — passed / failed / cancelled / unknown (from exit code
  + presence of error markers). Big visible badge.
- **Provider** — GitHub Actions / GitLab CI / CircleCI / Buildkite /
  Jenkins / generic. Pulled from the marker shape (e.g.
  `##[group]`/`##[error]` → GitHub Actions; `section_start:` →
  GitLab CI; `---` block headers → CircleCI; otherwise generic).
- **Steps / phases** — count of groups / sections / steps detected,
  and how many failed.
- **Duration** — wall-clock duration where the log carries
  timestamps; otherwise an estimate label like "~timestamps not
  parseable".
- **Failure headline** — one sentence: "Failed in step `Run tests`
  at line 412 — `TypeError: cannot read property 'id' of
  undefined`." If the log is a passing run, say so plainly: "Run
  succeeded — surfacing the longest steps in case any look slow."

### Phase / step strip (visualization)

A horizontal strip of phases (one block per group / step), colored
by status:

- green = ok, red = failed, yellow = warning-only, grey = skipped.
- Width proportional to line count (or duration if timestamps are
  parseable).
- Click a block → jump to that group's first line in the raw
  drill-down.

This is the single most useful glance for a CI log: "the failure is
in step 4, not step 1; ignore the first 8 minutes of build output".

### Failing tests panel

If the log contains test-runner output (jest, mocha, pytest, go
test, rspec, junit-style summaries), surface every failing test as a
card:

- test name + file:line where available
- the assertion / failure message (one sentence, the first line of
  the failure body)
- a code-snippet preview of the failure block (3–10 lines from the
  log around the failure)
- a "Hypothesis" line for what likely went wrong, hedged
  appropriately ("Hypothesis: the `userId` field on `session` is
  undefined when the test sets up via `mockSession()` — worth
  checking if the new `verifySession` reads it before the mock
  populates it.")

If there are no failing tests but the run failed, render an empty
state ("No failing test signatures found — the failure was likely
in build / setup / lint; check the error markers below.") rather
than omitting the section.

### Suspected root cause(s) (hypothesis, multiple if needed)

A panel listing 1–3 candidate explanations for the failure, each
labeled as a hypothesis with a "Hypothesis" chip. For each:

- one-sentence summary of the candidate cause
- the line(s) in the raw log it's based on (linkable into the drill-
  down)
- what would *distinguish* this hypothesis from the others — e.g.
  "If a re-run reproduces, this is real; if a re-run passes, this
  was likely a flaky network call."

If the evidence supports a single clear cause, render one card. If
it's ambiguous, render two or three competing cards. Never render
zero cards on a failed run — say "Cause not identifiable from this
log alone — visible failure is the assertion above; the call site is
not in the visible frames" if you have to.

### Errors + warnings ledger

A scrollable list of every error / warning marker the parser
extracted, with:

- severity chip (error / warning), line number, source phase / step
- the raw line text (mono)
- click → jump to that line in the raw drill-down

For long logs, paginate or virtualize this ledger — it can be
thousands of items.

### The log itself

Below the analysis, include the **full log** as a drill-down (default
collapsed):

- Step / group folding (default: failed steps expanded, others
  collapsed). Group headers in `var(--font-mono)`.
- Per-line line numbers in `var(--font-mono)`, in a fixed left
  gutter so search-anchors line up.
- Error lines in `var(--red)`, warnings in `var(--yellow)`, normal
  context in `var(--fg-2)`.
- ANSI escape sequences (`\x1b[…m`) parsed into colors where
  reasonable; otherwise stripped, never leaked as raw escapes.
- Cmd-F-style search that highlights matches and jumps between them.
- "Copy line" button on each line for grabbing a stack-frame or
  error message into a ticket.

## Required sections (must always render — non-negotiable)

1. **Run summary** — labeled "Run" or "Run summary" panel with
   status / provider / phases / failure headline.
2. **Review checklist** — labeled panel of concrete next-step verify
   items pulled from the failure ("Re-run with the same revision to
   check flakiness", "Inspect `tests/auth.test.ts:42` locally", …).
3. **Risk hotspots** — labeled "Risk hotspots" section listing the
   2–6 highest-risk lines / steps / failing tests with one-sentence
   why-risky.
4. **Suspected root cause(s)** — labeled "Suspected root cause"
   section with 1–3 hypothesis cards, every card carrying a
   "Hypothesis" chip.
5. **Failing tests** — labeled "Failing tests" section, empty state
   line if none.
6. **Collapsible raw log** — labeled "Log" or "Raw log" drill-down,
   default collapsed, with step folding + search + copy.
7. **Copy summary** — labeled "Copy summary" button putting a
   Markdown failure recap on the clipboard (status, headline, root-
   cause hypotheses, top errors). Paste-ready into an incident
   channel or ticket.

## Data shape

```ts
DATA = {
  kind: "ci-log",
  provider: "github-actions" | "gitlab-ci" | "circleci" | "buildkite" | "jenkins" | "generic",
  status: "passed" | "failed" | "cancelled" | "unknown",
  exitCode: number | null,
  groups: [
    {
      id: "g_0001",
      name: "Run tests",
      startLine: 10,                    // 1-based line numbers
      endLine: 412,
      lineCount: 403,
      status: "ok" | "fail" | "warning" | "skipped"
    }
  ],
  errors: [
    {
      id: "e_0001",
      lineNum: 412,
      severity: "error" | "warning",
      text: "TypeError: cannot read property 'id' of undefined",
      groupId: "g_0001"
    }
  ],
  failingTests: [
    {
      id: "ft_0001",
      name: "auth › verifySession returns null on empty token",
      file: "tests/auth.test.ts",
      line: 42,
      message: "expected null, got undefined",
      lineNum: 412                      // anchor in raw log
    }
  ],
  totals: {
    lines: 12480,
    groups: 9,
    errors: 4,
    warnings: 17,
    failingTests: 2
  },
  rawLines: [
    { num: 1, text: "...", groupId: "g_0001" }   // every line, in order
  ],
  meta: { sourceFile, sizeBytes, format: "ci-log" }
}
```

`rawLines` is the full log line-by-line; the drill-down should render
it in a virtualized list when the line count is large (> 5000) so the
page stays fast. `errors` and `failingTests` are pre-extracted so the
client doesn't have to re-scan the log.

## Tone

On-call-grade. Direct about what failed, hedged about *why*. Use
sentences in the headline / hypothesis cards; metrics in the
phase strip and totals row. The "Copy summary" output should sound
like a paste-ready incident note ("Run failed in `Run tests` at line
412. Hypothesis: `verifySession` returns undefined for empty tokens
post-refactor; tests/auth.test.ts:42 asserts null. Re-run to confirm
not flaky."), not a list of metrics.
