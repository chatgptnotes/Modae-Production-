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

test('existing catalogues migrate to a preserved initial version', () => {
  const state = migrate(JSON.parse(JSON.stringify(seedState())))
  const list = state.priceLists.BNK
  assert.ok(list.activeVersionId)
  assert.equal(list.versions.length, 1)
  assert.equal(list.versions[0].parts.length, list.parts.length)
  assert.equal(list.versions[0].version, list.version)
})
