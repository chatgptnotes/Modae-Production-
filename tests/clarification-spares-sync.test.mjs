import test from 'node:test'
import assert from 'node:assert/strict'

import { extractCustomerSparesLines, reconcileSparesLines } from '../src/clarificationSparesSync.js'
import { restoreSparesLinesFromProposal } from '../src/proposal/sparesBoq.js'
import { seedPriceLists } from '../src/seed.js'

test('customer clarification table extracts the five requested Metrix lines', () => {
  const text = 'MX2030 Proximity probe series 4 nos MX2031 Extension cable for MX2030 series 4 nos SC5580 Smart 2-channel vibration signal conditioner 2 nos PP10005 8 mm proximity probe 2 nos AC7646 Proximity probe mounting bracket 4 nos'
  const rows = extractCustomerSparesLines(text, [], seedPriceLists)
  assert.deepEqual(rows.map(row => [row.pn, row.qty]), [
    ['MX2030', 4], ['MX2031', 4], ['SC5580', 2], ['PP10005', 2], ['AC7646', 4],
  ])
})

test('structured clarification line items take precedence over prose parsing', () => {
  const rows = extractCustomerSparesLines('Please quote the attached items.', [
    { partNumber: 'SC5580', description: 'Smart 2-channel vibration signal conditioner', qty: 2, uom: 'EA', evidence: 'Customer reply' },
  ], seedPriceLists)
  assert.deepEqual(rows.map(row => [row.pn, row.desc, row.qty]), [['SC5580', 'Smart 2-channel vibration signal conditioner', 2]])
})

test('reconciliation updates customer quantity while preserving confirmed pricing', () => {
  const result = reconcileSparesLines([
    { id: 'SL-1', pn: 'SC5580', custRef: 'SC5580', desc: 'Old description', qty: 3, confirmed: true, listPrice: 999, listUnitPrice: 999, priceSource: 'manual', markupPct: 10 },
  ], [{ pn: 'SC5580', desc: 'Smart 2-channel vibration signal conditioner', qty: 2, evidence: 'Customer reply' }], {
    priceLists: seedPriceLists, clarificationId: 'CL-1', answeredAt: '2026-09-19', answerSource: 'Customer',
  })
  assert.equal(result.lines[0].qty, 2)
  assert.equal(result.lines[0].listUnitPrice, 999)
  assert.equal(result.lines[0].priceSource, 'manual')
  assert.equal(result.lines[0].customerConfirmationId, 'CL-1')
  assert.equal(result.changes[0].fromQty, 3)
  assert.equal(result.changes[0].toQty, 2)
})

test('reconciliation adds missing exact catalogue parts without inventing a price for unknown parts', () => {
  const result = reconcileSparesLines([], [
    { pn: 'MX2031', desc: 'Extension cable for MX2030 series', qty: 4 },
    { pn: 'CUSTOM-1', desc: 'Customer special item', qty: 1 },
  ], { priceLists: seedPriceLists })
  assert.equal(result.lines.length, 2)
  assert.equal(result.lines[0].qty, 4)
  assert.equal(result.lines[0].priceState, 'Current')
  assert.equal(result.lines[1].priceState, 'Needs pricing')
})

test('reconciliation tolerates formatted part numbers and removes duplicate suggestions', () => {
  const result = reconcileSparesLines([
    { id: 'SL-1', custRef: 'VC8000-SETPOINT/CHASSIS', pn: 'VC8000-SETPOINT/CHASSIS', desc: 'Chassis', qty: 1, confirmed: false },
    { id: 'SL-2', custRef: 'VC8000-SETPOINT/CHASSIS', pn: 'VC8000 SETPOINT CHASSIS', desc: 'AI alternative', qty: 1, confirmed: false, priceSourceSuggested: true, match: 'Suggested price-list match' },
  ], [{ pn: 'VC8000 SETPOINT CHASSIS', desc: 'Chassis', qty: 2 }], { priceLists: seedPriceLists })
  assert.equal(result.lines.length, 1)
  assert.equal(result.lines[0].pn, 'VC8000-SETPOINT/CHASSIS')
  assert.equal(result.lines[0].qty, 2)
  assert.ok(result.changes.some(change => change.deduplicated === 1))
})

test('revision restoration copies the last proposal values back into sourcing', () => {
  const result = restoreSparesLinesFromProposal([
    { id: 'SL-1', oppId: 'OPP-1', pn: 'P-1', custRef: 'P-1', desc: 'Old description', qty: 1, confirmed: true, listPrice: 100, listUnitPrice: 100, discountPct: 5, markupPct: 4, priceSource: 'manual' },
    { id: 'SL-2', oppId: 'OPP-1', pn: 'STALE', custRef: 'STALE', desc: 'Removed line', qty: 2, confirmed: true, listPrice: 200, listUnitPrice: 200 },
  ], {
    bom: [
      { pn: 'P-1', custRef: 'P-1', desc: 'Updated description', common: 4, uom: 'EA', listPrice: 1250, listUnitPrice: 1250, baseCost: 900, discountPct: 12, markupPct: 12, currency: 'INR', priceSource: 'manual', priceSourceName: 'Manual pricing' },
      { pn: 'P-2', custRef: 'P-2', desc: 'Added line', common: 1, uom: 'EA', listPrice: 500, listUnitPrice: 500, baseCost: 350, discountPct: 3, markupPct: 5, currency: 'INR', priceSource: 'manual' },
    ],
  }, {}, {})

  assert.deepEqual(result.lines.map(line => [line.pn, line.qty, line.discountPct, line.markupPct, line.listUnitPrice]), [
    ['P-1', 4, 12, 12, 1250],
    ['P-2', 1, 3, 5, 500],
    ['STALE', 0, undefined, undefined, 200],
  ])
  assert.equal(result.lines[0].id, 'SL-1')
  assert.equal(result.lines[1].id, undefined)
  assert.equal(result.lines[1].confirmed, true)
  assert.equal(result.lines[2].removedFromSourcing, true)
  assert.equal(result.lines[2].removedQty, 2)
})
