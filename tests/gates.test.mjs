import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ROLES } from '../src/seed.js'
import { canViewCommercial, canPriceProposal, isSalesOwner } from '../src/utils.js'
import { transitionBlockers, releaseState } from '../src/gates.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const SALES_ROLES = Object.entries(ROLES).filter(([, role]) => role.sales).map(([id]) => id)
const APPROVER_ROLES = ['LJS', 'AH']

// 13 Aug client review: "the salesperson himself is making their proposal, so he
// is the one who should see it… he can only request approval." A sales owner must
// be able to price the proposal they write; only sending stays approval-gated.
test('sales owners can price a proposal', () => {
  for (const role of SALES_ROLES) {
    assert.equal(isSalesOwner(role), true, `${role} must be flagged as a sales owner`)
    assert.equal(canPriceProposal(role), true, `${role} must be able to price a proposal`)
  }
})

test('approvers and admins keep proposal pricing access', () => {
  for (const role of [...APPROVER_ROLES, 'ADMIN', 'SUPER']) {
    assert.equal(canPriceProposal(role), true, `${role} must be able to price a proposal`)
  }
})

test('technical reviewer and customer stay out of proposal pricing', () => {
  for (const role of ['TECH', 'CUST']) {
    assert.equal(canPriceProposal(role), false, `${role} must not see proposal pricing`)
  }
})

// The narrow gate must not become a second name for the org-wide one: sales
// owners price their own proposals but still do not see cross-pipeline cost and
// margin (COGS/GM roll-ups, price lists, the commercial dashboard).
test('pricing access does not grant org-wide commercial reporting', () => {
  for (const role of SALES_ROLES) {
    assert.equal(canViewCommercial(role), false, `${role} must not see org-wide commercial data`)
  }
  assert.notEqual(
    ROLES.RS.commercial, true,
    'sales owners must stay commercial:false — canPriceProposal is the proposal-only gate')
})

// The salesperson's printed proposal must carry prices. Before this change
// `priced` was gated on canViewCommercial, so a sales owner printed a document
// with every price stripped.
test('proposal pricing surfaces use the proposal gate, not the reporting gate', () => {
  const proposal = read('src/pages/Proposal.jsx')
  assert.match(proposal, /const comm = canPriceProposal\(store\.role\)/)
  assert.doesNotMatch(proposal, /canViewCommercial/,
    'Proposal.jsx must not fall back to the org-wide commercial gate')

  for (const file of [
    'src/workbench/WbSpares.jsx', 'src/workbench/WbService.jsx',
    'src/workbench/WbProject.jsx', 'src/workbench/PropBuilder.jsx',
  ]) {
    assert.match(read(file), /canPriceProposal/, `${file} must use the proposal gate`)
    assert.doesNotMatch(read(file), /canViewCommercial/, `${file} must not use the reporting gate`)
  }
})

// Biji, on the salesperson's tracker columns: "I need value, value and expected
// order date". Value follows the proposal gate; COGS/GM stay commercial.
test('tracker shows value to sales owners while opportunity surfaces expose proposal cost and margin', () => {
  const tracker = read('src/pages/Tracker.jsx')
  assert.match(tracker, /const showValue = canPriceProposal\(store\.role\)/)
  assert.match(tracker, /const comm = canViewCommercial\(store\.role\)/)
  assert.match(tracker, /\{showValue \? \(/, 'the value cell must be gated on showValue')
})

// --- Workflow conformance defects (18 Aug review) -------------------------
// Diagram 02 §8: PO received → handover. store.acceptPO records a signature
// under the approving role (LJS / AH), but the gate used to read
// acceptance.sales / acceptance.customer — keys nothing ever writes — so the
// Handover milestone could not be reached through the UI at all.
const baseOpp = {
  id: 'OP-1', milestone: 'PO Validation', sellTo: 'ACME', oppName: 'Retrofit',
  owner: 'RS', route: 'Project', contactPerson: 'K. Rao', contactPhone: '+91 86 6224 7710',
  customerStatus: 'Green',
}
const releasedProposal = {
  revision: '01', terms: [{ term: 'Payment' }],
  bom: [{ qty: 1, listPrice: 1000, currency: 'EUR' }],
}
const poState = acceptance => ({
  approvals: [{ id: 'AP-1', oppId: 'OP-1', type: 'Final quote release', rev: '01', status: 'Approved' }],
  poCompare: { 'OP-1': { received: true, acceptance } },
  kyc: {}, clarifications: [], sparesLines: [],
})
const handoverBlocked = state => transitionBlockers(baseOpp, 'Handover', releasedProposal, state)
  .some(b => b.key === 'po-acceptance')

test('handover is gated on the LJS and AH signatures acceptPO actually writes', () => {
  assert.equal(handoverBlocked(poState({})), true, 'no signature must block handover')
  assert.equal(handoverBlocked(poState({ LJS: '2026-08-18T00:00:00Z' })), true,
    'one signature must still block handover')
  assert.equal(handoverBlocked(poState({ LJS: '2026-08-18T00:00:00Z', AH: '2026-08-18T00:00:00Z' })), false,
    'joint LJS + AH acceptance must clear the handover gate')
})

test('an approved milestone exception still clears the handover gate', () => {
  const state = poState({})
  state.approvals = [...state.approvals, {
    id: 'AP-2', oppId: 'OP-1', type: 'Milestone exception',
    targetMilestone: 'Handover', blockerKey: 'po-acceptance', status: 'Approved',
  }]
  assert.equal(handoverBlocked(state), false)
})

// Diagram 02 §7: "Re-Approval Required — repeat the Section 5 approval
// process" on every revision. A release approval therefore covers only the
// revision it was raised against.
test('a release approval covers only the revision it approved', () => {
  const approvals = [{ id: 'AP-1', oppId: 'OP-1', type: 'Final quote release', rev: '01', status: 'Approved' }]
  assert.ok(releaseState({ revision: '01' }, approvals, 'OP-1').release,
    'the approved revision is released')
  assert.equal(releaseState({ revision: '02' }, approvals, 'OP-1').release, null,
    'a revised quote must not inherit the previous revision\'s approval')
  assert.equal(releaseState({ revision: '01' }, approvals, 'OP-2').release, null,
    'approvals never cross opportunities')
  assert.ok(releaseState({ revision: '03' }, [{ ...approvals[0], rev: undefined }], 'OP-1').release,
    'approvals recorded before `rev` existed stay valid')
})

test('revising a released quote re-blocks the Submitted milestone', () => {
  const state = poState({})
  const submitted = proposal => transitionBlockers(
    { ...baseOpp, milestone: 'Approval' }, 'Submitted', proposal, state)
    .find(b => b.key === 'release')
  assert.equal(submitted(releasedProposal), undefined, 'the approved revision may be submitted')
  const revised = { ...releasedProposal, revision: '02' }
  assert.equal(submitted(revised)?.severity, 'block', 'a revision must require a fresh approval')
})
