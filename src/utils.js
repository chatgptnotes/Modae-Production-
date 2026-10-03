// Costing math per the "Imported Items Pricing & Costing Factors" box on the
// Priced BoQ sheet: Eff. Rate = ROUNDUP(base × (1 + CD+ERV+Cont.) × (1 − B&K
// disc)) — e.g. 112 × 1.16 × 0.50 → ₹65. List price × Eff. Rate = landed ₹ cost.
// Imports come in € or $ (separate base rates); the 50% discount is B&K-list
// only; INR-quoted parts (ad-hoc/local) are already landed cost.
export function effectiveRate(c, currency = 'EUR', applyBnkDisc = true) {
  if (currency === 'INR') return 1
  const importFactorPct = c.customsDutyPct != null || c.ervPct != null || c.handlingPct != null
    ? Number(c.customsDutyPct || 0) + Number(c.ervPct || 0) + Number(c.handlingPct || 0)
    : (c.cdErvHandlingPct ?? c.cdErvContPct)
  const configuredRate = c?.currencyRates?.[String(currency).toUpperCase()]
  if (Number(configuredRate) > 0) {
    const disc = applyBnkDisc ? c.bnkDiscPct / 100 : 0
    return Math.ceil(Number(configuredRate) * (1 + importFactorPct / 100) * (1 - disc))
  }
  // A cleared/legacy usdBase falls back to the default $ rate, never the € rate.
  const base = currency === 'USD' ? (c.usdBase > 0 ? c.usdBase : 90) : c.baseRate
  const disc = applyBnkDisc ? c.bnkDiscPct / 100 : 0
  return Math.ceil(base * (1 + importFactorPct / 100) * (1 - disc))
}

export function unitCostINR(listPrice, costing, currency = 'EUR', applyBnkDisc = true) {
  return listPrice * effectiveRate(costing, currency, applyBnkDisc)
}

export const MAX_GM_PCT = 95

// Target (sell) price applies Input GM% on top of landed cost. GM is clamped
// below 100% so a typo can't push Infinity into totals and the tracker.
export function unitSellINR(listPrice, costing, currency = 'EUR', applyBnkDisc = true) {
  const gm = Math.min(costing.inputGMPct || 0, MAX_GM_PCT)
  return unitCostINR(listPrice, costing, currency, applyBnkDisc) / (1 - gm / 100)
}

// Ranges for the "Imported Items Pricing & Costing Factors" cells. Both write
// paths (the inline cell and the formula bar, which commits straight to state)
// go through this, so no typo or =formula can put a negative landed cost, a
// >100% discount or a negative finance cost into the roll-up.
const COSTING_RANGE = {
  baseRate: [0, 1000],
  usdBase: [0, 1000],
  cdErvContPct: [0, 200],
  cdErvHandlingPct: [0, 200],
  customsDutyPct: [0, 200],
  ervPct: [0, 200],
  handlingPct: [0, 200],
  bnkDiscPct: [0, 100],
  inputGMPct: [0, MAX_GM_PCT],
  financeCostK: [0, Infinity],
}

export function clampCosting(key, v) {
  const n = Number(v)
  if (!isFinite(n)) return 0
  const r = COSTING_RANGE[key]
  return r ? Math.min(Math.max(n, r[0]), r[1]) : n
}

// Quantities (BoQ Qty/Unit · Common · Spares, signal counts) are never negative.
export const clampQty = v => {
  const n = Number(v)
  return isFinite(n) && n > 0 ? n : 0
}

// Folder-wall / tracker colour convention: green = Won, red = Lost, plain =
// Open. (The real OneDrive wall uses four colours with unconfirmed meaning —
// pending Swami's answer — so the app keeps this three-state scheme for now.)
export function stageClass(o) {
  return o.stage === 'Won' ? 'won' : o.stage === 'Lost' ? 'lost' : 'open'
}

import { ROLES, PERMS, LEVEL3_ROLES, userRoles } from './seed.js'

// The provider refreshes this reference whenever persisted config changes. The
// optional config argument keeps the resolver useful in pure/test contexts.
let activeRoleNames = {}
export const setRoleNameConfig = config => { activeRoleNames = config?.roleNames || {} }

