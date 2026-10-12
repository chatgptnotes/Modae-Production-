import { PIPELINE_COLUMNS } from './excelLogic.js'

const dates = new Set(['createDate', 'proposalDate', 'orderDate', 'invoiceDate', 'lastUpdated', 'bookingDate'])
export const SEARCH_FIELDS = Object.fromEntries([...PIPELINE_COLUMNS, { key: 'bookingDate', label: 'Verified booking date' }].map(col => [col.key, {
  label: col.key === 'owner' ? 'Owner' : col.key === 'oppName' ? 'Opportunity description' : col.label.replace(/\*$/, ''),
  type: dates.has(col.key) ? 'date' : col.num ? 'number' : col.key === 'forecast' ? 'boolean' : col.key === 'product' ? 'list' : 'text',
}]))
const ops = {
  text: ['eq', 'ne', 'in', 'notIn', 'contains', 'notContains', 'startsWith', 'endsWith', 'blank', 'notBlank'],
  number: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'blank', 'notBlank'],
  date: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'blank', 'notBlank'],
  boolean: ['eq', 'ne'], list: ['hasAny', 'hasAll', 'hasNone', 'blank', 'notBlank'],
}
export const SEARCH_OPERATORS = ops
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
const shortText = (value, max = 500) => typeof value === 'string' && value.trim().length > 0 && value.length <= max
const invalid = () => { throw new Error('AI returned an unsupported or incomplete search. Please rephrase your request.') }

// Shared by the server and client. No arbitrary expressions, SQL, or executable code.
export function validateSearchResult(result) {
  if (!result || typeof result !== 'object') return invalid()
  if (result.status === 'clarify') {
    if (!shortText(result.question) || !Array.isArray(result.choices) || result.choices.length > 5 || result.choices.some(v => !shortText(v, 120))) return invalid()
    return { status: 'clarify', question: result.question, choices: result.choices }
  }
  if (result.status === 'unsupported') {
    if (!shortText(result.message)) return invalid()
    return { status: 'unsupported', message: result.message }
  }
  if (result.status !== 'ready' || !Array.isArray(result.groups) || !result.groups.length || result.groups.length > 6) return invalid()
  let count = 0
  const groups = result.groups.map(group => {
    if (!Array.isArray(group?.all) || !group.all.length) return invalid()
    return { all: group.all.map(clause => {
      const { field, op, values } = clause || {}
      if (!Object.hasOwn(SEARCH_FIELDS, field) || !ops[SEARCH_FIELDS[field].type].includes(op) || !Array.isArray(values)) return invalid()
      if (++count > 24 || values.length > 20 || values.some(v => !shortText(v, 300))) return invalid()
      const arity = ['blank', 'notBlank'].includes(op) ? 0 : op === 'between' ? 2 : ['in','notIn','hasAny','hasAll','hasNone'].includes(op) ? null : 1
      if (arity == null ? !values.length : values.length !== arity) return invalid()
      const type = SEARCH_FIELDS[field].type
      if (type === 'number' && values.some(v => !Number.isFinite(Number(v)))) return invalid()
      if (type === 'date' && values.some(v => !validDate(v))) return invalid()
      if (type === 'boolean' && values.some(v => !['true','false'].includes(v))) return invalid()
      if (op === 'between' && (type === 'number' ? Number(values[0]) > Number(values[1]) : values[0] > values[1])) return invalid()
      return { field, op, values: [...values] }
    }) }
  })
  let sort = null
  if (result.sort != null) {
    if (!Object.hasOwn(SEARCH_FIELDS, result.sort.key) || ![1,-1].includes(result.sort.dir)) return invalid()
    sort = { key: result.sort.key, dir: result.sort.dir }
  }
  return { status: 'ready', groups, sort }
}

