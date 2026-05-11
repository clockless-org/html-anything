# goodreads — Goodreads library / reviews CSV export

A Goodreads library export is the user's full reading history as a single
CSV. Get it from `goodreads.com/review/import` → "Export Library". The
file always contains the same columns even if the user has only read a
handful of books:

```
Book Id, Title, Author, Author l-f, Additional Authors, ISBN, ISBN13,
My Rating, Average Rating, Publisher, Binding, Number of Pages,
Year Published, Original Publication Year, Date Read, Date Added,
Bookshelves, Bookshelves with positions, Exclusive Shelf, My Review,
Spoiler, Private Notes, Read Count, Owned Copies
```

## What's specific

- **Bookshelves are user tags.** Free-form, comma-delimited inside a
  single column. Treat each shelf as a cluster — favorites, sci-fi,
  philosophy, biography, business, fantasy, etc. The user's shelf
  vocabulary is the spine of the page.
- **Exclusive Shelf** is one of `read` / `currently-reading` / `to-read`.
  Filter to `read` for any "books I've finished" view. Surface
  `to-read` separately as the unread inbox.
- **My Rating ∈ {0..5}.** Zero means unrated. Five-star books are the
  emotional core of the export — those are the "books that built me"
  in a personal museum view.
- **My Review can be empty, one line, or 2000+ words.** Length is a
  reliable signal of how much the book mattered. Use review length as
  a brightness/weight signal, not a primary sort.
- **Date Read may be missing** even when Exclusive Shelf is `read`.
  Fall back to Date Added when grouping by year.
- **Average Rating** is the global Goodreads average. Useful for the
  "I rated this much higher / lower than the crowd" outliers.

## Required Goodreads page shape (Reading Museum + Bookshelf
Constellation hybrid)

This source has a custom hybrid style — do **not** default to the
generic timeline-story or editorial layout. The page must combine:

1. **Hero** — "The Books That Built Me" / Goodreads Reading Museum
   positioning, with the privacy line "all parsing stays in your
   browser, nothing is uploaded".
2. **Stats strip** — books read, distinct authors, year span, average
   rating, five-star count, books with reviews.
3. **Bookshelf Constellation** — dark night-sky canvas where each book
   is a star.
   - Star **size** = `My Rating` (1-5; unrated = small dim dot).
   - Star **brightness/glow** = review length.
   - Star **color** = top shelf / cluster.
   - Hover or click reveals title, author, rating, shelves, and a
     short review snippet.
4. **Hall of Masterpieces (Museum)** — every 5-star book as a museum
   plaque card (ivory paper, brass/gold accent, refined serif title).
   Excerpt the first 240–320 chars of `My Review` as the plaque text.
5. **Year gallery** — group by `Date Read` year (fall back to
   `Date Added`), show top book per year (highest rating, then longest
   review).
6. **Shelf rooms** — top 6–10 shelves as rooms, each showing 4–6
   representative books.
7. **Share moment** — a visually strong summary card with the headline
   stats and the user's three "books that built me", styled for a
   single screenshot.

## Privacy & defaults

- All parsing must stay client-side.
- Surface a short privacy line near the upload control.
- The page must work as a self-contained demo with embedded synthetic
  sample data so a visitor never needs an upload to see the experience.
- Provide a CSV upload control that re-renders the page from the user's
  real Goodreads export without any network call.

## What to skip

- No live Goodreads API calls; the export is the source of truth.
- No book cover scraping. Render cards typographically with shelf
  color and rating glyphs, no remote images.
- No "wishlist me on Amazon" affiliate links. The page is a personal
  museum, not a storefront.
