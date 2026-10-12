import test from 'node:test'
import assert from 'node:assert/strict'
import { verificationSnapshot, leadVerificationBlockers, BLUE_KYC_ITEMS } from '../src/leadVerification.js'
import { readiness, transitionBlockers } from '../src/gates.js'

const opp = { id: 'kyc-test', sellTo: 'Buyer', customerStatus: 'Blue', route: 'Spares', milestone: 'Sourcing' }
const state = { approvals: [], config: { kycItems: BLUE_KYC_ITEMS }, clarifications: [], kyc: {} }
const blocked = (row, s = state) => readiness(row, {}, s).some(b => b.key === 'kyc-block')

test('incomplete and cancelled KYC never becomes a verified opportunity snapshot', () => {
  const kyc = Object.fromEntries(BLUE_KYC_ITEMS.map(name => [name, { state: 'Approved' }]))
  assert.equal(verificationSnapshot({ customerStatus: 'Blue' }).status, 'Pending')
  const cancelled = { customerStatus: 'Blue', verification: { kyc, kycRequestStatus: 'cancelled' } }
  assert.equal(verificationSnapshot(cancelled).status, 'Pending')
  assert.ok(leadVerificationBlockers(cancelled).length)
  assert.equal(verificationSnapshot({ customerStatus: 'Blue', verification: { kycRequestStatus: 'deferred' } }).status, 'Deferred')
  assert.equal(verificationSnapshot({ customerStatus: 'Blue', verification: { kyc } }).status, 'Verified')
})

test('partial customer-master checklists cannot clear proposal readiness', () => {
  const partial = { ...state, kyc: { Buyer: [{ name: BLUE_KYC_ITEMS[0], state: 'Verified' }] } }
  assert.equal(blocked(opp, partial), true)
  const complete = { ...state, kyc: { Buyer: BLUE_KYC_ITEMS.map(name => ({ name, state: 'Approved' })) } }
  assert.equal(blocked(opp, complete), false)
})

test('only recorded authorized KYC exceptions clear readiness and transitions', () => {
  for (const kycOverride of [true, {}, { by: 'RS', reason: 'Proceed', ts: '2026-10-12T10:00:00Z' }, { by: 'AH', reason: ' ', ts: '2026-10-12T10:00:00Z' }]) {
    assert.equal(blocked({ ...opp, kycOverride }), true)
    assert.ok(transitionBlockers({ ...opp, kycOverride }, 'Proposal', {}, state).some(b => b.key === 'kyc'))
  }
  assert.equal(blocked({ ...opp, kycOverride: { by: 'AH', reason: 'Approved exception', ts: '2026-10-12T10:00:00Z' } }), false)
})

test('completed KYC is reused and temporary skip remains blocking', () => {
  const reused = verificationSnapshot({ customerStatus: 'Blue', existingCustomerKyc: true })
  assert.equal(blocked({ ...opp, leadVerification: reused }), false)
  assert.equal(blocked({ ...opp, leadVerification: { type: 'KYC', status: 'Deferred' } }), true)
  assert.equal(blocked({ ...opp, customerStatus: 'Green' }), false)
})

test('override creation rejects sales users, empty reasons and non-waivable policies', async () => {
  const { createKycOverride, canOverrideCustomerKyc } = await import('../src/kycPolicy.js')
  const { DEFAULT_CUSTOMER_CLASSES } = await import('../src/customerClasses.js')
  assert.equal(createKycOverride({ role: 'RS', roles: ['STANDARD_USER'] }, opp, {}, 'Proceed'), null)
  assert.equal(createKycOverride({ role: 'AH' }, opp, {}, '  '), null)
  const config = { customerClasses: { Blue: { ...DEFAULT_CUSTOMER_CLASSES.Blue, gate: { ...DEFAULT_CUSTOMER_CLASSES.Blue.gate, exceptionWaivable: false } } } }
  assert.equal(createKycOverride({ role: 'ADMIN' }, opp, config, 'Proceed'), null)
  assert.equal(canOverrideCustomerKyc({ role: 'AH' }, opp, {}), true)
  const decision = createKycOverride({ role: 'RS', roles: ['ADMIN'] }, opp, {}, '  Authorized exception  ', new Date('2026-10-12T00:00:00Z'))
  assert.equal(decision.reason, 'Authorized exception')
  assert.equal(decision.by, 'RS')
  assert.equal(blocked({ ...opp, kycOverride: decision }), false)
  assert.equal(opp.leadVerification, undefined, 'bypassing must not invent completed verification')
})
