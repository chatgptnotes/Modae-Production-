import test from 'node:test'
import assert from 'node:assert/strict'

test('project multi-row editing preserves repeated model numbers and separate quantities', async () => {
  const { reviewProjectBoqEdits } = await import('../src/workbench/mobileProjectBoq.js')
  const proposal = { units: 2, bom: [{ pn: 'SAME', common: 1, qtyPerUnit: 1 }, { pn: 'SAME', common: 3, qtyPerUnit: 0 }] }
  const review = reviewProjectBoqEdits(proposal, 'common', { 0: '4', 1: '7' })
  assert.equal(review.errors.length, 0)
  assert.deepEqual(review.proposal.bom.map(l => l.common), [4, 7])
  assert.equal(proposal.bom[0].common, 1)
})

test('project drafts refuse invalid values, unknown fields and missing rows', async () => {
  const { reviewProjectBoqEdits } = await import('../src/workbench/mobileProjectBoq.js')
  const proposal = { bom: [{ pn: 'P', common: 1 }] }
  for (const [field, drafts] of [['common', { 0: '-3' }], ['common', { 0: '' }], ['common', { 9: '2' }], ['currency', { 0: '1' }]]) assert.ok(reviewProjectBoqEdits(proposal, field, drafts).errors.length)
})

test('project customer prices convert from proposal currency and blank restores calculated pricing', async () => {
  const { reviewProjectBoqEdits } = await import('../src/workbench/mobileProjectBoq.js')
  const proposal = { sourceCurrency: 'EUR', costing: { currencyRates: { EUR: 100 } }, bom: [{ pn: 'P', quoted: '200' }] }
  assert.equal(reviewProjectBoqEdits(proposal, 'quoted', { 0: '15' }).proposal.bom[0].quoted, '1500')
  assert.equal(reviewProjectBoqEdits(proposal, 'quoted', { 0: '' }).proposal.bom[0].quoted, '')
})

test('project sourcing edits require the current stage and owner or admin authorization', async () => {
  const { projectSourcingEditable } = await import('../src/workbench/mobileProjectBoq.js')
  const opp = { owner: 'LJS', route: 'Project', milestone: 'Sourcing', status: 'Open' }
  assert.equal(projectSourcingEditable(opp, 'LJS', false), true)
  assert.equal(projectSourcingEditable(opp, 'ADMIN', false), true)
  assert.equal(projectSourcingEditable(opp, 'TECH', false), false)
  assert.equal(projectSourcingEditable(opp, 'LJS', true), false)
  assert.equal(projectSourcingEditable({ ...opp, status: 'Closed' }, 'ADMIN', false), false)
  assert.equal(projectSourcingEditable({ ...opp, milestone: 'Proposal' }, 'LJS', false), false)
})

test('project draft storage is isolated by user, opportunity and category', async () => {
  const { projectDraftStorageKey } = await import('../src/workbench/mobileProjectBoq.js')
  assert.notEqual(projectDraftStorageKey('U1', 'O1', 'Hardware'), projectDraftStorageKey('U2', 'O1', 'Hardware'))
  assert.notEqual(projectDraftStorageKey('U1', 'O1', 'Hardware'), projectDraftStorageKey('U1', 'O2', 'Hardware'))
  assert.notEqual(projectDraftStorageKey('U1', 'O1', 'Hardware'), projectDraftStorageKey('U1', 'O1', 'Software'))
})

test('project edits invalidate a previously validated workbook review', async () => {
  const { projectProposalAfterEdit } = await import('../src/workbench/mobileProjectBoq.js')
  const result = projectProposalAfterEdit({ bom: [{}], reviewStatus: 'Validated', reviewIssues: ['old'], reviewNeedsRevision: false })
  assert.equal(result.reviewStatus, 'Needs review')
  assert.equal(result.pricedOnce, true)
  assert.equal(result.reviewNeedsRevision, true)
  assert.deepEqual(result.reviewIssues, [])
})
