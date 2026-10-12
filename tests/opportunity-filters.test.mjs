import test from 'node:test'
import assert from 'node:assert/strict'
import { filterOpportunityRows, normalizeOpportunityFilters, opportunityFilterFields, opportunityFilterDateState } from '../src/opportunityFilters.js'

const rows = [
  { id: 'a', owner: 'PP', stage: 'Budgetary', status: 'Open', prob: 'High', oppType: 'Service', orderDate: '2026-10-01', valueK: 100, sellTo: 'Acme' },
  { id: 'b', owner: 'PP', stage: 'RFQ', status: 'Open', prob: 'Medium', oppType: 'Service', orderDate: '2026-10-31', valueK: 200, sellTo: 'Acme' },
  { id: 'c', owner: 'LJS', stage: 'RFQ', status: 'Open', prob: 'High', oppType: 'Spares', orderDate: '2026-11-01', valueK: 300, sellTo: 'Beta' },
  { id: 'd', owner: 'PP', stage: 'Won', status: 'Closed', prob: '', oppType: 'Service', orderDate: '', valueK: 400, sellTo: 'Acme' },
]
const context = { columns: ['id', 'sellTo', 'stage', 'owner'].map(key => ({ key })), valueOf: (row, key) => row[key] ?? '', now: new Date('2026-10-12T12:00:00Z') }
const ids = criteria => filterOpportunityRows(rows, { scope: 'global', ...criteria }, context).map(row => row.id)
test('fields combine with AND and selections within fields with OR', () => {
  assert.deepEqual(ids({ filters: { owner: new Set(['PP']), stage: new Set(['Budgetary', 'RFQ']), prob: new Set(['High']) } }), ['a'])
  assert.deepEqual(ids({ filters: { stage: new Set(['Budgetary', 'RFQ']) }, search: 'Acme' }), ['a', 'b'])
})
test('empty selection is all, while Not set explicitly matches missing data', () => {
  assert.equal(ids({ filters: { prob: new Set() } }).length, 4)
  assert.deepEqual(ids({ filters: { prob: new Set(['']) } }), ['d'])
})
test('My View and My Orders restrict the base before filters and preview counts', () => {
  assert.deepEqual(ids({ scope: 'my', actor: 'PP', filters: { owner: new Set(['LJS']) } }), ['a', 'b', 'd'])
  assert.deepEqual(ids({ scope: 'my', actor: 'LJS', sheet: 'My Orders' }), [])
  assert.deepEqual(ids({ sheet: 'My Orders' }), ['d'])
})
test('dates include boundaries and exclude blanks only when active', () => {
  assert.deepEqual(ids({ date: { field: 'orderDate', period: 'custom', from: '2026-10-01', to: '2026-10-31' } }), ['a', 'b'])
  assert.deepEqual(ids({ date: { field: 'orderDate', period: 'month' } }), ['a', 'b'])
  assert.equal(ids({ date: { field: 'orderDate', period: 'all' } }).length, 4)
})
test('invalid and incomplete constrained dates cannot be applied', () => {
  for (const date of [{ period: 'specific', date: '' }, { period: 'specific', date: '2026-02-30' }, { period: 'custom', from: '', to: '' }, { period: 'custom', from: '2026-10-31', to: '2026-10-01' }]) assert.ok(opportunityFilterDateState(date).error)
})
test('advanced conditions compose with selections and search', () => {
  assert.deepEqual(ids({ search: 'Acme', filters: { status: new Set(['Open']) }, conditions: { valueK: { op: 'gte', a: '150' } } }), ['b'])
})
test('badge counts fields once, includes owner, and excludes My View owner', () => {
  const criteria = { filters: { owner: new Set(['PP']), valueK: new Set(['100']) }, conditions: { valueK: { op: 'gte', a: '100' } }, search: 'Acme', sort: { key: 'id', dir: 1 } }
  assert.equal(opportunityFilterFields(criteria, 'global').size, 2)
  assert.equal(opportunityFilterFields(criteria, 'my').size, 1)
})
test('legacy owner selection becomes the same field used by column filters', () => {
  assert.deepEqual([...normalizeOpportunityFilters({}, 'PP').owner], ['PP'])
  assert.deepEqual([...normalizeOpportunityFilters({ owner: new Set(['LJS']) }, 'PP').owner], ['LJS'])
  assert.equal(normalizeOpportunityFilters({ owner: undefined }, 'PP').owner, undefined)
})
test('draft edits do not mutate applied selections and preview uses the same evaluator', () => {
  const applied = { filters: { stage: new Set(['Budgetary']) } }
  const draft = { ...applied, filters: { ...applied.filters, stage: new Set(['RFQ']) } }
  assert.deepEqual(ids(applied), ['a'])
  assert.deepEqual(ids(draft), ['b', 'c'])
  assert.deepEqual(filterOpportunityRows(rows, draft, context).map(row => row.id), ids(draft))
})
