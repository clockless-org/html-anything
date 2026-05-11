# reading-list — Pocket / Instapaper / Raindrop CSV / JSON exports

A reading-list export from Pocket, Instapaper, Raindrop, Matter,
Readwise Reader, Omnivore, or a generic CSV / JSON with at minimum
a `url` (or `link`) column and usually a `title`, `tags`, `time_added`
(or `added` / `date`), and sometimes a `folder` / `collection` /
`status` (read / unread / archived).

The shared **research / reading-list contract** in `_research.md`
covers the five required sections and the data shape. Read that
first.

## What's specific to reading-list exports

- **Status / folder is meaningful.** Pocket and Instapaper export
  the read / archived / unread state as a column; Raindrop
  exports the collection name. The parser populates `item.folder`
  with that value. Surface a "Status" or "Collection" panel — it
  often dominates the view (most reading-list users have a
  bimodal "unread inbox" + "archived" split).
- **Saving cadence matters.** Reading-list exports almost always
  have real `time_added` timestamps in Unix-seconds form. Surface
  the weekly / monthly histogram as a featured section — the "I
  was saving 30 things a week then dropped to zero" pattern is the
  dominant signal in a personal reading-list dump.
- **Tag chips are dense.** Reading-list users tend to over-tag.
  Cap the visible tag pills at 16, sort by count, and put the
  rest behind a "Show all N tags" toggle.
- **Notes are short or missing.** Unlike bookmarks (rare notes)
  or bibliographies (often have abstracts), reading-list notes
  are usually a one-liner Pocket annotation if anything. Render
  them inline in the card without an "expand" affordance.
- **Read-later bias.** Most reading-list inboxes contain
  hundreds of items the user never got to. The Stale section
  should lean into that ("47 items in your Inbox that have been
  there over 6 months").

## What to skip

- Same offline rule as the rest of the research pack — no URL
  fetching at render time, no preview cards, no favicon services.
- Don't render a "Mark as read" / "Archive" button. The page is
  a read-only audit, not a reading-list client.
