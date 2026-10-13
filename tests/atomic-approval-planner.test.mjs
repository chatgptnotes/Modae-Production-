import test from 'node:test'
import assert from 'node:assert/strict'
import { planApprovalDecision } from '../api/_approval-planner.js'

const actor = { id: 'u', authId: 'u', role: 'LJS', status: 'Active' }
const request = { id: 'A', type: 'Red customer clearance', leadId: 'L', needed: ['LJS','AH'], status: 'Pending', decisions: {} }
function context(approval = request) {
  return { at: '2026-10-13T10:00:00Z', generation: '0', guards: [], rows: [
    { entity: 'state', id: 'users', rev: 1, data: [actor] },
    { entity: 'settings', id: 'config', rev: 1, data: {} },
    { entity: 'approvals', id: 'A', rev: 1, data: approval },
    { entity: 'leads', id: 'L', rev: 1, data: { id: 'L', status: 'New' } },
  ] }
}
const command = { requestId: 'A', operationId: 'id', expectedRev: 1, generation: '0', action: 'accept', comment: 'Reviewed', commentReview: null }
test('joint signature stays pending and produces no business effects', () => {
  const plan = planApprovalDecision(context(), { id: 'u' }, command)
  assert.equal(plan.expectedStatus, 'Pending')
  assert.deepEqual(plan.writes, [])
})
test('last joint signature qualifies the lead atomically', () => {
  const plan = planApprovalDecision(context({ ...request, decisions: { AH: { d: 'Approved' } } }), { id: 'u' }, command)
  assert.equal(plan.expectedStatus, 'Approved')
  assert.equal(plan.writes.find(r => r.entity === 'leads').data.status, 'Qualified')
})
test('reject keeps the rejection review and drops red lead', () => {
  const plan = planApprovalDecision(context(), { id: 'u' }, { ...command, action: 'reject' })
  assert.equal(plan.expectedStatus, 'Rejected')
  assert.equal(plan.writes[0].data.status, 'Dropped')
})
test('revoked account cannot build a server plan', () => {
  const snapshot = context(); snapshot.rows[0].data = [{ ...actor, accessPending: true }]
  assert.throws(() => planApprovalDecision(snapshot, { id: 'u' }, command), e => e.status === 403)
})
test('missing required business row fails closed', () => {
  const snapshot = context({ ...request, anyOf: true }); snapshot.rows.pop()
  assert.throws(() => planApprovalDecision(snapshot, { id: 'u' }, command), e => e.status === 409)
})


test('a superseded request cannot receive another signature', () => {
  assert.throws(() => planApprovalDecision(context({ ...request, supersededBy: 'NEW' }), { id: 'u' }, command), e => e.status === 409)
})

test('customer approval updates the master and its related business rows together', () => {
  const snapshot = context({ ...request, type: 'Customer master change', customerName: 'Acme', patch: { status: 'Blue' }, anyOf: true })
  snapshot.rows.push({ entity: 'state', id: 'customers', rev: 2, data: [{ name: 'Acme', status: 'Red' }] },
    { entity: 'opportunities', id: 'O', rev: 4, data: { id: 'O', sellTo: 'ACME', customerStatus: 'Red' } })
  snapshot.rows.find(r => r.entity === 'leads').data.sellTo = 'Acme'
  const plan = planApprovalDecision(snapshot, { id: 'u' }, command)
  assert.deepEqual(plan.writes.map(r => r.entity).sort(), ['leads', 'opportunities', 'state'])
  assert.equal(plan.writes.find(r => r.entity === 'state').data[0].status, 'Blue')
  assert.equal(plan.writes.find(r => r.entity === 'opportunities').data.customerStatus, 'Blue')
})

test('final quote approval releases the proposal and appends one pricing receipt', () => {
  const snapshot = context({ ...request, type: 'Final quote release', oppId: 'O', anyOf: true, requestedValue: 80, listValue: 100 })
  snapshot.rows.push({ entity: 'opportunities', id: 'O', rev: 1, data: { id: 'O', milestone: 'Proposal' } },
    { entity: 'proposals', id: 'O', rev: 1, data: { revision: '01', pricingHistory: [] } })
  const plan = planApprovalDecision(snapshot, { id: 'u' }, command)
  const proposal = plan.writes.find(r => r.entity === 'proposals').data
  assert.equal(proposal.releaseStatus, 'Released')
  assert.equal(proposal.approvedPricing.approvalId, 'A')
  assert.equal(proposal.pricingHistory.length, 1)
  assert.equal(proposal.approvedPricing.approvedAt, snapshot.at)
})
