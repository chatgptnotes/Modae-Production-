import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveOpportunityScope, scopeForReview } from '../src/leadScope.js'

test('summarizes product quantities without a full BOM or part references', () => {
  assert.equal(deriveOpportunityScope([
    { description: 'Bently Nevada Proximity Probe', partNumber: '330101', qty: 4, uom: 'EA' },
    { description: 'Extension Cable', partNumber: '330130', qty: 4, uom: 'Nos.' },
  ]), 'Supply of 4 Bently Nevada Proximity Probe and 4 Extension Cable.')
})

test('extracts the actual request and excludes commercial and test boilerplate', () => {
  const body = `Dear Sales Team,\n\nWe require two portable sound level meters for noise assessments aboard vessels and at our maintenance workshop.\n\nPlease quote suitable models with acoustic calibrators, carrying cases, calibration certificates, and product datasheets. Include GST, freight to Kochi, warranty, payment terms, and availability.\n\nQuotation deadline: 26 October 2026. Preferred delivery: 20 November 2026.\n\nThis is a fictional enquiry for testing only.`
  assert.equal(deriveOpportunityScope([], body), 'Supply of two portable sound level meters with acoustic calibrators.')
})

test('preserves service and project requests without relabeling them as supply', () => {
  assert.equal(deriveOpportunityScope([], 'Please provide calibration services for six pressure transmitters. Include GST and payment terms. Required delivery: 30 November 2026.'), 'Calibration services for six pressure transmitters.')
  assert.equal(deriveOpportunityScope([], 'We need installation and commissioning of a vibration monitoring system. Please submit your quotation by Friday.'), 'Installation and commissioning of a vibration monitoring system.')
})

test('does not invent missing quantities and uses a part reference only without a description', () => {
  assert.equal(deriveOpportunityScope([{ description: 'Pressure sensor' }, { pn: 'PT-100', qty: 2 }]), 'Supply of Pressure sensor and 2 PT-100.')
})

test('keeps explicit short scope and avoids producing scope from logistics alone', () => {
  assert.equal(deriveOpportunityScope([], 'Supply of two portable sound level meters with acoustic calibrators.'), 'Supply of two portable sound level meters with acoustic calibrators.')
  assert.equal(deriveOpportunityScope([], 'Please include GST, freight and payment terms. Quotation deadline: Friday. Regards, Neha'), '')
  assert.equal(deriveOpportunityScope([], ''), '')
})

test('bounds long BOMs without copying every item or cutting words', () => {
  const items = Array.from({ length: 20 }, (_, index) => ({ description: `Industrial pressure transmitter model ${index + 1}`, qty: 2 }))
  const result = deriveOpportunityScope(items)
  assert.ok(result.length <= 220)
  assert.match(result, /17 additional items/)
  assert.doesNotMatch(result, /model 20/)
})

test('finds the request after email headers without treating calibration products as services', () => {
  assert.equal(deriveOpportunityScope([], 'Subject: Enquiry\nWe require two acoustic calibrators. Please include GST.'), 'Supply of two acoustic calibrators.')
  assert.equal(deriveOpportunityScope([{ description: 'Calibration pump', qty: 2 }]), 'Supply of 2 Calibration pump.')
})

test('review repairs saved full-email scopes without changing the source lead', () => {
  const lead = { body: 'We require two portable sound level meters.\nInclude GST and payment terms.', opportunityScope: 'We require two portable sound level meters. Include GST and payment terms.', ai: { lineItems: [] } }
  const before = structuredClone(lead)
  assert.equal(scopeForReview(lead), 'Supply of two portable sound level meters.')
  assert.deepEqual(lead, before)
})

