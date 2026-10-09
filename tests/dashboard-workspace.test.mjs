import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dashboardModel, dashboardPeriod, dashboardTiming, paginationNumbers, dateInPeriod, registerRows, reconcileWinLossReasons } from '../src/pages/myDashboard/model.js'
import { dashboardDefaultScope } from '../src/utils.js'

const now = new Date('2026-10-04T12:00:00Z')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('sales representatives default to their own dashboard scope while managers retain global scope', () => {
  assert.equal(dashboardDefaultScope('RS'), 'my')
  assert.equal(dashboardDefaultScope('PP'), 'my')
  assert.equal(dashboardDefaultScope('LJS'), 'global')
  assert.equal(dashboardDefaultScope('AH'), 'global')
})

test('task timing uses real deadlines and the IST business day', () => {
  assert.equal(dashboardTiming('2026-10-04', '', now).label, 'Today')
  assert.equal(dashboardTiming('2026-10-03', '', now).label, '1 day overdue')
  assert.equal(dashboardTiming('2026-10-01', '', now).label, '3 days overdue')
  assert.equal(dashboardTiming('2026-10-06', '', now).tone, 'neutral')
  assert.equal(dashboardTiming('2026-10-05', '', new Date('2026-10-04T20:00:00Z')).label, 'Today')
  for (const due of ['', 'unknown', '2026-02-30']) assert.deepEqual(dashboardTiming(due, 'Awaiting decision', now), { label: 'Awaiting decision', tone: 'neutral', title: '' })
})

test('register pagination includes endpoints and bounded gaps', () => {
  assert.deepEqual(paginationNumbers(1, 1), [1])
  assert.deepEqual(paginationNumbers(2, 3), [1, 2, 3])
  assert.deepEqual(paginationNumbers(1, 12), [1, 2, 'gap-12', 12])
  assert.deepEqual(paginationNumbers(6, 12), [1, 'gap-5', 5, 6, 7, 'gap-12', 12])
  assert.deepEqual(paginationNumbers(12, 12), [1, 'gap-11', 11, 12])
})

test('deadline read model excludes resolved clarifications and does not use expected close dates', () => {
  const store = workspace({ opportunities: [opportunity('A', 'RS', { orderDate: '2026-01-01' })], approvals: [], clarifications: [
    { id: 'c1', oppId: 'A', q: 'Confirm model?', due: '2026-10-01' },
    { id: 'c2', oppId: 'A', q: 'Confirm warranty?', due: '2026-09-01', response: 'Confirmed' },
  ] })
  const model = dashboardModel(store, { now })
  assert.equal(model.work[0].clarificationDue, '2026-10-01')
  assert.equal(model.queue.some(task => task.due === '2026-01-01'), false)
})
const opportunity = (id, owner, extra = {}) => ({ id, owner, status: 'Open', stage: 'RFQ', valueK: 100, createDate: '2026-08-01', lastUpdated: '2026-10-01', customerStatus: 'Green', ...extra })
const approval = (id, oppId, extra = {}) => ({ id, oppId, status: 'Pending', type: 'Quote release', approver: 'LJS', requestedBy: 'RS', ts: '2026-08-01', ...extra })
const workspace = (extra = {}) => ({ role: 'LJS', opportunities: [opportunity('A', 'RS'), opportunity('B', 'PP'), opportunity('C', 'LJS')],
  approvals: [approval('AP-A', 'A'), approval('AP-B', 'B', { approver: 'AH' })],
  proposals: {}, customers: [], clarifications: [], config: {},
  sales: { fy: 'FY 2026–27', targets: { RS: { annual: 400, q: [100, 100, 100, 100] }, PP: { annual: 200, q: [50, 50, 50, 50] } },
    orders: [{ id: 'OR-A', owner: 'RS', valueK: 120, booked: '2026-08-01' }, { id: 'OR-B', owner: 'PP', valueK: 80, booked: '2026-10-01' }] },
  ...extra })

