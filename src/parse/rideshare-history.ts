/**
 * Rideshare-history parser — Uber and Lyft personal data exports.
 *
 * Years of rides become a private mobility + spending atlas: total
 * miles in cars, late-night patterns, airport runs, commute loops,
 * tips and surge outliers, money split by product type, top
 * pickup / dropoff labels, and an offline SVG scatter of
 * coordinates when present.
 *
 * Detection sniffs the CSV header for the source-specific signature.
 *   - Uber:  "Trip or Order Status" + "Begin Trip Time" + "Distance"
 *            (canonical Uber DSAR `trips_data.csv` shape).
 *   - Lyft:  "Pickup Address" / "Drop-off Address" + "Cost" / "Total"
 *            with "Ride ID" or "Lyft" in the header.
 *
 * Output `contentType` is `rideshare-history` so htmlize loads
 * `prompts/sources/rideshare-history.md`. This parser deliberately does not
 * join the `_finance.md` family — rideshare is about *time + place +
 * habit*, not cashflow categories.
 *
 * Privacy: every example shipped with this repo is fully synthetic.
 * The parser never fetches anything; coordinates stay floats but the
 * renderer masks them by default and never calls a geocoder or map
 * tile service.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Parser, ParsedFile } from "../types.js"

export type RideshareSource = "uber" | "lyft"

export interface Ride {
  id: string
  source: RideshareSource
  date: string                       // YYYY-MM-DD (UTC slice of the request timestamp)
  dateEpoch: number
  hour: number                       // 0-23, derived from request timestamp
  weekday: number                    // 0-6, 0 = Sunday
  productType: string                // UberX, Uber Pool, Lyft, Lyft Lux, etc.
  status: string                     // completed, cancelled, refunded, ...
  pickupLabel: string | null
  dropoffLabel: string | null
  pickupLat: number | null
  pickupLng: number | null
  dropoffLat: number | null
  dropoffLng: number | null
  distanceMiles: number              // 0 for cancellations
  durationMin: number                // 0 when missing
  fare: number                       // base fare amount the user paid (>= 0)
  tip: number
  fee: number                        // surcharges, taxes, booking fees aggregated
  total: number                      // overall amount the user paid (fare + tip + fee, signed positive; refunds negative)
  currency: string
  city: string | null
  flags: string[]                    // late-night / airport-run / commute-loop / cancellation / refund / expensive-outlier / long-trip
  raw: Record<string, string>
}

interface RideshareSummary {
  rowCount: number
  rideCount: number                  // completed rides
  cancelledCount: number
  refundCount: number
  totalSpend: number                 // sum(total) across non-refund rows
  refundTotal: number                // absolute value of refunds
  totalMiles: number
  totalHours: number                 // sum(durationMin)/60
  avgFare: number
  avgMiles: number
  avgDurationMin: number
  distinctCities: number
  distinctProducts: number
  busiestCity: string
  busiestMonth: string
  busiestWeekday: string
  topPickup: string
  topDropoff: string
  topProduct: string
  lateNightShare: number             // % of rides with hour in [22, 4)
  weekendShare: number               // % of rides on Sat/Sun
  airportShare: number               // % of rides flagged airport-run
  period: string
  durationLabel: string
  monthsActive: number
  currencyCode: string
  currencySymbol: string
  source: RideshareSource
}

interface MonthlyBucket {
  month: string                      // YYYY-MM
  count: number
  spend: number
  miles: number
  hours: number
}

interface YearlyBucket {
  year: string
  count: number
  spend: number
  miles: number
  hours: number
}

interface HeatmapCell {
  weekday: number
  hour: number
  count: number
}

interface PlaceBucket {
  label: string
  count: number
  spend: number
}

interface CityBucket {
  city: string
  count: number
  spend: number
}

interface ProductBucket {
  product: string
  count: number
  spend: number
  miles: number
}

interface DistanceBucket {
  label: string
  count: number
  share: number
}

interface MoneyBreakdown {
  fare: number
  tip: number
  fee: number
  refund: number                     // absolute
  total: number
  byProduct: ProductBucket[]
}

interface RideshareFlag {
  kind: "cancelled" | "refund" | "expensive-outlier" | "long-trip"
      | "late-night-cluster" | "airport-run" | "commute-loop" | "no-fare"
  label: string
  detail: string
  rowIds: string[]
}

interface GeoPoint {
  x: number                          // viewBox-projected
  y: number
  kind: "pickup" | "dropoff"
  count: number
  label: string | null
}

interface GeoLayer {
  hasCoordinates: boolean
  pointCount: number
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null
  viewBox: { width: number; height: number }
  points: GeoPoint[]                 // capped sample of unique-ish points for SVG
}

const AIRPORT_HINTS = /\b(SFO|LAX|JFK|LGA|EWR|ORD|MDW|ATL|MIA|FLL|BOS|SEA|PDX|DEN|DFW|IAH|HOU|PHX|AUS|MSP|MCO|TPA|SAN|SJC|OAK|YYZ|YUL|YVR|LHR|LGW|STN|CDG|ORY|FRA|MUC|AMS|MAD|BCN|FCO|HND|NRT|KIX|ICN|GMP|HKG|SIN|SYD|MEL|DXB|DOH|BOM|DEL|airport|terminal|airfield|departures|arrivals)\b/i
const LATE_NIGHT_HOURS = new Set<number>([22, 23, 0, 1, 2, 3])

export const parser: Parser = {
  name: "rideshare-history",
  matches: [".csv", ".json"],
  async detect(filepath: string): Promise<boolean> {
    const ext = path.extname(filepath).toLowerCase()
    const base = path.basename(filepath).toLowerCase()
    try {
      const head = await readHead(filepath, 16384)
      if (ext === ".csv") {
        if (looksLikeUberCsv(head, base)) return true
        if (looksLikeLyftCsv(head, base)) return true
        return false
      }
      if (ext === ".json") {
        return looksLikeLyftJson(head, base) || looksLikeUberJson(head, base)
      }
    } catch { /* fall through */ }
    return false
  },
  async parse(filepath: string): Promise<ParsedFile> {
    const ext = path.extname(filepath).toLowerCase()
    const base = path.basename(filepath).toLowerCase()
    const raw = await fs.readFile(filepath, "utf8")
    const sizeBytes = Buffer.byteLength(raw, "utf8")
    const meta0 = {
      sourceFile: path.basename(filepath),
      sizeBytes,
    }

    let rides: Ride[] = []
    let source: RideshareSource = "uber"
    if (ext === ".json") {
      if (looksLikeLyftJson(raw.slice(0, 16384), base)) { source = "lyft"; rides = parseLyftJson(raw) }
      else { source = "uber"; rides = parseUberJson(raw) }
    } else {
      const head = raw.slice(0, 16384)
      if (looksLikeLyftCsv(head, base)) { source = "lyft"; rides = parseLyftCsv(raw) }
      else { source = "uber"; rides = parseUberCsv(raw) }
    }
    rides.sort((a, b) => a.dateEpoch - b.dateEpoch || a.id.localeCompare(b.id))

    const summary = aggregateSummary(rides, source)
    const monthly = aggregateMonthly(rides)
    const yearly = aggregateYearly(rides)
    const heatmap = aggregateHeatmap(rides)
    const cities = aggregateCities(rides)
    const pickups = aggregatePlaces(rides, "pickup")
    const dropoffs = aggregatePlaces(rides, "dropoff")
    const products = aggregateProducts(rides)
    const distanceBuckets = aggregateDistanceBuckets(rides)
    const money = aggregateMoney(rides, products)
    const geo = projectGeo(rides)

    // Per-row flags get tagged before we run the global-flag detector so the
    // detector can read .flags as a soft signal.
    for (const r of rides) tagRideFlags(r)
    const flags = detectFlags(rides)
    for (const f of flags) {
      for (const id of f.rowIds) {
        const r = rides.find(x => x.id === id)
        if (!r) continue
        const tag = f.kind
        if (!r.flags.includes(tag)) r.flags.push(tag)
      }
    }

    const meta = {
      ...meta0,
      shape: "rideshare-history",
      source,
      rowCount: rides.length,
      rideCount: summary.rideCount,
      cancelledCount: summary.cancelledCount,
      currencyCode: summary.currencyCode,
      currencySymbol: summary.currencySymbol,
      period: summary.period,
      durationLabel: summary.durationLabel,
      totalSpend: summary.totalSpend,
      totalMiles: summary.totalMiles,
      distinctCities: summary.distinctCities,
      hasCoordinates: geo.hasCoordinates,
    }

    const sample = {
      ...meta,
      summary,
      monthlyPreview: monthly.slice(0, 16),
      yearly,
      citiesTop: cities.slice(0, 6),
      pickupsTop: pickups.slice(0, 8),
      dropoffsTop: dropoffs.slice(0, 8),
      productsTop: products.slice(0, 6),
      distanceBuckets,
      money: { ...money, byProduct: money.byProduct.slice(0, 6) },
      flagsTop: flags.slice(0, 8),
      heatmapPreview: heatmap.filter(c => c.count > 0).slice(0, 24),
      geoPreview: geo.hasCoordinates ? { ...geo, points: geo.points.slice(0, 12) } : geo,
      firstRows: rides.slice(0, 6).map(stripBigRow),
      lastRows: rides.slice(-3).map(stripBigRow),
    }

    return {
      contentType: "rideshare-history",
      summary: buildSummaryLine(summary),
      sample,
      data: {
        format: "rideshare-history",
        source,
        rows: rides,
        summary,
        monthly,
        yearly,
        heatmap,
        cities,
        pickupPlaces: pickups,
        dropoffPlaces: dropoffs,
        productTypes: products,
        distanceBuckets,
        money,
        flags,
        geo,
        meta,
      },
      meta,
    }
  },
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

