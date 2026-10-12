import test from 'node:test'
import assert from 'node:assert/strict'
import { changedOpportunityFields, validateOpportunityEdit } from '../src/opportunityEdits.js'
test('saves only changed fields and preserves independent remote edits', () => {
  assert.deepEqual(changedOpportunityFields({ name: 'A', amount: 1 }, { name: 'B', amount: 1 }, { name: 'A', amount: 2 }), { name: 'B' })
})
test('detects overlapping changes without overwriting newer data', () => {
  assert.throws(() => changedOpportunityFields({ name: 'A' }, { name: 'B' }, { name: 'C' }), /changed elsewhere/)
  assert.deepEqual(changedOpportunityFields({ name: 'A' }, { name: 'B' }, { name: 'B' }), { name: 'B' })
})
test('array drafts compare by contents, empty numbers are allowed and invalid numbers rejected', () => {
  assert.deepEqual(changedOpportunityFields({ product: ['A'] }, { product: ['A'] }, { product: ['B'] }), {})
  for (const value of [-1, NaN, Infinity, 'abc']) assert.throws(() => validateOpportunityEdit('valueK', value))
  for (const value of [0, '', null, 0.15]) assert.equal(validateOpportunityEdit('cogsK', value), value)
  assert.throws(() => validateOpportunityEdit('contactEmail', 'invalid'))
})
