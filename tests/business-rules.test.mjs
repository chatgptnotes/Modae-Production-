import test from 'node:test'
import assert from 'node:assert/strict'
import { registrationFields, validateBusinessRules } from '../src/businessRules.js'
import { customerHealth, suggestProbability } from '../src/insights.js'

test('registration requires only sell-to and preserve customer identity', () => {
  assert.equal(registrationFields({}).length, 1)
  assert.deepEqual(registrationFields({ registrationRequiredFields: ['sellTo', 'contactPerson'] }).map(([key]) => key), ['sellTo'])
  assert.ok(validateBusinessRules({ registrationRequiredFields: [] }).length)
  assert.ok(validateBusinessRules({ registrationRequiredFields: ['sellTo', 'unknown'] }).length)
})

test('health scoring is configurable without changing saved probability or its suggestion', () => {
  const customer = { name: 'Buyer', status: 'Blue', kyc: 'Pending' }
  const config = { healthScore: { classBase: { Blue: 90 }, kycMissing: -5, healthyAt: 80, watchAt: 50 } }
  assert.equal(customerHealth(customer).score, 48)
  assert.equal(customerHealth(customer, [], config).score, 85)
  assert.equal(customerHealth(customer, [], config).band, 'Healthy')
  const opp = { stage: 'RFQ', customerStatus: 'Blue', prob: 'Low' }
  assert.deepEqual(suggestProbability(opp, {}), suggestProbability(opp, {}, config))
  assert.equal(opp.prob, 'Low')
  assert.ok(validateBusinessRules({ healthScore: { healthyAt: 40, watchAt: 50 } }).length)
  assert.ok(validateBusinessRules({ healthScore: { kycMissing: NaN } }).length)
})
