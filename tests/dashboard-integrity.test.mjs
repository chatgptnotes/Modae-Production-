import test from 'node:test'
import assert from 'node:assert/strict'
import { dashboardModel } from '../src/pages/myDashboard/model.js'

const now = new Date('2026-10-12T06:00:00Z')
const opp = (id, extra = {}) => ({ id, owner: 'PP', status: 'Open', stage: 'RFQ', valueK: 100, prob: 'High', ...extra })
const store = opportunities => ({ role: 'PP', opportunities, approvals: [], proposals: {}, config: {}, customers: [], clarifications: [], sales: { fy: 'FY 2026-27', currentQ: 3, targets: {}, orders: [] } })

test('opportunity summary uses saved records in the selected scope and follows edits and deletes', () => {
  const state = store([
    opp('open', { valueK: 0, orderDate: '2027-05-31' }),
    opp('lost', { status: 'Closed', stage: 'Lost' }),
    opp('abandoned', { status: 'Closed', stage: 'Abandoned' }),
    opp('elsewhere', { owner: 'RS' }),
    opp('hidden', { oppName: 'Primary 10 Opportunity' }),
  ])
  const read = () => dashboardModel(state, { scope: 'my', now })
  assert.deepEqual(read().opportunityCounts, { total: 3, open: 1, closed: 2 })
  assert.equal(read().opportunitySummary, '3 total · 1 open · 2 closed')
  assert.equal(read().headlinePipelineK, 0)
  state.opportunities[1] = { ...state.opportunities[1], status: 'Open', stage: 'RFQ', valueK: 200 }
  assert.deepEqual(read().opportunityCounts, { total: 3, open: 2, closed: 1 })
  assert.equal(read().headlinePipelineK, 200)
  state.opportunities.splice(2, 1)
  assert.deepEqual(read().opportunityCounts, { total: 2, open: 2, closed: 0 })
  assert.deepEqual(dashboardModel(state, { now }).opportunityCounts, { total: 3, open: 3, closed: 0 })
  assert.deepEqual(dashboardModel(state, { owner: 'RS', now }).opportunityCounts, { total: 1, open: 1, closed: 0 })
})

test('Top 5 explains open records excluded by the quarter and All dates includes future and undated records', () => {
  const state = store([
    opp('future', { valueK: 0, orderDate: '2027-05-31' }),
    opp('undated', { valueK: 100 }),
    opp('closed', { status: 'Closed', stage: 'Lost', valueK: 900 }),
    opp('elsewhere', { owner: 'RS', valueK: 800 }),
  ])
  const fiscal = dashboardModel(state, { scope: 'my', now })
  assert.equal(fiscal.topOpportunities.length, 0)
  assert.match(fiscal.topOpportunitiesEmptyMessage, /2 open opportunities.*outside this period or have no expected order date/)
  assert.match(fiscal.topOpportunitiesEmptyMessage, /All dates/)
  const all = dashboardModel(state, { scope: 'my', topPeriod: 'all', now })
  assert.deepEqual(all.topOpportunities.map(o => o.id), ['future', 'undated'])
  assert.equal(all.periodLabel, 'All dates')
  const empty = dashboardModel(store([]), { scope: 'my', now })
  assert.deepEqual(empty.opportunityCounts, { total: 0, open: 0, closed: 0 })
  assert.equal(empty.topOpportunitiesEmptyMessage, 'No open opportunities in this view.')
})

test('performance periods do not hide older wins or active opportunities without dates', () => {
  const state = store([opp('new'), opp('future', { orderDate: '2028-05-01' }), opp('won', { status: 'Closed', stage: 'Won', orderDate: '2025-08-01', closedReason: 'Relationship' })])
  for (const period of ['fy', 'q3']) {
    const model = dashboardModel(state, { period, topPeriod: 'fy', now })
    assert.equal(model.headlineOpenCount, 2)
    assert.equal(model.headlinePipelineK, 200)
    assert.equal(model.outcomes.summary.won, 1)
    assert.equal(model.funnel.find(row => row.key === 'won').count, 1)
    assert.equal(model.topOpportunities.length, 0)
  }
})

test('Won performance uses confirmed PO values once and includes unverified wins across history', () => {
  const state = store([
    opp('old', { status: 'Closed', stage: 'Won', valueK: 100, orderDate: '2025-08-01' }),
    opp('booked', { status: 'Closed', stage: 'Won', valueK: 999, orderDate: '2026-09-01', booking: {
      id: 'BOOK-booked', owner: 'PP', po: 'PO-1', booked: '2026-10-10', valueK: 120,
    } }),
    opp('current', { status: 'Closed', stage: 'Won', valueK: 30, orderDate: '2026-10-01' }),
    opp('undated', { status: 'Closed', stage: 'Won', valueK: 50 }),
    opp('lost', { status: 'Closed', stage: 'Lost', valueK: 500, orderDate: '2026-10-01' }),
  ])
  state.sales.orders = [{ id: 'copy', oppId: 'booked', owner: 'PP', po: 'PO-1', booked: '2026-10-10', valueK: 120 }]
  assert.deepEqual(dashboardModel(state, { period: 'all', now }).wonPerformance,
    { valueK: 300, wonCount: 4, estimatedCount: 3 })
  assert.deepEqual(dashboardModel(state, { period: 'fy', now }).wonPerformance,
    { valueK: 150, wonCount: 2, estimatedCount: 1 })
  assert.deepEqual(dashboardModel(state, { period: 'q3', now }).wonPerformance,
    { valueK: 150, wonCount: 2, estimatedCount: 1 })
  assert.deepEqual(dashboardModel(state, { owner: 'RS', period: 'all', now }).wonPerformance,
    { valueK: 0, wonCount: 0, estimatedCount: 0 })
})

