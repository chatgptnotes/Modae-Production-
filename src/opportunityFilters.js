import { opportunityDateRange } from './utils.js'
import { colType, evalCondition, isConditionActive, matchesGlobalSearch } from './trackerFilters.js'

export const DEFAULT_OPPORTUNITY_DATE_FILTER = { field: 'orderDate', period: 'all', date: '', from: '', to: '' }

export function opportunityFilterDateState(date, now) {
  if (date.period === 'specific' && !date.date) return { range: null, error: 'Choose a specific date.' }
  if (date.period === 'custom' && !date.from && !date.to) return { range: null, error: 'Enter a From or To date.' }
  const values = date.period === 'specific' ? [date.date] : date.period === 'custom' ? [date.from, date.to] : []
  for (const value of values.filter(Boolean)) {
    const parsed = new Date(`${value}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return { range: null, error: 'Enter a valid date.' }
  }
  return opportunityDateRange(date.period, date, now)
}

export function normalizeOpportunityFilters(filters = {}, legacyOwner = 'All') {
  const result = Object.fromEntries(Object.entries(filters).filter(([, values]) => values instanceof Set && values.size))
  if (!Object.hasOwn(filters, 'owner') && legacyOwner !== 'All') result.owner = new Set([legacyOwner])
  return result
}

export function matchesOpportunitySelections(row, filters, valueOf, except = null) {
  return Object.entries(filters).every(([key, values]) => key === except || !(values instanceof Set) || !values.size || values.has(String(valueOf(row, key) ?? '')))
}

export function matchesOpportunityConditions(row, conditions, valueOf, except = null) {
  return Object.entries(conditions).every(([key, condition]) => key === except || !isConditionActive(condition, colType(key)) || evalCondition(condition, colType(key), valueOf(row, key)))
}

export function matchesOpportunityDate(row, date, now) {
  const { range, error } = opportunityFilterDateState(date, now)
  if (error) return false
  if (!range) return true
  const value = String(row[date.field] || '').slice(0, 10)
  return Boolean(value) && (!range[0] || value >= range[0]) && (!range[1] || value <= range[1])
}

export function scopedOpportunityRows(rows, scope, actor, sheet) {
  return rows.filter(row => (scope !== 'my' || row.owner === actor)
    && (sheet === 'Archived' ? Boolean(row.pipelineArchivedAt) : !row.pipelineArchivedAt)
    && (sheet !== 'My Orders' || (row.status === 'Closed' && row.stage === 'Won')))
}

// One evaluator for the applied table/cards/export and the popup's draft count.
export function filterOpportunityRows(rows, criteria, { columns, valueOf, conditionValueOf = valueOf, now }) {
  const { scope, actor, sheet, search = '', filters = {}, conditions = {}, date = DEFAULT_OPPORTUNITY_DATE_FILTER } = criteria
  return scopedOpportunityRows(rows, scope, actor, sheet).filter(row =>
    matchesGlobalSearch(row, search, columns, valueOf)
    && matchesOpportunitySelections(row, filters, valueOf, scope === 'my' ? 'owner' : null)
    && matchesOpportunityConditions(row, conditions, conditionValueOf, scope === 'my' ? 'owner' : null)
    && matchesOpportunityDate(row, date, now))
}

export function opportunityFilterFields({ filters = {}, conditions = {}, date = DEFAULT_OPPORTUNITY_DATE_FILTER }, scope) {
  const keys = new Set(Object.entries(filters).filter(([, values]) => values instanceof Set && values.size).map(([key]) => key))
  for (const [key, condition] of Object.entries(conditions)) if (isConditionActive(condition, colType(key))) keys.add(key)
  if (date.period !== 'all') keys.add(date.field)
  if (scope === 'my') keys.delete('owner')
  return keys
}
