import test from 'node:test'
import assert from 'node:assert/strict'
import { dashboardModel } from '../src/pages/myDashboard/model.js'

const now = new Date('2026-10-12T06:00:00Z')
const opp = (id, orderDate, valueK, extra = {}) => ({ id, orderDate, valueK, owner: 'RS', sellTo: id, status: 'Open', stage: 'RFQ', customerStatus: 'Green', ...extra })
const state = rows => ({ role: 'RS', opportunities: rows, approvals: [], proposals: {}, config: {}, customers: [], clarifications: [], sales: { fy: 'FY 2026-27', targets: {}, orders: [] } })

test('Top 5 defaults to the current fiscal quarter and ranks dates before values', () => {
  const model = dashboardModel(state([
    opp('late-large', '2026-12-20', 10000), opp('early-small', '2026-10-20', 1),
    opp('equal-low', '2026-11-01', 10), opp('equal-high', '2026-11-01', 20),
    opp('previous-quarter', '2026-09-30', 90000), opp('next-quarter', '2027-01-01', 90000),
    opp('undated', '', 100000), opp('won', '2026-10-01', 10, { status: 'Closed', stage: 'Won' }),
  ]), { now })
  assert.deepEqual(model.topOpportunities.map(o => o.id), ['early-small', 'equal-high', 'equal-low', 'late-large'])
  assert.equal(model.funnel.find(row => row.key === 'won').count, 1)
})

test('Top 5 uses stable IDs for equal dates/values and keeps undated records last in All dates', () => {
  const rows = [opp('B', '2026-10-01', 20), opp('A', '2026-10-01', 20), opp('missing', '', 90000), opp('invalid', '2026-02-30', 80000)]
  assert.deepEqual(dashboardModel(state(rows), { topPeriod: 'all', now }).topOpportunities.map(o => o.id), ['A', 'B', 'missing', 'invalid'])
  assert.deepEqual(dashboardModel(state(rows), { topPeriod: 'q4', now }).topOpportunities, [])
})

test('Top 5 respects My View ownership and quarter selection across the fiscal year boundary', () => {
  const rows = [opp('mine', '2027-01-20', 10), opp('other', '2027-01-01', 100, { owner: 'PP' }), opp('next-fy', '2027-04-01', 100)]
  assert.deepEqual(dashboardModel(state(rows), { scope: 'my', topPeriod: 'q4', now }).topOpportunities.map(o => o.id), ['mine'])
  assert.deepEqual(dashboardModel(state(rows), { now: new Date('2026-12-31T19:00:00Z') }).topOpportunities.map(o => o.id), ['other', 'mine'])
})
