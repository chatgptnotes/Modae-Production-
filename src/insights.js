// Derived intelligence that the AI & Automation map advertises. Everything here
// is deterministic and testable — no model call — but it is real behaviour, not
// catalogue text. The map labels these "Rule-based" so nobody is told a model
// ran when one did not.

import { ageDays } from './utils.js'
import { classRule } from './customerClasses.js'

// ---------------------------------------------------------- customer health
// A relationship read from what the app already knows: how the account is
// classed, whether its KYC stands up, how it pays, and how its opportunities
// have actually closed. Returns a 0-100 score with the reasons that moved it,
// so the sales team can argue with it rather than just accept a number.
const CLASS_BASE = { Green: 82, Blue: 60, Amber: 48, Red: 22 }

export function customerHealth(customer, opportunities = []) {
  if (!customer) return null
  const reasons = []
  let score = CLASS_BASE[customer.status] ?? 50
  reasons.push({ delta: 0, why: `${customer.status} account` })

  const kyc = String(customer.kyc || '')
  if (/valid/i.test(kyc)) { score += 6; reasons.push({ delta: +6, why: 'KYC valid' }) }
  else if (/renewal/i.test(kyc)) { score -= 6; reasons.push({ delta: -6, why: 'KYC renewal due' }) }
  else if (/pending|missing/i.test(kyc)) { score -= 12; reasons.push({ delta: -12, why: 'KYC not on file' }) }

  const pay = String(customer.payment || '')
  const overdue = /overdue/i.test(pay)
  const avgDays = parseInt((pay.match(/(\d{2,3})\s*days/) || [])[1] || '', 10)
  if (overdue) { score -= 22; reasons.push({ delta: -22, why: `Payment ${pay.toLowerCase()}` }) }
  else if (/on time/i.test(pay)) { score += 8; reasons.push({ delta: +8, why: 'Pays on time' }) }
  else if (avgDays >= 90) { score -= 10; reasons.push({ delta: -10, why: `Pays in ~${avgDays} days` }) }
  else if (avgDays >= 60) { score -= 4; reasons.push({ delta: -4, why: `Pays in ~${avgDays} days` }) }

  const theirs = opportunities.filter(o => o.sellTo === customer.name)
  const won = theirs.filter(o => o.stage === 'Won').length
  const lost = theirs.filter(o => o.stage === 'Lost').length
  const open = theirs.filter(o => o.status === 'Open').length
  if (won + lost >= 2) {
    const rate = won / (won + lost)
    const delta = Math.round((rate - 0.4) * 20)
    if (delta) { score += delta; reasons.push({ delta, why: `${won} won / ${lost} lost with us` }) }
  }
  if (open === 0 && theirs.length > 0) {
    score -= 8
    reasons.push({ delta: -8, why: 'No open opportunity right now' })
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  const band = score >= 70 ? 'Healthy' : score >= 45 ? 'Watch' : 'At risk'
  return { score, band, reasons, open, won, lost }
}

// -------------------------------------------------------- duplicate leads
// Two enquiries for the same thing arriving twice — forwarded by two people, or
// chased by the customer — must not become two opportunities. Compares the
// buyer reference first (an exact match is conclusive), then sender plus
// subject overlap.
const STOP = new Set(['the', 'for', 'and', 'of', 'to', 'a', 'an', 'in', 'on', 'with', 're', 'fwd',
  'quotation', 'quote', 'enquiry', 'inquiry', 'rfq', 'required', 'request', 'please'])

const tokens = s => String(s || '').toLowerCase().match(/[a-z0-9][a-z0-9-]{1,}/g)?.filter(t => !STOP.has(t)) || []

const overlap = (a, b) => {
  const A = new Set(tokens(a))
  const B = new Set(tokens(b))
  if (!A.size || !B.size) return 0
  let hit = 0
  for (const t of A) if (B.has(t)) hit++
  return hit / Math.min(A.size, B.size)
}

const normRef = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export function findDuplicates(lead, leads = []) {
  if (!lead) return []
  const out = []
  for (const other of leads) {
    if (other.id === lead.id || other.status === 'Dropped') continue
    const ref = normRef(lead.ref || lead.rfqNumber)
    const otherRef = normRef(other.ref || other.rfqNumber)
    if (ref && ref === otherRef) {
      out.push({ leadId: other.id, confidence: 0.97, note: `Same buyer reference ${other.ref || other.rfqNumber}` })
      continue
    }
    const sameSender = lead.from && other.from
      && String(lead.from).toLowerCase() === String(other.from).toLowerCase()
    const subj = overlap(lead.subject, other.subject)
    if (sameSender && subj >= 0.5) {
      out.push({ leadId: other.id, confidence: Math.min(0.95, 0.6 + subj * 0.35), note: `Same sender, ${Math.round(subj * 100)}% subject overlap` })
    } else if (subj >= 0.8) {
      out.push({ leadId: other.id, confidence: subj * 0.8, note: `${Math.round(subj * 100)}% subject overlap` })
    }
  }
  return out.sort((a, b) => b.confidence - a.confidence).slice(0, 3)
}

// ------------------------------------------------- win-probability suggestion
// A suggestion only — the field stays human-editable, and the tracker shows the
// salesperson's own value whenever they have set one.
// Keys are seed.js STAGES.
const STAGE_BASE = {
  Lead: 'Low', RFI: 'Low', Budgetary: 'Low', RFQ: 'Medium',
  'Firm Bid': 'Medium', Negotiate: 'High', Won: 'High', Lost: 'Low',
}

export function suggestProbability(opp, proposal, config = null) {
  if (!opp) return null
  let level = STAGE_BASE[opp.stage] || 'Low'
  const why = [`${opp.stage} stage`]

  // A submitted proposal is real progress; a stalled one is not.
  if (proposal?.bom?.length && opp.proposalDate) {
    why.push('proposal issued')
    if (level === 'Low') level = 'Medium'
  }
  const age = ageDays(opp.lastUpdated)
  if (age != null && age > 45 && level === 'High') { level = 'Medium'; why.push(`no movement for ${age} days`) }
  else if (age != null && age > 45) why.push(`no movement for ${age} days`)

  // Each class may nudge the probability: a bias that lowers it wins outright,
  // one that raises it only rescues a Low on a still-live opportunity.
  const bias = classRule(config, opp.customerStatus)?.probabilityBias
  if (bias === 'Low') { level = 'Low'; why.push(`${opp.customerStatus} account`) }
  else if (bias && bias !== 'Low' && level === 'Low' && opp.stage !== 'Lost') {
    level = bias
    why.push(`${opp.customerStatus} account`)
  }
  return { level, why: why.join(' · ') }
}

// ------------------------------------------------------ escalation suggestion
// When a quote has gone quiet, say who should pick it up rather than leaving the
// salesperson to guess.
export function suggestEscalation(opp, blockers = []) {
  if (!opp || opp.status !== 'Open') return null
  const age = ageDays(opp.lastUpdated)
  const waiting = blockers.find(b => b.severity === 'wait')
  if (waiting) {
    return { to: waiting.approver || 'LJS', why: `Waiting on a decision: ${waiting.text}`, urgency: 'now' }
  }
  if (age == null || age <= 30) return null
  // The bigger the number, the higher it goes.
  const big = (+opp.valueK || 0) >= 5000
  return {
    to: big ? 'LJS' : 'AH',
    why: `No movement for ${age} days on a ${big ? 'large' : 'standard'} opportunity`,
    urgency: age > 60 ? 'now' : 'this week',
  }
}
