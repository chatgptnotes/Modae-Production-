import test from 'node:test'
import assert from 'node:assert/strict'
import { applyAdjustment, formatPriceSource, resolvePriceSource, normalizePriceFields, sparesLineFinancials } from '../src/pricing.js'
import { buildLeadProposalData } from '../src/leadBoq.js'
import { sparesProposalBom } from '../src/proposal/sparesBoq.js'
import { computeProposalTotals } from '../src/gates.js'
import { convertCurrency, normalizedCurrencyRates } from '../src/currency.js'

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

test('source display identifies price-list provenance', () => {
  const source = formatPriceSource({ priceSource: 'price-list', priceSourceName: 'Meggitt', priceSourceVersion: '2026-Q2', priceSourceRef: 'VM600-MPC4' })
  assert.equal(source.primary, 'Approved price list')
  assert.equal(source.secondary, 'Meggitt · 2026-Q2 · Part VM600-MPC4')
  assert.equal(source.full, 'Approved price list · Meggitt · Version 2026-Q2 · Reference VM600-MPC4')
})

test('source display keeps vendor and manual origins explicit', () => {
  assert.equal(formatPriceSource({ priceSource: 'vendor-quote', priceSourceName: 'Meggitt', priceSourceRef: 'Q-42', priceSourceDate: '2026-08-12' }).full, 'Supplier quotation · Meggitt · Reference Q-42 · Date 12-Aug-26')
  assert.equal(formatPriceSource({ priceSource: 'manual', priceList: 'Manual entry', addedAt: '2026-09-14T10:00:00.000Z' }).primary, 'Manual pricing')
  assert.equal(formatPriceSource({ priceSource: 'manual', priceList: 'Manual entry', addedAt: '2026-09-14T10:00:00.000Z' }).secondary, '14-Sep-26')
})

test('unmatched lead lines need pricing instead of appearing expired', () => {
  const { workbenchRows } = buildLeadProposalData({ ai: { lineItems: [{ description: 'Custom inspection module', qty: 1 }] } }, {}, [])
  assert.equal(workbenchRows[0].priceState, 'Needs pricing')
  assert.equal(workbenchRows[0].priceSource, 'manual')
})

test('legacy zero-price manual rows are repaired during normalization', () => {
  const line = normalizePriceFields({ priceSource: 'manual', priceList: 'Ad-hoc', priceState: 'Expired', listPrice: 0 })
  assert.equal(line.priceState, 'Needs pricing')
  const expired = normalizePriceFields({ priceSource: 'price-list', priceList: 'BNK 2025-Q4', priceState: 'Expired', listPrice: 100 })
  assert.equal(expired.priceState, 'Expired')
})

test('spares rollups normalize source currency to INR before margin math', () => {
  const financials = sparesLineFinancials({
    qty: 2,
    listUnitPrice: 100,
    currency: 'EUR',
    priceList: 'Meggitt',
  }, { baseRate: 100, usdBase: 90, cdErvContPct: 0, bnkDiscPct: 0 })

  assert.equal(financials.listUnitPriceINR, 10000)
  assert.equal(financials.lineTotalINR, 20000)
  assert.equal(financials.cogsINR, 20000)
})

test('B&K discount affects landed COGS, not customer-facing list revenue', () => {
  const financials = sparesLineFinancials({
    qty: 1,
    listUnitPrice: 100,
    currency: 'EUR',
    priceList: 'BNK 2026-01',
  }, { baseRate: 100, usdBase: 90, cdErvContPct: 0, bnkDiscPct: 50 })

  assert.equal(financials.listUnitPriceINR, 10000)
  assert.equal(financials.lineTotalINR, 10000)
  assert.equal(financials.cogsINR, 5000)
})

test('manual INR base cost remains INR and is used by downstream proposal totals', () => {
  const line = {
    confirmed: true,
    qty: 1,
    listUnitPrice: 1000,
    listPrice: 1000,
    baseCost: 600,
    currency: 'INR',
    priceList: 'Manual entry',
    desc: 'Manual item',
  }
  const bom = sparesProposalBom([line])
  assert.equal(bom[0].quoted, 1000)
  assert.equal(computeProposalTotals({ bom, costing: { baseRate: 100, cdErvContPct: 0, bnkDiscPct: 0 } }).cogs, 600)
})

test('display currency conversion uses the configured INR bridge', () => {
  const rates = normalizedCurrencyRates({ EUR: 100, USD: 80 })
  assert.equal(convertCurrency(100, 'EUR', 'INR', rates), 10000)
  assert.equal(convertCurrency(10000, 'INR', 'USD', rates), 125)
  assert.equal(convertCurrency(100, 'EUR', 'USD', rates), 125)
})
