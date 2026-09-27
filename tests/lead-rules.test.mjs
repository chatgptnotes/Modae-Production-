import test from 'node:test'
import assert from 'node:assert/strict'
import { customerCompanyFromText, customerContactFromText, deadlineForLead, expiredLeadDeadline, hardenLeadExtraction, isFastTrackLead, isInternalSender, normalizeLeadContactFields, opportunityOwnerFor, routeOwner, routeOwnerForLocation, supplyMissing } from '../src/leadRules.js'
import { indiaRegionForLocation } from '../src/indiaLocations.js'

const config = {
  ownershipRules: [
    { region: 'North & West India', owner: 'RS' },
    { region: 'South, East & Central India', owner: 'PP' },
  ],
  leadDeadlines: { kycDays: 7, amberFeeDays: 5, clarificationDays: 3 },
  fastTrack: { enabled: true, customerStatus: 'Green' },
}

test('region routing uses the configured owner', () => {
  assert.equal(routeOwner('North India — Noida', config), 'RS')
  assert.equal(routeOwner('South India — Chennai', config), 'PP')
})

test('unmatched nonblank regions use the unclassified ownership rule', () => {
  const withCatchAll = {
    ...config,
    ownershipRules: [...config.ownershipRules, { region: 'Unclassified leads', owner: 'LJS', unclassified: true }],
  }
  assert.equal(routeOwner('Unknown international site', withCatchAll, 'PJS'), 'LJS')
})

test('city and state locations resolve through the configured state mapping', () => {
  const config = {
    ownershipRules: [
      { region: 'North & West India', owner: 'RS' },
      { region: 'South & East India', owner: 'PP' },
      { region: 'Unclassified leads', owner: 'LJS', unclassified: true },
    ],
    stateRegions: [{ code: 'MH', name: 'Maharashtra', region: 'South & East India' }],
  }
  assert.equal(indiaRegionForLocation('Pune', config), 'South & East India')
  assert.equal(indiaRegionForLocation('Maharashtra', config), 'South & East India')
  assert.equal(routeOwnerForLocation('Pune', config, 'FALLBACK'), 'PP')
  assert.equal(routeOwnerForLocation('North & West India', config, 'FALLBACK'), 'RS')
})

test('location routing finds a known city inside a longer AI-extracted address', () => {
  const config = {
    ownershipRules: [
      { region: 'North & West India', owner: 'RS' },
      { region: 'South & East India', owner: 'PP' },
      { region: 'Unclassified leads', owner: 'LJS', unclassified: true },
    ],
    stateRegions: [{ code: 'CT', name: 'Chhattisgarh', region: 'South & East India' }],
  }
  assert.equal(routeOwnerForLocation('Demo Power Station stores, Korba, Chhattisgarh', config, 'FALLBACK'), 'PP')
})

test('location routing preserves blank fallback and uses catch-all for unknown locations', () => {
  const withCatchAll = {
    ...config,
    ownershipRules: [...config.ownershipRules, { region: 'Unclassified leads', owner: 'LJS', unclassified: true }],
  }
  assert.equal(routeOwnerForLocation('', withCatchAll, ''), '')
  assert.equal(routeOwnerForLocation('Unknown site', withCatchAll, 'PJS'), 'LJS')
})

test('opportunity ownership never remains blank', () => {
  const withCatchAll = {
    ...config,
    ownershipRules: [...config.ownershipRules, { region: 'Unclassified leads', owner: 'LJS', unclassified: true }],
  }
  assert.equal(opportunityOwnerFor({ location: 'Kolkata', config: {
    ...withCatchAll,
    stateRegions: [{ code: 'WB', name: 'West Bengal', region: 'South, East & Central India' }],
  }}), 'PP')
  assert.equal(opportunityOwnerFor({ location: 'Unknown site', config: withCatchAll }), 'LJS')
  assert.equal(opportunityOwnerFor({ config: withCatchAll }), 'LJS')
})

test('fast-track is configurable and limited to the configured class', () => {
  assert.equal(isFastTrackLead({ customerStatus: 'Green' }, config), true)
  assert.equal(isFastTrackLead({ customerStatus: 'Green' }, { ...config, fastTrack: { ...config.fastTrack, enabled: false } }), false)
  assert.equal(isFastTrackLead({ customerStatus: 'Amber' }, config), false)
})

test('internal ModAE senders are not treated as customer contacts', () => {
  assert.equal(isInternalSender('sales@mod-ae.com', {}), true)
  assert.equal(isInternalSender('buyer@ksb.example.com', {}), false)
  assert.equal(customerContactFromText('Customer contact: Neha Kulkarni'), 'Neha Kulkarni')
  const fields = [{ group: 'Customer', k: 'Contact person', v: 'Ruthvik Satish', conf: 100 }]
  assert.deepEqual(normalizeLeadContactFields(fields, { from: 'sales@mod-ae.com', text: 'Please quote.\nRegards,\nRuthvik Satish' }), [])
  assert.equal(normalizeLeadContactFields(fields, { from: 'sales@mod-ae.com', text: 'Customer contact: Neha Kulkarni' })[0].v, 'Neha Kulkarni')
})

