// Opportunity Details are the canonical source for shared proposal-header
// metadata. Proposal-only fields (pricing, BoQ, terms, revisions and review
// state) intentionally remain untouched by this mapper.
// Lead intake stores 'Unknown sender' / '(no subject)' when an enquiry arrives
// without them (Inbox.jsx), and those strings ride into oppName/sellTo. The
// truthiness guards below only caught '', so the placeholders were being baked
// into the proposal header and printed on customer documents.
const INTAKE_PLACEHOLDERS = [/unknown sender/i, /\(no subject\)/i, /unknown@sender/i]
const real = value => {
  const text = (value == null ? '' : String(value)).trim()
  return INTAKE_PLACEHOLDERS.some(pattern => pattern.test(text)) ? '' : text
}

export function syncProposalFromOpportunity(proposal, opportunity) {
  if (!proposal || !opportunity) return proposal

  const name = real(opportunity.oppName)
  const customer = real(opportunity.sellTo)

  return {
    ...proposal,
    addressee: customer ? `M/s. ${customer}` : '',
    attnPhone: opportunity.contactPhone || '',
    kindAttn: real(opportunity.contactPerson),
    rfqNumber: opportunity.rfqNumber || '',
    revisionDate: opportunity.rfqDate || proposal.revisionDate || '',
    subject: name ? `Proposal For ${name}` : '',
    project: name,
  }
}
