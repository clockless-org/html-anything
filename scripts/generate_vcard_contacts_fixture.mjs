#!/usr/bin/env node
/**
 * Deterministic synthetic-data generator for the vcard-contacts
 * example. Produces a multi-card `.vcf` covering vCard 3.0 + 4.0
 * shapes:
 *
 *   - 30 fake contacts: family, coworkers (3 employers), service
 *     providers (dentist, mechanic, vet), an old college friend, a
 *     restaurant, a few "Mom" cards from the same person under
 *     different spellings (the canonical merge candidate).
 *   - 3+ duplicate clusters: shared phone, shared email, normalized-
 *     name match.
 *   - intentionally incomplete contacts: nameless, phone-only,
 *     email-only, note-only, malformed email, very stale REV.
 *   - photo metadata only — every PHOTO line uses a redacted
 *     placeholder instead of a base64 binary.
 *   - international phone formats (US, UK reserved 01632 960xxx,
 *     Japan invented prefix).
 *   - categories tags, birthdays in multiple months, addresses in
 *     multiple cities/regions/countries.
 *   - folded lines and repeated typed fields exercised.
 *
 * Privacy: every name, organization, email, phone, address is
 * wholly invented. Reserved phone ranges (555-01xx for US,
 * 01632 960xxx for UK) and reserved email domains
 * (example.com / example.org / example.net / invalid.test) are
 * used so no real contact is ever resembled.
 *
 * Usage:
 *   node scripts/generate_vcard_contacts_fixture.mjs > examples/vcard-contacts/input.vcf
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "examples/vcard-contacts/input.vcf")

// ---------------------------------------------------------------------------
// Synthetic contacts. Every value is hand-written and obviously invented.
// ---------------------------------------------------------------------------

// Five placeholders we use repeatedly.
const PHOTO_PLACEHOLDER = "[REDACTED-SYNTHETIC]"

// Helpers
function fold(line) {
  // RFC 6350 folding: split very long lines at 75 chars, continuations
  // start with a single space. We exercise this for the rare line that
  // overflows (notes mostly).
  if (line.length <= 75) return line
  const parts = []
  let i = 0
  parts.push(line.slice(0, 75))
  i = 75
  while (i < line.length) {
    parts.push(" " + line.slice(i, i + 74))
    i += 74
  }
  return parts.join("\r\n")
}
function escVal(v) {
  return String(v).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;")
}

function vcard(c) {
  // c: {
  //   version: "3.0" | "4.0",
  //   fn, family, given, additional, prefix, suffix,
  //   nickname, org (string|[string,string]), title,
  //   tels: [{type, value}], emails: [{type, value}],
  //   adrs: [{type, street, city, region, postal, country}],
  //   urls: [{type, value}], bday, categories: [string], note,
  //   rev, photoMime, uid, kind, legacy21
  // }
  const lines = []
  lines.push("BEGIN:VCARD")
  lines.push(`VERSION:${c.version || "3.0"}`)
  if (c.kind) lines.push(`KIND:${c.kind}`)
  if (c.fn !== undefined) lines.push(`FN:${escVal(c.fn)}`)
  if (c.family || c.given || c.additional || c.prefix || c.suffix) {
    lines.push(`N:${escVal(c.family || "")};${escVal(c.given || "")};${escVal(c.additional || "")};${escVal(c.prefix || "")};${escVal(c.suffix || "")}`)
  }
  if (c.nickname) lines.push(`NICKNAME:${escVal(c.nickname)}`)
  if (c.org) {
    if (Array.isArray(c.org)) lines.push(`ORG:${c.org.map(escVal).join(";")}`)
    else lines.push(`ORG:${escVal(c.org)}`)
  }
  if (c.title) lines.push(`TITLE:${escVal(c.title)}`)
  for (const tel of (c.tels || [])) {
    const params = tel.type ? `;TYPE=${tel.type}` : ""
    lines.push(`TEL${params}:${tel.value}`)
  }
  for (const em of (c.emails || [])) {
    const params = em.type ? `;TYPE=${em.type}` : ""
    lines.push(`EMAIL${params}:${em.value}`)
  }
  for (const a of (c.adrs || [])) {
    const params = a.type ? `;TYPE=${a.type}` : ""
    lines.push(`ADR${params}:${escVal(a.pob || "")};${escVal(a.extended || "")};${escVal(a.street || "")};${escVal(a.city || "")};${escVal(a.region || "")};${escVal(a.postal || "")};${escVal(a.country || "")}`)
  }
  for (const u of (c.urls || [])) {
    const params = u.type ? `;TYPE=${u.type}` : ""
    lines.push(`URL${params}:${u.value}`)
  }
  if (c.bday) lines.push(`BDAY:${c.bday}`)
  if (c.categories && c.categories.length) lines.push(`CATEGORIES:${c.categories.map(escVal).join(",")}`)
  if (c.note) lines.push(fold(`NOTE:${escVal(c.note)}`))
  if (c.rev) lines.push(`REV:${c.rev}`)
  if (c.uid) lines.push(`UID:${c.uid}`)
  if (c.photoMime) {
    // Both shapes — record metadata, never embed the binary.
    if (c.version === "4.0") lines.push(`PHOTO:data:${c.photoMime};base64,${PHOTO_PLACEHOLDER}`)
    else lines.push(`PHOTO;TYPE=${c.photoMime.split("/")[1].toUpperCase()};ENCODING=BASE64:${PHOTO_PLACEHOLDER}`)
  }
  lines.push("END:VCARD")
  return lines.join("\r\n")
}

// ---------------------------------------------------------------------------
// Synthetic contact data — wholly invented. Reserved domains + reserved
// phone ranges only.
// ---------------------------------------------------------------------------

const CONTACTS = []

// Family — three "Mom" cards under different spellings (the canonical
// merge target).
CONTACTS.push({
  version: "3.0",
  fn: "Mom",
  family: "Acharya", given: "Riya",
  tels: [{ type: "CELL", value: "+15555550101" }],
  emails: [{ type: "HOME", value: "riya.synth@example.com" }],
  adrs: [{ type: "HOME", street: "421 Synthetic Way", city: "Brookline", region: "MA", postal: "02446", country: "United States" }],
  bday: "1962-05-12",
  categories: ["Family"],
  note: "Mom — favorite color is forest green, prefers texts to calls.",
  rev: "20240909T130000Z",
  uid: "synth-mom-1",
  photoMime: "image/jpeg",
})
CONTACTS.push({
  version: "3.0",
  fn: "Mom (Riya)",
  family: "Acharya", given: "Riya",
  tels: [{ type: "CELL", value: "+15555550101" }],
  emails: [{ type: "HOME", value: "riya.synth@example.com" }],
  bday: "1962-05-12",
  rev: "20210105T120000Z",
  uid: "synth-mom-2",
})
CONTACTS.push({
  version: "4.0",
  fn: "Riya Acharya",
  family: "Acharya", given: "Riya",
  tels: [{ type: "cell", value: "+15555550101" }],
  emails: [{ type: "home", value: "riya.synth@example.com" }],
  adrs: [{ type: "home", street: "421 Synthetic Way", city: "Brookline", region: "MA", postal: "02446", country: "United States" }],
  bday: "1962-05-12",
  rev: "20260218T091500Z",
})

// Dad — one card.
CONTACTS.push({
  version: "3.0",
  fn: "Dad",
  family: "Acharya", given: "Naveen",
  nickname: "Dad",
  tels: [
    { type: "CELL", value: "+15555550118" },
    { type: "HOME", value: "+15555550224" },
  ],
  emails: [{ type: "HOME", value: "naveen.synth@example.org" }],
  adrs: [{ type: "HOME", street: "421 Synthetic Way", city: "Brookline", region: "MA", postal: "02446", country: "United States" }],
  bday: "1958-11-30",
  categories: ["Family"],
  note: "Dad. Best reached evenings after 7pm Eastern.",
  rev: "20251205T090000Z",
})

// Sister — same address as parents, shared family-line phone.
CONTACTS.push({
  version: "4.0",
  fn: "Anya Acharya",
  family: "Acharya", given: "Anya",
  tels: [{ type: "cell", value: "+15555550138" }],
  emails: [{ type: "work", value: "anya.a@example.com" }],
  adrs: [{ type: "home", street: "421 Synthetic Way", city: "Brookline", region: "MA", postal: "02446", country: "United States" }],
  bday: "1990-03-22",
  categories: ["Family"],
  rev: "20251130T120000Z",
})

// Coworkers — Solare Global (5 contacts)
const SOLARE_REVS = ["20231012T120000Z", "20240122T130000Z", "20240811T100000Z", "20250214T120000Z", "20250903T140000Z"]
const SOLARE = [
  { fn: "Maeve Tindall", given: "Maeve", family: "Tindall", title: "Senior Software Engineer", email: "m.tindall@example.com", phone: "+15555550207", bday: "1991-06-12" },
  { fn: "Hanan Boutros", given: "Hanan", family: "Boutros", title: "Engineering Manager", email: "hanan.b@example.com", phone: "+15555550208", bday: "1985-09-04" },
  { fn: "Mira Salonen", given: "Mira", family: "Salonen", title: "Staff Designer", email: "mira.s@example.com", phone: "+15555550210", bday: null },
  { fn: "Aleksandr Volkov", given: "Aleksandr", family: "Volkov", title: "Site Reliability", email: "alex.v@example.com", phone: "+15555550211", bday: "1988-11-20" },
  { fn: "Calla Reyes", given: "Calla", family: "Reyes", title: "Product Manager", email: "calla.r@example.com", phone: "+15555550212", bday: "1992-02-19" },
]
SOLARE.forEach((p, i) => {
  CONTACTS.push({
    version: i % 2 === 0 ? "3.0" : "4.0",
    fn: p.fn, family: p.family, given: p.given,
    org: ["Solare Global", "Engineering"],
    title: p.title,
    tels: [{ type: "WORK", value: p.phone }, { type: "CELL", value: p.phone.replace(/.{2}$/, String(i + 30)) }],
    emails: [{ type: "WORK", value: p.email }],
    adrs: [{ type: "WORK", street: "44 Demonstration Plaza, Floor 12", city: "San Francisco", region: "CA", postal: "94107", country: "United States" }],
    bday: p.bday,
    categories: ["Coworker", "Solare"],
    rev: SOLARE_REVS[i],
    uid: `synth-solare-${i}`,
    photoMime: i < 2 ? "image/jpeg" : null,
  })
})

// Old employer — Drysdale Variety Co. (3 contacts, all REV from 2018-2020).
const DRYSDALE = [
  { fn: "Jia Mwangi", given: "Jia", family: "Mwangi", title: "Operations Lead", email: "jia.mwangi@example.org", phone: "+15555550241", rev: "20190614T120000Z" },
  { fn: "Field Hartwell", given: "Field", family: "Hartwell", title: "Account Manager", email: "field.h@example.org", phone: "+15555550242", rev: "20180322T120000Z" },
  { fn: "Petra Fall", given: "Petra", family: "Fall", title: "Designer", email: "petra.fall@example.org", phone: "+15555550243", rev: "20200715T120000Z" },
]
DRYSDALE.forEach((p, i) => {
  CONTACTS.push({
    version: "3.0",
    fn: p.fn, family: p.family, given: p.given,
    org: "Drysdale Variety Co.",
    title: p.title,
    tels: [{ type: "WORK", value: p.phone }],
    emails: [{ type: "WORK", value: p.email }],
    adrs: [{ type: "WORK", street: "12 Imaginary Mews", city: "Brooklyn", region: "NY", postal: "11211", country: "United States" }],
    categories: ["Coworker", "Drysdale"],
    note: i === 0 ? "Old colleague at Drysdale, kept in touch via LinkedIn." : null,
    rev: p.rev,
  })
})

// Mid-period employer — Atlas Monthly (2 contacts).
const ATLAS = [
  { fn: "Owen Skylight", given: "Owen", family: "Skylight", title: "Editor", email: "owen.s@example.net", phone: "+15555550261" },
  { fn: "Quinn Drysdale", given: "Quinn", family: "Drysdale", title: "Writer", email: "quinn.d@example.net", phone: "+15555550262" },
]
ATLAS.forEach((p, i) => {
  CONTACTS.push({
    version: "4.0",
    fn: p.fn, family: p.family, given: p.given,
    org: "Atlas Monthly",
    title: p.title,
    tels: [{ type: "work", value: p.phone }],
    emails: [{ type: "work", value: p.email }],
    bday: i === 0 ? "1987-08-09" : "1990-04-02",
    categories: ["Coworker", "Atlas"],
    rev: "20230118T100000Z",
  })
})

// Service providers — dentist, mechanic, vet, restaurant.
CONTACTS.push({
  version: "3.0",
  fn: "Brookline Family Dental",
  org: "Brookline Family Dental",
  tels: [
    { type: "WORK", value: "+15555550311" },
    { type: "FAX", value: "+15555550312" },
  ],
  emails: [{ type: "WORK", value: "front.desk@example.com" }],
  adrs: [{ type: "WORK", street: "200 Imaginary Drive, Suite 4", city: "Brookline", region: "MA", postal: "02446", country: "United States" }],
  urls: [{ value: "https://example.com/brookline-dental" }],
  categories: ["Service", "Health"],
  note: "Cleaning every 6 months — last visit Q1 2025.",
  rev: "20250318T140000Z",
  kind: "org",
})
CONTACTS.push({
  version: "3.0",
  fn: "Mongoose Garage",
  org: "Mongoose Garage",
  tels: [{ type: "WORK", value: "+15555550321" }],
  adrs: [{ type: "WORK", street: "88 Synthetic Avenue", city: "Cambridge", region: "MA", postal: "02139", country: "United States" }],
  categories: ["Service"],
  rev: "20240608T100000Z",
})
CONTACTS.push({
  version: "3.0",
  fn: "Verdant Repo Animal Hospital",
  org: "Verdant Repo Animal Hospital",
  tels: [{ type: "WORK", value: "+15555550331" }],
  emails: [{ type: "WORK", value: "appointments@example.org" }],
  adrs: [{ type: "WORK", street: "12 Demonstration Court", city: "Brookline", region: "MA", postal: "02446", country: "United States" }],
  categories: ["Service", "Pets"],
  note: "Cat: Plum. Annual checkup December.",
  rev: "20251201T130000Z",
})
CONTACTS.push({
  version: "3.0",
  fn: "The Pickled Onion",
  org: "The Pickled Onion",
  tels: [{ type: "WORK", value: "+15555550341" }],
  adrs: [{ type: "WORK", street: "55 Fictional Square", city: "Boston", region: "MA", postal: "02114", country: "United States" }],
  urls: [{ value: "https://example.org/pickled-onion" }],
  categories: ["Restaurant"],
  note: "Anniversary spot, reserve 4 weeks ahead.",
  rev: "20240210T180000Z",
})

// College friends — long-tail, mostly stale.
CONTACTS.push({
  version: "3.0",
  fn: "Sam Nightingale",
  family: "Nightingale", given: "Sam",
  org: "Backslash Burrito",
  tels: [{ type: "CELL", value: "+15555550401" }],
  emails: [{ type: "HOME", value: "samn@example.net" }],
  bday: "1989-07-14",
  categories: ["College", "Friend"],
  note: "Roommate sophomore year.",
  rev: "20191102T120000Z",
})
CONTACTS.push({
  version: "3.0",
  fn: "Marbleweather",
  given: "Mara",
  family: "Weather",
  nickname: "Marbleweather",
  tels: [{ type: "CELL", value: "+15555550402" }],
  emails: [{ type: "HOME", value: "marbleweather@example.com" }],
  bday: "1990-12-04",
  categories: ["College"],
  rev: "20180918T120000Z",
})
CONTACTS.push({
  version: "3.0",
  fn: "Skylight Diner",
  org: "Skylight Diner",
  tels: [{ type: "WORK", value: "+15555550411" }],
  categories: ["Restaurant"],
  rev: "20170522T120000Z",
})

// International — UK reserved 01632 960xxx, Japan invented prefix.
CONTACTS.push({
  version: "4.0",
  fn: "Folded Paper Studio",
  org: "Folded Paper Studio",
  tels: [{ type: "work", value: "+44 1632 960123" }],
  emails: [{ type: "work", value: "hello@example.org" }],
  adrs: [{ type: "work", street: "21 Invented Lane", city: "London", region: null, postal: "EC1A 1BB", country: "United Kingdom" }],
  urls: [{ value: "https://example.org/folded-paper" }],
  categories: ["Vendor"],
  rev: "20251010T090000Z",
})
CONTACTS.push({
  version: "4.0",
  fn: "Tide Reports KK",
  org: "Tide Reports KK",
  tels: [{ type: "work", value: "+81-3-5555-9012" }],
  emails: [{ type: "work", value: "office@example.net" }],
  adrs: [{ type: "work", street: "1-2-3 Synthetic-cho", city: "Tokyo", region: null, postal: "100-0001", country: "Japan" }],
  categories: ["Vendor"],
  rev: "20250629T120000Z",
})

// Group card (vCard 4.0 KIND:group)
CONTACTS.push({
  version: "4.0",
  fn: "Family Group",
  kind: "group",
  emails: [{ type: "home", value: "family@example.com" }],
  categories: ["Family"],
  rev: "20240715T100000Z",
})

// Note-only contact: someone the user typed a reminder for but never finished.
CONTACTS.push({
  version: "3.0",
  fn: "Plumber referral",
  note: "Friend recommended a plumber named Pat — get number from Anya.",
  rev: "20240320T120000Z",
})

// Phone-only contact (no name). vCard allows missing FN.
CONTACTS.push({
  version: "3.0",
  fn: "",
  tels: [{ type: "CELL", value: "+15555550521" }],
  rev: "20231004T120000Z",
})

// Email-only contact (malformed email).
CONTACTS.push({
  version: "3.0",
  fn: "Q (sticker design)",
  emails: [{ type: "HOME", value: "q.sticker[at]example.com" }],  // intentionally malformed
  rev: "20230811T120000Z",
})

// Possible duplicate via shared email — different fn, same email.
CONTACTS.push({
  version: "3.0",
  fn: "Pat Pickle (plumber)",
  family: "Pickle", given: "Pat",
  tels: [{ type: "CELL", value: "+15555550601" }],
  emails: [{ type: "HOME", value: "pat.p@example.org" }],
  rev: "20240811T120000Z",
})
CONTACTS.push({
  version: "4.0",
  fn: "Patty Pickle",
  family: "Pickle", given: "Patty",
  tels: [{ type: "cell", value: "+15555550602" }],
  emails: [{ type: "home", value: "pat.p@example.org" }],
  bday: "1985-03-15",
  categories: ["Service"],
  note: "Plumber. Quote on bathroom retrofit early 2024.",
  rev: "20240218T120000Z",
})

// Contact with an unusual TYPE label to exercise pass-through.
CONTACTS.push({
  version: "3.0",
  fn: "Mezzanine Tape Studio",
  org: "Mezzanine Tape",
  tels: [{ type: "STUDIOLINE", value: "+15555550701" }],
  emails: [{ type: "WORK", value: "studio@example.net" }],
  adrs: [{ type: "WORK", street: "9 Imaginary Wharf", city: "Portland", region: "OR", postal: "97209", country: "United States" }],
  rev: "20240517T120000Z",
})

// vCard 2.1 legacy contact (single).
CONTACTS.push({
  version: "2.1",
  fn: "Quincy Old",
  family: "Old", given: "Quincy",
  tels: [{ type: "VOICE;HOME", value: "+15555550801" }],
  emails: [{ type: "INTERNET", value: "quincy@example.com" }],
  rev: "20140822T120000Z",
})

// Stale-rev coworker, predates the threshold.
CONTACTS.push({
  version: "3.0",
  fn: "Briar Stoneham",
  family: "Stoneham", given: "Briar",
  org: "Long Take Sports",
  title: "Editor",
  tels: [{ type: "CELL", value: "+15555550901" }],
  emails: [{ type: "WORK", value: "briar.s@example.com" }],
  rev: "20180101T120000Z",
})

// Normalized-name duplicate cluster — different phone + email, just a
// duplicate created by entering the same person under "Calla R. Reyes"
// when the original was "Calla Reyes". Exercises the third dedup path.
CONTACTS.push({
  version: "3.0",
  fn: "Calla R. Reyes",
  family: "Reyes", given: "Calla", additional: "R.",
  org: "Solare Global",
  title: "Product Manager",
  tels: [{ type: "CELL", value: "+15555550942" }],
  emails: [{ type: "HOME", value: "calla.reyes@example.net" }],
  rev: "20220919T120000Z",
})

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

const blocks = CONTACTS.map(vcard)
// Real-world Apple/Google exports use CRLF between cards as well.
const out = blocks.join("\r\n") + "\r\n"
await fs.mkdir(path.dirname(OUT), { recursive: true })
await fs.writeFile(OUT, out, "utf8")
process.stderr.write(`Wrote ${OUT} (${CONTACTS.length} contacts, ${out.length} bytes)\n`)
