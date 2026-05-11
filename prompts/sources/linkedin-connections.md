# linkedin-connections — Professional network atlas (LinkedIn `Connections.csv`)

A LinkedIn "Download your data" export of **Connections** — a CSV with
columns like `First Name`, `Last Name`, `URL`, `Email Address`,
`Company`, `Position`, `Connected On`. Often hundreds of rows, and
sometimes a 1-3 line `Notes:` preamble before the real header (the
parser strips it).

The output is a **professional network atlas**. The user gets to see
their network the way they wish LinkedIn showed it: who they actually
know, where the network came from over time, which companies and roles
dominate it, which contacts are stale or missing email/company/role,
and who they should re-engage before a job search, fundraising round,
hiring sprint, or conference.

The interesting story is **the human shape of years of accepted
connection requests** — the conference week that added 20 strangers,
the year they joined a startup and three coworkers showed up, the long
tail of recruiters whose company is now blank. Not "your CSV rendered
back as a table."

This is its own pack — a connections export is observational, not an
event stream and not a CRM. Frame as a relationship atlas. **No deal
stages, no auto-drafted outreach copy, no integrations.** Read-only.

## Export instructions (surface to the user before converting)

Most users have never run a LinkedIn export — walk them through it.

1. On a desktop browser, sign in to LinkedIn → click **Me** (top-right
   avatar) → **Settings & Privacy**.
2. Open the **Data privacy** tab → click **Get a copy of your data**.
3. Choose **Want something in particular?** and tick at least
   **Connections**. (You can also tick Messages or Profile, but this
   pack is scoped to connections.)
4. Click **Request archive**. LinkedIn emails a download link. The
   "fast" archive (Connections only) usually arrives in ~10 minutes;
   the full archive can take up to 24 hours.
5. Download the ZIP from the email. Inside is `Connections.csv`.
6. Drop the file into Claude Code:
   `convert this LinkedIn connections export to HTML: ~/Downloads/Connections.csv`.

Detection: the parser recognizes any CSV whose header row contains
`First Name` + `Last Name` + `Connected On` together (with optional
`Company` / `Position`), even if there is a 2-3 line `Notes:` block
before the header. A file literally named `Connections.csv` is also
treated as LinkedIn regardless of whether the preamble is present.

## What to surface (the experience)

The page should make the user say *"I had no idea 38% of these are
just from one conference week, and 47 of them have no current company
listed."*

### Hero strip (required)

One row, big, brand-anchored:

- **Connections** — total card count (`642 connections`).
- **Year window** — first → last `Connected On`
  (`2014 → 2026, 11 years 3 months`).
- **Coverage** — `with company / with position / with email`
  (`541 have a company, 537 a role, 312 an email — 84% coverage`).
- **Top company** — single chip, with count
  (`Acme Industries · 14 connections`).

One short editorial sentence the LLM extracts from the data:
*"Eleven years of accepted requests dominated by Acme + a long tail of
recruiters; 23% of cards no longer list a current company, and a 28-row
spike in October 2024 looks like a single conference week."*

### Network growth timeline (required)

Two stacked elements. The LLM picks the one that fits the date span:

- **Monthly bars** when the file spans <5 years — one bar per month
  with cumulative line, callouts on the top 1-3 spike months.
- **Yearly bars + cumulative line** when the file spans 5+ years —
  one bar per year, plus the running cumulative count beside it.

Spike callouts are explicit: a month at 2.5× the rolling mean (with at
least 4 connections) gets a tagged label —
*"Oct 2024: 28 new — likely SaaStr / a conference week."* Don't invent
the cause; phrase it as a likely cluster ("looks like…").

### Company + role + industry leaderboards (required)

Three panels, side by side on desktop, stacked on mobile:

- **Top companies** — top 12 `Company` values with counts, click →
  filter the contact table. Sub-line: top 1-2 roles inside that
  company (e.g. *3 engineers, 2 PMs*) when more than three share a
  company.
