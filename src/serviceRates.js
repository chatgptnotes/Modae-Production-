import { fmt } from './utils.js'
import { STATES } from './indiaLocations.js'

// The reactive-service cost build-up. This lived inside WbService.jsx, which is
// why the invoice could never reuse it: the estimate and the bill have to agree
// line for line, and the workflow bills on *actual* engineer days (weekday /
// weekend / OT as applicable) rather than on what was quoted.

export const normalizeSheet = name => (name === 'International' ? 'International' : 'India')

const INDIAN_STATES = Object.values(STATES).map(name => name.toLowerCase())

// Which rate sheet a job is priced off follows from where the site is, not from
// a toggle someone remembers to set. ModAE is an Indian company doing mostly
// domestic work, so a blank or unrecognised location stays domestic; naming a
// state or "India" confirms it, and anything else is priced internationally.
export function sheetForLocation(location) {
  const text = String(location || '').trim().toLowerCase()
  if (!text) return 'India'
  if (text.includes('india')) return 'India'
  if (INDIAN_STATES.some(state => text.includes(state))) return 'India'
  // A bare city with no country is ambiguous; only an explicit foreign country
  // reads as international.
  return /\b(uae|dubai|abu dhabi|oman|muscat|qatar|doha|saudi|ksa|kuwait|bahrain|singapore|malaysia|indonesia|vietnam|thailand|philippines|bangladesh|sri lanka|nepal|kenya|nigeria|egypt|turkey|germany|france|italy|spain|netherlands|uk|united kingdom|usa|united states|canada|australia|japan|korea|china)\b/
    .test(text)
    ? 'International'
    : 'India'
}

// The sheet this job is priced off: an explicit override if one was set, the
// site's location otherwise. Every surface that prices or bills service work
// resolves it through here so they cannot disagree.
export const sheetFor = (opp, est = {}) =>
  normalizeSheet(est.sheet || sheetForLocation(opp?.eucLocation || opp?.location))

const num = v => Math.max(0, Number(v) || 0)

// What was priced before the visit.
export const estimateQuantities = (est = {}) => ({
  workDays: num(est.workDays),
  travelDays: num(est.travelDays),
  otHours: num(est.otHours),
  weekendDays: num(est.weekendDays),
  standbyDays: num(est.standbyDays),
})

// What the engineer actually spent on site. Each actual falls back to the
// estimate so an invoice raised before the field log is filled in still prices
// the agreed scope rather than collapsing to zero.
export const actualQuantities = (est = {}) => {
  const e = estimateQuantities(est)
  const pick = (actual, quoted) => (actual == null || actual === '' ? quoted : num(actual))
  return {
    workDays: pick(est.actualWeekdayDays, e.workDays),
    travelDays: pick(est.actualTravelDays, e.travelDays),
    otHours: pick(est.actualOtHours, e.otHours),
    weekendDays: pick(est.actualWeekendDays, e.weekendDays),
    standbyDays: pick(est.actualStandbyDays, e.standbyDays),
  }
}

// Billable engineer days = weekday + weekend. Travel and standby are charged on
// their own lines, so they are deliberately excluded from this figure.
export const engineerDaysFrom = q => num(q.workDays) + num(q.weekendDays)

// Has the engineer recorded anything of their own, or is this still the quote?
export const hasActuals = (est = {}) => ['actualWeekdayDays', 'actualWeekendDays', 'actualOtHours', 'actualTravelDays', 'actualStandbyDays']
  .some(k => est[k] != null && est[k] !== '')

// The named roles a sheet publishes, with rates resolved. A role that points at
// the calculator's own rate reads it live, so the published table and the bill
// can never disagree.
export const roleRates = (sheetObj = {}) => (sheetObj.roles || []).map(row => ({
  role: row.role,
  ratePerDay: row.rateKey ? sheetObj.rates?.[row.rateKey] : row.ratePerDayK,
  derived: !!row.rateKey,
}))

export function serviceCost(rateSheets, sheetName, q) {
  const sheet = normalizeSheet(sheetName)
  const rs = rateSheets[sheet]
  const r = rs.rates
  const nights = q.workDays + q.travelDays + q.standbyDays
  const rows = [
    ['Engineer days', q.workDays * r.engineerDay],
    ['Travel days', q.travelDays * r.travelDay],
    ['Overtime hours', q.otHours * r.otHour],
    [`Weekend premium (${r.weekendPct}%)`, q.weekendDays * r.seniorDay * r.weekendPct / 100],
    ['Standby days', q.standbyDays * r.standbyDay],
    ['Flights (return)', 2 * r.flight],
    ['Hotel', nights * r.hotelNight],
    ['Local transport', (q.workDays + q.travelDays) * r.transportDay],
    ['Per diem', nights * r.perDiem],
    ['Tools & consumables', r.tools],
  ]
  const subtotal = rows.reduce((s, x) => s + x[1], 0)
  const gst = Math.round(subtotal * rs.gst) / 100
  return { sheet, currency: rs.currency, gstPct: rs.gst, rows, subtotal, gst, total: subtotal + gst }
}

// India rate sheets are quoted in thousands of rupees; International in whole
// dollars. Every caller that shows or banks a service figure goes through here.
export const serviceMoney = (sheet, v) =>
  (normalizeSheet(sheet) === 'India' ? `₹ ${fmt(v)}K` : `$ ${fmt(v)}`)

export const serviceAbsolute = (sheet, v) =>
  (normalizeSheet(sheet) === 'India' ? Math.round(v * 1000) : Math.round(v))
