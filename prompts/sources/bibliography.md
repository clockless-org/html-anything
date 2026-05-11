# bibliography — BibTeX (`.bib`) and RIS (`.ris`) bibliographies

A bibliography file from Zotero, Mendeley, EndNote, JabRef, Google
Scholar, or a `.bib` typed by hand for a paper / thesis. The parser
handles BibTeX (`@article{key, ...}` brace blocks) and RIS
(`TY  - JOUR / AU  - / TI  - / ER  -` line blocks) under one shared
`bibliography` content type — the LLM doesn't need to branch.

The shared **research / reading-list contract** in `_research.md`
covers the five required sections (topic clusters, source
leaderboard, stale / duplicate / dead callouts, drill-down,
prioritization). Read that first. This file lists what's specific
to academic bibliography input.

## What's specific to bibliographies

- **Reframe the leaderboards.** "Top sources" is **venues**
  (journals + conferences), not URL hosts. Surface
  `DATA.venueLeaderboard` (NeurIPS, JAMA, Nature, ACM CHI, etc.)
  as the dominant leaderboard, and `DATA.authorLeaderboard` as a
  second card. Domain leaderboard (the URL field) is still useful
  for entries with `url` / `doi` set, but it's a tertiary view.
- **Year coverage is the key prioritization signal.** Use
  `DATA.yearHistogram` as a sparkline at the top of the
  prioritization section — it tells the reader at a glance whether
  this is a current-state-of-the-field collection (median ~ this
  year) or a historical survey (long tail back to 1980s). For
  "Read next" prioritize entries with `year >= median + 1`.
- **Topic clusters lean on tag (BibTeX `keywords`, RIS `KW`)
  fields.** When tags exist, prefer them; when they don't, fall
  back to `refType` grouping (`article`, `book`, `inproceedings`,
  `techreport`, `thesis`, `misc`) which is the next most useful
  axis.
- **Reference type donut.** A small pie / donut showing
  articles vs books vs conference papers vs theses is one of the
  better optional sections — it's the "what kind of work is in
  this list" view that no tag-based clustering can replicate.
- **Render abstracts in the drill-down.** Expanded cards in the
  drill-down should include `item.abstract` when present (often
  the most useful field for skimming). Use serif body type for
  the abstract, mono for DOI / year.
- **DOI handling.** When `item.doi` is set but `item.url` is not,
  the parser fills `item.url` with `https://doi.org/<doi>`. Render
  the DOI as a separate visible field in the drill-down — it's
  the canonical citation handle, not just a fallback URL.

## What to skip

- Don't try to render LaTeX in titles or abstracts. BibTeX
  abstracts often contain `\textit{}` / `$x^2$` — strip the
  obvious wrappers (the parser already does some of this) but
  don't bring in a math typesetter. Mono-font fallback for any
  raw `\command{}` that survives is fine.
- Don't render an exportable BibTeX block of the corpus. The
  user already has the file; the page is for reading, not
  re-exporting.
- Don't try to "verify" DOIs or URLs by fetching them. Same
  hard offline rule as the rest of the research pack — flag
  duplicates / stale, never claim a DOI is broken.

## Tone

Literature-review register. The output should read like the
"related work" section of a survey paper or the cover note of a
syllabus reading list. "The collection skews 2022–2024 (median
2023.5) and concentrates on three venues — NeurIPS, ICLR, and
ACM FAccT — with Bender, Mitchell, and Gebru as the three
authors who appear most often" is a sentence; "median 2023, top
venues NeurIPS/ICLR/FAccT, top authors Bender/Mitchell/Gebru" is
a metric. Sentences in the cards, metrics in the charts.
