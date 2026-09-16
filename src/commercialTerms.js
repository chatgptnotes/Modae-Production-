// Commercial negotiation is a three-party lifecycle, not a clarification:
// customer request -> ModAE decision -> customer response.
export const COMMERCIAL_DECISIONS = ['Undecided', 'Offer customer request', 'Counter']
export const CUSTOMER_CONFIRMATION_STATUSES = ['Not required', 'Awaiting reply', 'Accepted', 'Rejected', 'Countered']

export const isCommercialDeviation = term => term?.status === 'Deviation'
export const needsCommercialDecision = term => isCommercialDeviation(term)
  && (!COMMERCIAL_DECISIONS.slice(1).includes(term.decision)
    || (term.decision === 'Counter' && ['Rejected', 'Countered'].includes(term.customerConfirmationStatus)))
export const needsCommercialApproval = term => isCommercialDeviation(term) && term.decision === 'Offer customer request'
export const isCounterAwaitingCustomer = term => isCommercialDeviation(term)
  && term.decision === 'Counter'
  && (term.customerConfirmationStatus || 'Awaiting reply') === 'Awaiting reply'

// Rows created by the old implementation are retained for audit, but must not
// continue to behave as customer clarifications or block the sourcing gate.
export const isLegacyCommercialClarification = row => row?.category === 'Commercial'
  && (/deviation requires customer confirmation/i.test(String(row.gap || ''))
    || /commercial deviations?/i.test(String(row.evidence || ''))
    || /(?:offered|proposed).*(?:acceptable|acceptance).*(?:requested|customer)/i.test(String(row.q || '')))

// Negotiation rows may be labelled Logistics instead of Commercial, but they
// are still confirmation records rather than missing-information questions.
export const isCommercialConfirmationRow = row => /commercial deviations?/i.test(String(row.evidence || ''))
  || /(?:payment|delivery).*(?:offered|proposed).*(?:acceptable|acceptance).*(?:requested|customer)/i.test(String(row.q || ''))

export const isDeliveryBasisClarification = row => row?.category === 'Commercial'
  && /delivery basis missing|delivery period and destination/i.test(`${row.gap || ''} ${row.q || ''}`)

export const sourceContainsDeliveryRequirement = source => /(?:delivery\s+(?:to|at)|within\s+\d+\s*(?:week|day)|\d+\s*(?:week|day)s?\s+(?:delivery|lead))/i.test(String(source || ''))

export function normalizeCommercialTerm(term) {
  if (!term || term.status !== 'Deviation') return {
    ...term,
    decision: term?.decision || 'Compliant',
    customerConfirmationStatus: 'Not required',
  }
  const decision = COMMERCIAL_DECISIONS.includes(term.decision) ? term.decision : 'Undecided'
  return {
    ...term,
    decision,
    standardTerm: term.standardTerm || term.ourResponse || '',
    proposedTerm: term.proposedTerm || term.ourResponse || '',
    customerConfirmationStatus: decision === 'Counter'
      ? (term.customerConfirmationStatus || 'Awaiting reply')
      : decision === 'Offer customer request' ? 'Not required' : (term.customerConfirmationStatus || 'Not required'),
  }
}

export const commercialApprovalDetails = terms => (terms || [])
  .filter(needsCommercialApproval)
  .map(term => ({
    term: term.term,
    customerAsk: term.customerAsk,
    ourResponse: term.decision === 'Offer customer request' ? term.customerAsk : (term.proposedTerm || term.ourResponse || term.customerAsk),
    standardTerm: term.standardTerm,
  }))
