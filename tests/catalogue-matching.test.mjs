import test from 'node:test'
import assert from 'node:assert/strict'

import { findPriceListMatch } from '../src/pricing.js'
import { seedPriceLists } from '../src/seed.js'

test('catalogue matching ignores harmless punctuation and spacing differences', () => {
  const match = findPriceListMatch({ pn: 'VC8000 SETPOINT CHASSIS' }, seedPriceLists)
  assert.ok(match)
  assert.equal(match.part.pn, 'VC8000-SETPOINT/CHASSIS')
  assert.equal(match.matchKind, 'exact')
})

test('RFQ placeholder codes are not falsely treated as workbook matches', () => {
  for (const pn of ['DS-1000-PROX', 'EC-05', 'DS-1000-DRV', 'VC-8000/DSM', 'VC-8000/PSU']) {
    assert.equal(findPriceListMatch({ pn }, seedPriceLists), null, pn)
  }
})
