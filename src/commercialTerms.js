// Commercial negotiation is a three-party lifecycle, not a clarification:
// customer request -> ModAE decision -> customer response.
export const COMMERCIAL_DECISIONS = ['Decision pending', 'Match customer terms', 'Counter-offer with ModAE standard terms']
export const CUSTOMER_CONFIRMATION_STATUSES = ['Not required', 'Awaiting reply', 'Accepted', 'Rejected', 'Countered']

// The one-click fallback used when a proposal has no customer commercial
// terms. These are ModAE's customer-facing standard positions, not customer
// requests or deviations.
export const modaeStandardCommercialTerms = () => [
  {
    key: 'payment', term: 'Payment', customerAsk: '',
    standardTerm: 'Advance / 30 days from invoice preferred',
    proposedTerm: '30 days from invoice', ourResponse: '30 days from invoice',
    status: 'Comply', decision: 'Compliant', customerConfirmationStatus: 'Not required',
    source: 'ModAE standard',
  },
  {
    key: 'delivery', term: 'Delivery', customerAsk: '',
    standardTerm: '10–12 weeks ex-works for imported sensor items',
    proposedTerm: '10–12 weeks ex-works', ourResponse: '10–12 weeks ex-works',
    status: 'Comply', decision: 'Compliant', customerConfirmationStatus: 'Not required',
    source: 'ModAE standard',
  },
  {
    key: 'warranty', term: 'Warranty', customerAsk: '',
    standardTerm: '18 months from supply / 12 months from installation',
    proposedTerm: '18 months from supply', ourResponse: '18 months from supply',
    status: 'Comply', decision: 'Compliant', customerConfirmationStatus: 'Not required',
    source: 'ModAE standard',
  },
  {
    key: 'freight', term: 'Freight', customerAsk: '',
    standardTerm: 'Freight-paid delivery to the named consignee',
    proposedTerm: 'Freight-paid delivery to the named consignee',
    ourResponse: 'Freight-paid delivery to the named consignee',
    status: 'Comply', decision: 'Compliant', customerConfirmationStatus: 'Not required',
    source: 'ModAE standard',
  },
  {
    key: 'validity', term: 'Proposal validity', customerAsk: '',
    standardTerm: '30 days from proposal date',
    proposedTerm: '30 days from proposal date', ourResponse: '30 days from proposal date',
    status: 'Comply', decision: 'Compliant', customerConfirmationStatus: 'Not required',
    source: 'ModAE standard',
  },
]

export const isCommercialDeviation = term => term?.status === 'Deviation'
export const needsCommercialDecision = term => isCommercialDeviation(term)
  && (!COMMERCIAL_DECISIONS.slice(1).includes(term.decision)
    || (term.decision === 'Counter-offer with ModAE standard terms' && ['Rejected', 'Countered'].includes(term.customerConfirmationStatus)))
export const needsCommercialApproval = term => isCommercialDeviation(term) && term.decision === 'Match customer terms'
export const isCounterAwaitingCustomer = term => isCommercialDeviation(term)
  && term.decision === 'Counter-offer with ModAE standard terms'
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
  const legacy = { Undecided: 'Decision pending', 'Offer customer request': 'Match customer terms', Counter: 'Counter-offer with ModAE standard terms' }
  const decision = COMMERCIAL_DECISIONS.includes(term.decision) ? term.decision : (legacy[term.decision] || 'Decision pending')
  return {
    ...term,
    decision,
    standardTerm: term.standardTerm || term.ourResponse || '',
    proposedTerm: term.proposedTerm || term.ourResponse || '',
    customerConfirmationStatus: decision === 'Counter-offer with ModAE standard terms'
      ? (term.customerConfirmationStatus || 'Awaiting reply')
      : decision === 'Match customer terms' ? 'Not required' : (term.customerConfirmationStatus || 'Not required'),
  }
}

export const commercialApprovalDetails = terms => (terms || [])
  .filter(needsCommercialApproval)
  .map(term => ({
    term: term.term,
    customerAsk: term.customerAsk,
    ourResponse: term.decision === 'Match customer terms' ? term.customerAsk : (term.proposedTerm || term.ourResponse || term.customerAsk),
    standardTerm: term.standardTerm,
  }))

const LEAD_STANDARD_TERMS = {
  payment: { standard: 'Advance / 30 days from invoice preferred', judge: value => (/after|receipt of material|installation|commissioning/i.test(value) || Number(value.match(/(\d+)\s*days?/i)?.[1] || 0) > 30) ? 'Deviation' : 'Comply', response: '30 days from invoice' },
  delivery: { standard: '10–12 weeks ex-works for imported sensor items', judge: value => Number(value.match(/(\d+)\s*weeks?/i)?.[1] || 0) > 0 && Number(value.match(/(\d+)\s*weeks?/i)?.[1] || 0) < 10 ? 'Deviation' : 'Comply', response: '10–12 weeks ex-works' },
  warranty: { standard: '18 months from supply / 12 months from installation', judge: value => Number(value.match(/(\d+)\s*months?/i)?.[1] || 0) > 18 ? 'Deviation' : 'Comply', response: '18 months from supply' },
  freight: { standard: 'Freight-paid delivery to the named consignee', judge: () => 'Comply', response: 'Freight-paid delivery to the named consignee' },
  validity: { standard: '30 days from proposal date', judge: value => Number(value.match(/(\d+)\s*days?/i)?.[1] || 0) < 30 ? 'Deviation' : 'Comply', response: '30 days from proposal date' },
}
const standardFor = key => LEAD_STANDARD_TERMS[key]
const termKeyFor = value => {
  const text = String(value || '')
  if (/payment|credit|invoice/i.test(text)) return 'payment'
  if (/delivery|lead\s*time|dispatch/i.test(text)) return 'delivery'
  if (/warranty|guarantee|defect/i.test(text)) return 'warranty'
  if (/freight|incoterm|shipping/i.test(text)) return 'freight'
  if (/validity|offer\s+valid/i.test(text)) return 'validity'
  return ''
}

// Lead extraction stores customer-supported values in AI fields. Convert only
// those fields into proposal terms; never fill an absent customer request from
// ModAE defaults or demo data.
export const commercialTermsFromLead = lead => {
  const fields = [...(lead?.ai?.fields || []), ...(lead?.commercialTerms || [])]
  const seen = new Set()
  return fields.flatMap(field => {
    const key = field.key || termKeyFor(field.k || field.term || field.label)
    const value = String(field.value || field.v || field.customerAsk || '').trim()
    const rule = standardFor(key)
    if (!key || !value || !rule || seen.has(key)) return []
    seen.add(key)
    const status = rule.judge(value)
    return [{
      key,
      term: key === 'payment' ? 'Payment' : key === 'delivery' ? 'Delivery' : rule.label,
      customerAsk: value,
      standardTerm: rule.standard,
      proposedTerm: rule.response,
      ourResponse: rule.response,
      status,
      decision: status === 'Deviation' ? 'Decision pending' : 'Compliant',
      customerConfirmationStatus: 'Not required',
      evidence: field.evidence || field.ev || field.source || 'Customer lead',
    }]
  })
}
