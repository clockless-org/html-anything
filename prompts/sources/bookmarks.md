# bookmarks-html — Netscape bookmarks export

A `Bookmarks.html` export from Chrome / Firefox / Safari / Edge /
Pinboard / Raindrop / older Delicious-style services. The Netscape
bookmark format encodes a folder tree (`<H3>` headings + nested
`<DL>`s) and one `<A HREF>` per saved link, with `ADD_DATE` /
`LAST_VISIT` / `LAST_MODIFIED` Unix timestamps and an optional
`<DD>` note adjacent to each link.

The shared **research / reading-list contract** in `_research.md`
covers the five required sections (topic clusters, domain
leaderboard, stale / duplicate / dead callouts, drill-down,
prioritization) plus the data shape, the privacy footer, and the
hard offline-only rendering rule. Read that first.

## What's specific to bookmarks

- **Show the folder structure the user already built.** The
  parser preserves the full folder tree in `DATA.folderTree` and
  per-item `folderPath`. Surface a "Folders" panel as one of your
  optional sections — it's how the user already organized this
  collection, and the page should respect that organization, not
  override it. Render as a collapsible tree or a horizontal
  breadcrumb chip group.
- **Saving timeline.** Bookmarks have real `addedEpoch` values
  in most browsers — surface `DATA.reading.monthlyHistogram` (or
  weekly for shorter timeframes) as a sparkline. The "I saved 47
  things in March then nothing for two months" pattern is one of
  the more honest signals about a bookmarks file.
- **Stale-folder hint.** The parser flags items in folders named
  `Read Later` / `To Read` / `Inbox` / `Archive` as stale even
  when there's no add-date metadata. Honor that flag.
- **Long-tail collapse.** Personal bookmark dumps usually have a
  few dominant domains (twitter.com, github.com, news.ycombinator.com,
  substack.com, youtube.com) and a long tail of one-offs.
  Collapse the tail into "+N other domains (1 each)" rather than
  rendering every single hostname in the leaderboard.

## What to skip

- Don't try to render favicons. The format doesn't include them
  inlined; fetching them at render time violates the offline-only
  rule. Use a CSS-only generic icon (a small monogram of the root
  domain's first letter is fine).
- Don't try to render link previews / OpenGraph cards. Same
  reason — those need network requests.
- Don't render the "browse all bookmarks" view as a tree by
  default. The tree view goes in the Folders panel; the drill-
  down is a flat searchable list because that's what makes it
  scannable across the whole collection.
