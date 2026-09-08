// Readiness gates for sending a proposal out, per the Aug 10 review:
// Red customers need LJS clearance, commercial deviations need AH approval,
// and "approved with conditions" decisions block until the salesperson
// confirms each condition is incorporated in the proposal.
//
// Blocker shape: { key, severity: 'block'|'wait'|'info', text,
//                  approvalType?, approver?, approvalId?, condIdx?, kyc? }

import { unitCostINR, unitSellINR } from './utils.js'
import { defaultCosting, MILESTONES } from './seed.js'
import { applyAdjustment } from './pricing.js'
import { isPlaceholderSparesLine } from './proposal/sparesBoq.js'

const isLeadKycVerified = opp =>
  opp?.leadVerification?.type === 'KYC' && opp.leadVerification.status === 'Verified'

function blueKycComplete(opp, state) {
  if (isLeadKycVerified(opp)) return true
  const items = (state.kyc || {})[opp.sellTo]
  return !!items?.length && items.every(item => item.state === 'Verified')
}

// Total quantity of a BoQ line, matching the workbook: Qty/Unit × units +
// Common + Spares (legacy rows carried a single qty — treated as common).
function lineQty(l, units) {
  if (l.qtyPerUnit === undefined && l.qty != null) return l.qty
  return (l.qtyPerUnit || 0) * units + (l.common || 0) + (l.spares || 0)
}

// Customer-facing value / landed cost / GM% straight off the proposal's BoQ,
// with the same costing math the Priced BoQ sheet uses. A hand-quoted price
// (l.quoted) wins over the computed GM price, as in the workbook.
export function computeProposalTotals(proposal) {
  if (!proposal) return { value: 0, listValue: 0, cogs: 0, gmPct: 0 }
  const costing = { ...defaultCosting, ...(proposal.costing || {}) }
  const units = proposal.units || 7
  let value = 0
  let listValue = 0
  let cogs = 0
  for (const l of proposal.bom || []) {
    const q = lineQty(l, units)
    const isBnk = (l.list || 'BNK') === 'BNK'
    const sell = l.quoted !== '' && l.quoted != null
      ? +l.quoted
      : unitSellINR(l.listPrice || 0, costing, l.currency || 'EUR', isBnk)
    const adjusted = l.quoted !== '' && l.quoted != null ? sell : applyAdjustment(sell, proposal)
    value += adjusted * q
    listValue += sell * q
    cogs += unitCostINR(l.listPrice || 0, costing, l.currency || 'EUR', isBnk) * q
  }
  const gmPct = value ? ((value - cogs) / value) * 100 : 0
  return { value, listValue, cogs, gmPct }
}

// Diagram 02 §5C — the margin approval matrix. Routing is on *order value*
// against ₹10 Lakh and *margin* against 50%, not on discount:
//
//   < 10 L & > 50%  → the assigned salesperson approves their own quote
//   < 10 L & ≤ 50%  → AH or LJS (either one clears it)
//   ≥ 10 L & > 50%  → AH + LJS jointly
//   ≥ 10 L & ≤ 50%  → AH + LJS jointly
//
// `needed` is the list of roles that must decide; `anyOf` marks the row where
// one of two approvers is enough, and `selfApprove` the row the owner clears.
export function commercialGate(opp, proposal, config) {
  const { value, listValue, cogs, gmPct } = computeProposalTotals(proposal)
  const disc = proposal?.discountPct || 0
  const t = config?.approvalThresholds || {}
  const valueBreak = t.valueBreak ?? 1000000
  const marginBreak = t.marginBreak ?? 50
  const big = value >= valueBreak
  const healthy = gmPct > marginBreak
  const effectiveDisc = listValue ? ((listValue - value) / listValue) * 100 : 0
  const base = { gmPct, disc: effectiveDisc, value, listValue, cogs, valueBreak, marginBreak }
  if (!big && healthy) {
    return { ...base, needed: [opp?.owner].filter(Boolean), selfApprove: true, label: 'Assigned salesperson' }
  }
  if (!big) return { ...base, needed: ['AH', 'LJS'], anyOf: true, label: 'AH or LJS' }
  return { ...base, needed: ['AH', 'LJS'], label: 'AH + LJS (both)' }
}

