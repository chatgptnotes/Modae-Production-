// Readiness gates for sending a proposal out, per the Aug 10 review:
// Red customers need LJS clearance, commercial deviations need AH approval,
// and "approved with conditions" decisions block until the salesperson
// confirms each condition is incorporated in the proposal.
//
// Blocker shape: { key, severity: 'block'|'wait'|'info', text,
//                  approvalType?, approver?, approvalId?, condIdx?, kyc? }

import { unitCostINR, unitSellINR } from './utils.js'
import { defaultCosting, MILESTONES } from './seed.js'
import { applyAdjustment, normalizeMarkupPct, sparesLineFinancials } from './pricing.js'
import { isPlaceholderSparesLine } from './proposal/sparesBoq.js'
import { classRule, classOrder, noExceptionKeys } from './customerClasses.js'
import { needsCommercialApproval, needsCommercialDecision, needsCommercialResolution, commercialApprovalDetails, isLegacyCommercialClarification, isCommercialConfirmationRow, isDeliveryBasisClarification, sourceContainsDeliveryRequirement } from './commercialTerms.js'
import { clarificationTopic } from './leadClarification.js'
import { approvalAffectedByProposal, pricingExceptionSignature, proposalImpact } from './approvalMemory.js'

// A customer answer is complete when it contains a response and does not
// leave an explicit missing-information note. AI field mapping review is an
// internal follow-up and must not keep a complete customer answer from moving
// the opportunity forward.
export const isClarificationResolved = clarification => {
  if (!clarification) return false
  if (clarification.status === 'Needs review') return false
  if (clarification.status === 'Answered') return true
  return !!String(clarification.response || '').trim()
    && !String(clarification.missing || '').trim()
}

// A clarification topic can reach state through more than one import or AI
// suggestion. One customer response resolves that fact; duplicate records stay
// in the audit trail but must not leave a hidden open copy blocking Proposal.
const clarificationSourceText = (opp, state = {}) => {
  const sourceLead = [...(state.leads || []), ...(state.leadArchive || [])]
    .find(lead => lead.id === opp?.sourceLeadId || lead.oppId === opp?.id)
  return [sourceLead?.subject, sourceLead?.body, opp?.remarks, opp?.oppName]
    .filter(Boolean).join(' ')
}

export const isClarificationCoveredBySource = (opp, clarification, state = {}) =>
  sourceContainsDeliveryRequirement(clarificationSourceText(opp, state))
  && isDeliveryBasisClarification(clarification)

const clarificationRows = (opp, state = {}, excludeSourceCovered = false) => {
  if (!opp) return []
  return (state.clarifications || []).filter(clarification => clarification.oppId === opp.id
    && !isLegacyCommercialClarification(clarification)
    && !isCommercialConfirmationRow(clarification)
    && !(excludeSourceCovered && isClarificationCoveredBySource(opp, clarification, state)))
}

export function displayClarifications(opp, state = {}) {
  return clarificationRows(opp, state)
}

export function actionableClarifications(opp, state = {}) {
  return clarificationRows(opp, state, true)
}

// A lead-stage verification snapshot of the shape this class records satisfies
// the opportunity-stage gate — the salesperson is not asked to verify twice.
const isLeadVerified = (opp, rule) =>
  !!rule?.verification?.snapshot
  && opp?.leadVerification?.type === rule.verification.snapshot.type
  && opp.leadVerification.status === rule.verification.snapshot.status

function customerChecklistComplete(opp, state, rule) {
  if (isLeadVerified(opp, rule)) return true
  const items = (state.kyc || {})[opp.sellTo]
  return !!items?.length && items.every(item => item.state === 'Verified')
}

