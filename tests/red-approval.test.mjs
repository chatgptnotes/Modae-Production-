import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  RED_BLOCKER,
  isRedCleared,
  leadVerificationBlockers,
  leadVerificationComplete,
  redClearanceFor,
  verificationSnapshot,
} from '../src/leadVerification.js'
import { oppBlockers, transitionBlockers, NO_EXCEPTION, approvalForRev, APPROVAL_5B } from '../src/gates.js'
import { seedJointApprovals, seedAiLeads, seedCustomers } from '../src/seed.js'
import { migrate, seedState, mergeApprovalRows } from '../src/appState.js'
import { customerStatusForLead } from '../src/leadCustomerClass.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

// 20 Aug review: "Fix red-customer approval flow bug." An approved Red lead
// could never be registered. leadVerificationBlockers returned the Red blocker
// unconditionally — it read no approvals, so nothing could ever clear it — and
// Register.jsx pushed a second copy of the same blocker on top of the check
// that *was* approval-aware. The opportunity ID stayed withheld however many
// approvers said yes.

const lead = { id: 'LD-206', customerStatus: 'Red', redFlag: true, status: 'Qualified' }
const clearance = (patch = {}) => ({
  id: 'AP-1', leadId: 'LD-206', type: 'Red customer clearance',
  needed: ['LJS', 'AH'], decisions: {}, conditions: [], status: 'Pending',
  ts: '2026-08-11T05:35:00Z', decisionTs: '', ...patch,
})

test('a Red lead is blocked until the joint clearance is granted', () => {
  assert.deepEqual(leadVerificationBlockers(lead, 'Red'), [RED_BLOCKER])
  assert.equal(leadVerificationComplete(lead, 'Red'), false)
  assert.deepEqual(leadVerificationBlockers(lead, 'Red', { redCleared: false }), [RED_BLOCKER])

  // The whole point of the fix: granted means cleared.
  assert.deepEqual(leadVerificationBlockers(lead, 'Red', { redCleared: true }), [])
  assert.equal(leadVerificationComplete(lead, 'Red', { redCleared: true }), true)
})

test('only a granted decision clears the gate', () => {
  for (const status of ['Pending', 'Returned', 'Rejected']) {
    assert.equal(isRedCleared(clearance({ status })), false, `${status} must not clear`)
  }
  for (const status of ['Approved', 'Approved with conditions']) {
    assert.equal(isRedCleared(clearance({ status })), true, `${status} must clear`)
  }
  assert.equal(isRedCleared(null), false)
})

test('one of the two approvers is not enough', () => {
  // recordDecision resolves the overall status, so the model-level check here
  // is that a half-decided gate is still Pending, and Pending does not clear.
  const half = clearance({ decisions: { LJS: { d: 'Approved', when: 'x' } }, status: 'Pending' })
  assert.equal(isRedCleared(half), false)
  assert.deepEqual(leadVerificationBlockers(lead, 'Red', { redCleared: isRedCleared(half) }), [RED_BLOCKER])

  const both = clearance({
    decisions: { LJS: { d: 'Approved', when: 'x' }, AH: { d: 'Approved', when: 'y' } },
    status: 'Approved', decisionTs: '2026-08-12T09:00:00Z',
  })
  assert.deepEqual(leadVerificationBlockers(lead, 'Red', { redCleared: isRedCleared(both) }), [])
})

test('a re-requested clearance supersedes the returned one', () => {
  const returned = clearance({ id: 'AP-1', status: 'Returned', ts: '2026-08-11T05:35:00Z' })
  const reraised = clearance({ id: 'AP-9', status: 'Pending', ts: '2026-08-13T08:00:00Z' })

  // Newest wins regardless of array order...
  assert.equal(redClearanceFor([returned, reraised], 'LD-206').id, 'AP-9')
  assert.equal(redClearanceFor([reraised, returned], 'LD-206').id, 'AP-9')

  // ...but a granted decision always beats a newer request.
  const granted = clearance({ id: 'AP-1', status: 'Approved', ts: '2026-08-11T05:35:00Z' })
  assert.equal(redClearanceFor([granted, reraised], 'LD-206').id, 'AP-1')

  assert.equal(redClearanceFor([], 'LD-206'), null)
  assert.equal(redClearanceFor([returned], 'LD-999'), null)
})

