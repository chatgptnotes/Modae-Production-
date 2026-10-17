import test from 'node:test'
import assert from 'node:assert/strict'
import { readiness, transitionBlockers, releaseState } from '../src/gates.js'
import { migrateCustomerClassification, upgradeCustomerRules } from '../src/customerClasses.js'
import { createKycOverride } from '../src/kycPolicy.js'
const config = upgradeCustomerRules({ requireFinalQuoteApproval: false })
const state = { config, approvals: [], clarifications: [], kyc: {} }

test('missing, deferred and cancelled KYC never blocks any opportunity stage', () => {
  for (const original of ['Blue', 'Amber', 'Red', 'Green']) {
    for (const status of ['Pending', 'Deferred', 'Cancelled']) {
      const opp = migrateCustomerClassification({ id: 'O', customerStatus: original, milestone: 'Registration', route: 'Spares', leadVerification: { type: 'KYC', status } })
      assert.ok(!readiness(opp, {}, state).some(b => b.kyc || b.key.startsWith('kyc')))
      for (const target of ['Proposal', 'Submitted', 'PO Validation', 'Handover']) {
        assert.ok(!transitionBlockers(opp, target, {}, state).some(b => b.kyc || b.key.startsWith('kyc')))
      }
    }
  }
})
test('former Blue cannot inherit Red no-bid, but legacy Red and Yellow controls survive', () => {
  const blue = migrateCustomerClassification({ id: 'B', customerStatus: 'Blue', status: 'Open', milestone: 'Registration' })
  const red = migrateCustomerClassification({ ...blue, customerStatus: 'Red', customerClassificationVersion: undefined, legacyCustomerClass: undefined })
  const yellow = migrateCustomerClassification({ ...blue, customerStatus: 'Amber', customerClassificationVersion: undefined, legacyCustomerClass: undefined })
  assert.equal(releaseState({}, [], blue.id, blue, config).required, false)
  assert.equal(releaseState({}, [], red.id, red, config).required, true)
  assert.ok(transitionBlockers(red, 'Proposal', {}, state).some(b => b.key === 'red-clearance'))
  assert.ok(readiness(yellow, {}, state).some(b => b.key === 'amber-fee'))
  assert.equal(createKycOverride({ role: 'AH' }, blue, config, 'Optional'), null)
})