// Brownfield sign-off is split: B-01..B-04 belong to Sourcing and B-05
// confirms the proposal before Approval.

// Full workbench readiness: everything oppBlockers raises, plus KYC, the
// Amber pre-quote fee, and route-specific checks (spares part matching /
// price sources, service travel confirmation, empty BoQ).
export function readiness(opp, proposal, state) {
  if (!opp) return []
  const b = [...oppBlockers(opp, proposal, state.approvals || [])]

  if (opp.customerStatus === 'Blue' && !opp.kycOverride && !blueKycComplete(opp, state)) {
    b.push({
      key: 'kyc-block', severity: 'block', kyc: true,
      text: 'KYC verification pending (AH) — or override with reason',
    })
  }

  // Diagram 01's Amber lane makes the pre-quote fee a condition of proceeding,
  // and transitionBlockers blocks Registration on it. Readiness said `info`,
  // so the same unpaid fee read as advisory on one panel and blocking on the
  // other. It blocks in both.
  if (opp.customerStatus === 'Amber' && opp.amberFeePaid !== true) {
    b.push({ key: 'amber-fee', severity: 'block', text: 'Amber pre-quote processing fee not received' })
  }

  if (opp.route === 'Spares') {
    for (const l of (state.sparesLines || []).filter(x => x.oppId === opp.id && !isPlaceholderSparesLine(x))) {
      if (!l.confirmed) {
        b.push({ key: `sp-conf-${l.id}`, severity: 'block', text: `Unconfirmed part match — ${l.custRef || l.pn}` })
      } else if (l.priceState === 'Expired') {
        b.push({ key: `sp-price-${l.id}`, severity: 'block', text: `Expired price source — request price update (${l.pn})` })
      }
    }
  }

  if (opp.route === 'Service') {
    const est = (state.svcEstimates || []).find(e => e.oppId === opp.id)
    if (est && !est.travelConfirmed) {
      b.push({ key: 'svc-travel', severity: 'block', text: 'Manual travel estimate not confirmed' })
    }
    // Diagram 02 §4: when a site survey is required the proposal is priced off
    // the survey report and SoW, not straight off the rate sheet.
    if (est?.surveyRequired) {
      const survey = (state.surveys || []).find(v => v.oppId === opp.id)
      if (!survey) {
        b.push({ key: 'survey', severity: 'block', text: 'Site survey required — raise the survey request' })
      } else if (!survey.report) {
        b.push({ key: 'survey', severity: 'block', text: `Site survey report outstanding (${survey.state})` })
      } else if (!survey.sow) {
        b.push({ key: 'survey-sow', severity: 'block', text: 'Statement of Work must be written up from the survey report' })
      }
    }
  }





  if ((opp.route === 'Spares' || opp.route === 'Project') && !(proposal?.bom || []).length) {
    b.push({ key: 'no-bom', severity: 'block', text: 'No priced lines in proposal' })
  }

  return b
}

// Who the next action actually sits with. Biji, 13 Aug: "I should know where is
// the next action pending — not with me, but with someone… then I need to go to
// [them] and get those actions done." Derived from the live blockers so the
// column is true by construction; a value typed into the sheet still wins, since
// a salesperson may know something the gates do not.
export function nextActionWith(opp, proposal, state) {
  if (!opp) return { owner: '', text: '', derived: false }
  if (opp.nextActionOwner) {
    return { owner: opp.nextActionOwner, text: `Follow up with ${opp.nextActionOwner}`, derived: false }
  }
  const blockers = readiness(opp, proposal, state)
  const b = blockers.find(x => x.severity === 'block' || x.severity === 'wait')
  if (!b) return { owner: '', text: '', derived: true }
  // An approval gate names its approver; KYC always sits with AH; everything
  // else is work the opportunity owner has to do themselves.
  const owner = b.approver || (b.kyc ? 'AH' : opp.owner || '')
  return { owner, text: b.text, derived: true }
}

