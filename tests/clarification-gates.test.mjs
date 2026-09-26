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

test('a saved answer resolves an equivalent duplicate clarification without deleting either row', () => {
  const state = {
    approvals: [],
    clarifications: [
      { id: 'CL-1', oppId: opp.id, category: 'Technical', q: technicalQuestion, status: 'Open' },
      { id: 'CL-2', oppId: opp.id, category: 'Technical', q: technicalQuestion, status: 'Answered', response: 'VM600 IOC4T, two units.' },
    ],
  }
  const topics = actionableClarifications(opp, state)
  assert.deepEqual(topics.map(row => row.id), ['CL-1', 'CL-2'])
  assert.equal(readiness(opp, proposal, state).some(blocker => blocker.key === 'clarifications'), false)
  assert.equal(transitionBlockers(opp, 'Proposal', proposal, state).some(blocker => blocker.key === 'clarifications'), false)
})

test('answered training and service scope resolves the matching duplicate but not site access', () => {
  const clarifications = [
    { id: 'CL-3-open', oppId: opp.id, status: 'Open', category: 'Technical', q: 'Could you provide details on the training requirements (e.g., number of participants, duration) and the scope of work for the requested on-site services?' },
    { id: 'CL-5-answered', oppId: opp.id, status: 'Answered', response: 'Training for two participants; standard commissioning scope.', category: 'Technical', q: 'Could you provide a brief outline of the training requirements and the specific scope of work for the requested on-site services?' },
    { id: 'CL-site-open', oppId: opp.id, status: 'Open', category: 'Site data', q: 'Will the on-site services involve installation, commissioning, or troubleshooting, and are there site access or permit requirements?' },
  ]
  const state = { approvals: [], clarifications }
  assert.equal(readiness(opp, proposal, state).some(blocker => blocker.key === 'clarifications'), true)
  assert.equal(transitionBlockers(opp, 'Proposal', proposal, state).some(blocker => blocker.key === 'clarifications'), true)
})

test('an answer needing review or carrying missing information does not resolve a duplicate', () => {
  const open = { id: 'CL-open', oppId: opp.id, category: 'Technical', q: 'Could you provide details on the training requirements and scope of work for the requested on-site services?', status: 'Open' }
  for (const answered of [
    { id: 'CL-review', oppId: opp.id, category: 'Technical', q: 'Please outline the training requirements and on-site service scope.', status: 'Needs review', response: 'Training for two people' },
    { id: 'CL-missing', oppId: opp.id, category: 'Technical', q: 'Please outline the training requirements and on-site service scope.', status: 'Answered', response: 'Training for two people', missing: 'Confirm the duration' },
  ]) {
    const state = { approvals: [], clarifications: [open, answered] }
    assert.equal(transitionBlockers(opp, 'Proposal', proposal, state).some(blocker => blocker.key === 'clarifications'), true)
  }
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
