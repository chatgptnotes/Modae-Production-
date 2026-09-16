import test from 'node:test'
import assert from 'node:assert/strict'

import { ageDays, isTodayIST } from '../src/utils.js'

test('Today uses the India business date for timestamps near midnight', () => {
  const now = '2026-09-16T17:24:00+05:30'
  assert.equal(isTodayIST('2026-09-16T00:10:00+05:30', new Date(now)), true)
  assert.equal(isTodayIST('2026-09-15T23:50:00+05:30', new Date(now)), false)
  assert.equal(isTodayIST('2026-09-16T00:20:00Z', new Date(now)), true)
})

test('age filters use calendar days rather than elapsed local-time rounding', () => {
  const now = new Date('2026-09-16T00:05:00+05:30')
  assert.equal(ageDays('2026-09-16', now), 0)
  assert.equal(ageDays('2026-09-15T23:59:00+05:30', now), 1)
  assert.equal(ageDays('2026-09-10T10:00:00+05:30', now), 6)
})
