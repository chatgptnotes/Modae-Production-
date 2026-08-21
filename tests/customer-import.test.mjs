// The Customer Master's add/upload of existing customers (20 Aug review:
// "in the admin section, we will add an option... Add or upload"). The
// client's Excel arrives in whatever shape their sheet has, so the mapper is
// tolerant of header wording — and existing rows are never overwritten.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx-js-style'

import { fieldForHeader, normalizeStatus, normalizeCustomerRow, parseCustomerFile } from '../src/customerImport.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const bufferFor = rows => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Customers')
  return new Uint8Array(XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })).buffer
}

test('header mapping tolerates the wordings a client sheet actually uses', () => {
  assert.equal(fieldForHeader('Customer Name'), 'name')
  assert.equal(fieldForHeader('Sell-To Customer'), 'name')
  assert.equal(fieldForHeader('COMPANY'), 'name')
  assert.equal(fieldForHeader('Customer Class'), 'status')
  assert.equal(fieldForHeader('Colour Code'), 'status')
  assert.equal(fieldForHeader('Payment Terms'), 'payment')
  assert.equal(fieldForHeader('KYC Status'), 'kyc')
  assert.equal(fieldForHeader('City'), 'location')
  assert.equal(fieldForHeader('Opportunity Value'), null, 'unknown columns are ignored, not guessed')
})

test('the class normalises to the four customer statuses, defaulting Green', () => {
  assert.equal(normalizeStatus('GREEN'), 'Green')
  assert.equal(normalizeStatus('green customer'), 'Green')
  assert.equal(normalizeStatus('Yellow'), 'Amber')
  assert.equal(normalizeStatus('red'), 'Red')
  assert.equal(normalizeStatus('New'), 'Blue')
  // Existing verified accounts are the whole point of the import.
  assert.equal(normalizeStatus(''), 'Green')
  assert.equal(normalizeStatus('whatever'), 'Green')
})

test('a row without a recognisable name is dropped, not invented', () => {
  assert.equal(normalizeCustomerRow({ Category: 'OEM', Status: 'Green' }), null)
  assert.equal(normalizeCustomerRow({ 'Customer Name': '   ' }), null)
})

test('an uploaded workbook round-trips into master records', () => {
  const rows = parseCustomerFile(bufferFor([
    { 'Customer Name': 'Adani Power Ltd', 'Customer Class': 'Green', 'Customer Type': 'EUC', 'Payment Terms': 'Avg 45 days', City: 'Ahmedabad' },
    { 'Customer Name': 'Fresh Trader FZE', 'Customer Class': 'Red' },
    { 'Customer Name': 'No Class Co' },
  ]))
  assert.deepEqual(rows[0], {
    name: 'Adani Power Ltd', category: 'EUC', status: 'Green', kyc: 'Valid',
    payment: 'Avg 45 days', location: 'Ahmedabad',
  })
  assert.equal(rows[1].status, 'Red')
  assert.equal(rows[1].kyc, 'Pending', 'a non-Green import still needs verification')
  assert.equal(rows[2].status, 'Green')
  assert.equal(rows[2].payment, '—')
})

test('the mock upload button is gone and the real path is wired', () => {
  const customers = read('src/pages/Customers.jsx')
  assert.doesNotMatch(customers, /alert\(/, 'the mock alert must be gone')
  assert.match(customers, /parseCustomerFile/)
  assert.match(customers, /store\.importCustomers\(fresh/)
  assert.match(customers, /accept="\.xlsx,\.xls,\.csv"/)
  assert.match(customers, /never overwritten/)
  // Admin-only: the buttons sit inside the canEditDirect guard.
  assert.match(customers, /\{canEditDirect && \(/)
  const store = read('src/store.jsx')
  assert.match(store, /importCustomers\(rows, reason = ''\)/)
  assert.match(store, /'Customers imported'/)
})
