import test from 'node:test'
import assert from 'node:assert/strict'
import { workflowStageLabelFor, workflowStageMilestoneFor, workflowStageOptionsFor } from '../src/workflowStage.js'

test('Spares list labels follow the saved workflow milestone', () => {
  assert.equal(workflowStageLabelFor({ route: 'Spares', milestone: 'Proposal', stage: 'Lead' }), 'Quotation Preparation')
  assert.equal(workflowStageLabelFor({ route: 'Spares', milestone: 'Sourcing', stage: 'Lead' }), 'Spares Sourcing')
})

test('legacy Spares qualification resolves to Requirement Validation', () => {
  const opp = { route: 'Spares', milestone: 'Qualification', stage: 'Lead' }
  assert.equal(workflowStageMilestoneFor(opp), 'Screening')
  assert.equal(workflowStageLabelFor(opp), 'Requirement Validation')
})

test('workflow options use milestone values while showing user-facing labels', () => {
  assert.deepEqual(workflowStageOptionsFor({ route: 'Spares' }).slice(0, 3), [
    { milestone: 'Intake', label: 'Opportunity Intake' },
    { milestone: 'Customer/KYC', label: 'Customer Verification' },
    { milestone: 'Screening', label: 'Requirement Validation' },
  ])
})
