import test from 'node:test'
import assert from 'node:assert/strict'
import { migrate, seedState } from '../src/appState.js'
import { newProposal } from '../src/seed.js'
import { proposalApprovalSnapshot } from '../src/approvalMemory.js'

test('migrate repairs an approved release created before the proposal was persisted', () => {
  const state = seedState()
  const opportunity = state.opportunities[0]
  const proposal = newProposal(opportunity.id, opportunity)
  state.proposals = { [opportunity.id]: proposal }
  state.approvals = [{
    id: 'AP-legacy',
    oppId: opportunity.id,
    type: 'Final quote release',
    status: 'Approved',
    approver: 'LJS',
    needed: ['LJS', 'AH'],
    decisions: { LJS: { d: 'Approved' }, AH: { d: 'Approved' } },
    approvalSnapshot: proposalApprovalSnapshot(undefined, opportunity),
  }]

  const migrated = migrate(state)
  const repaired = migrated.approvals[0]

  assert.deepEqual(repaired.approvalSnapshot, proposalApprovalSnapshot(proposal, opportunity))
  assert.equal(repaired.snapshotRepair.reason, 'Approval was requested before the proposal was persisted')
})