export function oppBlockers(opp, proposal, approvals) {
  if (!opp) return []
  const b = []
  const mine = approvals.filter(a => a.oppId === opp.id)
  const hasApproved = type => mine.some(a => a.type === type
    && (a.status === 'Approved' || a.status === 'Approved with conditions'))
  const hasOpen = type => mine.some(a => a.type === type && a.status === 'Pending')

  if (opp.customerStatus === 'Red' && !hasApproved('Red customer clearance')) {
    if (hasOpen('Red customer clearance')) {
      b.push({ key: 'red-wait', severity: 'wait', text: 'Red customer clearance awaiting joint LJS + AH decision.' })
    } else {
      // `needed` matters: without it, requestBlockerApproval builds the gate
      // from `approver` alone, and a Red clearance raised off this blocker
      // would clear on LJS by himself — bypassing the AH half of the joint
      // decision that transitionBlockers and the inbox both demand.
      b.push({
        key: 'red', severity: 'block',
        text: 'Red customer — high risk / unpaid record. Joint LJS + AH clearance required before any proposal goes out.',
        approvalType: 'Red customer clearance', approver: 'LJS', needed: ['LJS', 'AH'],
      })
    }
  }

  if (opp.customerStatus === 'Blue') {
    b.push({ key: 'kyc', severity: 'info', text: 'New (Blue) customer — KYC verification pending with admin.' })
  }
  if (opp.customerStatus === 'Amber' && !hasApproved('Amber credit terms') && !hasOpen('Amber credit terms')) {
    b.push({
      key: 'amber', severity: 'info',
      text: 'Amber customer — credit terms are subject to AH approval.',
      approvalType: 'Amber credit terms', approver: 'AH',
    })
  }

  const devs = (proposal?.terms || []).filter(t => t.status === 'Deviation')
  if (devs.length && !hasApproved('Commercial deviation')) {
    if (hasOpen('Commercial deviation')) {
      b.push({ key: 'dev-wait', severity: 'wait', text: 'Commercial-deviation approval awaiting AH decision.' })
    } else {
      b.push({
        key: 'dev', severity: 'block',
        text: `${devs.length} commercial deviation${devs.length > 1 ? 's' : ''} (${devs.map(d => d.term).join(', ')}) need${devs.length > 1 ? '' : 's'} approval before submission.`,
        approvalType: 'Commercial deviation', approver: 'AH',
      })
    }
  }

  for (const a of mine.filter(x => x.status === 'Approved with conditions')) {
    a.conditions.forEach((c, i) => {
      if (!c.incorporated) {
        b.push({
          key: `cond-${a.id}-${i}`, severity: 'block',
          text: `Condition from ${a.approver}: "${c.text}" — confirm it is incorporated in the proposal.`,
          approvalId: a.id, condIdx: i,
        })
      }
    })
  }

  // Any other pending request (e.g. amber terms sent for approval).
  for (const a of mine.filter(x => x.status === 'Pending'
    && !['Red customer clearance', 'Commercial deviation'].includes(x.type))) {
    b.push({ key: `wait-${a.id}`, severity: 'wait', text: `${a.type} awaiting ${a.approver} decision.` })
  }

  return b
}

export const isBlocked = blockers => blockers.some(x => x.severity === 'block' || x.severity === 'wait')

// The three §5 approvals — technical, commercial and margin — each cover the
// exact proposal revision they were raised against. The official workflow makes
// re-approval mandatory on every revision, so a revised quote falls back to
// unapproved here rather than carrying the old decision forward. Approvals
// written before `rev` existed are treated as covering the current revision.
export const APPROVAL_5A = 'Technical approval'
export const APPROVAL_5B = 'Commercial approval'
export const APPROVAL_5C = 'Final quote release'

// The §5 blocker keys, which a milestone exception must never clear.
// A milestone exception may never waive these. The §5 approvals were always
// here; `red-clearance` joins them because the Red gate is a joint LJS + AH
// decision about whether to trade with the customer at all — not a schedule
// concession one approver can sign away.
export const NO_EXCEPTION = ['tech-approval', 'comm-approval', 'release', 'red-clearance']

export function approvalForRev(type, proposal, approvals, oppId) {
  const rev = String(proposal?.revision ?? '')
  const mine = (approvals || []).filter(a =>
    a.oppId === oppId && a.type === type
    && (a.rev == null || String(a.rev) === rev))
  return {
    pending: mine.find(a => a.status === 'Pending') || null,
    approved: mine.find(a => ['Approved', 'Approved with conditions'].includes(a.status)) || null,
  }
}

