import test from 'node:test'
import assert from 'node:assert/strict'

import { lineItemsFromLead, buildLeadProposalData } from '../src/leadBoq.js'
import { seedPriceLists } from '../src/seed.js'

test('numbered email items retain their complete descriptions and quantities', () => {
  const items = lineItemsFromLead({
    body: 'Please quote:\n1. Proximity probe, 8 mm — 12 nos\n2. Extension cable, 5 m — 4 nos',
    ai: { fields: [] },
  })
  assert.deepEqual(items.map(i => [i.description, i.qty]), [
    ['Proximity probe, 8 mm —', 12],
    ['Extension cable, 5 m —', 4],
  ])
})

test('compact part-number lists become separate BoQ rows', () => {
  const lead = {
    body: '',
    ai: { fields: [{ k: 'Line items', v: 'DS1001 ×10, DS1003 ×10, EC100 ×15' }] },
  }
  const { extracted, bom } = buildLeadProposalData(lead, seedPriceLists)
  assert.equal(extracted.length, 3)
  assert.deepEqual(bom.map(row => row.common), [10, 10, 15])
  assert.ok(bom.every(row => row.pn && row.listPrice > 0))
})

test('structured AI line items take precedence over unrelated lead prose', () => {
  const items = lineItemsFromLead({
    body: 'Another unrelated quantity is 99 nos',
    ai: { lineItems: [{ description: 'Requested sensor', partNumber: 'IN081-3-110-50', qty: 2, confidence: 95, evidence: 'RFQ' }] },
  })
  assert.equal(items.length, 1)
  assert.equal(items[0].qty, 2)
  assert.equal(items[0].partNumber, 'IN081-3-110-50')
})
