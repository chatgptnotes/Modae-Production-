import test from 'node:test'
import assert from 'node:assert/strict'
import { columnSortValue, compareVals, evalCondition, isConditionActive } from '../src/trackerFilters.js'

test('numeric column sorting treats percentages numerically and leaves blanks last', () => {
  const values = ['12.5%', '-2%', '—', '100%']
  assert.deepEqual(values.sort((a,b) => compareVals(columnSortValue('gmPct', a), columnSortValue('gmPct', b), 1)), ['-2%', '12.5%', '100%', '—'])
  assert.equal(columnSortValue('valueK', '1,250'), 1250)
  assert.equal(columnSortValue('valueK', ''), null)
})
test('probability and fiscal quarters sort in business order', () => {
  assert.ok(columnSortValue('prob', 'Low') < columnSortValue('prob', 'Medium'))
  assert.ok(columnSortValue('prob', 'Medium') < columnSortValue('prob', 'High'))
  assert.ok(columnSortValue('fqFy', 'Q4-2025') < columnSortValue('fqFy', 'Q1-2026'))
})

test('numeric and percentage conditions preserve zero and exclude blanks from ranges', () => {
  assert.equal(evalCondition({ op: 'between', a: '0', b: '250' }, 'currency', 0), true)
  assert.equal(evalCondition({ op: 'between', a: '0', b: '250' }, 'currency', ''), false)
  assert.equal(evalCondition({ op: 'gt', a: '12.3' }, 'percent', 12.4), true)
  assert.equal(evalCondition({ op: 'blank' }, 'currency', null), true)
  assert.equal(isConditionActive({ op: 'gt', a: '' }, 'currency'), false)
})
test('date conditions compare real calendar dates with inclusive range endpoints', () => {
  const range = { op: 'between', a: '2025-12-31', b: '2026-01-02' }
  assert.equal(evalCondition(range, 'date', '2026-01-01'), true)
  assert.equal(evalCondition(range, 'date', '2026-01-02'), true)
  assert.equal(evalCondition(range, 'date', '2026-01-03'), false)
  assert.equal(evalCondition(range, 'date', ''), false)
})
test('text and multi-value conditions use case-insensitive complete values', () => {
  assert.equal(evalCondition({ op: 'contains', a: 'hydro' }, 'text', 'Andritz Hydro'), true)
  assert.equal(evalCondition({ op: 'hasall', a: 'Pump, Valve' }, 'multi-enum', ['pump','valve']), true)
  assert.equal(evalCondition({ op: 'hasall', a: 'Pump, Valve' }, 'multi-enum', ['pump']), false)
})