// The §5C release, kept under its original name — it is the gate the
// submission panel and the proposal builder read.
export function releaseState(proposal, approvals, oppId) {
  const { pending, approved } = approvalForRev(APPROVAL_5C, proposal, approvals, oppId)
  return { pending, release: approved }
}

// All three §5 gates in one call, for the "All Approvals Completed" box.
export function approvalSet(proposal, approvals, oppId) {
  return [APPROVAL_5A, APPROVAL_5B, APPROVAL_5C].map(type => ({
    type, ...approvalForRev(type, proposal, approvals, oppId),
  }))
}

// Forward lifecycle movement is deliberately stricter than proposal
// readiness. This is the single gate used by the opportunity stepper so a
// user cannot jump over the lead-management requirements in the official
// workflow. Backward movement is handled by the UI with a mandatory reason.
export function transitionBlockers(opp, target, proposal, state) {
  if (!opp || !target) return []
  const current = MILESTONES.indexOf(opp.milestone)
  const next = MILESTONES.indexOf(target)
  if (next <= current) return []
  const b = []
  const required = [
    ['sellTo', 'Customer is required'], ['eucName', 'EUC name is required'], ['eucLocation', 'EUC location is required'],
    ['oppName', 'Opportunity name is required'],
    ['owner', 'Opportunity owner is required'], ['route', 'Opportunity route is required'],
    ['contactPerson', 'Customer contact person is required'], ['contactPhone', 'Customer contact phone is required'],
  ]
  required.forEach(([field, text]) => { if (!opp[field]) b.push({ key: `required-${field}`, severity: 'block', text }) })

  const approvals = state.approvals || []
  const mine = approvals.filter(a => a.oppId === opp.id)
  const approved = type => mine.some(a => a.type === type && ['Approved', 'Approved with conditions'].includes(a.status))
  const pending = type => mine.some(a => a.type === type && a.status === 'Pending')
  const kycComplete = blueKycComplete(opp, state)

  if (next >= MILESTONES.indexOf('Customer/KYC') && opp.customerStatus === 'Blue' && !kycComplete && !opp.kycOverride) {
    b.push({ key: 'kyc', severity: 'block', text: 'Blue customer KYC must be fully verified by AH', approver: 'AH' })
  }
  if (next >= MILESTONES.indexOf('Registration') && opp.customerStatus === 'Amber' && !opp.amberFeePaid) {
    b.push({ key: 'amber-fee', severity: 'block', text: 'Amber customer pre-quote fee must be received', approver: 'AH' })
  }
  if (next >= MILESTONES.indexOf('Registration') && opp.customerStatus === 'Red' && !approved('Red customer clearance')) {
    // `approvalType` matters as much as `needed`: without it Workbench treats
    // this as exception-eligible and offers a Milestone exception instead, which
    // waived the Red gate outright — the opportunity moved past Registration
    // with no clearance record in existence. With it, the real approval is
    // requested, and NO_EXCEPTION refuses the waiver at the model layer too.
    b.push({ key: 'red-clearance', severity: pending('Red customer clearance') ? 'wait' : 'block', text: pending('Red customer clearance') ? 'Red customer clearance is awaiting LJS/AH approval' : 'Red customer clearance from LJS/AH is required', approvalType: 'Red customer clearance', approver: 'LJS', needed: ['LJS', 'AH'] })
  }

  const clarifications = (state.clarifications || []).filter(c => c.oppId === opp.id)
  if (next >= MILESTONES.indexOf('Sourcing') && clarifications.some(c => ['Draft', 'Open', 'Sent'].includes(c.status))) {
    b.push({ key: 'clarifications', severity: 'block', text: `All customer clarifications must be resolved before moving to ${target}` })
  }

  // Diagram 02 §2: Greenfield Phase 1 is registration, follow-up and monitoring
  // only — "No Quote / RFQ / Engineering / Pricing at this stage". Pricing work
  // may not precede Sourcing.
  if (opp.context === 'Greenfield' && next < MILESTONES.indexOf('Sourcing')) {
    const priced = (proposal?.bom || []).some(l =>
      +(l.listPrice || 0) > 0 || (l.quoted !== '' && l.quoted != null && +l.quoted > 0))
    if (priced) {
      b.push({
        key: 'greenfield-pricing', severity: 'block',
        text: 'Greenfield Phase 1 carries no pricing — clear the priced lines or move the opportunity to Sourcing first',
      })
    }
  }

  if (next >= MILESTONES.indexOf('Proposal')) {
    // Readiness raises some of the same requirements this gate already listed
    // (the Amber fee, for one), so fold by key rather than showing the operator
    // the same blocker twice.
    const seen = new Set(b.map(x => x.key))
    b.push(...readiness(opp, proposal, state).filter(x =>
      (x.severity === 'block' || x.severity === 'wait') && !seen.has(x.key)))
  }

  if (next >= MILESTONES.indexOf('Approval')) {
    if (!(proposal?.terms || []).length) b.push({ key: 'terms', severity: 'block', text: 'Proposal commercial terms must be completed' })
    if (!(proposal?.bom || []).length && ['Project', 'Spares'].includes(opp.route)) b.push({ key: 'bom', severity: 'block', text: 'Proposal must contain priced BoQ lines' })
  }

  // Diagram 02 §5 — the layered approval, mandatory before the first dispatch
  // and repeated for every revision. All three must clear before a quote is
  // "Ready for Dispatch".
  if (next >= MILESTONES.indexOf('Submitted')) {
    // §5A is drawn as "LJS OR AN" and §5B as "AH ONLY", so 5A names both roles
    // and marks itself `anyOf` — either technical approver alone clears it.
    const gates = [
      { type: APPROVAL_5A, key: 'tech-approval', label: 'Technical approval (LJS or AN)', approver: 'LJS', needed: ['LJS', 'AN'], anyOf: true },
      { type: APPROVAL_5B, key: 'comm-approval', label: 'Commercial approval (AH)', approver: 'AH', needed: ['AH'] },
      // Final quote release is a joint commercial decision. Both named
      // approvers must sign off before the customer-facing proposal can go out.
      { type: APPROVAL_5C, key: 'release', label: 'Final quote release', approver: 'LJS', needed: ['LJS', 'AH'] },
    ]
    for (const g of gates) {
      const { approved, pending: waiting } = approvalForRev(g.type, proposal, approvals, opp.id)
      if (approved) continue
      b.push({
        key: g.key, severity: waiting ? 'wait' : 'block', approver: g.approver,
        approvalType: g.type, needed: g.needed, anyOf: !!g.anyOf,
        text: waiting ? `${g.label} is awaiting approval` : `${g.label} is required`,
      })
    }
    const conditions = mine.flatMap(a => a.status === 'Approved with conditions' ? (a.conditions || []) : []).filter(c => !c.incorporated)
    if (conditions.length) b.push({ key: 'conditions', severity: 'block', text: 'All approval conditions must be incorporated and confirmed' })
  }

  if (next >= MILESTONES.indexOf('PO Validation') && !(state.poCompare || {})[opp.id]?.received) {
    b.push({ key: 'po', severity: 'block', text: 'A customer PO must be received before PO validation' })
  }
  if (next >= MILESTONES.indexOf('Handover')) {
    const po = (state.poCompare || {})[opp.id]
    // store.acceptPO records each signature under the approving role, so the
    // joint acceptance the workflow asks for is LJS *and* AH.
    if (!po?.acceptance?.LJS || !po?.acceptance?.AH) b.push({ key: 'po-acceptance', severity: 'block', text: 'PO must be jointly accepted by LJS and AH' })
  }
  // An approved exception is scoped to this exact target and blocker. It
  // never clears a different stage or a different requirement — and it never
  // clears §5 at all: the diagram's layered approval has one "No" branch,
  // Return for Revision, so technical, commercial and release must be given,
  // not waived.
  const exceptions = (state.approvals || []).filter(a =>
    a.type === 'Milestone exception' && a.oppId === opp.id
    && a.targetMilestone === target
    && ['Approved', 'Approved with conditions'].includes(a.status))
  return b.filter(item => NO_EXCEPTION.includes(item.key)
    || !exceptions.some(a => a.blockerKey === item.key))
}
