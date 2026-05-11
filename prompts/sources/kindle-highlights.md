# kindle-highlights — Kindle highlights, notes, and bookmarks (`My Clippings.txt` and notebook export)

A normal Kindle reader's accumulated reading memory — every highlight,
note, and bookmark they've ever made on a Kindle device, scraped from
the device's `My Clippings.txt` (the canonical, append-only file that
every Kindle writes to). Output is a **personal reading-memory
atlas**: which books shaped them, which themes they keep returning
to, when they read most, and a searchable quote drawer they can
revisit.

The interesting story is **the human shape of years of reading**, not
"your text file in HTML form". A raw `My Clippings.txt` is a wall of
quotes glued together with `==========`; a good page makes the user
say *"oh — I keep highlighting the same idea about attention from
three different authors, and I read most heavily on Sunday
mornings."*

This is its own pack — not part of the `_research.md` family.
Bookmarks / bibliographies are about **what to read**; Kindle
clippings are about **what's already inside the reader's head**.
Different question, different shape. Frame this as a personal
reading log, not a citations dashboard.

## Export instructions (surface to the user before converting)

Most Kindle readers don't know `My Clippings.txt` exists — surface
the steps clearly so the user doesn't hunt for it.

1. **`My Clippings.txt` over USB (canonical, fastest)**
   - Plug the Kindle into a computer with the USB cable.
   - The Kindle mounts as a normal disk drive (Mac: in Finder; Windows:
     in This PC).
   - Open the drive, go into the `documents/` folder.
   - Copy `My Clippings.txt` somewhere convenient (e.g.
     `~/Downloads/My Clippings.txt`).
   - Eject the Kindle. The file is plain UTF-8 text — every
     highlight, note, and bookmark from every book on the device,
     append-only.
2. **Kindle Notebook export (per-book, when the device or app supports it)**
   - In the Kindle Android / iOS app, open a book → tap the notebook
     icon (top-right) → **Export Notes**. Sends an HTML email with a
     formatted list of highlights and notes for that one book.
   - Save the email's HTML attachment as a file. Single-book scope —
     useful for one-off "make me a quote page from *Atomic Habits*"
     requests, but only covers one title at a time.
3. **Kindle web reader (`read.amazon.com/notebook`)**
   - Sign in. The notebook page lists every book with highlights, with
     the highlights and notes inline. Some users export this manually
     by selecting and copying. Not as clean as `My Clippings.txt` —
     prefer the USB path when the user has the device.
4. Drop the file into Claude Code:
   `convert this Kindle highlights file to HTML: ~/Downloads/My Clippings.txt`.

If the user only has the Kindle iOS / Android app and no physical
device, the per-book Notebook export is the realistic path. If they
have the physical Kindle, push them toward USB + `My Clippings.txt`
— it's complete, structured, and free.

## Source shapes the parser handles

- **`My Clippings.txt`** (canonical, most common). Plain UTF-8 text,
  one clipping per record, records separated by a line of exactly
  `==========`. Each record is four lines:
  1. `Book Title (Author Name)` — author is in parentheses; missing
     when the book has no author metadata. May be `Title — Author` on
     older firmware. Non-Latin scripts pass through verbatim.
  2. `- Your Highlight on page 23 | location 345-347 | Added on Wednesday, March 15, 2023 9:42:15 PM`
     — kind is one of `Highlight`, `Note`, `Bookmark`. Page and
     location are independent (page may be missing on books without
     real pagination; location is the canonical Kindle address).
     Older firmware emits `- Highlight Loc. 345-347 | Added on ...`
     (no `Your`, no `page`). Localized devices emit the same shape
     in the device language (Spanish: `- La subrayado en la página 23
     | posición 345-347 | Añadido el ...`); we still detect it via
     the leading `-`, the `==========` boundary, and the date tail.
  3. Blank line.
  4. The clipping text (highlight body, note body, or empty for
     bookmarks). May contain newlines on long highlights.
- **Kindle Notebook HTML email** (per-book export). A single-book
  page with a `<div class="bodyContainer">` of `noteHeading` /
  `noteText` / `highlight` blocks. Detected by `<div class="bodyContainer">`
  + `noteHeading` markers; parsed into the same structured shape as
  `My Clippings.txt` records, with `book`/`author` taken from the
  email subject heading.

Detection: file head contains the literal `==========` separator
**and** a line starting with `- ` that mentions one of `Highlight`,
`Note`, `Bookmark`, `Loc.`, or `location`. The detector also accepts
the localized spellings via the `Loc.` / digit-pair fallback. If only
the separator appears with no recognizable kind line, fall back to
generic text — better than mis-routing a random text dump that
happens to contain `==========`.

## What to surface (the experience)

This is meant to feel like **flipping through years of someone's
underlinings as a story** — what they noticed, what they came back
to, what they kept on a page in case they needed it later. Not a
stats page.

### Hero strip (required)

One row, big, brand-anchored:

