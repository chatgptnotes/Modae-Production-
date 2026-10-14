import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarDays, shiftCalendarMonth, calendarSelection, dateFilterSummary } from '../src/opportunityCalendar.js'

test('calendar uses Monday columns, includes leap day, and pads complete weeks', () => {
  const days = calendarDays('2024-02')
  assert.equal(days[3], '2024-02-01')
  assert.equal(days.filter(Boolean).length, 29)
  assert.equal(days.length % 7, 0)
  assert.equal(calendarDays('2025-02').filter(Boolean).length, 28)
})
test('month navigation clamps dates across years and supports historical years', () => {
  assert.equal(shiftCalendarMonth('2026-01', -1), '2025-12')
  assert.equal(shiftCalendarMonth('2026-12', 1), '2027-01')
  assert.equal(shiftCalendarMonth('0001-01', -1), '0001-01')
  assert.equal(shiftCalendarMonth('9999-12', 1), '9999-12')
})
test('range needs two clicks and normalizes reversed and same-day selections', () => {
  assert.equal(calendarSelection('range', '', '2026-10-28'), null)
  assert.deepEqual(calendarSelection('range', '2026-10-28', '2026-10-14'), { period: 'custom', date: '', from: '2026-10-14', to: '2026-10-28' })
  assert.deepEqual(calendarSelection('range', '2026-10-14', '2026-10-14'), { period: 'custom', date: '', from: '2026-10-14', to: '2026-10-14' })
  assert.deepEqual(calendarSelection('single', '', '2024-02-29'), { period: 'specific', date: '2024-02-29', from: '', to: '' })
})
test('summaries distinguish single dates, ranges, open bounds and relative periods', () => {
  assert.equal(dateFilterSummary({ period: 'specific', date: '2026-10-14' }), '14 Oct 2026')
  assert.equal(dateFilterSummary({ period: 'custom', from: '2026-10-14', to: '2026-10-28' }), '14–28 Oct 2026')
  assert.equal(dateFilterSummary({ period: 'custom', from: '2026-12-31', to: '2027-01-02' }), '31 Dec 2026 – 2 Jan 2027')
  assert.equal(dateFilterSummary({ period: 'custom', from: '2026-10-14', to: '' }), 'From 14 Oct 2026')
  assert.equal(dateFilterSummary({ period: 'custom', from: '', to: '2026-10-14' }), 'Until 14 Oct 2026')
  assert.equal(dateFilterSummary({ period: 'month' }), 'This month')
  assert.equal(dateFilterSummary({ period: 'all' }), 'Any time')
})
