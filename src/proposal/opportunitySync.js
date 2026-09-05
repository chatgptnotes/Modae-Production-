// Opportunity Details are the canonical source for shared proposal-header
// metadata. Proposal-only fields (pricing, BoQ, terms, revisions and review
// state) intentionally remain untouched by this mapper.
export function syncProposalFromOpportunity(proposal, opportunity) {
  if (!proposal || !opportunity) return proposal

  const name = opportunity.oppName || ''
  const customer = opportunity.sellTo || ''

  return {
    ...proposal,
    addressee: customer ? `M/s. ${customer}` : '',
    attnPhone: opportunity.contactPhone || '',
    kindAttn: opportunity.contactPerson || '',
    rfqNumber: opportunity.rfqNumber || '',
    revisionDate: opportunity.rfqDate || proposal.revisionDate || '',
    subject: name ? `Proposal For ${name}` : '',
    project: name,
  }
}
