# AI chat export (shared)

This prompt is shared by every "everyday AI chat history" source in
the pack: **ChatGPT** (`conversations.json`), **Claude** chat /
project export-style JSON, the **generic** `{ conversations: [...] }`
shape, and plain **markdown / text** "User: / Assistant:" logs.

The output is **not a chat viewer**. It's a one-page **personal AI
work-memory atlas** that makes the user say *"oh, this is what I've
been using AI for"* — what topics they keep coming back to, which
conversations contain real decisions / code / prompts they could
reuse, what's still unanswered, and how their AI work has evolved
over time — with the raw conversation log as drill-down.

## Required sections (must always render — non-negotiable)

These six sections form the AI-chat-export contract. The page **must**
include all of them, with literal section labels visible somewhere
in the rendered DOM. This is a hard constraint — even on a small
sample, render every section (with empty-state copy if the data
genuinely doesn't support it).

1. **Overview cards** (top of page) — at minimum:
   - conversation count, total messages, active date range,
     active days as a fraction of the date range
   - a one-sentence read on the user's AI usage shape
     ("you used AI mostly for code in 2026-Q1 — 68% of your
     longest threads include code blocks")
   - the **kind** breakdown (`DATA.kindBreakdown`): code / writing
     / planning / research / chat / other, as a small bar or
     chip cloud
   - the **model** breakdown if the source carries model info
     (`DATA.modelBreakdown`)
2. **Activity timeline** — render `DATA.weeklyHistogram` (or
   `DATA.monthlyHistogram` if the dataset spans many months) as a
   bar chart or sparkline. Highlight bursts ("April 2026 carried
   38% of all your conversations — what was happening?") and
   quiet weeks. Visible heading "Timeline" or equivalent.
3. **Topic clusters** — drive from `DATA.topicClusters` (already
   computed as keyword roll-ups). 4–10 clusters as a chip cloud
   or small bar chart. Each chip / bar should let the user
   filter the conversation index to that cluster. Visible
   "Topics" heading. **Label clusters as heuristic** — the
   parser used keyword roll-up, not real topic modeling.
4. **Reusable prompts & important answers** — two side-by-side
   panels (or stacked on mobile):
   - **Reusable prompts** — `DATA.reusablePrompts` (user prompts
     that share keywords with prompts from other conversations,
     i.e. things the user has asked variations of). Each card
     shows the prompt text, the conversation it came from, and
     a "copy prompt" button. Empty-state line if there are
     fewer than 3 candidates.
   - **Important answers** — `DATA.importantAnswers` (the
     longest single assistant reply per conversation). Each
     card shows the conversation title, a 360-char preview,
     and a "jump to conversation" link. These are the chunks
     of advice / code / writing the user might want to revisit.
   Both panels must include a visible **"Heuristic"** chip and
   the literal label "(heuristic — review before reusing)"
   somewhere in the panel. We're not certifying these prompts
   or answers as good, just surfacing what *looks* reusable.
5. **Unresolved threads** — `DATA.unresolvedThreads`. Conversations
   where the last turn was a user message (no assistant reply
   on record) or where the assistant ended with an unusually
   short reply to a question. Show title, last user text
   preview, age in days. Empty-state copy is fine if there are
   none. Visible "Unresolved" or "Open threads" heading.
   **Label as heuristic** — these are surface-pattern hypotheses.
6. **Conversation index + drill-down** — the searchable, filterable
   list of every conversation, defaulting to "expanded enough
   to scan" but with the **full message log collapsed** behind
   a per-conversation "Show all N messages" toggle. Index rows
   show title, date, message count, kind chip, model chip(s),
   user-prompt preview, assistant-reply preview, and a code-
   block flag where applicable. Topic / kind / model chips at
   the top filter the list. Full-text search across titles +
   messages.

   When expanded, each conversation renders as a bubble timeline
   grouped by day, role-tinted (user vs assistant vs system /
   tool), with code blocks highlighted (monospace + subtle
   background, no syntax-highlighting library required). A
   "copy conversation as Markdown" button per conversation.

Render these six regardless of dataset size. They are the headline
shape of this pack — without them, the output is incomplete.

## What else to surface (pick what fits the shape)

- **Activity rhythm** — `DATA.hourCounts` (24) and `DATA.dowCounts`
  (7) as a tiny heatmap or two horizontal bar charts showing when
  the user typically uses AI. ("You ask Claude things mostly on
  Tuesday and Wednesday afternoons.")
- **Longest conversations** — `DATA.longestConversations`. Cards
  showing the deepest threads — usually the most-substantive work.
- **Code-heavy / writing-heavy / planning-heavy split chart** —
  if `kindBreakdown` is meaningful, a pie / donut / stacked-bar
  reinforcing the overview narrative.
- **Project / topic deep-dive** — if topic clusters are dense,
  one cluster's expanded card showing every conversation in that
  cluster as a mini-list.
- **Models compared** — if multiple models appear in the export,
  a small "what you asked which model" panel: model → top topics,
  message count per model.

Don't try to do all of these. Pick 2–4 beyond the required six,
based on what the data supports.

## Always include

- Light + dark mode (`prefers-color-scheme`).
- Mobile-first responsive — the index should scroll, the timeline
  should compress to a sparkline on narrow viewports.
- Charts render inline SVG (no Chart.js, no CDNs) for under
  ~1500 data points. Use Canvas if the message log goes longer.
- "Copy as Markdown" button on the analysis section AND per
  conversation.
- Full-text search across titles + message bodies. Highlight
  matches in place.
- Filter chips for **topic** (from `topicClusters`), **kind**
  (from `kindBreakdown`), and **model** (from `modelBreakdown`)
  — clicking a chip narrows the conversation index without
  changing the analysis cards.

## Hard rules

- **Privacy-first, offline-only.** The page **must not** make any
  network calls back to OpenAI, Anthropic, or any other service
  at render or click time. Don't load avatars from chat.openai.com,
  don't fetch model cards, don't unfurl URLs in the message
  bodies. The only allowed external resource is the Google Fonts
  import in `prompts/styles/_design.md`.
- **Synthetic data only in committed examples.** Real ChatGPT /
  Claude exports often contain personal context, customer data,
  credentials, prompts that reveal proprietary information. Never
  commit a real export. The examples shipped in this repo are
  fully synthetic; do not replace them with real data.
- **Heuristic flags are hypotheses, not verdicts.** Reusable
  prompts, important answers, unresolved threads, kind labels,
  topic clusters — every one of these is a surface-pattern
  guess. Each card must visibly carry a "Heuristic" chip or
  equivalent caveat. The user is the authority on whether a
  prompt is actually reusable or whether the conversation is
  actually unresolved.
- **No advice-giving framing.** This is an organizational
  summary of the user's own AI history — not coaching ("you
  should ask better prompts"), not productivity scoring ("your
  AI usage is below average"), not behavior nudges. Keep the
  tone analytical and respectful: it's their own data, surfaced
  back to them.

## Data shape

```ts
DATA = {
  kind: "ai-chat-export",
  format: "chatgpt-export" | "claude-chat-export" | "generic-conversations-json" | "ai-chat-log-md",
  platform: "ChatGPT export" | "Claude chat export" | "Generic AI chat export" | "AI chat log",
  conversations: [
    {
      id: "c_0001",
      title: "Tax classification logic for 1099 contractors",
      createdEpoch: 1744449200000,
      createdIso: "2026-04-12",
      updatedEpoch: 1744452800000,
      updatedIso: "2026-04-12",
      messageCount: 14,
      userCount: 7,
      assistantCount: 7,
      systemCount: 0,
      toolCount: 0,
      wordCount: 1840,
      assistantWordCount: 1500,
      userWordCount: 340,
      codeBlockCount: 4,
      hasCode: true,
      models: ["gpt-4o", "gpt-4-turbo"],
      topic: "Tax classification logic for 1099 contractors",
      kind: "code",
      firstUserPrompt: "...",
      firstAssistantReply: "...",
      lastUserText: "...",
      lastUserEpoch: 1744452500000,
      isUnresolved: false,
      messages: [
        { id: "m_0001", role: "user", text: "...", ts: "2026-04-12 09:14",
          tsEpoch: 1744449240000, model: undefined, wordCount: 22,
          charCount: 124, codeBlockCount: 0, hasCode: false }
      ]
    }
  ],
  weeklyHistogram: [{ weekOf: "2026-W15", count: 4 }],
  monthlyHistogram: [{ month: "2026-04", count: 12 }],
  hourCounts: number[24],
  dowCounts: number[7],
  topicClusters: [{ name: "tax", count: 3, conversationIds: [...] }],
  kindBreakdown: [{ kind: "code", count: 7 }],
  modelBreakdown: [{ model: "gpt-4o", count: 6, messageCount: 38 }],
  longestConversations: [{ id, title, messageCount, wordCount }],
  reusablePrompts: [{ id, conversationId, text, sharedKeywords, ts }],
  importantAnswers: [{ id, conversationId, preview, charCount, ts }],
  unresolvedThreads: [{ id, title, lastUserText, lastTs, gapDays, reason }],
  totals: { conversations, messages, userMessages, assistantMessages,
            codeBlocks, activeDays, withModel },
  activeRange: "2026-01-04 → 2026-04-30",
  topModels: ["gpt-4o", "claude-sonnet-4-6", "gpt-4-turbo"]
}
```

Use the pre-computed aggregates directly. Do **not** re-derive
timelines / topic clusters / unresolved threads on the client —
the parser already did the math, and re-derivation kills
performance on big histories (1000+ conversations).

## Tone

Analytical and a touch human, like reading a personal year-in-review
of your own thinking habits. Headline copy reads like an observation,
not a dashboard label. *"Most of your conversations from January
through March were about taxes — then in April everything switched
to React"* is a sentence; *"Top topic cluster: tax (Q1)"* is a
metric. Use sentences in the cards, metrics in the charts.

## Privacy footer (include in the page footer)

Add a small footer line:

> *Generated locally — your AI chat export never left your machine.
> The full conversation log is embedded in this HTML and rendered in
> your browser. For sharing, prefer an anonymized export.*
