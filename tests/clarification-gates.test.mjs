import test from 'node:test'
import assert from 'node:assert/strict'

import { actionableClarifications, displayClarifications, isClarificationCoveredBySource, readiness, transitionBlockers } from '../src/gates.js'

const opp = {
  id: 'CLAR-1', sellTo: 'ACME', oppName: 'VM600 supply', owner: 'PJS',
  customerStatus: 'Green', route: 'Spares', oppType: 'Spares', milestone: 'Sourcing',
  eucName: 'ACME Plant', eucLocation: 'Chennai', contactPerson: 'Alex', contactPhone: '+91 98765 43210',
}
const proposal = { bom: [], terms: [], revision: '00' }
const technicalQuestion = 'Please confirm nameplate part numbers, quantities and any legacy references for each line item.'

test('each saved clarification row remains independently actionable', () => {
  const state = {
    approvals: [],
    clarifications: [
      { id: 'CL-1', oppId: opp.id, category: 'Technical', q: technicalQuestion, status: 'Open' },
      { id: 'CL-2', oppId: opp.id, category: 'Technical', q: technicalQuestion, status: 'Answered', response: 'VM600 IOC4T, two units.' },
    ],
  }
  const topics = actionableClarifications(opp, state)
  assert.deepEqual(topics.map(row => row.id), ['CL-1', 'CL-2'])
  assert.equal(readiness(opp, proposal, state).some(blocker => blocker.key === 'clarifications'), true)
  assert.equal(transitionBlockers(opp, 'Proposal', proposal, state).some(blocker => blocker.key === 'clarifications'), true)
})

test('a different unanswered clarification still blocks Proposal', () => {
  const state = {
    approvals: [],
    clarifications: [
      { id: 'CL-1', oppId: opp.id, category: 'Technical', q: technicalQuestion, status: 'Answered', response: 'VM600 IOC4T, two units.' },
      { id: 'CL-3', oppId: opp.id, category: 'Site data', q: 'Please provide the machine tag and existing sensor configuration.', status: 'Open' },
    ],
  }
  assert.equal(transitionBlockers(opp, 'Proposal', proposal, state).some(blocker => blocker.key === 'clarifications'), true)
})

test('a redundant delivery clarification does not block when the RFQ states delivery', () => {
  const state = {
    approvals: [],
    clarifications: [{
      id: 'CL-4', oppId: opp.id, category: 'Commercial', status: 'Open',
      q: 'Confirm the required delivery period and destination (ex-works or door delivery).',
    }],
  }
  const deliveryOpp = { ...opp, remarks: 'Delivery to Chennai is required within 12 weeks.' }
  assert.equal(actionableClarifications(deliveryOpp, state).length, 0)
  assert.equal(displayClarifications(deliveryOpp, state).length, 1)
  assert.equal(isClarificationCoveredBySource(deliveryOpp, state.clarifications[0], state), true)
  assert.equal(transitionBlockers(deliveryOpp, 'Proposal', proposal, state).some(blocker => blocker.key === 'clarifications'), false)
})

test('internal commercial history is hidden from customer clarification display', () => {
  const state = {
    approvals: [],
    clarifications: [{
      id: 'CL-5', oppId: opp.id, category: 'Commercial', status: 'Open',
      gap: 'Payment deviation requires customer confirmation',
      q: 'Please confirm whether the offered payment terms are acceptable.',
    }],
  }
  assert.equal(displayClarifications(opp, state).length, 0)
})

test('all customer clarification rows for an opportunity remain visible and actionable', () => {
  const state = {
    approvals: [],
    clarifications: [
      { id: 'CL-6', oppId: opp.id, category: 'Technical', status: 'Open', q: technicalQuestion },
      { id: 'CL-7', oppId: opp.id, category: 'Technical', status: 'Open', q: technicalQuestion },
      { id: 'CL-8', oppId: 'OTHER', category: 'Technical', status: 'Open', q: technicalQuestion },
    ],
  }
  assert.deepEqual(displayClarifications(opp, state).map(row => row.id), ['CL-6', 'CL-7'])
  assert.deepEqual(actionableClarifications(opp, state).map(row => row.id), ['CL-6', 'CL-7'])
})
