/**
 * vCard / Contacts parser.
 *
 * Reads `.vcf` exports (Apple Contacts, Google Contacts, iCloud,
 * Android, Outlook) and turns them into a `vcard-contacts`
 * ParsedFile shaped per prompts/sources/vcard-contacts.md. Handles vCard
 * 3.0 + 4.0, multi-card files, folded continuation lines, repeated
 * typed properties, and photo redaction (metadata only — never the
 * binary).
 *
 * Pre-aggregates organizations, email domains, cities, birthday
 * months, categories, duplicate clusters, and an address-book
 * health audit so the page can render hundreds of contacts without
 * recomputing on the client.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Parser, ParsedFile } from "../types.js"

// ---------------------------------------------------------------------------
// Public parser
// ---------------------------------------------------------------------------

interface Phone { value: string; type: string | null; masked: string }
interface Email { value: string; type: string | null; masked: string }
interface Address {
  type: string | null
  pob: string | null
  extended: string | null
  street: string | null
  city: string | null
  region: string | null
  postal: string | null
  country: string | null
  formatted: string
}
interface UrlEntry { value: string; type: string | null }

interface Contact {
  id: string
  fn: string
  familyName: string | null
  givenName: string | null
  additionalNames: string | null
  prefixes: string | null
  suffixes: string | null
  nickname: string | null
  org: string | null
  orgUnits: string[]
  title: string | null
  phones: Phone[]
  emails: Email[]
  addresses: Address[]
  urls: UrlEntry[]
  bday: string | null
  bdayMonth: number | null
  bdayDay: number | null
  categories: string[]
  note: string | null
  rev: string | null
  hasPhoto: boolean
  photoMime: string | null
  kind: "individual" | "group" | "org"
  uid: string | null
  legacy: boolean
  duplicateOfClusterId: string | null
  auditFlags: string[]
  vcardVersion: string
}

const PERSONAL_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
  "icloud.com", "me.com", "mac.com", "yahoo.com", "ymail.com", "rocketmail.com",
  "aol.com", "proton.me", "protonmail.com", "pm.me", "fastmail.com",
  "fastmail.fm", "zoho.com", "tutanota.com", "gmx.com", "gmx.de", "mail.com",
  "yandex.com", "yandex.ru", "qq.com", "163.com", "126.com", "sina.com",
])

export const parser: Parser = {
  name: "vcard",
  matches: [".vcf", ".vcard"],
  async detect(filepath: string): Promise<boolean> {
    try {
      const head = await readHead(filepath, 8192)
      if (!/BEGIN:VCARD/i.test(head)) return false
      if (!/^VERSION\s*:/im.test(head)) return false
      // Require at least one full record marker.
      if (!/END:VCARD/i.test(head)) return false
      return true
    } catch {
      return false
    }
  },
  async parse(filepath: string): Promise<ParsedFile> {
    const raw = await fs.readFile(filepath, "utf8")
    const meta: Record<string, unknown> & { sourceFile: string; sizeBytes: number } = {
      sourceFile: path.basename(filepath),
      sizeBytes: Buffer.byteLength(raw, "utf8"),
    }
    const cards = splitCards(raw)
    const rows: Contact[] = []
    let idx = 0
    for (const card of cards) {
      const c = parseCard(card, ++idx)
      if (c) rows.push(c)
    }
    return finalize(rows, meta)
  },
}

async function readHead(filepath: string, n: number): Promise<string> {
  const fd = await fs.open(filepath, "r")
  const buf = Buffer.alloc(n)
  const { bytesRead } = await fd.read(buf, 0, buf.length, 0)
  await fd.close()
  return buf.subarray(0, bytesRead).toString("utf8")
}

// ===========================================================================
// Multi-card splitting + line unfolding
// ===========================================================================

function splitCards(raw: string): string[] {
  // Strip BOM, normalize line endings.
  const clean = raw.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const cards: string[] = []
  // RFC 6350: BEGIN:VCARD ... END:VCARD. Case-insensitive.
  // Walk line-by-line so nested / malformed cases don't escape.
  const lines = clean.split("\n")
  let cur: string[] | null = null
  for (const line of lines) {
    if (/^BEGIN\s*:\s*VCARD\s*$/i.test(line)) {
      cur = [line]
    } else if (/^END\s*:\s*VCARD\s*$/i.test(line)) {
      if (cur) {
        cur.push(line)
        cards.push(cur.join("\n"))
        cur = null
      }
    } else if (cur) {
      cur.push(line)
    }
  }
  return cards
}

function unfold(card: string): string[] {
  // RFC 6350 §3.2: lines beginning with a single space or tab are
  // continuations. Concatenate with the previous logical line BEFORE
  // splitting on `:`.
  const raw = card.split("\n")
  const out: string[] = []
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

// ===========================================================================
// Property line tokenizer
// ===========================================================================

interface PropertyLine {
  name: string
  params: Record<string, string[]>
  value: string
  raw: string
}

function tokenizeLine(line: string): PropertyLine | null {
  if (!line || /^\s*$/.test(line)) return null
  // Find the first unquoted colon that splits property+params from value.
  // Property part may contain quoted strings (vCard 4.0) — handle the
  // common shapes: NAME[;param=value]*[;param="quoted,value"]*:VALUE
  let inQuote = false
  let colonIdx = -1
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') inQuote = !inQuote
    else if (ch === ":" && !inQuote) { colonIdx = i; break }
  }
  if (colonIdx < 0) return null
  const propPart = line.slice(0, colonIdx)
  const value = line.slice(colonIdx + 1)
  // Split params. The first segment is the property name (may include a
  // group prefix like `item1.TEL`).
  const segments = splitParams(propPart)
  if (!segments.length) return null
  let name = segments[0].toUpperCase()
  // Drop group prefix (everything before the first `.`).
  const dotIdx = name.indexOf(".")
  if (dotIdx > 0) name = name.slice(dotIdx + 1)
  const params: Record<string, string[]> = {}
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i]
    const eqIdx = seg.indexOf("=")
    let key: string
    let vals: string[]
    if (eqIdx < 0) {
      // Bare flag (vCard 2.1 / 3.0): `;HOME` / `;CELL`
      key = "TYPE"
      vals = [seg.toUpperCase()]
    } else {
      key = seg.slice(0, eqIdx).toUpperCase()
      const rawVal = seg.slice(eqIdx + 1)
      vals = parseParamValue(rawVal)
    }
    if (!params[key]) params[key] = []
    for (const v of vals) params[key].push(v)
  }
  return { name, params, value, raw: line }
}

function splitParams(s: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuote = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '"') {
      inQuote = !inQuote
      cur += ch
    } else if (ch === ";" && !inQuote) {
      out.push(cur)
      cur = ""
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

function parseParamValue(raw: string): string[] {
  // vCard 4.0: TYPE="cell,voice"  → ["cell", "voice"]
  // vCard 3.0: TYPE=CELL,VOICE     → ["cell", "voice"]
  let v = raw
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
  return v.split(",").map(s => s.trim()).filter(Boolean)
}

// vCard text-value escaping per RFC 6350 §3.4.
function unescapeValue(v: string): string {
  return v
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
}

// Structured (`;`-delimited) value split, respecting `\;` escapes.
function splitStructured(v: string): string[] {
  const out: string[] = []
  let cur = ""
  for (let i = 0; i < v.length; i++) {
    const ch = v[i]
    if (ch === "\\" && i + 1 < v.length) {
      // Pass through escaped char.
      cur += v[i] + v[i + 1]
      i++
    } else if (ch === ";") {
      out.push(unescapeValue(cur))
      cur = ""
    } else {
      cur += ch
    }
  }
  out.push(unescapeValue(cur))
  return out
}

// ===========================================================================
// Single-card parsing
// ===========================================================================

function parseCard(card: string, idx: number): Contact | null {
  const lines = unfold(card)
  const props: PropertyLine[] = []
  for (const line of lines) {
    const p = tokenizeLine(line)
    if (p) props.push(p)
  }
  if (!props.length) return null

  const get = (n: string) => props.find(p => p.name === n)
  const getAll = (n: string) => props.filter(p => p.name === n)

  // VERSION
  const version = (get("VERSION")?.value || "").trim() || "3.0"
  const isLegacy21 = version.startsWith("2.1") ||
    props.some(p => (p.params["ENCODING"] || []).some(v => /quoted-printable/i.test(v)))

  // KIND (4.0 only)
  const kindVal = (get("KIND")?.value || "").trim().toLowerCase()
  let kind: Contact["kind"] = "individual"
  if (kindVal === "group") kind = "group"
  else if (kindVal === "org" || kindVal === "organization") kind = "org"

  // FN — display name. Required by spec but we tolerate missing.
  const fnRaw = unescapeValue((get("FN")?.value || "").trim())
  // N — structured: family;given;additional;prefix;suffix
  const nProp = get("N")
  let familyName: string | null = null
  let givenName: string | null = null
  let additionalNames: string | null = null
  let prefixes: string | null = null
  let suffixes: string | null = null
  if (nProp) {
    const parts = splitStructured(nProp.value)
    familyName = parts[0]?.trim() || null
    givenName = parts[1]?.trim() || null
    additionalNames = parts[2]?.trim() || null
    prefixes = parts[3]?.trim() || null
    suffixes = parts[4]?.trim() || null
  }

  // FN fallback chain: FN → N (Given Family) → org → null.
  let fn = fnRaw
  if (!fn) {
    const composed = [givenName, familyName].filter(Boolean).join(" ").trim()
    fn = composed
  }

  // ORG — structured: org;unit1;unit2…
  const orgProp = get("ORG")
  let org: string | null = null
  let orgUnits: string[] = []
  if (orgProp) {
    const parts = splitStructured(orgProp.value).map(s => s.trim()).filter(Boolean)
    org = parts[0] || null
    orgUnits = parts.slice(1)
  }
  const title = unescapeValue((get("TITLE")?.value || "").trim()) || null
  const nickname = unescapeValue((get("NICKNAME")?.value || "").trim()) || null
  const note = unescapeValue((get("NOTE")?.value || "").trim()) || null
  const uid = (get("UID")?.value || "").trim() || null

  // TEL[*]
  const phones: Phone[] = []
  const seenPhone = new Set<string>()
  for (const p of getAll("TEL")) {
    const valueRaw = unescapeValue(p.value).trim()
    if (!valueRaw) continue
    const normalized = normalizePhone(valueRaw)
    const key = normalized || valueRaw.toLowerCase()
    if (seenPhone.has(key)) continue
    seenPhone.add(key)
    const type = pickType(p.params)
    phones.push({ value: valueRaw, type, masked: maskPhone(valueRaw) })
  }

  // EMAIL[*]
  const emails: Email[] = []
  const seenEmail = new Set<string>()
  for (const p of getAll("EMAIL")) {
    const valueRaw = unescapeValue(p.value).trim()
    if (!valueRaw) continue
    const norm = valueRaw.toLowerCase()
    if (seenEmail.has(norm)) continue
    seenEmail.add(norm)
    const type = pickType(p.params)
    emails.push({ value: valueRaw, type, masked: maskEmail(valueRaw) })
  }

  // ADR[*]
  const addresses: Address[] = []
  for (const p of getAll("ADR")) {
    const parts = splitStructured(p.value)
    if (!parts.some(s => s && s.trim())) continue
    const adr: Address = {
      type: pickType(p.params),
      pob: parts[0]?.trim() || null,
      extended: parts[1]?.trim() || null,
      street: parts[2]?.trim() || null,
      city: parts[3]?.trim() || null,
      region: parts[4]?.trim() || null,
      postal: parts[5]?.trim() || null,
      country: parts[6]?.trim() || null,
      formatted: "",
    }
    adr.formatted = [
      [adr.pob, adr.extended, adr.street].filter(Boolean).join(" "),
      [adr.city, adr.region, adr.postal].filter(Boolean).join(" "),
      adr.country,
    ].filter(s => s && s.trim()).join(", ")
    addresses.push(adr)
  }

  // URL[*]
  const urls: UrlEntry[] = []
  for (const p of getAll("URL")) {
    const v = unescapeValue(p.value).trim()
    if (!v) continue
    urls.push({ value: v, type: pickType(p.params) })
  }

  // BDAY — ISO date or "--MM-DD" partial (4.0).
  const bdayRaw = (get("BDAY")?.value || "").trim()
  const bday = parseBday(bdayRaw)
  let bdayMonth: number | null = null
  let bdayDay: number | null = null
  if (bday) {
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bday)
    const partialMatch = /^--(\d{2})-(\d{2})$/.exec(bday)
    if (isoMatch) {
      bdayMonth = parseInt(isoMatch[2], 10)
      bdayDay = parseInt(isoMatch[3], 10)
    } else if (partialMatch) {
      bdayMonth = parseInt(partialMatch[1], 10)
      bdayDay = parseInt(partialMatch[2], 10)
    }
  }

  // CATEGORIES — comma-separated (escaped commas allowed via \,).
  const categories: string[] = []
  for (const p of getAll("CATEGORIES")) {
    const list = splitCommaEscaped(p.value)
    for (const c of list) {
      const t = c.trim()
      if (t) categories.push(t)
    }
  }

  // REV — ISO timestamp; we keep just the date.
  const revRaw = (get("REV")?.value || "").trim()
  const rev = parseRev(revRaw)

  // PHOTO — record metadata only, never decode the binary.
  const photoProp = get("PHOTO")
  const hasPhoto = !!photoProp
  let photoMime: string | null = null
  if (photoProp) {
    // vCard 4.0 inline: PHOTO:data:image/jpeg;base64,...
    const m = /^data:([^;,]+)/i.exec(photoProp.value)
    if (m) photoMime = m[1].toLowerCase()
    else {
      // vCard 3.0 explicit: PHOTO;TYPE=JPEG;ENCODING=BASE64:...
      const t = (photoProp.params["TYPE"] || []).find(v => v && !/internet|home|work|cell/i.test(v))
      if (t) photoMime = `image/${t.toLowerCase()}`
    }
  }

  // Skip skeleton cards entirely (only VERSION + END).
  const meaningful =
    !!fn || !!org || phones.length > 0 || emails.length > 0 ||
    addresses.length > 0 || urls.length > 0 || hasPhoto || !!note ||
    !!nickname || !!bday
  if (!meaningful) return null

  return {
    id: `c_${String(idx).padStart(6, "0")}`,
    fn: fn || "",
    familyName,
    givenName,
    additionalNames,
    prefixes,
    suffixes,
    nickname,
    org,
    orgUnits,
    title,
    phones,
    emails,
    addresses,
    urls,
    bday,
    bdayMonth,
    bdayDay,
    categories,
    note,
    rev,
    hasPhoto,
    photoMime,
    kind,
    uid,
    legacy: isLegacy21,
    duplicateOfClusterId: null,
    auditFlags: [],
    vcardVersion: version,
  }
}

function pickType(params: Record<string, string[]>): string | null {
  const types = params["TYPE"]
  if (!types || !types.length) return null
  // Drop INTERNET (always present on vCard 3.0 EMAIL); keep first
  // remaining label.
  const filtered = types.filter(t => t.toUpperCase() !== "INTERNET" && t.toUpperCase() !== "PREF")
  const pick = (filtered[0] || types[0] || "").trim().toUpperCase()
  return pick || null
}

function normalizePhone(v: string): string {
  return v.replace(/[^0-9+]/g, "")
}

function maskPhone(v: string): string {
  // Keep + (if present) and last 2 digits; bullet the middle while
  // preserving country code / area code spacing for readability.
  const digitsOnly = v.replace(/\D/g, "")
  if (digitsOnly.length < 4) return "•".repeat(Math.max(1, digitsOnly.length))
  // Render: keep first 3 digits (country + area or first chunk),
  // then bullets, then last 2.
  const head = digitsOnly.slice(0, Math.min(3, digitsOnly.length - 2))
  const tail = digitsOnly.slice(-2)
  const middle = "•".repeat(Math.max(3, digitsOnly.length - head.length - tail.length))
  // Restore a leading + only if original had it.
  const plus = v.trim().startsWith("+") ? "+" : ""
  if (plus && head.length >= 3) {
    return `${plus}${head.slice(0, 1)} (${head.slice(1)}) ${middle} ${tail}`
  }
  if (head.length >= 3) {
    return `(${head}) ${middle} ${tail}`
  }
  return `${head}${middle}${tail}`
}

function maskEmail(v: string): string {
  const at = v.lastIndexOf("@")
  if (at < 1) return "•".repeat(v.length)
  const local = v.slice(0, at)
  const domain = v.slice(at + 1)
  if (local.length <= 2) {
    return local[0] + "•".repeat(Math.max(1, local.length - 1)) + "@" + domain
  }
  return `${local[0]}${"•".repeat(Math.min(4, local.length - 2))}${local[local.length - 1]}@${domain}`
}

function parseBday(v: string): string | null {
  if (!v) return null
  // ISO: 1991-06-12
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  // Compact: 19910612
  m = /^(\d{4})(\d{2})(\d{2})/.exec(v)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  // Partial 4.0: --06-12  or --0612
  m = /^--(\d{2})-?(\d{2})/.exec(v)
  if (m) return `--${m[1]}-${m[2]}`
  return null
}

function parseRev(v: string): string | null {
  if (!v) return null
  // 20230615T142322Z  or  2023-06-15T14:23:22Z
  let m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(v)
  if (m) {
    const y = parseInt(m[1], 10)
    if (y < 1990 || y > 2100) return null
    return `${m[1]}-${m[2]}-${m[3]}`
  }
  return null
}

function splitCommaEscaped(v: string): string[] {
  const out: string[] = []
  let cur = ""
  for (let i = 0; i < v.length; i++) {
    const ch = v[i]
    if (ch === "\\" && i + 1 < v.length) {
      cur += v[i] + v[i + 1]
      i++
    } else if (ch === ",") {
      out.push(unescapeValue(cur))
      cur = ""
    } else {
      cur += ch
    }
  }
  out.push(unescapeValue(cur))
  return out
}

// ===========================================================================
// Aggregation
// ===========================================================================

interface OrgAgg { name: string; count: number; sampleIds: string[] }
interface DomainAgg { domain: string; count: number; kind: "work" | "personal"; sampleIds: string[] }
interface CityAgg { city: string; count: number; sampleIds: string[] }
interface MonthAgg { month: number; count: number }
interface CategoryAgg { name: string; count: number; sampleIds: string[] }
interface DuplicateCluster {
  id: string
  reason: "shared-phone" | "shared-email" | "normalized-name"
  key: string
  contactIds: string[]
  candidateNames: string[]
}

interface AuditBlock {
  missingPhone: { count: number; sampleIds: string[] }
  missingEmail: { count: number; sampleIds: string[] }
  missingBoth: { count: number; sampleIds: string[] }
  malformedEmail: { count: number; samples: Array<{ id: string; value: string }> }
  staleRev: { count: number; threshold: string; sampleIds: string[] }
  repeatedPhone: Array<{ value: string; count: number; contactIds: string[] }>
  repeatedEmail: Array<{ value: string; count: number; contactIds: string[] }>
  noteOnly: { count: number; sampleIds: string[] }
  nameless: { count: number; sampleIds: string[] }
  legacy21: { count: number; sampleIds: string[] }
}

interface VCardSummary {
  contactCount: number
  individualCount: number
  groupCount: number
  withPhone: number
  withEmail: number
  withAddress: number
  withBirthday: number
  withPhoto: number
  withCategories: number
  distinctOrgs: number
  distinctEmailDomains: number
  distinctCities: number
  distinctCountries: number
  duplicateClusterCount: number
  revWindow: string
  revDurationLabel: string
  topOrganization: string | null
  topOrganizationShare: number
  topCity: string | null
  topCityShare: number
}

const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/

function finalize(rows: Contact[], meta: Record<string, unknown> & { sourceFile: string; sizeBytes: number }): ParsedFile {
  const organizations = buildOrganizations(rows)
  const emailDomains = buildEmailDomains(rows)
  const cities = buildCities(rows)
  const birthdayMonths = buildBirthdayMonths(rows)
  const categories = buildCategories(rows)
  const duplicateClusters = buildDuplicates(rows)
  const audit = buildAudit(rows)
  const summary = buildSummary(rows, organizations, emailDomains, cities, duplicateClusters)
  const versionDistribution = buildVersionDistribution(rows)

  meta.format = "vcard-contacts"
  meta.kind = "vcard-contacts"
  meta.sourceFormat = "vcf"
  meta.encoding = "utf-8"
  meta.contactCount = rows.length
  meta.versionDistribution = versionDistribution

  const summaryLine =
    `${rows.length} contact${rows.length === 1 ? "" : "s"} ` +
    `(${summary.withPhone} with phone · ${summary.withEmail} with email · ` +
    `${summary.withAddress} with address; ` +
    `${summary.distinctOrgs} orgs, ${summary.distinctEmailDomains} email domains, ` +
    `${summary.duplicateClusterCount} duplicate clusters).`

  return {
    contentType: "vcard-contacts",
    summary: summaryLine,
    sample: buildSample(rows, organizations, emailDomains, cities, birthdayMonths, categories, duplicateClusters, audit, summary),
    data: {
      kind: "vcard-contacts",
      format: "vcard-contacts",
      version: pickPredominantVersion(versionDistribution),
      rows,
      organizations,
      emailDomains,
      cities,
      birthdayMonths,
      categories,
      duplicateClusters,
      audit,
      summary,
      meta: { ...meta },
    },
    meta,
  }
}

function pickPredominantVersion(dist: Record<string, number>): string {
  const entries = Object.entries(dist)
  if (!entries.length) return "3.0"
  if (entries.length === 1) return entries[0][0]
  entries.sort((a, b) => b[1] - a[1])
  return entries.length > 1 && entries[1][1] > 0 ? "mixed" : entries[0][0]
}

function buildVersionDistribution(rows: Contact[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) {
    out[r.vcardVersion] = (out[r.vcardVersion] || 0) + 1
  }
  return out
}

function buildOrganizations(rows: Contact[]): OrgAgg[] {
  const map = new Map<string, OrgAgg>()
  for (const r of rows) {
    if (!r.org) continue
    const key = r.org.trim()
    if (!key) continue
    const cur = map.get(key) || { name: key, count: 0, sampleIds: [] }
    cur.count += 1
    if (cur.sampleIds.length < 6) cur.sampleIds.push(r.id)
    map.set(key, cur)
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count)
}

function buildEmailDomains(rows: Contact[]): DomainAgg[] {
  const map = new Map<string, DomainAgg>()
  for (const r of rows) {
    const seenForRow = new Set<string>()
    for (const e of r.emails) {
      const at = e.value.lastIndexOf("@")
      if (at < 0) continue
      const domain = e.value.slice(at + 1).toLowerCase()
      if (!domain) continue
      if (seenForRow.has(domain)) continue
      seenForRow.add(domain)
      const isPersonal = PERSONAL_MAIL_DOMAINS.has(domain)
      const cur = map.get(domain) || {
        domain, count: 0, kind: isPersonal ? "personal" : "work", sampleIds: [],
      }
      cur.count += 1
      if (cur.sampleIds.length < 6) cur.sampleIds.push(r.id)
      map.set(domain, cur)
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count)
}

function buildCities(rows: Contact[]): CityAgg[] {
  const map = new Map<string, CityAgg>()
  for (const r of rows) {
    const seenForRow = new Set<string>()
    for (const a of r.addresses) {
      if (!a.city) continue
      const label = a.region ? `${a.city}, ${a.region}` : a.city
      if (seenForRow.has(label)) continue
      seenForRow.add(label)
      const cur = map.get(label) || { city: label, count: 0, sampleIds: [] }
      cur.count += 1
      if (cur.sampleIds.length < 6) cur.sampleIds.push(r.id)
      map.set(label, cur)
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count)
}

function buildBirthdayMonths(rows: Contact[]): MonthAgg[] {
  const out: MonthAgg[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, count: 0 }))
  for (const r of rows) {
    if (r.bdayMonth && r.bdayMonth >= 1 && r.bdayMonth <= 12) {
      out[r.bdayMonth - 1].count += 1
    }
  }
  return out
}

function buildCategories(rows: Contact[]): CategoryAgg[] {
  const map = new Map<string, CategoryAgg>()
  for (const r of rows) {
    const seen = new Set<string>()
    for (const c of r.categories) {
      const key = c.trim()
      if (!key || seen.has(key.toLowerCase())) continue
      seen.add(key.toLowerCase())
      const cur = map.get(key) || { name: key, count: 0, sampleIds: [] }
      cur.count += 1
      if (cur.sampleIds.length < 6) cur.sampleIds.push(r.id)
      map.set(key, cur)
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count)
}

function normalizedName(r: Contact): string {
  const base = (r.fn || [r.givenName, r.familyName].filter(Boolean).join(" ")).trim()
  if (!base) return ""
  return base
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/\b(dr|mr|mrs|ms|prof|hon|sir|madam)\.?\s+/g, "")
    .replace(/\b[a-z]\.\s*/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function buildDuplicates(rows: Contact[]): DuplicateCluster[] {
  const clusters: DuplicateCluster[] = []
  const usedRowIds = new Map<string, string>()  // contact id → cluster id

  // 1) Shared phone number — strongest signal.
  const phoneMap = new Map<string, string[]>()
  for (const r of rows) {
    for (const p of r.phones) {
      const norm = normalizePhone(p.value)
      if (norm.length < 7) continue  // ignore extension-only numbers
      const arr = phoneMap.get(norm) || []
      if (!arr.includes(r.id)) arr.push(r.id)
      phoneMap.set(norm, arr)
    }
  }
  let dupIdx = 0
  for (const [phone, ids] of phoneMap) {
    if (ids.length < 2) continue
    const id = `dup_${String(++dupIdx).padStart(3, "0")}`
    clusters.push({
      id,
      reason: "shared-phone",
      key: phone,
      contactIds: ids.slice(),
      candidateNames: ids.map(i => labelFor(rows, i)).slice(0, 6),
    })
    for (const i of ids) usedRowIds.set(i, id)
  }

  // 2) Shared email.
  const emailMap = new Map<string, string[]>()
  for (const r of rows) {
    for (const e of r.emails) {
      const norm = e.value.toLowerCase().trim()
      if (!norm) continue
      const arr = emailMap.get(norm) || []
      if (!arr.includes(r.id)) arr.push(r.id)
      emailMap.set(norm, arr)
    }
  }
  for (const [email, ids] of emailMap) {
    if (ids.length < 2) continue
    // Skip if every id is already in the same phone cluster.
    const allInCluster = ids.every(i => usedRowIds.has(i)) &&
      new Set(ids.map(i => usedRowIds.get(i))).size === 1
    if (allInCluster) continue
    const id = `dup_${String(++dupIdx).padStart(3, "0")}`
    clusters.push({
      id,
      reason: "shared-email",
      key: email,
      contactIds: ids.slice(),
      candidateNames: ids.map(i => labelFor(rows, i)).slice(0, 6),
    })
    for (const i of ids) {
      if (!usedRowIds.has(i)) usedRowIds.set(i, id)
    }
  }

  // 3) Normalized name match — only for contacts not already clustered.
  const nameMap = new Map<string, string[]>()
  for (const r of rows) {
    const norm = normalizedName(r)
    if (!norm || norm.split(" ").length < 2) continue  // single-token names too noisy
    const arr = nameMap.get(norm) || []
    arr.push(r.id)
    nameMap.set(norm, arr)
  }
  for (const [name, ids] of nameMap) {
    if (ids.length < 2) continue
    const fresh = ids.filter(i => !usedRowIds.has(i))
    if (fresh.length < 2) continue
    const id = `dup_${String(++dupIdx).padStart(3, "0")}`
    clusters.push({
      id,
      reason: "normalized-name",
      key: name,
      contactIds: fresh.slice(),
      candidateNames: fresh.map(i => labelFor(rows, i)).slice(0, 6),
    })
    for (const i of fresh) usedRowIds.set(i, id)
  }

  // Stamp the cluster id back onto the rows.
  for (const c of clusters) {
    for (const cid of c.contactIds) {
      const row = rows.find(r => r.id === cid)
      if (row && !row.duplicateOfClusterId) row.duplicateOfClusterId = c.id
    }
  }

  return clusters.sort((a, b) => b.contactIds.length - a.contactIds.length)
}

