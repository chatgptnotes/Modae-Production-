import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeConcurrentOpportunityRows } from '../src/server/workspace.js'

const opportunity = (milestone: string, extra: Record<string, unknown> = {}) => ({
  id: 'OP-1',
  milestone,
  stage: 'Open',
  status: 'Open',
  ...extra,
})

test('an older browser cannot replace a newer workflow milestone', () => {
  const merged = mergeConcurrentOpportunityRows(
    [opportunity('Proposal', { lastUpdated: '2026-09-27' })],
    [opportunity('Sourcing', { oppName: 'Edited from an old browser' })],
  )

  assert.equal(merged[0].milestone, 'Proposal')
  assert.equal(merged[0].oppName, 'Edited from an old browser')
})

test('a reasoned backward correction is accepted only from the current server milestone', () => {
  const correction = opportunity('Sourcing', {
    workflowTransition: {
      id: 'move-1',
      from: 'Proposal',
      to: 'Sourcing',
      reason: 'Customer sent a revised RFQ',
    },
  })
  const accepted = mergeConcurrentOpportunityRows([opportunity('Proposal')], [correction])
  const staleReplay = mergeConcurrentOpportunityRows(
    [opportunity('Proposal', { workflowTransitionAppliedId: 'move-1' })],
    [correction],
  )

  assert.equal(accepted[0].milestone, 'Sourcing')
  assert.equal(accepted[0].workflowTransitionAppliedId, 'move-1')
  assert.equal(staleReplay[0].milestone, 'Proposal')
})

test('an old approval tab cannot jump over a newer proposal revision', () => {
  const merged = mergeConcurrentOpportunityRows(
    [opportunity('Proposal')],
    [opportunity('Submitted', { workflowTransition: { id: 'release-1', from: 'Approval', to: 'Submitted', reason: 'Final quote released' } })],
  )

  assert.equal(merged[0].milestone, 'Proposal')
})

test('a revision can deliberately return the current workflow to Sourcing', () => {
  const merged = mergeConcurrentOpportunityRows(
    [opportunity('Submitted')],
    [opportunity('Sourcing', { workflowTransition: { id: 'revision-1', from: 'Submitted', to: 'Sourcing', reason: 'Customer revised the RFQ' } })],
  )

  assert.equal(merged[0].milestone, 'Sourcing')
})
