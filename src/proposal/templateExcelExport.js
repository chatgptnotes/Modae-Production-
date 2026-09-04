import ExcelJS from 'exceljs'
import { MODAE_DOCUMENT_STANDARDS } from '../branding/modae.js'

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const SPARES_TEMPLATE_URL = new URL('../../branding/Further Inputs/Further Inputs/Proposals and T&Cs/Spares Opp-1 (Won almost)/Spares Firm Offer Rev00 2May2026.xlsx', import.meta.url).href
const SERVICES_TEMPLATE_URL = new URL('../../branding/Further Inputs/Further Inputs/Proposals and T&Cs/Big Service Opp-1 (Won) With SoW/Service Proposal 14Apr26 Rev-01.xlsx', import.meta.url).href
const LOGO_URL = new URL('../../branding/mod-ae/assets/modae-official-logo.png', import.meta.url).href

const clean = value => value == null ? '' : String(value)
const number = value => Number(value) || 0
const excelDate = value => {
  if (value instanceof Date) return value
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? clean(value) : date
}

const border = { style: 'thin', color: { argb: 'FFD9D9D9' } }
const allBorders = { top: border, left: border, bottom: border, right: border }
const rupeeFormat = '₹#,##0.00'
const euroFormat = '€#,##0.00'

const columnWidth = (worksheet, column) => worksheet.getColumn(column).width || 10

const columnName = columnNumber => {
  let number = columnNumber
  let name = ''
  while (number > 0) {
    const remainder = (number - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    number = Math.floor((number - 1) / 26)
  }
  return name
}

function rangeWidth(worksheet, start, end = start) {
  let width = 0
  for (let column = start; column <= end; column++) width += columnWidth(worksheet, column)
  return width
}

function wrappedLines(value, width) {
  const chars = Math.max(8, Math.floor(width))
  return clean(value).split(/\r?\n/).reduce((total, line) => total + Math.max(1, Math.ceil(line.length / chars)), 0)
}

function setWrappedHeight(worksheet, rowNumber, cells, { min = 18, max = 120, lineHeight = 15 } = {}) {
  const lines = cells.reduce((total, cell) => Math.max(total, wrappedLines(cell.value, cell.width)), 1)
  worksheet.getRow(rowNumber).height = Math.max(min, Math.min(max, lines * lineHeight + 3))
}

function setValue(cell, value, options = {}) {
  cell.value = value
  if (options.font) cell.font = { ...(cell.font || {}), ...options.font }
  if (options.alignment) cell.alignment = { ...(cell.alignment || {}), ...options.alignment }
  if (options.fill) cell.fill = options.fill
  if (options.border !== false) cell.border = allBorders
}

function styleNarrative(cell) {
  cell.alignment = { ...(cell.alignment || {}), vertical: 'top', wrapText: true }
  cell.border = allBorders
}

function setCoverRow(worksheet, range, value) {
  const [startRef, endRef] = range.split(':')
  const start = worksheet.getCell(startRef)
  const end = worksheet.getCell(endRef)
  const row = worksheet.getRow(start.row)

  // Clear stale template values before merging so old cover text cannot leak
  // into the new customer-facing field.
  for (let column = start.col + 1; column <= end.col; column++) row.getCell(column).value = null
  if (!worksheet.model.merges.includes(range)) worksheet.mergeCells(range)

  for (let column = start.col; column <= end.col; column++) {
    const cell = row.getCell(column)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
    cell.border = allBorders
    cell.alignment = { ...(cell.alignment || {}), horizontal: 'left', vertical: 'top', wrapText: true }
  }
  setValue(start, value, { alignment: { horizontal: 'left', vertical: 'top', wrapText: true } })
}

function ensureLogo(workbook, worksheet, logoBuffer, lastColumn) {
  if (!logoBuffer || worksheet.getImages().length) return
  const imageId = workbook.addImage({ buffer: logoBuffer, extension: 'png' })
  worksheet.addImage(imageId, {
    tl: { col: 0, row: 0 },
    br: { col: lastColumn, row: 2 },
    editAs: 'oneCell',
  })
}

function setPrintLayout(worksheet, orientation) {
  worksheet.views = [{ showGridLines: false, style: 'pageLayout', activeCell: 'A1' }]
  worksheet.pageSetup = {
    ...(worksheet.pageSetup || {}),
    orientation,
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalDpi: 300,
    verticalDpi: 300,
    margins: MODAE_DOCUMENT_STANDARDS.marginsInches,
  }
  worksheet.headerFooter = {
    oddHeader: `&R${MODAE_DOCUMENT_STANDARDS.header.tagline}`,
    oddFooter: `&C${MODAE_DOCUMENT_STANDARDS.footerLines.join('\n')}`,
  }
}

function applyDocumentFont(workbook) {
  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow(row => row.eachCell(cell => {
      cell.font = {
        ...(cell.font || {}),
        name: 'Candara',
        size: MODAE_DOCUMENT_STANDARDS.bodySizePt,
      }
    }))
  }
}