// Commercial visibility (Value/COGS/GM and pricing) follows the active persona,
// per the wireframe's "Restricted — commercial data" rule. Forecast reporting
// has its own scope because it is intentionally available to all internal roles.
const roleList = role => Array.isArray(role) ? role : [role]
const hasRoleDefinition = (role, field) => roleList(role).some(id => !!ROLES[id]?.[field] || (field === 'admin' && !!LEVEL3_ROLES[id]?.[field]))
export const canViewCommercial = role => roleList(role).some(id => !!ROLES[id]?.commercial || id === 'MANAGEMENT' || id === 'ADMIN')
export const isAdminRole = role => hasRoleDefinition(role, 'admin') || roleList(role).includes('ADMIN')
// ADMIN and LJS are co-equal application authorities and may maintain supplier
// price lists. SUPER remains the system-owner persona.
export const canManagePriceLists = role => isAdminRole(role)
export const isSalesOwner = role => roleList(role).some(id => !!ROLES[id]?.sales || id === 'STANDARD_USER' || id === 'TEAM_LEAD')
export const canViewForecast = role => roleList(role).some(id => !!ROLES[id] || !!LEVEL3_ROLES[id]) && !roleList(role).includes('CUST')
export const forecastOwnerScope = role => isSalesOwner(role) ? role : null
// A sales owner writes their own proposal, so they must see the numbers that go
// into it — BoQ rates, landed cost, margin — even though they stay outside the
// org-wide commercial reporting that canViewCommercial guards. Only *sending*
// is approval-gated. (13 Aug client review: "the salesperson himself is making
// their proposal, so he is the one who should see it… he can only request
// approval.") Use this on proposal- and workbench-building surfaces; use
// canViewCommercial for cross-pipeline money that is not theirs to price.
export const canPriceProposal = role => canViewCommercial(role) || isSalesOwner(role)

// Product is multi-value on an opportunity (13 Aug review: "can select multiple
// products because there are various products can happen in a single project").
// Seed rows and anything created before that change still hold a comma-joined
// string, so every reader normalises through here rather than assuming a shape.
export const productList = v => (Array.isArray(v)
  ? v.filter(Boolean)
  : String(v || '').split(',').map(s => s.trim()).filter(Boolean))
export const productLabel = v => productList(v).join(', ')
export const productDisplayLabel = v => productLabel(v).replace(/\bVarious\b/g, 'Multiple equipment items')
// Solution is multi-value in the opportunity editor. Keep older records that
// stored one solution as a string readable while new edits use an array.
export const solutionList = v => (Array.isArray(v)
  ? v.filter(Boolean)
  : String(v || '').split(',').map(s => s.trim()).filter(Boolean))
export const solutionLabel = v => solutionList(v).join(', ')
// LJS (strategic) and AH (commercial & ops) decide gates; admins can see the queue.
export const isApprover = role => roleList(role).some(id => id === 'LJS' || id === 'AH' || id === 'TEAM_LEAD' || id === 'MANAGEMENT') || isAdminRole(role)
export const displayRole = (role, config) => {
  if (!role) return ''
  return config?.roleNames?.[role] || activeRoleNames[role] || ROLES[role]?.name || role
}
export const displayRoleLabel = (role, config) => {
  if (!role) return ''
  const suffix = String(ROLES[role]?.label || '')
    .split('—')
    .slice(1)
    .join('—')
    .trim()
  const name = displayRole(role, config)
  return suffix ? `${name} - ${suffix}` : name
}
export const displayRoles = (roles, separator = ' + ', config) =>
  (roles || []).map(role => displayRole(role, config)).filter(Boolean).join(separator)
// Page-level permission from the PERMS matrix (unknown role sees nothing).
export const canSeePage = (role, page) => roleList(role).some(id => (PERMS[id] || LEVEL3_ROLES[id]?.pages || []).includes(page))
export const rolesForUser = user => userRoles(user)
export const hasPermission = (role, permission) => canSeePage(role, permission)

// Does a tender's spelled-out buyer name refer to a customer we already hold
// under a short name? Compares the legal-suffix-stripped forms, and the long
// name's acronym ("Maharashtra State Power Generation Company Ltd" → MSPGCL).
const LEGAL_SUFFIX = /\b(pvt|private|ltd|limited|co|company|corporation|corp|inc|llp|plc)\b\.?/g
const stripName = s => String(s || '').toLowerCase().replace(LEGAL_SUFFIX, '').replace(/[^a-z0-9]/g, '')
const acronym = s => String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ')
  .split(/\s+/).filter(Boolean).map(w => w[0]).join('')

export function sameCustomer(a, b) {
  const [sa, sb] = [stripName(a), stripName(b)]
  if (!sa || !sb) return false
  if (sa === sb) return true
  // An acronym is only convincing at 3+ letters — "GE" would match far too much.
  return (sa.length >= 3 && sa === acronym(b)) || (sb.length >= 3 && sb === acronym(a))
}

