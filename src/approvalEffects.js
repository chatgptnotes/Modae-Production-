import { applyCustomerChange } from './excelLogic.js'
import { proposalApprovalSnapshot } from './approvalMemory.js'
import { transitionBlockers } from './gates.js'
const workflowTransition = (from, to, reason, id) => ({ id, from, to, reason })

export function applyApprovalEffects(s, appr, at = new Date().toISOString()) {
  let next = s
  if (appr.type === 'Red customer clearance' && appr.leadId) {
    // 'Returned' does NOT clear the gate — leave the lead untouched so the
    // salesperson can address the comments and re-request.
    const lead = next.leads.find(l => l.id === appr.leadId)
    const leadPatch = appr.status === 'Rejected'
      ? { status: 'Dropped', droppedReason: 'Red-class continuation rejected' }
      : appr.status === 'Approved' || appr.status === 'Approved with conditions'
        // A late decision must not walk an already-registered lead backwards:
        // 'Converted' owns a live opportunity, and Qualified would orphan it.
        ? (lead?.status === 'Converted' ? null : { status: 'Qualified' })
        : null
    if (leadPatch) next = { ...next, leads: next.leads.map(l => (l.id === appr.leadId ? { ...l, ...leadPatch } : l)) }
  }
  // A sales-raised customer-master change only lands once the gate clears.
  if (appr.type === 'Customer master change' && appr.customerName && appr.patch) {
    if (appr.status === 'Approved' || appr.status === 'Approved with conditions') {
      next = {
        ...next,
        ...applyCustomerChange(next, appr.customerName, appr.patch),
      }
    }
  }
  if (appr.type === 'Final quote release' && appr.oppId) {
    if (appr.status === 'Approved' || appr.status === 'Approved with conditions') {
      const p = next.proposals[appr.oppId]
      if (p) next = {
        ...next,
        proposals: { ...next.proposals, [appr.oppId]: {
          ...p,
          releaseStatus: 'Released',
          approvedPricing: {
            revision: p.revision,
            approvalSnapshot: appr.approvalSnapshot || proposalApprovalSnapshot(p, next.opportunities.find(o => o.id === appr.oppId)),
            listValue: appr.listValue ?? null,
            approvedValue: appr.requestedValue ?? null,
            discountPct: appr.discountPct ?? 0,
            markupPct: appr.markupPct ?? 0,
            approvedAt: at,
            approvalId: appr.id,
          },
          pricingHistory: [...(p.pricingHistory || []), {
            revision: p.revision,
            status: appr.status,
            when: at,
            listValue: appr.listValue ?? null,
            approvedValue: appr.requestedValue ?? null,
            discountPct: appr.discountPct ?? 0,
            markupPct: appr.markupPct ?? 0,
            approvalId: appr.id,
          }],
        } },
      }
      // Once the second joint decision lands, the quote is ready to dispatch
      // without requiring the owner to revisit the stepper.  Run the same
      // transition guard used by the workbench: a release must not skip a
      // still-pending technical/commercial gate or another lifecycle rule.
      const releasedProposal = next.proposals[appr.oppId]
      const releasedOpp = next.opportunities.find(o => o.id === appr.oppId)
      if (releasedProposal && releasedOpp && releasedOpp.milestone === 'Approval'
        && !transitionBlockers(releasedOpp, 'Submitted', releasedProposal, next).length) {
        next = {
          ...next,
          opportunities: next.opportunities.map(o => o.id === appr.oppId
            ? { ...o, milestone: 'Submitted', lastUpdated: new Date(new Date(at).getTime() + 19800000).toISOString().slice(0, 10),
                workflowTransition: workflowTransition(o.milestone, 'Submitted', 'Final quote release approved', `WFT-${appr.id}-approved`) }
            : o),
        }
      }
    } else if (appr.status === 'Returned') {
      next = { ...next, opportunities: next.opportunities.map(o => (o.id === appr.oppId && o.milestone === 'Approval'
        ? { ...o, milestone: 'Proposal', workflowTransition: workflowTransition(o.milestone, 'Proposal', appr.decisionNote || 'Approval returned', `WFT-${appr.id}-returned`) }
        : o)) }
    } else if (appr.status === 'Rejected') {
      next = { ...next, opportunities: next.opportunities.map(o => (o.id === appr.oppId ? { ...o, health: 'Blocked' } : o)) }
    }
  }
  return next
}
