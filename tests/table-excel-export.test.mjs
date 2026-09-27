import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { buildTableWorkbook } from '../src/proposal/tableExcelExport.js'

test('buildTableWorkbook creates one compact filtered worksheet', async () => {
  const workbook = buildTableWorkbook('Pipeline', ['Sl', 'Opportunity Name'], [[1, 'A long opportunity name']])

  assert.equal(workbook.worksheets.length, 1)
  assert.equal(workbook.worksheets[0].name, 'Pipeline')
  assert.equal(workbook.worksheets[0].rowCount, 2)
  assert.equal(workbook.worksheets[0].columnCount, 2)
  assert.equal(workbook.worksheets[0].autoFilter, 'A1:B2')
  assert.equal(workbook.worksheets[0].views[0].state, 'frozen')
  assert.equal(workbook.worksheets[0].views[0].ySplit, 1)
  assert.equal(workbook.worksheets[0].getColumn(2).width, 25)

  const bytes = await workbook.xlsx.writeBuffer()
  const roundTrip = new ExcelJS.Workbook()
  await roundTrip.xlsx.load(bytes)
  assert.deepEqual(roundTrip.worksheets[0].getRow(2).values.slice(1), [1, 'A long opportunity name'])
})
