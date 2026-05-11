# Research / reading-list (shared)

This prompt is shared by every research / reference source: **browser
bookmarks HTML exports** (Chrome / Firefox / Safari / Pinboard /
Raindrop's `Bookmarks.html`), **bibliographies** (BibTeX `.bib` /
RIS `.ris` from Zotero, Mendeley, EndNote, Google Scholar), **plain
URL lists** (`.txt` or markdown with one URL per line — the "tab
dump", the "founder's open tabs"), and **reading-list exports**
(Pocket / Instapaper / Raindrop CSV / JSON). The parser already
normalized them into the same item shape — don't write different
rendering logic per format. Use `DATA.format` and the source-prompt
notes for chrome.

The output is **not a bookmarks browser, citation tool, or web
archive**. It's a research-shaped infographic that makes the user
say *"oh, here's the thing I've been collecting / where my
attention has been pointed / what I should actually re-read"* —
with the raw items as drill-down.

## Required sections (must always render — non-negotiable)

These five sections form the research contract. The page **must**
include all of them, with the literal section labels visible somewhere
in the rendered DOM. This is a hard constraint; do not skip any of
them even on a small file.

1. **Topic clusters / theme map** — visualize how the corpus splits
   along themes. Pull from `DATA.topics` (tag-driven, falling back to
   folder-driven, falling back to keyword-driven — the parser picks
   the best signal). For each cluster: name + count + a clickable
   chip that filters the drill-down. Render the cluster panel as a
   pill grid, a horizontal stacked bar, or a small force-of-mass
   bubble chart. The literal heading "Topics" / "Themes" / "Clusters"
   or equivalent must be visible.
2. **Domain / source leaderboard** — a labeled "Top sources" or
   "Where these come from" panel with the top 8–16 entries from
   `DATA.domains` (full hostname) or `DATA.rootDomains` (collapsed —
   often more readable). Each row: domain + count + sample title +
   a chip that filters the drill-down to that domain. For
   bibliographies, additionally surface `DATA.venueLeaderboard` for
   journals / conferences and `DATA.authorLeaderboard` for top
   authors — these are the real "where the work comes from" axes
   in academic input. The literal heading "Top sources" / "Domains"
   / "Venues" / "Where they come from" or equivalent must be
   visible.
3. **Stale / duplicate / dead-link callouts** — three labeled
   callout blocks.
   - **Duplicates**: card from `DATA.duplicateGroups`. Each row
     shows the canonical URL + the titles of the duplicates +
     count. If `DATA.duplicateGroups` is empty, render a friendly
     placeholder ("No duplicate URLs detected.").
   - **Stale**: card from `DATA.staleItems` (items older than the
     family's stale threshold of 180 days, or items in folders
     named "read-later" / "to-read" / "archive" / "inbox"). Show
     title + age + folder + URL.
   - **Dead links**: card from `DATA.deadLinks` (items on hosts
     that have shut down — Geocities, Google Reader, Google+,
     Friendster, MySpace, Orkut, etc. — or URLs containing
     `404` / `deleted` / `expired` / `removed`). Show title +
     URL + reason. **Never fetch the URL to confirm at render
     time** — this is a heuristic flag, never a verdict, and the
     output is offline-only. Label each as a "likely-dead"
     hypothesis, not a certainty.
   If any of the three lists is empty, render the card with a
   friendly placeholder rather than omitting the section. The
   literal labels "Duplicates" / "Stale" / "Dead link" / "Likely
   dead" or equivalents must be visible. All three matter — they
   answer "what's redundant?" "what's drifting?" "what's broken?".
4. **Reading queue / annotation cards (drill-down)** — a
   collapsible "Browse all N items" section with the full corpus,
   default collapsed so the analysis is the headline. Inside:
   virtualized or paginated cards / rows showing title + domain +
   tag chips + age + note excerpt. Filter chips for topic + folder
   + state (stale / duplicate / dead / has-note). Full-text search
   across `title` + `url` + `tags` + `note` (+ `abstract` for
   bibliographies, + `authors` + `venue` + `year` for
   bibliographies). Each card surfaces the open-original URL as a
   plain `<a href>` link with `rel="noopener noreferrer"` — never
   fetch or preview content from the URL at render time. Click a
   card to expand the structured fields (full note / abstract,
   authors, year, tags, dates, folder path). The drill-down is a
   hard requirement; without it the analysis can't be trusted.
5. **Reading-queue prioritization (or year histogram for
   bibliographies)** — a labeled "Read next" / "Priority queue" /
   "Recently saved" panel. For bookmarks / reading lists / URL
   lists: prioritize items that are recent + un-noted + clustered
   into the densest topics, OR simply show the most-recently-added
   8–16 items from `DATA.reading.weeklyHistogram` /
   `DATA.reading.monthlyHistogram` and the "Most-saved this month"
   ribbon. For bibliographies: surface `DATA.yearHistogram` as a
   sparkline + the most-recent papers (year >= median + 2). The
   literal heading "Read next" / "Priority queue" / "Recently saved"
   / "Recent papers" / "Year coverage" or equivalent must be
   visible.

Render these five regardless of dataset size. They're the contract;
without them the output is incomplete.

## What else to surface (pick what fits the dataset's shape)

For bookmarks / reading-list / URL-list inputs:

- **Folder breakdown** — for browser bookmarks, a pinned panel
  showing the top-level folders + count per folder + a chip that
  filters the drill-down. Pull from `DATA.folders` or
  `DATA.folderTree`. Folders are how the user already organized
  this; surface that organization, don't override it.
- **Saving rhythm timeline** — a horizontal date strip plotting
  `DATA.reading.weeklyHistogram` or `DATA.reading.monthlyHistogram`.
  Helps spot "I saved 40 things in March then nothing for two
  months" patterns.
- **Tag cloud** — pulled from `DATA.topTags`. A weighted pill grid
  where size scales with count. Click → filter drill-down.
- **Domain-of-domains rollup** — for huge bookmark dumps, a
  collapsible "X items from twitter.com (12 sub-pages), Y items
  from substack.com (8 authors), …" view. Useful when the long tail
  is dominated by a few hubs.

For bibliography inputs:

- **Year coverage histogram** — sparkline from
  `DATA.yearHistogram`. Shows research vintage at a glance — is
  this a current-state-of-the-field reading list or a historical
  survey?
- **Author leaderboard** — list from `DATA.authorLeaderboard`.
  The "who's worth following" view.
- **Venue leaderboard** — list from `DATA.venueLeaderboard`. The
  "where this field publishes" view (NeurIPS, JAMA, ACM CHI,
  Nature, etc.).
- **Reference type breakdown** — articles vs books vs
  inproceedings vs techreports vs theses, from `item.refType`. A
  small donut.
- **DOI coverage** — share of items with a DOI vs without. Useful
  for spotting half-cited entries.

Don't try to do all of these. Pick 2–4 beyond the required five,
based on what the data supports.

## Interaction discipline

- The topic / domain / folder / tag / state filter chips should
  **compose**, not override each other. Clicking "AI" + "stale"
  filters the drill-down to AI-tagged items that are stale. The
  summary card stays static; only the drill-down list adjusts.
- Search should match across title + url + tags + note + abstract
  + authors + venue (when those fields are present). Highlight
  matches inline.
- Every callout in the analysis (duplicates, stale items, dead
  links, top sources, top authors, year sparkline) should link
  back into the drill-down — clicking jumps to that item's row,
  expanded.
- Avoid fetch-on-render. URLs render as `<a href>` open-in-new-
  tab links only; the page never makes network requests at
  render or click time. This is a hard rule.

## Always include

- Light + dark mode (`prefers-color-scheme`).
- Mobile-first responsive — analysis cards stack, the topic /
  domain / cluster visualization shrinks but stays readable, filter
  chips wrap, the drill-down list goes single-column.
- Charts render inline SVG (no Chart.js, no CDNs) for under ~3000
  data points.
- Keep the page under ~1 MB inlined where possible. Bookmark dumps
  rarely exceed 500 KB; bibliographies with abstracts can hit
  1.5 MB.
- "Copy as Markdown" of the analysis section — paste-ready into a
  weekly review doc, a literature-review draft, or a project
  scratchpad.
- Full-text search across the item list; highlight matches in
  place.
- Item drill-down rows render mono for URLs / DOIs / dates /
  years; body type for titles / notes / authors / tags.

## Data shape

Every research parser feeds the same `items` array plus
shared aggregations. Treat them generically.

```ts
DATA = {
  kind: "research",
  format: "bookmarks-html" | "bibtex" | "ris" | "url-list" | "reading-list-csv" | "reading-list-json",
  items: [
    {
      id: "i_0001",
      title: "How we built our pricing page",
      url?: "https://stripe.com/blog/pricing-page",
      domain?: "stripe.com",
      domainRoot?: "stripe.com",
      source: "bookmark" | "bibtex" | "ris" | "url-list" | "reading-list",
      folder?: "Marketing/Pricing",
      folderPath?: ["Marketing", "Pricing"],
      tags?: ["pricing", "saas"],
      topic?: "pricing",
      // bookmark / reading-list timestamps
      addedEpoch?: 1719522000000,
      addedIso?: "2024-06-27",
      lastVisitedEpoch?: 1722114000000,
      lastVisitedIso?: "2024-07-27",
      // bibliography fields
      authors?: ["Patrick Collison", "John Collison"],
      year?: 2024,
      venue?: "Stripe Blog",
      doi?: "10.1145/3411764.3445188",
      publication?: "...",
      abstract?: "...",
      refType?: "article" | "book" | "inproceedings" | "techreport" | "misc",
      // shared
      note?: "Founder commentary on landing-page experiments",
      excerpt?: "Founder commentary on landing-page exper…",
      // computed
      ageDays?: 320,
      isStale?: true,
      isDuplicate?: false,
      duplicateOf?: "i_0017",
      isDead?: false,
      raw?: { /* preserved structured fields */ }
    }
  ],
  // aggregations
  domains: [{ domain: "stripe.com", count: 4, sampleTitle: "..." }],
  rootDomains: [{ domain: "stripe.com", count: 4 }],
  topics: [{ name: "pricing", count: 7, itemIds: ["i_0001", ...] }],
  topTags: [{ tag: "saas", count: 12 }],
  folders: [{ name: "Marketing/Pricing", count: 6, itemIds: [...] }],
  duplicateGroups: [{ url: "https://...", ids: ["i_0001","i_0034"], titles: ["...","..."] }],
  duplicateCount: 3,
  staleItems: [{ id, title, ageDays, folder, url }],
  staleCount: 12,
  deadLinks: [{ id, title, url, domain, reason }],
  deadCount: 2,
  yearHistogram: [{ year: 2022, count: 4 }, { year: 2023, count: 9 }, ...],
  authorLeaderboard: [{ name: "Patrick Collison", count: 3 }, ...],
  venueLeaderboard: [{ venue: "Stripe Blog", count: 4 }, ...],
  reading: {
    weeklyHistogram: [{ weekOf: "2026-W19", count: 6 }, ...],
    monthlyHistogram: [{ month: "2026-04", count: 28 }, ...],
  },
  // bookmarks-html only
  folderTree?: { name, count, children: [...], itemIds: [...] },
  totals: {
    items, domains, topics, duplicates, stale, dead, withDates, withNotes
  },
  meta: { sourceFile, sizeBytes, format, kind, ... }
}
```

Use the pre-aggregated arrays directly. Do **not** re-derive
`domains` / `topics` / `staleItems` / `duplicateGroups` on the
client — the parser already did the math, and walking the full
items array for analysis kills performance on large bookmark
dumps.

## Tone

Operator's-research register. The output should read like a
literature review, a research-rep update, or a pinboard audit —
not a bookmarks browser. "Stripe blog and Substack carry 40% of
the saved-this-quarter material; the AI cluster grew from 3 to
17 items in 8 weeks" is a sentence; "Stripe: 12, Substack: 8,
AI: 17" is a metric. Use sentences in the cards, metrics in
the charts. Mono numerics. Direct, specific.

## Privacy / safety / rendering rules (include in the page footer)

Bookmarks files often contain real URLs the user has visited —
internal tools, customer references, personal interests, search
queries, work-in-progress reading, even saved logins. Reading
lists and URL dumps carry similar weight. Bibliographies are
generally less sensitive but can leak research direction.

Add a small footer block:

> *Generated locally — your bookmarks / bibliography file never
> left your machine. The full export is embedded in this HTML and
> rendered offline in your browser. **No URLs are fetched at
> render or click time** — link previews, favicons, and dead-link
> verification are all heuristic-only. For sharing, prefer an
> anonymized export.*

This is a hard rule for the whole pack: **the output must not
fetch anything from the network at render time**. No favicon
service calls (use a CSS-only generic icon instead). No
oEmbed / OpenGraph fetching. No "preview the URL" hover. No
rich-link unfurl. Heuristic dead-link flags are always
"likely-dead" hypotheses, never verdicts.
