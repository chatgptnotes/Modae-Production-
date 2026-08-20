import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SIMULATED_CUSTOMER_SCENARIOS, INQUIRY_TEMPLATES, SIMULATED_CUSTOMERS,
  simulatedLead, withoutSimulated, simulatedCount,
} from '../src/simulatedLeads.js'
import { deadlineForLead } from '../src/leadRules.js'
import { findDuplicates } from '../src/insights.js'
import { seedConfig, seedAiLeads } from '../src/seed.js'

const WHEN = '2026-08-19T00:00:00.000Z'

// The class is the gate the operator picked — it is the one thing the
// generator must never randomise.
test('simulated inquiry scenarios cover all four customer classes', () => {
  assert.deepEqual(SIMULATED_CUSTOMER_SCENARIOS.map(s => s.status), ['Green', 'Blue', 'Amber', 'Red'])
  for (const scenario of SIMULATED_CUSTOMER_SCENARIOS) {
    const lead = simulatedLead(scenario.status, WHEN, { quality: 'clean' })
    assert.equal(lead.status, 'New')
    assert.equal(lead.customerStatus, scenario.status)
    assert.equal(lead.ai.missing.length, 0)
    assert.equal(lead.ai.fields.every(field => field.state === 'accepted'), true)
    assert.equal(lead.completeness, 100)
  }
})

test('Blue and Amber simulations start their customer requests immediately', () => {
  assert.equal(simulatedLead('Blue', WHEN).verification.requestedAt, WHEN)
  assert.equal(simulatedLead('Amber', WHEN).verification.requestedAt, WHEN)
  assert.deepEqual(simulatedLead('Green', WHEN).verification, {})
  assert.equal(simulatedLead('Red', WHEN).redFlag, true)
})

// The whole point of the rewrite: two clicks must not look the same.
test('each variant is a different enquiry', () => {
  const leads = INQUIRY_TEMPLATES.map((_, i) => simulatedLead('Blue', WHEN, { variant: i, quality: 'clean' }))
  assert.equal(new Set(leads.map(l => l.subject)).size, INQUIRY_TEMPLATES.length)
  assert.equal(new Set(leads.map(l => l.simulatedTemplate)).size, INQUIRY_TEMPLATES.length)
  // Not every dimension is unique per row, but none of them may be constant.
  assert.ok(new Set(leads.map(l => l.route)).size > 1, 'route never varies')
  assert.ok(new Set(leads.map(l => l.urgency)).size > 1, 'urgency never varies')
  assert.ok(new Set(leads.map(l => l.from)).size > 1, 'sender never varies')
  // Customers rotate independently of templates, so all three appear.
  const sellTo = leads.map(l => l.ai.fields.find(f => /sell-to/i.test(f.k)).v)
  assert.equal(new Set(sellTo).size, SIMULATED_CUSTOMERS.Blue.length)
})

test('ids are unique across rapid successive clicks', () => {
  const ids = Array.from({ length: 50 }, () => simulatedLead('Green', WHEN).id)
  assert.equal(new Set(ids).size, 50)
  assert.equal(ids.every(id => id.startsWith('LD-SIM-')), true)
  assert.equal(simulatedLead('Green', WHEN).simulated, true)
})

// A thin mail is the case that drives the clarification deadline — the old
// always-100% generator could never reach it.
test('a partial inquiry leaves fields pending and opens a clarification deadline', () => {
  const lead = simulatedLead('Green', WHEN, { variant: 0, quality: 'partial', config: seedConfig })
  assert.ok(lead.completeness < 100 && lead.completeness >= 78, `completeness ${lead.completeness}`)
  assert.ok(lead.ai.missing.length >= 1)
  assert.ok(lead.ai.fields.some(f => f.state === 'pending'))
  assert.ok(lead.ai.fields.filter(f => f.state === 'pending').every(f => f.conf <= 85))
  assert.ok(deadlineForLead(lead, seedConfig).some(row => row.type === 'clarification'))
})

test('a duplicate inquiry chases a lead already in the inbox', () => {
  const lead = simulatedLead('Green', WHEN, {
    variant: 0, quality: 'duplicate', existingLeads: seedAiLeads, config: seedConfig,
  })
  const chased = seedAiLeads.find(l => l.ref === lead.ref)
  assert.ok(chased, 'the chaser must reuse an existing buyer reference')
  assert.equal(lead.from, chased.from)
  assert.equal(lead.duplicateRisk, 'High')
  assert.ok(lead.ai.duplicates.length >= 1)
  assert.ok(findDuplicates(lead, seedAiLeads).length >= 1)
  // No stacked "Fwd: Reminder: …" when the chased lead is itself a chaser.
  assert.equal(/^(re|fwd|fw|reminder):\s*(re|fwd|fw|reminder):/i.test(lead.subject), false)
  // A chaser restates an existing enquiry, so it must not contradict it.
  assert.equal(lead.route, chased.route)
  assert.equal(lead.ai.route, chased.route)
  assert.equal(lead.ai.fields.find(f => /opp type/i.test(f.k)).v, chased.route)
  assert.equal(lead.ai.fields.find(f => /buyer reference/i.test(f.k)).v, chased.ref)
  assert.deepEqual(lead.ai.missing, [], 'a chaser has no new scope to clarify')
  assert.equal(lead.completeness, 94)
})

