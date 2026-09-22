import test from 'node:test'
import assert from 'node:assert/strict'
import { applyAdjustment, formatPriceSource, resolvePriceSource, reconcilePriceSource, normalizePriceFields, isConfirmableSparesLine, isMissingSparesDescription, sparesLineFinancials } from '../src/pricing.js'
import { buildLeadProposalData } from '../src/leadBoq.js'
import { sparesProposalBom } from '../src/proposal/sparesBoq.js'
import { computeProposalTotals } from '../src/gates.js'
import { convertCurrency, normalizedCurrencyRates } from '../src/currency.js'
import { clampCosting, effectiveRate } from '../src/utils.js'

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

test('markup is capped at 100% so an accidental value cannot inflate a quote', () => {
  assert.equal(applyAdjustment(100, { markupPct: 622323 }), 200)
  assert.equal(normalizePriceFields({ markupPct: 622323 }).markupPct, 100)
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

test('source reconciliation promotes an exact approved price-list match', () => {
  const line = reconcilePriceSource({ pn: 'P-1', listPrice: 100, listUnitPrice: 100, currency: 'EUR', priceSource: 'manual', priceList: 'Manual pricing' }, lists, [])
  assert.equal(line.priceSource, 'price-list')
  assert.equal(line.priceSourceName, 'BNK')
  assert.equal(line.priceSourceVersion, '2026-01')
  assert.equal(line.priceSourceRef, 'P-1')
})

test('source reconciliation keeps a different amount as a manual override', () => {
  const line = reconcilePriceSource({ pn: 'P-1', listPrice: 101, listUnitPrice: 101, currency: 'EUR', priceSource: 'manual', priceList: 'Manual pricing' }, lists, [])
  assert.equal(line.priceSource, 'manual')
  assert.equal(line.priceList, 'Manual pricing')
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

test('sourcing confirmation requires positive quantity and price', () => {
  assert.equal(isConfirmableSparesLine({ qty: 1, listUnitPrice: 10 }), true)
  assert.equal(isConfirmableSparesLine({ qty: 0, listUnitPrice: 10 }), false)
  assert.equal(isConfirmableSparesLine({ qty: 1, listUnitPrice: 0 }), false)
  assert.equal(isConfirmableSparesLine({ qty: 1, listPrice: 0 }), false)
  assert.equal(normalizePriceFields({ qty: 1, listPrice: 0, confirmed: true }).confirmed, false)
  assert.equal(normalizePriceFields({ qty: 0, listPrice: 10, confirmed: true }).confirmed, false)
})

test('numeric customer references without descriptions require clarification', () => {
  const line = { custRef: '2', qty: 1, listPrice: 23, listUnitPrice: 23 }
  assert.equal(isMissingSparesDescription(line), true)
  assert.equal(isConfirmableSparesLine(line), false)
  assert.equal(isMissingSparesDescription({ ...line, desc: 'Shielded signal cable' }), false)
})

test('positive manual pricing confirms the row while non-manual pricing remains explicit', () => {
  assert.equal(normalizePriceFields({ qty: 1, listPrice: 32, priceList: 'Manual pricing', confirmed: false }).confirmed, true)
  assert.equal(normalizePriceFields({ qty: 1, listPrice: 32, priceList: 'BNK 2026-Q2', confirmed: false }).confirmed, false)
  assert.equal(normalizePriceFields({ qty: 1, listPrice: 0, priceList: 'Manual pricing', confirmed: false }).confirmed, false)
})

test('spares rollups normalize source currency to INR before margin math', () => {
  const financials = sparesLineFinancials({
    qty: 2,
    listUnitPrice: 100,
    currency: 'EUR',
    priceList: 'Meggitt',
  }, { baseRate: 100, usdBase: 90, cdErvContPct: 0, bnkDiscPct: 0 })

  assert.equal(financials.listUnitPriceINR, 10000)
  assert.equal(financials.landedUnitCostINR, 10000)
  assert.equal(financials.lineTotalINR, 20000)
  assert.equal(financials.cogsINR, 20000)
})

test('industry costing applies import factors before markup', () => {
  const financials = sparesLineFinancials({
    qty: 1,
    listUnitPrice: 100,
    currency: 'EUR',
    discountPct: 10,
    markupPct: 20,
    priceList: 'Supplier quote',
  }, { currencyRates: { EUR: 100 }, customsDutyPct: 10, ervPct: 5, handlingPct: 5, bnkDiscPct: 0 })

  assert.equal(financials.listUnitPriceINR, 10000)
  assert.equal(financials.discountedPurchaseUnitPriceINR, 9000)
  assert.equal(financials.landedUnitCostINR, 10800)
  assert.equal(financials.adjustedUnitPriceINR, 12960)
  assert.equal(financials.lineTotalINR, 12960)
  assert.equal(financials.cogsINR, 10800)
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

test('Spares Proposal COGS matches discounted Sourcing COGS', () => {
  const costing = {
    currencyRates: { EUR: 100, USD: 90 },
    customsDutyPct: 10,
    ervPct: 5,
    handlingPct: 5,
    bnkDiscPct: 0,
  }
  const line = {
    confirmed: true,
    qty: 1,
    listUnitPrice: 100,
    listPrice: 100,
    currency: 'EUR',
    priceList: 'Ad-hoc EUR',
    discountPct: 10,
    markupPct: 20,
    desc: 'Imported item',
  }
  const sourcing = sparesLineFinancials(line, costing)
  const bom = sparesProposalBom([line], {}, costing)
  const proposal = computeProposalTotals({ route: 'Spares', bom, costing })

  assert.equal(sourcing.landedUnitCostINR, 10800)
  assert.equal(sourcing.adjustedUnitPriceINR, 12960)
  assert.equal(proposal.cogs, sourcing.cogsINR)
  assert.equal(proposal.gmPct, ((12960 - sourcing.cogsINR) / 12960) * 100)
})

test('split import costing inputs clamp to 200%', () => {
  assert.equal(clampCosting('customsDutyPct', 250), 200)
  assert.equal(clampCosting('ervPct', 250), 200)
  assert.equal(clampCosting('handlingPct', 250), 200)
})

test('display currency conversion uses the configured INR bridge', () => {
  const rates = normalizedCurrencyRates({ EUR: 100, USD: 80 })
  assert.equal(convertCurrency(100, 'EUR', 'INR', rates), 10000)
  assert.equal(convertCurrency(10000, 'INR', 'USD', rates), 125)
  assert.equal(convertCurrency(100, 'EUR', 'USD', rates), 125)
})

test('source list unit can be displayed and edited through the selected currency', () => {
  const rates = normalizedCurrencyRates({ EUR: 100, USD: 80 })
  const sourcePrice = 100
  const displayedUsd = convertCurrency(convertCurrency(sourcePrice, 'EUR', 'INR', rates), 'INR', 'USD', rates)
  assert.equal(displayedUsd, 125)
  assert.equal(convertCurrency(displayedUsd, 'USD', 'INR', rates), 10000)
})

test('combined CD, ERV and handling factor applies independently to EUR and USD', () => {
  const costing = { currencyRates: { EUR: 100, USD: 80 }, customsDutyPct: 10, ervPct: 5, handlingPct: 5, bnkDiscPct: 0 }
  assert.equal(effectiveRate(costing, 'EUR', false), 120)
  assert.equal(effectiveRate(costing, 'USD', false), 96)
  assert.equal(effectiveRate(costing, 'INR', false), 1)
})
