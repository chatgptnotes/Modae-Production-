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
import { oppBlockers, transitionBlockers, NO_EXCEPTION } from '../src/gates.js'
import { seedJointApprovals, seedAiLeads, seedCustomers } from '../src/seed.js'
import { migrate, seedState } from '../src/appState.js'

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

test('Register no longer stacks an unclearable duplicate blocker', () => {
  const source = read('src/pages/Register.jsx')
  assert.match(source, /leadVerificationBlockers\(lead, leadCustomerStatus, \{ redCleared \}\)/)
  assert.equal(/blockers\.push\('Red continuation approval/.test(source), false,
    'the duplicate push must be gone — leadVerificationBlockers owns this now')
  assert.match(source, /verificationSnapshot\(lead, leadCustomerStatus, \{ approval: redApproval \}\)/)
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
  assert.match(source, /if \(needed\.length && !needed\.includes\(s\.role\)\) return s/)
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
