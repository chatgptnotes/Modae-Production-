const daysSince = value => {
  const time = new Date(value || 0).getTime()
  return Number.isFinite(time) && time > 0 ? Math.floor((Date.now() - time) / 86400000) : 0
}

// An alert is addressed to one person. Without these two predicates every role
// saw every other role's pending approvals and overdue opportunities.
const ownsOpportunity = (opp, role) => !role || opp.owner === role
const involvedInApproval = (approval, role) =>
  !role || [...(approval.needed || []), approval.approver, approval.requestedBy].filter(Boolean).includes(role)

export function computeAlerts(state, today = new Date()) {
  const alerts = []
  const now = today.getTime()
  const role = state?.role
  // `key` separates identity from the record the alert points at: two approvals
  // on one opportunity share an objectId but must not share an id.
  const add = (type, severity, objectId, message, nextAction, createdAt, key = objectId) =>
    alerts.push({ id: `${type}-${key}`, type, severity, objectId, message, nextAction, createdAt: createdAt || new Date(now).toISOString(), readAt: null })
  for (const opp of state?.opportunities || []) {
    if (opp.status !== 'Open' || !ownsOpportunity(opp, role)) continue
    const when = opp.lastUpdated
    if (opp.kycDue && new Date(opp.kycDue).getTime() < now) add('overdue-kyc', 'high', opp.id, `${opp.id} has overdue KYC`, 'Open Customer/KYC', opp.kycDue)
    if (opp.amberFeeDue && new Date(opp.amberFeeDue).getTime() < now) add('amber-fee-expiry', 'high', opp.id, `${opp.id} Amber fee has expired`, 'Review Amber fee', opp.amberFeeDue)
    if (daysSince(opp.lastUpdated) >= 7) add('stale-opportunity', 'medium', opp.id, `${opp.id} is stale`, 'Record a follow-up', when)
    if (opp.proposalExpiry && new Date(opp.proposalExpiry).getTime() < now) add('proposal-expiry', 'high', opp.id, `${opp.id} proposal has expired`, 'Revise proposal', opp.proposalExpiry)
    if (!opp.nextAction && daysSince(opp.lastUpdated) >= 3) add('missing-follow-up', 'medium', opp.id, `${opp.id} has no follow-up recorded`, 'Add next action', when)
  }
  for (const approval of state?.approvals || []) {
    if (approval.status !== 'Pending' || !involvedInApproval(approval, role)) continue
    add('pending-approval', 'medium', approval.oppId || approval.id, `${approval.type || 'Approval'} is pending`, 'Open Approvals', approval.ts, approval.id)
  }
  return alerts
}
