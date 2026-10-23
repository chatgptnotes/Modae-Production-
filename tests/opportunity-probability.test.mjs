import test from 'node:test'
import assert from 'node:assert/strict'
import XLSX from 'xlsx-js-style'
import { parseProbabilityPct, opportunityProbabilityWeight } from '../src/opportunityProbability.js'
import { pipelineSeries, analyticsSnapshot } from '../src/kpi.js'
import { projectWorkspace, assertWorkspaceRowWrite } from '../src/workspaceAccess.js'
import { defaultAccessPolicy } from '../src/accessPolicy.js'
import { parseBetserWorkbook } from '../src/pipelineImport.js'
import { dashboardModel } from '../src/pages/myDashboard/model.js'
import { seedState, stateFromSaved, syncedOf } from '../src/appState.js'
import { workspaceView } from '../src/workspaceViews.js'
import { mergeOpportunityRow } from '../src/workflowTransitions.js'
import { PIPELINE_COLUMNS } from '../src/excelLogic.js'

const config = { probabilityWeights: { Low: 20, Medium: 45, High: 90 }, accessPolicy: defaultAccessPolicy() }
const user = { id: 'u', role: 'RS', roles: ['STANDARD_USER'] }

test('probability percentage accepts blank, zero, full and decimal values', () => {
  for (const value of [null, undefined, '', '  ']) assert.equal(parseProbabilityPct(value), null)
  for (const value of [0, 100, 60, 62.5]) assert.equal(parseProbabilityPct(String(value)), value)
  for (const value of [-1, 101, Infinity, NaN, 'invalid', false, [], '60%']) assert.throws(() => parseProbabilityPct(value), /between 0 and 100/)
})

test('exact opportunity percentage takes precedence; invalid legacy values fall back to configured bands', () => {
  for (const [probabilityPct, expected] of [[0, 0], [100, 1], [60, .6], [62.5, .625]]) assert.equal(opportunityProbabilityWeight(config, { prob: 'High', probabilityPct }), expected)
  for (const probabilityPct of [null, undefined, '', '60', -1, 101, NaN]) assert.equal(opportunityProbabilityWeight(config, { prob: 'High', probabilityPct }), .9)
  assert.equal(opportunityProbabilityWeight({}, { prob: 'Medium' }), .5)
  assert.equal(opportunityProbabilityWeight({ probabilityWeights: { High: 'invalid' } }, { prob: 'High' }), .75)
})

test('KPI forecast uses exact percentage and configured band fallback together', () => {
  const store = { config, role: 'RS', opportunities: [
    { id: 'A', owner: 'RS', status: 'Open', valueK: 100, prob: 'High', probabilityPct: 60 },
    { id: 'B', owner: 'RS', status: 'Open', valueK: 100, prob: 'Low', probabilityPct: 0 },
    { id: 'C', owner: 'RS', status: 'Open', valueK: 100, prob: 'Medium', probabilityPct: null },
  ], approvals: [], competitors: [] }
  assert.equal(pipelineSeries(store, true).weighted, 105)
  assert.equal(analyticsSnapshot(store).weightedK, 105)
})

test('workspace projection preserves percentage and authorized edits validate newly changed values only', () => {
  const before = { id: 'A', owner: 'PP', prob: 'High', probabilityPct: 0 }
  const state = { config, opportunities: [before], users: [], approvals: [] }
  assert.equal(projectWorkspace(state, user).opportunities[0].probabilityPct, 0)
  assert.doesNotThrow(() => assertWorkspaceRowWrite(user, 'opportunities', before, { ...before, probabilityPct: 60 }, config, state))
  for (const probabilityPct of [101, -1, '60', NaN]) assert.throws(() => assertWorkspaceRowWrite(user, 'opportunities', before, { ...before, probabilityPct }, config, state), /probability/i)
  const legacy = { ...before, probabilityPct: 200 }
  assert.doesNotThrow(() => assertWorkspaceRowWrite(user, 'opportunities', legacy, { ...legacy, prob: 'Medium' }, config, state))
  const revoked = structuredClone(config); revoked.accessPolicy.roles.STANDARD_USER.actions = []
  assert.throws(() => assertWorkspaceRowWrite(user, 'opportunities', before, { ...before, probabilityPct: 60 }, revoked, state), /permission/i)
})

