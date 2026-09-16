import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeCommercialTerm, needsCommercialApproval, needsCommercialDecision,
  isCounterAwaitingCustomer, commercialApprovalDetails,
  isLegacyCommercialClarification, isCommercialConfirmationRow,
  isDeliveryBasisClarification, sourceContainsDeliveryRequirement, commercialTermsFromLead,
} from '../src/commercialTerms.js'
import { oppBlockers } from '../src/gates.js'

const base = { term: 'Payment', customerAsk: '90 days credit', standardTerm: '30 days from invoice', proposedTerm: '30 days from invoice', status: 'Deviation' }

test('a deviation requires a salesperson decision, not a clarification', () => {
  const term = normalizeCommercialTerm(base)
  assert.equal(needsCommercialDecision(term), true)
  assert.equal(needsCommercialApproval(term), false)
  assert.equal(oppBlockers({ id: 'O-1', customerStatus: 'Green' }, { terms: [term] }, []).some(x => x.key === 'clarifications'), false)
})

test('counter-offer bypasses internal deviation approval and awaits the customer', () => {
  const term = normalizeCommercialTerm({ ...base, decision: 'Counter-offer with ModAE standard terms' })
  assert.equal(needsCommercialDecision(term), false)
  assert.equal(needsCommercialApproval(term), false)
  assert.equal(isCounterAwaitingCustomer(term), true)
})

test('a rejected or changed counter returns to the salesperson for a new decision', () => {
  for (const status of ['Rejected', 'Countered']) {
    const term = normalizeCommercialTerm({ ...base, decision: 'Counter-offer with ModAE standard terms', customerConfirmationStatus: status })
    assert.equal(needsCommercialDecision(term), true, status)
  }
})

test('legacy commercial clarification rows are excluded without deleting audit data', () => {
  assert.equal(isLegacyCommercialClarification({ category: 'Commercial', gap: 'Payment deviation requires customer confirmation' }), true)
  assert.equal(isCommercialConfirmationRow({ category: 'Logistics', evidence: 'Commercial deviations: Delivery', q: "Please confirm if ModAE's offered delivery timeline is acceptable against your requested requirement" }), true)
  assert.equal(isLegacyCommercialClarification({ category: 'Technical', gap: 'Signal list mismatch' }), false)
})

test('known delivery requirements do not generate a duplicate delivery clarification', () => {
  const row = { category: 'Commercial', gap: 'Delivery basis missing', q: 'Confirm the required delivery period and destination' }
  assert.equal(isDeliveryBasisClarification(row), true)
  assert.equal(sourceContainsDeliveryRequirement('Delivery to Pune within 8 weeks'), true)
})

test('offering the requested exception creates approval context', () => {
  const term = normalizeCommercialTerm({ ...base, decision: 'Match customer terms' })
  assert.equal(needsCommercialApproval(term), true)
  assert.deepEqual(commercialApprovalDetails([term]), [{
    term: 'Payment', customerAsk: '90 days credit', ourResponse: '90 days credit', standardTerm: '30 days from invoice',
  }])
})

test('lead extraction becomes proposal terms with evidence', () => {
  const terms = commercialTermsFromLead({ ai: { fields: [
    { group: 'Commercial', k: 'Payment Terms', v: '90 days credit', conf: 96, ev: 'Customer email' },
  ] } })
  assert.equal(terms.length, 1)
  assert.equal(terms[0].term, 'Payment')
  assert.equal(terms[0].status, 'Deviation')
  assert.equal(terms[0].decision, 'Decision pending')
  assert.equal(terms[0].evidence, 'Customer email')
})