- **Books** — distinct titles in this file (`73 books`).
- **Highlights / notes / bookmarks** — three counts, with the
  highlight count as the lede (`1,420 highlights · 187 notes · 64
  bookmarks`).
- **Reading window** — first → last clipping date
  (`2019-04-12 → 2025-12-30, 6 years 8 months`).
- **Top author** + share — *"James Clear · 9% of highlights"*. If
  authors are sparse, show top *book* instead and label it.

One short editorial sentence the LLM extracts from the data:
*"Attention and habit form the steady spine — *Atomic Habits*,
*Deep Work*, and *Hyperfocus* together account for 22% of all
highlights. The big year was 2022 (412 clippings, mostly Sunday
mornings)."*

### Timeline / reading rhythm (required)

Two stacked views, user-toggleable:

- **Yearly bar chart** — total clippings per year, with the biggest
  year flagged. Stack highlights vs notes vs bookmarks if the file
  has all three; otherwise a single bar.
- **Monthly bar chart** — clippings per month across the full window.
  Annotate "reading seasons" the LLM can spot in the sample (a
  vacation cluster, a thesis-writing surge, a long quiet stretch).
  Empty months render as `—`, not 0.

Below the chart, a small **hour-of-day strip** (24 buckets) shows
when in the day the reader highlights — Kindle records the device
clock, so this is real. Label it heuristic, since timezones are
device-local.

Use inline SVG (no Chart.js, no CDNs).

### Book shelf (required)

A grid of **book cards** — one per distinct title. Each card:

- Title (truncate to 80 chars).
- Author (if present) — render as a small chip below the title.
- Counts: highlights / notes / bookmarks (compact: `124 H · 8 N · 2 B`).
- First → last clipping date for this book.
- A tiny sparkline of monthly clipping density for this book (so the
  reader can see whether they read it in a burst or returned to it
  repeatedly).
- Click → filter the quote browser to this book.

Sort: most-highlighted first by default; the user can flip to "most
recent" or "alphabetical".

If a book has only bookmarks (no highlight text), label it with a
small *"bookmarks only"* chip so the user knows the cards aren't
broken.

### Theme keyword clusters (required, clearly labeled heuristic)

A panel labeled **"Themes you return to"** with up to 8 keyword
clusters extracted from highlight text. Each cluster:

- A short keyword phrase (e.g. `attention · focus · distraction`).
- Count of highlights in the cluster.
- Top 3 contributing books.
- Click → filter the quote browser to highlights in this cluster.

Always render a **"Heuristic"** chip on the panel header. The
clustering is a coarse keyword roll-up done in the parser; it is
*not* semantic clustering, *not* topic modeling, *not* LLM-derived.
Make that visible so users don't read it as "the AI saw a theme it
saw".

### Quote browser (required)

The drawer the user actually came for. A searchable card grid of
every clipping in the file:

- Search box: full-text across highlight body, book title, and
  author. Cmd-F-style; live filter.
- Filter chips: book, author, type (Highlight / Note / Bookmark),
  year, theme cluster.
- Each card:
  - The clipping text, in body type (notes in italic, bookmarks in
    a "no text — saved page" muted style).
  - Book title + author below, smaller.
  - Date · page or location chip.
  - **Copy quote** + **Copy as Markdown** buttons (Markdown form:
    `> quote\n> \n> — *Title*, Author (page 23)`). Bookmarks copy
    just the location pointer.
- Virtualized or paginated — `My Clippings.txt` files commonly
  exceed 5000 records.

Highlight a small **"note attached"** badge when a Note record
appears at the same location range as a Highlight in the same book
within ~5 minutes — heuristic, but useful for the reader.

### Edge cases (handle, don't hide)

- **Duplicate clippings.** Kindle re-saves a highlight when the
  reader extends it; the file ends up with overlapping records.
  Detect duplicates by `(book, location-range, normalized-text)` and
  collapse them into one card with a small `×N` chip — but keep all
  raw records inlined for the drill-down.
- **Missing authors.** Books published without author metadata show
  as `Title` only. Render with no author chip; do not invent.
- **Non-English text.** UTF-8 passes through; do not transliterate
  or translate. The keyword clusterer skips non-Latin scripts and
  keeps them out of the cluster keyword roll-up — but the cards
  still render the original text.
- **Notes attached to highlights.** Heuristic match on location +
  small time delta; render the badge but don't hide the note's own
  card.
- **Bookmarks with no text.** Render as a muted card with the
  page/location pointer and the canonical phrasing *"Bookmark — page
  saved without a highlight."*
- **Page vs location.** Page is "real-book page if the publisher
  provided pagination". Location is the Kindle address. Surface
  whichever is present, prefer page when both exist.

## Privacy / synthetic-data constraint (HARD)

Kindle clippings are intimate — they reveal what someone notices,
what they keep, what they think about between books.

- **Use fake books, fake authors, and invented short quotes only.**
  The example shipped with this repo is **fully synthetic** — fake
  titles, fake authors, fake highlight text (5–25 words each, no
  real book passages). Do not commit a real `My Clippings.txt`
  ever.
