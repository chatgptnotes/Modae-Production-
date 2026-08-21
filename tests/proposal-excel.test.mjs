import test from 'node:test'
import assert from 'node:assert/strict'
import { proposalWorkbookRows, buildProposalWorkbook, buildTableWorkbook } from '../src/proposal/excelExport.js'

const input = {
  p: {
    revision: '00', revisionDate: '2026-08-21', ourRef: '2608227RS', bidStage: 'Binding', bidType: 'Priced',
    addressee: 'M/s. Customer', kindAttn: 'Buyer', subject: 'VMS spares', project: 'Retrofit',
    bom: [{ desc: 'Probe', pn: 'P-1', qtyPerUnit: 2, common: 1, spares: 0, uom: 'EA' }],
  },
  opp: { id: '2608227RS', sellTo: 'Customer' },
  doc: { letterSalutation: 'Dear Sir,', letterBody: 'Offer body', letterClose: 'Best Regards,', preparedBy: {}, docTerms: [{ label: 'Validity', text: '30 days' }] },
  priced: true,
  totalQty: line => line.qtyPerUnit + line.common + line.spares,
  lineQuoted: () => 100,
  route: 'Spares',
}

test('proposal Excel rows contain the cover and customer pricing sheets', () => {
  const { cover, pricing } = proposalWorkbookRows(input)
  assert.equal(cover[6][1], '2608227RS')
  assert.deepEqual(pricing[2], ['Sl.', 'Item Description', 'Model / Part Number', 'Total Qty', 'UOM', 'Unit Price ₹', 'Total Price ₹'])
  assert.deepEqual(pricing[3], [1, 'Probe', 'P-1', 3, 'EA', 100, 300])
  assert.deepEqual(pricing.at(-1), ['1. Validity', '30 days'])
})

test('restricted Excel rows omit customer prices', () => {
  const { pricing } = proposalWorkbookRows({ ...input, priced: false })
  assert.deepEqual(pricing[2], ['Sl.', 'Item Description', 'Model / Part Number', 'Total Qty', 'UOM'])
  assert.equal(pricing[3].length, 5)
})

// 18 Aug branding guideline: document templates in Candara, 11pt body,
// 12pt headings — the workbook is the document the customer opens.
test('workbook cells carry the Candara document face', () => {
  const workbook = buildProposalWorkbook(input)
  const pricing = workbook.Sheets['Firm Offer Rev-00']
  assert.deepEqual(pricing.A3.s.font, { name: 'Candara', sz: 12, bold: true }, 'header row: 12pt bold')
  assert.deepEqual(pricing.B4.s.font, { name: 'Candara', sz: 11 }, 'body row: 11pt')
  const cover = workbook.Sheets['Cover Letter']
  assert.deepEqual(cover.B1.s.font, { name: 'Candara', sz: 11 })
})

test('Excel text cells wrap and long rows grow', () => {
  const workbook = buildProposalWorkbook({ ...input, doc: { ...input.doc, letterBody: 'long '.repeat(100) } })
  const cover = workbook.Sheets['Cover Letter']
  const pricing = workbook.Sheets['Firm Offer Rev-00']
  assert.equal(cover.B20.s.alignment.wrapText, true)
  assert.ok(cover['!rows'][19].hpt > 20)
  assert.equal(pricing.B3.s.alignment.wrapText, true)
  assert.ok(pricing['!rows'][3].hpt >= 20)
})

// The tracker's pipeline export — the report the client opens in Excel.
test('the table workbook wraps long text inside capped columns', () => {
  const headers = ['Sl', 'Opportunity Name/Description', 'Value']
  const rows = [
    [1, 'Gandikota PSP — Vibration & Air Gap Monitoring, 7 Units (5×300MW) + (2×150MW)', 100],
    [2, 'Short', 2380],
  ]
  const sheet = buildTableWorkbook('Pipeline', headers, rows).Sheets.Pipeline
  const widths = sheet['!cols'].map(c => c.wch)
  assert.equal(widths[1], 42, 'a long text column is capped so it wraps instead of sprawling')
  assert.ok(widths[0] >= 10 && widths[0] < 42, 'short columns stay tight')
  assert.equal(sheet.B2.s.alignment.wrapText, true, 'text cells wrap')
  assert.notEqual(sheet.C2.s.alignment.wrapText, true, 'numbers are not wrapped')
  assert.ok(sheet['!rows'][1].hpt > sheet['!rows'][2].hpt, 'the wrapped row grows taller than the short one')
  assert.equal(sheet.A1.s.font.bold, true, 'the header row is bold')
})
