# email — `.eml` and `.mbox` archives

An email archive (a single `.eml` message, an `.mbox` mailbox, or a Gmail
Takeout-style mailbox export). The output is **not Outlook** — it's an
infographic about the conversations themselves, with the threads as a
drill-down.

The right output makes the user say *"oh, here's what's actually
happening in my inbox"* — who I really talk to, who I've left hanging,
what threads are still open, where my attention was last quarter.

## What to surface (the headline of the page)

Look at the sample (counts + senders/domains + sample messages + thread
shape) and **infer + visualize**:

### Mailbox card (top)

- **Period covered** — date range with total days, plus what fraction of
  those days had any traffic. "March 2025 → Feb 2026 · 287/365 days
  active".
- **Volume** — total messages, total threads, average messages/thread,
  longest thread.
- **Top correspondents** — top 5 senders by volume (name + domain +
  count), and top 5 domains. Format like "You spent most of your inbox
  attention on `acme.co` (124 messages across 38 threads)".
- **Response posture** — median time-to-reply when the user replies
  (treat the mailbox owner as the most-frequent recipient if not
  obvious from headers). Surface "you reply within 4h to 70% of mail
  from people, 2 days from automated senders" style sentences.

### Visualizations (pick 3–5 that the data supports)

- **Thread timeline** — a vertical or horizontal timeline of the largest
  threads, each rendered as a colored bar showing how long it ran and
  how many messages each side sent.
- **Volume over time** — area chart of messages per day or per week.
  Highlights crunch periods.
- **Sender / domain leaderboard** — stacked bar or sorted list with
  in/out split per correspondent.
- **Activity heatmap** — day-of-week × hour-of-day cells, intensity by
  message count. Reveals "Sunday-night sender" or "9-to-5 only"
  patterns.
- **Response latency distribution** — histogram of "minutes between
  inbound and the user's next reply" (skip when there's no obvious
  owner, e.g. a single .eml file).
- **Attachment inventory** — list/grid of attachments grouped by
  filetype, with thread/date for each. Even though attachment bytes are
  not embedded, surface the metadata — users want to know *what got
  shared*.
- **Open loops** — a callout panel of threads where the *last* message
  ends in a question or an explicit ask ("could you", "let me know",
  "any update", "?", etc.) and has no reply within the data. Show the
  last sender, the question text, and how long it has been waiting.
- **Decision points / commitments** — pin the 5–10 turns from the
  sample where someone agreed to a deadline, a budget, a meeting, a
  scope change. Each pin is one sentence.

Don't try to do all of these. Pick 3–5 that the LLM can populate from
the sample + thread metadata, and that fit the mailbox's shape (a
single support thread looks different than a year of mixed mail).

### The threads themselves

Below the analysis, include a **thread-grouped browser** with:

- **Sender filter chips** (and domain filter for larger archives).
- **Search** across subjects + body text.
- **Thread list** sorted by last activity, each row showing
  participants, subject, message count, and a one-line preview.
- **Open thread view**: messages in chronological order, sender + date
  on each, body (plain text — pre-wrapped, monospace OK if it
  preserves shape), attachments listed inline as small chips, and the
  thread's "open loop" status.
- **Date jump** for archives with > 6 months of data.

Default to the analysis up top and the threads as drill-down — the
analysis is the headline, not the inbox.

## Required sections (must always render — non-negotiable)

These five sections are part of the email pack contract. The page
**must** include all of them, with the literal section labels listed
below visible somewhere in the rendered DOM. This is a hard constraint;
do not skip any of them even on a tiny mailbox.

1. **Search** — input that filters messages and threads by subject
   and body text. Visible label/placeholder containing "Search".
2. **Sender filter** — interactive chips, buttons, or a list that
   lets the user constrain visible threads to one or more senders
   (and/or domains). Heading "Sender filter" or equivalent visible
   label.
3. **Thread grouping** — threads as the primary unit, with a list or
   sidebar the user can scan; messages inside a thread render in
   chronological order. Visible "Threads" heading.
