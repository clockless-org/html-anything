# vcard-contacts — Address book audit + relationship atlas (`.vcf` / vCard exports)

A normal person's contacts export — Apple Contacts, Google Contacts,
iCloud, Android, Outlook — saved as a `.vcf` file (vCard 3.0 or 4.0,
multi-card). The raw file is unreadable: hundreds of `BEGIN:VCARD` /
`END:VCARD` blocks, folded property lines, repeated typed fields,
binary photos baked in.

The output is a **personal address-book audit + relationship atlas**.
The user gets to see their address book the way they wish their phone
showed it: who's actually in there, which orgs they've worked with,
where their people live, who needs cleanup before the next phone
migration, and a searchable card grid they can slice by *has phone /
has email / has address / has birthday / has photo*.

The interesting story is **the human shape of years of saved
contacts** — old coworkers stacked under three different employers,
a string of dentists they never updated, a half-dozen "Mom" cards
from before everyone went digital — not "your `.vcf` file rendered
back as a `.vcf` file."

This is its own pack. Contacts aren't an event stream, a chat, a
finance file, or a knowledge base — they're a static graph of
people the user has decided are worth keeping. Frame as a
relationship atlas, not a CRM dashboard. No deal stages, no
"next-action" calls-to-action — this is read-only, observational.

## Export instructions (surface to the user before converting)

Most users have never opened their contacts as a `.vcf` file —
walk them through it.

1. **Apple Contacts (macOS)** — open Contacts → ⌘A to select all →
   File → Export → Export vCard… → save somewhere convenient
   (e.g. `~/Downloads/Contacts.vcf`).
2. **iCloud (web)** — `icloud.com/contacts` → click any contact →
   ⌘A → ⚙ gear icon → Export vCard.
3. **iPhone / iPad** — Settings → \[Your Name\] → iCloud → make sure
   Contacts is on, then export from icloud.com or AirDrop a single
   card. iOS does not natively export the whole address book to a
   single `.vcf` from the Contacts app — the iCloud-web path is the
   realistic full-export route.
4. **Google Contacts** — `contacts.google.com` → left sidebar →
   Export → vCard (for iOS Contacts) → download. Choose the
   "Selected contacts" / "All contacts" / a label as appropriate.
5. **Android (without Google)** — Contacts app → ⋮ menu → Manage
   contacts → Import / export contacts → Export to .vcf file.
6. **Outlook (Microsoft 365)** — People → ⋮ → Export contacts →
   choose CSV or vCard depending on version.

The output of all of these is a single `.vcf` file containing many
contacts back-to-back (`BEGIN:VCARD … END:VCARD … BEGIN:VCARD …`).

Drop the file into Claude Code:
`convert this contacts export to HTML: ~/Downloads/Contacts.vcf`.

## Source shapes the parser handles

- **vCard 3.0** (`VERSION:3.0`, ASCII-quoted-printable folding,
  `TYPE=` parameters or bare `;CELL` flags). The Apple / iCloud /
  Google default for many years.
- **vCard 4.0** (`VERSION:4.0`, UTF-8, `TYPE="cell,voice"` parameter
  values, `BDAY:--MM-DD` partial dates, structured `KIND` field).
  Apple Contacts on recent macOS exports this.
- **Multi-card files**: hundreds of cards in one `.vcf`, separated
  by `BEGIN:VCARD` / `END:VCARD`. The parser walks them all.
- **Folded lines** (RFC 6350 §3.2): a line that starts with a
  single space or tab is a continuation of the previous logical
  line. Concatenate before splitting on `:`.
- **Repeated typed fields**: a contact can have multiple `TEL`,
  `EMAIL`, `ADR`, `URL` properties — usually with TYPE labels
  (`HOME`, `WORK`, `CELL`, `FAX`, `IPHONE`, `OTHER`) — preserve
  every one.