test('pipeline workbook roundtrip keeps percentage separate from historical probability band', () => {
  assert.ok(PIPELINE_COLUMNS.some(column => column.key === 'probabilityPct' && column.num))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Opp ID', 'Sell To Customer*', 'Prob (%)*', 'Probability (%)'],
    ['A', 'Acme', 'High', 0], ['B', 'Beta', 'Low', 62.5], ['C', 'Gamma', 'Medium', ''],
  ]), 'Current Opps')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['New Opp ID']]), 'Old Closed Opps')
  const result = parseBetserWorkbook(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }))
  assert.equal(result.error, '')
  assert.deepEqual(result.opportunities.map(row => [row.prob, row.probabilityPct]), [['High', 0], ['Low', 62.5], ['Medium', null]])
  assert.equal(JSON.parse(JSON.stringify(result.opportunities))[0].probabilityPct, 0)
  XLSX.utils.sheet_add_aoa(workbook.Sheets['Current Opps'], [['A', 'Acme', 'High', 101]], { origin: 'A2' })
  assert.throws(() => parseBetserWorkbook(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })), /between 0 and 100/)
})

test('percentage survives browser recovery, shared JSON snapshots and summary projection without backfilling history', () => {
  const state = seedState()
  state.demoData = false
  state.opportunities = [
    { ...state.opportunities[0], id: 'EXACT', probabilityPct: 0 },
    { ...state.opportunities[0], id: 'DECIMAL', probabilityPct: 62.5 },
    { ...state.opportunities[0], id: 'LEGACY', probabilityPct: 200 },
    { ...state.opportunities[0], id: 'ABSENT' },
  ]
  delete state.opportunities[3].probabilityPct
  const recovered = stateFromSaved(JSON.stringify(state))
  const shared = JSON.parse(JSON.stringify(syncedOf(recovered)))
  assert.deepEqual(shared.opportunities.map(row => row.probabilityPct), [0, 62.5, 200, undefined])
  assert.equal(Object.hasOwn(shared.opportunities[3], 'probabilityPct'), false)
  const overview = workspaceView(shared, { kind: 'overview' })
  assert.equal(overview.summary.opportunities[0].probabilityPct, 0)
  assert.equal(mergeOpportunityRow(shared.opportunities[0], { ...shared.opportunities[0], probabilityPct: 60 }).probabilityPct, 60)
})

test('dashboard model uses the same exact and configured forecast weights as KPI functions', () => {
  const state = seedState()
  state.config = { ...state.config, probabilityWeights: config.probabilityWeights }
  state.opportunities = [
    { ...state.opportunities[0], status: 'Open', probabilityPct: 60, valueK: 100, owner: 'RS' },
    { ...state.opportunities[0], id: 'B', status: 'Open', probabilityPct: null, prob: 'High', valueK: 100, owner: 'RS' },
  ]
  assert.equal(dashboardModel(state).weightedK, 150)
})

test('dashboard summaries use active opportunities and update when rows are edited or archived', () => {
  const state = seedState()
  state.opportunities = [
    { ...state.opportunities[0], id: 'ACTIVE', owner: 'RS', status: 'Open', valueK: 100, pipelineArchivedAt: null },
    { ...state.opportunities[0], id: 'ARCHIVED', owner: 'OLD', status: 'Open', valueK: 900, pipelineArchivedAt: '2026-10-01T00:00:00.000Z' },
  ]
  const active = dashboardModel(state)
  assert.equal(active.opportunityCounts.total, 1)
  assert.equal(active.headlinePipelineK, 100)
  assert.deepEqual(active.visible.map(row => row.id), ['ACTIVE'])
  assert.equal(active.team.some(row => row.owner === 'OLD'), false)

  state.opportunities[0] = { ...state.opportunities[0], valueK: 250 }
  assert.equal(dashboardModel(state).headlinePipelineK, 250)
  state.opportunities[0] = { ...state.opportunities[0], pipelineArchivedAt: '2026-10-02T00:00:00.000Z' }
  assert.equal(dashboardModel(state).opportunityCounts.total, 0)
  state.opportunities.push({ ...state.opportunities[0], id: 'NEW', pipelineArchivedAt: null, valueK: 50 })
  assert.equal(dashboardModel(state).headlinePipelineK, 50)
})