test('review repairs only a matching old automatic BOM serialization', () => {
  const lead = { opportunityScope: 'Supply of Pressure sensor (PT-100) — Qty 2 EA; Cable — Qty 1 EA', ai: { lineItems: [{ description: 'Pressure sensor', pn: 'PT-100', qty: 2 }, { description: 'Cable' }] } }
  assert.equal(scopeForReview(lead), 'Supply of 2 Pressure sensor and Cable.')
  assert.equal(scopeForReview({ ...lead, opportunityScope: 'Supply of Pressure sensor (PT-100) — Qty 2 EA; Cable — Qty 3 EA' }), 'Supply of Pressure sensor (PT-100) — Qty 2 EA; Cable — Qty 3 EA')
})

test('review preserves manually entered scopes exactly and prefers saved scope', () => {
  const lead = { opportunityScope: 'Custom scope, customer approved', body: 'We require sensors.', ai: { lineItems: [{ description: 'Pressure sensor', qty: 2 }] } }
  assert.equal(scopeForReview(lead, 'Extracted scope'), lead.opportunityScope)
  assert.equal(scopeForReview({ ...lead, opportunityScope: '' }, 'Manually reviewed scope'), 'Manually reviewed scope')
})

test('review derives a missing scope and repairs an extracted scope copied from the body', () => {
  const lead = { body: 'We need installation of a vibration monitoring system. Include GST.', ai: { lineItems: [] } }
  assert.equal(scopeForReview(lead), 'Installation of a vibration monitoring system.')
  assert.equal(scopeForReview(lead, lead.body), 'Installation of a vibration monitoring system.')
})

test('review repairs the original intake metadata wrapper but preserves edits to it', () => {
  const lead = { sellTo: 'Demo Coastal Marine Services Pvt. Ltd.', contactPerson: 'Neha Rao', contactPhone: '', sellToCustomerLocation: 'Kochi, Kerala', body: 'We require two portable sound level meters. Include GST and freight.', ai: { lineItems: [] } }
  lead.opportunityScope = `Customer: ${lead.sellTo}\nContact person: ${lead.contactPerson}\nCustomer location: ${lead.sellToCustomerLocation}\n${lead.body}`
  assert.equal(scopeForReview(lead), 'Supply of two portable sound level meters.')
  const manual = lead.opportunityScope.replace('two portable', 'four portable')
  assert.equal(scopeForReview({ ...lead, opportunityScope: manual }), manual)
})

test('does not turn intake identity metadata into a requested scope', () => {
  assert.equal(deriveOpportunityScope([], 'Customer: Acme\nContact person: Joe\nContact phone: 012345\nCustomer location: Kochi'), '')
  assert.equal(deriveOpportunityScope([], 'Customer: Acme\nContact person: Joe\nWe require two pressure transmitters.'), 'Supply of two pressure transmitters.')
})

test('summarizes numbered enquiry items instead of the quotation introduction', () => {
  const body = 'Dear sir,\n\nPlease provide your quotation for the following items:\n1. TQ 902, 8mm Standard Mount Proximity Probe, 1m integral cable, body 72mm — 111-902-000-01XA1-B1-C72-D2-E1000-F0-G0-H10\n2. EA902 Series Extension Cable, 9m — 913-902-000-01XA1-E9000-F0-G0\n3. IQS 900 Signal Conditioner, 4 mV/um, 10m system — 204-900-000-01XA1-B23-C1-H10-I0\n4. Work station\n\nBest regards\nAkhil'
  const scope = deriveOpportunityScope([], body)
  assert.match(scope, /Proximity Probe/)
  assert.match(scope, /Extension Cable/)
  assert.doesNotMatch(scope, /quotation|111-902|Best regards/)
  assert.ok(scope.length <= 220)
  assert.equal(deriveOpportunityScope([], 'Please provide your quotation for the following items:'), '')
})

test('removes best-offer and quotation wording around the requested deliverable', () => {
  assert.equal(deriveOpportunityScope([], 'Please provide your best offer for VMS system and accessories as per the attached list.'), 'Supply of VMS system and accessories.')
  assert.equal(deriveOpportunityScope([], 'Please provide your quotation for two pressure sensors as per attached specifications.'), 'Supply of two pressure sensors.')
})
