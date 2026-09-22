import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BLUE_KYC_ITEMS,
  leadVerificationBlockers,
  leadVerificationComplete,
  verificationSnapshot,
  verificationDeadline,
} from '../src/leadVerification.js'

const verifiedKyc = Object.fromEntries(BLUE_KYC_ITEMS.map(item => [item, { state: 'Verified', mode: 'simulated' }]))

test('Blue leads are blocked until every KYC item is verified', () => {
  const lead = { customerStatus: 'Blue', verification: { kyc: { [BLUE_KYC_ITEMS[0]]: { state: 'Verified' } } } }
  assert.equal(leadVerificationComplete(lead, 'Blue'), false)
  assert.equal(leadVerificationBlockers(lead, 'Blue').length, 3)
  assert.equal(leadVerificationComplete({ customerStatus: 'Blue', verification: { kyc: verifiedKyc } }, 'Blue'), true)
})

test('Amber leads require payment confirmation', () => {
  assert.deepEqual(leadVerificationBlockers({ customerStatus: 'Amber' }, 'Amber'), ['Amber processing-fee payment confirmation is required'])
  assert.equal(leadVerificationComplete({ verification: { payment: { state: 'Confirmed' } } }, 'Amber'), true)
})

test('Green leads do not require verification and snapshots are read-only', () => {
  assert.equal(leadVerificationComplete({ customerStatus: 'Green' }, 'Green'), true)
  assert.deepEqual(verificationSnapshot({ customerStatus: 'Green' }, 'Green'), { status: 'Not required', type: 'None', customerStatus: 'Green', verifiedAt: '' })
  assert.equal(verificationSnapshot({ verification: { kyc: verifiedKyc } }, 'Blue').status, 'Verified')
})

test('verification deadline starts when the customer request is sent', () => {
  const lead = { ts: '2026-08-01T00:00:00.000Z', verification: { requestedAt: '2026-08-10T00:00:00.000Z' } }
  const deadline = verificationDeadline(lead, 'Blue', { leadDeadlines: { kycDays: 7 } }, new Date('2026-08-12T00:00:00.000Z'))
  assert.equal(deadline.requestedAt, '2026-08-10T00:00:00.000Z')
  // Stamped in IST, so compare the instant rather than its representation.
  assert.equal(new Date(deadline.dueAt).toISOString(), '2026-08-17T00:00:00.000Z')
  assert.equal(deadline.remaining, 5)
})