function labelFor(rows: Contact[], id: string): string {
  const r = rows.find(x => x.id === id)
  if (!r) return id
  return r.fn || [r.givenName, r.familyName].filter(Boolean).join(" ") || "(no name)"
}

function buildAudit(rows: Contact[]): AuditBlock {
  const missingPhoneIds: string[] = []
  const missingEmailIds: string[] = []
  const missingBothIds: string[] = []
  const malformedSamples: Array<{ id: string; value: string }> = []
  const noteOnlyIds: string[] = []
  const namelessIds: string[] = []
  const legacyIds: string[] = []
  let malformedTotal = 0
  let noteOnlyTotal = 0
  let namelessTotal = 0

  for (const r of rows) {
    if (!r.phones.length) {
      if (missingPhoneIds.length < 6) missingPhoneIds.push(r.id)
      r.auditFlags.push("missing-phone")
    }
    if (!r.emails.length) {
      if (missingEmailIds.length < 6) missingEmailIds.push(r.id)
      r.auditFlags.push("missing-email")
    }
    if (!r.phones.length && !r.emails.length) {
      if (missingBothIds.length < 6) missingBothIds.push(r.id)
      r.auditFlags.push("missing-both")
    }
    for (const e of r.emails) {
      if (!EMAIL_RE.test(e.value)) {
        malformedTotal += 1
        if (malformedSamples.length < 6) malformedSamples.push({ id: r.id, value: e.value })
        if (!r.auditFlags.includes("malformed-email")) r.auditFlags.push("malformed-email")
      }
    }
    const fields = [
      r.phones.length, r.emails.length, r.addresses.length,
      r.urls.length, r.bday ? 1 : 0, r.title ? 1 : 0, r.org ? 1 : 0,
    ]
    const populated = fields.filter(n => n > 0).length
    if (r.note && populated === 0) {
      noteOnlyTotal += 1
      if (noteOnlyIds.length < 6) noteOnlyIds.push(r.id)
      r.auditFlags.push("note-only")
    }
    if (!r.fn || !r.fn.trim()) {
      namelessTotal += 1
      if (namelessIds.length < 6) namelessIds.push(r.id)
      r.auditFlags.push("nameless")
    }
    if (r.legacy) {
      if (legacyIds.length < 6) legacyIds.push(r.id)
      r.auditFlags.push("legacy-vcard")
    }
  }

  // Stale REV — strictly older than 5 years from the most recent REV in the
  // file (or "now" inferred as the max REV). Heuristic.
  const allRevs = rows.map(r => r.rev).filter((r): r is string => !!r).sort()
  let threshold = ""
  let staleCount = 0
  const staleSampleIds: string[] = []
  if (allRevs.length) {
    const maxRev = allRevs[allRevs.length - 1]
    const [maxY, maxM, maxD] = maxRev.split("-").map(n => parseInt(n, 10))
    const thresholdY = maxY - 5
    threshold = `${thresholdY}-${pad(maxM)}-${pad(maxD)}`
    for (const r of rows) {
      if (!r.rev) continue
      if (r.rev < threshold) {
        staleCount += 1
        if (staleSampleIds.length < 6) staleSampleIds.push(r.id)
        if (!r.auditFlags.includes("stale-rev")) r.auditFlags.push("stale-rev")
      }
    }
  }

  // Repeated phones / emails (top 5 each).
  const phoneCounts = new Map<string, { value: string; count: number; contactIds: string[] }>()
  for (const r of rows) {
    const seen = new Set<string>()
    for (const p of r.phones) {
      const norm = normalizePhone(p.value)
      if (norm.length < 7) continue
      if (seen.has(norm)) continue
      seen.add(norm)
      const cur = phoneCounts.get(norm) || { value: p.value, count: 0, contactIds: [] }
      cur.count += 1
      if (!cur.contactIds.includes(r.id)) cur.contactIds.push(r.id)
      phoneCounts.set(norm, cur)
    }
  }
  const repeatedPhone = Array.from(phoneCounts.values())
    .filter(p => p.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const emailCounts = new Map<string, { value: string; count: number; contactIds: string[] }>()
  for (const r of rows) {
    const seen = new Set<string>()
    for (const e of r.emails) {
      const norm = e.value.toLowerCase()
      if (seen.has(norm)) continue
      seen.add(norm)
      const cur = emailCounts.get(norm) || { value: e.value, count: 0, contactIds: [] }
      cur.count += 1
      if (!cur.contactIds.includes(r.id)) cur.contactIds.push(r.id)
      emailCounts.set(norm, cur)
    }
  }
  const repeatedEmail = Array.from(emailCounts.values())
    .filter(p => p.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return {
    missingPhone: { count: rows.filter(r => !r.phones.length).length, sampleIds: missingPhoneIds },
    missingEmail: { count: rows.filter(r => !r.emails.length).length, sampleIds: missingEmailIds },
    missingBoth: {
      count: rows.filter(r => !r.phones.length && !r.emails.length).length,
      sampleIds: missingBothIds,
    },
    malformedEmail: { count: malformedTotal, samples: malformedSamples },
    staleRev: { count: staleCount, threshold, sampleIds: staleSampleIds },
    repeatedPhone,
    repeatedEmail,
    noteOnly: { count: noteOnlyTotal, sampleIds: noteOnlyIds },
    nameless: { count: namelessTotal, sampleIds: namelessIds },
    legacy21: { count: rows.filter(r => r.legacy).length, sampleIds: legacyIds },
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

function buildSummary(rows: Contact[], orgs: OrgAgg[], domains: DomainAgg[], cities: CityAgg[], dupClusters: DuplicateCluster[]): VCardSummary {
  const total = rows.length || 1
  const withPhone = rows.filter(r => r.phones.length > 0).length
  const withEmail = rows.filter(r => r.emails.length > 0).length
  const withAddress = rows.filter(r => r.addresses.length > 0).length
  const withBirthday = rows.filter(r => r.bday).length
  const withPhoto = rows.filter(r => r.hasPhoto).length
  const withCategories = rows.filter(r => r.categories.length > 0).length
  const distinctOrgs = orgs.length
  const distinctEmailDomains = domains.length
  const distinctCities = cities.length
  const countries = new Set<string>()
  for (const r of rows) for (const a of r.addresses) if (a.country) countries.add(a.country)
  const distinctCountries = countries.size
  const dates = rows.map(r => r.rev).filter((d): d is string => !!d).sort()
  const revWindow = dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : "no revision metadata"
  const revDurationLabel = dates.length ? describeDuration(dates[0], dates[dates.length - 1]) : "—"
  const topOrg = orgs[0] || null
  const topCity = cities[0] || null
  const individualCount = rows.filter(r => r.kind === "individual").length
  const groupCount = rows.filter(r => r.kind === "group").length
  return {
    contactCount: rows.length,
    individualCount,
    groupCount,
    withPhone,
    withEmail,
    withAddress,
    withBirthday,
    withPhoto,
    withCategories,
    distinctOrgs,
    distinctEmailDomains,
    distinctCities,
    distinctCountries,
    duplicateClusterCount: dupClusters.length,
    revWindow,
    revDurationLabel,
    topOrganization: topOrg?.name ?? null,
    topOrganizationShare: topOrg ? topOrg.count / total : 0,
    topCity: topCity?.city ?? null,
    topCityShare: topCity ? topCity.count / total : 0,
  }
}

function describeDuration(a: string, b: string): string {
  const start = new Date(a)
  const end = new Date(b)
  const totalMonths = Math.max(0, (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth()))
  if (totalMonths < 1) return "less than a month"
  if (totalMonths < 12) return `${totalMonths} month${totalMonths === 1 ? "" : "s"}`
  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  if (months === 0) return `${years} year${years === 1 ? "" : "s"}`
  return `${years} year${years === 1 ? "" : "s"} ${months} month${months === 1 ? "" : "s"}`
}

function buildSample(
  rows: Contact[],
  orgs: OrgAgg[],
  domains: DomainAgg[],
  cities: CityAgg[],
  birthdayMonths: MonthAgg[],
  categories: CategoryAgg[],
  duplicateClusters: DuplicateCluster[],
  audit: AuditBlock,
  summary: VCardSummary,
): Record<string, unknown> {
  const head = rows.slice(0, 12).map(stripBigFields)
  const tail = rows.length > 18 ? rows.slice(-4).map(stripBigFields) : []
  return {
    summary,
    sampleContacts: [...head, ...tail],
    organizations: orgs.slice(0, 12),
    emailDomains: domains.slice(0, 12),
    cities: cities.slice(0, 12),
    birthdayMonths,
    categories: categories.slice(0, 10),
    duplicateClusters: duplicateClusters.slice(0, 6),
    audit,
  }
}

function stripBigFields(c: Contact): Partial<Contact> {
  // Trim long notes from sample only; the inlined data keeps everything.
  const note = c.note && c.note.length > 200 ? c.note.slice(0, 200) + "…" : c.note
  return { ...c, note }
}