- **Role keyword clusters** — the parser pre-extracts a normalized
  keyword like "Software Engineer", "Product Manager", "Recruiter",
  "Founder & Exec" from the `Position` column. Show the top 10 with
  counts; click → filter.
- **Industries** — heuristic bucket (`Engineering & Data`, `Product`,
  `Design`, `Marketing & Growth`, `Sales & BD`, `Founder & Exec`,
  `Investing & Finance`, `People & Talent`, `Operations`,
  `Consulting & Strategy`, `Legal & Compliance`, `Academia`,
  `Media & Writing`, `Healthcare`, `Student & Early Career`,
  `Other`). Inferred — surface a tiny "heuristic" footnote.

### Email-domain breakdown (required when ≥1 email is present)

One panel:

- **Work email domains** — top 10 non-personal domains by count
  (signals which orgs the user has actual reach into).
- **Personal mail share** — `gmail.com`, `outlook.com`, `icloud.com`,
  `yahoo.com`, `hotmail.com`, `me.com`, `mac.com`, `aol.com`,
  `proton.me`, `pm.me`, `comcast.net`, `verizon.net`, `att.net`
  collapse into one "personal mail" line so work domains stand out.

If no emails are present (LinkedIn only includes them for connections
who shared their address), say so plainly in the panel: *"No emails
in this export — LinkedIn only includes addresses for connections who
opted in to sharing."*

### Reconnect queue (required, heuristic, read-only)

The single highest-value section for an active user. The parser
pre-computes a `reconnectQueue` of the top ~20 candidates ranked by a
weighted score that combines:

- **Staleness** — `years since Connected On` (older = higher).
- **Missing current company** — likely they switched jobs and haven't
  updated their profile, but you might still know where they went.
- **Has email** — a small bump because the user can actually reach
  them.
- **Very recent** — connections from the last 90 days get a small
  bump as gentle "say hi" prompts.

Render as a card list. Each card: name, last position/company,
"connected X ago", reasons chip (`5y ago`, `missing company`, `has
email`, `just connected`), and a copy-name button. **Do not generate
outreach copy. Do not link to LinkedIn.com.** This is a list, not a
CRM action.

A note at the top: *"Reconnect candidates are heuristic. The page
makes no calls to LinkedIn."*

### Audit row (required)

A small grid of 4-6 issue cards — pick from what's actually present:

- **Missing current company** — count (these contacts no longer
  display a company on their profile).
- **Missing role** — count.
- **Missing email** — count + share. Frame it neutrally — most
  LinkedIn connections never share their email.
- **Stale (>5 years old)** — count, with year-of-connection breakdown.
- **Possible duplicate names** — count of names that appear on more
  than one card (likely the same person rejoining LinkedIn under a
  new account).
- **Possible duplicate URLs** — same `URL` slug on more than one row.

Each issue card: count + 2-3 example names — no full PII embedded in
the card body; let the user click through to the contact grid to
drill in.

Style: muted, observational. Not alarmist, not a "your network health
score is 67/100" gamification.

### Searchable contact grid (required)

A virtualized card grid of every connection:

- **Search box** — full-text across name, company, position, email
  (verbatim against masked or unmasked depending on toggle), and URL
  slug.
- **Filter chips**:
  - With email · With company · With position
  - Stale (>5 years) · Recent (last 90 days)
  - Possible duplicate
  - Industry (top 8)
  - Company (top 8)
- **Sort** — Most recent connection · Oldest connection · Name (A→Z) ·
  Reconnect score (high→low).
- **Card layout**:
  - Name (truncated; missing name → italic "(no name)").
  - Company · Position chip below.
  - Industry badge.
  - Email — masked by default (`r••••a@example.com`), per-card
    reveal.
  - Connected On chip (`Jan 2024`) + relative `(2y 4mo ago)`.
  - LinkedIn URL — shown but **not clickable** (the page is offline).
  - Reconnect score badge if > 0.
- **Open card** → expand inline to show every field including the raw
  URL, raw email (revealed), and the reconnect-reason chips.

### Privacy / mask-by-default (HARD)

