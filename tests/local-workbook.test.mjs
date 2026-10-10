import test from 'node:test'
import assert from 'node:assert/strict'
import { localWorkbookImport } from '../src/localWorkbook.js'
import { applyLocalWorkbook, LOCAL_WORKBOOK_ID, seedState } from '../src/appState.js'
import { funnelRows, winLossAnalysis } from '../src/kpi.js'

test('local workbook snapshot contains the Betser pipeline data', () => {
  assert.equal(localWorkbookImport.opportunities.length, 42)
  assert.equal(localWorkbookImport.opportunities.filter(row => row.status === 'Open').length, 9)
  assert.equal(localWorkbookImport.opportunities.filter(row => row.status === 'Closed').length, 33)
  assert.equal(localWorkbookImport.customers.length, 40)
  const funnel = funnelRows(localWorkbookImport.opportunities)
  assert.equal(funnel.find(row => row.label === 'Won').count, 0)
  assert.equal(funnel.find(row => row.label === 'Closed / No Win').count, 33)
  const outcomes = winLossAnalysis(localWorkbookImport.opportunities)
  assert.equal(outcomes.summary.won, 0)
  assert.equal(outcomes.summary.lost, 14)
  assert.equal(outcomes.closedOther.count, 19)
  assert.deepEqual(Object.fromEntries(outcomes.closedOther.byStage.map(row => [row.stage, row.count])), {
    Abandoned: 9,
    Budgetary: 3,
    'No Bid': 2,
    'On Hold': 2,
    Lead: 1,
    Validate: 2,
  })
})

test('local workbook reset replaces an existing browser workspace once', () => {
  const previous = {
    ...seedState(),
    demoData: false,
    opportunities: [{ id: '2609001', sellTo: 'Demo customer' }],
    leads: [{ id: 'LEAD-DEMO' }],
    approvals: [{ id: 'APP-DEMO' }],
  }
  const imported = applyLocalWorkbook(previous)

  assert.equal(imported.importedWorkbook, LOCAL_WORKBOOK_ID)
  assert.equal(imported.opportunities.length, 42)
  assert.equal(imported.customers.length, 40)
  assert.deepEqual(imported.sales.targets, {})
  assert.deepEqual(imported.sales.orders, [])
  assert.deepEqual(imported.leads, [])
  assert.deepEqual(imported.approvals, [])

  const edited = { ...imported, opportunities: [{ ...imported.opportunities[0], oppName: 'Edited locally' }] }
  assert.equal(applyLocalWorkbook(edited), edited)
})
