import test from 'node:test'
import assert from 'node:assert/strict'
import { matrixDraft, compileMatrix, parseMatrixCell } from '../src/admin/customerRuleMatrix.js'
import { workbookDefaults, suggestCustomerClass } from '../src/workbookGovernance.js'
import { leadVerificationComplete } from '../src/leadVerification.js'
import { readiness, transitionBlockers, releaseState } from '../src/gates.js'

test('Excel matrix compiles quoting actions, fee, payment terms and remarks into saved policies', () => {
  const draft = matrixDraft(workbookDefaults())
  draft.classificationCriteria.find(r => r.id === 'paymentTerms').cells.Green = '60 Days'
  draft.classificationCriteria[0].remarks = 'Confirm company age'
  draft.customerActionCells.Amber = '₹40K per Quote Fees'
  const { config, errors } = compileMatrix(draft)
  assert.deepEqual(errors, [])
  assert.equal(config.amberFee.amount, 40000)
  assert.equal(config.customerClasses.Green.paymentTerms, '60 Days')
  assert.equal(config.classificationCriteria[0].remarks, 'Confirm company age')
  assert.equal(leadVerificationComplete({}, 'Red', { config, redCleared: true }), false)
  const opp = { id: 'red-matrix', customerStatus: 'Red', status: 'Open', milestone: 'Proposal' }
  const state = { config, approvals: [{ oppId: opp.id, type: 'Red customer clearance', status: 'Approved' }] }
  assert.ok(readiness(opp, {}, state).some(blocker => blocker.key === 'customer-no-bid'))
  assert.ok(transitionBlockers(opp, 'Submitted', {}, state).some(blocker => blocker.key === 'customer-no-bid'))
  assert.equal(releaseState({}, state.approvals, opp.id, opp, config).required, true)
  assert.deepEqual(matrixDraft(config).customerActionCells, config.customerActionCells)
})

test('direct cell edits change classification comparisons and INR units', () => {
  assert.deepEqual(parseMatrixCell('<5 Lacs', 'number').condition, { op: 'lt', value: 500000 })
  assert.deepEqual(parseMatrixCell('30-45 Days', 'text').condition, { op: 'eq', value: '30-45 Days' })
  const draft = matrixDraft(workbookDefaults())
  draft.classificationCriteria = [draft.classificationCriteria.find(r => r.id === 'rfqCount')]
  draft.classificationCriteria[0].cells.Green = '>12'
  const { config, errors } = compileMatrix(draft)
  assert.deepEqual(errors, [])
  assert.equal(suggestCustomerClass({ classificationCriteria: { rfqCount: 13 } }, config).suggestedClass, 'Green')
})

test('approximate cells stay visible for review; invalid edits prevent saving', () => {
  const draft = matrixDraft(workbookDefaults())
  assert.equal(parseMatrixCell('~10 Years', 'number').needsDefinition, true)
  assert.equal(parseMatrixCell('<5>', 'number').needsDefinition, true)
  draft.customerActionCells.Red = 'Something unknown'
  draft.classificationCriteria.find(r => r.id === 'rfqCount').cells.Blue = '-2'
  assert.ok(compileMatrix(draft).errors.length >= 2)
})
