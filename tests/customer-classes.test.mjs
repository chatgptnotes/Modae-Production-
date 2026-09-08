import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_CUSTOMER_CLASSES,
  DEFAULT_DOC_CHECKLISTS,
  classRule,
  classOrder,
  classDeadlineDays,
  checklistFor,
  noExceptionKeys,
} from '../src/customerClasses.js'

// The whole point of the config defaults is that they reproduce the behaviour
// that used to be hardcoded. These tests pin that equivalence.

test('noExceptionKeys with no config is the array gates.js used to hardcode', () => {
  assert.deepEqual(noExceptionKeys(), ['tech-approval', 'comm-approval', 'release', 'red-clearance'])
  assert.deepEqual(noExceptionKeys(null), ['tech-approval', 'comm-approval', 'release', 'red-clearance'])
})

test('only Red is non-waivable — kyc and amber-fee stay waivable', () => {
  assert.equal(DEFAULT_CUSTOMER_CLASSES.Red.gate.exceptionWaivable, false)
  assert.equal(DEFAULT_CUSTOMER_CLASSES.Blue.gate.exceptionWaivable, true)
  assert.equal(DEFAULT_CUSTOMER_CLASSES.Amber.gate.exceptionWaivable, true)
  assert.ok(!noExceptionKeys().includes('kyc'))
  assert.ok(!noExceptionKeys().includes('amber-fee'))
})

// exceptionRequestable mirrors Workbench's canRequestException, which is a
// different question from waivability. Collapsing the two would change
// behaviour, so they are asserted apart.
test('exceptionRequestable is independent of exceptionWaivable', () => {
  const requestable = classOrder()
    .map(cls => classRule(null, cls)?.gate)
    .filter(gate => gate?.exceptionRequestable)
    .map(gate => gate.key)
  assert.deepEqual(requestable, ['amber-fee'])
})

test('classRule falls back to the defaults, never to an empty object', () => {
  assert.equal(classRule(undefined, 'Green').verification.requires, 'none')
  assert.equal(classRule({}, 'Red').verification.approvalType, 'Red customer clearance')
  assert.equal(classRule({ customerClasses: {} }, 'Blue').gate.key, 'kyc')
  assert.equal(classRule(null, 'Nonexistent'), null)
})

test('a configured class overrides the default', () => {
  const config = { customerClasses: { ...DEFAULT_CUSTOMER_CLASSES, Blue: { ...DEFAULT_CUSTOMER_CLASSES.Blue, gate: { ...DEFAULT_CUSTOMER_CLASSES.Blue.gate, approvers: ['LJS'] } } } }
  assert.deepEqual(classRule(config, 'Blue').gate.approvers, ['LJS'])
  assert.deepEqual(classRule(config, 'Red').gate.approvers, ['LJS', 'AH'])
})

test('classOrder is Green, Blue, Amber, Red', () => {
  assert.deepEqual(classOrder(), ['Green', 'Blue', 'Amber', 'Red'])
})

// The bug this fixes: Admin wrote amberFee.days, the gates read
// leadDeadlines.amberFeeDays, so the edit was silently ignored.
test('classDeadlineDays honours a legacy amberFee.days edit', () => {
  assert.equal(classDeadlineDays({ amberFee: { days: 3 } }, 'Amber'), 3)
  assert.equal(classDeadlineDays({ leadDeadlines: { amberFeeDays: 5 } }, 'Amber'), 5)
  // An explicitly configured class value wins over both legacy keys.
  const config = {
    amberFee: { days: 3 },
    customerClasses: { Amber: { ...DEFAULT_CUSTOMER_CLASSES.Amber, verification: { ...DEFAULT_CUSTOMER_CLASSES.Amber.verification, deadlineDays: 9 } } },
  }
  assert.equal(classDeadlineDays(config, 'Amber'), 9)
})

test('classDeadlineDays falls back to the seeded 7 days, and Red/Green have none', () => {
  assert.equal(classDeadlineDays({}, 'Blue'), 7)
  assert.equal(classDeadlineDays({}, 'Amber'), 7)
  assert.equal(classDeadlineDays({ leadDeadlines: { kycDays: 10 } }, 'Blue'), 10)
  assert.equal(classDeadlineDays({}, 'Red'), 0)
  assert.equal(classDeadlineDays({}, 'Green'), 0)
})