function looksLikeUberCsv(head: string, base: string): boolean {
  const lower = head.toLowerCase()
  if (/uber|trips_data|driver_lifetime_trips|trips\.csv/i.test(base)) {
    if (/begin trip time|trip or order status|fare amount|product type/i.test(lower)) return true
  }
  // Header signature: Uber's canonical DSAR trips_data.csv has these columns.
  if (/begin trip time/i.test(lower) && /(fare amount|fare amount \(usd\))/i.test(lower)) return true
  if (/trip or order status/i.test(lower) && /product type/i.test(lower)) return true
  return false
}

function looksLikeLyftCsv(head: string, base: string): boolean {
  const lower = head.toLowerCase()
  if (/lyft/i.test(base) && /(pickup|drop[-\s]?off|ride id|cost|total)/i.test(lower)) return true
  // Lyft's per-ride CSV typically pairs pickup_location + dropoff_location.
  const hasPickup = /(pickup\s*address|pickup\s*location|pickup_address|pickup_location)/i.test(lower)
  const hasDrop = /(drop[-\s]?off\s*address|drop[-\s]?off\s*location|dropoff_address|dropoff_location)/i.test(lower)
  const hasCost = /(cost|total amount|amount|charged|ride_cost)/i.test(lower)
  if (hasPickup && hasDrop && hasCost) return true
  if (/^.*ride id.*pickup.*drop[-\s]?off/i.test(head.split(/\r?\n/, 1)[0] || "")) return true
  return false
}

function looksLikeUberJson(head: string, base: string): boolean {
  if (/uber/i.test(base) && /trip|fare|product type|begin trip/i.test(head)) return true
  if (/"begin_trip_time"|"product_type"|"fare_amount"/i.test(head)) return true
  return false
}

function looksLikeLyftJson(head: string, base: string): boolean {
  if (/lyft/i.test(base)) return true
  if (/"ride_type"|"pickup_address"|"dropoff_address"|"lyft"/i.test(head)) return true
  return false
}

// ---------------------------------------------------------------------------
// CSV plumbing (a small RFC-4180-ish parser, lifted from social-payments)
// ---------------------------------------------------------------------------

async function readHead(filepath: string, n: number): Promise<string> {
  const fh = await fs.open(filepath, "r")
  try {
    const buf = Buffer.alloc(n)
    const { bytesRead } = await fh.read(buf, 0, n, 0)
    return buf.slice(0, bytesRead).toString("utf8")
  } finally {
    await fh.close()
  }
}

function parseCsv(raw: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let i = 0
  let inQuotes = false
  while (i < raw.length) {
    const ch = raw[i]
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++
      } else { field += ch; i++ }
    } else {
      if (ch === '"') { inQuotes = true; i++; continue }
      if (ch === ",") { row.push(field); field = ""; i++; continue }
      if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue }
      if (ch === "\r") { i++; continue }
      field += ch; i++
    }
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