// Whether the evidence a class gate names has actually been provided.
function gateSatisfied(opp, state, rule, gate, approvedFn) {
  if (gate.evidence === 'customerKycChecklist') return customerChecklistComplete(opp, state, rule)
  if (gate.evidence === 'approval') return !!approvedFn?.(gate.approvalType)
  if (gate.evidence) return opp[gate.evidence] === true
  return true
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
    // Spares sourcing is the authority for purchase cost. Reuse its shared
    // financials so supplier discounts, FX, import factors, and explicit
    // base-cost overrides produce the same COGS on Proposal and Sourcing.
    if (proposal.route === 'Spares') {
      cogs += sparesLineFinancials({
        ...l,
        qty: q,
        listUnitPrice: l.listUnitPrice ?? l.listPrice,
        priceList: l.priceList || l.list,
      }, costing).cogsINR
    } else {
      const baseCost = l.baseCost == null
        ? unitCostINR(l.listPrice || 0, costing, l.currency || 'EUR', isBnk)
        : Math.max(0, Number(l.baseCost) || 0)
      cogs += baseCost * q
    }
  }
  const gmPct = value ? ((value - cogs) / value) * 100 : 0
  return { value, listValue, cogs, gmPct }
}

// Pricing exceptions are checked independently of the margin matrix. They are
// configurable commercial controls and apply to both proposal-level pricing
// and line-level pricing (including the spares sourcing workbench).
export function pricingThresholdExceptions(opp, proposal, state = {}) {
  const thresholds = state.config?.approvalThresholds || {}
  const discountPct = Number.isFinite(Number(thresholds.discountPct)) ? Number(thresholds.discountPct) : 5
  const markupPct = Number.isFinite(Number(thresholds.markupPct)) ? Number(thresholds.markupPct) : 10
  const rows = []
  const seen = new Set()
  const add = (row, label) => {
    const discount = Number(row?.discountPct) || 0
    const markup = normalizeMarkupPct(row?.markupPct)
    const key = `${label}|${discount}|${markup}|${discountPct}|${markupPct}`
    if ((discount > discountPct || markup > markupPct) && !seen.has(key)) {
      seen.add(key)
      rows.push({ label, discount, markup, discountPct, markupPct })
    }
  }
  add(proposal, 'Proposal pricing')
  ;(proposal?.bom || []).forEach((line, i) => add(line, line.pn || line.custRef || line.desc || `Line ${i + 1}`))
  if (opp?.route === 'Spares') {
    ;(state.sparesLines || []).filter(line => line.oppId === opp.id && !line.removedFromSourcing && (line.qty == null || Number(line.qty) > 0) && !isPlaceholderSparesLine(line))
      .forEach(line => add(line, line.pn || line.custRef || line.desc || line.id))
  }
  // A Path A offer has no proposal to carry a discount — the negotiated rate sits
  // on the service estimate, so the same thresholds are read straight off it.
  if (opp?.route === 'Service') {
    const est = (state.svcEstimates || []).find(e => e.oppId === opp.id)
    if (est) add({ discountPct: est.rateDiscountPct }, 'Service rate sheet')
  }
  return { discountPct, markupPct, rows }
}

function pricingApprovers(state) {
  const configured = state.config?.approvalThresholds?.pricingApprovers
  const roles = Array.isArray(configured) ? configured.filter(Boolean) : ['AH', 'LJS']
  return roles.length ? roles : ['AH', 'LJS']
}

// A pricing approval is remembered by its pricingExceptionSignature — the
// offending rows it was decided on — so unrelated proposal edits or a revision
// bump do not void it. Legacy rows fall back to the snapshot check, then to
// revision stamping.
export function pricingApprovalFor(opp, proposal, approvals, pricingRows = []) {
  const rev = String(proposal?.revision ?? '')
  const signature = pricingExceptionSignature(pricingRows)
  return (approvals || []).find(a => a.status !== 'Cancelled' && a.oppId === opp.id && a.type === 'Pricing threshold exception'
    && (a.pricingSignature
      ? a.pricingSignature === signature
      : (a.approvalSnapshot
        ? !approvalAffectedByProposal(a, a.type, proposal, opp)
        : (a.rev == null || String(a.rev) === rev))))
}

