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

test('serialized proposal workbooks drop trailing empty rows and columns', () => {
  const parsed = parseProposalWorkbook(workbookBytes(), 'template.xlsx')
  const bloated = {
    ...parsed,
    sheets: parsed.sheets.map(sheet => ({
      ...sheet,
      rows: [...sheet.rows, ['', '', '', ''], ['', '', '', '']],
      styles: [...sheet.styles, ['', '', '', ''], ['', '', '', '']],
    })),
  }
  const roundTrip = parseProposalWorkbook(serializeProposalWorkbook(bloated), 'template.xlsx')
  assert.deepEqual(roundTrip.sheets.map(sheet => sheet.rows.length), [2, 2])
  assert.deepEqual(roundTrip.sheets[0].rows.at(-1), ['Customer', 'Example'])
})

test('proposal workbook parser keeps a style matrix for rendered worksheet cells', () => {
  const parsed = parseProposalWorkbook(workbookBytes(), 'template.xlsx')
  assert.equal(parsed.sheets[0].styles.length, parsed.sheets[0].rows.length)
  assert.equal(parsed.sheets[0].styles[0].length, parsed.sheets[0].rows[0].length)
  const roundTrip = parseProposalWorkbook(serializeProposalWorkbook(parsed), 'template.xlsx')
  assert.equal(roundTrip.sheets[0].styles.length, roundTrip.sheets[0].rows.length)
})

test('proposal workbook parser drops an empty leading worksheet column', () => {
  const book = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    ['', 'Date', '5-Sep-2026'],
    ['', 'Our Ref:', '2609001PJS'],
  ])
  XLSX.utils.book_append_sheet(book, sheet, 'Cover Letter')
  const parsed = parseProposalWorkbook(XLSX.write(book, { bookType: 'xlsx', type: 'array' }), 'cover.xlsx')
  assert.deepEqual(parsed.sheets[0].rows[0], ['Date', '5-Sep-2026'])
})

test('proposal workbook parser drops merge-only logo columns before content', () => {
  const book = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    ['', ''],
    ['', '5-Sep-2026'],
    ['', 'Our Ref:'],
  ])
  sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]
  XLSX.utils.book_append_sheet(book, sheet, 'Cover Letter')
  const parsed = parseProposalWorkbook(XLSX.write(book, { bookType: 'xlsx', type: 'array' }), 'cover.xlsx')
  assert.deepEqual(parsed.sheets[0].rows[0], ['5-Sep-2026'])
  assert.deepEqual(parsed.sheets[0].merges, [])
})

test('proposal workbook parser drops only the blank rows above customer content', () => {
  const book = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    ['', '', '', '', '', '', '', 'internal note'],
    ['', '', '', '', '', '', '', 'another internal note'],
    ['Title', 'Proposal'],
    ['', 'Customer detail'],
    ['', ''],
    ['Total', '100'],
  ])
  XLSX.utils.book_append_sheet(book, sheet, 'Firm Offer')
  const parsed = parseProposalWorkbook(XLSX.write(book, { bookType: 'xlsx', type: 'array' }), 'offer.xlsx')
  assert.deepEqual(parsed.sheets[0].rows[0].slice(0, 2), ['Title', 'Proposal'])
  assert.deepEqual(parsed.sheets[0].rows.at(-1).slice(0, 2), ['Total', '100'])
})

test('proposal workbook parser ignores branding-only rows above customer content', () => {
  const book = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    ['', '', '', '', '', 'Your Partners In Achieving Excellence'],
    ['', '', '', '', '', 'Your Partners In Achieving Excellence'],
    ['Item-10', 'Proposal for NMCL'],
    ['Sl. No.', 'Scope / Equipment Description'],
  ])
  XLSX.utils.book_append_sheet(book, sheet, 'Firm Rev-00')
  const parsed = parseProposalWorkbook(XLSX.write(book, { bookType: 'xlsx', type: 'array' }), 'offer.xlsx')
  assert.deepEqual(parsed.sheets[0].rows[0].slice(0, 2), ['Item-10', 'Proposal for NMCL'])
})

test('seed config has a proposal template registry for migration', () => {
  assert.ok(Array.isArray(seedConfig.uploads.proposalTemplates))
})