test('global KPIs, approvals, funnel and register share company or selected-owner scope', () => {
  const store = workspace()
  const global = dashboardModel(store, { now })
  assert.equal(global.open.length, 3)
  assert.equal(global.pipelineK, 300)
  assert.equal(global.weightedK, 75)
  assert.equal(global.pending.length, 2)
  assert.equal(global.funnel.find(row => row.key === 'rfq').count, 3)
  assert.equal(registerRows(global).length, 3)
  assert.equal(global.perf.annual, 600)
  const rs = dashboardModel(store, { owner: 'RS', now })
  assert.deepEqual(rs.open.map(o => o.id), ['A'])
  assert.deepEqual(rs.pending.map(a => a.id), ['AP-A'])
  assert.equal(rs.blocked.every(row => row.opp.owner === 'RS'), true)
  assert.equal(rs.perf.annual, 400)
  assert.equal(rs.perf.achieved, 120)
  assert.deepEqual(rs.team.map(row => row.owner), ['RS'])
})

test('reference dashboard exposes top opportunities and probability segments from the active scope', () => {
  const store = workspace({ opportunities: [
    opportunity('low', 'RS', { valueK: 100, prob: 'Low', orderDate: '2026-10-20' }),
    opportunity('high', 'PP', { valueK: 400, prob: 'High', orderDate: '2026-10-25' }),
    opportunity('medium', 'LJS', { valueK: 250, prob: 'Medium', orderDate: '2026-10-10' }),
  ] })
  const model = dashboardModel(store, { now })
  assert.deepEqual(model.topOpportunities.map(row => row.id), ['high', 'medium', 'low'])
  assert.deepEqual(model.funnel.find(row => row.key === 'rfq').segments, [
    { key: 'high', count: 1, valueK: 400 },
    { key: 'medium', count: 1, valueK: 250 },
    { key: 'low', count: 1, valueK: 100 },
  ])
})

test('dashboard headline totals cover the full pipeline while the preview shows five', () => {
  const store = workspace({ opportunities: Array.from({ length: 6 }, (_, index) => opportunity(`RS-${index + 1}`, 'RS', {
    valueK: (index + 1) * 100,
    orderDate: `2026-10-${String(index + 1).padStart(2, '0')}`,
  })) })
  const model = dashboardModel(store, { owner: 'RS', period: 'q3', now })
  assert.equal(model.topOpportunities.length, 5)
  assert.equal(model.headlineOpenCount, 6)
  assert.equal(model.headlinePipelineK, 2100)
  assert.equal(model.topOpportunities.reduce((sum, row) => sum + row.valueK, 0), 2000)
})

test('Q3 opportunity widgets use Expected Order Date rather than creation date', () => {
  const store = workspace({ opportunities: [
    opportunity('q3-order', 'RS', { createDate: '2026-06-01', orderDate: '2026-10-01' }),
    opportunity('q2-order', 'RS', { createDate: '2026-10-01', orderDate: '2026-09-30' }),
    opportunity('q4-order', 'RS', { createDate: '2026-10-01', orderDate: '2027-01-01' }),
  ] })
  const model = dashboardModel(store, { owner: 'RS', period: 'q3', now })
  assert.deepEqual(model.pipeline.map(row => row.id), ['q3-order'])
  assert.deepEqual(model.topOpportunities.map(row => row.id), ['q3-order'])
})

test('YTD and QTD targets reconcile from the canonical quarterly target plan', () => {
  const store = workspace({
    opportunities: [],
    sales: { fy: 'FY 2026–27', currentQ: 3, monthsElapsed: 7, targets: { RS: { annual: 6000, q: [1500, 1500, 1500, 1500] } }, orders: [] },
  })
  assert.equal(dashboardModel(store, { owner: 'RS', period: 'fy', now }).perf.annual, 4500)
  assert.equal(dashboardModel(store, { owner: 'RS', period: 'q3', now }).perf.annual, 1500)
})

test('reason breakdown aggregates overflow so its won and lost totals match the summary', () => {
  const reasons = reconcileWinLossReasons([
    { reason: 'Price', won: 5, lost: 1 }, { reason: 'Technical', won: 4, lost: 2 },
    { reason: 'Budget', won: 3, lost: 3 }, { reason: 'Timing', won: 2, lost: 4 },
    { reason: 'Other one', won: 1, lost: 5 }, { reason: 'Other two', won: 1, lost: 1 },
  ])
  assert.equal(reasons.length, 5)
  assert.deepEqual(reasons.at(-1), { reason: 'Other', won: 2, lost: 6 })
  assert.equal(reasons.reduce((sum, row) => sum + row.won, 0), 16)
  assert.equal(reasons.reduce((sum, row) => sum + row.lost, 0), 16)
})

