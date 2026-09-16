import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPricing } from '../src/proposal/docProps.js'
import { currencySymbol, fromInr } from '../src/currency.js'

test('proposal currency converts customer prices but keeps internal totals in INR', () => {
  const proposal = {
    units: 1,
    route: 'Project',
    sourceCurrency: 'EUR',
    costing: { currencyRates: { INR: 1, EUR: 112, USD: 90 } },
    bom: [{ desc: 'Test item', quoted: 1120, qtyPerUnit: 1, common: 0, spares: 0 }],
  }
  const pricing = buildPricing({ priceLists: {}, adhocParts: [], vendorQuotes: [], sparesLines: [] }, proposal)
  assert.equal(pricing.lineQuoted(proposal.bom[0]), 10)
  assert.equal(pricing.computeTotals(proposal).target, 1120)
  assert.equal(fromInr(1120, 'EUR', proposal.costing.currencyRates), 10)
  assert.equal(currencySymbol('EUR'), '€')
})
