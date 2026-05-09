# The Long, Slow, Inevitable Death of the PDF

The PDF is the universal output format. Every report, every spec, every
contract, every menu, every receipt eventually becomes one. It is the
text-based equivalent of a fax: hated, ubiquitous, immortal.

This is mostly because nothing better has shown up. Word documents are
proprietary. Markdown is too plain. HTML is too varied. So the PDF
endures, like a cockroach with a "Save As" button.

## Why PDFs persist

There are three real reasons:

1. **Faithful rendering.** A PDF looks the same on every device, every
   printer, every reader. This was a miracle in 1993 and is still useful.
2. **Portability.** One file, one click, one envelope.
3. **Print-to-screen consistency.** Even if you never print it, it
   *implies* a page, which implies a finished thing, which implies trust.

The first two have alternatives that finally work. The third is harder
to reason about, but it might be where the PDF actually lives.

## What's broken about it

A PDF is a closed format pretending to be an open one. The text inside
is often hostile to copy-paste. Tables shatter on selection. Forms are
hieroglyphics. Search works, but only barely. On a phone, a PDF asks
you to *zoom into a thing designed for paper*, which is the digital
equivalent of being handed a folded map and a compass.

> The PDF is the only format I know of that simultaneously feels like a
> precious artifact and a hostile environment.

## What might replace it

The candidates have always existed. They just haven't won.

### HTML

A single self-contained `.html` file can hold structure, color,
illustrations, code, animation, search, and interactivity. It opens
in any browser. It does not need an app. It is searchable, copyable,
mobile-responsive when written correctly, and it is the format that
agents already produce for the web.

The downside has always been that authoring was hard. That is what
just changed.

### Markdown

Lighter than HTML, with the same portability. But markdown has no
visual identity. A 100-page PDF and a 100-page markdown file feel
nothing alike. Markdown is a working draft; PDF is a finished thing.
This is sociology more than technology.

### Notion / Slabs / Walling / Capacities

Beautiful, but locked. You don't have the file. You have a link, and
the link only works while you're paying.

## So what changes now

The shape of the answer is: **make HTML feel finished**. Authoring used
to be the bottleneck — a designer to lay out the typography, an engineer
to wire the interactions. Both of those are now things an agent can do
in a single prompt.

A PDF says "this document is final." An HTML file produced by an agent
that read your specs, your data, your repo, your meeting notes, *and
turned them into a single file with search, navigation, dark mode and
mobile responsiveness* says "this document is alive."

That second one is more useful.

---

## Footnotes

- The single-self-contained-file thing matters. Multi-file SPAs are
  not portable; you can't email them.
- Search inside the HTML file is non-negotiable. The number of times
  per week I `Cmd-F` inside a long document is the reason any reading
  experience without it feels broken.
- Mobile responsive is non-negotiable. People will read what you sent
  on a phone, in a hurry, between meetings. If they can't, they don't.

The PDF is going to outlive every single one of us. But it shouldn't
have to.