test('losses and other closed outcomes stay in analysis without entering the six-stage funnel', () => {
  const model = dashboardModel(store([
    opp('lost', { status: 'Closed', stage: 'Lost', prob: 'High', valueK: 200 }),
    opp('abandoned', { status: 'Closed', stage: 'Abandoned', prob: 'Medium', valueK: 50 }),
    opp('other', { status: 'Closed', stage: 'Budgetary', prob: '', valueK: 30 }),
  ]), { now })
  assert.equal(model.funnel.length, 6)
  assert.equal(model.funnel.reduce((sum, row) => sum + row.count, 0), 0)
  assert.equal(model.funnel.reduce((sum, row) => sum + row.valueK, 0), 0)
  assert.equal(model.outcomes.summary.lost, 1)
  assert.equal(model.outcomes.closedOther.count, 2)
})

test('results without Closed status do not count differently between funnel and Win/Loss', () => {
  const model = dashboardModel(store([
    opp('legacy-win', { status: undefined, stage: 'Won' }),
    opp('legacy-loss', { status: undefined, stage: 'Lost' }),
    opp('valid-win', { status: 'Closed', stage: 'Won', closedReason: 'Relationship' }),
    opp('valid-loss', { status: 'Closed', stage: 'Lost', closedReason: 'Capability' }),
  ]), { now })
  assert.equal(model.outcomes.summary.won, 1)
  assert.equal(model.outcomes.summary.lost, 1)
  assert.equal(model.funnel.find(row => row.key === 'won').count, 1)
  assert.equal(model.funnel.reduce((sum, row) => sum + row.count, 0), 1)
})

test('pending personal decisions survive missing and out-of-year expected order dates', () => {
  const state = store([opp('undated', { owner: 'RS' }), opp('future', { owner: 'RS', orderDate: '2028-05-01' })])
  state.approvals = state.opportunities.map(o => ({ id: o.id, oppId: o.id, status: 'Pending', approver: 'PP', requestedBy: 'RS' }))
  const model = dashboardModel(state, { scope: 'my', period: 'q3', now })
  assert.equal(model.headlineOpenCount, 0)
  assert.equal(model.pending.length, 2)
  assert.equal(model.decisions.length, 2)
  assert.equal(model.queue.filter(row => row.cta === 'Review').length, 2)
})

test('all saved outcome reasons remain available rather than being merged into Other', () => {
  const state = store(Array.from({ length: 7 }, (_, i) => opp(String(i), { status: 'Closed', stage: i % 2 ? 'Lost' : 'Won', closedReason: `Reason ${i}` })))
  const model = dashboardModel(state, { now })
  assert.equal(model.outcomes.byReason.length, 7)
  assert.equal(model.outcomes.summary.won, 4)
  assert.equal(model.outcomes.summary.lost, 3)
})

test('booked actuals exclude future dates without treating a win as a booked order', () => {
  const state = store([opp('won', { status: 'Closed', stage: 'Won' })])
  state.sales.orders = [{ id: 'B1', po: 'PO-1', owner: 'PP', booked: '2026-10-12', valueK: 20 }, { id: 'B2', po: 'PO-2', owner: 'PP', booked: '2026-10-13', valueK: 90 }]
  for (const period of ['fy', 'q3']) assert.equal(dashboardModel(state, { period, now }).perf.achieved, 20)
})

test('YTD follows the fiscal calendar when the saved quarter setting is stale', () => {
  const state = store([])
  state.sales.currentQ = 3
  state.sales.targets = { PP: { annual: 400, q: [100, 100, 100, 100] } }
  state.sales.orders = [{ id: 'B1', po: 'PO-1', owner: 'PP', booked: '2027-01-02', valueK: 20 }]
  const model = dashboardModel(state, { period: 'fy', now: new Date('2027-01-12T06:00:00Z') })
  assert.equal(model.currentQuarter, 4)
  assert.equal(model.perf.achieved, 20)
  assert.equal(model.perf.annual, 400)
  assert.equal(model.team[0].annual, 400)
})

test('a future configured fiscal year has no YTD actuals or elapsed target', () => {
  const state = store([])
  state.sales.fy = 'FY 2027-28'
  state.sales.targets = { PP: { annual: 400, q: [100, 100, 100, 100] } }
  const model = dashboardModel(state, { period: 'fy', now })
  assert.equal(model.perf.annual, 0)
  assert.equal(model.perf.achieved, 0)
  assert.equal(model.currentQuarter, 1)
})

test('new, won, lost, reopened and deleted records recalculate the scoped report', () => {
  const state = store([opp('existing', { status: 'Closed', stage: 'Won', closedReason: 'Relationship' }), opp('elsewhere', { owner: 'RS', status: 'Closed', stage: 'Won' })])
  state.opportunities.push(opp('new'))
  const read = () => dashboardModel(state, { scope: 'my', period: 'q3', now })
  assert.equal(read().headlineOpenCount, 1)
  state.opportunities[2] = { ...state.opportunities[2], status: 'Closed', stage: 'Won', closedReason: 'Capability' }
  assert.equal(read().outcomes.summary.won, 2)
  state.opportunities[2] = { ...state.opportunities[2], stage: 'Lost', closedReason: '' }
  assert.equal(read().outcomes.summary.winRate, 50)
  assert.equal(read().outcomes.byReason.find(row => row.reason === 'Unspecified').lost, 1)
  state.opportunities[2] = { ...state.opportunities[2], status: 'Open', stage: 'RFQ' }
  assert.equal(read().outcomes.summary.lost, 0)
  assert.equal(read().headlineOpenCount, 1)
  state.opportunities.pop()
  assert.equal(read().headlineOpenCount, 0)
})
