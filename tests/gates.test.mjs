import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ROLES, PERMS, PORTAL_ENABLED, selectableRoles } from '../src/seed.js'
import { canViewCommercial, canPriceProposal, isSalesOwner } from '../src/utils.js'
import { transitionBlockers, releaseState, readiness, commercialGate, approvalForRev, approvalSet } from '../src/gates.js'
import { contextForType, routeForType, CONTEXTS, OPP_TYPES } from '../src/seed.js'
import { proposalApprovalSnapshot } from '../src/approvalMemory.js'

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

test('a commercial deviation approval carries forward when the same terms remain', () => {
  const proposal = {
    revision: '01',
    terms: [
      { term: 'Payment', status: 'Deviation' },
      { term: 'Delivery', status: 'Deviation' },
    ],
  }
  const approval = {
    id: 'AP-1', oppId: 'OP-1', type: 'Commercial deviation', rev: '00', status: 'Approved',
    deviationDetails: [{ term: 'Payment' }, { term: 'Delivery' }],
  }
  assert.ok(approvalForRev('Commercial approval', proposal, [approval], 'OP-1').approved,
    'the existing commercial deviation approval should satisfy the renamed gate')
  assert.equal(approvalForRev('Commercial approval', {
    ...proposal,
    terms: [...proposal.terms, { term: 'Warranty', status: 'Deviation' }],
  }, [approval], 'OP-1').approved, null,
  'a new deviation must require a new approval')
})

test('final release uses the quote revision as its single source of truth', () => {
  const proposal = { ...releasedProposal, subject: 'Original subject' }
  const approval = {
    id: 'AP-SNAPSHOT', oppId: 'OP-1', type: 'Final quote release', rev: '01', status: 'Approved',
    approvalSnapshot: proposalApprovalSnapshot(proposal, baseOpp),
  }
  assert.ok(releaseState({ ...proposal, revision: '01', subject: 'Corrected copy' }, [approval], 'OP-1', baseOpp).release,
    'description or snapshot differences cannot duplicate the same revision gate')
  assert.equal(releaseState({ ...proposal, revision: '02' }, [approval], 'OP-1', baseOpp).release, null,
    'a genuinely new revision still requires a new release')
})

test('an approved release wins over a duplicate pending row for the same revision', () => {
  const approvals = [
    { id: 'AP-141', oppId: 'OP-1', type: 'Final quote release', rev: '01', status: 'Approved' },
    { id: 'AP-142', oppId: 'OP-1', type: 'Final quote release', rev: '01', status: 'Pending', needed: ['LJS', 'AH'] },
  ]
  const state = releaseState({ ...releasedProposal, revision: '01' }, approvals, 'OP-1', baseOpp)
  assert.equal(state.release?.id, 'AP-141')
  assert.equal(state.reason, '')
})

test('snapshot-backed commercial approval reopens when pricing changes', () => {
  const proposal = { ...releasedProposal, discountPct: 5 }
  const approval = {
    id: 'AP-SNAPSHOT', oppId: 'OP-1', type: 'Commercial approval', rev: '01', status: 'Approved',
    approvalSnapshot: proposalApprovalSnapshot(proposal, baseOpp),
  }
  assert.equal(approvalForRev('Commercial approval', { ...proposal, discountPct: 12, revision: '02' }, [approval], 'OP-1', baseOpp).approved, null)
})

