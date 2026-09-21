import test from 'node:test'
import assert from 'node:assert/strict'
import XLSX from 'xlsx-js-style'

import { ADDER_HEADERS, PART_HEADERS, buildPriceListTemplate, parsePriceListFile } from '../src/priceListImport.js'
import { migrate, seedState } from '../src/appState.js'

const bufferFor = (parts, adders) => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(parts), 'Parts')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(adders), 'Adders')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
}

test('template exposes structured parts and adders sheets', () => {
  const workbook = buildPriceListTemplate('BNK', 'EUR')
  assert.deepEqual(XLSX.utils.sheet_to_json(workbook.Sheets.Parts, { header: 1 })[0], PART_HEADERS)
  assert.deepEqual(XLSX.utils.sheet_to_json(workbook.Sheets.Adders, { header: 1 })[0], ADDER_HEADERS)
  assert.ok(workbook.Sheets.Instructions)
})

test('price-list workbook imports parts and multiple adders', () => {
  const result = parsePriceListFile(bufferFor([
    { 'Part Number': 'RK16-BASE', Description: 'Base rack', Price: '2,000', Currency: 'EUR' },
  ], [
    { 'Part Number': 'RK16-BASE', 'Adder Code': 'CE', 'Adder Description': 'CE mark', 'Adder Price': 110 },
    { 'Part Number': 'RK16-BASE', 'Adder Code': 'FMK', 'Adder Description': 'Flush mount kit', 'Adder Price': 65 },
  ]))
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.parts[0].adders, [
    { code: 'CE', desc: 'CE mark', price: 110 },
    { code: 'FMK', desc: 'Flush mount kit', price: 65 },
  ])
})

test('invalid rows are reported without producing valid adders', () => {
  const result = parsePriceListFile(bufferFor([
    { 'Part Number': 'DUP', Description: 'One', Price: 10 },
    { 'Part Number': 'DUP', Description: 'Two', Price: -1 },
  ], [
    { 'Part Number': 'MISSING', 'Adder Code': 'A', 'Adder Description': 'Bad ref', 'Adder Price': 1 },
  ]))
  assert.ok(result.errors.some(error => error.includes('duplicate Part Number')))
  assert.ok(result.errors.some(error => error.includes('non-negative number')))
  assert.ok(result.errors.some(error => error.includes('does not exist on Parts')))
  assert.equal(result.parts[0].adders.length, 0)
})

// A manufacturer's own price file looks nothing like the template, and an
// upload has to read as much of it as it can rather than refusing it.
const supplierBuffer = sheets => {
  const workbook = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name)
  }
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
}

test('a supplier workbook is read even though it is not the template', () => {
  const result = parsePriceListFile(supplierBuffer({
    // Empty column A, header on row 1, German and English descriptions, and a
    // price column named after the list edition rather than "Price".
    Active: [
      ['', 'Code', 'Produktbezeichnung', 'Product', 'ISP110 2026 EUR'],
      ['', '', 'Cables', 'Cables', ''],
      ['', 'AC-1112', 'Signalleitung', 'Signal cable 4 x 0.5 mm²', 120],
      ['', 'AC-113', 'Signalleitung PVC', 'Signal cable PVC jacket', 95],
    ],
    // A second tab, and a price written once for a block of order codes.
    Sensors: [
      ['', 'Code', 'Mat-No.', 'Product', 'ISP110'],
      ['', '', '', '', 'EUR'],
      ['', '', '', 'Price Category A', ''],
      ['', 'IN-081/1', 'C104558.001', 'Sensor, full length thread', 300],
      ['', 'IN-081/3', 'C104558.001', 'Sensor, reverse mount', ''],
    ],
  }), 'EUR')

  assert.deepEqual(result.errors, [])
  assert.equal(result.currency, 'EUR')
  const byPn = Object.fromEntries(result.parts.map(part => [part.pn, part]))
  assert.equal(byPn['AC-1112'].desc, 'Signal cable 4 x 0.5 mm²', 'prefers the English column')
  assert.equal(byPn['AC-1112'].price, 120)
  assert.equal(byPn['IN-081/3'].price, 300, 'a merged block price carries down')
  assert.ok(!result.parts.some(part => part.desc === 'Cables'), 'section headings are not products')
  assert.equal(result.report.sheets.length, 2)
  assert.ok(result.parts.every(part => part.pn.trim() === part.pn && Number.isFinite(part.price)))
})

test('AI column mapping overrides misleading supplier headers', () => {
  const buffer = supplierBuffer({
    Active: [
      ['Serial', 'Internal group', 'B&K order code', 'Product description', 'List amount'],
      [1, 'Sensors', 'VC-8000-001', 'VC8000 monitor module', 1250],
      [2, 'Sensors', 'VC-8000-002', 'VC8000 input module', 980],
    ],
  })
  const result = parsePriceListFile(buffer, 'EUR', {
    currency: 'EUR',
    sheets: [{
      name: 'Active', headerRow: 0, partNumberColumn: 2,
      partNumberPrefixColumn: -1, descriptionColumn: 3, priceColumn: 4,
    }],
  })
  assert.deepEqual(result.parts.map(part => part.pn), ['VC-8000-001', 'VC-8000-002'])
  assert.deepEqual(result.parts.map(part => part.price), [1250, 980])
})

test('a configurator sheet becomes one part per model with its options as adders', () => {
  const result = parsePriceListFile(supplierBuffer({
    Sheet1: [
      ['', 'Prefix', '', '', 'Description'],
      ['', '', 'MODEL OPTIONS', '', ''],
      ['PROD CATEGORY', 'PREFIX', 'MODEL', 'A', 'B', 'DESCRIPTION', 'List'],
      ['Switch', 'SW', '440', '', '', '440A-B Electronic Switch', 500],
      ['Switch', 'SW', '440', 'DR', '', 'A: Dual Trip Output', 40],
      ['Switch', 'SW', '440', '', '-2', 'B: 4-20 mA output', 25],
      ['Seismic', 'ST', '162VTS', '', '', 'Vibration transmitter', 700],
    ],
  }), 'USD')

  assert.deepEqual(result.errors, [])
  const switchPart = result.parts.find(part => part.pn === 'SW440')
  assert.ok(switchPart, 'part number joins the prefix and model columns')
  assert.equal(switchPart.price, 500)
  assert.deepEqual(switchPart.adders.map(adder => adder.code), ['DR', '-2'])
  assert.equal(switchPart.adders[0].price, 40)
  assert.ok(result.parts.some(part => part.pn === 'ST162VTS'))
  assert.equal(result.parts.length, 2, 'option rows do not become separate parts')
})

test('an unreadable workbook reports an error instead of importing blank rows', () => {
  const result = parsePriceListFile(supplierBuffer({
    Notes: [['Supplier price file'], ['Contact sales for pricing']],
  }), 'EUR')
  assert.equal(result.parts.length, 0)
  assert.ok(result.errors.length, 'nothing usable is an error, so the import stays blocked')
})

test('existing catalogues migrate to a preserved initial version', () => {
  const state = migrate(JSON.parse(JSON.stringify(seedState())))
  const list = state.priceLists.BNK
  assert.ok(list.activeVersionId)
  assert.equal(list.versions.length, 1)
  assert.equal(list.versions[0].parts.length, list.parts.length)
  assert.equal(list.versions[0].version, list.version)
})