const istDateKey = value => {
  if (!value) return ''
  const text = String(value)
  // Persisted date-only fields already represent an IST business date. Do not
  // parse them as UTC, which would move them to the previous day in India.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const fields = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
  return `${fields.year}-${fields.month}-${fields.day}`
}

export function isTodayIST(value, now = new Date()) {
  const date = istDateKey(value)
  return !!date && date === istDateKey(now)
}

export function ageDays(value, now = new Date()) {
  const date = istDateKey(value)
  const today = istDateKey(now)
  if (!date || !today) return null
  const d = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000)
  return d < 0 ? 0 : d
}

// Calendar ranges used by the Opportunities tracker. Date-only opportunity
// fields are compared as ISO strings so browser timezone differences cannot
// move a row across a boundary.
export const OPPORTUNITY_DATE_FIELDS = [
  { key: 'createDate', label: 'Create Date' },
  { key: 'proposalDate', label: 'Proposal Date' },
  { key: 'orderDate', label: 'Expected Order Date' },
  { key: 'invoiceDate', label: 'Expected Ship Date' },
  { key: 'lastUpdated', label: 'Last Updated' },
]

export const OPPORTUNITY_PERIODS = [
  { key: 'all', label: 'All time' },
  { key: 'specific', label: 'Specific date' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'quarter', label: 'This quarter' },
  { key: 'year', label: 'This year' },
  { key: 'custom', label: 'Custom range' },
]

const dateOnly = date => date.toISOString().slice(0, 10)
const parseDateOnly = value => new Date(`${value}T00:00:00Z`)
const shiftDateOnly = (value, days) => {
  const date = parseDateOnly(value)
  date.setUTCDate(date.getUTCDate() + days)
  return dateOnly(date)
}

export function opportunityDateRange(period, values = {}, now = new Date()) {
  const today = istDateKey(now)
  if (!period || period === 'all') return { range: null, error: '' }
  if (period === 'specific') {
    return values.date ? { range: [values.date, values.date], error: '' } : { range: null, error: '' }
  }
  if (period === 'custom') {
    const from = values.from || ''
    const to = values.to || ''
    return from && to && from > to
      ? { range: null, error: 'From date must be on or before the To date.' }
      : { range: from || to ? [from, to] : null, error: '' }
  }
  if (!today) return { range: null, error: '' }
  const date = parseDateOnly(today)
  if (period === 'week') {
    const mondayOffset = (date.getUTCDay() + 6) % 7
    const monday = shiftDateOnly(today, -mondayOffset)
    return { range: [monday, shiftDateOnly(monday, 6)], error: '' }
  }
  if (period === 'month') {
    const start = `${today.slice(0, 8)}01`
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
    return { range: [start, dateOnly(end)], error: '' }
  }
  if (period === 'quarter') {
    const month = date.getUTCMonth()
    const startMonth = Math.floor(month / 3) * 3
    const start = new Date(Date.UTC(date.getUTCFullYear(), startMonth, 1))
    const end = new Date(Date.UTC(date.getUTCFullYear(), startMonth + 3, 0))
    return { range: [dateOnly(start), dateOnly(end)], error: '' }
  }
  if (period === 'year') return { range: [`${today.slice(0, 4)}-01-01`, `${today.slice(0, 4)}-12-31`], error: '' }
  return { range: null, error: '' }
}

export function fmt(n, digits = 0) {
  if (n === '' || n == null || isNaN(n)) return ''
  return Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

// The business mailbox operates on India Standard Time for every user. Keep
// persisted event stamps explicit so a Dubai (or any other) browser cannot
// silently change what operators see.
export const BUSINESS_TIME_ZONE = 'Asia/Kolkata'

export function nowIST() {
  return toISTISOString(new Date())
}

export function toISTISOString(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const shifted = new Date(date.getTime() + 330 * 60 * 1000)
  return shifted.toISOString().replace('Z', '+05:30')
}

export function formatISTTime(value, options = {}) {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-IN', {
    timeZone: BUSINESS_TIME_ZONE,
    hour: 'numeric', minute: '2-digit',
    ...options,
  })
}

export function formatISTDate(value, options = {}) {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-IN', {
    timeZone: BUSINESS_TIME_ZONE,
    day: '2-digit', month: 'short', year: 'numeric',
    ...options,
  })
}

export function formatISTDateTime(value) {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return ''
  return `${formatISTDate(date)} ${formatISTTime(date)}`
}