function expandSharedFormulas(workbook) {
  // ExcelJS cannot re-emit some source workbooks whose shared-formula clones
  // refer to a master that is later changed. Expand each shared range into
  // ordinary formulas before editing the template, preserving calculations
  // while making the output portable across Excel-compatible readers.
  for (const worksheet of workbook.worksheets) {
    const masters = new Map()
    worksheet.eachRow(row => row.eachCell(cell => {
      const value = cell.value
      if (value?.shareType === 'shared' && value.ref && value.formula) masters.set(value.ref, { address: cell.address, formula: value.formula })
    }))
    worksheet.eachRow(row => row.eachCell(cell => {
      const value = cell.value
      if (!value?.sharedFormula) return
      // A cached result is preferable to an invalid shared-formula clone. The
      // generator overwrites all customer-facing pricing formulas below.
      cell.value = number(cell.result)
    }))
    for (const { address, formula } of masters.values()) worksheet.getCell(address).value = { formula }
  }
}

function sanitizeWorkbook(workbook) {
  // The customer-facing template was extracted from a larger workbook. Its
  // defined names still point at external files ([3]Titles, [5]Customer
  // Information, etc.), which makes Excel offer to repair the downloaded file.
  // Keep only print areas that refer to sheets actually present in this file.
  workbook.definedNames.model = (workbook.definedNames.model || []).filter(name => {
    if (name.name !== '_xlnm.Print_Area') return false
    return (name.ranges || []).every(range => !/[\[\]#REF!]/.test(range)
      && workbook.worksheets.some(sheet => range.includes(`'${sheet.name}'!`)))
  })

  workbook.calcProperties = {
    ...(workbook.calcProperties || {}),
    calcMode: 'auto',
    fullCalcOnLoad: true,
    forceFullCalc: true,
  }

  for (const worksheet of workbook.worksheets) {
    worksheet.unprotect()
    worksheet.sheetProtection = null
    worksheet.eachRow(row => row.eachCell(cell => {
      const value = cell.value
      if (value?.formula && /\[|#REF!|#NAME\?/.test(value.formula)) cell.value = null
    }))
  }
}

function setCoverSheet(workbook, worksheet, { p, opp, doc }) {
  setPrintLayout(worksheet, 'portrait')
  // A1:B3 is the reference logo area. Do not write a title into A3: that
  // merged region is occupied by the logo in Excel and caused cover overlap.
  setValue(worksheet.getCell('B5'), excelDate(p.revisionDate), { alignment: { vertical: 'middle' } })
  worksheet.getCell('B5').numFmt = 'd-mmm-yyyy'
  setValue(worksheet.getCell('C6'), p.ourRef || opp.id)
  setValue(worksheet.getCell('C7'), p.bidStage)
  setValue(worksheet.getCell('C8'), p.bidType)
  setValue(worksheet.getCell('C9'), p.revision)
  setCoverRow(worksheet, 'B11:Q11', p.addressee || `M/s. ${opp.sellTo}`)
  setCoverRow(worksheet, 'B12:Q12', opp.eucLocation || opp.location || '')
  setCoverRow(worksheet, 'B13:Q13', opp.customerAddress || '')
  setCoverRow(worksheet, 'B14:Q14', opp.customerCity || '')
  setCoverRow(worksheet, 'C16:Q16', p.kindAttn || opp.contactPerson || '')
  setCoverRow(worksheet, 'C18:Q18', [p.rfqNumber && `RFQ ${p.rfqNumber}`, p.subject || opp.oppName].filter(Boolean).join(' - '))
  setCoverRow(worksheet, 'C20:Q20', p.project || '')
  setCoverRow(worksheet, 'B22:Q22', doc.letterSalutation || 'Dear Sir,')
  setCoverRow(worksheet, 'B24:Q24', doc.letterBody || '')
  setCoverRow(worksheet, 'B26:Q26', [
    doc.letterClose || 'Best Regards',
    doc.preparedBy?.name,
    doc.preparedBy?.title,
    doc.preparedBy?.division,
    'ModAE India Private Limited',
    MODAE_PHONE_EMAIL,
  ].filter(Boolean).join('\n'))

  for (const ref of ['B11', 'B12', 'B13', 'B14', 'C16', 'B22', 'B24', 'B26', 'C18', 'C20']) styleNarrative(worksheet.getCell(ref))
  setWrappedHeight(worksheet, 11, [{ value: worksheet.getCell('B11').value, width: rangeWidth(worksheet, 2, 17) }])
  setWrappedHeight(worksheet, 12, [{ value: worksheet.getCell('B12').value, width: rangeWidth(worksheet, 2, 17) }])
  setWrappedHeight(worksheet, 13, [{ value: worksheet.getCell('B13').value, width: rangeWidth(worksheet, 2, 17) }])
  setWrappedHeight(worksheet, 14, [{ value: worksheet.getCell('B14').value, width: rangeWidth(worksheet, 2, 17) }])
  setWrappedHeight(worksheet, 16, [{ value: worksheet.getCell('C16').value, width: rangeWidth(worksheet, 3, 17) }])
  setWrappedHeight(worksheet, 18, [{ value: worksheet.getCell('C18').value, width: rangeWidth(worksheet, 3, 17) }])
  setWrappedHeight(worksheet, 20, [{ value: worksheet.getCell('C20').value, width: rangeWidth(worksheet, 3, 17) }])
  setWrappedHeight(worksheet, 22, [{ value: worksheet.getCell('B22').value, width: rangeWidth(worksheet, 2, 17) }])
  setWrappedHeight(worksheet, 24, [{ value: worksheet.getCell('B24').value, width: rangeWidth(worksheet, 2, 17) }], { min: 30, max: 300, lineHeight: 15 })
  setWrappedHeight(worksheet, 26, [{ value: worksheet.getCell('B26').value, width: rangeWidth(worksheet, 2, 17) }], { min: 45, max: 150, lineHeight: 15 })
  for (const ref of ['B6', 'B7', 'B8', 'B9', 'B16', 'B18', 'B20']) {
    worksheet.getCell(ref).font = { ...(worksheet.getCell(ref).font || {}), bold: true }
  }
}

const MODAE_PHONE_EMAIL = '+91 973 15 77 199 · ceo@mod-ae.com'

function setSummaryCard(worksheet, p) {
  const values = [
    ['J2', 'Imported Items Pricing & Costing Factors'],
    ['J3', 'Euro-₹ Base'], ['K3', number(p.costing?.euroBase || 112)],
    ['J4', 'B&K Disc%'], ['K4', number(p.costing?.discount || 0.35)],
    ['J5', 'CD+ Handl+ERV'], ['K5', number(p.costing?.cdErv || 0.15)],
    ['J6', 'Eff. Rate-€'], ['K6', number(p.costing?.effectiveRate || 84.4675)],
  ]
  for (const [ref, value] of values) {
    const cell = worksheet.getCell(ref)
    setValue(cell, value, { alignment: { vertical: 'middle', wrapText: true } })
    if (/^K/.test(ref)) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }
  }
  for (let row = 2; row <= 6; row++) {
    for (let col = 10; col <= 15; col++) worksheet.getCell(row, col).border = allBorders
  }
}

function setCommercialSheet(workbook, worksheet, args) {
  const { p, opp, doc, totalQty, lineQuoted, route } = args
  setPrintLayout(worksheet, 'landscape')
  setSummaryCard(worksheet, p)
  const lines = p.bom || []
  const firstRow = 10
  const originalTotalRow = 18
  // The supplied Spares workbook has three required non-product rows after
  // the five catalogue items. Capture them before writing the live BoQ so the
  // download keeps the customer's Warranty, Origin and Freight lines instead
  // of treating them as disposable template leftovers.
  const templateProducts = new Map()
  const templateSupportRows = []
  for (let rowNumber = firstRow; rowNumber < originalTotalRow; rowNumber++) {
    const partNumber = clean(worksheet.getCell(`D${rowNumber}`).value).trim()
    const description = clean(worksheet.getCell(`C${rowNumber}`).value).trim()
    if (partNumber && partNumber !== 'NA') templateProducts.set(partNumber.toLowerCase(), {
      description,
      quantity: worksheet.getCell(`E${rowNumber}`).value,
    })
    if (partNumber.toUpperCase() === 'NA') {
      const row = worksheet.getRow(rowNumber)
      templateSupportRows.push({
        height: row.height,
        cells: Array.from({ length: 14 }, (_, index) => {
          const cell = row.getCell(index + 2)
          return {
            value: cell.value,
            style: { ...cell.style },
            numFmt: cell.numFmt,
          }
        }),
        description,
      })
    }
  }
  const totalRow = firstRow + lines.length + templateSupportRows.length
  if (totalRow > originalTotalRow) worksheet.spliceRows(originalTotalRow, 0, ...Array.from({ length: totalRow - originalTotalRow }, () => []))

  const headers = [['B9', 'Sl. No.'], ['C9', 'Item Description'], ['D9', 'Proposed Model / Part No.'], ['E9', 'Qty'], ['F9', 'Unit Price (₹)'], ['G9', 'Total Price (₹)'], ['J9', 'Unit Price (₹)'], ['K9', 'Total Price (₹)'], ['L9', 'Unit Cost (₹)'], ['M9', 'Total Cost (₹)'], ['N9', 'Unit Cost (€)'], ['O9', 'Total Cost (€)']]
  for (const [ref, value] of headers) {
    setValue(worksheet.getCell(ref), value, {
      font: { name: 'Candara', size: MODAE_DOCUMENT_STANDARDS.headingSizePt, bold: true, color: { argb: 'FF222222' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAEAEA' } },
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    })
  }
  const widths = { B: 8, C: 45, D: 32, E: 10, F: 18, G: 18, J: 18, K: 18, L: 18, M: 18, N: 18, O: 18 }
  for (const [column, width] of Object.entries(widths)) worksheet.getColumn(column).width = width

  lines.forEach((line, index) => {
    const row = firstRow + index
    const templateProduct = templateProducts.get(clean(line.pn || line.custRef).trim().toLowerCase())
    const qty = templateProduct == null ? number(totalQty(line)) : number(templateProduct.quantity)
    const unitPrice = number(lineQuoted(line))
    const unitEuro = number(line.unitPriceEuro || line.priceEuro)
    setValue(worksheet.getCell(`B${row}`), index + 1, { alignment: { horizontal: 'center', vertical: 'top' } })
    setValue(worksheet.getCell(`C${row}`), templateProduct?.description || line.desc || line.itemCategory || '', { alignment: { vertical: 'top', wrapText: true } })
    setValue(worksheet.getCell(`D${row}`), line.pn || line.custRef || '', { alignment: { vertical: 'top', wrapText: true } })
    setValue(worksheet.getCell(`E${row}`), qty, { alignment: { horizontal: 'center', vertical: 'top' } })
    setValue(worksheet.getCell(`F${row}`), unitPrice, { alignment: { horizontal: 'right', vertical: 'top' } })
    setValue(worksheet.getCell(`G${row}`), { formula: `F${row}*E${row}` }, { alignment: { horizontal: 'right', vertical: 'top' } })
    setValue(worksheet.getCell(`J${row}`), unitPrice, { alignment: { horizontal: 'right', vertical: 'top' } })
    setValue(worksheet.getCell(`K${row}`), { formula: `J${row}*E${row}` }, { alignment: { horizontal: 'right', vertical: 'top' } })
    setValue(worksheet.getCell(`L${row}`), number(line.unitCost), { alignment: { horizontal: 'right', vertical: 'top' } })
    setValue(worksheet.getCell(`M${row}`), { formula: `L${row}*E${row}` }, { alignment: { horizontal: 'right', vertical: 'top' } })
    setValue(worksheet.getCell(`N${row}`), unitEuro, { alignment: { horizontal: 'right', vertical: 'top' } })
    setValue(worksheet.getCell(`O${row}`), { formula: `N${row}*E${row}` }, { alignment: { horizontal: 'right', vertical: 'top' } })
    setWrappedHeight(worksheet, row, [
      { value: templateProduct?.description || line.desc || line.itemCategory || '', width: columnWidth(worksheet, 3) },
      { value: line.pn || line.custRef || '', width: columnWidth(worksheet, 4) },
    ], { min: 30, max: 120, lineHeight: 15 })
    for (const column of ['F', 'G', 'J', 'K', 'L', 'M']) worksheet.getCell(`${column}${row}`).numFmt = rupeeFormat
    for (const column of ['N', 'O']) worksheet.getCell(`${column}${row}`).numFmt = euroFormat
    worksheet.getCell(`E${row}`).numFmt = '#,##0'
  })

  // Restore the reference workbook's required non-product rows immediately
  // after the live product rows. Their formulas and formatting remain part of
  // the customer-facing Firm Offer structure.
  templateSupportRows.forEach((templateRow, index) => {
    const row = firstRow + lines.length + index
    worksheet.getRow(row).height = templateRow.height
    templateRow.cells.forEach((source, cellIndex) => {
      const cell = worksheet.getRow(row).getCell(cellIndex + 2)
      cell.value = source.value
      cell.style = { ...source.style }
      if (source.numFmt) cell.numFmt = source.numFmt
    })
  })

  const footer = totalRow
  setValue(worksheet.getCell(`B${footer}`), 'Total For', { font: { bold: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE9D9' } } })
  setValue(worksheet.getCell(`C${footer}`), doc.subject || p.subject || opp.oppName, { font: { bold: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE9D9' } }, alignment: { wrapText: true } })
  for (const column of ['F', 'G', 'J', 'K', 'L', 'M', 'N', 'O']) {
    const cell = worksheet.getCell(`${column}${footer}`)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE9D9' } }
    cell.border = allBorders
    if (['G', 'K', 'M', 'O'].includes(column)) cell.value = { formula: `SUM(${column}${firstRow}:${column}${footer - 1})` }
  }
  const termsStart = footer + 2
  // The source templates contain leftover customer-facing rows below the BOQ
  // (including an older, duplicate Terms & Conditions block). Clear those
  // rows before writing the generated terms so they cannot leak into page 2.
  // Keep the internal costing columns J:O untouched.
  for (const range of Object.values(worksheet._merges || {})) {
    const model = range?.model
    if (!model || model.top < termsStart) continue
    const mergeRef = `${columnName(model.left)}${model.top}:${columnName(model.right)}${model.bottom}`
    worksheet.unMergeCells(mergeRef)
  }
  for (let row = footer + 1; row <= worksheet.rowCount; row++) {
    for (let column = 2; column <= 8; column++) worksheet.getCell(row, column).value = null
  }

  const termWidth = rangeWidth(worksheet, 2, 8)
  const writeTermRow = (row, value, heading = false) => {
    worksheet.mergeCells(`B${row}:H${row}`)
    setValue(worksheet.getCell(`B${row}`), value, {
      font: { bold: heading },
      alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
    })
    setWrappedHeight(worksheet, row, [{ value, width: termWidth }], {
      min: heading ? 24 : 24,
      max: 120,
      lineHeight: 15,
    })
  }

  writeTermRow(termsStart, doc.docTermsHeading || 'Terms & Conditions:', true)
  ;(doc.docTerms || []).forEach((term, index) => {
    const row = termsStart + index + 1
    writeTermRow(row, `${index + 1}. ${term.label || ''}: ${term.text || ''}`.trim())
  })
  // Keep the template's two customer-facing columns visible and the costing block intact.
  worksheet.getColumn('B').width = 8
  worksheet.getColumn('C').width = 45
  worksheet.getColumn('D').width = 32
  worksheet.getColumn('E').width = 10
  worksheet.getColumn('F').width = 18
  worksheet.getColumn('G').width = 18
}

async function readBuffer(input) {
  if (input instanceof Uint8Array || input instanceof ArrayBuffer || (typeof Buffer !== 'undefined' && Buffer.isBuffer(input))) return input
  if (typeof input === 'string') return (await fetch(input)).arrayBuffer()
  throw new Error('An XLSX template buffer or URL is required')
}

async function fetchOptionalLogo(logoBuffer) {
  if (logoBuffer) return logoBuffer
  const response = await fetch(LOGO_URL)
  return response.ok ? new Uint8Array(await response.arrayBuffer()) : null
}

export async function generateProposalWorkbook(args) {
  const templateUrl = args.templateBuffer || (args.route === 'Services' ? SERVICES_TEMPLATE_URL : SPARES_TEMPLATE_URL)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await readBuffer(templateUrl))
  expandSharedFormulas(workbook)
  sanitizeWorkbook(workbook)
  applyDocumentFont(workbook)
  const logo = await fetchOptionalLogo(args.logoBuffer)
  const byName = name => workbook.worksheets.find(sheet => sheet.name.trim() === name)
  const cover = byName('Cover Letter') || workbook.worksheets[0]
  const commercial = byName(args.route === 'Services' ? 'Proposal' : 'Firm Rev-00') || workbook.worksheets[1]
  if (!cover || !commercial) throw new Error('Proposal template must contain a cover and commercial worksheet')
  ensureLogo(workbook, cover, logo, 18)
  ensureLogo(workbook, commercial, logo, 24)
  setCoverSheet(workbook, cover, args)
  setCommercialSheet(workbook, commercial, args)
  return new Uint8Array(await workbook.xlsx.writeBuffer())
}

export { MIME_XLSX }
