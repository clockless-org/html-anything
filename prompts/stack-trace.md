# stack-trace — production / runtime stack traces

A captured stack trace from a runtime failure: a Python traceback,
a JavaScript / Node error stack, a Java exception with `Caused by:`
chain, a Go panic + goroutine dump, a Ruby backtrace, a Rust panic,
a .NET exception. Often pasted from a logger, an error tracker
(Sentry / Bugsnag / Rollbar), or a terminal.

The output is **not a stack-trace pretty-printer** — it's a
**triage card** that makes the user say *"oh, here's what to look
at first"*: the exception, the most-likely-app frame, and a hedged
read on what may have caused it, with the full trace as drill-down.

## What to surface (the headline of the page)

Look at the sample (language hint, exception type / message, frame
list with file paths + line numbers, cause chain, frame-author
guesses) and **infer + visualize**:

### Trace card (top)

- **Exception** — type + message in big text
  (`TypeError: cannot read property 'id' of undefined`).
- **Language** — Python / JavaScript / Java / Go / Ruby / Rust / C# /
  unknown. Pulled from the trace shape.
- **Cause chain depth** — number of `Caused by:` levels (Java /
  .NET) or wrapped errors (Go's `fmt.Errorf("%w", …)` style). If
  there's a chain, the **deepest cause** is usually the real
  culprit; surface it explicitly.
- **App vs vendor frames** — count of frames the parser tagged as
  application code vs framework / stdlib / node_modules /
  site-packages. Sentence form: "Trace has 28 frames; 4 look like
  application code, the rest are framework internals."

### The likely app frame (the headline)

The single frame the parser flagged as **most likely the app's own
code** (not stdlib, not node_modules, not site-packages, not vendor).
Render it big at the top:

- file path with line + column (mono)
- function name
- a "Hypothesis" chip — this is *which frame to look at*, not the
  cause itself.
- a one-sentence read on why this frame is the suspect ("Topmost
  app frame in the chain — vendor frames sit above and below it.")

If multiple frames look equally app-shaped (e.g. several files in
`src/`), surface the **top 3** instead, ranked by depth in the
trace, each with the same chip + one-sentence note.

If no frame looks app-shaped (everything is `node:internal/...` or
`/usr/lib/python3.11/...`) say so plainly: "No app frames visible
— the trace likely terminates inside framework code; the cause may
be in a caller not captured in this trace."

### Cause / hypothesis cards

A panel of 1–3 candidate explanations for the failure, each labeled
as a hypothesis with a "Hypothesis" chip. Each:

- one-sentence summary
- the frame(s) it's based on (linkable into the raw drill-down)
- what would *distinguish* this hypothesis from others ("If
  reproducing locally with `userId = null` triggers the same
  error, this is the cause; if it doesn't, the input is shaped
  differently in production.")

Hedge appropriately. You are reading a stack trace, not the runtime;
say so. "The `userId` field on `session` may be undefined when
`verifySession` reads it" is right. "The `userId` is undefined" is
not.

### Frame folding (visualization)

A vertical list of all frames, with vendor / framework / stdlib
frames **collapsed by default** into a single grey "27 framework
frames" line that expands on click. App frames render expanded with
file / line / function / surrounding context (where the trace
provides it).

This is the single most useful affordance for a long Java / Python
trace — folding the noise so the 3 app frames don't get drowned in
50 framework frames.

### Cause chain (when present)

If the trace has a cause chain (Java `Caused by:`, .NET
`InnerException:`, Go `wraps:`, Python `During handling of the above
exception, another exception occurred:`), render it as a vertical
chain card. Each cause as its own block: type, message, top frame.
The deepest cause is highlighted as the **probable origin**.

### The trace itself

Below the analysis, include the **full raw trace** as a drill-down
(default collapsed):

- monospaced, line-numbered, with file paths colored by
  app-vs-vendor.
- Cmd-F-style search across the trace.
- "Copy trace" button at the top of the panel.

## Required sections (must always render — non-negotiable)

1. **Trace summary** — labeled "Trace" or "Trace summary" with
   exception + language + frame counts.
2. **Review checklist** — labeled panel of concrete next-step verify
   items ("Reproduce locally with the inputs from the request log",
   "grep the codebase for the function in the topmost app frame",
   …). 4–10 items.
3. **Risk hotspots** — labeled "Risk hotspots" listing the topmost
   app frame(s) with a one-sentence why-risky and a "Hypothesis"
   chip.
4. **Suspected cause(s)** — labeled "Suspected cause" with 1–3
   hypothesis cards, every card carrying a "Hypothesis" chip.
5. **Frames** — labeled "Frames" panel showing the full frame list
   with vendor frames folded by default and app frames expanded.
6. **Collapsible raw trace** — labeled "Trace" or "Raw trace"
   drill-down with the verbatim text + search + copy.
7. **Copy summary** — labeled "Copy summary" button putting a
   Markdown triage recap on the clipboard. Paste-ready into a
   ticket / Slack / Sentry comment.

## Data shape

```ts
DATA = {
  kind: "stack-trace",
  language: "javascript" | "python" | "java" | "ruby" | "go" | "rust" | "csharp" | "unknown",
  exception: {
    type: "TypeError",
    message: "cannot read property 'id' of undefined"
  },
  causes: [                              // includes the top exception as causes[0]
    {
      id: "cause_0001",
      type: "TypeError",
      message: "cannot read property 'id' of undefined",
      frames: [
        {
          id: "fr_0001",
          rawLine: "    at verifySession (src/auth/session.ts:42:18)",
          file: "src/auth/session.ts",
          line: 42,
          col: 18,
          function: "verifySession",
          isApp: true,                   // hypothesis-only flag
          isVendor: false                // node_modules / site-packages / stdlib
        }
      ]
    }
  ],
  frameCount: 28,
  appFrameCount: 4,
  vendorFrameCount: 24,
  rawText: "...the original verbatim trace...",
  meta: { sourceFile, sizeBytes, format: "stack-trace" }
}
```

`isApp` / `isVendor` are heuristics only — every UI affordance that
relies on them must show a "Hypothesis" chip. The parser uses path
hints (`node_modules/`, `site-packages/`, `vendor/`, `/usr/lib/`,
`go/pkg/mod/`, `internal/`, `<frozen `) to guess; it does not
introspect the codebase.

## Tone

Triage-grade. Specific about what frame is which, hedged about why
the failure happened. Refer to file / line in `var(--font-mono)`
inline. The "Copy summary" output should be paste-ready into a
ticket: exception, app frames, top hypothesis, and the suggested
next verification step.