test('dashboard route includes the complete reference report without the legacy opportunity register', () => {
  const source = fs.readFileSync(path.join(root, 'src/pages/myDashboard/WorkspaceDashboard.jsx'), 'utf8')
  assert.match(source, /className="page dashboard-page dw-reference-dashboard"/)
  assert.match(source, /Sales Pipeline Funnel/)
  assert.match(source, /Win\/Loss Analysis/)
  assert.doesNotMatch(source, /Opportunity register/)
  assert.doesNotMatch(source, /Act on these first/)
})

test('reference report uses shared header controls and renders the tapered funnel', () => {
  const source = fs.readFileSync(path.join(root, 'src/pages/myDashboard/WorkspaceDashboard.jsx'), 'utf8')
  assert.doesNotMatch(source, /className="reference-toolbar"/)
  assert.match(source, /reference-funnel-totals/)
  assert.match(source, /reference-funnel-row/)
  assert.match(source, /reference-analysis-button/)
  assert.match(source, /useWorkspaceView\(\)/)
})

test('reference dashboard renders separate funnel count and value totals and uses active period labels', () => {
  const source = fs.readFileSync(path.join(root, 'src/pages/myDashboard/WorkspaceDashboard.jsx'), 'utf8')
  assert.match(source, /Total Count/)
  assert.match(source, /Total Value/)
  assert.match(source, /model\.periodLabel/)
  assert.match(source, /headlineOpenCount/)
})

test('an approver personal view includes decisions on other owners without inflating their pipeline', () => {
  const mine = dashboardModel(workspace(), { scope: 'my', now })
  assert.deepEqual(mine.pipeline.map(o => o.id), ['C'])
  assert.equal(mine.pipelineK, 100)
  assert.deepEqual(mine.decisions.map(a => a.id), ['AP-A'])
  assert.deepEqual(mine.pending.map(a => a.id), ['AP-A'])
  assert.equal(mine.queue.some(task => task.opp?.id === 'A' && task.cta === 'Review'), true)
  assert.equal(mine.queue.some(task => task.opp?.id === 'B'), false)
  assert.equal(mine.work.some(row => row.opp.id === 'A'), true)
  assert.equal(mine.work.some(row => row.opp.id === 'B'), false)
})

test('personal requests and undecided joint approvals count once, completed decisions disappear', () => {
  const store = workspace({ approvals: [
    approval('joint', 'A', { needed: ['LJS', 'AH'], requestedBy: 'LJS' }),
    approval('decided', 'B', { needed: ['LJS', 'AH'], decisions: { LJS: { decision: 'Approved' } } }),
    approval('requested', 'C', { approver: 'AH', requestedBy: 'LJS' }),
    approval('done', 'A', { status: 'Approved' }),
  ] })
  const mine = dashboardModel(store, { scope: 'my', now })
  assert.deepEqual(mine.pending.map(a => a.id), ['joint', 'requested'])
  assert.equal(mine.decisions.length, 1)
  assert.equal(mine.queue.filter(task => task.id === 'approval-joint').length, 1)
  assert.equal(mine.queue.find(task => task.id === 'approval-requested').cta, 'View')
  assert.equal(mine.reportStore.approvals.some(a => a.id === 'done'), true, 'reports retain approved gates')
})

test('explicit next-action responsibility appears in My View and the blocked register', () => {
  const store = workspace({ opportunities: [opportunity('owned-elsewhere', 'RS', { nextActionOwner: 'LJS', route: 'Service' })], approvals: [] })
  const mine = dashboardModel(store, { scope: 'my', now })
  assert.equal(mine.open.length, 0)
  assert.equal(mine.work.length, 1)
  assert.equal(mine.blocked.length, 1)
  assert.deepEqual(registerRows(mine, { workFilter: 'blocked' }).map(o => o.id), ['owned-elsewhere'])
})