test('checklistFor resolves the lead list, and kycItems aliases the master list', () => {
  assert.deepEqual(checklistFor(null, 'Blue'), DEFAULT_DOC_CHECKLISTS.leadKyc)
  assert.equal(checklistFor(null, 'Blue').length, 4)
  assert.deepEqual(checklistFor(null, 'Green'), [])
  assert.deepEqual(checklistFor(null, 'Amber'), [])

  const master = ['A', 'B', 'C', 'D', 'E', 'F']
  const config = {
    kycItems: master,
    customerClasses: { Blue: { ...DEFAULT_CUSTOMER_CLASSES.Blue, verification: { ...DEFAULT_CUSTOMER_CLASSES.Blue.verification, checklist: 'kycItems' } } },
  }
  assert.deepEqual(checklistFor(config, 'Blue'), master)
})

test('every class carries the payment terms proposalDoc used to hardcode', () => {
  assert.equal(classRule(null, 'Green').paymentTerms, '30 days credit from invoice')
  assert.equal(classRule(null, 'Blue').paymentTerms, '50% advance, balance on delivery')
  assert.equal(classRule(null, 'Amber').paymentTerms, '100% advance before dispatch')
  assert.equal(classRule(null, 'Red').paymentTerms, '100% prepayment only')
})

// Blue and Amber blockers carry `approver` but no `needed`; only Red has both.
test('only Red declares an approval type on its gate', () => {
  assert.equal(classRule(null, 'Blue').gate.approvalType, '')
  assert.equal(classRule(null, 'Amber').gate.approvalType, '')
  assert.equal(classRule(null, 'Red').gate.approvalType, 'Red customer clearance')
})

test('Red is raised by oppBlockers, so it has no readiness row', () => {
  assert.equal(classRule(null, 'Red').gate.readiness, null)
  assert.equal(classRule(null, 'Blue').gate.readiness.key, 'kyc-block')
  assert.equal(classRule(null, 'Amber').gate.readiness.key, 'amber-fee')
})

// ---- migration ----
// Built from the real helpers: migrate() expects a full state shape.
const { migrate, seedState, emptyState } = await import('../src/appState.js')
const stateWithConfig = config => {
  const base = emptyState(seedState())
  return { ...base, config: { ...config } }
}
// The Amber timer bug: Admin wrote amberFee.days, the gates read
// leadDeadlines.amberFeeDays. Migration adopts the value the user actually set,
// which is the one intentional behaviour change in this work.
test('migrate adopts a legacy amberFee.days edit onto the Amber class', () => {
  const s = migrate(stateWithConfig({ amberFee: { amount: 25000, cur: 'INR', days: 3 } }))
  assert.equal(s.config.customerClasses.Amber.verification.deadlineDays, 3)
  assert.equal(classDeadlineDays(s.config, 'Amber'), 3)
})

test('migrate adopts legacy classRules text as per-class payment terms', () => {
  const s = migrate(stateWithConfig({ classRules: { Green: 'Net 45 bespoke' } }))
  assert.equal(s.config.customerClasses.Green.paymentTerms, 'Net 45 bespoke')
  assert.equal(s.config.customerClasses.Red.paymentTerms, '100% prepayment only')
})

test('migrate keeps an edited class and still backfills the others', () => {
  const s = migrate(stateWithConfig({
    customerClasses: { Blue: { gate: { approvers: ['LJS'] }, verification: { deadlineDays: 14 } } },
  }))
  assert.deepEqual(s.config.customerClasses.Blue.gate.approvers, ['LJS'])
  assert.equal(s.config.customerClasses.Blue.verification.deadlineDays, 14)
  // Fields the saved state never had are still filled in from the seed.
  assert.equal(s.config.customerClasses.Blue.gate.key, 'kyc')
  assert.equal(s.config.customerClasses.Blue.verification.requires, 'documents')
  assert.deepEqual(s.config.customerClasses.Red.gate.approvers, ['LJS', 'AH'])
})

test('migrate on a fresh state reproduces the seeded defaults exactly', () => {
  const s = migrate(emptyState(seedState()))
  for (const cls of ['Green', 'Blue', 'Amber', 'Red']) {
    assert.deepEqual(s.config.customerClasses[cls], DEFAULT_CUSTOMER_CLASSES[cls], cls)
  }
  assert.deepEqual(noExceptionKeys(s.config), noExceptionKeys())
})