Every email is **masked by default** in the rendered page:

- `r••••a@example.com` — keep first letter and last letter of the
  local part, full domain.

The toolbar exposes a single eye toggle: `👁 Show real emails`. The
toggle is local-only DOM; the inlined `DATA` already contains the
unmasked values, but they only render unmasked when the toggle is on.
Each card also gets its own per-card reveal (click the masked field).

Phone numbers don't appear in this export, but if a future row ever
includes one, mask it with the same shape as the vCard pack.

URLs are shown but **not clickable** by default — the page is
offline-only, and a stray click to LinkedIn.com would defeat that. A
"copy URL" button is fine; an `<a href>` to linkedin.com is not.

### Edge cases (handle, don't hide)

- **No header preamble** vs. **2-3 line preamble** — the parser
  handles both. Don't render the preamble.
- **Empty `Connected On`** — render the card with `(no date)` and
  exclude from the timeline. Do not invent a date.
- **`Connected On` in `12 May 2024` format** vs `5/12/2024` —
  parser normalizes both to ISO; output uses ISO + relative label.
- **Empty `Email Address`** — most rows; render "(no email)".
- **Empty `Company` AND `Position`** — these are usually
  recruiter-removed or deleted accounts; tag as `missing-company` +
  `missing-position` and surface in the audit row.
- **Duplicate names across cards** — flag as `duplicate-name`. Do not
  auto-merge. Surface in the audit row only.
- **Same `URL` on two cards** — flag as `duplicate-url`. Same rule.
- **Tracking parameters in URLs** — the parser strips `?…` and `#…`.
  Don't reconstruct the original.

## Privacy / synthetic-data constraint (HARD)

A connections export contains the personal data of dozens-to-
thousands of real people who did not consent to being in a synthetic
example. For fixtures and demos:

- **Use fake names, fake companies, fake positions, and reserved
  example domains only.** Reserved example domains for fake emails:
  `example.com`, `example.org`, `example.net`, `invalid.test`,
  `nowhere.example`. Never use a real consumer webmail domain
  attached to a fake person's name in a fixture (e.g. don't write
  `john.smith@gmail.com` — write `samira.r@example.com`).
- **Use fake `linkedin.com/in/...` slugs that do not match any real
  account.** Slugs in synthetic data should look like
  `linkedin.com/in/synthetic-firstname-lastname-xxxxx` to make it
  obvious nothing real is being represented.
- **No real LinkedIn URLs in the rendered output.** The page must
  not contact LinkedIn or any external service at runtime — no avatar
  fetches, no `/in/` link previews, no analytics, no fonts.
- **Do not generate outreach copy or templated DMs.** Even synthetic.
  Connections are people, not leads.
- **Footer must include a privacy line** explaining the file is
  embedded client-side, masked by default, and the page never made a
  network call.

## Tone

Quiet, observational, useful. Like a friend who's also good at
spreadsheets gently saying *"by the way, 23% of your network has no
current company listed and most of them haven't shown up in your feed
in years"* — not LinkedIn's "Your network grew **18%** this quarter!
Send connection requests to grow more!"

Use the Clockless tokens from `prompts/styles/_design.md` (Space Grotesk + Plus
Jakarta Sans, brand orange `--primary`, surface cream in light mode).
This is part of the html-anything family — never a LinkedIn skeuomorph
or a Sales Navigator UI clone.

## Always include

- **Privacy mask toggle** in the toolbar
  (`👁 Show / Hide email addresses`). Default OFF.
- **Copy as Markdown** button at the bottom that captures only
  the audit + atlas summary (companies / industries / domains /
  growth) — **not** the contact list. Sharing the audit summary
  is fine; sharing the contact list is not.
- Light + dark mode via `prefers-color-scheme`.
- Mobile-first responsive — contact cards stack and remain readable
  at 360px wide.
- Tabular-nums for every numeric column.
- A footer line:
  > *Generated locally — your LinkedIn connections never left your
  > machine. Every row is embedded in this HTML and rendered offline
  > in your browser. Email addresses are masked by default; the
  > toggle is local-only and does not transmit anything. The page
  > makes no network calls — no LinkedIn, no avatars, no analytics.*

