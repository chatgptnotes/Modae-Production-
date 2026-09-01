import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ROLES, PERMS, PORTAL_ENABLED, selectableRoles } from '../src/seed.js'
import { canViewCommercial, canPriceProposal, isSalesOwner } from '../src/utils.js'
import { transitionBlockers, releaseState, readiness, commercialGate } from '../src/gates.js'
import { contextForType, routeForType, CONTEXTS, OPP_TYPES } from '../src/seed.js'

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

// The tracker is the shared operational sheet: every role that can open it can
// see and maintain Value/COGS, while GM and GM% are derived in the sheet.
test('tracker commercial columns are independent of reporting and proposal gates', () => {
  const tracker = read('src/pages/Tracker.jsx')
  assert.doesNotMatch(tracker, /canViewCommercial/)
  assert.doesNotMatch(tracker, /canPriceProposal/)
  assert.doesNotMatch(tracker, /className="num locked"/)
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

test('final quote release requires both AH and LJS', () => {
  const state = poState({})
  state.approvals = [
    { id: 'AP-1', oppId: 'OP-1', type: 'Technical approval', rev: '01', status: 'Approved' },
    { id: 'AP-2', oppId: 'OP-1', type: 'Commercial approval', rev: '01', status: 'Approved' },
  ]
  const blockers = transitionBlockers(
    { ...baseOpp, milestone: 'Approval' }, 'Submitted', releasedProposal, state,
  )
  const release = blockers.find(b => b.key === 'release')
  assert.ok(release, 'the final quote release gate must be present')
  assert.deepEqual(release.needed, ['LJS', 'AH'])
  assert.equal(release.anyOf, false)
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

// ---------------------------------------------------------------------------
// Diagram 02 §3/§4 — which lane an opportunity runs in.
// ---------------------------------------------------------------------------

// §3 is headed "Retrofit / Spares - Main Flow" and §4 gives Service its own
// world (site survey -> SoW -> service pricing). Service used to fall through
// to Brownfield, which forced it through B-01..B-05 sign-off it never owed.
test('Service runs its own lane, not the Brownfield B-step chain', () => {
  assert.equal(contextForType('Service'), 'Service')
  assert.equal(contextForType('Retrofit'), 'Brownfield')
  assert.equal(contextForType('Spares'), 'Brownfield')
  assert.equal(contextForType('Project'), 'Greenfield')
  assert.equal(contextForType('Upgrade'), 'Greenfield')
  for (const c of new Set(OPP_TYPES.map(contextForType))) {
    assert.ok(CONTEXTS.includes(c), `${c} must be a declared context`)
  }
})

const bStepBlocker = oppType => readiness(
  { ...baseOpp, oppType, route: routeForType(oppType), context: contextForType(oppType) },
  { bom: [{ listPrice: 100, quoted: '' }], terms: [] },
  { approvals: [], bSteps: {} },
).find(b => b.key === 'b-steps')

test('a Service proposal is ready without B-step signatures', () => {
  assert.equal(bStepBlocker('Service'), undefined,
    'Service is gated by the §4 survey path, never by B-01..B-05')
  assert.equal(bStepBlocker('Spares')?.severity, 'block', 'Spares still owes the B-steps')
  assert.equal(bStepBlocker('Retrofit')?.severity, 'block', 'Retrofit still owes the B-steps')
})

test('Retrofit shares the Brownfield workbench with Spares', () => {
  assert.equal(routeForType('Retrofit'), 'Spares')
  assert.equal(routeForType('Spares'), 'Spares')
  assert.equal(routeForType('Service'), 'Service')
  assert.equal(routeForType('Project'), 'Project')
})

// ---------------------------------------------------------------------------
// Diagram 02 §5 — the layered approval.
// ---------------------------------------------------------------------------

const quote = (value, gmPct) => {
  // One BoQ line priced to hit the requested value and margin exactly.
  const cogs = value * (1 - gmPct / 100)
  return { bom: [{ qtyPerUnit: 1, listPrice: 0, quoted: value, currency: 'INR' }], units: 1, cogs }
}

test('the §5C margin matrix routes on order value and margin', () => {
  const gate = (value, gmPct) => commercialGate(
    { owner: 'RS' },
    { bom: [{ qtyPerUnit: 1, quoted: value, currency: 'INR' }], units: 1,
      costing: { baseRate: 1, usdBase: 1, cdErvContPct: 0, bnkDiscPct: 0, inputGMPct: gmPct } },
    {},
  )
  // < 10 Lakh & > 50% — the assigned salesperson clears their own quote.
  const small = gate(500000, 60)
  assert.equal(small.value < small.valueBreak, true)
  // >= 10 Lakh — both approvers, never one.
  const big = gate(2000000, 60)
  assert.deepEqual(big.needed, ['AH', 'LJS'])
  assert.ok(!big.anyOf, 'above ₹10 Lakh both AH and LJS must decide')
})

// §5A technical remains "LJS OR AN". recordDecision must continue honoring
// that anyOf gate while final quote release uses a joint AH + LJS decision.
test('an either-or approval clears on one decision', () => {
  const store = read('src/store.jsx')
  assert.match(store, /appr\.anyOf \? needed\.some\(r => decisions\[r\]\) : needed\.every\(r => decisions\[r\]\)/,
    'recordDecision must honour anyOf')
  const builder = read('src/workbench/PropBuilder.jsx')
  assert.match(builder, /needed: \['LJS', 'AH'\], anyOf: false/, 'the §5C release must be joint')
  assert.match(builder, /anyOf: !!bl\.anyOf/, 'a blocker-raised approval must carry its anyOf flag')
})

// The diagram and its legend both read "Technical Approval — LJS OR AN". AN
// existed as a role but was never named on the gate, so only LJS could clear it.
test('AN can give the §5A technical approval', () => {
  const blocker = transitionBlockers(
    { ...baseOpp, milestone: 'Approval' }, 'Submitted', releasedProposal, poState({}),
  ).find(b => b.key === 'tech-approval')
  assert.ok(blocker, 'technical approval must gate the Submitted milestone')
  assert.deepEqual(blocker.needed, ['LJS', 'AN'])
  assert.equal(blocker.anyOf, true, 'either technical approver alone clears §5A')
  assert.ok(ROLES.AN, 'the AN role must exist for the gate to be satisfiable')
})

// The remaining two corners of the §5C matrix. The <= 50% rows are the ones the
// diagram routes away from the salesperson, so leaving them unasserted meant the
// self-approval tier could widen without a test noticing.
test('the §5C matrix routes both margin rows, not just the healthy one', () => {
  // An INR line lands at cost, so quoting `value` against a list price of
  // `value × (1 - GM)` produces exactly the margin asked for. Passing the GM
  // through `costing.inputGMPct` would not: a priced line ignores it.
  const gate = (value, gmPct) => commercialGate(
    { owner: 'RS' },
    { units: 1, bom: [{ qtyPerUnit: 1, quoted: value, listPrice: value * (1 - gmPct / 100), currency: 'INR' }] },
    {},
  )
  assert.equal(Math.round(gate(500000, 40).gmPct), 40, 'the fixture must produce the margin it names')
  // < 10 Lakh & > 50% — "Assigned Salesperson".
  const smallHealthy = gate(500000, 60)
  assert.deepEqual(smallHealthy.needed, ['RS'])
  assert.equal(smallHealthy.selfApprove, true, 'a small, healthy quote is self-approved')

  // < 10 Lakh & <= 50% — "AH OR LJS".
  const smallThin = gate(500000, 40)
  assert.deepEqual(smallThin.needed, ['AH', 'LJS'])
  assert.equal(smallThin.anyOf, true, 'below ₹10 Lakh on a thin margin, either approver decides')
  assert.ok(!smallThin.selfApprove, 'a thin margin never self-approves')

  // >= 10 Lakh & > 50% — "AH + LJS (Both)".
  const bigHealthy = gate(1500000, 60)
  assert.deepEqual(bigHealthy.needed, ['AH', 'LJS'])
  assert.ok(!bigHealthy.anyOf, 'above ₹10 Lakh both must decide')

  // >= 10 Lakh & <= 50% — "AH + LJS (Both)".
  const bigThin = gate(1500000, 40)
  assert.deepEqual(bigThin.needed, ['AH', 'LJS'])
  assert.ok(!bigThin.anyOf, 'above ₹10 Lakh both must decide regardless of margin')
})

// Diagram 02 §5 is drawn with exactly one "No" branch — Return for Revision.
// canRequestException used to return true for any blocker carrying an
// approvalType, which included all three §5 gates, so a single decision on a
// Milestone exception released a quote nobody had technically approved.
const submittedBlockers = (approvals) => transitionBlockers(
  { ...baseOpp, milestone: 'Approval' }, 'Submitted', releasedProposal,
  { approvals, poCompare: {}, kyc: {}, clarifications: [], sparesLines: [] },
)

test('a milestone exception cannot waive the §5 approvals', () => {
  const exception = key => ([{
    id: 'AP-9', oppId: 'OP-1', type: 'Milestone exception',
    targetMilestone: 'Submitted', blockerKey: key, status: 'Approved',
  }])
  for (const key of ['tech-approval', 'comm-approval', 'release']) {
    const keys = submittedBlockers(exception(key)).map(b => b.key)
    assert.ok(keys.includes(key), `an exception must not clear §5 blocker ${key}`)
  }
})

test('an exception still clears the requirements that have no approval of their own', () => {
  const opp = { ...baseOpp, milestone: 'Intake', customerStatus: 'Amber' }
  const state = { approvals: [], poCompare: {}, kyc: {}, clarifications: [], sparesLines: [] }
  const blocked = () => transitionBlockers(opp, 'Registration', releasedProposal, state)
    .some(b => b.key === 'amber-fee')
  assert.equal(blocked(), true, 'an unpaid Amber fee blocks registration')
  state.approvals = [{
    id: 'AP-8', oppId: 'OP-1', type: 'Milestone exception',
    targetMilestone: 'Registration', blockerKey: 'amber-fee', status: 'Approved',
  }]
  assert.equal(blocked(), false, 'the exception route survives for non-§5 requirements')
})

// O13: both §5A and §5B were enforced by the gate but could not be requested
// from anywhere — the transition dialog only offered a Milestone exception.
test('the transition dialog raises the §5 approvals directly', () => {
  const wb = read('src/pages/Workbench.jsx')
  assert.match(wb, /const canRequestApproval = blocker => !!blocker\.approvalType/,
    'a blocker naming its own approval type must be requestable')
  assert.match(wb, /type: blocker\.approvalType/, 'the request must use the blocker\'s real approval type')
  assert.match(wb, /rev: String\(proposal\?\.revision \?\? ''\)/,
    'the approval must be stamped with the revision it covers, or a later revision inherits it')
  assert.match(wb, /anyOf: !!blocker\.anyOf/, '§5A is "LJS or AN" — the request must carry anyOf')
  assert.match(wb, /requestBlockerApproval\(item\)/, 'the dialog must wire the button to the request')
  assert.doesNotMatch(wb, /includes\(blocker\.key\) \|\| !!blocker\.approvalType/,
    'the exception route must no longer swallow every approval-backed blocker')
})

// O14: approvalSet() was written for the diagram's "All Approvals Completed →
// Quote Ready for Dispatch" box and had no caller, so the three gates were only
// ever met one blocked transition at a time.
test('the three §5 gates are shown together as one status', () => {
  const builder = read('src/workbench/PropBuilder.jsx')
  assert.match(builder, /approvalSet\(p, store\.approvals, opp\.id\)/, 'PropBuilder must call approvalSet')
  assert.match(builder, /allApproved/, 'the panel must resolve a single all-clear state')
  assert.match(builder, /All approvals completed/, 'the all-clear must name the diagram\'s outcome')
})

// The same unpaid fee read as advisory on the readiness panel and blocking on
// the milestone gate, so an Amber opportunity looked clear to quote and then
// refused to move.
test('an unpaid Amber fee blocks on both gates, not one', () => {
  const opp = { ...baseOpp, customerStatus: 'Amber' }
  const state = { approvals: [], poCompare: {}, kyc: {}, clarifications: [], sparesLines: [] }
  const fee = readiness(opp, releasedProposal, state).find(b => b.key === 'amber-fee')
  assert.ok(fee, 'readiness must raise the unpaid Amber fee')
  assert.equal(fee.severity, 'block', 'it blocks the proposal, it is not advisory')
  assert.equal(readiness({ ...opp, amberFeePaid: true }, releasedProposal, state)
    .some(b => b.key === 'amber-fee'), false, 'a received fee clears it')
})

test('a blocker raised by both gates is listed once', () => {
  const opp = { ...baseOpp, milestone: 'Intake', customerStatus: 'Amber' }
  const state = { approvals: [], poCompare: {}, kyc: {}, clarifications: [], sparesLines: [] }
  const fees = transitionBlockers(opp, 'Proposal', releasedProposal, state).filter(b => b.key === 'amber-fee')
  assert.equal(fees.length, 1, 'the Amber fee must not appear twice once readiness folds in')
})

// Diagram 02 §7 has one revision path: typed, back-routed to its B-step, and
// re-approved. The follow-up pane used to write an untyped R-numbered entry that
// did none of that.
test('every revision goes through the typed reviseProposal path', () => {
  const wb = read('src/pages/Workbench.jsx')
  assert.match(wb, /store\.reviseProposal\(opp\.id, note\.trim\(\), revType\)/,
    'the follow-up pane must revise through the store, with a type')
  assert.doesNotMatch(wb, /rev: `R\$\{revisions\.length \+ 1\}`/,
    'the untyped R-series revision writer must be gone')
  const builder = read('src/workbench/PropBuilder.jsx')
  assert.match(builder, /rev: `S\$\{revisions\.filter\(r => r\.status === 'Submitted'\)\.length \+ 1\}`/,
    'a submission is not a revision and must not consume a V-number')
})

// ---------------------------------------------------------------------------
// Customer portal, parked behind seed.js PORTAL_ENABLED. These lock the *wiring*
// rather than the current value of the flag, so flipping it back on is a
// one-line change that stays honest either way.
// ---------------------------------------------------------------------------
test('the portal flag drives every surface that can reach the portal', () => {
  const seed = read('src/seed.js')
  assert.match(seed, /export const PORTAL_ENABLED = (true|false)/, 'the flag must be a single named export')
  assert.match(seed, /const pages = list => \(PORTAL_ENABLED \? list : list\.filter\(p => p !== 'portal'\)\)/,
    'the page-permission matrix must run through the flag')
  assert.match(seed, /export const selectableRoles = \(\)[\s\S]*?PORTAL_ENABLED \|\| id !== 'CUST'/,
    'the persona list must drop CUST with the portal')

  for (const [file, why] of [
    ['src/App.jsx', 'the desktop shell'],
    ['src/tablet/TabletApp.jsx', 'the tablet shell'],
  ]) {
    const src = read(file)
    assert.match(src, /PORTAL_ENABLED && <Route path="\/portal"/, `${why} must gate the /portal route`)
    assert.match(src, /selectableRoles\(\)\.map/, `${why} must build its persona switcher from selectableRoles`)
  }
  // A customer account has nowhere to land while the portal is off.
  assert.match(read('src/store.jsx'), /u\.role === 'CUST' && !PORTAL_ENABLED/,
    'login must refuse a customer account while the portal is parked')
  assert.match(read('src/App.jsx'), /!PORTAL_ENABLED && \(role === 'CUST' \|\| custAccount\)/,
    'a saved customer session must land on the parked notice, not a denied app')
})

test('the portal is currently parked, and nothing offers a way in', () => {
  assert.equal(PORTAL_ENABLED, false, 'flip this expectation when the portal comes back')
  assert.equal(selectableRoles().some(([id]) => id === 'CUST'), false,
    'the customer persona must not be offered in the switcher')
  for (const role of Object.keys(ROLES)) {
    assert.equal((PERMS[role] || []).includes('portal'), false, `${role} must not hold the portal page permission`)
  }
})
