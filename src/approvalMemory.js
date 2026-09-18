const normalize = value => String(value ?? '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim()

const json = value => JSON.stringify(value)
const qtyOf = (line, units = 1) => line?.qtyPerUnit === undefined && line?.qty != null
  ? Number(line.qty) || 0
  : (Number(line?.qtyPerUnit) || 0) * (Number(units) || 1)
    + (Number(line?.common) || 0) + (Number(line?.spares) || 0)

const bomTechnical = proposal => (proposal?.bom || []).map(line => ({
  desc: normalize(line?.desc || line?.itemCategory),
  pn: normalize(line?.pn || line?.custRef),
  qty: qtyOf(line, proposal?.units),
  uom: normalize(line?.uom),
})).filter(line => line.desc || line.pn || line.qty)

const bomCommercial = proposal => (proposal?.bom || []).map(line => ({
  pn: normalize(line?.pn || line?.custRef),
  qty: qtyOf(line, proposal?.units),
  quoted: Number(line?.quoted) || 0,
  currency: normalize(line?.currency),
  listPrice: Number(line?.listPrice) || 0,
})).filter(line => line.pn || line.qty || line.quoted || line.listPrice)

// This snapshot describes the decision inputs, not the proposal revision
// label. A harmless revision increment must not erase an unaffected approval.
export const proposalApprovalSnapshot = (proposal = {}, opportunity = {}) => ({
  customer: {
    sellTo: normalize(opportunity.sellTo),
    route: normalize(opportunity.route || proposal.route || proposal.proposalType),
    proposalType: normalize(proposal.proposalType),
    currency: normalize(proposal.sourceCurrency),
  },
  technical: {
    bom: bomTechnical(proposal),
    signals: proposal.signals || null,
  },
  commercial: {
    bom: bomCommercial(proposal),
    terms: (proposal.terms || []).map(term => ({
      term: normalize(term?.term),
      status: normalize(term?.status),
      text: normalize(term?.text || term?.customerAsk || term?.counter),
    })),
    discountPct: Number(proposal.discountPct) || 0,
    markupPct: Number(proposal.markupPct) || 0,
    financeCostK: Number(proposal.costing?.financeCostK) || 0,
    sourceRate: Number(proposal.sourceRate) || 0,
  },
  release: {
    addressee: normalize(proposal.addressee),
    kindAttn: normalize(proposal.kindAttn),
    subject: normalize(proposal.subject),
    letterBody: normalize(proposal.letterBody),
    validityDays: Number(proposal.validityDays) || 0,
    technical: bomTechnical(proposal),
    commercial: bomCommercial(proposal),
    terms: (proposal.terms || []).map(term => ({
      term: normalize(term?.term),
      status: normalize(term?.status),
      text: normalize(term?.text || term?.customerAsk || term?.counter),
    })),
  },
})

const same = (left, right) => json(left) === json(right)

// Returns the decision domains affected by the current proposal compared with
// an approval snapshot. `customer` is intentionally broad: customer identity,
// route, or currency changes can invalidate every customer-facing decision.
export const proposalImpact = (approvedSnapshot, proposal, opportunity = {}) => {
  if (!approvedSnapshot) return null
  const current = proposalApprovalSnapshot(proposal, opportunity)
  const impact = new Set()
  if (!same(approvedSnapshot.customer, current.customer)) impact.add('customer')
  if (!same(approvedSnapshot.technical, current.technical)) impact.add('technical')
  if (!same(approvedSnapshot.commercial, current.commercial)) impact.add('commercial')
  if (!same(approvedSnapshot.release, current.release)) impact.add('release')
  return impact
}

const domainsForType = type => {
  if (type === 'Technical approval') return ['technical', 'customer']
  if (type === 'Commercial approval' || type === 'Commercial deviation' || type === 'Pricing threshold exception') return ['commercial', 'customer']
  if (type === 'Final quote release' || type === 'Service offer review') return ['release', 'customer']
  if (/customer|red/i.test(type)) return ['customer']
  return ['release', 'customer']
}

// Snapshot-backed approvals carry across revisions only when none of their
// decision domains changed. Legacy records return null and retain the caller's
// existing revision-scoped fallback behavior.
export const approvalAffectedByProposal = (approval, type, proposal, opportunity) => {
  const impact = proposalImpact(approval?.approvalSnapshot, proposal, opportunity)
  if (!impact) return null
  return domainsForType(type).some(domain => impact.has(domain))
}

// Approval memory is scoped to the opportunity, decision type, revision, and
// business detail. It is never a global approval cache.
export const approvalMemoryKey = request => [
  request?.oppId,
  request?.type,
  request?.rev,
  request?.findingKey || request?.detail || request?.blockingReason || request?.text,
].map(normalize).join('|')

export const reviewFindingKey = issue => [
  issue?.code,
  issue?.text,
  issue?.evidence,
].map(normalize).join('|')