// Opportunity values remain stored internally in ₹ thousands for compatibility
// with the existing pipeline and proposal model. Opportunity screens use full ₹.
export function fmtRupeesFromK(valueK) {
  if (valueK === '' || valueK == null || isNaN(valueK)) return ''
  return `₹${fmt(Number(valueK) * 1000)}`
}

export function rupeesToK(value) {
  if (value === '' || value == null || isNaN(value)) return 0
  return Number(value) / 1000
}

export function fmtLakh(valueK) {
  // valueK is ₹ thousands
  const l = valueK / 100
  if (l >= 100) return `₹${(l / 100).toFixed(2)} Cr`
  return `₹${l.toFixed(1)} L`
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function monthKey(dateStr) {
  if (!dateStr) return ''
  return dateStr.slice(0, 7) // YYYY-MM
}

// This legacy/demo row is retained in stored data for audit/history, but is
// intentionally omitted from dashboard and opportunity-list presentations.
export const HIDDEN_DASHBOARD_OPPORTUNITY_NAME = 'Primary 10 Opportunity'
export function isHiddenDashboardOpportunity(opportunity) {
  return String(opportunity?.oppName || '').trim().toLowerCase()
    === HIDDEN_DASHBOARD_OPPORTUNITY_NAME.toLowerCase()
}

// "Jun-26" style, as in the pipeline sheet's date columns.
export function mmmYY(dateStr) {
  if (!dateStr) return ''
  const [y, m] = dateStr.split('-')
  return `${MONTHS[parseInt(m, 10) - 1]}-${y.slice(2)}`
}

export function monthLabel(key) {
  return mmmYY(key + '-01')
}

// "28-Jul-26" style, as the sheet's Last Updated column shows day-level dates.
export function ddMmmYY(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${d}-${MONTHS[parseInt(m, 10) - 1]}-${y.slice(2)}`
}

// "DD/MM/YYYY" style for user-facing proposal and forecast dates. Persisted
// values remain ISO dates so inputs, sorting, and date filtering stay stable.
export function ddMMyyyy(dateStr) {
  if (!dateStr) return ''
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : ''
}

// Evaluate an Excel-style formula ("=8.5%+2.5%+5%", "=112*1.16*0.5", "4299").
// Arithmetic + parentheses + percent literals only. Returns { value, usedPct }
// or null if the text isn't a valid formula.
export function evalFormula(text) {
  let s = String(text ?? '').trim()
  if (!s) return null
  if (s.startsWith('=')) s = s.slice(1)
  const usedPct = /%/.test(s)
  s = s.replace(/(?<=\d),(?=\d)/g, '')                       // strip 4,299-style grouping commas
  s = s.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)')
  s = s.replace(/ROUNDUP\s*\(((?:[^(),]|\([^()]*\))*),\s*0\s*\)/gi, 'C($1)')
  if (s.includes(',')) return null                           // any leftover comma would be the JS comma operator
  if (!/^[-+*/().\d\sC]+$/.test(s)) return null
  try {
    // C = Excel ROUNDUP(x, 0): away from zero, unlike Math.ceil for negatives.
    const value = Function('C', '"use strict"; return (' + s + ')')(x => (x < 0 ? Math.floor(x) : Math.ceil(x)))
    return typeof value === 'number' && isFinite(value) ? { value, usedPct } : null
  } catch {
    return null
  }
}

// "Extract to Excel" — CSV download (opens directly in Excel).
export function exportCSV(filename, headers, rows) {
  const esc = v => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

// Gmail compose URL. The `tf=cm` trigger is the current Gmail web format;
// `view=cm&fs=1` can open Gmail without applying the prefilled body. Unlike
// `mailto:`, this does not depend on a desktop mail client being configured.
// Shared by the proposal dispatch dialog and the lead clarification draft so
// the two cannot drift.
//
// Nothing here sends: it builds a link a human clicks, which opens a compose
// window they still have to review and submit. That is the whole point on the
// lead side — see src/leadClarification.js.
export function gmailComposeHref({ to = '', cc = '', subject = '', body = '' } = {}) {
  if (!String(to).trim()) return ''
  const encBody = encodeURIComponent(String(body))
  const ccPart = String(cc).trim() ? `&cc=${encodeURIComponent(String(cc).trim())}` : ''
  return 'https://mail.google.com/mail/u/0/?'
    + `to=${encodeURIComponent(String(to).trim())}`
    + `&su=${encodeURIComponent(subject)}${ccPart}&body=${encBody}&tf=cm`
}
