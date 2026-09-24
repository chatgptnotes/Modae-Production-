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

test('compact partial part references become separate reviewable BoQ rows', () => {
  const lead = {
    body: '',
    ai: { fields: [{ k: 'Line items', v: 'DS1001 ×10, DS1003 ×10, EC100 ×15' }] },
  }
  const { extracted, bom } = buildLeadProposalData(lead, seedPriceLists)
  assert.equal(extracted.length, 3)
  assert.deepEqual(bom.map(row => row.common), [10, 10, 15])
  assert.deepEqual(bom.map(row => row.pn), ['DS1001', 'DS1003', 'EC100'])
  assert.ok(bom.every(row => row.listPrice === 0))
  assert.ok(bom.every(row => row.common > 0))
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

test('AI rows do not hide structured parser and attachment rows', () => {
  const items = lineItemsFromLead({
    ai: { lineItems: [{ description: 'Probe', partNumber: 'P-1', qty: 1 }] },
    parse: { items: [{ description: 'Extension cable', partNumber: 'C-1', qty: 2 }] },
    attachments: [{ name: 'bom.xlsx', text: '3. Mounting kit — 4 nos' }],
  })
  assert.deepEqual(items.map(item => [item.partNumber, item.description, item.qty]), [
    ['P-1', 'Probe', 1],
    ['C-1', 'Extension cable', 2],
    ['', 'Mounting kit —', 4],
  ])
})

test('source rows merge with duplicate AI rows instead of duplicating quantity', () => {
  const items = lineItemsFromLead({
    ai: { lineItems: [{ description: 'Probe', partNumber: 'P-1', qty: 1 }] },
    parse: { items: [{ description: 'Probe', partNumber: 'P-1', qty: 2 }] },
  })
  assert.deepEqual(items.map(item => [item.partNumber, item.qty]), [['P-1', 3]])
})

test('extraction keeps customer reference separate from the real description', () => {
  const items = lineItemsFromLead({ ai: { lineItems: [
    { description: 'Shielded signal cable', customerRef: '2', qty: 2 },
  ] } })
  assert.equal(items[0].description, 'Shielded signal cable')
  assert.equal(items[0].customerRef, '2')
})

test('reference-only extraction remains unresolved instead of inventing an item name', () => {
  const { extracted, workbenchRows } = buildLeadProposalData({ ai: { lineItems: [
    { customerRef: '2', qty: 2 },
  ] } }, seedPriceLists)
  assert.equal(extracted[0].description, '')
  assert.equal(workbenchRows[0].desc, '')
  assert.equal(workbenchRows[0].missingDescription, true)
  assert.equal(workbenchRows[0].confirmed, false)
})

test('incomplete AI reference is enriched from the matching original attachment row', () => {
  const items = lineItemsFromLead({
    ai: { lineItems: [{ description: '', customerRef: '9', qty: 2, evidence: 'AI extraction' }] },
    attachments: [{ name: 'original-rfq.pdf', text: '9. Customer-requested shielded cable, 5 m — 2 nos' }],
  })
  assert.equal(items.length, 1)
  assert.equal(items[0].description, 'Customer-requested shielded cable, 5 m —')
  assert.equal(items[0].customerRef, '9')
  assert.match(items[0].evidence, /original-rfq\.pdf/)
})

test('reference-only attachment rows do not use ordinary words as part numbers', () => {
  const items = lineItemsFromLead({
    attachments: [{ name: 'original-rfq.pdf', text: '9. Customer-requested item — 2 nos' }],
  })
  assert.equal(items.length, 1)
  assert.equal(items[0].partNumber, '')
  assert.equal(items[0].customerRef, '9')
  assert.equal(items[0].description, 'Customer-requested item —')
})

test('duplicate structured line items collapse and combine quantities', () => {
  const items = lineItemsFromLead({
    ai: { lineItems: [
      { description: 'MPC4 monitoring card', partNumber: 'MPC4', qty: 1 },
      { description: 'MPC4 monitoring card', partNumber: 'MPC4', qty: 2 },
    ] },
  })
  assert.deepEqual(items.map(item => [item.partNumber, item.qty]), [['MPC4', 3]])
})

test('structured catalogue suggestions import the candidate price but remain unconfirmed', () => {
  const { workbenchRows } = buildLeadProposalData({
    ai: { lineItems: [{ description: 'VM600 rack backplane connectors', qty: 2 }] },
  }, seedPriceLists)
  assert.equal(workbenchRows.length, 1)
  assert.equal(workbenchRows[0].pn, 'VM600-ABE042')
  assert.ok(workbenchRows[0].listPrice > 0)
  assert.equal(workbenchRows[0].priceState, 'Current')
  assert.equal(workbenchRows[0].confirmed, false)
  assert.equal(workbenchRows[0].match, 'Suggested price-list match')
})

test('approved catalogue aliases price TQ402 and MPC4 without replacing customer references', () => {
  const { workbenchRows } = buildLeadProposalData({
    ai: { lineItems: [
      { customerRef: 'TQ402', description: 'signal conditioner', qty: 1 },
      { customerRef: 'MPC4', description: 'machinery protection card', qty: 1 },
      { customerRef: 'IC04T', qty: 1 },
      { customerRef: 'EA402', qty: 1 },
      { customerRef: 'IC4', qty: 1 },
      { customerRef: 'PS-24VDC', qty: 1 },
    ] },
  }, seedPriceLists)
  assert.deepEqual(workbenchRows.slice(0, 2).map(row => [row.custRef, row.pn, row.listPrice, row.confirmed]), [
    ['TQ402', 'TQ402-A', 620, false],
    ['MPC4', 'VM600-MPC4', 4750, false],
  ])
  assert.ok(workbenchRows.slice(2).every(row => row.match === 'Unmatched' && row.priceState === 'Needs pricing'))
})

test('exact customer part numbers still import current catalogue pricing', () => {
  const { workbenchRows } = buildLeadProposalData({
    ai: { lineItems: [{ description: 'MPC4 monitoring card', partNumber: 'VM600-MPC4', qty: 2 }] },
  }, seedPriceLists)
  assert.equal(workbenchRows[0].pn, 'VM600-MPC4')
  assert.ok(workbenchRows[0].listPrice > 0)
  assert.equal(workbenchRows[0].priceSource, 'price-list')
  assert.equal(workbenchRows[0].confirmed, true)
})