test('lead extraction hardening does not invent quantities and flags missing evidence', () => {
  const hardened = hardenLeadExtraction({
    fields: [{ group: 'Customer', k: 'Sell-to customer', v: 'KSB Limited', conf: 98 }],
    lineItems: [{ description: 'Proximity probe, 8 mm', qty: '', confidence: 90, evidence: '' }],
    missing: [],
  })
  assert.equal(hardened.fields[0].conf, 50)
  assert.equal(hardened.lineItems[0].qty, 0)
  assert.equal(hardened.lineItems[0].confidence, 50)
  assert.ok(hardened.missing.includes('Line 1: quantity'))
})

test('customer requests are follow-up items and explicit company labels fill sell-to', () => {
  assert.equal(customerCompanyFromText('Customer: KSB Limited'), 'KSB Limited')
  const hardened = hardenLeadExtraction({
    fields: [{ group: 'Commercial', k: 'Taxes', v: 'Requested by customer', conf: 100, ev: 'Email body' }],
    lineItems: [], missing: [],
  }, { text: 'Customer: KSB Limited\nPlease include taxes and freight.' })
  assert.equal(hardened.fields.find(f => f.k === 'Sell-to customer').v, 'KSB Limited')
  assert.equal(hardened.fields.find(f => f.k === 'Taxes').factType, 'customer_request')
  assert.ok(hardened.missing.includes('Tax rate or tax treatment'))
})

test('lead deadlines are generated from configurable rules', () => {
  const lead = { id: 'LD-1', ts: '2026-08-01T00:00:00.000Z', customerStatus: 'Blue', ai: { missing: ['GST'] } }
  const rows = deadlineForLead(lead, config)
  assert.deepEqual(rows.map(r => r.type), ['kyc'])
  // Stamped in IST, so compare the instant rather than its representation.
  assert.equal(new Date(rows[0].dueAt).toISOString(), '2026-08-08T00:00:00.000Z')
  assert.equal(expiredLeadDeadline(lead, config, new Date('2026-08-09T00:00:00.000Z')).type, 'kyc')
})

// ---- supplying missing information by hand --------------------------------
// The AI flags what it could not find, and the operator often already knows the
// answer. Before this, the only way to clear an item was to wait for the
// customer to write back — so a lead sat on a running clarification deadline
// over a detail the sales owner could have typed in seconds.

const partial = () => ({
  id: 'LD-900', completeness: 78,
  ai: {
    summary: '', duplicates: [], next: [],
    missing: ['Number of preventive visits per year expected', 'Delivery address', 'Required response time'],
    fields: [{ k: 'Sell-to customer', v: 'Tata Steel', conf: 97, state: 'accepted', group: 'Customer' }],
  },
})

test('answering a missing item records it as an accepted field', () => {
  const lead = partial()
  const patch = supplyMissing(lead, 'Delivery address', ' Jajpur, Odisha ', 'Delivery address')
  assert.deepEqual(patch.ai.missing,
    ['Number of preventive visits per year expected', 'Required response time'])
  const added = patch.ai.fields.at(-1)
  assert.equal(added.k, 'Delivery address')
  assert.equal(added.v, 'Jajpur, Odisha', 'the value is trimmed')
  assert.equal(added.state, 'accepted')
  assert.equal(added.conf, 100, 'a human typed it — there is nothing to be unsure about')
  assert.equal(added.manual, true)
  assert.equal(patch.ai.fields.length, lead.ai.fields.length + 1, 'existing fields are kept')
})

test('completeness climbs and the last outstanding item closes the lead at 100', () => {
  let lead = partial()
  const seen = []
  for (const item of [...lead.ai.missing]) {
    const patch = supplyMissing(lead, item, 'answered', item)
    lead = { ...lead, ...patch }
    seen.push(lead.completeness)
  }
  assert.deepEqual(lead.ai.missing, [])
  assert.equal(lead.completeness, 100, 'no arbitrary remainder left behind')
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] > seen[i - 1], 'completeness must not go backwards')
})

// The point of the whole feature.
test('AI missing information does not create a clarification deadline', () => {
  let lead = partial()
  assert.equal(deadlineForLead(lead, config).some(r => r.type === 'clarification'), false)
  for (const item of [...lead.ai.missing]) {
    lead = { ...lead, ...supplyMissing(lead, item, 'answered', item) }
  }
  assert.equal(deadlineForLead(lead, config).some(r => r.type === 'clarification'), false)
})

// Information nobody flagged: recorded, but it does not invent progress.
test('adding unlisted information leaves the outstanding list and completeness alone', () => {
  const lead = partial()
  const patch = supplyMissing(lead, 'Site contact', 'S. Mohapatra')
  assert.deepEqual(patch.ai.missing, lead.ai.missing)
  assert.equal(patch.completeness, 78, 'answering nothing outstanding is not progress')
  assert.equal(patch.ai.fields.at(-1).k, 'Site contact')
})

test('a blank label or value is not recorded at all', () => {
  const lead = partial()
  for (const [k, v] of [['', 'x'], ['x', ''], ['   ', 'x'], ['x', '   ']]) {
    assert.equal(supplyMissing(lead, k, v, null), null, `${JSON.stringify([k, v])} must be rejected`)
  }
})

test('supplying against a lead the AI never parsed does not throw', () => {
  const patch = supplyMissing({ id: 'LD-901' }, 'Delivery address', 'Jajpur')
  assert.equal(patch.ai.fields.length, 1)
  assert.deepEqual(patch.ai.missing, [])
  assert.equal(patch.completeness, 0)
})
