import test from 'node:test'
import assert from 'node:assert/strict'
import * as governance from '../src/workbookGovernance.js'
import { leadVerificationComplete, leadVerificationBlockers } from '../src/leadVerification.js'
import { readiness, transitionBlockers, releaseState } from '../src/gates.js'
import { seedState, migrate } from '../src/appState.js'
import { newProposal } from '../src/seed.js'
import { pipelineSeries, analyticsSnapshot, funnelRows } from '../src/kpi.js'
import { routeForType } from '../src/seed.js'

test('retired choices remain readable on existing records but unavailable to new entries', () => {
  const config = { fieldLists: { product: [{ value: 'B&K', label: 'B&K Systems', active: false }, { value: 'New', label: 'New', active: true }] } }
  assert.deepEqual(governance.fieldValues(config, 'product'), ['New'])
  assert.deepEqual(governance.fieldValues(config, 'product', 'B&K'), ['New', 'B&K'])
  assert.equal(governance.fieldLabel(config, 'product', 'B&K'), 'B&K Systems')
})

test('classification requires known facts and a unique match, never a silent colour change', () => {
  const config = { classificationCriteria: [{ id: 'orders', label: 'Past orders', type: 'boolean', enabled: true, conditions: { Green: { op: 'eq', value: 'Yes' }, Red: { op: 'eq', value: 'No' } } }] }
  assert.equal(governance.suggestCustomerClass({}, config).status, 'Needs review')
  const customer = { status: 'Blue', classificationCriteria: { orders: 'Yes' } }
  assert.equal(governance.suggestCustomerClass(customer, config).suggestedClass, 'Green')
  assert.equal(customer.status, 'Blue')
  config.classificationCriteria[0].conditions.Amber = { op: 'eq', value: 'Yes' }
  assert.equal(governance.suggestCustomerClass(customer, config).status, 'Needs review')
})

test('unclear workbook criteria are excluded and negative numeric facts are rejected', () => {
  const config = { classificationCriteria: [{ id: 'years', label: 'Years', type: 'number', enabled: true, needsDefinition: true, conditions: { Green: { op: 'gt', value: 10 } } }] }
  assert.equal(governance.suggestCustomerClass({ classificationCriteria: { years: 12 } }, config).suggestedClass, null)
  assert.ok(governance.validateWorkbookConfig({ ...governance.workbookDefaults(), amberFee: { amount: -1 } }).length)
})

test('Red defaults to No Bid and only joint clearance permits continuation', () => {
  const config = governance.workbookDefaults()
  const lead = { customerStatus: 'Red', existingCustomerKyc: true }
  assert.equal(leadVerificationComplete(lead, 'Red', { config, redCleared: false }), false)
  assert.equal(leadVerificationComplete(lead, 'Red', { config, redCleared: true }), true)
  assert.deepEqual(leadVerificationBlockers(lead, 'Red', { config, redCleared: true }), [])
  const opp = { id: 'R', status: 'Open', customerStatus: 'Red', milestone: 'Proposal' }
  const state = { config, approvals: [{ oppId: 'R', type: 'Red customer clearance', status: 'Approved' }] }
  assert.ok(!transitionBlockers(opp, 'Submitted', {}, state).some(b => ['customer-no-bid', 'red-clearance'].includes(b.key)))
  assert.ok(!readiness(opp, {}, state).some(b => ['customer-no-bid', 'red'].includes(b.key)))
  assert.match(releaseState({}, [], 'R', opp, { ...config, requireFinalQuoteApproval: false }).reason, /No Bid/)
  assert.equal(releaseState({}, state.approvals, 'R', opp, { ...config, requireFinalQuoteApproval: false }).required, false)
})

test('Amber fee evidence remains required when KYC was already verified', () => {
  const config = governance.workbookDefaults()
  assert.equal(leadVerificationComplete({ existingCustomerKyc: true }, 'Amber', { config }), false)
  assert.equal(leadVerificationComplete({ existingCustomerKyc: true, verification: { payment: { state: 'Confirmed' } } }, 'Amber', { config }), true)
})

test('Admin can replace No Bid with approval clearance and disable class verification', () => {
  const config = governance.workbookDefaults()
  config.customerClasses.Red = governance.ruleForAction(config.customerClasses.Red, 'Approval required')
  assert.equal(leadVerificationComplete({}, 'Red', { config, redCleared: true }), true)
  config.customerClasses.Amber.verification.required = false
  config.customerClasses.Amber.gate = null
  assert.equal(leadVerificationComplete({}, 'Amber', { config }), true)
})

test('workbook comparison identifies a changed fee, terms and field choices', () => {
  const config = governance.workbookDefaults()
  assert.equal(governance.workbookComparison(config).filter(r => r.status === 'Different').length, 0)
  config.amberFee.amount = 0
  config.customerClasses.Amber.paymentTerms = 'Advance'
  config.fieldLists.category = config.fieldLists.category.filter(x => x.value !== 'EPC')
  assert.ok(governance.workbookComparison(config).filter(r => r.status === 'Different').length >= 3)
})

test('an existing workbook policy is upgraded once and later Admin edits survive', () => {
  const config = governance.upgradeWorkbookConfig({ amberFee: { amount: 0 }, customerClasses: {} })
  assert.equal(config.amberFee.amount, 0)
  assert.equal(config.customerClasses.Red.defaultAction, 'No Bid')
  config.amberFee.amount = 5000
  assert.equal(governance.upgradeWorkbookConfig(config).amberFee.amount, 5000)
})

test('Admin probability weights change both forecast consumers and custom stages map into the funnel', () => {
  const config = governance.workbookDefaults()
  config.probabilityWeights.High = 90
  config.fieldLists.stage.push({ value: 'Tender Review', label: 'Tender Review', active: true, base: 'RFQ' })
  config.fieldLists.oppType.push({ value: 'Field Service', label: 'Field Service', active: true, base: 'Service' })
  const store = { role: 'ADMIN', config, opportunities: [{ status: 'Open', stage: 'Tender Review', valueK: 100, prob: 'High' }] }
  assert.equal(pipelineSeries(store, true).weighted, 90)
  assert.equal(analyticsSnapshot(store).weightedK, 90)
  assert.equal(funnelRows(store.opportunities, { config }).find(row => row.key === 'rfq').count, 1)
  assert.equal(routeForType('Field Service', config), 'Service')
})

test('first workbook upgrade preserves custom terms, gates and field choices', () => {
  const saved = { customerClasses: { Green: { paymentTerms: '60 days', gate: { key: 'custom' } } }, fieldLists: { category: [{ value: 'Custom', label: 'Custom', active: true }] } }
  const config = governance.upgradeWorkbookConfig(saved)
  assert.equal(config.customerClasses.Green.paymentTerms, '60 days')
  assert.equal(config.customerClasses.Green.gate.key, 'custom')
  assert.deepEqual(config.fieldLists.category, saved.fieldLists.category)
})

test('a custom opportunity type retains its mapped workflow and proposal after reload', () => {
  const state = seedState()
  state.config.fieldLists.oppType.push({ value: 'Field Service', label: 'Field Service', active: true, base: 'Service' })
  state.opportunities = [{ id: 'custom', oppType: 'Field Service', status: 'Open', stage: 'Lead', owner: 'LJS' }]
  const restored = migrate(state).opportunities[0]
  assert.equal(restored.route, 'Service')
  assert.equal(restored.context, 'Service')
  assert.equal(newProposal(restored.id, restored).proposalType, 'Services')
})
