import test from 'node:test'
import assert from 'node:assert/strict'
import { inboxViewCounts, matchesInboxView } from '../src/pages/inboxViews.js'

const leads = [
  { id: '1', status: 'New', starred: true },
  { id: '2', status: 'Qualified' },
  { id: '3', status: 'Converted', starred: true },
  { id: '4', status: 'Dropped' },
  { id: '5', status: 'Legacy' },
]

test('inbox review includes New and Qualified but not converted or dropped leads', () => {
  assert.deepEqual(leads.filter(row => matchesInboxView(row, 'review')).map(row => row.id), ['1', '2'])
})
test('converted and starred views are independent filters', () => {
  assert.deepEqual(leads.filter(row => matchesInboxView(row, 'converted')).map(row => row.id), ['3'])
  assert.deepEqual(leads.filter(row => matchesInboxView(row, 'starred')).map(row => row.id), ['1', '3'])
})
test('all leads preserves unknown legacy statuses', () => {
  assert.equal(leads.filter(row => matchesInboxView(row, 'all')).length, 5)
})
test('tab counts reflect supplied scoped filtered rows, not the selected tab', () => {
  assert.deepEqual(inboxViewCounts(leads), { all: 5, review: 2, converted: 1, starred: 2 })
  assert.deepEqual(inboxViewCounts(leads.slice(1, 3)), { all: 2, review: 1, converted: 1, starred: 1 })
})
test('empty inbox returns zero counts', () => {
  assert.deepEqual(inboxViewCounts([]), { all: 0, review: 0, converted: 0, starred: 0 })
})
test('counting views does not reorder or modify shared lead records', () => {
  const rows = Object.freeze(leads.map(row => Object.freeze({ ...row })))
  inboxViewCounts(rows)
  assert.deepEqual(rows.map(row => row.id), ['1', '2', '3', '4', '5'])
})