function findHeaderRow(rows: string[][], required: RegExp[]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const line = rows[i].map(c => (c || "").trim().toLowerCase())
    if (required.every(re => line.some(c => re.test(c)))) return i
  }
  return -1
}

function buildIndexer(headers: string[]): (...names: string[]) => number {
  const lower = headers.map(h => (h || "").trim().toLowerCase())
  return (...names: string[]) => {
    for (const n of names) {
      const target = n.toLowerCase()
      const exact = lower.indexOf(target)
      if (exact >= 0) return exact
      const partial = lower.findIndex(h => h === target || h.replace(/\s+/g, "") === target.replace(/\s+/g, ""))
      if (partial >= 0) return partial
    }
    return -1
  }
}

function get(r: string[], idx: number): string {
  return idx >= 0 ? (r[idx] || "").trim() : ""
}

// ---------------------------------------------------------------------------
// Uber CSV
// ---------------------------------------------------------------------------

function parseUberCsv(raw: string): Ride[] {
  const rows = parseCsv(raw)
  const headerIdx = findHeaderRow(rows, [/begin trip time/, /(fare amount|fare amount \(usd\))/])
  if (headerIdx < 0) return []
  const headers = rows[headerIdx]
  const cx = buildIndexer(headers)
  const colTripId = cx("trip id", "trip or order id", "order id")
  const colRequest = cx("request time (utc)", "request time", "request_time")
  const colBegin = cx("begin trip time (utc)", "begin trip time", "begin_trip_time")
  const colDrop = cx("dropoff time (utc)", "dropoff time", "drop off time", "dropoff_time")
  const colBeginAddr = cx("begin trip address", "begin_trip_address", "pickup address")
  const colDropAddr = cx("dropoff address", "drop off address", "dropoff_address")
  const colBeginLat = cx("begin trip lat", "begin_trip_lat", "pickup lat")
  const colBeginLng = cx("begin trip lng", "begin_trip_lng", "pickup lng")
  const colDropLat = cx("dropoff lat", "drop off lat", "dropoff_lat")
  const colDropLng = cx("dropoff lng", "drop off lng", "dropoff_lng")
  const colDistance = cx("distance (miles)", "distance miles", "distance")
  const colDuration = cx("duration (min)", "duration", "trip duration")
  const colFare = cx("fare amount", "fare amount (usd)", "fare")
  const colTip = cx("tip amount", "tip amount (usd)", "tip")
  const colFee = cx("fee amount", "service fee", "booking fee", "fees")
  const colTax = cx("tax amount", "tax", "vat")
  const colSurge = cx("surge amount", "surge multiplier", "surge")
  const colTotal = cx("total amount", "amount", "rider amount", "fare total")
  const colCurrency = cx("fare currency", "currency", "currency code")
  const colStatus = cx("trip or order status", "trip status", "order status", "status")
  const colProduct = cx("product type", "product", "vehicle type", "ride type")
  const colCity = cx("city", "metro", "market")

  const out: Ride[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.every(c => !c || !c.trim())) continue
    const requestRaw = get(r, colRequest) || get(r, colBegin)
    const dateEpoch = parseDate(requestRaw)
    if (!dateEpoch && !get(r, colBegin) && !get(r, colTotal) && !get(r, colFare)) continue
    const date = dateEpoch ? formatDate(dateEpoch) : (requestRaw || "").slice(0, 10)
    const hour = dateEpoch ? new Date(dateEpoch).getUTCHours() : 0
    const weekday = dateEpoch ? new Date(dateEpoch).getUTCDay() : 0
    const id = `uber_${(i).toString().padStart(6, "0")}_${(get(r, colTripId) || "").slice(0, 8) || "ride"}`

    const fare = parseAmount(get(r, colFare))
    const tip = parseAmount(get(r, colTip))
    const feeRaw = parseAmount(get(r, colFee)) + parseAmount(get(r, colTax)) + parseAmount(get(r, colSurge))
    const totalRaw = parseAmount(get(r, colTotal))
    const total = totalRaw || (fare + tip + feeRaw)

    const distance = parseAmount(get(r, colDistance))
    const duration = parseDurationMin(get(r, colDuration), get(r, colBegin), get(r, colDrop))

    const status = (get(r, colStatus) || "completed").toLowerCase()
    const productType = get(r, colProduct) || "Uber"
    const currency = get(r, colCurrency) || "USD"
    const city = get(r, colCity) || null

    const pickupLabel = get(r, colBeginAddr) || null
    const dropoffLabel = get(r, colDropAddr) || null
    const pickupLat = parseFloatOrNull(get(r, colBeginLat))
    const pickupLng = parseFloatOrNull(get(r, colBeginLng))
    const dropoffLat = parseFloatOrNull(get(r, colDropLat))
    const dropoffLng = parseFloatOrNull(get(r, colDropLng))

    const rawObj: Record<string, string> = {}
    for (let j = 0; j < headers.length && j < r.length; j++) {
      const k = (headers[j] || `col_${j}`).trim() || `col_${j}`
      rawObj[k] = (r[j] || "").trim()
    }

    out.push({
      id,
      source: "uber",
      date,
      dateEpoch,
      hour,
      weekday,
      productType,
      status,
      pickupLabel,
      dropoffLabel,
      pickupLat,
      pickupLng,
      dropoffLat,
      dropoffLng,
      distanceMiles: round2(Math.max(0, distance)),
      durationMin: round1(Math.max(0, duration)),
      fare: round2(Math.max(0, fare)),
      tip: round2(Math.max(0, tip)),
      fee: round2(Math.max(0, feeRaw)),
      total: round2(total),
      currency,
      city,
      flags: [],
      raw: rawObj,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Lyft CSV
// ---------------------------------------------------------------------------

function parseLyftCsv(raw: string): Ride[] {
  const rows = parseCsv(raw)
  const headerIdx = findHeaderRow(rows, [/(pickup|pickup_)/, /(drop[-\s]?off|dropoff_)/])
  if (headerIdx < 0) return []
  const headers = rows[headerIdx]
  const cx = buildIndexer(headers)
  const colId = cx("ride id", "id", "ride_id", "trip id")
  const colDate = cx("requested at", "started at", "request_at", "started_at", "date", "ride date")
  const colDrop = cx("ended at", "drop off time", "dropoff time", "ended_at")
  const colPickupAddr = cx("pickup address", "pickup location", "pickup_address", "pickup_location", "pickup")
  const colDropAddr = cx("drop off address", "dropoff address", "drop-off address", "dropoff location", "dropoff_address", "drop_off_address", "dropoff", "drop-off")
  const colPickupLat = cx("pickup lat", "pickup_lat", "pickup latitude")
  const colPickupLng = cx("pickup lng", "pickup_lng", "pickup longitude", "pickup lon")
  const colDropLat = cx("dropoff lat", "drop off lat", "dropoff_lat", "dropoff latitude")
  const colDropLng = cx("dropoff lng", "drop off lng", "dropoff_lng", "dropoff longitude", "dropoff lon")
  const colDistance = cx("distance (miles)", "distance miles", "distance", "ride_distance_miles")
  const colDuration = cx("duration (min)", "duration", "ride duration", "duration_seconds")
  const colCost = cx("cost", "ride cost", "ride_cost", "ride cost (usd)")
  const colTip = cx("tip", "tip amount", "tip_amount", "tip (usd)")
  const colFee = cx("service fee", "booking fee", "fees", "fee")
  const colTax = cx("tax", "tax amount", "vat")
  const colTotal = cx("total", "total amount", "amount charged", "total cost", "total (usd)")
  const colCurrency = cx("currency", "currency code")
  const colStatus = cx("status", "ride status", "trip status", "cancelled")
  const colProduct = cx("ride type", "type", "ride_type", "product", "vehicle type")
  const colCity = cx("city", "region", "market")

  const out: Ride[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.every(c => !c || !c.trim())) continue
    const dateRaw = get(r, colDate)
    const dateEpoch = parseDate(dateRaw)
    if (!dateEpoch && !get(r, colTotal) && !get(r, colCost)) continue
    const date = dateEpoch ? formatDate(dateEpoch) : (dateRaw || "").slice(0, 10)
    const hour = dateEpoch ? new Date(dateEpoch).getUTCHours() : 0
    const weekday = dateEpoch ? new Date(dateEpoch).getUTCDay() : 0
    const idBase = get(r, colId) || `lyft_${(i).toString().padStart(6, "0")}`
    const id = `lyft_${(i).toString().padStart(6, "0")}_${idBase.slice(0, 8)}`

    const cost = parseAmount(get(r, colCost))
    const tip = parseAmount(get(r, colTip))
    const fee = parseAmount(get(r, colFee)) + parseAmount(get(r, colTax))
    const totalRaw = parseAmount(get(r, colTotal))
    const total = totalRaw || (cost + tip + fee)

    const distance = parseAmount(get(r, colDistance))
    const duration = parseDurationMin(get(r, colDuration), get(r, colDate), get(r, colDrop))

    const statusRaw = get(r, colStatus).toLowerCase()
    const status = statusRaw === "true" ? "cancelled" : statusRaw === "false" ? "completed" : (statusRaw || "completed")
    const productType = get(r, colProduct) || "Lyft"
    const currency = get(r, colCurrency) || "USD"
    const city = get(r, colCity) || null

    const pickupLabel = get(r, colPickupAddr) || null
    const dropoffLabel = get(r, colDropAddr) || null
    const pickupLat = parseFloatOrNull(get(r, colPickupLat))
    const pickupLng = parseFloatOrNull(get(r, colPickupLng))
    const dropoffLat = parseFloatOrNull(get(r, colDropLat))
    const dropoffLng = parseFloatOrNull(get(r, colDropLng))

    const rawObj: Record<string, string> = {}
    for (let j = 0; j < headers.length && j < r.length; j++) {
      const k = (headers[j] || `col_${j}`).trim() || `col_${j}`
      rawObj[k] = (r[j] || "").trim()
    }

    out.push({
      id,
      source: "lyft",
      date,
      dateEpoch,
      hour,
      weekday,
      productType,
      status,
      pickupLabel,
      dropoffLabel,
      pickupLat,
      pickupLng,
      dropoffLat,
      dropoffLng,
      distanceMiles: round2(Math.max(0, distance)),
      durationMin: round1(Math.max(0, duration)),
      fare: round2(Math.max(0, cost)),
      tip: round2(Math.max(0, tip)),
      fee: round2(Math.max(0, fee)),
      total: round2(total),
      currency,
      city,
      flags: [],
      raw: rawObj,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// JSON (best-effort)
// ---------------------------------------------------------------------------

function parseUberJson(raw: string): Ride[] {
  try {
    const j = JSON.parse(raw)
    const arr: Array<Record<string, unknown>> = Array.isArray(j) ? j : (j.trips || j.rides || j.data || [])
    return arr.map((r, i) => normalizeJsonRide(r, "uber", i))
  } catch { return [] }
}

function parseLyftJson(raw: string): Ride[] {
  try {
    const j = JSON.parse(raw)
    const arr: Array<Record<string, unknown>> = Array.isArray(j) ? j : (j.rides || j.trips || j.data || [])
    return arr.map((r, i) => normalizeJsonRide(r, "lyft", i))
  } catch { return [] }
}

function normalizeJsonRide(r: Record<string, unknown>, source: RideshareSource, i: number): Ride {
  const requestRaw = String(r.requested_at || r.request_time || r.begin_trip_time || r.started_at || r.date || r.timestamp || "")
  const dateEpoch = parseDate(requestRaw)
  const date = dateEpoch ? formatDate(dateEpoch) : requestRaw.slice(0, 10)
  const hour = dateEpoch ? new Date(dateEpoch).getUTCHours() : 0
  const weekday = dateEpoch ? new Date(dateEpoch).getUTCDay() : 0
  const distance = numField(r, ["distance_miles", "distance", "ride_distance_miles"])
  const duration = numField(r, ["duration_min", "duration", "ride_duration_min"])
  const fare = numField(r, ["fare_amount", "ride_cost_usd", "cost", "fare"])
  const tip = numField(r, ["tip_amount", "tip_usd", "tip"])
  const fee = numField(r, ["fee_amount", "service_fee", "booking_fee", "fees"]) + numField(r, ["tax_amount", "tax", "vat"])
  const total = numField(r, ["total_amount", "amount_charged_usd", "rider_amount", "total"]) || (fare + tip + fee)
  const status = String(r.status || r.trip_status || (r.cancelled ? "cancelled" : "completed")).toLowerCase()
  const productType = String(r.product_type || r.ride_type || r.vehicle_type || (source === "uber" ? "Uber" : "Lyft"))
  const currency = String(r.currency || r.fare_currency || "USD")
  const city = (r.city || r.metro || r.market || null) as string | null
  const id = `${source}_${i.toString().padStart(6, "0")}_${String(r.id || r.trip_id || r.ride_id || "ride").slice(0, 8)}`
  const raw: Record<string, string> = {}
  for (const [k, v] of Object.entries(r)) {
    raw[k] = typeof v === "string" ? v : JSON.stringify(v)
  }
  return {
    id,
    source,
    date,
    dateEpoch,
    hour,
    weekday,
    productType,
    status,
    pickupLabel: (r.begin_trip_address || r.pickup_address || r.pickup_location || r.pickup || null) as string | null,
    dropoffLabel: (r.dropoff_address || r.drop_off_address || r.dropoff_location || r.dropoff || null) as string | null,
    pickupLat: numField(r, ["begin_trip_lat", "pickup_lat", "pickup_latitude"]) || null,
    pickupLng: numField(r, ["begin_trip_lng", "pickup_lng", "pickup_longitude"]) || null,
    dropoffLat: numField(r, ["dropoff_lat", "drop_off_lat", "dropoff_latitude"]) || null,
    dropoffLng: numField(r, ["dropoff_lng", "drop_off_lng", "dropoff_longitude"]) || null,
    distanceMiles: round2(Math.max(0, distance)),
    durationMin: round1(Math.max(0, duration)),
    fare: round2(Math.max(0, fare)),
    tip: round2(Math.max(0, tip)),
    fee: round2(Math.max(0, fee)),
    total: round2(total),
    currency,
    city,
    flags: [],
    raw,
  }
}

function numField(r: Record<string, unknown>, names: string[]): number {
  for (const n of names) {
    const v = r[n]
    if (typeof v === "number" && isFinite(v)) return v
    if (typeof v === "string" && v.trim()) {
      const p = parseFloat(v.replace(/[$,]/g, ""))
      if (isFinite(p)) return p
    }
  }
  return 0
}

// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------

function aggregateSummary(rides: Ride[], source: RideshareSource): RideshareSummary {
  const dated = rides.filter(r => r.dateEpoch > 0)
  const cancelled = rides.filter(r => isCancelled(r.status))
  const refundRows = rides.filter(r => /refund|reversal/i.test(r.status) || r.total < 0)
  const completed = rides.filter(r => !isCancelled(r.status) && !/refund/i.test(r.status))
  const totalSpend = sum(rides.filter(r => r.total > 0).map(r => r.total))
  const refundTotal = sum(refundRows.map(r => Math.abs(r.total)))
  const totalMiles = sum(completed.map(r => r.distanceMiles))
  const totalHours = sum(completed.map(r => r.durationMin)) / 60
  const avgFare = completed.length ? totalSpend / completed.length : 0
  const avgMiles = completed.length ? totalMiles / completed.length : 0
  const avgDurationMin = completed.length ? sum(completed.map(r => r.durationMin)) / completed.length : 0

  const cityCounts = new Map<string, { count: number; spend: number }>()
  for (const r of rides) {
    if (!r.city) continue
    const cur = cityCounts.get(r.city) || { count: 0, spend: 0 }
    cur.count++
    cur.spend += Math.max(0, r.total)
    cityCounts.set(r.city, cur)
  }
  const sortedCities = Array.from(cityCounts.entries()).sort((a, b) => b[1].count - a[1].count)
  const busiestCity = sortedCities[0]?.[0] || "—"

  const monthCounts = new Map<string, number>()
  for (const r of dated) monthCounts.set(r.date.slice(0, 7), (monthCounts.get(r.date.slice(0, 7)) || 0) + 1)
  const busiestMonthEntry = Array.from(monthCounts.entries()).sort((a, b) => b[1] - a[1])[0]
  const busiestMonth = busiestMonthEntry?.[0] || "—"

  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0]
  for (const r of dated) weekdayCounts[r.weekday]++
  const busiestWeekdayIdx = weekdayCounts.indexOf(Math.max(...weekdayCounts))
  const busiestWeekday = WEEKDAY_NAMES[busiestWeekdayIdx] || "—"

  const pickupCounts = new Map<string, number>()
  const dropCounts = new Map<string, number>()
  for (const r of rides) {
    if (r.pickupLabel) pickupCounts.set(r.pickupLabel, (pickupCounts.get(r.pickupLabel) || 0) + 1)
    if (r.dropoffLabel) dropCounts.set(r.dropoffLabel, (dropCounts.get(r.dropoffLabel) || 0) + 1)
  }
  const topPickup = Array.from(pickupCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "—"
  const topDropoff = Array.from(dropCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "—"

  const productCounts = new Map<string, number>()
  for (const r of rides) productCounts.set(r.productType, (productCounts.get(r.productType) || 0) + 1)
  const topProduct = Array.from(productCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "—"

  const lateNight = dated.filter(r => LATE_NIGHT_HOURS.has(r.hour)).length
  const weekend = dated.filter(r => r.weekday === 0 || r.weekday === 6).length
  const airport = dated.filter(r => isAirportRide(r)).length

  const minDate = dated.length ? Math.min(...dated.map(r => r.dateEpoch)) : 0
  const maxDate = dated.length ? Math.max(...dated.map(r => r.dateEpoch)) : 0
  const period = minDate && maxDate ? `${formatDate(minDate)} → ${formatDate(maxDate)}` : "(no dates)"
  const durationLabel = minDate && maxDate ? formatDuration(maxDate - minDate) : "—"
  const monthsActive = new Set(dated.map(r => r.date.slice(0, 7))).size

  const currencyCode = rides.find(r => r.currency)?.currency || "USD"
  const currencySymbol = currencySymbolFor(currencyCode)

  return {
    rowCount: rides.length,
    rideCount: completed.length,
    cancelledCount: cancelled.length,
    refundCount: refundRows.length,
    totalSpend: round2(totalSpend),
    refundTotal: round2(refundTotal),
    totalMiles: round2(totalMiles),
    totalHours: round1(totalHours),
    avgFare: round2(avgFare),
    avgMiles: round2(avgMiles),
    avgDurationMin: round1(avgDurationMin),
    distinctCities: cityCounts.size,
    distinctProducts: productCounts.size,
    busiestCity,
    busiestMonth,
    busiestWeekday,
    topPickup,
    topDropoff,
    topProduct,
    lateNightShare: dated.length ? round1((lateNight / dated.length) * 100) : 0,
    weekendShare: dated.length ? round1((weekend / dated.length) * 100) : 0,
    airportShare: dated.length ? round1((airport / dated.length) * 100) : 0,
    period,
    durationLabel,
    monthsActive,
    currencyCode,
    currencySymbol,
    source,
  }
}

function aggregateMonthly(rides: Ride[]): MonthlyBucket[] {
  const map = new Map<string, MonthlyBucket>()
  for (const r of rides) {
    if (!r.date) continue
    const month = r.date.slice(0, 7)
    const cur = map.get(month) || { month, count: 0, spend: 0, miles: 0, hours: 0 }
    cur.count++
    cur.spend += Math.max(0, r.total)
    cur.miles += r.distanceMiles
    cur.hours += r.durationMin / 60
    map.set(month, cur)
  }
  return Array.from(map.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(m => ({ month: m.month, count: m.count, spend: round2(m.spend), miles: round2(m.miles), hours: round1(m.hours) }))
}

function aggregateYearly(rides: Ride[]): YearlyBucket[] {
  const map = new Map<string, YearlyBucket>()
  for (const r of rides) {
    if (!r.date) continue
    const year = r.date.slice(0, 4)
    const cur = map.get(year) || { year, count: 0, spend: 0, miles: 0, hours: 0 }
    cur.count++
    cur.spend += Math.max(0, r.total)
    cur.miles += r.distanceMiles
    cur.hours += r.durationMin / 60
    map.set(year, cur)
  }
  return Array.from(map.values())
    .sort((a, b) => a.year.localeCompare(b.year))
    .map(y => ({ year: y.year, count: y.count, spend: round2(y.spend), miles: round2(y.miles), hours: round1(y.hours) }))
}

function aggregateHeatmap(rides: Ride[]): HeatmapCell[] {
  const cells: HeatmapCell[] = []
  for (let w = 0; w < 7; w++) for (let h = 0; h < 24; h++) cells.push({ weekday: w, hour: h, count: 0 })
  for (const r of rides) {
    if (!r.dateEpoch) continue
    const idx = r.weekday * 24 + r.hour
    if (cells[idx]) cells[idx].count++
  }
  return cells
}

function aggregateCities(rides: Ride[]): CityBucket[] {
  const map = new Map<string, CityBucket>()
  for (const r of rides) {
    if (!r.city) continue
    const cur = map.get(r.city) || { city: r.city, count: 0, spend: 0 }
    cur.count++
    cur.spend += Math.max(0, r.total)
    map.set(r.city, cur)
  }
  return Array.from(map.values())
    .map(c => ({ city: c.city, count: c.count, spend: round2(c.spend) }))
    .sort((a, b) => b.count - a.count)
}

function aggregatePlaces(rides: Ride[], side: "pickup" | "dropoff"): PlaceBucket[] {
  const map = new Map<string, PlaceBucket>()
  for (const r of rides) {
    const label = side === "pickup" ? r.pickupLabel : r.dropoffLabel
    if (!label) continue
    const cur = map.get(label) || { label, count: 0, spend: 0 }
    cur.count++
    cur.spend += Math.max(0, r.total)
    map.set(label, cur)
  }
  return Array.from(map.values())
    .map(p => ({ label: p.label, count: p.count, spend: round2(p.spend) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
}

function aggregateProducts(rides: Ride[]): ProductBucket[] {
  const map = new Map<string, ProductBucket>()
  for (const r of rides) {
    const cur = map.get(r.productType) || { product: r.productType, count: 0, spend: 0, miles: 0 }
    cur.count++
    cur.spend += Math.max(0, r.total)
    cur.miles += r.distanceMiles
    map.set(r.productType, cur)
  }
  return Array.from(map.values())
    .map(p => ({ product: p.product, count: p.count, spend: round2(p.spend), miles: round2(p.miles) }))
    .sort((a, b) => b.count - a.count)
}

function aggregateDistanceBuckets(rides: Ride[]): DistanceBucket[] {
  const buckets: Array<{ label: string; min: number; max: number }> = [
    { label: "< 1 mi",       min: 0,    max: 1 },
    { label: "1–3 mi",       min: 1,    max: 3 },
    { label: "3–6 mi",       min: 3,    max: 6 },
    { label: "6–12 mi",      min: 6,    max: 12 },
    { label: "12–25 mi",     min: 12,   max: 25 },
    { label: "25+ mi",       min: 25,   max: Infinity },
  ]
  const counts = buckets.map(b => ({ label: b.label, count: 0, share: 0 }))
  let total = 0
  for (const r of rides) {
    if (!r.distanceMiles) continue
    total++
    for (let i = 0; i < buckets.length; i++) {
      if (r.distanceMiles >= buckets[i].min && r.distanceMiles < buckets[i].max) {
        counts[i].count++
        break
      }
    }
  }
  const denom = total || 1
  for (const c of counts) c.share = round1((c.count / denom) * 100)
  return counts
}

function aggregateMoney(rides: Ride[], products: ProductBucket[]): MoneyBreakdown {
  const fare = sum(rides.map(r => r.fare))
  const tip = sum(rides.map(r => r.tip))
  const fee = sum(rides.map(r => r.fee))
  const total = sum(rides.filter(r => r.total > 0).map(r => r.total))
  const refund = sum(rides.filter(r => r.total < 0).map(r => Math.abs(r.total)))
  return {
    fare: round2(fare),
    tip: round2(tip),
    fee: round2(fee),
    refund: round2(refund),
    total: round2(total),
    byProduct: products,
  }
}

function projectGeo(rides: Ride[]): GeoLayer {
  const points: Array<{ lat: number; lng: number; kind: "pickup" | "dropoff"; label: string | null }> = []
  for (const r of rides) {
    if (r.pickupLat != null && r.pickupLng != null) points.push({ lat: r.pickupLat, lng: r.pickupLng, kind: "pickup", label: r.pickupLabel })
    if (r.dropoffLat != null && r.dropoffLng != null) points.push({ lat: r.dropoffLat, lng: r.dropoffLng, kind: "dropoff", label: r.dropoffLabel })
  }
  if (!points.length) {
    return { hasCoordinates: false, pointCount: 0, bbox: null, viewBox: { width: 1000, height: 600 }, points: [] }
  }
  const lats = points.map(p => p.lat)
  const lngs = points.map(p => p.lng)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const padLat = Math.max((maxLat - minLat) * 0.05, 0.005)
  const padLng = Math.max((maxLng - minLng) * 0.05, 0.005)
  const lat0 = minLat - padLat, lat1 = maxLat + padLat
  const lng0 = minLng - padLng, lng1 = maxLng + padLng
  const meanLat = (lat0 + lat1) / 2
  const cosLat = Math.max(0.1, Math.cos((meanLat * Math.PI) / 180))
  const widthDeg = (lng1 - lng0) * cosLat
  const heightDeg = lat1 - lat0
  const VIEW_W = 1000
  const aspect = VIEW_W / Math.max(0.0001, widthDeg)
  const VIEW_H = Math.round(heightDeg * aspect)

  // De-duplicate near-coincident points so the SVG layer stays light.
  const cellMap = new Map<string, GeoPoint>()
  for (const p of points) {
    const cellX = Math.round(((p.lng - lng0) / Math.max(0.0001, lng1 - lng0)) * 200)
    const cellY = Math.round(((lat1 - p.lat) / Math.max(0.0001, lat1 - lat0)) * 120)
    const key = `${p.kind}:${cellX}:${cellY}`
    const existing = cellMap.get(key)
    if (existing) {
      existing.count++
      continue
    }
    const x = ((p.lng - lng0) / Math.max(0.0001, lng1 - lng0)) * VIEW_W
    const y = ((lat1 - p.lat) / Math.max(0.0001, lat1 - lat0)) * VIEW_H
    cellMap.set(key, { x: round1(x), y: round1(y), kind: p.kind, count: 1, label: p.label })
  }
  const pts = Array.from(cellMap.values()).sort((a, b) => b.count - a.count).slice(0, 600)
  return {
    hasCoordinates: true,
    pointCount: points.length,
    bbox: { minLat, maxLat, minLng, maxLng },
    viewBox: { width: VIEW_W, height: Math.max(120, VIEW_H) },
    points: pts,
  }
}

// ---------------------------------------------------------------------------
// Per-row + global flag detection
// ---------------------------------------------------------------------------

function tagRideFlags(r: Ride): void {
  if (isCancelled(r.status)) r.flags.push("cancelled")
  if (/refund|reversal/i.test(r.status) || r.total < 0) r.flags.push("refund")
  if (LATE_NIGHT_HOURS.has(r.hour)) r.flags.push("late-night")
  if (isAirportRide(r)) r.flags.push("airport-run")
  if (r.total === 0 && !isCancelled(r.status)) r.flags.push("no-fare")
}

function detectFlags(rides: Ride[]): RideshareFlag[] {
  const out: RideshareFlag[] = []

  // Cancellations.
  const cancels = rides.filter(r => isCancelled(r.status))
  if (cancels.length > 0) {
    out.push({
      kind: "cancelled",
      label: `${cancels.length} cancelled ride${cancels.length === 1 ? "" : "s"}`,
      detail: `${cancels.length} ride${cancels.length === 1 ? "" : "s"} were cancelled (driver, rider, or auto). ${formatMoney(sum(cancels.map(r => r.total)))} in cancellation fees.`,
      rowIds: cancels.slice(0, 24).map(r => r.id),
    })
  }

  // Refunds (negative-total or refund-status rows).
  const refunds = rides.filter(r => /refund|reversal/i.test(r.status) || r.total < 0)
  if (refunds.length > 0) {
    out.push({
      kind: "refund",
      label: `${refunds.length} refund${refunds.length === 1 ? "" : "s"} or reversal${refunds.length === 1 ? "" : "s"}`,
      detail: `${formatMoney(sum(refunds.map(r => Math.abs(r.total))))} refunded across ${refunds.length} row${refunds.length === 1 ? "" : "s"}.`,
      rowIds: refunds.slice(0, 12).map(r => r.id),
    })
  }

  // Expensive outliers (top 3 by total spend, must be ≥ 2x the median).
  const positive = rides.filter(r => r.total > 0).sort((a, b) => b.total - a.total)
  if (positive.length >= 5) {
    const median = positive[Math.floor(positive.length / 2)].total
    const expensive = positive.slice(0, 3).filter(r => r.total >= median * 2 && r.total >= 50)
    if (expensive.length > 0) {
      out.push({
        kind: "expensive-outlier",
        label: `${expensive.length} expensive ride${expensive.length === 1 ? "" : "s"}`,
        detail: `Top fare ${formatMoney(expensive[0].total)} on ${expensive[0].date} — vs. median ${formatMoney(median)}. Often a surge, long airport run, or mis-routed pickup.`,
        rowIds: expensive.map(r => r.id),
      })
    }
  }

  // Long trips (top 3 by distance, ≥ 25 miles).
  const longTrips = rides.filter(r => r.distanceMiles >= 25).sort((a, b) => b.distanceMiles - a.distanceMiles).slice(0, 3)
  if (longTrips.length > 0) {
    out.push({
      kind: "long-trip",
      label: `${longTrips.length} long ride${longTrips.length === 1 ? "" : "s"} (25+ mi)`,
      detail: `Longest ${round1(longTrips[0].distanceMiles)} mi on ${longTrips[0].date}${longTrips[0].dropoffLabel ? ` to ${longTrips[0].dropoffLabel}` : ""}.`,
      rowIds: longTrips.map(r => r.id),
    })
  }

  // Airport runs.
  const airport = rides.filter(r => isAirportRide(r))
  if (airport.length > 0) {
    out.push({
      kind: "airport-run",
      label: `${airport.length} airport ride${airport.length === 1 ? "" : "s"}`,
      detail: `Airport pickup or dropoff detected ${airport.length} time${airport.length === 1 ? "" : "s"}. Total ${formatMoney(sum(airport.map(r => Math.max(0, r.total))))}.`,
      rowIds: airport.slice(0, 24).map(r => r.id),
    })
  }

  // Late-night cluster (Fri/Sat between 22:00 and 04:00 sustained).
  const lateNight = rides.filter(r => LATE_NIGHT_HOURS.has(r.hour) && (r.weekday === 5 || r.weekday === 6 || r.weekday === 0))
  if (lateNight.length >= 4) {
    out.push({
      kind: "late-night-cluster",
      label: `${lateNight.length} weekend late-night rides`,
      detail: `Rides between 10pm and 4am on Fri/Sat/Sun — ${formatMoney(sum(lateNight.map(r => Math.max(0, r.total))))} total.`,
      rowIds: lateNight.slice(0, 24).map(r => r.id),
    })
  }

  // Commute loops (same pickup→dropoff repeated ≥ 4 times within typical commute hours).
  const pairCounts = new Map<string, Ride[]>()
  for (const r of rides) {
    if (!r.pickupLabel || !r.dropoffLabel) continue
    const key = `${normalizeLabel(r.pickupLabel)}→${normalizeLabel(r.dropoffLabel)}`
    const arr = pairCounts.get(key) || []
    arr.push(r)
    pairCounts.set(key, arr)
  }
  const loops = Array.from(pairCounts.entries())
    .filter(([, arr]) => arr.length >= 4)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3)
  for (const [pair, arr] of loops) {
    const morningish = arr.filter(r => r.hour >= 6 && r.hour <= 10).length
    const eveningish = arr.filter(r => r.hour >= 16 && r.hour <= 20).length
    const tag = morningish >= eveningish ? "morning routine" : "evening routine"
    out.push({
      kind: "commute-loop",
      label: `Repeat: ${pair}`,
      detail: `${arr.length} rides on this exact route — looks like a ${tag}.`,
      rowIds: arr.slice(0, 24).map(r => r.id),
    })
  }

  return out.slice(0, 12)
}

function isCancelled(status: string): boolean {
  return /cancel|no[-\s]?show|driver[-\s]?cancel|rider[-\s]?cancel|cancelled|canceled/i.test(status || "")
}

function isAirportRide(r: Ride): boolean {
  if (r.pickupLabel && AIRPORT_HINTS.test(r.pickupLabel)) return true
  if (r.dropoffLabel && AIRPORT_HINTS.test(r.dropoffLabel)) return true
  return false
}

function normalizeLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim().toLowerCase()
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSummaryLine(s: RideshareSummary): string {
  const fmt = (n: number) => `${s.currencySymbol}${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
  const label = s.source === "uber" ? "Uber" : "Lyft"
  const place = s.busiestCity && s.busiestCity !== "—" ? `, busiest ${s.busiestCity}` : ""
  return `${label} travel history: ${s.rideCount} trips${s.cancelledCount ? ` + ${s.cancelledCount} cancelled` : ""}, ${fmt(s.totalSpend)} spent, ${Math.round(s.totalMiles).toLocaleString()} mi, ${Math.round(s.totalHours)} hr in cars over ${s.period}${place}.`
}

function stripBigRow(r: Ride): Ride {
  const raw: Record<string, string> = {}
  let count = 0
  for (const [k, v] of Object.entries(r.raw)) {
    if (count >= 8) { raw["…"] = `+${Object.keys(r.raw).length - count} more`; break }
    raw[k] = (v || "").length > 80 ? v.slice(0, 80) + "…" : v
    count++
  }
  return { ...r, raw }
}

function sum(arr: number[]): number {
  let total = 0
  for (const n of arr) total += n
  return total
}
function round2(n: number): number { return Math.round(n * 100) / 100 }
function round1(n: number): number { return Math.round(n * 10) / 10 }

function parseAmount(raw: string): number {
  if (!raw) return 0
  let s = raw.trim()
  if (!s) return 0
  let negative = false
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1) }
  s = s.replace(/[$€£¥₹]/g, "").replace(/\s+/g, "").replace(/,/g, "").replace(/^\+/, "")
  if (s.startsWith("-")) { negative = !negative; s = s.slice(1) }
  const n = parseFloat(s)
  if (!isFinite(n)) return 0
  return negative ? -n : n
}

function parseFloatOrNull(raw: string): number | null {
  if (!raw) return null
  const n = parseFloat(raw.trim())
  if (!isFinite(n)) return null
  return n
}

function parseDate(raw: string): number {
  if (!raw) return 0
  const s = raw.trim()
  if (!s) return 0
  const iso = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s)
  if (iso) return Date.UTC(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]), parseInt(iso[4]), parseInt(iso[5]), parseInt(iso[6] || "0"))
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (dateOnly) return Date.UTC(parseInt(dateOnly[1]), parseInt(dateOnly[2]) - 1, parseInt(dateOnly[3]))
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s)
  if (us) {
    let y = parseInt(us[3])
    if (y < 100) y += y >= 70 ? 1900 : 2000
    return Date.UTC(y, parseInt(us[1]) - 1, parseInt(us[2]), parseInt(us[4] || "0"), parseInt(us[5] || "0"))
  }
  const t = Date.parse(s)
  return isNaN(t) ? 0 : t
}

function parseDurationMin(raw: string, beginRaw: string, endRaw: string): number {
  if (raw) {
    const r = raw.trim().toLowerCase()
    // "12:34" → 12 min 34 sec
    const hms = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(r)
    if (hms) {
      const a = parseInt(hms[1]), b = parseInt(hms[2]), c = hms[3] ? parseInt(hms[3]) : 0
      if (hms[3]) return a * 60 + b + c / 60          // hh:mm:ss → minutes
      return a + b / 60                                // mm:ss → minutes
    }
    const n = parseFloat(r)
    if (isFinite(n)) {
      if (/sec/.test(r)) return n / 60
      if (/hour|hr/.test(r)) return n * 60
      // Bare "1234" with "duration_seconds" header → treat as seconds when > 240.
      if (n > 240 && !/min/.test(r)) return n / 60
      return n
    }
  }
  const beginEpoch = parseDate(beginRaw)
  const endEpoch = parseDate(endRaw)
  if (beginEpoch && endEpoch && endEpoch > beginEpoch) return (endEpoch - beginEpoch) / 60000
  return 0
}

function formatDate(epoch: number): string {
  if (!epoch) return ""
  const d = new Date(epoch)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "instant"
  const days = Math.floor(ms / 86400000)
  if (days < 1) return "less than a day"
  if (days === 1) return "1 day"
  if (days < 35) return `${days} days`
  const months = Math.round(days / 30)
  if (months === 1) return "1 month"
  if (months < 18) return `${months} months`
  const years = Math.round(days / 365)
  return years === 1 ? "1 year" : `${years} years`
}

function formatMoney(n: number): string {
  return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function currencySymbolFor(code: string): string {
  switch ((code || "").toUpperCase()) {
    case "USD": case "CAD": case "AUD": case "NZD": case "SGD": return "$"
    case "EUR": return "€"
    case "GBP": return "£"
    case "JPY": case "CNY": return "¥"
    case "INR": return "₹"
    case "BRL": return "R$"
    default: return "$"
  }
}
