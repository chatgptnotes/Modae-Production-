// Readiness gates for sending a proposal out, per the Aug 10 review:
// Red customers need LJS clearance, commercial deviations need AH approval,
// and "approved with conditions" decisions block until the salesperson
// confirms each condition is incorporated in the proposal.
//
// Blocker shape: { key, severity: 'block'|'wait'|'info', text,
//                  approvalType?, approver?, approvalId?, condIdx?, kyc? }

import { unitCostINR, unitSellINR } from './utils.js'
import { defaultCosting } from './seed.js'

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
  if (!proposal) return { value: 0, cogs: 0, gmPct: 0 }
  const costing = { ...defaultCosting, ...(proposal.costing || {}) }
  const units = proposal.units || 7
  let value = 0
  let cogs = 0
  for (const l of proposal.bom || []) {
    const q = lineQty(l, units)
    const isBnk = (l.list || 'BNK') === 'BNK'
    const sell = l.quoted !== '' && l.quoted != null
      ? +l.quoted
      : unitSellINR(l.listPrice || 0, costing, l.currency || 'EUR', isBnk)
    value += sell * q
    cogs += unitCostINR(l.listPrice || 0, costing, l.currency || 'EUR', isBnk) * q
  }
  const gmPct = value ? ((value - cogs) / value) * 100 : 0
  return { value, cogs, gmPct }
}

// Commercial approval routing from the Admin thresholds: healthy margin and
// discount → LJS releases directly; a notch below → LJS approval; anything
// worse → joint LJS + AH.
export function commercialGate(opp, proposal, config) {
  const { value, cogs, gmPct } = computeProposalTotals(proposal)
  const disc = proposal?.discountPct || 0
  const t = config?.approvalThresholds || { gmAuto: 25, discAuto: 5, gmLjs: 20, discLjs: 10 }
  if (gmPct >= t.gmAuto && disc <= t.discAuto) {
    return { gmPct, disc, value, cogs, needed: ['LJS'], label: 'LJS final release' }
  }
  if (gmPct >= t.gmLjs && disc <= t.discLjs) {
    return { gmPct, disc, value, cogs, needed: ['LJS'], label: 'LJS approval' }
  }
  return { gmPct, disc, value, cogs, needed: ['LJS', 'AH'], label: 'LJS + AH approval' }
}

// Full workbench readiness: everything oppBlockers raises, plus KYC, the
// Amber pre-quote fee, and route-specific checks (spares part matching /
// price sources, service travel confirmation, empty BoQ).
export function readiness(opp, proposal, state) {
  if (!opp) return []
  const b = [...oppBlockers(opp, proposal, state.approvals || [])]

  if (opp.customerStatus === 'Blue' && !opp.kycOverride) {
    const items = (state.kyc || {})[opp.sellTo]
    const unverified = !items || !items.length
      || items.some(k => k.state === 'Missing' || k.state === 'Expired')
    if (unverified) {
      b.push({
        key: 'kyc-block', severity: 'block', kyc: true,
        text: 'KYC verification pending (AH) — or override with reason',
      })
    }
  }

  if (opp.customerStatus === 'Amber' && opp.amberFeePaid !== true) {
    b.push({ key: 'amber-fee', severity: 'info', text: 'Amber ₹25K pre-quote fee pending' })
  }

  if (opp.route === 'Spares') {
    for (const l of (state.sparesLines || []).filter(x => x.oppId === opp.id)) {
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
      b.push({ key: 'red-wait', severity: 'wait', text: 'Red customer clearance awaiting LJS decision.' })
    } else {
      b.push({
        key: 'red', severity: 'block',
        text: 'Red customer — high risk / unpaid record. LJS clearance required before any proposal goes out.',
        approvalType: 'Red customer clearance', approver: 'LJS',
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
