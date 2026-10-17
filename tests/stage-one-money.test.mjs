import test from 'node:test'
import assert from 'node:assert/strict'
import { drilldownMoney } from '../src/pages/myDashboard/drilldown.js'
import { fmtRupeesFromK, rupeesToK } from '../src/utils.js'
import { normalizeCustomerRow } from '../src/customerImport.js'

test('dashboard drilldowns show actual INR and preserve stored thousand-rupee values', () => {
  assert.equal(drilldownMoney(1234.567), '₹12,34,567')
  assert.equal(drilldownMoney(0), '₹0')
  assert.equal(fmtRupeesFromK(rupeesToK(1234567)), '₹12,34,567')
})

test('customer import preserves explicit classification and leaves missing classification for manual review', () => {
  assert.equal(normalizeCustomerRow({ Customer: 'New customer' }).status, 'Unclassified')
  assert.equal(normalizeCustomerRow({ Customer: 'Reviewed customer', Class: 'Yellow' }).status, 'Yellow')
  const legacy = normalizeCustomerRow({ Customer: 'Legacy customer', Class: 'Blue' })
  assert.equal(legacy.status, 'Red')
  assert.equal(legacy.legacyCustomerClass, 'Blue')
})
