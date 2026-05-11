# wechat — 微信 / WeChat relationship-chat report

WeChat exports are usually intimate, long-running, two-person records.
The output is **not a chat viewer**. It should feel like a playful,
paper-style relationship analysis page: part academic poster, part
year-end recap, part "I analyzed our whole chat history" long image.

Reference vibe: a clean thesis/report layout with big visual sections:
calendar heatmap, hourly distribution, monthly relative enthusiasm,
word specificity, high-frequency word contribution, sentiment timeline,
and love-keyword extraction. The page can be funny and warm, but every
conclusion must be framed as an observation from the export, not a
verdict about whether someone "really loves" someone.

## Export instructions (surface to the user before converting)

If the user says "my WeChat chat", "微信聊天记录", "留痕", or "WeChatMsg"
without giving a file:

1. Use a local export tool such as **WeChatMsg / 留痕** on the machine
   where WeChat desktop has the chat history available.
2. Export the target conversation as **HTML** when possible. CSV / TXT /
   DOCX / JSON are also supported, but HTML usually preserves the most
   context.
3. For a large multi-year chat, export text first. Media-heavy exports
   can be huge; the analysis mainly needs timestamps, sender, and text.
4. Ask the user for the exported `.html`, `.csv`, `.txt`, `.docx`, or
   `.json` path.

Always remind the user to use their own data, get consent before sharing
the output, and anonymize names before posting publicly.

## Required report sections

Render these sections with visible headings. Use the precomputed DATA
arrays where available; do not re-walk the full message log for heavy
aggregations.

1. **Abstract** — a short mock-academic abstract in Chinese or the
   user's language. Include date range, total messages, active-day
   ratio, participants, and what the page studies: frequency, time
   distribution, enthusiasm, words, and sentiment.
2. **Daily Chat Popularity Distribution** — a calendar heatmap from
   `DATA.calendarHeatmap`, grouped by year/month. This is the "爱会不会
   消失" chart. Keep it readable on mobile with horizontal scrolling.
3. **Daily Chat Time Periods** — 24-hour bar chart from
   `DATA.hourlyDistribution`. Surface late-night / early-morning
   patterns with a playful callout if the data supports it.
4. **Monthly Relative Enthusiasm Index** — a two-column or per-sender
   bubble chart from `DATA.monthlyStats[].senders[].enthusiasmIndex`.
   Use the formula:
   `E = (sent - received) / (sent + received)`.
   Explain that positive means "sent more than received this month",
   not "loves more".
5. **Word Specificity Statistics** — per-person top special words from
   `DATA.wordSpecificity`. These are each person's口头禅 / signature
   vocabulary. Use horizontal bars and color by person.
6. **High-frequency Chat Words and Contribution Rating Distribution** —
   mirrored bar chart from `DATA.contributionWords`, showing who uses
   each shared high-frequency word more. Show the contribution formula:
   `C = own_word_count / total_word_count`.
7. **Lexical Sentiment Trend** — from `DATA.sentimentTimeline`. Label it
   as lexicon-based and rough. Do not diagnose the relationship.
8. **Love-related Keyword Extraction** — `DATA.relationshipKeywords`.
   Keep it tender and playful, but do not render raw message text.

## Optional sections (choose what fits)

- **Relationship KPI cards** — total messages, active days, busiest day,
  longest quiet gap, median reply time by sender, who re-starts after
  4+ hour gaps (`DATA.initiationsBySender`).
- **Emoji signature** — per-sender emoji leaderboard from
  `DATA.emojiStats`.
- **Milestone timeline** — infer 5-8 relationship chapters from the
  sample and date range. Make the inference visibly tentative.
- **Poster / long-image mode** — if the user wants social sharing, make
  a top "Export as long image" friendly layout in the HTML, but do not
  require any server or external library.

## Visual direction

- Treat the page like a polished data essay, not an admin dashboard.
- A good structure is: title + abstract, Part 1 frequency, Part 2 words,
  Part 3 sentiment and relationship keywords.
- Use large, dense visualizations. This source is allowed to be richer
  and more editorial than the generic chat pack.
- Prefer pink/red and blue as the two participant colors, but keep the
  Clockless design tokens from `prompts/styles/_design.md`. Do not make the whole page
  a single pink palette.
- Use inline SVG or Canvas. No Chart.js, no ECharts, no CDN.
- Do not include a raw-message appendix by default. For shareable
  relationship reports, aggregate metrics are safer and visually cleaner
  than a chat-log browser.
- Include light + dark mode and mobile layout. Calendar and mirrored
  bar charts may scroll horizontally on small screens.

## Interpretation rules

- "Relative enthusiasm" means message-volume imbalance, not affection.
- "Sentiment" is a lexicon signal from the text, not psychological
  assessment.
- Word specificity can reveal style, jokes, and habits; do not shame
  either person.
- If names are real, include an anonymization reminder.
- Make playful callouts only when supported by data. Avoid invented
  claims such as "you stopped loving them" unless the user explicitly
  asks for roast-style copy; even then, label it as a joke.

## Data shape

```ts
DATA = {
  messages?: [
    {
      id: "m_000001",
      ts: "2023-12-16 23:58:00",
      date: "2023-12-16",
      time: "23:58:00",
      tsEpoch: 1702780680000,
      sender: "Yan",
      text: "晚安宝宝",
      isFromMe?: true,
      isMedia?: false,
      type?: "text"
    }
  ],
  senders: [{ sender, count, firstTs, lastTs }],
  messagesPerSender: { "Yan": 1234, "Chen": 1200 },
  heatmap: [{ dow: 0..6, hour: 0..23, count }],
  volumeByDay: [{ date, count }],
  calendarHeatmap: [{ date, count, month, year, dow }],
  hourlyDistribution: [{ hour, count, bySender: { "Yan": 12 } }],
  monthlyStats: [
    {
      month: "2023-12",
      total: 900,
      activeDays: 28,
      bySender: { "Yan": 410, "Chen": 490 },
      senders: [{ sender, sent, received, share, enthusiasmIndex }],
      sentiment: { positive, negative, score }
    }
  ],
  topWords: [{ word, count }],
  wordSpecificity: {
    "Yan": [{ word, count, specificity, share }],
    "Chen": [{ word, count, specificity, share }]
  },
  contributionWords: [
    { word, count, bySender, shares, dominantSender, contributionRating }
  ],
  emojiStats: { "Yan": [{ emoji, count }] },
  sentimentTimeline: [{ month, positive, negative, score, normalizedScore }],
  relationshipKeywords: [{ word, count }],
  replyStatsBySender: { "Yan": { medianMinutes, averageMinutes, p80Minutes } },
  initiationsBySender: { "Yan": 42, "Chen": 39 },
  activeDayRatio,
  busiestDay,
  longestGapHours,
  sourceFormat: "html" | "csv" | "txt" | "json" | "docx"
}
```

## Privacy footer

Include a small footer:

> Generated locally from your WeChat export. Treat source chats as
> private; this shareable report should use aggregate metrics and
> anonymized names unless the user explicitly asks otherwise.