- **Photo redaction**: `PHOTO`, `LOGO`, `SOUND` — record only
  `hasPhoto: true` plus the MIME hint (`image/jpeg`, `image/png`)
  if the line declares one. **Never decode or embed the binary**.
  The fixture and the parser both must avoid base64 binaries
  even if the source contains them — they're large, often hold
  embedded EXIF, and have no value in this view.
- **Quoted-printable** (`ENCODING=QUOTED-PRINTABLE` on vCard 2.1 /
  some Outlook exports): pass through but note as raw — do not
  decode aggressively for v2.1; report what we can reliably parse.

Detection: file head contains `BEGIN:VCARD` and `VERSION:` (any
version), AND at least one `END:VCARD`. Reject if only one of those
markers is present, or if the head reads like a chat / event stream
that happens to contain the literal "VCARD" string.

## What to surface (the experience)

The page should make the user say *"I had no idea I have 41 contacts
without a single phone number, and 12 of these dentists are the same
person under different spellings."*

### Hero strip (required)

One row, big, brand-anchored:

- **Contacts** — total card count (`347 contacts`).
- **Reachability** — `308 with a phone · 271 with an email · 94 with
  an address`. The lede is whichever number is most informative for
  this file.
- **Date window** — first → last `REV` if present, else "no
  revision metadata" (`2014 → 2026, 11 years`).
- **Top organization / employer** — single chip, with count
  (`Acme Industries · 14 contacts`).

One short editorial sentence the LLM extracts from the data:
*"Family + a long line of coworkers from Acme Industries dominate;
98 contacts (28%) are missing a phone number, and 36 cards look
like duplicate clusters worth merging before the next phone
migration."*

### Address-book health audit (required)

The single highest-value section. A grid of compact "issue cards" —
the LLM picks 4-6 of these based on what's actually present:

- **Missing core fields** — `41 missing a phone, 18 missing an
  email, 9 missing both name and email`.
- **Malformed emails** — heuristic regex. Each card lists the
  bad value next to the contact name (no auto-correction).
- **Old REV timestamps** — count of cards last revised >5 years
  ago (heuristic: a contact you haven't touched in 5 years is
  probably stale). Report the year breakdown.
- **Repeated phone / email across cards** — same number appears on
  three different cards = likely duplicate. List the top 5 most-
  repeated phone numbers / emails.
- **Possible duplicate clusters** — see the dedicated section below.
- **Note-only contacts** — cards where the only useful field is a
  `NOTE` (e.g. someone the user typed a reminder for but never
  finished saving).
- **Single-field reachability** — cards that have just an email or
  just a phone, no name.

Each issue card: count + 2-3 example contact names (truncate names,
do not embed full PII in the card body — let the user click through
to the searchable table to drill in).

Style: muted, "tidy this when you have time" — not alarmist, not
shameful. Frame as audit rows, not warnings.

### Relationship atlas (required)

Five tabs / panels, depending on what's in the file:

- **Organizations leaderboard** — top 12 ORG values with counts.
  Click → filter the contact table to that org. Sub-line: roles
  inside that org, if `TITLE` is present.
- **Email-domain clusters** — top 10 domains across all `EMAIL`
  values, with counts. Filters out personal-mail domains
  (`gmail.com`, `outlook.com`, `icloud.com`, `yahoo.com`,
  `hotmail.com`, `me.com`, `mac.com`, `aol.com`, `proton.me`,
  `pm.me`) into a separate "personal mail" line so the work
  domains stand out.
- **Cities / regions** — top 12 `ADR` localities with counts.
  Heuristic, since address fields are free-form. If everything
  geocodes back to one country, label that.
- **Birthday calendar** — a 12-month strip showing how many
  contacts have a birthday in each month, with the upcoming three
  months called out (`June: 4 birthdays this month`). Names are
  not displayed in the strip — click → filter the table.
- **Tags / groups** — top `CATEGORIES` values (`Family`, `Work`,
  `Coworker`, `College`). Optional — many exports omit categories.

