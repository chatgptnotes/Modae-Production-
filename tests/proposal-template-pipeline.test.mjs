import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ExcelJS from 'exceljs'

import { customerProposalArtifact } from '../src/proposal/emailAttachments.js'
import { resolveProposalTemplate } from '../src/proposal/templateRegistry.js'

const bundledPath = 'assets/workbooks/proposal-templates/spares.xlsx'
const logoPath = 'assets/brand/modae/images/official-logo.png'

test('the bundled Spares template is present and readable', async () => {
  const bytes = fs.readFileSync(bundledPath)
  assert.ok(bytes.length > 0)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes)
  assert.ok(workbook.getWorksheet('Firm Rev-00'))
})

test('template resolution is route-specific and an active Admin template wins', () => {
  assert.match(resolveProposalTemplate({}, 'Project').filename, /Project/i)
  assert.match(resolveProposalTemplate({}, 'Spares').filename, /Spares Firm Offer/i)
  assert.match(resolveProposalTemplate({}, 'Services').filename, /Service Proposal/i)

  const uploaded = { lane: 'Spares', status: 'Current', name: 'Customer Format.xlsx', path: 'Spares/Customer-Format.xlsx', mapping: { method: 'gemini' } }
  const resolved = resolveProposalTemplate({ uploads: { proposalTemplates: [uploaded] } }, 'Spares')
  assert.equal(resolved.source, 'uploaded')
  assert.equal(resolved.filename, 'Customer Format.xlsx')
  assert.equal(resolved.path, uploaded.path)
})

test('built-in templates expose deployable asset URLs', () => {
  for (const route of ['Project', 'Services', 'Spares']) {
    const template = resolveProposalTemplate({}, route)
    assert.equal(template.source, 'built-in')
    assert.match(template.url, /\/assets\/workbooks\/proposal-templates\/\w+\.xlsx$/)
  }
})

test('customer preview and attachment are produced from the same redacted XLSX bytes', async () => {
  const artifact = await customerProposalArtifact({
    templateBuffer: fs.readFileSync(bundledPath),
    logoBuffer: fs.readFileSync(logoPath),
    route: 'Spares',
    p: { revision: '01', revisionDate: '2026-09-19', bom: [{ pn: 'P-1', desc: 'Probe', common: 1 }] },
    opp: { id: '2609014PP', sellTo: 'Demo Thermal Power Ltd.' },
    doc: { docTerms: [{ label: 'Validity', text: '30 days' }] },
    totalQty: line => line.common,
    lineQuoted: () => 100,
  })

  const attachmentBytes = Buffer.from(artifact.attachment.contentBase64, 'base64')
  assert.deepEqual(attachmentBytes, Buffer.from(artifact.bytes))
  assert.equal(artifact.workbookPreview.filename, artifact.attachment.filename)
  assert.match(artifact.signature, /^\d+-[0-9a-f]+$/)

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(artifact.bytes)
  const firm = workbook.getWorksheet('Firm Rev-00')
  assert.ok(firm.columnCount <= 8)
  assert.equal(firm.getCell('J10').value, null)
})

test('Project and Services generation use their own commercial worksheets', async () => {
  const cases = [
    {
      route: 'Project',
      path: 'assets/workbooks/proposal-templates/project.xlsx',
      sheet: 'Priced BoQ',
      descriptionCell: 'D10',
      internalCell: 'N10',
      staleText: 'Proximity Transducer With 5 Meter Integral',
    },
    {
      route: 'Services',
      path: 'assets/workbooks/proposal-templates/service.xlsx',
      sheet: 'Proposal',
      descriptionCell: 'D9',
      internalCell: 'J9',
      staleText: 'Verification of Meggitt VM600Mk2 Rack Health',
    },
  ]

  for (const item of cases) {
    const artifact = await customerProposalArtifact({
      templateBuffer: fs.readFileSync(item.path),
      logoBuffer: fs.readFileSync(logoPath),
      route: item.route,
      p: { revision: '01', bom: [{ pn: 'P-1', desc: `${item.route} live line`, common: 1 }] },
      opp: { id: 'ROUTE-1', sellTo: 'Customer' },
      doc: { docTerms: [{ label: 'Validity', text: '30 days from submission' }] },
      totalQty: line => line.common,
      lineQuoted: () => 100,
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(artifact.bytes)
    const commercial = workbook.getWorksheet(item.sheet)
    assert.equal(commercial.getCell(item.descriptionCell).value, `${item.route} live line`)
    assert.equal(commercial.getCell(item.internalCell).value, null)
    const visibleText = commercial.getSheetValues().flat(3).filter(Boolean).map(String).join('\n')
    assert.doesNotMatch(visibleText, new RegExp(item.staleText, 'i'))
    assert.match(visibleText, /30 days from submission/i)
  }
})

test('an uploaded mapped template clears unused example lines before customer send', async () => {
  const template = new ExcelJS.Workbook()
  const cover = template.addWorksheet('Cover')
  cover.getCell('A1').value = 'Cover'
  const offer = template.addWorksheet('Offer')
  offer.addRow(['Item', 'Description', 'Qty', 'Unit price', 'Total'])
  offer.addRow(['OLD-1', 'Old example one', 1, 10, 10])
  offer.addRow(['OLD-2', 'Old example two', 1, 20, 20])
  offer.addRow(['', 'Grand Total', '', '', 30])
  const artifact = await customerProposalArtifact({
    templateBuffer: await template.xlsx.writeBuffer(),
    logoBuffer: fs.readFileSync(logoPath),
    route: 'Project',
    mapping: {
      method: 'gemini+deterministic', coverSheet: 'Cover', commercialSheet: 'Offer', customerLastColumn: 5,
      lineTable: { sheet: 'Offer', headerRow: 0, columns: { partNumber: 0, description: 1, quantity: 2, unitPrice: 3, totalPrice: 4 } },
    },
    p: { revision: '01', bom: [{ pn: 'NEW-1', desc: 'Current line', common: 2 }] },
    opp: { id: 'UPLOADED-1', sellTo: 'Customer' },
    doc: { docTerms: [] },
    totalQty: line => line.common,
    lineQuoted: () => 50,
  })
  const generated = new ExcelJS.Workbook()
  await generated.xlsx.load(artifact.bytes)
  const output = generated.getWorksheet('Offer')
  assert.equal(output.getCell('A2').value, 'NEW-1')
  assert.equal(output.getCell('A3').value, null)
  assert.equal(output.getCell('B3').value, null)
  assert.equal(output.getCell('E4').value, 100)
  assert.doesNotMatch(output.getSheetValues().flat(3).filter(Boolean).map(String).join('\n'), /Old example/i)
})