test('the opportunity keeps the clearance on its record', () => {
  // It used to record { status: 'Not required', type: 'None' } — a Red
  // opportunity carried no trace of the decision that authorised it.
  const approval = clearance({
    status: 'Approved with conditions',
    decisions: { LJS: { d: 'Approved', when: 'x' }, AH: { d: 'Approved', when: 'y' } },
    conditions: [{ text: '100% prepayment', incorporated: false }],
    decisionTs: '2026-08-12T09:00:00Z',
  })
  const snap = verificationSnapshot(lead, 'Red', { approval })
  assert.equal(snap.status, 'Cleared')
  assert.equal(snap.type, 'Red continuation')
  assert.equal(snap.approvalId, 'AP-1')
  assert.deepEqual(snap.decidedBy, ['LJS', 'AH'])
  assert.deepEqual(snap.conditions, ['100% prepayment'])
  assert.equal(snap.verifiedAt, '2026-08-12T09:00:00Z')

  assert.equal(verificationSnapshot(lead, 'Red').status, 'Not cleared')
  // Green is untouched by the Red branch.
  assert.equal(verificationSnapshot({ customerStatus: 'Green' }, 'Green').status, 'Not required')
})

test('the workbench blocker demands both approvers, not just LJS', () => {
  // gates.oppBlockers used to emit approver:'LJS' with no `needed`, so a Red
  // clearance raised off the readiness panel cleared on LJS alone — while the
  // inbox and transitionBlockers both demanded LJS + AH.
  const opp = { id: 'O-1', customerStatus: 'Red' }
  const red = oppBlockers(opp, null, []).find(b => b.key === 'red')
  assert.ok(red, 'a Red opportunity must raise the clearance blocker')
  assert.equal(red.approvalType, 'Red customer clearance')
  assert.deepEqual(red.needed, ['LJS', 'AH'])

  const cleared = oppBlockers(opp, null, [{
    oppId: 'O-1', type: 'Red customer clearance', status: 'Approved',
  }])
  assert.equal(cleared.some(b => b.key === 'red' || b.key === 'red-wait'), false)
})

test('the seeded demo path is the one the client reproduced', () => {
  assert.ok(seedAiLeads.find(l => l.id === 'LD-206'), 'LD-206 must still exist')
  const ap1 = seedJointApprovals.find(a => a.leadId === 'LD-206')
  assert.deepEqual(ap1.needed, ['LJS', 'AH'])
  assert.equal(ap1.status, 'Pending')
  // CAPSA is Red in the master, which is what drives the lead's class.
  assert.ok(seedCustomers.some(c => c.status === 'Red'))
})

test('an exact Customer Master match overrides a stale inferred Blue lead class', () => {
  const customers = [{ name: 'Vedanta (Lanjigarh)', status: 'Red' }]
  const lead = {
    sellTo: 'Vedanta (Lanjigarh)',
    customerStatus: 'Blue',
    ai: { fields: [{ k: 'Sell-to customer', v: 'Vedanta (Lanjigarh)' }] },
  }
  assert.equal(customerStatusForLead(lead, customers), 'Red')
  assert.equal(customerStatusForLead({ ...lead, customerStatusOverride: 'Blue' }, customers), 'Red')
  assert.equal(customerStatusForLead({ ...lead, sellTo: 'Vedanta', customerStatusOverride: 'Blue' }, customers), 'Red')
})

test('a Customer Master Red status governs future leads without rewriting opportunity snapshots', () => {
  const customers = [{ name: 'Eastern Alloy Works', status: 'Red' }]
  const futureLead = {
    sellTo: 'Eastern Alloy Works',
    customerStatus: 'Blue',
    redFlag: false,
  }
  const existingOpportunity = {
    sellTo: 'Eastern Alloy Works',
    customerStatus: 'Blue',
  }

  assert.equal(customerStatusForLead(futureLead, customers), 'Red')
  assert.equal(existingOpportunity.customerStatus, 'Blue')
})

