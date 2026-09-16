import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const service = fs.readFileSync('src/workbench/WbService.jsx', 'utf8')
const store = fs.readFileSync('src/store.jsx', 'utf8')

test('Service flow uses one AI suggestion and one human confirmation', () => {
  assert.match(service, /AI service identification/)
  assert.match(service, /Suggested offer path/)
  assert.match(service, /Confirm scope and offer path/)
  assert.match(service, /Standard Rate Sheet/)
  assert.match(service, /Customized Proposal/)
})

test('Service flow combines internal review and records one customer decision', () => {
  assert.match(service, /type: 'Service offer review'/)
  assert.match(service, /Request one Service Review/)
  const decision = fs.readFileSync('src/workbench/ServiceDecisionPanel.jsx', 'utf8')
  assert.match(decision, /Customer decision/)
  assert.match(decision, /Changes requested/)
  assert.match(decision, /revision: \(est\.revision \|\| 0\) \+ 1/)
  assert.match(store, /updateServiceFlow\(oppId, patch\)/)
})

test('Service review still requires scope, travel, and required survey evidence', () => {
  assert.match(service, /!scopeConfirmed \|\| !est\.travelConfirmed/)
  assert.match(service, /est\.surveyRequired && !\(\(store\.surveys \|\| \[\]\)\.find/)
  assert.match(service, /reviewApproval\.status !== 'Approved'/)
})

test('Service uses one approval gate instead of the three-part quote release matrix', () => {
  const gates = fs.readFileSync('src/gates.js', 'utf8')
  const builder = fs.readFileSync('src/workbench/PropBuilder.jsx', 'utf8')
  assert.match(gates, /opp\?\.route === 'Service' \? \[/)
  assert.match(gates, /type: 'Service offer review'/)
  assert.match(gates, /export function serviceApprovalSet/)
  assert.match(builder, /serviceApprovalSet\(store\.approvals, opp\.id\)/)
  assert.match(gates, /One Service offer review is required before the proposal can proceed/)
})

test('Service progress follows intake through execution and invoice', () => {
  const workbench = fs.readFileSync('src/pages/Workbench.jsx', 'utf8')
  assert.match(workbench, /const SERVICE_WORKFLOW_STEPS = \[/)
  for (const label of ['Service Intake', 'Capture Enquiry', 'Scope & Survey', 'Prepare Offer', 'Internal Review', 'Send Offer', 'Customer Decision', 'Execute Service', 'Service Report', 'Invoice']) {
    assert.match(workbench, new RegExp(label.replace(/[&]/g, '\\&')))
  }
  assert.match(workbench, /ServiceDecisionPanel/)
  assert.match(workbench, /ServiceExecutionPanel/)
  assert.match(workbench, /ServiceReportPanel/)
  assert.match(workbench, /ServiceInvoicePanel/)
})