test('Section 5B approval remains valid after unrelated commercial edits', () => {
  const proposal = {
    ...releasedProposal,
    terms: [{
      term: 'Payment', status: 'Deviation', decision: 'Match customer terms',
      customerAsk: '60 days from invoice', standardTerm: '30 days from invoice',
    }],
  }
  const approval = {
    id: 'AP-5B', oppId: 'OP-1', type: 'Commercial approval', rev: '01', status: 'Approved',
    approvalSnapshot: proposalApprovalSnapshot(proposal, baseOpp),
    deviationDetails: [{ term: 'Payment', customerAsk: '60 days from invoice', ourResponse: '60 days from invoice' }],
  }
  const changedPricing = { ...proposal, discountPct: 8 }
  assert.equal(approvalForRev('Commercial approval', changedPricing, [approval], 'OP-1', baseOpp).approved?.id, 'AP-5B')
  assert.equal(approvalForRev('Commercial approval', {
    ...changedPricing,
    terms: [{ ...proposal.terms[0], customerAsk: '90 days from invoice' }],
  }, [approval], 'OP-1', baseOpp).approved, null)
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

test('an uploaded proposal revision must pass logical review before Submitted', () => {
  const uploaded = { ...releasedProposal, reviewedUpload: { filename: 'edited.xlsx', sheets: [{ name: 'Firm Offer', rows: [] }] }, reviewStatus: 'Ready for validation' }
  const state = poState({})
  assert.equal(
    transitionBlockers({ ...baseOpp, milestone: 'Approval' }, 'Submitted', uploaded, state).some(item => item.key === 'proposal-review'),
    true,
  )
  assert.equal(
    transitionBlockers({ ...baseOpp, milestone: 'Approval' }, 'Submitted', { ...uploaded, reviewStatus: 'Validated' }, state).some(item => item.key === 'proposal-review'),
    false,
  )
})

test('standard ModAE terms do not require commercial AH approval', () => {
  const blockers = transitionBlockers(
    { ...baseOpp, milestone: 'Approval' }, 'Submitted', releasedProposal,
    { ...poState({}), approvals: [] },
  )
  assert.equal(blockers.some(b => b.key === 'comm-approval'), false,
    'standard terms must not create the commercial-deviation blocker')
  assert.ok(blockers.some(b => b.key === 'tech-approval'),
    'technical approval remains applicable')
  assert.ok(blockers.some(b => b.key === 'release'),
    'final quote release remains applicable')
})

test('matching a customer commercial deviation still requires AH approval', () => {
  const proposal = {
    ...releasedProposal,
    terms: [{
      term: 'Payment', status: 'Deviation', decision: 'Match customer terms',
      customerAsk: '60 days from invoice', standardTerm: '30 days from invoice',
    }],
  }
  const blockers = transitionBlockers(
    { ...baseOpp, milestone: 'Approval' }, 'Submitted', proposal, poState({}),
  )
  const commercial = blockers.find(b => b.key === 'comm-approval')
  assert.ok(commercial, 'a matched customer deviation must require commercial approval')
  assert.equal(commercial.approvalType, 'Commercial approval')
  assert.deepEqual(commercial.needed, ['AH'])
})

test('Requirement Validation blocks unresolved commercial terms before Sourcing', () => {
  const opp = { ...baseOpp, route: 'Spares', milestone: 'Screening' }
  const state = { approvals: [], clarifications: [], sparesLines: [], config: {} }
  const makeProposal = term => ({ revision: '01', bom: [{ qty: 1, listPrice: 100 }], terms: [term] })

  for (const term of [
    { term: 'Payment', status: 'Deviation', customerAsk: '90 days', standardTerm: '30 days', decision: 'Decision pending' },
    { term: 'Delivery', status: 'Deviation', customerAsk: '8 weeks', standardTerm: '10–12 weeks', decision: 'Counter-offer with ModAE standard terms', customerConfirmationStatus: 'Awaiting reply' },
  ]) {
    const blockers = transitionBlockers(opp, 'Sourcing', makeProposal(term), state)
    assert.ok(blockers.some(item => item.key === 'commercial-decision'), `unresolved ${term.term} must block Sourcing`)
  }
})

test('matched commercial terms require AH approval before Sourcing, per term', () => {
  const opp = { ...baseOpp, route: 'Spares', milestone: 'Screening' }
  const proposal = {
    revision: '01', bom: [{ qty: 1, listPrice: 100 }],
    terms: [
      { term: 'Payment', status: 'Deviation', customerAsk: '90 days', standardTerm: '30 days', decision: 'Match customer terms' },
      { term: 'Delivery', status: 'Deviation', customerAsk: '8 weeks', standardTerm: '10–12 weeks', decision: 'Counter-offer with ModAE standard terms', customerConfirmationStatus: 'Accepted' },
    ],
  }
  const state = { approvals: [], clarifications: [], sparesLines: [], config: {} }
  const blocked = transitionBlockers(opp, 'Sourcing', proposal, state)
  assert.equal(blocked.some(item => item.key === 'commercial-decision'), false, 'accepted counter-offer must be resolved')
  assert.equal(blocked.find(item => item.key === 'commercial-approval')?.text, 'AH commercial approval is required for Payment before moving to Sourcing')

  const approved = transitionBlockers(opp, 'Sourcing', proposal, {
    ...state,
    approvals: [{
      id: 'AP-COMM-SOURCE', oppId: opp.id, type: 'Commercial deviation', rev: '01', status: 'Approved',
      approvalSnapshot: { revision: '01', terms: proposal.terms },
      deviationDetails: [{ term: 'Payment', customerAsk: '90 days', ourResponse: '90 days', standardTerm: '30 days' }],
    }],
  })
  assert.equal(approved.some(item => item.key === 'commercial-decision' || item.key === 'commercial-approval'), false)
})

test('Requirement Validation approval with legacy empty details clears Sourcing', () => {
  const opp = { ...baseOpp, route: 'Spares', milestone: 'Screening' }
  const proposal = {
    revision: '01', bom: [{ qty: 1, listPrice: 100 }],
    terms: [
      { term: 'Payment', status: 'Deviation', decision: 'Match customer terms', customerAsk: '60 days', standardTerm: '30 days' },
      { term: 'Delivery', status: 'Deviation', decision: 'Match customer terms', customerAsk: '6 weeks', standardTerm: '10–12 weeks' },
    ],
  }
  const blockers = transitionBlockers(opp, 'Sourcing', proposal, {
    approvals: [{
      id: 'AP-LEGACY-COMM', oppId: opp.id, type: 'Commercial deviation', rev: '01', status: 'Approved',
      deviationDetails: [],
      approvalSnapshot: { commercial: { terms: [
        { term: 'Payment', status: 'deviation', text: '60 days' },
        { term: 'Delivery', status: 'deviation', text: '6 weeks' },
      ] } },
    }],
    clarifications: [], sparesLines: [], config: {},
  })
  assert.equal(blockers.some(item => item.key === 'commercial-approval'), false)
})

test('commercial approval reopens when a matched customer request changes', () => {
  const opp = { ...baseOpp, route: 'Spares', milestone: 'Screening' }
  const proposal = {
    revision: '01', bom: [{ qty: 1, listPrice: 100 }],
    terms: [{ term: 'Payment', status: 'Deviation', decision: 'Match customer terms', customerAsk: '90 days', standardTerm: '30 days' }],
  }
  const approval = {
    id: 'AP-COMM-CHANGE', oppId: opp.id, type: 'Commercial deviation', rev: '01', status: 'Approved',
    deviationDetails: [{ term: 'Payment', customerAsk: '60 days', ourResponse: '60 days' }],
  }
  const blockers = transitionBlockers(opp, 'Sourcing', proposal, { approvals: [approval], clarifications: [], sparesLines: [], config: {} })
  assert.ok(blockers.some(item => item.key === 'commercial-approval'))
})

test('commercial deviation approval survives unrelated sourcing pricing changes', () => {
  const opp = { ...baseOpp, route: 'Spares', milestone: 'Sourcing' }
  const proposal = {
    revision: '01',
    sourceRate: 92,
    markupPct: 13,
    bom: [{ pn: 'DS-1000-PROX', qty: 1, listPrice: 125, quoted: 180, currency: 'INR' }],
    terms: [{
      term: 'Payment', status: 'Deviation', decision: 'Match customer terms',
      customerAsk: '90 days credit', standardTerm: '30 days from invoice',
    }],
  }
  const approval = {
    id: 'AP-COMM-BOQ-EDIT', oppId: opp.id, type: 'Commercial deviation', rev: '01', status: 'Approved',
    deviationDetails: [{ term: 'Payment', customerAsk: '90 days credit', ourResponse: '90 days credit', standardTerm: '30 days from invoice' }],
    approvalSnapshot: {
      commercial: {
        bom: [{ pn: 'DS-1000-PROX', qty: 1, listPrice: 100, quoted: 160, currency: 'INR' }],
        terms: [{ term: 'payment', status: 'deviation', text: '90 days credit' }],
        discountPct: 0, markupPct: 10, financeCostK: 0, sourceRate: 90,
      },
      customer: { sellTo: 'ACME', route: 'spares', proposalType: '', currency: 'inr' },
    },
  }
  const blockers = transitionBlockers(opp, 'Proposal', proposal, {
    approvals: [approval], clarifications: [], sparesLines: [], config: {},
  })
  assert.equal(blockers.some(item => item.key === 'dev'), false)
  assert.equal(blockers.some(item => item.key === 'commercial-approval'), false)
})

test('approval checklist omits commercial approval for standard terms', () => {
  const gates = approvalSet(releasedProposal, [], 'OP-1', baseOpp)
  assert.deepEqual(gates.map(g => g.type), ['Technical approval', 'Final quote release'])
})

test('Admin switches can disable final release and commercial-deviation gates independently', () => {
  const opp = { ...baseOpp, route: 'Spares', milestone: 'Sourcing' }
  const proposal = {
    ...releasedProposal,
    revision: '01',
    terms: [{ term: 'Payment', status: 'Deviation', decision: 'Match customer terms', customerAsk: '90 days', standardTerm: '30 days' }],
  }
  const config = { requireFinalQuoteApproval: false, requireCommercialDeviationApproval: false }
  const state = { approvals: [], clarifications: [], sparesLines: [], config }
  assert.equal(approvalSet(proposal, [], opp.id, opp, config).some(g => g.type === 'Final quote release'), false)
  assert.equal(transitionBlockers(opp, 'Sourcing', proposal, state).some(b => b.key === 'commercial-approval'), false)
  assert.equal(transitionBlockers({ ...opp, milestone: 'Approval' }, 'Submitted', proposal, state).some(b => b.key === 'release'), false)
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
  assert.equal(bStepBlocker('Spares'), undefined, 'Spares no longer owes Brownfield sign-offs')
  assert.equal(bStepBlocker('Retrofit'), undefined, 'Retrofit no longer owes Brownfield sign-offs')
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
// approvalType, which included the technical and commercial approval gates, so
// a single decision on a Milestone exception released a quote nobody had
// technically approved. Standard terms now omit the commercial gate; a real
// deviation is covered by the focused deviation test above.
const submittedBlockers = (approvals) => transitionBlockers(
  { ...baseOpp, milestone: 'Approval' }, 'Submitted', releasedProposal,
  { approvals, poCompare: {}, kyc: {}, clarifications: [], sparesLines: [] },
)

test('an obsolete final release never blocks entry into Approval', () => {
  const approvals = [
    { id: 'AP-OLD', oppId: 'OP-1', type: 'Final quote release', rev: '00', status: 'Pending', approver: 'LJS' },
    { id: 'AP-CURRENT', oppId: 'OP-1', type: 'Final quote release', rev: '01', status: 'Approved' },
  ]
  const state = { approvals, poCompare: {}, kyc: {}, clarifications: [], sparesLines: [] }
  const early = transitionBlockers({ ...baseOpp, milestone: 'Proposal' }, 'Approval', releasedProposal, state)
  assert.ok(!early.some(blocker => blocker.key === 'wait-AP-OLD'),
    'a prior pending release belongs to its old revision and cannot stop Proposal → Approval')

  const submitted = transitionBlockers({ ...baseOpp, milestone: 'Approval' }, 'Submitted', releasedProposal, state)
  assert.ok(!submitted.some(blocker => blocker.key === 'release'),
    'the current approved release still clears Quotation Submission')
})

test('a milestone exception cannot waive the §5 approvals', () => {
  const exception = key => ([{
    id: 'AP-9', oppId: 'OP-1', type: 'Milestone exception',
    targetMilestone: 'Submitted', blockerKey: key, status: 'Approved',
  }])
  for (const key of ['tech-approval', 'release']) {
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

test('transition approval blockers explain why approval is requested', () => {
  const wb = read('src/pages/Workbench.jsx')
  assert.match(wb, /const approvalRequestReason = blocker =>/)
  assert.match(wb, /key === 'comm-approval'/)
  assert.match(wb, /key === 'release'/)
  assert.match(wb, /Reason for request/)
})

// O14: approvalSet() was written for the diagram's "All Approvals Completed →
// Quote Ready for Dispatch" box and had no caller, so the three gates were only
// ever met one blocked transition at a time.
test('the three §5 gates are shown together as one status', () => {
  const builder = read('src/workbench/PropBuilder.jsx')
  assert.match(builder, /approvalSet\(p, store\.approvals, opp\.id(?:, opp)?(?:, store\.config)?\)/, 'PropBuilder must call approvalSet')
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

// The Submitted step must never show a bare "release pending" while the
// Approvals list shows a green row — releaseState has to say WHY it is closed.
test('releaseState explains why the submission gate is closed', () => {
  // Waiting on the second approver of the joint gate.
  const pendingRow = {
    id: 'AP-P', oppId: 'OP-1', type: 'Final quote release', rev: '01', status: 'Pending',
    approver: 'LJS', needed: ['LJS', 'AH'],
    decisions: { AH: { d: 'Approved', c: '', when: '2026-09-19T06:00:00Z' } },
  }
  const waiting = releaseState(releasedProposal, [pendingRow], 'OP-1', baseOpp)
  assert.equal(waiting.release, null)
  assert.match(waiting.reason, /awaiting LJS/, 'the reason must name the missing approver')
  // Description/snapshot differences on the same revision must not create a
  // duplicate gate — the revision is the final-release source of truth.
  const approvedRow = {
    id: 'AP-A', oppId: 'OP-1', type: 'Final quote release', rev: '01', status: 'Approved',
    approvalSnapshot: proposalApprovalSnapshot(releasedProposal, baseOpp),
  }
  const edited = { ...releasedProposal, subject: 'Changed subject after approval' }
  const sameRevision = releaseState(edited, [approvedRow], 'OP-1', baseOpp)
  assert.ok(sameRevision.release)
  assert.equal(sameRevision.reason, '')
  // A new quote revision still needs its own release.
  const revised = releaseState({ ...edited, revision: '02' }, [approvedRow], 'OP-1', baseOpp)
  assert.equal(revised.release, null)
  assert.match(revised.reason, /current quote is revision 02/)
  // Untouched proposal → gate open, nothing to explain.
  const open = releaseState(releasedProposal, [approvedRow], 'OP-1', baseOpp)
  assert.ok(open.release)
  assert.equal(open.reason, '')
})

test('the Submitted step renders the release reason, not just the generic text', () => {
  const source = read('src/workbench/SubmissionPanel.jsx')
  assert.match(source, /releaseReason/,
    'SubmissionPanel must surface releaseState.reason in its pending branch')
  // The panel must be able to break the deadlock in place: request the joint
  // LJS + AH release without navigating away to the transition dialog.
  assert.match(source, /needed: \['LJS', 'AH'\]/,
    'the in-place release request must be the joint LJS + AH gate')
  assert.match(source, /pendingRelease &&/,
    'the request button must hide while a release request is already pending')
})
