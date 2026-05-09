# transcript — meeting transcripts (`.vtt`, `.srt`, Zoom / Teams text)

A timecoded conversation: Zoom, Teams, Meet, YouTube auto-captions, or
any speaker-labeled transcript. The output is **not a subtitle viewer**
— it's a meeting scorecard that surfaces *what was decided, who owns
what, and what is still hanging*, with the timestamped transcript as
the drill-down.

The right output makes the user say *"oh, here's what actually came out
of this meeting"* — decisions made, action items with owners, open
questions, risks raised, and a sense of who drove the conversation.

## What to surface (the headline of the page)

Look at the sample (cue count, speaker stats with talk-time, first/last
cues, longest turns, plus the per-cue text) and **infer + visualize**:

### Meeting card (top)

- **Duration + cadence** — total runtime, number of cues, average cue
  length. Format like "47-minute call · 312 turns · 1.3 turns/sec
  cadence" — the cadence sentence tells you "fast back-and-forth" vs
  "long monologues".
- **Speakers** — list with talk-time bars. Each speaker shows their
  share of talk-time, cue count, and word count. Highlight the speaker
  with the biggest share and the quietest speaker present (someone who
  appears but said very little).
- **Headline summary** — a 2–3 sentence editorial recap of what the
  meeting was about and where it landed. The LLM writes this from the
  sample. Not a transcript, an *abstract*.

### Meeting scorecard (the insight layer)

Pull the following out of the cue text. Each item links back to the
exact cue (jump to that timestamp on click):

- **Decisions made** — turns where a direction was set or agreed to
  ("let's go with X", "we'll ship without Y this sprint", "approved",
  "ok, I'm in"). Render as numbered cards with the decision sentence,
  who said it, and the timestamp chip.
- **Action items** — commitments by a specific speaker, ideally with a
  due date when one is mentioned. Detect from "I'll …", "I'm going to
  …", "let me …", "I can take that", plus an owner = the speaker.
  Render as a sortable, filterable table: owner | what | due | from
  cue. If a date isn't mentioned, leave due blank — never invent one.
- **Open questions / unanswered** — questions that don't have a clear
  answer in the cues that follow them. Surface as a callout near the
  top so reviewers see what is still hanging.
- **Risks / concerns** — turns where someone flagged a worry, a
  blocker, a competing option, or a "we should be careful about …".
  Render as a small panel with one-sentence summaries.
- **Follow-ups / next meeting** — explicit "let's revisit", "we'll
  pick this up next week", "I'll loop in legal" turns. Useful for the
  user to know what was punted.

### Visualizations (pick 3–5 that the data supports)

- **Speaker timeline** — horizontal lane per speaker, ticks where they
  spoke, colored by speaker. Shows interruption density and "who held
  the floor when". For 1-hour meetings, bin into 30s columns.
- **Talk-time donut** — share of words (or seconds) per speaker. One
  glance = "Casey did 60% of the talking".
- **Turn-taking sparkline** — small chart of cumulative talk-time per
  speaker over the meeting. Reveals "Mira was quiet until minute 32,
  then carried the last 10 minutes".
- **Topic markers** — pin 5–10 turning points the LLM picks from the
  sample (a decision, a reframe, a hard question, a punt). Each pin
  is one sentence anchored to a timestamp.
- **Talk-time imbalance call-out** — if one speaker is > 60% of words,
  surface that as a sentence ("Casey held ~62% of the floor"); the
  user usually wants to know.

Don't render all of these. Pick the 3–5 that fit *this* meeting's
shape — a 1:1 customer call doesn't need a turn-taking chart, a
12-person all-hands does.

### The transcript itself

Below the analysis, include the **full transcript** as a drill-down:

- **Speaker filter chips** — toggle which speakers' lines are visible.
- **Search** — case-insensitive, highlights matches across all cues.
- **Timestamp chips** — each cue shows a clickable `[12:04]` chip; the
  surrounding context expands when clicked. Default to a clean
  scrollable list grouped lightly by speaker change.
- **Jump nav** — quarter-marks (0%, 25%, 50%, 75%, 100%) or section
  markers if the meeting is long enough. For under-30-minute meetings,
  a simple scroll is enough.
