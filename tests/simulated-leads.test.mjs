import test from 'node:test'
import assert from 'node:assert/strict'
import { SIMULATED_CUSTOMER_SCENARIOS, simulatedLead } from '../src/simulatedLeads.js'

test('simulated inquiry scenarios cover all four customer classes', () => {
  assert.deepEqual(SIMULATED_CUSTOMER_SCENARIOS.map(s => s.status), ['Green', 'Blue', 'Amber', 'Red'])
  for (const scenario of SIMULATED_CUSTOMER_SCENARIOS) {
    const lead = simulatedLead(scenario.status, '2026-08-19T00:00:00.000Z')
    assert.equal(lead.status, 'New')
    assert.equal(lead.customerStatus, scenario.status)
    assert.equal(lead.ai.missing.length, 0)
    assert.equal(lead.ai.fields.every(field => field.state === 'accepted'), true)
  }
})

test('Blue and Amber simulations start their customer requests immediately', () => {
  const when = '2026-08-19T00:00:00.000Z'
  assert.equal(simulatedLead('Blue', when).verification.requestedAt, when)
  assert.equal(simulatedLead('Amber', when).verification.requestedAt, when)
  assert.deepEqual(simulatedLead('Green', when).verification, {})
  assert.equal(simulatedLead('Red', when).redFlag, true)
})