export const WON_DATE_QUESTION = 'Which date should “won” use?'
export function requiredSearchClarification({ query = '', answers = [] } = {}) {
  const chosen = answers.some(a => a.question === WON_DATE_QUESTION && typeof a.answer === 'string' && a.answer.trim())
  if (!chosen && /\b(won|win|wins)\b/i.test(query) && /\b(after|before|between|since|during|in|last|this|from)\b/i.test(query)
    && !/\b(booking|booked|expected|order date|proposal date|created|creation|updated|invoice)\b/i.test(query)) {
    return { status: 'clarify', question: WON_DATE_QUESTION, choices: ['Expected order date', 'Verified booking date'] }
  }
  return null
}

const normalize = value => String(value ?? '').trim().toLowerCase()
export function matchesOpportunitySearch(row, plan, options = {}) {
  const me = options.me || ''
  const valueOf = Object.hasOwn(options, 'valueOf') ? options.valueOf : (record, field) => record[field]
  if (!plan) return true
  if (plan.status !== 'ready') return false
  return plan.groups.some(group => group.all.every(({ field, op, values }) => {
    const raw = field === 'forecast' ? !!valueOf(row, field) : valueOf(row, field)
    const blank = raw == null || raw === '' || raw === '—' || (Array.isArray(raw) && !raw.length)
    if (op === 'blank') return blank
    if (op === 'notBlank') return !blank
    if (blank) return false
    const type = SEARCH_FIELDS[field].type
    const adapt = v => type === 'number' ? Number(v) : type === 'date' ? String(v).slice(0,10) : normalize(v)
    const actual = adapt(raw)
    const expected = values.map(v => adapt(field === 'owner' && v === '@me' ? me : v))
    if (type === 'number' && !Number.isFinite(actual)) return false
    if (type === 'date' && !validDate(actual)) return false
    switch (op) {
      case 'eq': return actual === expected[0]
      case 'ne': return actual !== expected[0]
      case 'in': return expected.includes(actual)
      case 'notIn': return !expected.includes(actual)
      case 'gt': return actual > expected[0]
      case 'gte': return actual >= expected[0]
      case 'lt': return actual < expected[0]
      case 'lte': return actual <= expected[0]
      case 'between': return actual >= expected[0] && actual <= expected[1]
      case 'contains': return actual.includes(expected[0])
      case 'notContains': return !actual.includes(expected[0])
      case 'startsWith': return actual.startsWith(expected[0])
      case 'endsWith': return actual.endsWith(expected[0])
      default: {
        const list = (Array.isArray(raw) ? raw : String(raw).split(',')).map(normalize)
        if (op === 'hasAll') return expected.every(v => list.includes(v))
        if (op === 'hasNone') return expected.every(v => !list.includes(v))
        return op === 'hasAny' && expected.some(v => list.includes(v))
      }
    }
  }))
}
const words = { eq: 'is', ne: 'is not', gt: 'after / above', gte: 'on or after / at least', lt: 'before / below', lte: 'on or before / at most', between: 'between', contains: 'contains', notContains: 'does not contain', startsWith: 'starts with', endsWith: 'ends with', in: 'is one of', notIn: 'excludes', blank: 'is blank', notBlank: 'is not blank', hasAny: 'includes any', hasAll: 'includes all', hasNone: 'excludes' }
export function searchSummary(plan) {
  if (!plan || plan.status !== 'ready') return ''
  return plan.groups.map(group => group.all.map(({field,op,values}) => {
    const type = SEARCH_FIELDS[field].type
    const comparison = ['gt','gte','lt','lte'].includes(op) ? ({gt:type==='date'?'after':'above',gte:type==='date'?'on or after':'at least',lt:type==='date'?'before':'below',lte:type==='date'?'on or before':'at most'})[op] : words[op]
    return `${SEARCH_FIELDS[field].label} ${comparison}${values.length ? ` ${values.map(v=>v==='@me'?'me':v).join(op==='between'?' and ':', ')}` : ''}`
  }).join(' · ')).map((text, index, groups) => groups.length > 1 ? `(${text})` : text).join(' OR ')
}
