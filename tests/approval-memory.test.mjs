import test from 'node:test'
import assert from 'node:assert/strict'
import { approvalMemoryKey, approvalAffectedByProposal, proposalApprovalSnapshot, reviewFindingKey } from '../src/approvalMemory.js'
import * as approvalMemory from '../src/approvalMemory.js'

test('approval requests use collision-resistant identifiers across browsers', () => {
  const mint = approvalMemory.approvalRequestId
  assert.equal(typeof mint, 'function')
  if (typeof mint !== 'function') return
  const ids = new Set(Array.from({ length: 20 }, () => mint()))
  assert.equal(ids.size, 20)
  assert.ok([...ids].every(id => /^AP-/.test(id)))
})

test('approval memory is stable for the same scoped decision', () => {
  const first = approvalMemoryKey({ oppId: 'OP-1', type: 'Pricing threshold exception', rev: '01', detail: 'Markup above 10%' })
  const same = approvalMemoryKey({ oppId: 'OP-1', type: 'Pricing threshold exception', rev: '01', detail: '  Markup   above 10% ' })
  assert.equal(first, same)
})

test('approval memory changes for a new revision or business detail', () => {
  const base = { oppId: 'OP-1', type: 'Commercial deviation', rev: '01', detail: 'Payment terms differ' }
  assert.notEqual(approvalMemoryKey(base), approvalMemoryKey({ ...base, rev: '02' }))
  assert.notEqual(approvalMemoryKey(base), approvalMemoryKey({ ...base, detail: 'Warranty terms differ' }))
})

test('final release identity ignores screen-specific description text', () => {
  const builder = approvalMemoryKey({ oppId: 'OP-1', type: 'Final quote release', rev: '01', detail: 'GM 45% — AH + LJS' })
  const submission = approvalMemoryKey({ oppId: 'OP-1', type: 'Final quote release', rev: '01', detail: 'Final quote release is required before sending' })
  assert.equal(builder, submission, 'one quote revision must have one final-release gate')
})

test('review finding keys ignore formatting-only differences', () => {
  assert.equal(
    reviewFindingKey({ code: 'line.part', text: 'Missing  part number', evidence: 'Workbook row 3' }),
    reviewFindingKey({ code: ' line.part ', text: 'Missing part number', evidence: 'Workbook row 3' }),
  )
})

test('snapshot-backed approvals survive unrelated proposal edits', () => {
  const original = { units: 1, sourceCurrency: 'INR', bom: [{ desc: 'Probe', pn: 'PRB-1', qtyPerUnit: 1, common: 0, spares: 0, quoted: 100 }], terms: [{ term: 'Payment', status: 'Standard' }], subject: 'Original' }
  const approval = { approvalSnapshot: proposalApprovalSnapshot(original, { sellTo: 'ACME', route: 'Project' }) }
  assert.equal(approvalAffectedByProposal(approval, 'Commercial approval', { ...original, subject: 'Corrected subject' }, { sellTo: 'ACME', route: 'Project' }), false)
})

test('snapshot-backed approvals reopen only the affected decision domain', () => {
  const original = { units: 1, sourceCurrency: 'INR', bom: [{ desc: 'Probe', pn: 'PRB-1', qtyPerUnit: 1, common: 0, spares: 0, quoted: 100 }], terms: [{ term: 'Payment', status: 'Standard' }] }
  const approval = { approvalSnapshot: proposalApprovalSnapshot(original, { sellTo: 'ACME', route: 'Project' }) }
  const changed = { ...original, bom: [{ ...original.bom[0], quoted: 125 }] }
  assert.equal(approvalAffectedByProposal(approval, 'Technical approval', changed, { sellTo: 'ACME', route: 'Project' }), false)
  assert.equal(approvalAffectedByProposal(approval, 'Commercial approval', changed, { sellTo: 'ACME', route: 'Project' }), true)
  assert.equal(approvalAffectedByProposal(approval, 'Final quote release', changed, { sellTo: 'ACME', route: 'Project' }), true)
})

test('customer changes affect every approval domain', () => {
  const proposal = { units: 1, sourceCurrency: 'INR', bom: [{ desc: 'Probe', pn: 'PRB-1', qtyPerUnit: 1, common: 0, spares: 0, quoted: 100 }] }
  const approval = { approvalSnapshot: proposalApprovalSnapshot(proposal, { sellTo: 'ACME', route: 'Project' }) }
  const changedCustomer = { sellTo: 'OTHER', route: 'Project' }
  assert.equal(approvalAffectedByProposal(approval, 'Technical approval', proposal, changedCustomer), true)
  assert.equal(approvalAffectedByProposal(approval, 'Commercial approval', proposal, changedCustomer), true)
  assert.equal(approvalAffectedByProposal(approval, 'Final quote release', proposal, changedCustomer), true)
})

test('legacy release approvals ignore the old automatic header-sync mismatch', () => {
  const opportunity = {
    sellTo: 'ACME',
    contactPerson: 'A. Buyer',
    oppName: 'Turbine package',
    route: 'Spares',
  }
  const approvedBeforeSync = {
    units: 1,
    sourceCurrency: 'INR',
    addressee: 'M/s. ACME',
    kindAttn: 'A. Buyer',
    subject: '',
    bom: [],
  }
  const approval = { approvalSnapshot: proposalApprovalSnapshot(approvedBeforeSync, opportunity) }
  const current = { ...approvedBeforeSync, subject: 'Proposal For Turbine package' }

  assert.equal(approvalAffectedByProposal(approval, 'Final quote release', current, opportunity), false)
})

test('an approval snapshot must include the generated proposal before first save', () => {
  const opportunity = { sellTo: 'ACME', contactPerson: 'A. Buyer', oppName: 'Turbine package', route: 'Spares' }
  const generated = { addressee: 'M/s. ACME', kindAttn: 'A. Buyer', subject: 'Proposal For Turbine package', proposalType: 'Spares', sourceCurrency: 'INR', bom: [], terms: [] }
  const approval = { approvalSnapshot: proposalApprovalSnapshot(generated, opportunity) }
  assert.equal(approvalAffectedByProposal(approval, 'Final quote release', generated, opportunity), false)
})
