import test from 'node:test'
import assert from 'node:assert/strict'
import { dashboardModel } from '../src/pages/myDashboard/model.js'
import { dashboardDrilldown } from '../src/pages/myDashboard/drilldown.js'

const now = new Date('2026-10-13T06:00:00Z')
const opp = (id, extra = {}) => ({ id, owner: 'RS', status: 'Open', stage: 'RFQ', valueK: 100, customerStatus: 'Green', ...extra })
const store = (extra = {}) => ({ role: 'LJS', config: {}, proposals: {}, customers: [], clarifications: [], approvals: [],
  opportunities: [opp('a'), opp('b', { owner: 'PP', prob: 'High' }), opp('c', { status: 'Closed', stage: 'Lost', closedReason: ' Price ' })],
  sales: { fy: 'FY 2026–27', targets: {}, orders: [] }, ...extra })
const detail = (model, selection, options = {}) => dashboardDrilldown(model, selection, { showMoney: true, period: 'fy', ...options })

test('pipeline drilldowns reconcile headline and total/open/closed counts across scopes', () => {
  for (const scope of [{}, { owner: 'RS' }, { scope: 'my' }]) {
    const model = dashboardModel(store(), { ...scope, now })
    const open = detail(model, { kind: 'pipeline' })
    assert.equal(open.rows.length, model.headlineOpenCount)
    assert.equal(open.totalValueK, model.headlinePipelineK)
    for (const status of ['all', 'Open', 'Closed']) {
      const rows = detail(model, { kind: 'pipeline', status }).rows
      assert.equal(rows.length, status === 'all' ? model.opportunityCounts.total : model.opportunityCounts[status.toLowerCase()])
    }
  }
})

test('approval drilldown preserves request multiplicity and personal cross-owner responsibility', () => {
  const model = dashboardModel(store({ approvals: [
    { id: 'p1', oppId: 'a', status: 'Pending', approver: 'LJS' },
    { id: 'p2', oppId: 'a', status: 'Pending', approver: 'LJS' },
    { id: 'p3', status: 'Pending', requestedBy: 'LJS' },
  ] }), { scope: 'my', now })
  const result = detail(model, { kind: 'pending' })
  assert.equal(result.rows.length, 3)
  assert.equal(new Set(result.rows.map(row => row.key)).size, 3)
  assert.equal(result.rows[0].opp.id, 'a')
  assert.equal(result.rows[2].opp, null)
  assert.equal(result.totalValueK, null)
})

test('funnel probabilities, outcomes and normalized reasons reconcile with charts', () => {
  const model = dashboardModel(store(), { now })
  for (const stage of model.funnel) {
    assert.equal(detail(model, { kind: 'funnel', stageKey: stage.key }).rows.length, stage.count)
    for (const segment of stage.segments) {
      const result = detail(model, { kind: 'funnel', stageKey: stage.key, probability: segment.key })
      assert.equal(result.rows.length, segment.count)
      assert.equal(result.totalValueK, segment.valueK)
    }
  }
  assert.deepEqual(detail(model, { kind: 'outcomes', outcome: 'lost', reason: 'Price' }).rows.map(row => row.opp.id), ['c'])
  assert.equal(detail(model, { kind: 'outcomes' }).rows.length, model.outcomes.summary.total)
})

test('follow-up and blocked popups use the exact operational sets; money stays restricted', () => {
  const model = dashboardModel(store({ opportunities: [opp('due', { proposalDate: '2026-09-01' }), opp('fresh', { proposalDate: '2026-10-12' })] }), { now })
  for (const kind of ['followups', 'blocked']) {
    const result = detail(model, { kind }, { showMoney: false })
    assert.deepEqual(result.rows.map(row => row.opp.id), model[kind].map(row => row.opp.id))
    assert.equal(result.totalValueK, null)
    assert.ok(result.rows.every(row => row.valueK === null))
  }
})

test('Actual retains contribution identity, period selection and estimate labels', () => {
  const model = dashboardModel(store({ opportunities: [
    opp('won', { status: 'Closed', stage: 'Won', orderDate: '2026-10-01', valueK: 250 }),
    opp('future', { status: 'Closed', stage: 'Won', orderDate: '2026-12-01', valueK: 800 }),
  ] }), { period: 'q3', now })
  const result = detail(model, { kind: 'actual' }, { period: 'q3' })
  assert.deepEqual(result.rows.map(row => row.opp.id), ['won'])
  assert.equal(result.totalValueK, model.wonPerformance.valueK)
  assert.match(result.rows[0].detail, /Estimated/)
  assert.match(detail(model, { kind: 'gap' }).description, /No target configured/)
})

