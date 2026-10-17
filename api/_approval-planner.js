import { applyApprovalEffects } from '../src/approvalEffects.js'
import { canAccessPage, canPerform } from '../src/accessPolicy.js'
import { isActiveUser, accountProfileFor } from '../src/userManagement.js'
import { proposalApprovalSnapshot, approvalAffectedByProposal } from '../src/approvalMemory.js'

const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status, code: `PT${status}` }) }
export function approvalContextState(rows) {
  const state = { customers: [], leads: [], opportunities: [], approvals: [], proposals: {}, sparesLines: [], clarifications: [] }
  for (const row of rows) {
    if (row.entity === 'state') state[row.id] = row.data
    else if (row.entity === 'settings') state.config = row.data
    else if (row.entity === 'proposals') state.proposals[row.id] = row.data
    else (state[{ spares_lines: 'sparesLines' }[row.entity] || row.entity] ||= []).push(row.data)
  }
  return state
}

// The context RPC returns rows and scope revisions from ONE database snapshot.
// The commit RPC validates every scope before using this trusted server plan.
export function planApprovalDecision(context, authUser, command) {
  const state = approvalContextState(context.rows)
  const profile = accountProfileFor(state.users || [], authUser)
  if (!isActiveUser(profile) || !canAccessPage(profile, 'approvals', state.config) || !canPerform(profile, 'approvals.decide', state.config)) fail('You cannot decide approvals.', 403)
  const row = context.rows.find(r => r.entity === 'approvals' && r.id === command.requestId)
  if (!row) fail('Approval not found.', 404)
  const approval = row.data
  const needed = approval.needed || [approval.approver].filter(Boolean)
  if (!needed.includes(profile.role)) fail('You are not an assigned approver.', 403)
  if (String(context.generation) !== command.generation || row.rev !== command.expectedRev || approval.status !== 'Pending' || approval.supersededBy || approval.decisions?.[profile.role]) fail('This approval changed. Refresh before deciding.')
  const opp = state.opportunities.find(o => o.id === approval.oppId)
  const proposal = state.proposals[approval.oppId]
  if (approval.approvalSnapshot && proposal && approvalAffectedByProposal(approval, approval.type, proposal, opp)) fail('The approval inputs changed. Request a new approval.')
  const decisions = { ...approval.decisions, [profile.role]: { d: command.action === 'accept' ? 'Approved' : 'Rejected' } }
  const complete = approval.anyOf ? needed.some(role => decisions[role]) : needed.every(role => decisions[role])
  const status = Object.values(decisions).some(d => d.d === 'Rejected') ? 'Rejected' : complete ? 'Approved' : 'Pending'
  // Legacy pending rows may lack a snapshot. Bind it on the FIRST signature,
  // so later signers cannot silently approve a different proposal revision.
  const approvalSnapshot = approval.approvalSnapshot || (proposal ? proposalApprovalSnapshot(proposal, opp) : null)
  const nextApproval = { ...approval, decisions, status, ...(approvalSnapshot ? { approvalSnapshot } : {}) }
  let next = { ...state, approvals: state.approvals.map(a => a.id === approval.id ? nextApproval : a) }
  if (status !== 'Pending') {
    if (approval.type === 'Red customer clearance' && !state.leads.some(l => l.id === approval.leadId)) fail('The lead is unavailable.')
    if (approval.type === 'Final quote release' && (!opp || !proposal)) fail('The proposal or opportunity is unavailable.')
    if (approval.type === 'Customer master change' && !state.customers.some(c => c.name.trim().toLowerCase() === String(approval.customerName).trim().toLowerCase())) fail('The customer is unavailable.')
    next = applyApprovalEffects(next, nextApproval, context.at)
  }
  const writes = []
  for (const r of context.rows) {
    if (!['leads', 'opportunities', 'proposals', 'state'].includes(r.entity) || r.entity === 'state' && r.id !== 'customers') continue
    const data = r.entity === 'state' ? next[r.id] : r.entity === 'proposals' ? next.proposals[r.id] : next[r.entity].find(v => v.id === r.id)
    if (JSON.stringify(data) !== JSON.stringify(r.data)) writes.push({ entity: r.entity, id: r.id, rev: r.rev, data })
  }
  return { guards: context.guards, reads: context.rows.map(({ entity, id, rev }) => ({ entity, id, rev })), writes, expectedStatus: status, approvalSnapshot, at: context.at }
}
