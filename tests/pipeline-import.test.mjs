import test from 'node:test'
import assert from 'node:assert/strict'
import XLSX from 'xlsx-js-style'
import { parsePipelineFile } from '../src/pipelineImport.js'

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