test('confirmed performance contributions use immutable PO values and exclude future bookings', () => {
  const model = dashboardModel(store({ opportunities: [
    opp('booked', { status: 'Closed', stage: 'Won', valueK: 999, booking: { id: 'b1', po: 'PO-1', owner: 'RS', booked: '2026-10-10', valueK: 120 } }),
    opp('estimate', { status: 'Closed', stage: 'Won', orderDate: '2026-10-01', valueK: 30 }),
    opp('future', { status: 'Closed', stage: 'Won', booking: { id: 'b2', po: 'PO-2', owner: 'RS', booked: '2026-12-01', valueK: 400 } }),
  ] }), { period: 'q3', now })
  const result = detail(model, { kind: 'actual' }, { period: 'q3' })
  assert.deepEqual(result.rows.map(row => [row.opp.id, row.valueK]), [['booked', 120], ['estimate', 30]])
  assert.equal(result.totalValueK, 150)
  assert.match(result.rows[0].detail, /Confirmed PO/)
})

test('selected-quarter target columns sum to their rows and the displayed target', () => {
  const s = store({ sales: { fy: 'FY 2026–27', orders: [], targets: {
    RS: { annual: 1000, q: [100, 200, 300, 400] }, PP: { annual: 400, q: [100, 100, 100, 100] },
  } } })
  for (const period of ['fy', 'q1', 'q2', 'q3', 'q4']) {
    const model = dashboardModel(s, { period, now })
    const result = detail(model, { kind: 'target' }, { period })
    assert.equal(result.totalValueK, model.perf.annual)
    assert.equal(result.rows.reduce((sum, row) => sum + row.valueK, 0), result.totalValueK)
    for (const row of result.rows) assert.equal(row.quarters.reduce((sum, value) => sum + value, 0), row.valueK)
  }
  const model = dashboardModel(s, { period: 'q3', now })
  assert.deepEqual(detail(model, { kind: 'target' }, { period: 'q3' }).rows[1].quarters, [0, 0, 300, 0])
  assert.deepEqual(detail(model, { kind: 'target' }, { showMoney: false }).rows, [])
  assert.deepEqual(detail(model, { kind: 'target' }, { period: 'all' }).rows, [])
})

test('gap explains estimates, missing confirmation, and the exact calculation', () => {
  const model = dashboardModel(store(), { now })
  model.perf = { ...model.perf, targetConfigured: true, targetNeedsConfirmation: false, annual: 100 }
  model.wonPerformance = { valueK: 40, estimatedCount: 0 }
  assert.match(detail(model, { kind: 'gap' }).description, /₹1.0 L − Actual ₹0.4 L = ₹0.6 L/)
  model.wonPerformance.estimatedCount = 1
  assert.match(detail(model, { kind: 'gap' }).description, /verification/)
  model.perf.targetConfigured = false
  model.perf.targetNeedsConfirmation = true
  assert.match(detail(model, { kind: 'gap' }).description, /confirmation/)
})

test('stage aliases and other closed outcomes preserve chart membership', () => {
  const s = store({ config: { fieldLists: { stage: [{ value: 'Tender Review', label: 'Tender Review', active: true, base: 'RFQ' }, { value: 'Accepted', label: 'Accepted', active: true, base: 'Won' }] } },
    opportunities: [opp('a', { stage: 'Tender Review', prob: 'Unknown' }), opp('w', { status: 'Closed', stage: 'Accepted' }), opp('o', { status: 'Closed', stage: 'Abandoned' })] })
  const model = dashboardModel(s, { now })
  assert.deepEqual(detail(model, { kind: 'funnel', stageKey: 'rfq', probability: 'low' }).rows.map(row => row.opp.id), ['a'])
  assert.deepEqual(detail(model, { kind: 'funnel', stageKey: 'won' }).rows.map(row => row.opp.id), ['w'])
  assert.deepEqual(detail(model, { kind: 'outcomes', reason: 'Unspecified' }).rows.map(row => row.opp.id), ['w'])
  assert.deepEqual(detail(model, { kind: 'otherClosed', stage: 'Abandoned' }).rows.map(row => row.opp.id), ['o'])
})
