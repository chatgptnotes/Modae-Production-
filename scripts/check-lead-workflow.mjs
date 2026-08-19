// Runtime check of the lead management workflow.
//
//   node scripts/check-lead-workflow.mjs
//
// Unlike tests/lead-*.test.mjs (which assert on the source of Inbox.jsx), this
// drives the real workflow functions with a real seeded lead and walks it from
// "received in the common mailbox" to "opportunity registered", printing the
// progress indicator after every operator action. Exit code 0 = working.
import { leadWorkflow, LEAD_WORKFLOW_STEPS } from '../src/leadWorkflow.js'
import { routeOwner, isFastTrackLead, deadlineForLead, expiredLeadDeadline } from '../src/leadRules.js'
import { seedAiLeads } from '../src/seed.js'

let failed = 0
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`)
}

const bar = wf => wf.steps.map(s =>
  s.state === 'complete' ? '#' : s.state === 'current' ? '>' : s.state === 'blocked' ? '!' : '.').join('')

const show = (title, lead, opts) => {
  const wf = leadWorkflow(lead, opts)
  const step = LEAD_WORKFLOW_STEPS[wf.activeIndex]
  console.log(`\n  ${bar(wf)}  ${title}`)
  console.log(`        at: ${step.id} ${step.label}` +
    `${wf.blocked ? `  |  blocked: ${wf.blocked}` : ''}` +
    `${wf.terminal ? `  |  terminal: ${wf.terminal}` : ''}` +
    `  |  fields decided ${wf.decided}/${wf.totalFields}`)
  return wf
}

console.log('LEAD MANAGEMENT WORKFLOW CHECK')
console.log('legend: # complete   > current   ! blocked   . upcoming')
console.log(`steps:  ${LEAD_WORKFLOW_STEPS.map(s => s.id).join(' ')}`)

// ---------------------------------------------------------------- happy path
const source = seedAiLeads.find(l => l.id === 'LD-201')
if (!source) { console.error('LD-201 missing from seed data'); process.exit(1) }
let lead = structuredClone(source)

console.log('\n[1] Happy path — LD-201 (Tata Power spares RFQ)')

let wf = show('as received (L-01 done, nothing actioned)', lead)
check('starts on Initial review', LEAD_WORKFLOW_STEPS[wf.activeIndex].id, 'L-02')
check('mailbox step already satisfied (AI parsed it)', wf.steps[3].state, 'complete')
check('owner suggested by routing', wf.steps[4].state, 'complete')
check('not complete yet', wf.complete, false)

lead = { ...lead, readAt: '2026-08-19T09:00:00Z' }
wf = show('operator opens the lead', lead)
check('advances to Business relevance', LEAD_WORKFLOW_STEPS[wf.activeIndex].id, 'L-03')

lead = { ...lead, status: 'Qualified' }
wf = show('operator qualifies the lead', lead)
check('jumps to AI validation', LEAD_WORKFLOW_STEPS[wf.activeIndex].id, 'AI')
check('relevance recorded', wf.steps[2].state, 'complete')
check('held by outstanding clarifications', wf.blocked, '3 clarifications required')

lead = {
  ...lead,
  ai: {
    ...lead.ai,
    fields: lead.ai.fields.map(f => ({ ...f, state: 'accepted' })),
    missing: [],
  },
}
wf = show('operator accepts AI fields + closes clarifications', lead)
check('all fields decided', [wf.decided, wf.totalFields], [7, 7])
check('nothing blocking', wf.blocked, '')
check('advances to Customer classification', LEAD_WORKFLOW_STEPS[wf.activeIndex].id, 'CLASS')

lead = { ...lead, customerStatus: 'Green' }
wf = show('credit classifies the customer Green', lead)
check('advances to Opportunity registration', LEAD_WORKFLOW_STEPS[wf.activeIndex].id, 'REG')

lead = { ...lead, status: 'Converted', oppId: 'OPP-9001' }
wf = show('opportunity registered', lead)
check('workflow complete', wf.complete, true)
check('terminal state converted', wf.terminal, 'converted')
check('every step shown complete', wf.steps.every(s => s.state === 'complete'), true)

// ------------------------------------------------------------ low-confidence
console.log('\n[2] Low-confidence gate — LD-202 (68% conflict field)')
const lowConf = structuredClone(seedAiLeads.find(l => l.id === 'LD-202'))
wf = show('as received', lowConf)
check('AI validation not passable', wf.steps[6].state !== 'complete', true)
check('counts the fields needing review', wf.blocked.startsWith('1 AI field'), true)
if (wf.blocked === '1 AI field need review') {
  console.log('  WARN  wording bug in src/leadWorkflow.js:49 — "1 AI field need review"'
    + ' should read "needs". Cosmetic only; the gate itself works.')
}

// ------------------------------------------------------------------ drop path
console.log('\n[3] Disqualify path')
const dropped = { ...structuredClone(source), status: 'Dropped', droppedReason: 'Out of scope — not our product line' }
wf = show('lead disqualified with a reason', dropped)
check('terminal state dropped', wf.terminal, 'dropped')
check('blocked message explains it', wf.blocked, 'Lead discarded')
check('never marked complete', wf.complete, false)

// ------------------------------------------------------------------- routing
console.log('\n[4] Ownership routing, fast track and deadlines')
const config = {
  ownershipRules: [{ region: 'South', owner: 'RS' }, { region: 'North/West', owner: 'PP' }],
  leadDeadlines: { kycDays: 7, amberFeeDays: 7, clarificationDays: 7 },
}
check('South India routes to RS', routeOwner('South India', config, 'LJS'), 'RS')
check('North region routes to PP', routeOwner('North', config, 'LJS'), 'PP')
check('unknown region falls back', routeOwner('Antarctica', config, 'LJS'), 'LJS')
check('blank region falls back', routeOwner('', config, 'LJS'), 'LJS')
check('Green customer is fast tracked', isFastTrackLead({ customerStatus: 'Green' }, config), true)
check('Amber customer is not', isFastTrackLead({ customerStatus: 'Amber' }, config), false)

const blueLead = { ts: '2026-08-01T00:00:00Z', customerStatus: 'Blue' }
const dues = deadlineForLead(blueLead, config)
check('Blue customer raises a KYC deadline', dues.map(d => d.type), ['kyc'])
check('KYC due 7 days after receipt', dues[0].dueAt, '2026-08-08T00:00:00.000Z')
check('not expired on day 6', expiredLeadDeadline(blueLead, config, '2026-08-07T00:00:00Z'), null)
check('expired on day 9', expiredLeadDeadline(blueLead, config, '2026-08-10T00:00:00Z')?.type, 'kyc')

const amberLead = { ts: '2026-08-01T00:00:00Z', customerStatus: 'Amber', ai: { missing: ['Delivery date'] } }
check('Amber + clarification raise two deadlines',
  deadlineForLead(amberLead, config).map(d => d.type), ['amberFee', 'clarification'])
check('paid Amber fee clears its deadline',
  deadlineForLead({ ...amberLead, amberFeePaid: true }, config).map(d => d.type), ['clarification'])

console.log(failed === 0
  ? '\nRESULT: lead management workflow is working — all checks passed.\n'
  : `\nRESULT: ${failed} check(s) FAILED — see above.\n`)
process.exit(failed === 0 ? 0 : 1)
