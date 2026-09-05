import test from 'node:test'
import assert from 'node:assert/strict'
import { applyAdjustment, resolvePriceSource, normalizePriceFields } from '../src/pricing.js'

const lists = {
  'BNK': { version: '2026-01', currency: 'EUR', uploaded: '2026-01-02', parts: [{ pn: 'P-1', price: 100, adders: [] }] },
}

test('approved price list wins over vendor reference', () => {
  const source = resolvePriceSource({ pn: 'P-1', listPrice: 999 }, lists, [{ pn: 'P-1', price: 50, supplier: 'Vendor' }])
  assert.equal(source.source, 'price-list')
  assert.equal(source.price, 100)
  assert.equal(source.sourceVersion, '2026-01')
})

test('vendor reference is used when no approved price-list row exists', () => {
  const source = resolvePriceSource({ pn: 'P-2' }, lists, [{ pn: 'P-2', price: 50, supplier: 'Vendor', currency: 'INR' }])
  assert.equal(source.source, 'vendor-quote')
  assert.equal(source.price, 50)
  assert.equal(source.currency, 'INR')
})

test('discount and markup are mutually exclusive adjustments', () => {
  assert.equal(applyAdjustment(100, { discountPct: 5 }), 95)
  assert.equal(applyAdjustment(100, { markupPct: 20 }), 120)
  assert.equal(applyAdjustment(100, { discountPct: 5, markupPct: 20 }), 95)
})

test('legacy price fields gain source and list-total fields', () => {
  const line = normalizePriceFields({ pn: 'P-1', priceList: 'BNK 2026-01', listPrice: 100, qty: 2 })
  assert.equal(line.priceSource, 'price-list')
  assert.equal(line.listUnitPrice, 100)
  assert.equal(line.listTotalPrice, 200)
})