// A Service opportunity now runs the same §5 stack as a project — technical,
// commercial and the margin matrix (decision, 22 Sep). The one carve-out is
// Path A while it is selling at published rates: the standard rate schedule is
// a rate card, not a negotiated price, so there is nothing for an approver to
// decide. Discount it and the full matrix applies.
export function serviceMatrixExempt(opp, state) {
  if (opp?.route !== 'Service') return false
  const est = (state?.svcEstimates || []).find(e => e.oppId === opp.id) || {}
  if ((est.offerMode || est.aiOfferMode) !== 'Standard Rate Sheet') return false
  return !(Number(est.rateDiscountPct) > 0)
}

// Opportunities raised before that decision carry a single 'Service offer
// review' instead. They keep running on it rather than stranding mid-flight.
export const legacyServiceReview = (opp, approvals) => (opp?.route === 'Service'
  ? (approvals || []).find(a => a.oppId === opp.id && a.type === 'Service offer review' && a.status !== 'Cancelled') || null
  : null)

// Is this service offer cleared to go in front of the customer? Three regimes,
// one answer, so the panels do not each re-derive the policy: a published-rate
// Path A offer needs no clearance, a legacy opportunity needs its single review,
// and everything else needs the §5 release.
export function serviceOfferCleared(opp, proposal, state) {
  if (serviceMatrixExempt(opp, state)) return true
  const legacy = legacyServiceReview(opp, state?.approvals)
  if (legacy) return ['Approved', 'Approved with conditions'].includes(legacy.status)
  return !!releaseState(proposal, state?.approvals, opp?.id, opp).release
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
  const b = [...oppBlockers(opp, proposal, state.approvals || [], state.config)]

  // Diagram 01's Amber lane makes the pre-quote fee a condition of proceeding,
  // and transitionBlockers blocks Registration on it. Readiness said `info`,
  // so the same unpaid fee read as advisory on one panel and blocking on the
  // other. It blocks in both.
  const classGate = classRule(state.config, opp.customerStatus)?.gate
  if (classGate?.readiness) {
    const rule = classRule(state.config, opp.customerStatus)
    const overridden = classGate.overrideField && opp[classGate.overrideField]
    if (!overridden && !gateSatisfied(opp, state, rule, classGate)) {
      b.push({ ...classGate.readiness })
    }
  }

  // Proposal transition and readiness must agree about customer clarifications.
  // Keep unanswered, sent, and review-needed questions visible as blockers so
  // the green readiness summary cannot contradict the transition dialog.
  const openClarifications = actionableClarifications(opp, state)
    .filter(c => !isClarificationResolved(c))
  if (openClarifications.length) {
    b.push({
      key: 'clarifications', severity: 'block',
      text: 'All customer clarifications must be resolved before moving to Proposal',
    })
  }

  if (opp.route === 'Spares') {
    for (const l of (state.sparesLines || []).filter(x => x.oppId === opp.id && !x.removedFromSourcing && (x.qty == null || Number(x.qty) > 0) && !isPlaceholderSparesLine(x))) {
      if (!l.confirmed) {
        b.push({ key: `sp-conf-${l.id}`, severity: 'block', text: `Unconfirmed part match — ${l.custRef || l.pn}` })
      } else if (l.priceState === 'Needs pricing') {
        b.push({ key: `sp-price-${l.id}`, severity: 'block', text: `Pricing required — select a price-list part or apply an approved quote (${l.pn || l.custRef})` })
      } else if (l.priceState === 'Expired') {
        b.push({ key: `sp-price-${l.id}`, severity: 'block', text: `Expired price source — request price update (${l.pn})` })
      }
    }
  }

  if (opp.route === 'Service') {
    const est = (state.svcEstimates || []).find(e => e.oppId === opp.id)
    // Until 22 Sep an unconditional 'Service offer review' blocker stood here and
    // incidentally covered this. Confirming the scope and the offer path is the
    // salesperson's own step, so it is stated in its own right.
    if (!est?.scopeConfirmed) {
      b.push({ key: 'svc-scope', severity: 'block', text: 'Service scope and offer path not confirmed' })
    }
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
    // A review already in flight still governs its own opportunity. Everything
    // raised since runs the §5 stack instead, which transitionBlockers applies,
    // so nothing extra is demanded here.
    const serviceReview = legacyServiceReview(opp, state.approvals)
    if (serviceReview && !['Approved', 'Approved with conditions'].includes(serviceReview.status)) {
      b.push({
        key: 'service-review', severity: serviceReview.status === 'Pending' ? 'wait' : 'block',
        text: serviceReview.status === 'Pending' ? 'Service offer review is awaiting AH + LJS' : 'One Service offer review is required before the proposal can proceed',
        approvalType: 'Service offer review', approver: 'AH', needed: ['AH', 'LJS'], anyOf: false,
      })
    }
  }





  if ((opp.route === 'Spares' || opp.route === 'Project') && !(proposal?.bom || []).length) {
    b.push({ key: 'no-bom', severity: 'block', text: 'No priced lines in proposal' })
  }

  const pricing = pricingThresholdExceptions(opp, proposal, state)
  if (pricing.rows.length) {
    const approval = pricingApprovalFor(opp, proposal, state.approvals, pricing.rows)
    const approved = approval && ['Approved', 'Approved with conditions'].includes(approval.status)
    if (!approved) {
      const pending = approval?.status === 'Pending'
      const approvers = pricingApprovers(state)
      b.push({
        key: 'pricing-threshold', severity: pending ? 'wait' : 'block',
        text: pending ? `Pricing threshold approval is awaiting ${approvers.join(' or ')}` : `Pricing threshold approval required from ${approvers.join(' or ')}`,
        approvalType: 'Pricing threshold exception', approver: approvers[0], needed: approvers, anyOf: approvers.length > 1,
        rev: String(proposal?.revision ?? ''), pricingRows: pricing.rows,
      })
    }
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

export function oppBlockers(opp, proposal, approvals, config = null) {
  if (!opp) return []
  const b = []
  const mine = approvals.filter(a => a.oppId === opp.id)
  const currentApproval = (approval, type) => approval.approvalSnapshot
    ? !approvalAffectedByProposal(approval, type, proposal, opp)
    : true
  const hasApproved = type => mine.some(a => a.type === type
    && currentApproval(a, type)
    && (a.status === 'Approved' || a.status === 'Approved with conditions'))
  const hasOpen = type => mine.some(a => a.type === type && currentApproval(a, type) && a.status === 'Pending')

  // The customer-class advisory row. `needed` matters on a joint gate: without
  // it, requestBlockerApproval builds the gate from `approver` alone, and a Red
  // clearance raised off this blocker would clear on LJS by himself — bypassing
  // the AH half of the joint decision that transitionBlockers and the inbox
  // both demand. Classes with no approval type of their own (Blue) carry
  // neither, exactly as before.
  const advisory = classRule(config, opp.customerStatus)?.advisory
  if (advisory && !(advisory.approvalType && hasApproved(advisory.approvalType))) {
    const waiting = advisory.approvalType && hasOpen(advisory.approvalType)
    if (waiting && advisory.waitKey) {
      b.push({ key: advisory.waitKey, severity: advisory.waitSeverity || 'wait', text: advisory.waitText })
    } else if (!waiting) {
      b.push({
        key: advisory.key, severity: advisory.severity, text: advisory.text,
        ...(advisory.approvalType ? { approvalType: advisory.approvalType } : {}),
        ...(advisory.approvers?.length
          ? { approver: advisory.approvers[0], ...(advisory.approvers.length > 1 ? { needed: [...advisory.approvers] } : {}) }
          : {}),
      })
    }
  }

  // Legacy proposal rows used status=Deviation without the newer decision
  // field; keep those rows on the same AH approval path while new rows use the
  // explicit Match/Counter-offer decision.
  const devs = (proposal?.terms || []).filter(term => needsCommercialApproval(term) || (term?.status === 'Deviation' && !term?.decision))
  const undecided = (proposal?.terms || []).filter(needsCommercialDecision)
  if (undecided.length) {
    b.push({ key: 'commercial-decision', severity: 'block', text: `Choose Match customer terms or Counter-offer with ModAE standard terms for ${undecided.map(d => d.term).join(', ')} before approval.` })
  }
  if (devs.length && !hasApproved('Commercial deviation')) {
    if (hasOpen('Commercial deviation')) {
      b.push({ key: 'dev-wait', severity: 'wait', text: 'Commercial-deviation approval awaiting AH decision.' })
    } else {
      b.push({
        key: 'dev', severity: 'block',
        text: `${devs.length} commercial deviation${devs.length > 1 ? 's' : ''} (${devs.map(d => d.term).join(', ')}) need${devs.length > 1 ? '' : 's'} approval before submission.`,
        approvalType: 'Commercial deviation', approver: 'AH', deviationDetails: commercialApprovalDetails(proposal?.terms),
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

  // Any other pending request (e.g. amber terms sent for approval).  Section
  // 5 approvals deliberately stay out of this early-readiness list: they gate
  // customer submission, not the move from Proposal into Approval.  Their
  // current revision/snapshot is evaluated by transitionBlockers at Submitted;
  // otherwise an obsolete release request can strand a fully approved quote.
  for (const a of mine.filter(x => x.status === 'Pending'
    && !['Red customer clearance', 'Commercial deviation', APPROVAL_5A, APPROVAL_5B, APPROVAL_5C].includes(x.type))) {
    b.push({ key: `wait-${a.id}`, severity: 'wait', text: `${a.type} awaiting ${a.approver} decision.` })
  }

  return b
}

export const isBlocked = blockers => blockers.some(x => x.severity === 'block' || x.severity === 'wait')

// The three §5 approvals — technical, commercial and margin — cover the
// proposal revision they were raised against. Commercial-deviation approvals
// are the exception: they can carry forward when the current proposal still
// has the same approved deviation terms. Approvals written before `rev`
// existed are treated as covering the current revision.
export const APPROVAL_5A = 'Technical approval'
export const APPROVAL_5B = 'Commercial approval'
export const APPROVAL_5C = 'Final quote release'
const COMMERCIAL_DEVIATION = 'Commercial deviation'

const deviationTermKey = value => {
  const text = String(value || '').toLowerCase()
  if (/payment|credit|advance/.test(text)) return 'payment'
  if (/delivery|lead\s*time|schedule/.test(text)) return 'delivery'
  if (/warranty|guarantee|defect/.test(text)) return 'warranty'
  return ''
}

const commercialApprovalCoversProposal = (approval, proposal) => {
  // Raw status filter, deliberately: §5B signs off the whole commercial
  // position for its legacy/submission compatibility path. Requirement
  // Validation scopes the comparison to matched terms separately above.
  const currentTerms = (proposal?.terms || [])
    .filter(term => term.status === 'Deviation')
    .map(term => deviationTermKey(term.term))
    .filter(Boolean)
  if (!currentTerms.length) return true
  const approvedTerms = (approval.deviationDetails || [])
    .map(term => deviationTermKey(term.term))
    .filter(Boolean)
  if (!approvedTerms.length) return false
  return currentTerms.every(term => approvedTerms.includes(term))
}

// The §5 blocker keys, which a milestone exception must never clear.
// A milestone exception may never waive these. The §5 approvals were always
// here; `red-clearance` joins them because the Red gate is a joint LJS + AH
// decision about whether to trade with the customer at all — not a schedule
// concession one approver can sign away.
export const NO_EXCEPTION = noExceptionKeys()

const commercialDetailValue = value => String(value ?? '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim()

// Requirement Validation approvals created before the commercial-detail fix
// may have an empty deviationDetails array. Their approvalSnapshot still
// records the signed commercial terms, so use it as a compatibility source.
const recordedCommercialDetails = approval => {
  if (approval?.deviationDetails?.length) return approval.deviationDetails
  return (approval?.approvalSnapshot?.commercial?.terms || [])
    .filter(term => commercialDetailValue(term.status) === 'deviation')
    .map(term => ({ term: term.term, customerAsk: term.text }))
}

const commercialApprovalCoversTerms = (approval, terms) => {
  const expected = commercialApprovalDetails(terms)
  const recorded = recordedCommercialDetails(approval)
  return expected.length > 0 && expected.every(item => recorded.some(saved =>
    commercialDetailValue(saved.term) === commercialDetailValue(item.term)
    && (!commercialDetailValue(item.customerAsk)
      || commercialDetailValue(saved.customerAsk) === commercialDetailValue(item.customerAsk))))
}

export function approvalForRev(type, proposal, approvals, oppId, opportunity) {
  const rev = String(proposal?.revision ?? '')
  const mine = (approvals || []).filter(a =>
    a.oppId === oppId
    && (a.type === type || (type === APPROVAL_5B && a.type === COMMERCIAL_DEVIATION))
    // Final release has one deliberately simple identity: opportunity plus
    // quote revision. Explanatory copy and snapshot bookkeeping must never
    // create a second gate for the same revision.
    && (type === APPROVAL_5C
      ? (a.rev == null || String(a.rev) === rev)
      : a.approvalSnapshot
      ? !approvalAffectedByProposal(a, type, proposal, opportunity)
      : (type === APPROVAL_5B
        ? (a.rev == null || commercialApprovalCoversProposal(a, proposal))
        : (a.rev == null || String(a.rev) === rev))))
  return {
    pending: mine.find(a => a.status === 'Pending') || null,
    approved: mine.find(a => ['Approved', 'Approved with conditions'].includes(a.status)) || null,
  }
}

// The §5C release, kept under its original name — it is the gate the
// submission panel and the proposal builder read.
export function releaseState(proposal, approvals, oppId, opportunity) {
  const { pending, approved } = approvalForRev(APPROVAL_5C, proposal, approvals, oppId, opportunity)
  return { pending, release: approved, reason: approved ? '' : releaseVoidReason(proposal, approvals, oppId, opportunity) }
}

// Why the customer-submission gate is still closed. Returns '' when there is
// nothing to explain (release approved, or nothing requested yet). The
// Submitted step and the transition dialog both render this verbatim — a
// green "Approved" row in the Approvals list while the panel stays locked is
// exactly the confusion this exists to prevent.
export function releaseVoidReason(proposal, approvals, oppId, opportunity) {
  const rev = String(proposal?.revision ?? '')
  const all = (approvals || []).filter(a => a.oppId === oppId && a.type === APPROVAL_5C)
  const mine = all.filter(a => a.rev == null || String(a.rev) === rev)
  const pending = mine.find(a => a.status === 'Pending')
  if (pending) {
    const needed = pending.needed?.length ? pending.needed : [pending.approver].filter(Boolean)
    const remaining = needed.filter(role => !(pending.decisions || {})[role])
    return `Release ${pending.id} is awaiting ${remaining.join(' + ') || 'the approvers'}.`
  }
  const prior = all.find(a => ['Approved', 'Approved with conditions'].includes(a.status))
  if (prior) {
    return `Release ${prior.id} approved revision ${prior.rev || 'legacy'}, but the current quote is revision ${rev || 'unversioned'} — release this revision.`
  }
  return ''
}

// All three §5 gates in one call, for the "All Approvals Completed" box.
export function approvalSet(proposal, approvals, oppId, opportunity) {
  const types = [APPROVAL_5A]
  if ((proposal?.terms || []).some(needsCommercialApproval)) types.push(APPROVAL_5B)
  types.push(APPROVAL_5C)
  return types.map(type => ({
    type, ...approvalForRev(type, proposal, approvals, oppId, opportunity),
  }))
}

export function serviceApprovalSet(approvals, oppId, proposal, opportunity) {
  const mine = (approvals || []).filter(a => a.oppId === oppId && a.type === 'Service offer review')
    .filter(a => a.approvalSnapshot
      ? !approvalAffectedByProposal(a, 'Service offer review', proposal, opportunity)
      : true)
  return [{
    type: 'Service offer review',
    pending: mine.find(a => a.status === 'Pending') || null,
    approved: mine.find(a => ['Approved', 'Approved with conditions'].includes(a.status)) || null,
  }]
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
  const required = (state.config?.workflowRequiredFields?.length
    ? state.config.workflowRequiredFields.map(item => [item.field, item.text])
    : [
      ['sellTo', 'Customer is required'], ['eucName', 'EUC name is required'], ['eucLocation', 'EUC location is required'],
      ['oppName', 'Opportunity name is required'], ['owner', 'Opportunity owner is required'], ['route', 'Opportunity route is required'],
      ['contactPerson', 'Customer contact person is required'], ['contactPhone', 'Customer contact phone is required'],
    ]).filter(([field, text]) => field && text)
  required.forEach(([field, text]) => { if (!opp[field]) b.push({ key: `required-${field}`, severity: 'block', text }) })

  const approvals = state.approvals || []
  const mine = approvals.filter(a => a.oppId === opp.id)
  const approved = type => mine.some(a => a.type === type && ['Approved', 'Approved with conditions'].includes(a.status))
  const pending = type => mine.some(a => a.type === type && a.status === 'Pending')
  // The customer-class gate, at whichever milestone its class declares.
  // `approvalType` matters as much as `needed`: without it Workbench treats
  // this as exception-eligible and offers a Milestone exception instead, which
  // waived the Red gate outright — the opportunity moved past Registration
  // with no clearance record in existence. With it, the real approval is
  // requested, and NO_EXCEPTION refuses the waiver at the model layer too.
  const classGate = classRule(state.config, opp.customerStatus)?.gate
  if (classGate && next >= MILESTONES.indexOf(classGate.milestone)) {
    const rule = classRule(state.config, opp.customerStatus)
    const overridden = classGate.overrideField && opp[classGate.overrideField]
    if (!overridden && !gateSatisfied(opp, state, rule, classGate, approved)) {
      const waiting = classGate.approvalType && pending(classGate.approvalType)
      b.push({
        key: classGate.key,
        severity: waiting ? 'wait' : classGate.severity,
        text: waiting ? (classGate.waitText || classGate.text) : classGate.text,
        ...(classGate.approvers?.length ? { approver: classGate.approvers[0] } : {}),
        ...(classGate.approvalType
          ? { approvalType: classGate.approvalType, needed: [...classGate.approvers], anyOf: !!classGate.anyOf }
          : {}),
      })
    }
  }

  const clarifications = actionableClarifications(opp, state)
  if (next >= MILESTONES.indexOf('Sourcing') && clarifications.some(c => !isClarificationResolved(c))) {
    b.push({ key: 'clarifications', severity: 'block', text: `All customer clarifications must be resolved before moving to ${target}` })
  }

  // Requirement Validation owns the commercial hand-off. Every deviation must
  // have a resolved customer-facing position before Sourcing; a counter-offer
  // is not resolved until the customer accepts it. Matching customer terms is
  // additionally an AH decision and must be approved before the hand-off.
  if (next >= MILESTONES.indexOf('Sourcing')) {
    const commercialTerms = proposal?.terms || []
    const unresolved = commercialTerms.filter(needsCommercialResolution)
    if (unresolved.length) {
      b.push({
        key: 'commercial-decision', severity: 'block',
        text: `Resolve commercial decisions for ${unresolved.map(term => term.term).join(', ')} before moving to ${target}`,
      })
    }
    const matched = commercialTerms.filter(needsCommercialApproval)
    if (matched.length) {
      // Scope the hand-off check to the matched terms. Approval requests carry
      // a full proposal snapshot, so comparing that snapshot to only matched
      // terms would incorrectly reopen approval when an accepted counter-offer
      // is also present.
      const matchingApproval = approvals
        .filter(approval => approval.oppId === opp.id
          && (approval.type === APPROVAL_5B || approval.type === 'Commercial deviation')
          && (approval.rev == null || String(approval.rev) === String(proposal?.revision ?? ''))
          && commercialApprovalCoversTerms(approval, matched))
      const approved = matchingApproval.find(approval => ['Approved', 'Approved with conditions'].includes(approval.status))
      const waiting = matchingApproval.find(approval => approval.status === 'Pending')
      if (!approved) {
        b.push({
          key: 'commercial-approval', severity: waiting ? 'wait' : 'block',
          approvalType: 'Commercial deviation', approver: 'AH', needed: ['AH'], anyOf: false,
          text: waiting
            ? `AH commercial approval is awaiting a decision for ${matched.map(term => term.term).join(', ')}`
            : `AH commercial approval is required for ${matched.map(term => term.term).join(', ')} before moving to ${target}`,
        })
      }
    }
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
  // and repeated for every revision. All applicable gates must clear before a
  // quote is "Ready for Dispatch".
  if (next >= MILESTONES.indexOf('Submitted')) {
    // §5A is drawn as "LJS OR AN" and §5B as "AH ONLY", so 5A names both roles
    // and marks itself `anyOf` — either technical approver alone clears it.
    const hasCommercialDeviation = (proposal?.terms || []).some(needsCommercialApproval)
    const configuredGates = (state.config?.approvalRules || [])
      .filter(rule => !rule.routes?.length || rule.routes.includes(opp?.route))
      .filter(rule => rule.enabled !== false)
      // Section 5B is an exception approval for customer terms that ModAE has
      // agreed to match. Standard ModAE terms do not need a separate AH gate.
      .filter(rule => rule.type !== APPROVAL_5B || hasCommercialDeviation)
      .map(rule => ({
        type: rule.type, key: rule.key, label: rule.label || rule.type,
        approver: rule.approver, needed: rule.needed || [], anyOf: !!rule.anyOf,
      }))
    // Service runs the same layered approval as a project. Two exceptions: an
    // opportunity still carrying the older single review runs on that, and a
    // Path A offer at published rates needs no §5 approval at all.
    const legacyReview = legacyServiceReview(opp, approvals)
    const gates = configuredGates.length ? configuredGates
      : legacyReview ? [
        { type: 'Service offer review', key: 'service-review', label: 'Service offer review', approver: 'AH', needed: ['AH', 'LJS'] },
      ]
      : serviceMatrixExempt(opp, state) ? []
      : [
        ...(opp?.route === 'Spares' ? [] : [
          { type: APPROVAL_5A, key: 'tech-approval', label: 'Technical approval (LJS or AN)', approver: 'LJS', needed: ['LJS', 'AN'], anyOf: true },
        ]),
        ...(hasCommercialDeviation ? [
          { type: APPROVAL_5B, key: 'comm-approval', label: 'Commercial approval (AH)', approver: 'AH', needed: ['AH'] },
        ] : []),
        { type: APPROVAL_5C, key: 'release', label: 'Final quote release', approver: 'LJS', needed: ['LJS', 'AH'] },
      ]
    for (const g of gates) {
      const { approved, pending: waiting } = approvalForRev(g.type, proposal, approvals, opp.id, opp)
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
