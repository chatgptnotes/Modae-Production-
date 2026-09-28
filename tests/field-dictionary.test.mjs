import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CATEGORIES, OWNERS, OPP_TYPES, BUS, SEGMENTS, SOLUTIONS, PRODUCTS,
  PROB_LEVELS, STAGES, CLOSE_REASONS, CUSTOMER_STATUSES, FLEX_SLOTS, seedConfig,
  LEAD_SOURCES, seedAiLeads,
} from '../src/seed.js'
import { leadWorkflow } from '../src/leadWorkflow.js'
import { routeOwner } from '../src/leadRules.js'

// The client's own catalogue, transcribed from the "Field List" sheet of
// the supplied pipeline explanation workbook (2026 Apr New Fields List). This
// is the source of truth:
// if the app offers a value that is not here, a pipeline export will not
// round-trip, and if it is missing one, an import will be rejected.
//
// Two client typos are preserved deliberately below — "Pedigreee" and
// "Duplicate Oppurtunity" — see the alias test at the bottom.
const FIELD_LIST = {
  Owner: ['LJS', 'PP', 'RS', 'SS', 'PJS', 'RJS', 'SR'],
  'Opp Type': ['Project', 'Upgrade', 'Retrofit', 'Service', 'Spares', 'Flow'],
  BU: ['Aero', 'Energy', 'Services'],
  Segment: ['Thermal', 'Nuclear', 'Hydro', 'Industrial', 'O&G-US', 'O&G-MS',
    'O&G-DS', 'Petrochem', 'Test Bed', 'Others', ...FLEX_SLOTS],
  Solution: ['Automation', 'SSS', 'VMS/CMS', ...FLEX_SLOTS],
  Product: ['ModAE', 'B&K', 'Metrix', 'Beran', 'Bently', 'CTC', 'Meggitt', 'MC Monitoring',
    'Monitran', 'Shinkawa', 'Sensonics', 'Senstec', 'Wilcoxon', 'Others', 'ABB', 'BHEL',
    'Emerson', 'Honeywell', 'Hima', 'Rockwell', 'Siemens', 'Yokogawa', 'Valmat', 'Various',
    ...FLEX_SLOTS],
  Stage: ['Lead', 'RFI', 'Budgetary', 'RFQ', 'Firm Bid', 'Negotiate', 'Won', 'Lost'],
  'Prob (%)': ['Low', 'Medium', 'High'],
  'Customer Category': ['EUC', 'OEM', 'EPC', 'MAC', 'SI', 'ACP', 'RE/TR', ...FLEX_SLOTS],
  'Customer Status': ['Red', 'Amber', 'Green', 'Blue'],
}

const APP = {
  Owner: OWNERS,
  'Opp Type': OPP_TYPES,
  BU: BUS,
  Segment: SEGMENTS,
  Solution: SOLUTIONS,
  Product: PRODUCTS,
  Stage: STAGES,
  'Prob (%)': PROB_LEVELS,
  'Customer Category': CATEGORIES,
  'Customer Status': CUSTOMER_STATUSES,
}

// The guard that stops the catalogue drifting again. AMC and Training used to
// sit in OPP_TYPES, "Negotiation" in STAGES, "Service" in BUS and "Valmet" in
// PRODUCTS — none of which the client's sheet has ever offered.
test('every dropdown matches the client Field List exactly', () => {
  for (const [field, expected] of Object.entries(FIELD_LIST)) {
    const actual = APP[field]
    assert.ok(actual, `${field} must be exported from seed.js`)
    assert.deepEqual([...actual].sort(), [...expected].sort(),
      `${field} must offer exactly the client's values`)
  }
})

test('the reserved Fx slots reach every field the client puts them on', () => {
  for (const list of [CATEGORIES, SEGMENTS, PRODUCTS, SOLUTIONS]) {
    for (const slot of FLEX_SLOTS) assert.ok(list.includes(slot), `${slot} must be selectable`)
  }
  // Fx slots are not offered where the client does not have them.
  for (const list of [OWNERS, OPP_TYPES, BUS, STAGES, PROB_LEVELS, CUSTOMER_STATUSES]) {
    for (const slot of FLEX_SLOTS) assert.ok(!list.includes(slot), `${slot} must not appear here`)
  }
})

