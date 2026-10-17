import test from 'node:test'
import assert from 'node:assert/strict'
import { changedOpportunityFields, validateOpportunityEdit, shouldValidateOpportunityInput } from '../src/opportunityEdits.js'
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

test('percentage edits keep decimals and zero, permit clearing, and reject invalid values', () => {
  for (const value of ['', null, undefined]) assert.equal(validateOpportunityEdit('probabilityPct', value), null)
  for (const [value, expected] of [['0', 0], ['62.5', 62.5], [100, 100]]) assert.equal(validateOpportunityEdit('probabilityPct', value), expected)
  for (const value of [-1, 101, 'abc', NaN, Infinity]) assert.throws(() => validateOpportunityEdit('probabilityPct', value), /probability|0.*100/i)
})


test('an unchanged legacy percentage does not block unrelated edits, but changed or malformed input is validated', () => {
  const base = { probabilityPct: '200', remarks: 'Old note' }
  const draft = { probabilityPct: '200', remarks: 'Updated note' }
  assert.deepEqual(changedOpportunityFields(base, draft, base), { remarks: 'Updated note' })
  assert.equal(shouldValidateOpportunityInput('probabilityPct', base, draft, { rangeOverflow: true }), false)
  assert.equal(shouldValidateOpportunityInput('probabilityPct', base, { ...draft, probabilityPct: '201' }, { rangeOverflow: true }), true)
  assert.equal(shouldValidateOpportunityInput('probabilityPct', { probabilityPct: '' }, { probabilityPct: '' }, { badInput: true }), true)
  assert.equal(shouldValidateOpportunityInput('contactEmail', base, draft, { typeMismatch: true }), true)
})