4. **Timeline** — a labeled "Timeline" section showing a chronological
   view of activity (inline SVG sparkline / per-thread bar / vertical
   date axis are all fine). The label "Timeline" must be visible.
5. **Open loops** — a labeled "Open loops" callout near the top (panel
   or banner) listing every thread whose last message ends in a
   question or explicit ask. Drive it from `thread.lastEndsInQuestion`
   plus the `openLoops` array in the sample. If there are zero open
   loops, render the callout with an empty-state line ("No open loops
   — everyone has replied.") rather than omitting the section. The
   literal label "Open loops" must be visible.

Render these five regardless of mailbox size. They are the headline
shape of the pack — without them, the output is incomplete.

## Always include

- Light + dark mode (`prefers-color-scheme`).
- Mobile-first responsive — analysis cards stack, thread list collapses
  to a single-column view, full thread view becomes scrollable.
- Charts render with inline SVG (no Chart.js, no CDNs) for under
  ~1000 data points. Use Canvas for bigger datasets.
- Keep the page under 500 KB inlined where possible — body text is the
  big driver, so prefer a single text/plain part per message rather
  than duplicating HTML alternatives.
- "Copy as Markdown" of the analysis section.
- A **privacy banner** in the footer: emails often contain real names
  and addresses; remind the user the file is local.

## Data shape

```ts
DATA = {
  messages: [
    {
      id: "m_0001",
      ts: "2026-01-04 09:12:00",        // sortable string
      date: "2026-01-04",
      time: "09:12:00",
      tsEpoch: 1767517920000,           // ms since epoch, for math
      messageId: "<abc@example.com>",
      inReplyTo: "<xyz@example.com>",   // or null
      references: ["<xyz@example.com>"],
      threadId: "t_0001",               // grouping key
      from: { name: "Alex Chen", email: "alex@acme.co" },
      to:   [{ name: "...", email: "..." }],
      cc:   [{ name: "...", email: "..." }],
      subject: "Re: Pilot kickoff next steps",
      subjectKey: "pilot kickoff next steps",   // normalized
      body: "...plain text body...",
      bodyPreview: "first 240 chars…",
      attachments: [
        { filename: "proposal.pdf", contentType: "application/pdf", sizeEstimate: 81920 }
      ],
      isReply: true,
      isForward: false,
      hasQuestion: true                 // body ends in "?" or contains an explicit ask
    }
  ],
  threads: [
    {
      id: "t_0001",
      subject: "Pilot kickoff next steps",
      participants: ["Alex Chen <alex@acme.co>", "Mira Park <mira@clockless.ai>"],
      messageIds: ["m_0001", "m_0002", ...],
      firstTs: "2026-01-04 09:12:00",
      lastTs: "2026-01-09 17:30:00",
      messageCount: 6,
      lastSender: "Alex Chen <alex@acme.co>",
      lastEndsInQuestion: true          // candidate "open loop"
    }
  ],
  senders: [{ email, name, count, domain }],
  domains: [{ domain, count }],
  attachments: [{ filename, contentType, sizeEstimate, threadId, ts, fromEmail }],
  dateRange: "2026-01-04 → 2026-02-02",
  messageCount: 42,
  threadCount: 7,
  attachmentCount: 5,
  meta: { sourceFile, sizeBytes, format: "eml" | "mbox", ... }
}
```

The full `messages` array drives the thread browser; `threads` is the
pre-computed grouping; `senders`/`domains` feed the leaderboard. The
LLM picks which of these to surface — the parser provides the raw
shape.

## Tone

Analytical + a little human. Headline copy should sound like an
observation, not a dashboard label. "You haven't replied to Casey since
Jan 30 — that thread's been waiting 9 days" is a sentence; "Open loop
count: 3" is a metric. Use sentences in the cards, metrics in the
charts.

## Privacy note (include in the page footer)

Add a small footer line:

> *Generated locally — your mail data never left your machine. The full
> archive is embedded in this HTML and rendered in your browser. For
> sharing, prefer an anonymized export.*