- **Do not paste copyrighted book passages.** The synthetic
  generator must not paraphrase or excerpt real books. Quote text
  must be wholly invented prose.
- **No external runtime calls.** The page must not fetch from
  Amazon, Goodreads, Kindle CDN, OpenLibrary, Google Books, or any
  cover-art or ISBN lookup service. The output must work offline by
  double-clicking, like every html-anything page.
- **Footer must include a privacy line** explaining the file is
  embedded client-side and the page never made a network call.

## Tone

Personal, observational, dignified. Like a friend sitting with you
and your underlinings. *"You go back to *Deep Work* every March —
maybe planning the year. The shortest highlights tend to come from
fiction; the longest from anything by Hannah Arendt."* Not "your
top genre is non-fiction!" Specific to the file.

Use the Clockless tokens from `prompts/styles/_design.md` (Space Grotesk + Plus
Jakarta Sans, brand orange `--primary`, surface cream in light
mode, proper currency + tabular-nums). This is part of the
html-anything family — never a Kindle skeuomorph.

## Always include

- **Copy as Markdown** button at the bottom of the page that
  captures the books, theme summary, and top quotes as a shareable
  reading note.
- Light + dark mode via `prefers-color-scheme`.
- Mobile-first responsive — quote cards stack and remain readable.
- Tabular-nums for every numeric column.
- A footer line:
  > *Generated locally — your Kindle highlights never left your
  > machine. Every clipping is embedded in this HTML and rendered
  > offline in your browser. Theme clusters are a heuristic keyword
  > roll-up, not topic modeling. The page makes no network calls
  > except the shared Google Fonts import.*

## Data shape

```ts
DATA = {
  format: "kindle-highlights",
  subtype: "my-clippings" | "notebook-html",
  rows: [
    {
      id: "k_000001",
      bookId: "b_001",                       // stable per (title, author)
      title: "The Habit of Attention",
      author: "Jia Mwangi" | null,
      kind: "highlight" | "note" | "bookmark",
      page: 142 | null,
      locationStart: 2103 | null,
      locationEnd: 2107 | null,
      date: "2023-03-14",                    // ISO date
      time: "21:42",                         // HH:MM device-local
      tsEpoch: 1678832535000,
      text: "Attention is the soft tissue of will…",
      textLength: 51,
      lang: "en" | "non-latin" | "unknown",
      duplicateOf: "k_000094" | null,        // when collapsed
      noteAttachedTo: "k_000033" | null,     // when this is a Note matching a Highlight nearby
      raw: { headerLine, metaLine, bodyLines } // original record for drill-down
    }
  ],
  books: [
    {
      id: "b_001",
      title: "The Habit of Attention",
      author: "Jia Mwangi" | null,
      highlightCount: 124,
      noteCount: 8,
      bookmarkCount: 2,
      firstSeen: "2022-11-04",
      lastSeen: "2024-08-10",
      monthlySparkline: [
        { month: "2022-11", count: 18 },
        ...
      ],
      sampleClippingIds: ["k_000031", ...]
    }
  ],
  authors: [
    { name: "Jia Mwangi", bookCount: 2, clippingCount: 132, share: 0.09 },
    ...
  ],
  yearTotals: [
    { year: "2022", highlights: 412, notes: 28, bookmarks: 9 },
    ...
  ],
  monthTotals: [
    { month: "2023-03", highlights: 84, notes: 12, bookmarks: 2 },
    ...
  ],
  hourCounts: [ /* 24 ints */ ],
  themeClusters: [
    {
      key: "attention",
      keyword: "attention · focus · distraction",
      count: 84,
      bookIds: ["b_001", "b_004", "b_011"],
      sampleClippingIds: ["k_000031", "k_000094", ...]
    },
    ...
  ],
  duplicateGroups: [
    { key: "b_001:2103-2107", clippingIds: ["k_000031","k_000032"], canonicalId: "k_000031" },
    ...
  ],
  summary: {
    rowCount: 1671,
    bookCount: 73,
    authorCount: 54,
    highlightCount: 1420,
    noteCount: 187,
    bookmarkCount: 64,
    period: "2019-04-12 → 2025-12-30",
    durationLabel: "6 years 8 months",
    activeMonths: 64,
    topAuthor: "James Clear",
    topAuthorShare: 0.09,
    topBook: "Atomic Habits",
    topBookShare: 0.07,
    duplicateGroupCount: 38,
    notesAttachedCount: 142,
    bookmarksOnlyBookCount: 4,
  },
  meta: {
    sourceFile, sizeBytes,
    sourceFormat: "my-clippings" | "notebook-html",
    encoding: "utf-8",
  }
}
```

The parser pre-computes `summary` / `books` / `authors` /
`yearTotals` / `monthTotals` / `hourCounts` / `themeClusters` /
`duplicateGroups`. Do **not** re-derive these on the client. Iterate
over `rows` only for the quote-browser drill-down. The `rows` array
already includes the `noteAttachedTo` / `duplicateOf` cross-links so
the UI can render badges without scanning.