All five are pre-aggregated by the parser; the page renders them
as inline-SVG bars + chips.

### Duplicate merge worksheet (required, read-only)

A panel showing the top 6-12 likely duplicate clusters — grouped by:

- **Same normalized name** (lowercased, accent-stripped, ignoring
  middle initials and titles like *Dr.* / *Mr.*).
- **Shared phone or email** across two cards with different names.
- Both rules can flag the same cluster — surface a single grouped
  card.

Each cluster shows the candidate cards side-by-side as small
tables: name, phone(s), email(s), org, last `REV`, "what's
unique to this card." The user reads them and decides — the page
**does not** offer a merge button or a merged-card preview. This
is read-only audit, not a destructive editor.

Add a note at the top: *"Duplicate detection is heuristic. Verify
in your Contacts app before deleting anything."*

### Searchable contact table (required)

The drawer the user actually came for. A virtualized card grid of
every contact:

- **Search box** — full-text across name, org, title, every email,
  every phone (searched verbatim against the masked or unmasked
  form depending on the toggle), every note.
- **Filter chips** —
  - Has phone / Has email / Has address / Has birthday / Has photo
  - Possible duplicate
  - Organization (top 8)
  - City (top 8)
  - Tag (top categories)
- **Sort** — Name (A→Z), Recently revised, Most fields populated,
  Possible duplicate first.
- **Card layout**:
  - Name (FN), with truncation; missing name → italic "(no name)".
  - Org · Title chip below.
  - Phone(s), email(s), address(es) — masked by default (see the
    Privacy section) with a per-card or page-wide toggle.
  - Birthday badge.
  - Tags badges (`Family`, `Work`, `Important`).
  - "PHOTO present" badge if `hasPhoto: true` — never the photo
    itself.
  - Last-revised chip if REV present.
- **Open card** → expand inline to show every property with TYPE
  label visible (`HOME`, `WORK`, `CELL`, etc.) plus any NOTE field
  in italic.

### Privacy / mask-by-default (HARD)

Phone numbers and emails are **masked by default** in the rendered
page. Two visual rules:

- Phone: `+1 (415) ••• ••42` — keep country code, area code, last
  two digits.
- Email: `j••••a@gmail.com` — keep first letter and last letter of
  local-part, full domain.

The page exposes a single **eye toggle** in the toolbar:
`👁 Show real phone & email`. The toggle affects the local DOM
only; the inlined `DATA` already contains the unmasked values, but
they only render unmasked when the toggle is on. Each individual
card also gets its own per-card reveal (long-press / click the
masked field).

Why this matters: contacts include private numbers and personal
emails of dozens-to-hundreds of other people who did not consent
to having a relationship atlas built on top of their info. Masking
by default keeps the page screen-shareable and avoids leaking PII
via casual screenshots. The toggle is local-only; nothing leaves
the browser.

### Edge cases (handle, don't hide)

- **Malformed FN** (`FN:`). Render as italic "(no name)" — never
  fall back to the email or phone as the visible name; the user
  may have typed a placeholder like `XXX` deliberately.
- **Multiple N (structured-name) fields** — concatenate as
  `Last, First Middle`; vCard 4.0 lets some fields be empty.
- **vCard 2.1 quoted-printable**. Pass through; tag the contact
  with a small "legacy" badge so the user knows the rendered text
  may be approximate.
- **Photo with no MIME hint** — set `hasPhoto: true` and leave
  type as `unknown`. Never embed the `data:image/...` payload.
- **TYPE labels that aren't standard** — pass through literally
  (`TEL;type=schoolcell`); don't normalize to `OTHER` and lose
  the user's own labelling.
- **Empty contacts** — `BEGIN:VCARD` / `END:VCARD` with no fields
  beyond `VERSION`. Skip silently from the audit; do not render
  as cards.
- **Group cards** (`KIND:group` in vCard 4.0) — render with a
  group icon and list `MEMBER` UIDs as count-only.

