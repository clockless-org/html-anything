# whatsapp — relationship-chat report

A WhatsApp `_chat.txt` export. For 1:1 chats and close small-group
chats, use the same **detailed relationship-analysis report** as the
WeChat / 微信 source: playful, data-dense, mock-academic, and much richer
than a chat viewer.

The output should feel like "I analyzed our whole chat history": a
scrollable HTML data essay with calendar heatmaps, hourly rhythm,
relative enthusiasm, signature words, high-frequency word contribution,
rough sentiment, and love-keyword extraction. Do not include a raw
message appendix by default.

## Export instructions (surface to the user before converting)

If the user said "convert my WhatsApp chat" without giving you a file:

**On iPhone**:
1. Open WhatsApp → tap the chat name at the top → scroll down → **Export Chat**.
2. Choose **Without Media** unless they specifically want photos / voice
   included; text-only is better for analysis and much smaller.
3. Save to Files / AirDrop / Mail. Unzip the export and provide the
   `_chat.txt` path.

**On Android**:
1. Open WhatsApp → open the chat → ⋮ menu → **More** → **Export chat**.
2. Choose **Without Media**.
3. Save the `.zip`, unzip it, and provide `_chat.txt`.

For public sharing, remind the user to anonymize names and remove
private content. Prefer aggregate metrics over raw message text in the
shareable report.

## Required report sections

Render these sections with visible headings. Use the precomputed DATA
arrays where available; do not re-walk the full message log for heavy
aggregations.

1. **Abstract** — a short mock-academic abstract in the user's language.
   Include date range, total messages, active-day ratio, participants,
   and the dimensions studied: frequency, time distribution, relative
   enthusiasm, words, and sentiment.
2. **Daily Chat Popularity Distribution** — a calendar heatmap from
   `DATA.calendarHeatmap`, grouped by year/month. This is the "does the
   relationship keep lighting up?" view. Use horizontal scroll on mobile.
3. **Daily Chat Time Periods** — 24-hour bar chart from
   `DATA.hourlyDistribution`. Surface late-night / early-morning
   patterns with playful callouts only when supported by data.
4. **Monthly Relative Enthusiasm Index** — a two-column or per-sender
   bubble chart from `DATA.monthlyStats[].senders[].enthusiasmIndex`.
   Use the formula `E = (sent - received) / (sent + received)`. Explain
   that positive means "sent more than received this month", not "loves
   more".
5. **Word Specificity Statistics** — per-person top special words from
   `DATA.wordSpecificity`: each person's口头禅 / signature vocabulary.
6. **High-frequency Chat Words and Contribution Rating Distribution** —
   mirrored bar chart from `DATA.contributionWords`, showing who uses
   each shared high-frequency word more. Contribution formula:
   `C = own_word_count / total_word_count`.
7. **Lexical Sentiment Trend** — from `DATA.sentimentTimeline`. Label it
   rough and lexicon-based; do not diagnose the relationship.
8. **Love-related Keyword Extraction** — `DATA.relationshipKeywords`.
   Keep the panel visual and playful, but do not render raw message text.

## Optional sections (choose what fits)

- **Relationship KPI cards** — total messages, active days, busiest day,
  longest quiet gap, median reply time by sender, who re-starts after
  4+ hour gaps (`DATA.initiationsBySender`).
- **Love keyword panel** — `DATA.relationshipKeywords`: love, miss you,
  good night, babe, hugs, etc. Translate labels to match the chat
  language.
- **Emoji signature** — per-sender emoji leaderboard from
  `DATA.emojiStats`.
- **Milestone timeline** — infer 5-8 relationship chapters from the
  sample and date range. Make inference visibly tentative.

## Visual direction

- Treat the page like a polished data essay, not an admin dashboard.
- A good structure is: title + abstract, Part 1 frequency, Part 2 words,
  Part 3 sentiment and relationship keywords.
- Use large, dense visualizations. This source is allowed to be richer
  and more editorial than the generic chat pack.
- Prefer two participant colors, often warm pink/red versus blue, while
  still applying the Clockless design tokens from `prompts/styles/_design.md`.
- Use inline SVG or Canvas. No Chart.js, no ECharts, no CDN.
- Do not include a raw-message appendix by default. For shareable
  relationship reports, aggregate metrics are safer and visually cleaner
  than a chat-log browser.
- Include light + dark mode and mobile layout. Calendar and mirrored bar
  charts may scroll horizontally on small screens.

## Interpretation rules

- "Relative enthusiasm" means message-volume imbalance, not affection.
- "Sentiment" is a lexical signal from the text, not psychological
  assessment.
- Word specificity can reveal style, jokes, and habits; do not shame
  either person.
- Make playful callouts only when supported by data.

## Data shape

```ts
DATA = {
  messages?: [
    {
      id: "m_000001",
      ts: "2026-01-04 09:12:07",
      date: "2026-01-04",
      time: "09:12:07",
      tsEpoch: 1767537127000,
      sender: "Alex Chen",
      text: "...",
      isMedia?: false
    }
  ],
  senders: [{ sender, count, firstTs, lastTs }],
  messagesPerSender: { "Alex Chen": 42 },
  heatmap: [{ dow: 0..6, hour: 0..23, count }],
  volumeByDay: [{ date, count }],
  calendarHeatmap: [{ date, count, month, year, dow }],
  hourlyDistribution: [{ hour, count, bySender }],
  monthlyStats: [{ month, total, activeDays, bySender, senders, sentiment }],
  topWords: [{ word, count }],
  wordSpecificity: { "Alex Chen": [{ word, count, specificity, share }] },
  contributionWords: [{ word, count, bySender, shares, dominantSender, contributionRating }],
  emojiStats: { "Alex Chen": [{ emoji, count }] },
  sentimentTimeline: [{ month, positive, negative, score, normalizedScore }],
  relationshipKeywords: [{ word, count }],
  replyStatsBySender: { "Alex Chen": { medianMinutes, averageMinutes, p80Minutes } },
  initiationsBySender: { "Alex Chen": 42 },
  activeDayRatio,
  busiestDay,
  longestGapHours,
  platform: "whatsapp"
}
```

## Privacy footer

Include a small footer:

> Generated locally from your WhatsApp export. Treat source chats as
> private; this shareable report should use aggregate metrics and
> anonymized names unless the user explicitly asks otherwise.
