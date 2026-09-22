import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FILTER_BLANK_LABEL, filterValueLabel, filterValueKey, matchesFilterQuery,
  allowsValue, normalizeAllowed, toggleValueIn, toggleSubsetIn,
  onlyValue, excludeValue, filterToSubset, distinctWithCounts, windowSlice,
} from '../src/columnFilter.js'
import { matchesGlobalSearch } from '../src/trackerFilters.js'

const VALUES = ['A', 'B', 'C']

test('global search scans every supplied rendered column value', () => {
  const columns = [{ key: 'id' }, { key: 'location' }, { key: 'remarks' }]
  const row = { id: 'OP-1', location: 'Pune', remarks: 'Awaiting KYC' }
  const valueOf = (record, key) => record[key]
  assert.equal(matchesGlobalSearch(row, 'pune', columns, valueOf), true)
  assert.equal(matchesGlobalSearch(row, 'kyc', columns, valueOf), true)
  assert.equal(matchesGlobalSearch(row, 'missing', columns, valueOf), false)
})

// The bug this module exists to fix: (Select All) stored every value when
// unchecked, which normalizes straight back to "everything passes", so the
// checkbox rendered unchecked while filtering nothing.
test('an empty selection stays an empty Set and is never collapsed to undefined', () => {
  assert.deepEqual(normalizeAllowed(new Set(), VALUES), new Set())
  assert.equal(normalizeAllowed(new Set(VALUES), VALUES), undefined)
  assert.deepEqual(normalizeAllowed(new Set(['A']), VALUES), new Set(['A']))
})

test('unselecting all really filters, and selecting all clears the filter', () => {
  assert.deepEqual(toggleSubsetIn(undefined, VALUES, VALUES), new Set())
  assert.equal(toggleSubsetIn(new Set(), VALUES, VALUES), undefined)
})

test('an empty Set excludes every row while undefined admits every row', () => {
  assert.equal(allowsValue(new Set(), 'anything'), false)
  assert.equal(allowsValue(undefined, 'anything'), true)
  assert.equal(allowsValue(new Set(['A']), 'A'), true)
  assert.equal(allowsValue(new Set(['A']), 'B'), false)
})

test('Select All over a search subset leaves values outside the subset alone', () => {
  assert.deepEqual(toggleSubsetIn(new Set(['A']), VALUES, ['B']), new Set(['A', 'B']))
  assert.deepEqual(toggleSubsetIn(new Set(['A', 'B']), VALUES, ['B']), new Set(['A']))
  // Ticking a subset that is already fully on turns just that subset off.
  assert.deepEqual(toggleSubsetIn(undefined, VALUES, ['A']), new Set(['B', 'C']))
})

test('toggling one value walks in and out of the full selection', () => {
  assert.deepEqual(toggleValueIn(undefined, VALUES, 'B'), new Set(['A', 'C']))
  assert.equal(toggleValueIn(new Set(['A', 'C']), VALUES, 'B'), undefined)
})

test('blanks are labelled, keyed distinctly, and findable by typing blank', () => {
  assert.equal(filterValueLabel(''), FILTER_BLANK_LABEL)
  assert.equal(filterValueLabel('Won'), 'Won')
  assert.notEqual(filterValueKey(''), filterValueKey('(blank)'))
  for (const q of ['blank', 'blanks', '(bla', '(blanks)']) {
    assert.equal(matchesFilterQuery('', q), true, q)
  }
  assert.equal(matchesFilterQuery('Won', 'blank'), false)
  assert.equal(matchesFilterQuery('Negotiation', 'goti'), true)
})

test('only and exclude narrow the selection and are idempotent', () => {
  assert.deepEqual(onlyValue(VALUES, 'B'), new Set(['B']))
  assert.equal(onlyValue(['A'], 'A'), undefined)          // sole value == no filter
  assert.deepEqual(excludeValue(undefined, VALUES, 'A'), new Set(['B', 'C']))
  const once = excludeValue(undefined, VALUES, 'A')
  assert.deepEqual(excludeValue(once, VALUES, 'A'), new Set(['B', 'C']))
  assert.deepEqual(filterToSubset(VALUES, ['B', 'C']), new Set(['B', 'C']))
})

test('counts are correct in one pass, numeric-aware, with blanks last', () => {
  const rows = [
    { stage: 'Won' }, { stage: 'Lost' }, { stage: 'Won' }, { stage: '' }, { stage: 'Won' },
  ]
  const { values, counts } = distinctWithCounts(rows, o => o.stage)
  assert.deepEqual(values, ['Lost', 'Won', ''])
  assert.equal(counts.get('Won'), 3)
  assert.equal(counts.get('Lost'), 1)
  assert.equal(counts.get(''), 1)

  const nums = [{ v: '10' }, { v: '2' }, { v: '10' }]
  assert.deepEqual(distinctWithCounts(nums, o => o.v).values, ['2', '10'])
})

test('counts hold up over a large fixture', () => {
  const rows = Array.from({ length: 5000 }, (_, i) => ({ bu: `BU${i % 7}` }))
  const { values, counts } = distinctWithCounts(rows, o => o.bu)
  assert.equal(values.length, 7)
  assert.equal([...counts.values()].reduce((a, b) => a + b, 0), 5000)
  assert.equal(counts.get('BU0'), Math.ceil(5000 / 7))
})

test('a multi-valued row counts on each of its values', () => {
  const rows = [{ p: ['B&K', 'Metrix'] }, { p: ['B&K'] }, { p: [] }]
  const { values, counts } = distinctWithCounts(rows, o => o.p)
  assert.deepEqual(values, ['B&K', 'Metrix', ''])
  assert.equal(counts.get('B&K'), 2)
  assert.equal(counts.get('Metrix'), 1)
  assert.equal(counts.get(''), 1)
})

test('date labels order by the earliest raw date behind them, not first sight', () => {
  const rows = [
    { label: 'Jun-26', iso: '2026-06-01' },
    { label: 'Sep-25', iso: '2025-09-14' },
    { label: 'Jun-26', iso: '2026-06-20' },
    { label: '', iso: '' },
  ]
  const { values } = distinctWithCounts(rows, o => o.label, o => o.iso)
  assert.deepEqual(values, ['Sep-25', 'Jun-26', ''])
})

test('windowSlice keeps the scrollbar honest and stays in bounds', () => {
  const H = 28, VIEW = 252, N = 400
  const at0 = windowSlice(N, 0, H, VIEW, 4)
  assert.equal(at0.start, 0)
  assert.equal(at0.padTop, 0)

  for (const scrollTop of [0, 140, 1000, 5000, 999999]) {
    const s = windowSlice(N, scrollTop, H, VIEW, 4)
    assert.ok(s.start >= 0 && s.end <= N, `bounds at ${scrollTop}`)
    assert.equal(s.padTop + (s.end - s.start) * H + s.padBottom, N * H, `invariant at ${scrollTop}`)
  }
  assert.deepEqual(windowSlice(0, 0, H, VIEW), { start: 0, end: 0, padTop: 0, padBottom: 0 })
})