## Privacy / synthetic-data constraint (HARD)

Contacts are intimate data — every card represents a real person
who did not consent to being in a synthetic example.

- **Use fake names, fake organizations, fake addresses, and
  reserved example domains only.** Reserved example domains for
  fake emails: `example.com`, `example.org`, `example.net`,
  `invalid.test`, `nowhere.example`. Never use a real consumer
  webmail domain attached to a fake person's name in a fixture
  (e.g. don't write `john.smith@gmail.com` — write
  `samira.r@example.com`).
- **Use reserved phone-number ranges** for synthetic data. North
  American: 555-01xx (`+1-415-555-0123`). UK: `01632 960xxx`.
  Other regions: invented prefixes that don't collide with real
  national plans. Never use a phone number you've ever called.
- **Do not include real home addresses.** Use fake street numbers
  on fake streets; pin to a city + region without a postal code
  if uncertain.
- **Never embed binary `PHOTO` data.** Even synthetic. The
  fixture should declare `PHOTO` lines with a reserved value
  (e.g. `PHOTO;TYPE=JPEG;ENCODING=BASE64:[REDACTED-SYNTHETIC]`)
  or omit the binary entirely. The parser must never decode or
  re-emit the binary regardless.
- **No external runtime calls.** The page must not fetch from
  Google Contacts, Gravatar, Outlook, iCloud, social-network
  avatar services, or any geocoding / reverse-DNS / favicon
  endpoint. Open offline by double-clicking, like every
  html-anything page.
- **Footer must include a privacy line** explaining the file is
  embedded client-side, masked by default, and the page never
  made a network call.

## Tone

Quiet, observational, dignified. Like a friend who's also good at
spreadsheets gently saying *"by the way, you've got six different
'Mom' cards going back to 2014, want me to help merge them
later?"* — not a Google-style "your address book is **23%**
unhealthy! Take action!"

Use the Clockless tokens from `prompts/styles/_design.md` (Space Grotesk + Plus
Jakarta Sans, brand orange `--primary`, surface cream in light
mode). This is part of the html-anything family — never an
Outlook skeuomorph or a Google-Contacts UI clone.

## Always include

- **Privacy mask toggle** in the toolbar (`👁 Show / Hide phone &
  email`). Default OFF.
- **Copy as Markdown** button at the bottom that captures only
  the audit + atlas summary (org / city / domain leaderboards +
  health counts) — **not** the contact table. Sharing the audit
  summary is fine; sharing the contact list is not.
- Light + dark mode via `prefers-color-scheme`.
- Mobile-first responsive — contact cards stack and remain
  readable at 360px wide.
- Tabular-nums for every numeric column.
- A footer line:
  > *Generated locally — your contacts never left your machine.
  > Every card is embedded in this HTML and rendered offline in
  > your browser. Phone numbers and emails are masked by default;
  > the toggle is local-only and does not transmit anything.
  > Photos are not embedded — only a "PHOTO present" flag. The
  > page makes no network calls.*

## Data shape

