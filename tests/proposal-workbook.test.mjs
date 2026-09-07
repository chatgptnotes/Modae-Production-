import test from 'node:test'
import assert from 'node:assert/strict'
import XLSX from 'xlsx-js-style'

import { parseProposalWorkbook, serializeProposalWorkbook, updateWorkbookCell } from '../src/proposal/workbook.js'
import { seedConfig } from '../src/seed.js'

function workbookBytes() {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['Proposal', 'Template'],
    ['Customer', 'Example'],
  ]), 'Cover Letter')
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['Item', 'Qty'],
    ['Sensor', 2],
  ]), 'Firm Offer')
  return XLSX.write(book, { bookType: 'xlsx', type: 'array' })
}

test('proposal workbook parser keeps sheets and editable cell values', () => {
  const parsed = parseProposalWorkbook(workbookBytes(), 'template.xlsx')
  assert.deepEqual(parsed.sheets.map(sheet => sheet.name), ['Cover Letter', 'Firm Offer'])
  assert.equal(parsed.sheets[1].rows[1][1], '2')

  const edited = updateWorkbookCell(parsed, 'Firm Offer', 1, 0, 'Replacement sensor')
  assert.equal(edited.sheets[1].rows[1][0], 'Replacement sensor')
  assert.equal(parsed.sheets[1].rows[1][0], 'Sensor')
})

test('edited proposal workbooks can be serialized and parsed again', () => {
  const parsed = parseProposalWorkbook(workbookBytes(), 'template.xlsx')
  const edited = updateWorkbookCell(parsed, 'Cover Letter', 1, 1, 'Updated customer')
  const roundTrip = parseProposalWorkbook(serializeProposalWorkbook(edited), 'template.xlsx')
  assert.equal(roundTrip.sheets[0].rows[1][1], 'Updated customer')
})

test('proposal workbook parser keeps a style matrix for rendered worksheet cells', () => {
  const parsed = parseProposalWorkbook(workbookBytes(), 'template.xlsx')
  assert.equal(parsed.sheets[0].styles.length, parsed.sheets[0].rows.length)
  assert.equal(parsed.sheets[0].styles[0].length, parsed.sheets[0].rows[0].length)
  const roundTrip = parseProposalWorkbook(serializeProposalWorkbook(parsed), 'template.xlsx')
  assert.equal(roundTrip.sheets[0].styles.length, roundTrip.sheets[0].rows.length)
})

test('seed config has a proposal template registry for migration', () => {
  assert.ok(Array.isArray(seedConfig.uploads.proposalTemplates))
})