// Uniform random over eight templates repeats a subject about every third
// click; the short memory is what stops the inbox looking broken again.
test('consecutive inquiries do not repeat the same enquiry', () => {
  const seen = Array.from({ length: 12 }, () => simulatedLead('Green', WHEN, { quality: 'clean' }).simulatedTemplate)
  for (let i = 1; i < seen.length; i++) {
    assert.notEqual(seen[i], seen[i - 1], `template repeated back-to-back at ${i}`)
  }
  assert.ok(new Set(seen).size >= 5, `only ${new Set(seen).size} distinct templates in 12 draws`)
})

test('the duplicate variant degrades to partial when the inbox is empty', () => {
  const lead = simulatedLead('Green', WHEN, { variant: 0, quality: 'duplicate', existingLeads: [] })
  assert.equal(lead.simulatedQuality, 'partial')
  assert.equal(lead.duplicateRisk, 'Low')
  assert.deepEqual(lead.ai.duplicates, [])
})

// Owner comes from the L-05-AI region rules rather than a hard-coded 'RS'.
test('owner is resolved from the ownership rules', () => {
  const owners = SIMULATED_CUSTOMER_SCENARIOS.flatMap(s =>
    INQUIRY_TEMPLATES.map((_, i) => simulatedLead(s.status, WHEN, { variant: i, quality: 'clean', config: seedConfig }).suggestedOwner))
  assert.ok(new Set(owners).size > 1, 'every simulated lead landed with the same owner')
  // International accounts are the Red pool — L-05-AI sends those to LJS.
  const red = simulatedLead('Red', WHEN, { variant: 0, quality: 'clean', config: seedConfig })
  assert.equal(red.region, 'International opportunities')
  assert.equal(red.suggestedOwner, 'LJS')
  // With no rules configured the template's own suggestion stands.
  assert.equal(simulatedLead('Green', WHEN, { variant: 1, quality: 'clean' }).suggestedOwner, 'LJS')
})

test('purging removes generated rows and keeps everything else', () => {
  const sim = simulatedLead('Green', WHEN, { quality: 'clean' })
  const converted = { ...simulatedLead('Blue', WHEN, { quality: 'clean' }), status: 'Converted', oppId: 'OP-9' }
  const rows = [sim, seedAiLeads[0], converted]
  assert.deepEqual(withoutSimulated(rows).map(l => l.id), [seedAiLeads[0].id, converted.id])
  assert.equal(simulatedCount(rows), 1)
  assert.equal(simulatedCount(rows, [sim]), 2)
  assert.deepEqual(withoutSimulated(), [])
})

// This test used to fail about one run in eight. The cause was not the test:
// `chaseable` included leads with no buyer reference (seed's LD-204 carries
// `ref: ''`), and `ref = chased.ref || … || ref` then fell through to a freshly
// minted reference — producing a lead flagged duplicateRisk:'High' that
// findDuplicates could never match to anything.
test('a chaser always reuses a reference that exists', () => {
  for (let i = 0; i < 200; i += 1) {
    const lead = simulatedLead('Green', WHEN, {
      quality: 'duplicate', existingLeads: seedAiLeads, config: seedConfig,
    })
    const chased = seedAiLeads.find(l => l.ref === lead.ref)
    assert.ok(chased, `run ${i}: chaser ref ${lead.ref} matches no seeded lead`)
    assert.equal(lead.duplicateRisk, 'High')
    assert.ok(findDuplicates(lead, seedAiLeads).length >= 1)
  }
})

test('a lead with no buyer reference is never chased', () => {
  const refless = seedAiLeads.filter(l => !l.ref && !l.rfqNumber)
  assert.ok(refless.length > 0, 'LD-204 is the fixture this guards')
  // Offered only refless leads to chase, the generator must fall back rather
  // than mint a reference nobody can match.
  const lead = simulatedLead('Green', WHEN, {
    quality: 'duplicate', existingLeads: refless, config: seedConfig,
  })
  assert.notEqual(lead.duplicateRisk, 'High', 'it is not a duplicate of anything')
})
