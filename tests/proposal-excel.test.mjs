import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ExcelJS from 'exceljs'
import { proposalWorkbookRows, buildProposalWorkbook, buildTableWorkbook } from '../src/proposal/excelExport.js'
import { generateProposalWorkbook } from '../src/proposal/templateExcelExport.js'
import { buildPricing } from '../src/proposal/docProps.js'
import { defaultCosting } from '../src/seed.js'

const input = {
  p: {
    revision: '00', revisionDate: '2026-08-21', ourRef: '2608227RS', bidStage: 'Biding', bidType: 'Priced',
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
  assert.deepEqual(pricing[2], ['Sl.', 'Item Description', 'Proposed Model/Part No.', 'Qty', 'Unit Price ₹', 'Total Price ₹'])
  assert.deepEqual(pricing[3], [1, 'Probe', 'P-1', 3, 100, 300])
  assert.deepEqual(pricing.at(-1), ['1. Validity', '30 days'])
})

test('restricted Excel rows omit customer prices', () => {
  const { pricing } = proposalWorkbookRows({ ...input, priced: false })
  assert.deepEqual(pricing[2], ['Sl.', 'Item Description', 'Proposed Model/Part No.', 'Qty'])
  assert.equal(pricing[3].length, 4)
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

test('Spares proposal pricing falls back to the confirmed sourcing line', () => {
  const p = { route: 'Spares', units: 1, costing: { ...defaultCosting }, bom: [{ pn: 'P-1', desc: 'Probe', listPrice: '', adders: [], currency: 'EUR' }] }
  const { linePrice, lineQuoted } = buildPricing({
    priceLists: {}, adhocParts: [],
    sparesLines: [{ pn: 'P-1', desc: 'Probe', listPrice: 1250, currency: 'EUR' }],
  }, p)
  assert.equal(linePrice(p.bom[0]), 1250)
  assert.ok(lineQuoted(p.bom[0]) > 0)
})

test('exact proposal export preserves template artwork, merges and print layout', async () => {
  const templateBuffer = fs.readFileSync('branding/Further Inputs/Further Inputs/Proposals and T&Cs/Spares Opp-1 (Won almost)/Spares Firm Offer Rev00 2May2026.xlsx')
  const logoBuffer = fs.readFileSync('branding/mod-ae/assets/modae-official-logo.png')
  const output = await generateProposalWorkbook({
    templateBuffer,
    logoBuffer,
    route: 'Spares',
    p: { revision: '00', revisionDate: '2026-08-21', ourRef: '2608227RS', bidStage: 'Biding', bidType: 'Priced', addressee: 'M/s Customer', kindAttn: 'Buyer', subject: 'VMS spares', project: 'Retrofit', bom: [{ desc: 'Probe', pn: 'P-1', qtyPerUnit: 2, common: 1, spares: 0, uom: 'EA' }] },
    opp: { id: '2608227RS', sellTo: 'Customer' },
    doc: { letterSalutation: 'Dear Sir', letterBody: 'Offer body', letterClose: 'Best Regards', preparedBy: {}, docTerms: [{ label: 'Validity', text: '30 days' }] },
    totalQty: line => line.qtyPerUnit + line.common + line.spares,
    lineQuoted: () => 100,
  })
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(output)
  const cover = workbook.getWorksheet('Cover Letter')
  const firm = workbook.getWorksheet('Firm Rev-00')
  assert.ok(cover && firm)
  assert.ok(cover.getImages().length > 0)
  assert.ok(firm.getImages().length > 0)
  assert.equal(cover.pageSetup.orientation, 'portrait')
  assert.equal(firm.pageSetup.orientation, 'landscape')
  assert.equal(firm.pageSetup.paperSize, 9)
  assert.equal(firm.pageSetup.fitToWidth, 1)
  assert.equal(firm.getCell('G10').value.formula, 'F10*E10')
  assert.equal(firm.getCell('C10').value, 'Probe')
  assert.equal(cover.getCell('B24').alignment.wrapText, true)
  assert.equal(cover.views[0].showGridLines, false)
  assert.deepEqual(
    ['B11:Q11', 'B12:Q12', 'B13:Q13', 'B14:Q14', 'C16:Q16', 'C18:Q18', 'C20:Q20', 'B22:Q22', 'B24:Q24', 'B26:Q26']
      .map(range => cover.model.merges.includes(range)),
    [true, true, true, true, true, true, true, true, true, true],
  )
  assert.equal(cover.getCell('B11').alignment.wrapText, true)
  assert.equal(cover.getCell('B13').alignment.wrapText, true)
  assert.ok(cover.getRow(13).height >= 18)
  assert.equal(firm.getCell('C10').alignment.wrapText, true)
  assert.equal(firm.getCell('D10').alignment.wrapText, true)
  assert.ok(firm.getRow(10).height >= 30)
  assert.equal(firm.getCell('B16').alignment.wrapText, true)
  assert.ok(firm.model.merges.includes('B16:H16'), 'terms heading spans the customer-facing page width')
  assert.equal(firm.getCell('B17').value, '1. Validity: 30 days')
  assert.equal(firm.getCell('B26').value, null, 'template duplicate terms are cleared')
  assert.equal(cover.getCell('C6').value, '2608227RS')
})

test('customer-facing proposal export removes internal and template-only columns', async () => {
  const templateBuffer = fs.readFileSync('branding/Further Inputs/Further Inputs/Proposals and T&Cs/Spares Opp-1 (Won almost)/Spares Firm Offer Rev00 2May2026.xlsx')
  const output = await generateProposalWorkbook({
    templateBuffer,
    logoBuffer: fs.readFileSync('branding/mod-ae/assets/modae-official-logo.png'),
    route: 'Spares',
    redactInternalCosting: true,
    p: { revision: '00', bom: [{ pn: 'P-1', desc: 'Probe', common: 1 }] },
    opp: { id: '2609001PJS', sellTo: 'Customer' },
    doc: { docTerms: [] },
    totalQty: line => line.common,
    lineQuoted: () => 100,
  })
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(output)
  const firm = workbook.getWorksheet('Firm Rev-00')
  assert.ok(firm.columnCount <= 8)
  assert.equal(firm.getCell('H10').value, null)
  assert.equal(firm.getCell('J10').value, null)
  assert.equal(firm.getCell('N9').value, null)
})

test('spares export keeps reference rows but uses live proposal quantities', async () => {
  const templateBuffer = fs.readFileSync('branding/Further Inputs/Further Inputs/Proposals and T&Cs/Spares Opp-1 (Won almost)/Spares Firm Offer Rev00 2May2026.xlsx')
  const output = await generateProposalWorkbook({
    templateBuffer,
    logoBuffer: fs.readFileSync('branding/mod-ae/assets/modae-official-logo.png'),
    route: 'Spares',
    p: {
      revision: '00', bom: [
        { pn: 'DS821.DS1001/10/075/012/005/000/0', desc: 'Wrong live description', common: 1 },
        { pn: 'DS821.DS1003/62/039/013/005/000/0', desc: 'Wrong live description', common: 1 },
        { pn: 'DS821.EC100/45/0', desc: 'Wrong live description', common: 1 },
        { pn: 'DS821.OD110/0', desc: 'Wrong live description', common: 1 },
        { pn: 'AC-3101/1', desc: 'Wrong live description', common: 1 },
      ],
    },
    opp: { id: '2609001PJS', sellTo: 'Customer' },
    doc: { docTerms: [] },
    totalQty: line => line.common,
    lineQuoted: () => 100,
  })
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(output)
  const firm = workbook.getWorksheet('Firm Rev-00')
  assert.deepEqual(
    Array.from({ length: 8 }, (_, index) => firm.getCell(`C${index + 10}`).value),
    [
      'Wrong live description', 'Wrong live description', 'Wrong live description', 'Wrong live description', 'Wrong live description', 'Warranty Certificate',
      'Country of Origin Certificate', 'Freight Charges from B&K Germany To ModAE India',
    ],
  )
  assert.deepEqual(Array.from({ length: 5 }, (_, index) => firm.getCell(`E${index + 10}`).value), [1, 1, 1, 1, 1])
  assert.deepEqual(Array.from({ length: 5 }, (_, index) => firm.getCell(`F${index + 10}`).value), [100, 100, 100, 100, 100])
  assert.equal(firm.getCell('G10').value.result, 100)
  assert.equal(firm.getCell('G18').value.result, 500)
  assert.equal(firm.getCell('B18').value, 'Total For')
})

test('generated Spares workbooks are editable and have no external Excel names', async () => {
  const templateBuffer = fs.readFileSync('branding/Further Inputs/Further Inputs/Proposals and T&Cs/Spares Opp-1 (Won almost)/Spares Firm Offer Rev00 2May2026.xlsx')
  const output = await generateProposalWorkbook({
    templateBuffer,
    logoBuffer: fs.readFileSync('branding/mod-ae/assets/modae-official-logo.png'),
    route: 'Spares',
    p: { revision: '00', bom: [{ pn: 'P-1', desc: 'Probe', common: 1 }] },
    opp: { id: '2609001PJS', sellTo: 'Customer' },
    doc: { docTerms: [] },
    totalQty: line => line.common,
    lineQuoted: () => 100,
  })
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(output)
  assert.ok(workbook.definedNames.model.every(name => name.name === '_xlnm.Print_Area'))
  assert.ok(workbook.definedNames.model.every(name => name.ranges.every(range => !/[\[\]#REF!]/.test(range))))
  assert.ok(!workbook.getWorksheet('Cover Letter').sheetProtection)
  assert.ok(!workbook.getWorksheet('Firm Rev-00').sheetProtection)
  assert.notEqual(workbook.getWorksheet('Firm Rev-00').getCell('C10').protection?.locked, true)
  assert.ok(workbook.getWorksheet('Cover Letter').getCell('A3').value == null)
})