test('Register no longer stacks an unclearable duplicate blocker', () => {
  const source = read('src/pages/Register.jsx')
  assert.match(source, /leadVerificationBlockers\(lead, leadCustomerStatus, \{ redCleared[^}]*\}\)/)
  assert.equal(/blockers\.push\('Red continuation approval/.test(source), false,
    'the duplicate push must be gone — leadVerificationBlockers owns this now')
  assert.match(source, /verificationSnapshot\(lead, leadCustomerStatus, \{ approval: redApproval[^}]*\}\)/)
  // And the class chain is the shared one, not an inline copy that drops redFlag.
  assert.match(source, /customerStatusForLead\(lead, store\.customers\)/)
  assert.equal(/lead\.customerStatus \|\| customer\?\.status \|\| 'Blue'/.test(source), false)
})

test('a Returned clearance can be raised again from the inbox', () => {
  const source = read('src/pages/Inbox.jsx')
  assert.match(source, /const redRequestable = !redApproval \|\| redApproval\.status === 'Returned'/)
  assert.match(source, /Re-request joint approval/)
  assert.match(source, /customerStatusForLead\(lead, store\.customers\)/)
  assert.equal(/lead\.customerStatus \|\| customer\?\.status \|\| 'Blue'/.test(source), false)
})

test('only a needed role can decide, and a converted lead never regresses', () => {
  const source = read('src/store.jsx')
  assert.match(source, /if \(needed\.length && !needed\.includes\(s\.role\)\) \{\s*\n\s*console\.warn\(`Decision ignored/)
  assert.match(source, /lead\?\.status === 'Converted' \? null : \{ status: 'Qualified' \}/)
})

// Found by a red-team pass over the delivered fix. Adding `needed` to the
// blocker closed one bypass and left three others open: two consumers that
// never read it, and a migration that overwrote it.

test('a gate raised from the proposal page keeps both approvers', () => {
  // requestApproval there built the request from `approver` alone, so
  // recordDecision fell back to ['LJS'] and one person cleared a joint gate.
  const source = read('src/pages/Proposal.jsx')
  assert.match(source, /\.\.\.\(bl\.needed \? \{ needed: bl\.needed \} : \{\}\)/)
  assert.match(source, /\.\.\.\(bl\.anyOf \? \{ anyOf: bl\.anyOf \} : \{\}\)/)
})

test('the Red gate is requested, never excepted', () => {
  // Workbench decides between "request the approval" and "request a milestone
  // exception" on the presence of approvalType. Without it the Red row offered
  // an exception, which waived the gate with no clearance record at all.
  // Registration sits at index 3 and Screening at 4, so the step under test is
  // Qualification -> Registration; transitionBlockers returns [] for any move
  // that is not forward.
  const opp = {
    id: 'O-1', customerStatus: 'Red', milestone: 'Qualification',
    sellTo: 'CAPSA', oppName: 'VMS spares', owner: 'RS', route: 'Spares',
  }
  const state = { approvals: [], kyc: {}, clarifications: [], opportunities: [opp] }
  const red = transitionBlockers(opp, 'Registration', null, state).find(b => b.key === 'red-clearance')
  assert.ok(red, 'stepping a Red opportunity to Registration must block')
  assert.equal(red.approvalType, 'Red customer clearance', 'requestable, not exception-eligible')
  assert.deepEqual(red.needed, ['LJS', 'AH'])

  // Belt and braces at the model layer: an approved exception cannot strip it.
  assert.ok(NO_EXCEPTION.includes('red-clearance'))
  // And the UI predicate agrees — canRequestException excludes anything typed.
  assert.match(read('src/pages/Workbench.jsx'), /const canRequestException = blocker => !blocker\.approvalType/)
})

test('migrate repairs a persisted single-approver Red clearance', () => {
  // The old blanket backfill wrote needed:['LJS'] and ran on every boot, so a
  // gate saved before the fix stayed single-approver forever.
  // migrate() walks the whole state, so start from a real one and swap in the
  // two approvals under test.
  const migrated = migrate({
    ...seedState(),
    approvals: [
      { id: 'AP-1', leadId: 'LD-206', type: 'Red customer clearance', approver: 'LJS', status: 'Pending' },
      { id: 'AP-2', oppId: 'O-1', type: 'Commercial deviation', approver: 'AH', status: 'Pending' },
    ],
  })
  const red = migrated.approvals.find(a => a.id === 'AP-1')
  assert.deepEqual(red.needed, ['LJS', 'AH'], 'repaired, not blessed')
  // Other approval types keep the original single-approver backfill.
  assert.deepEqual(migrated.approvals.find(a => a.id === 'AP-2').needed, ['AH'])
})

test('migrate keeps a half-approved final quote release pending', () => {
  const migrated = migrate({
    ...seedState(),
    approvals: [{
      id: 'AP-117', oppId: 'O-1', type: 'Final quote release', approver: 'AH',
      needed: ['AH', 'LJS'], anyOf: true, status: 'Approved',
      decisions: { AH: { d: 'Approved', c: 'done', when: '2026-08-31T08:00:00Z' } },
      conditions: [], decisionTs: '2026-08-31T08:00:00Z', decisionNote: 'done',
    }],
  })
  const release = migrated.approvals[0]
  assert.equal(release.status, 'Pending')
  assert.deepEqual(release.needed, ['LJS', 'AH'])
  assert.equal(release.anyOf, false)
  assert.ok(release.decisions.AH)
  assert.equal(release.decisions.LJS, undefined)
})


// Regression: requestApproval used to dedupe against same-key approvals in ANY
// of Pending/Approved/Approved-with-conditions. A stale Approved record (the
// quote changed since it was granted) therefore swallowed the "Request…"
// button click in the transition dialog — the gate still showed the blocker
// but no new request could ever be created, and the move looked permanently
// stuck. Only a Pending request may suppress a duplicate.
test('requestApproval only dedupes against a Pending request, never a stale Approved one', () => {
  const source = read('src/store.jsx')
  const dedupe = source.match(/const alreadyRemembered = s\.approvals\.find\(([\s\S]*?)\)\n        if \(alreadyRemembered\)/)
  assert.ok(dedupe, 'requestApproval dedupe block not found in store.jsx')
  assert.match(dedupe[1], /existing\.status === 'Pending'/,
    'dedupe must only match Pending requests')
  assert.doesNotMatch(dedupe[1], /'Approved with conditions'\]\.includes/,
    'dedupe must not treat Approved records as suppressing a re-request')
})

// --- §5B / §5C approved-then-voided regression ------------------------------
// The transition dialog's §5B request used to stamp deviationDetails: [],
// so commercialApprovalCoversProposal voided the Approved row whenever the
// quote had any deviation term — the Approvals page showed Approved while
// the gate re-raised the blocker and the dialog re-asked forever.
const coverOpp = { id: 'O-9', route: 'Project', milestone: 'Proposal', customerStatus: 'Blue', owner: 'RS' }
const coverProposal = deviation => ({
  revision: '01',
  terms: [{
    term: 'Payment terms', status: 'Deviation', decision: deviation,
    customerAsk: '60 days credit', standardTerm: '30 days from invoice',
  }],
})
const section5B = (patch = {}) => ({
  id: 'AP-5B', oppId: 'O-9', type: APPROVAL_5B, approver: 'AH', needed: ['AH'],
  status: 'Approved', rev: '01',
  decisions: { AH: { d: 'Approved', c: '', when: '2026-09-19T06:00:00Z' } },
  deviationDetails: [{ term: 'Payment terms', customerAsk: '60 days credit', ourResponse: '30 days from invoice', standardTerm: '30 days from invoice' }],
  ...patch,
})

test('an approved §5B with deviation details covers the quote it signed off', () => {
  const { approved } = approvalForRev(APPROVAL_5B, coverProposal('Match customer terms'), [section5B()], 'O-9', coverOpp)
  assert.ok(approved, 'AH sign-off must cover the recorded deviations')
})

test('an approved §5B without deviation details does not cover a deviating quote', () => {
  const { approved } = approvalForRev(APPROVAL_5B, coverProposal('Match customer terms'), [section5B({ deviationDetails: [] })], 'O-9', coverOpp)
  assert.equal(approved, null, 'a sign-off that recorded no deviations cannot cover one')
})

test('a Counter-offer term still needs recorded §5B coverage', () => {
  // §5B signs off the whole commercial position: a term that keeps status
  // 'Deviation' — even after a counter-offer — must appear in the recorded
  // deviationDetails for the approval to cover it.
  const { approved } = approvalForRev(APPROVAL_5B, coverProposal('Counter-offer'), [section5B({ deviationDetails: [] })], 'O-9', coverOpp)
  assert.equal(approved, null, '§5B covers the whole commercial position — any Deviation-status term needs recorded coverage')
})

test('the transition dialog stamps deviation details on §5B requests', () => {
  const source = read('src/pages/Workbench.jsx')
  assert.match(source, /blocker\.key === 'comm-approval'/,
    'approvalContextFor must record deviation details for the comm-approval blocker')
})

test('a System Owner decision on an AH-only gate is discarded loudly, not silently', () => {
  const source = read('src/store.jsx')
  const guard = source.match(/if \(needed\.length && !needed\.includes\(s\.role\)\) \{\s*\n\s*console\.warn/)
  assert.ok(guard, 'recordDecision must warn when the persona is not a required approver')
})

test('migrate backfills deviation details on pre-stamp approved §5B rows', () => {
  const migrated = migrate({
    ...seedState(),
    proposals: {
      'O-9': {
        revision: '01',
        terms: [{ term: 'Payment terms', status: 'Deviation', decision: 'Match customer terms', customerAsk: '60 days credit' }],
      },
    },
    approvals: [{
      id: 'AP-OLD', oppId: 'O-9', type: 'Commercial approval', approver: 'AH',
      status: 'Approved', rev: '01', decisionTs: '2026-09-19T06:00:00Z',
    }],
  })
  const row = migrated.approvals.find(a => a.id === 'AP-OLD')
  assert.equal(row.status, 'Approved', 'a decided row stays decided')
  assert.equal(row.deviationDetails.length, 1, 'details backfilled from the named revision')
  assert.equal(row.deviationDetails[0].term, 'Payment terms')
  // A revision mismatch means the row was granted for a different quote —
  // no backfill, the gate rightly keeps voiding it.
  const mismatched = migrate({
    ...seedState(),
    proposals: { 'O-9': { revision: '02', terms: [] } },
    approvals: [{
      id: 'AP-OLD2', oppId: 'O-9', type: 'Commercial approval', approver: 'AH',
      status: 'Approved', rev: '01', decisionTs: '2026-09-19T06:00:00Z',
    }],
  })
  assert.equal(mismatched.approvals.find(a => a.id === 'AP-OLD2').deviationDetails, undefined,
    'no backfill when the approval names a different revision')
})

test('re-requesting a gate supersedes the stale same-key approval row', () => {
  const source = read('src/store.jsx')
  assert.match(source, /supersededBy: id/,
    'requestApproval must mark superseded Approved rows Cancelled so the Approvals list cannot mislead')
})

// A stale server snapshot (failed save, second tab, slow device) used to
// overwrite newer local approvals on the focus refetch — re-locking an
// already-approved release gate minutes later. __sv stamps make the merge
// per-row and monotonic.
test('sync merge keeps a newer local approval over a stale server row', () => {
  const local = [{
    id: 'AP-9', oppId: 'O-9', type: 'Final quote release', status: 'Approved',
    needed: ['LJS', 'AH'], decisions: { LJS: { d: 'Approved' }, AH: { d: 'Approved' } },
    __sv: '2026-09-19T10:00:00Z',
  }]
  const staleServer = [{
    id: 'AP-9', oppId: 'O-9', type: 'Final quote release', status: 'Pending',
    needed: ['LJS', 'AH'], decisions: {}, __sv: '2026-09-19T09:00:00Z',
  }]
  const merged = mergeApprovalRows(local, staleServer)
  assert.equal(merged.length, 1)
  assert.equal(merged[0].status, 'Approved', 'a newer local decision must not be downgraded')
})

test('sync merge takes a server row that is newer or unknown locally', () => {
  const local = [{ id: 'AP-1', status: 'Pending', __sv: '2026-09-19T08:00:00Z' }]
  const server = [
    { id: 'AP-1', status: 'Approved', __sv: '2026-09-19T09:00:00Z' },
    { id: 'AP-2', status: 'Pending' },
  ]
  const merged = mergeApprovalRows(local, server)
  assert.equal(merged.length, 2, 'server-only rows are adopted')
  assert.equal(merged.find(a => a.id === 'AP-1').status, 'Approved', 'newer server row wins')
})

test('sync merge never drops a local-only approval the server has not seen', () => {
  const local = [{ id: 'AP-LOCAL', oppId: 'O-9', type: 'Final quote release', status: 'Pending', __sv: '2026-09-19T10:00:00Z' }]
  const merged = mergeApprovalRows(local, [])
  assert.equal(merged.length, 1, 'a request created before its save landed survives the refetch')
})
