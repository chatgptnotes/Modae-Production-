import test from 'node:test'
import assert from 'node:assert/strict'
import { leadVerificationComplete, leadVerificationBlockers, verificationSnapshot, BLUE_KYC_ITEMS, verificationDeadline, kycVerificationComplete } from '../src/leadVerification.js'

test('registration requires no class, KYC, fee or management approval', () => {
  for (const customerStatus of ['Unclassified', 'Green', 'Yellow', 'Red', 'Blue', 'Amber']) {
    const lead = { customerStatus, verification: { kycRequestStatus: 'cancelled' } }
    assert.equal(leadVerificationComplete(lead), true)
    assert.deepEqual(leadVerificationBlockers(lead), [])
  }
})
test('optional KYC snapshots truthfully retain approved, pending, deferred and cancelled evidence', () => {
  const kyc = Object.fromEntries(BLUE_KYC_ITEMS.map(item => [item, { state: 'Approved' }]))
  assert.equal(verificationSnapshot({ customerStatus: 'Blue' }).status, 'Pending')
  assert.equal(verificationSnapshot({ customerStatus: 'Blue', verification: { kyc } }).status, 'Verified')
  assert.equal(verificationSnapshot({ customerStatus: 'Blue', verification: { kyc, kycRequestStatus: 'cancelled' } }).status, 'Pending')
  assert.equal(verificationSnapshot({ customerStatus: 'Blue', verification: { kycRequestStatus: 'deferred' } }).status, 'Deferred')
  assert.equal(verificationSnapshot({ customerStatus: 'Amber' }).status, 'Pending')
  assert.equal(verificationDeadline({ customerStatus: 'Blue' }, 'Blue'), null)
})

test('evidence validation cannot be bypassed by registration eligibility or a claimed completion flag', () => {
  assert.equal(kycVerificationComplete({ existingCustomerKyc: true }), false)
  assert.equal(kycVerificationComplete({ verification: { kyc: { [BLUE_KYC_ITEMS[0]]: { state: 'Approved' } } } }), false)
  const kyc = Object.fromEntries(BLUE_KYC_ITEMS.map(item => [item, { state: 'Approved' }]))
  const lead = { customerStatus: 'Red', customerClassificationVersion: 2, verification: { kyc } }
  assert.equal(kycVerificationComplete(lead), true)
  assert.equal(verificationSnapshot(lead).status, 'Verified')
  assert.deepEqual(verificationSnapshot(lead).items, kyc)
  assert.equal(kycVerificationComplete({ ...lead, verification: { kyc, kycRequestStatus: 'cancelled' } }), false)
})
