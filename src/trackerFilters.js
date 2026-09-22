// Filtering and sorting semantics for the tracker's columns.
//
// Deliberately not a field on COLS: that array is the sheet's presentation
// table (spreadsheet letter, label, width weights) and is shared with MyOpps,
// while this is the filter dimension. Keeping it here also means the type map,
// the ops table and the evaluator are one module with no React, no DOM and no
// import back into the page that imports it.

import { fmt, opportunityDateRange, OPPORTUNITY_PERIODS } from './utils.js'

// Every key in COLS. Three that read oddly and are correct:
//   prob   - the label says "Prob (%)" but PROB_LEVELS is Low/Medium/High.
//   id     - same ops as text; the type suppresses the right-click override so
//            the Opp ID anchor keeps its native menu, and collapses the value
//            list, which would otherwise be one row per opportunity.
//   stage  - enum over the RAW value; the cell renders workflowStageLabelFor().
//            A filter built from rendered text would match nothing.
export const COL_TYPES = {
  id: 'link',
  sellTo: 'text',
  category: 'enum',
  location: 'text',
  customerStatus: 'enum',
  eucName: 'text',
  eucLocation: 'text',
  oppName: 'longtext',
  owner: 'enum',
  oppType: 'enum',
  bu: 'enum',
  segment: 'enum',
  product: 'multi-enum',
  prob: 'enum',
  valueK: 'currency',
  cogsK: 'currency',
  gmK: 'currency',
  gmPct: 'percent',
  createDate: 'date',
  proposalDate: 'date',
  orderDate: 'date',
  invoiceDate: 'date',
  status: 'enum',
  stage: 'enum',
  closedReason: 'enum',
  contactPerson: 'text',
  contactPhone: 'text',
  lastUpdated: 'date',
  forecast: 'bool',
  remarks: 'longtext',
  nextActionOwner: 'enum',
}

export const colType = key => COL_TYPES[key] || 'text'

/** Match the toolbar search against the same rendered values users see in cells. */
export function matchesGlobalSearch(row, query, columns, valueOf) {
  const needle = String(query || '').trim().toLowerCase()
  if (!needle) return true
  return columns.some(({ key }) => String(valueOf(row, key) ?? '').toLowerCase().includes(needle))
}

const OP = (op, label, arity = 1) => ({ op, label, arity })

export const TEXT_OPS = [
  OP('contains', 'Contains…'), OP('ncontains', 'Does not contain…'),
  OP('begins', 'Begins with…'), OP('ends', 'Ends with…'), OP('eq', 'Equals…'),
  OP('blank', 'Is blank', 0), OP('nblank', 'Is not blank', 0),
]
export const NUM_OPS = [
  OP('eq', 'Equals'), OP('ne', 'Does not equal'),
  OP('gt', 'Greater than'), OP('gte', 'Greater than or equal to'),
  OP('lt', 'Less than'), OP('lte', 'Less than or equal to'),
  OP('between', 'Between', 2), OP('blank', 'Is blank', 0),
]
export const DATE_OPS = [
  OP('period', 'Period…'), OP('before', 'Before'), OP('after', 'After'),
  OP('between', 'Between', 2), OP('blank', 'Is blank', 0), OP('nblank', 'Is not blank', 0),
]
export const BOOL_OPS = [OP('checked', 'Is checked', 0), OP('unchecked', 'Is unchecked', 0)]
export const MULTI_OPS = [
  OP('hasany', 'Contains any of'), OP('hasall', 'Contains all of'),
  OP('hasnone', 'Contains none of'), OP('blank', 'Is blank', 0), OP('nblank', 'Is not blank', 0),
]

// enum columns get no conditions: the checkbox list already is their filter.
export const OPS_BY_TYPE = {
  text: TEXT_OPS, longtext: TEXT_OPS, link: TEXT_OPS,
  currency: NUM_OPS, percent: NUM_OPS, number: NUM_OPS,
  date: DATE_OPS, bool: BOOL_OPS, 'multi-enum': MULTI_OPS, enum: [],
}

export const opsFor = type => OPS_BY_TYPE[type] || TEXT_OPS

const norm = v => String(v ?? '').trim().toLowerCase()