## Data shape

```ts
DATA = {
  format: "linkedin-connections",
  rows: [
    {
      id: "ln_000001",
      firstName: "Riya",
      lastName: "Acharya",
      fullName: "Riya Acharya",
      url: "https://www.linkedin.com/in/synthetic-riya-acharya-12af3" | null,
      email: "riya.a@example.com" | null,
      emailMasked: "r••••a@example.com" | null,
      emailDomain: "example.com" | null,
      emailDomainKind: "work" | "personal" | null,
      company: "Solare Global" | null,
      companyKey: "solare global" | null,        // normalized for grouping
      position: "Senior Software Engineer" | null,
      positionKeyword: "Software Engineer" | null,
      industry: "Engineering & Data",
      connectedOn: "2024-09-12" | "",
      connectedYear: 2024 | null,
      connectedMonth: "2024-09" | null,
      yearsAgo: 1.6 | null,                        // vs reference date
      reconnectScore: 0.42,                        // 0..1
      flags: ["missing-email", "stale-old", "very-recent", "duplicate-name", "duplicate-url"]
    }
  ],
  monthlyGrowth: [{ month: "2018-01", count: 4 }, ...],
  yearlyGrowth: [{ year: 2018, count: 47, cumulative: 47 }, ...],
  spikes: [{ month: "2024-10", count: 28, label: "October 2024: 28 new connections" }, ...],
  companyLeaderboard: [{ name: "Solare Global", count: 14, sampleIds: ["ln_000001", ...] }, ...],
  positionKeywords: [{ keyword: "Software Engineer", count: 23, sampleIds: [...] }, ...],
  emailDomains: [{ domain: "example.com", count: 22, kind: "work" | "personal", sampleIds: [...] }, ...],
  industries: [{ industry: "Engineering & Data", count: 41, sampleIds: [...] }, ...],
  reconnectQueue: [
    { id: "ln_000044", score: 0.72, reasons: ["connected 7y ago", "missing current company", "has email"] },
    ...
  ],
  audit: {
    missingEmail: { count: 330, sampleIds: [...] },
    missingCompany: { count: 47, sampleIds: [...] },
    missingPosition: { count: 51, sampleIds: [...] },
    staleOld: { count: 188, sampleIds: [...] },
    veryRecent: { count: 9, sampleIds: [...] },
    duplicateNameClusters: [{ name: "alex chen", ids: ["ln_000019", "ln_000204"] }, ...],
    duplicateUrlClusters: [{ url: "https://www.linkedin.com/in/...", ids: [...] }, ...]
  },
  summary: {
    contactCount: 642,
    period: "2014-08-22 → 2026-04-30",
    durationLabel: "11 years 8 months",
    yearWindow: "2014 → 2026",
    withEmail: 312,
    withCompany: 541,
    withPosition: 537,
    withUrl: 631,
    distinctCompanies: 312,
    distinctPositions: 280,
    distinctEmailDomains: 53,
    distinctIndustries: 14,
    topCompany: "Solare Global",
    topCompanyCount: 14,
    topIndustry: "Engineering & Data",
    topPositionKeyword: "Software Engineer",
    topDomain: "example.com",
    workEmailShare: 0.12,
    referenceDate: "2026-04-30"
  },
  meta: {
    sourceFile, sizeBytes,
    headers: ["First Name","Last Name","URL","Email Address","Company","Position","Connected On"],
    detectedColumns: { firstName: "First Name", ... }
  }
}
```

The parser pre-computes `summary` / `monthlyGrowth` / `yearlyGrowth` /
`spikes` / `companyLeaderboard` / `positionKeywords` / `emailDomains` /
`industries` / `reconnectQueue` / `audit`. Do **not** re-derive these
on the client. Iterate over `rows` only for the searchable grid
drill-down. Each row already includes `flags`, `industry`, and
`positionKeyword` so the UI can render badges without scanning.
