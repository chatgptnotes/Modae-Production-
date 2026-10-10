import test from 'node:test'
import assert from 'node:assert/strict'
import XLSX from 'xlsx-js-style'
import { parseBetserWorkbook, parsePipelineFile } from '../src/pipelineImport.js'

test('pipeline upload parses a workbook for preview without importing it', () => {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Opp ID', 'Sell To Customer', 'Opportunity Name', 'Stage', 'Value'],
    ['2609012', 'Example Customer', 'Replacement parts', 'RFQ', 250000],
  ])
  XLSX.utils.book_append_sheet(workbook, sheet, 'Pipeline')
  const result = parsePipelineFile(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }))
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].sellTo, 'Example Customer')
  assert.equal(result.rows[0].oppName, 'Replacement parts')
  assert.deepEqual(result.missing, [])
})

test('Betser workbook import keeps only open current rows and all old closed rows', () => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['', '', 'Sl.', 'Opp ID', 'Sell To Customer*', 'Category*', 'Location', 'Customer Status', 'EUC Name*', 'EUC Location', 'Oppurtunity Name/Description*', 'LJS', 'Opp Type*', 'BU*', 'Segment', 'Product*', 'Prob (%)*', 'Value (K₹)*', 'COGS (K₹)*', 'GM (K₹)', 'GM%', 'Create Date*', 'Proposal Date', 'Order Date*', 'FQ-FY', 'Invoice Date*', 'Status*', 'Stage*', 'Closed Reason*', 'Contact Person*', 'Contact Phone #*', 'Last Updated', 'Forecast', 'Update/Remarks'],
    ['', '', 1, '2609012PP', 'Example Customer', 'EUC', 'Delhi', 'Green', 'Example EUC', 'Delhi', 'Open opportunity', 'PP', 'Spares', 'Energy', 'Thermal', 'B&K', 'High', 100, 50, 50, 0.5, '2026-01-01', null, '2026-03-01', 'Q4-2026', null, 'Open', 'RFQ', null, 'Buyer', '123', '2026-01-02', true, 'Follow up'],
    ['', '', 2, '2609013PP', 'Closed Customer', 'EUC', 'Delhi', 'Green', 'Closed EUC', 'Delhi', 'Closed current row', 'PP', 'Spares', 'Energy', 'Thermal', 'B&K', 'Low', 100, 50, 50, 0.5, '2026-01-01', null, '2026-03-01', 'Q4-2026', null, 'Closed', 'Lost', 'Price', 'Buyer', '123', '2026-01-02', false, 'Lost'],
  ]), 'Current Opps')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['', '', 'Sl.', 'Opp. Ref. ID', 'New Opp ID', 'Sell To Customer', 'Category', 'Location', 'End User Customer', 'EU Location', 'Oppurtunity/Project Name & Description', 'Owner', 'Opp Type', 'Product', 'Prob (%)', 'Value (K₹)', 'COGS (K₹)', 'GM (K₹)', 'GM%', 'Offer Date', 'EOD', 'EDD/ADD', 'Status', 'Stage', 'Closed Reason', 'Contact Person', 'Contact Phone #', 'Updated On', 'Forecast', 'Update/Remarks'],
    ['', '', 1, 'OLD-001', '2501001RS', 'Old Customer', 'OEM', 'Mumbai', 'Old EUC', 'Mumbai', 'Old opportunity', 'RS', 'Project', 'B&K', 'Low', 200, 100, 100, 0.5, '2025-01-01', null, null, 'Closed', 'Lost', 'Price', 'Buyer', '456', '2025-02-01', false, 'Lost'],
  ]), 'Old Closed Opps')

  const result = parseBetserWorkbook(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }))
  assert.equal(result.error, '')
  assert.equal(result.opportunities.length, 2)
  assert.deepEqual(result.opportunities.map(row => row.id), ['2609012PP', '2501001RS'])
  assert.equal(result.opportunities.filter(row => row.status === 'Open').length, 1)
  assert.equal(result.opportunities.filter(row => row.status === 'Closed').length, 1)
  assert.equal(result.customers.length, 2)
})