/** Tolerates a pasted "₹12,00,000" as well as a typed 1200000. */
const numOf = v => {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

const listOf = v => (Array.isArray(v) ? v : [v]).filter(Boolean).map(norm)
const wantOf = a => (Array.isArray(a) ? a : String(a ?? '').split(',')).map(norm).filter(Boolean)

/**
 * Evaluate one clause. `value` arrives already type-adapted by the caller
 * (Tracker's condVal), never as display text: mmmYY('2026-06-01') sorts as
 * "Jun-26", '✓ Checked' is not a boolean and '45%' is not a number.
 *
 * Two rules hold throughout: an empty operand never filters, so a half-typed
 * clause cannot blank the sheet; and a bounded test on a date excludes blanks,
 * while `blank` / `nblank` are how you ask about them.
 */
export function evalCondition(cond, type, value, now = new Date()) {
  if (!cond || !cond.op) return true
  const { op, a = '', b = '' } = cond

  if (type === 'bool') return op === 'unchecked' ? !value : !!value

  if (type === 'date') {
    const iso = String(value || '').slice(0, 10)
    if (op === 'blank') return !iso
    if (op === 'nblank') return !!iso
    if (op === 'period') {
      const { range } = opportunityDateRange(cond.period, { date: a, from: a, to: b }, now)
      if (!range) return true
      return !!iso && (!range[0] || iso >= range[0]) && (!range[1] || iso <= range[1])
    }
    if (!iso) return false
    if (op === 'before') return !a || iso < a
    if (op === 'after') return !a || iso > a
    if (op === 'between') return (!a || iso >= a) && (!b || iso <= b)
    return true
  }

  if (type === 'currency' || type === 'percent' || type === 'number') {
    const n = numOf(value)
    if (op === 'blank') return n == null
    if (n == null) return false
    const x = numOf(a), y = numOf(b)
    switch (op) {
      case 'eq': return x == null || n === x
      case 'ne': return x == null || n !== x
      case 'gt': return x == null || n > x
      case 'gte': return x == null || n >= x
      case 'lt': return x == null || n < x
      case 'lte': return x == null || n <= x
      case 'between': return (x == null || n >= x) && (y == null || n <= y)
      default: return true
    }
  }

  if (type === 'multi-enum') {
    const list = listOf(value)
    if (op === 'blank') return !list.length
    if (op === 'nblank') return !!list.length
    const want = wantOf(a)
    if (!want.length) return true
    if (op === 'hasall') return want.every(w => list.includes(w))
    if (op === 'hasnone') return !want.some(w => list.includes(w))
    return want.some(w => list.includes(w))
  }

  const s = norm(value), q = norm(a)
  if (op === 'blank') return s === ''
  if (op === 'nblank') return s !== ''
  if (!q) return true
  switch (op) {
    case 'contains': return s.includes(q)
    case 'ncontains': return !s.includes(q)
    case 'begins': return s.startsWith(q)
    case 'ends': return s.endsWith(q)
    case 'eq': return s === q
    default: return true
  }
}

/** "Would this clause exclude anything?" — drives the header badge and the count. */
export function isConditionActive(cond, type) {
  if (!cond || !cond.op) return false
  const spec = opsFor(type).find(s => s.op === cond.op)
  if (!spec) return false
  if (spec.arity === 0) return true
  if (cond.op === 'period') return !!cond.period && cond.period !== 'all'
  const a = Array.isArray(cond.a) ? cond.a.join('') : String(cond.a ?? '')
  return !!a.trim() || !!String(cond.b ?? '').trim()
}

export function blankCondition(type) {
  const first = opsFor(type)[0]
  return { op: first ? first.op : '', a: '', b: '', period: 'all' }
}

const SIGNS = { eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤' }

/** Short human form for the header tooltip and the Phase 3 filter chips. */
export function conditionSummary(cond, type) {
  if (!isConditionActive(cond, type)) return ''
  const { op, a = '', b = '' } = cond
  if (op === 'blank') return 'Is blank'
  if (op === 'nblank') return 'Is not blank'
  if (op === 'checked') return 'Checked'
  if (op === 'unchecked') return 'Unchecked'
  if (op === 'period') {
    return OPPORTUNITY_PERIODS.find(p => p.key === cond.period)?.label || String(cond.period)
  }
  const money = type === 'currency'
  const one = v => (money ? `₹${fmt(numOf(v))}` : type === 'percent' ? `${v}%` : String(v))
  if (op === 'between') return `${one(a)} – ${one(b)}`
  if (op === 'before') return `Before ${a}`
  if (op === 'after') return `After ${a}`
  if (SIGNS[op] && (money || type === 'percent' || type === 'number')) return `${SIGNS[op]} ${one(a)}`
  const wordy = { contains: 'Contains', ncontains: 'Does not contain', begins: 'Begins with', ends: 'Ends with', eq: 'Equals' }
  if (op === 'hasany') return `Any of ${wantOf(a).length}`
  if (op === 'hasall') return `All of ${wantOf(a).length}`
  if (op === 'hasnone') return `None of ${wantOf(a).length}`
  return `${wordy[op] || op} "${a}"`
}

/**
 * Above this many distinct values the checkbox list opens collapsed. Nothing is
 * removed — this codebase's rule is that the full sheet stays one click away —
 * but a checkbox-per-row list cannot help on money or free text.
 */
export const VALUE_LIST_CAP = 50

export function valueListMode(type, distinctCount) {
  if (type === 'bool') return 'none'            // the Yes/No/All radio is the filter
  if (type === 'longtext' || type === 'currency' || type === 'link') return 'collapsed'
  return distinctCount > VALUE_LIST_CAP ? 'collapsed' : 'open'
}

/**
 * Lifted verbatim from the tracker's single-key comparator so multi-column sort
 * behaves identically per clause. Blanks are forced last BEFORE dir is applied,
 * which is deliberate: they stay at the bottom in both directions.
 */
export function compareVals(va, vb, dir) {
  const aBlank = va === '' || va == null
  const bBlank = vb === '' || vb == null
  if (aBlank || bBlank) {
    if (aBlank && bBlank) return 0
    return aBlank ? 1 : -1
  }
  if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
  return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir
}

/** Sort menu labels read differently per type; the mechanism is the same. */
export function sortLabels(type) {
  if (type === 'date') return { asc: 'Oldest to Newest', desc: 'Newest to Oldest' }
  if (type === 'currency' || type === 'percent' || type === 'number') {
    return { asc: 'Smallest to Largest', desc: 'Largest to Smallest' }
  }
  return { asc: 'A to Z', desc: 'Z to A' }
}