```ts
DATA = {
  format: "vcard-contacts",
  version: "3.0" | "4.0" | "mixed",
  rows: [
    {
      id: "c_000001",
      fn: "Riya Acharya",                       // FN (display name)
      familyName: "Acharya" | null,             // N components
      givenName: "Riya" | null,
      additionalNames: "K." | null,
      prefixes: "Dr." | null,
      suffixes: "PhD" | null,
      org: "Solare Global" | null,
      orgUnits: ["Engineering"] | [],            // ORG[1..]
      title: "Senior Software Engineer" | null,
      phones: [
        { value: "+14155550123", type: "CELL", masked: "+1 (415) ••• ••23" },
        { value: "+14155550149", type: "WORK", masked: "+1 (415) ••• ••49" }
      ],
      emails: [
        { value: "riya.a@example.com", type: "WORK", masked: "r••••a@example.com" }
      ],
      addresses: [
        {
          type: "HOME",
          street: "421 Synthetic Way",
          city: "Brookline",
          region: "MA",
          postal: "02446",
          country: "United States",
          formatted: "421 Synthetic Way, Brookline, MA 02446, United States"
        }
      ],
      urls: [{ value: "https://example.com/riya", type: null }],
      bday: "1991-06-12" | null,                 // ISO date or "--MM-DD" partial
      bdayMonth: 6 | null,
      bdayDay: 12 | null,
      categories: ["Family", "Work"],
      note: "Met at Solare onsite, send NDA before next call." | null,
      rev: "2024-09-12" | null,                  // last revision (ISO)
      hasPhoto: true,
      photoMime: "image/jpeg" | null,
      kind: "individual" | "group" | "org",
      uid: "u-abc123" | null,
      legacy: false,                             // true if vCard 2.1 / quoted-printable
      duplicateOfClusterId: "dup_001" | null,
      auditFlags: ["missing-phone", "stale-rev"]  // strings, see below
    }
  ],
  organizations: [
    { name: "Solare Global", count: 14, sampleIds: ["c_000001", ...] },
    ...
  ],
  emailDomains: [
    { domain: "example.com", count: 22, kind: "work" | "personal", sampleIds: [...] },
    ...
  ],
  cities: [
    { city: "Brookline, MA", count: 8, sampleIds: [...] }, ...
  ],
  birthdayMonths: [
    { month: 1, count: 4 }, { month: 2, count: 7 }, ..., { month: 12, count: 5 }
  ],
  categories: [
    { name: "Family", count: 12, sampleIds: [...] }, ...
  ],
  duplicateClusters: [
    {
      id: "dup_001",
      reason: "shared-phone" | "shared-email" | "normalized-name",
      key: "+14155550123",
      contactIds: ["c_000019", "c_000044"],
      candidateNames: ["M. Tindall", "Maeve Tindall"]
    },
    ...
  ],
  audit: {
    missingPhone: { count: 41, sampleIds: [...] },
    missingEmail: { count: 18, sampleIds: [...] },
    missingBoth: { count: 9, sampleIds: [...] },
    malformedEmail: { count: 5, samples: [{ id, value }, ...] },
    staleRev: { count: 33, threshold: "2021-05-10", samples: [...] },
    repeatedPhone: [{ value, count, contactIds }, ...],
    repeatedEmail: [{ value, count, contactIds }, ...],
    noteOnly: { count: 3, sampleIds: [...] },
    nameless: { count: 2, sampleIds: [...] },
    legacy21: { count: 1, sampleIds: [...] }
  },
  summary: {
    contactCount: 347,
    individualCount: 343,
    groupCount: 4,
    withPhone: 308,
    withEmail: 271,
    withAddress: 94,
    withBirthday: 121,
    withPhoto: 88,
    withCategories: 41,
    distinctOrgs: 96,
    distinctEmailDomains: 53,
    distinctCities: 38,
    distinctCountries: 5,
    duplicateClusterCount: 36,
    revWindow: "2014-08-22 → 2026-04-30",
    revDurationLabel: "11 years 8 months",
    topOrganization: "Solare Global",
    topOrganizationShare: 0.04,
    topCity: "San Francisco, CA",
    topCityShare: 0.06,
  },
  meta: {
    sourceFile, sizeBytes,
    sourceFormat: "vcf",
    encoding: "utf-8",
    versionDistribution: { "3.0": 200, "4.0": 147 }
  }
}
```

The parser pre-computes `summary` / `organizations` / `emailDomains`
/ `cities` / `birthdayMonths` / `categories` / `duplicateClusters` /
`audit`. Do **not** re-derive these on the client. Iterate over
`rows` only for the searchable table drill-down. The `rows` array
already includes the `auditFlags` and `duplicateOfClusterId`
cross-links so the UI can render badges without scanning.