test('fiscal filters handle Jan–Mar and exclusive end dates', () => {
  assert.deepEqual(dashboardPeriod('q4', 'FY 2026–27', now), { start: '2027-01-01', end: '2027-04-01' })
  const fy = dashboardPeriod('fy', 'FY 2026–27', now)
  assert.equal(dateInPeriod('2026-04-01', fy), true)
  assert.equal(dateInPeriod('2027-03-31', fy), true)
  assert.equal(dateInPeriod('2027-04-01', fy), false)
  assert.equal(dateInPeriod('', fy), false)
  assert.equal(dateInPeriod('', null), true)
})

test('period and owner filters scope bookings and targets consistently', () => {
  const store = workspace()
  const q2 = dashboardModel(store, { period: 'q2', now })
  assert.equal(q2.perf.achieved, 120)
  assert.equal(q2.perf.annual, 150)
  assert.deepEqual(q2.perf.quarterTarget, [0, 150, 0, 0])
  assert.equal(q2.team.find(row => row.owner === 'RS').annual, 100)
  const q3 = dashboardModel(store, { period: 'q3', now })
  assert.equal(q3.open.length, 0)
  assert.equal(q3.pending.length, 0)
  assert.equal(q3.perf.achieved, 80)
})

test('hidden records stay out of every dashboard count, queue and register', () => {
  const model = dashboardModel(workspace({ opportunities: [opportunity('hidden', 'RS', { oppName: 'Primary 10 Opportunity' })], approvals: [approval('hidden-approval', 'hidden')] }), { now })
  assert.equal(model.pipeline.length, 0)
  assert.equal(model.queue.length, 0)
  assert.equal(model.pending.length, 0)
  assert.equal(model.pipelineK, 0)
  assert.equal(registerRows(model).length, 0)
})

test('stage filters include aliases, search combines filters, and does not mutate workspace rows', () => {
  const store = workspace({ opportunities: [opportunity('A', 'RS', { stage: 'Lead', sellTo: 'Andritz' }), opportunity('B', 'PP', { stage: 'RFI' }), opportunity('C', 'LJS')] })
  const before = structuredClone(store)
  const model = dashboardModel(store, { now })
  assert.deepEqual(registerRows(model, { stage: 'Lead,RFI' }).map(o => o.id), ['A', 'B'])
  assert.deepEqual(registerRows(model, { stage: 'Lead,RFI', query: 'ANDRITZ' }).map(o => o.id), ['A'])
  assert.deepEqual(store, before)
})

test('empty workspaces provide zero KPIs and avoid target division by zero', () => {
  const model = dashboardModel(workspace({ opportunities: [], approvals: [], sales: {} }), { now })
  assert.equal(model.open.length, 0)
  assert.equal(model.pipelineK, 0)
  assert.equal(model.weightedK, 0)
  assert.equal(model.perf.attainPct, 0)
  assert.equal(model.outcomes.summary.total, 0)
  assert.deepEqual(model.queue, [])
})

test('FY performance excludes bookings from other financial years even with All dates selected', () => {
  const store = workspace()
  store.sales.orders.push({ owner: 'RS', booked: '2025-08-01', valueK: 9999 })
  const model = dashboardModel(store, { now })
  assert.equal(model.perf.achieved, 200)
  assert.equal(model.team.find(row => row.owner === 'RS').achieved, 120)
})

test('pipeline card filters show open records while the full register retains closed outcomes', () => {
  const model = dashboardModel(workspace({ opportunities: [opportunity('open', 'RS'), opportunity('won', 'PP', { stage: 'Won', status: 'Closed' })] }), { now })
  assert.equal(registerRows(model).length, 2)
  assert.deepEqual(registerRows(model, { workFilter: 'open' }).map(o => o.id), ['open'])
  assert.deepEqual(registerRows(model, { stage: 'Won' }).map(o => o.id), ['won'])
})

test('dashboard completion uses the reference performance, action queue, funnel, and analysis sections', () => {
  const source = fs.readFileSync(path.join(root, 'src/pages/myDashboard/WorkspaceDashboard.jsx'), 'utf8')
  assert.match(source, /function Performance/)
  assert.match(source, /function TopOpportunities/)
  assert.match(source, /function ActionQueue/)
  assert.match(source, /function Funnel/)
  assert.match(source, /function WinLoss/)
  assert.match(source, /reference-funnel-totals/)
  assert.doesNotMatch(source, /PipelineStageFlow|Opportunity register|priority-chip|target-marker/)
})