- **Copy turn** — small button on each turn so users can lift a
  specific quote out.

Default to the analysis up top and the transcript as drill-down — the
analysis is the headline, not the captions.

## Required sections (must always render — non-negotiable)

These six sections are part of the transcript pack contract. The page
**must** include all of them, with the literal section labels listed
below visible somewhere in the rendered DOM. This is a hard constraint;
do not skip any of them even on a short meeting.

1. **Speakers** — visible heading and at minimum a per-speaker
   talk-time bar or share metric (cue count, word count, or share
   percentage). Heading "Speakers" or equivalent visible label.
2. **Decisions** — labeled "Decisions" panel listing every decision
   detected. If none, render an empty-state line ("No clear decisions
   recorded — this looked like an exploratory call.") rather than
   omitting the section.
3. **Action items** — labeled "Action items" panel/table grouped or
   filterable by owner. Empty state ("No action items captured.") if
   none.
4. **Open questions** — labeled "Open questions" callout for questions
   without an obvious answer in the cues that follow. Empty state
   ("Every question raised got an answer.") if none.
5. **Timeline** — a labeled "Timeline" or "Speaker timeline" section
   with a chronological visualization of speaker activity.
6. **Transcript** — labeled "Transcript" drill-down with timestamp
   chips, speaker filter, and search. The literal label "Transcript"
   must be visible.

Render these six regardless of meeting size. They are the headline
shape of the pack — without them, the output is incomplete.

## Always include

- Light + dark mode (`prefers-color-scheme`).
- Mobile-first responsive — meeting card stacks, talk-time bars
  collapse to a single column, transcript becomes scrollable.
- Charts render with inline SVG (no Chart.js, no CDNs) for under
  ~1000 data points. Use Canvas for bigger datasets.
- Keep the page under 500 KB inlined where possible — the cue text is
  the big driver, so avoid duplicating it between the analysis and the
  transcript drill-down. Render the transcript from `DATA.cues` only.
- "Copy as Markdown" of the analysis section (so users can paste
  decisions/actions into notes).
- A **note in the footer** that captions can mis-attribute speakers
  and the analysis is best-effort: "Auto-generated transcripts
  occasionally swap speakers or miss words. Treat the scorecard as a
  starting draft."

## Data shape

```ts
DATA = {
  cues: [
    {
      id: "c_0001",
      startMs: 0,
      endMs: 3500,
      durationMs: 3500,
      startLabel: "00:00",         // pretty mm:ss or h:mm:ss
      speaker: "Sam Reyes",        // null if unattributed
      text: "Hey everyone, thanks for joining — I'll keep this tight."
    }
  ],
  speakers: [
    {
      name: "Sam Reyes",
      cueCount: 42,
      wordCount: 1820,
      talkSeconds: 612,
      sharePct: 38.4              // share of total spoken seconds
    }
  ],
  durationMs: 1620000,
  durationLabel: "27m",            // pretty label
  cueCount: 87,
  speakerCount: 4,
  format: "vtt" | "srt" | "transcript-txt",
  meta: { sourceFile, sizeBytes, ... }
}
```

The full `cues` array drives the transcript drill-down; `speakers` is
pre-aggregated. The LLM picks which decisions / actions / questions /
risks to surface from the cue text + speaker stats — the parser does
not try to classify them. Be conservative: only mark something a
decision if the language is clear ("let's", "we'll", "I'm in",
"approved"); only mark something an action item if a specific person
takes it on with first-person ("I'll", "let me", "I can"). When
uncertain, drop it rather than over-claim.

## Tone

Analytical and decision-oriented. Headline copy reads like a senior
operator's recap, not a captions viewer. "Three decisions came out of
this call, and one open question is still waiting on legal review" is
a sentence; "Decisions: 3, Open questions: 1" is a metric. Use
sentences in the cards, metrics in the charts.

## Privacy note (include in the page footer)

Add a small footer line:

> *Generated locally — your transcript never left your machine. The
> full timecoded conversation is embedded in this HTML and rendered
> in your browser. For sharing, prefer an anonymized export.*