// The client's sheet spells two close reasons wrong. We keep the corrected
// spelling on screen, so an import has to accept theirs.
test('close reasons cover the client list, typos included', () => {
  const theirs = ['Relationship', 'Unique Product', 'Pedigreee', 'Best Price', 'Trade Compliance',
    'Technical Compliance', 'Commercial Compliance', 'Capability', 'Lead Time', 'No Bid',
    'Abandoned/Delayed', 'Duplicate Oppurtunity', 'Validity Expired', 'Others']
  const alias = { Pedigreee: 'Pedigree', 'Duplicate Oppurtunity': 'Duplicate Opportunity' }
  for (const reason of theirs) {
    const ours = alias[reason] || reason
    assert.ok(CLOSE_REASONS.includes(ours), `"${reason}" must map onto a close reason we offer`)
  }
  assert.equal(CLOSE_REASONS.length, theirs.length, 'no invented close reasons')
})

// ---------------------------------------------------------------------------
// L-05-AI region routing — Official Lead Management Workflow, 22 Jul 2026.
// ---------------------------------------------------------------------------

const owner = region => routeOwner(region, seedConfig, 'FALLBACK')

test('L-05-AI routes each documented region to its owner', () => {
  assert.equal(owner('North India'), 'RS')
  assert.equal(owner('West India'), 'RS')
  assert.equal(owner('South India'), 'PP')
  assert.equal(owner('East India'), 'PP')
  assert.equal(owner('International opportunities'), 'LJS')
  assert.equal(owner('Aerospace'), 'LJS')
  assert.equal(owner('DCS'), 'LJS')
  assert.equal(owner('Automation opportunities'), 'LJS')
})

// The drawing's last row is "Unclassified Leads - LJS (approval needed)", so a
// region that was entered but matches nothing lands on LJS rather than on
// whatever the caller happened to pass in.
test('an unrecognised region falls to the unclassified rule, not the caller', () => {
  assert.equal(owner('Somewhere nobody listed'), 'LJS')
  const rule = seedConfig.ownershipRules.find(r => r.unclassified)
  assert.ok(rule, 'the unclassified catch-all must exist')
  assert.equal(rule.owner, 'LJS')
  assert.equal(rule.approvalNeeded, true, 'unclassified leads need approval, not just an owner')
})

// A region nobody has typed yet is a different thing from an unclassifiable
// one: the AI's own suggestion still stands.
test('a blank region keeps the caller fallback', () => {
  assert.equal(owner(''), 'FALLBACK')
  assert.equal(owner(undefined), 'FALLBACK')
})

test('Central India is no longer silently routed to PP', () => {
  // The old config said "South, East & Central India"; the drawing says
  // "South & East India", so Central is unclassified and needs a decision.
  assert.equal(owner('Central India'), 'LJS')
})

// ---------------------------------------------------------------------------
// Section 1 — lead sources.
// ---------------------------------------------------------------------------

// Every lead used to carry source: 'Common mailbox', which recorded how it
// arrived rather than where it came from, so "which channels produce work"
// was unanswerable.
test('the eight documented lead sources are offered', () => {
  assert.deepEqual(LEAD_SOURCES, [
    'Website enquiry',
    'Email',
    'OEM referral',
    'WhatsApp',
    'Phone call',
    'GeM / tender portal',
    'Networking & relationship',
    'Existing Green customer',
  ])
})

test('no seeded lead still records the mailbox as its source', () => {
  for (const lead of seedAiLeads) {
    assert.ok(LEAD_SOURCES.includes(lead.source),
      `${lead.id} has source "${lead.source}", which is not a documented lead source`)
  }
  // The mailbox is still recorded — just as the channel, not the origin.
  assert.ok(seedAiLeads.every(l => l.channel), 'each lead must keep its arrival channel')
})

// L-04 is satisfied by the lead being taken in, not by the source string
// happening to read "common mailbox".
test('the L-04 mailbox step survives the source change', () => {
  const steps = lead => leadWorkflow(lead, {}).steps
  const l04 = lead => steps(lead).find(s => s.id === 'L-04')
  assert.equal(l04({ mailbox: true }).state, 'complete', 'an explicit mailbox flag completes L-04')
  assert.equal(l04({ ai: { fields: [] } }).state, 'complete', 'an extracted lead completes L-04')
  assert.equal(l04({ source: 'Common mailbox' }).state, 'complete', 'the legacy shape still counts')
  assert.notEqual(l04({ source: 'Phone call' }).state, 'complete',
    'a lead that never reached the mailbox has not passed L-04')
})
