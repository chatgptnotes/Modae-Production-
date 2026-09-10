import ExcelJS from 'exceljs'
import { MODAE_DOCUMENT_STANDARDS } from '../branding/modae.js'
import { effectiveRate } from '../utils.js'
import { isSparesSupportRow } from './sparesBoq.js'

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const SPARES_TEMPLATE_URL = new URL('../../branding/Further Inputs/Further Inputs/Proposals and T&Cs/Spares Opp-1 (Won almost)/Spares Firm Offer Rev00 2May2026.xlsx', import.meta.url).href
const SERVICES_TEMPLATE_URL = new URL('../../branding/Further Inputs/Further Inputs/Proposals and T&Cs/Big Service Opp-1 (Won) With SoW/Service Proposal 14Apr26 Rev-01.xlsx', import.meta.url).href
const LOGO_URL = new URL('../../branding/mod-ae/assets/modae-official-logo.png', import.meta.url).href

const clean = value => value == null ? '' : String(value)

// Lead intake stores 'Unknown sender' / '(no subject)' as placeholders when an
// enquiry arrives without them (Inbox.jsx), and those strings travel into
// opp.sellTo/oppName and the proposal's addressee/subject/project. They are
// fine as internal state, but must never be printed on a customer document.
const INTAKE_PLACEHOLDERS = [/unknown sender/i, /\(no subject\)/i, /unknown@sender/i]
export const customerSafe = value => {
  const text = clean(value).trim()
  return INTAKE_PLACEHOLDERS.some(pattern => pattern.test(text)) ? '' : text
}
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
  // Normal (continuous) view. 'pageLayout' made Excel open the workbook broken
  // into separate printed pages with margin gaps and repeated header bands —
  // the page setup below still governs how it prints.
  worksheet.views = [{ showGridLines: false, activeCell: 'A1' }]
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

function setCoverSheet(workbook, worksheet, { p, opp, doc, route, mapping }) {
  setPrintLayout(worksheet, 'portrait')
  const mapped = mapping?.fields || {}
  const mappedMode = mapping?.method?.startsWith('gemini')
  const mappedCell = key => {
    const location = mapped[key]
    if (!location || location.sheet !== worksheet.name || !Number.isInteger(location.row) || !Number.isInteger(location.column)) return null
    // Gemini maps the semantic label; the customer value belongs in the cell
    // immediately to its right, preserving the label and workbook design.
    return worksheet.getCell(location.row + 1, location.column + 2)
  }
  const writeField = (key, value, fallbackRange, fallbackCell) => {
    const target = mappedCell(key)
    if (target) {
      setValue(target, value || '', { alignment: { vertical: 'middle', wrapText: true } })
      styleNarrative(target)
      return target
    }
    if (mappedMode) return null
    if (fallbackRange) setCoverRow(worksheet, fallbackRange, value || '')
    return fallbackCell ? worksheet.getCell(fallbackCell) : null
  }
  // A1:B3 is the reference logo area. Do not write a title into A3: that
  // merged region is occupied by the logo in Excel and caused cover overlap.
  if (!mappedMode) {
    setValue(worksheet.getCell('B5'), excelDate(p.revisionDate), { alignment: { vertical: 'middle' } })
    worksheet.getCell('B5').numFmt = 'd-mmm-yyyy'
    setValue(worksheet.getCell('C6'), p.ourRef || opp.id)
    setValue(worksheet.getCell('C7'), p.bidStage)
    setValue(worksheet.getCell('C8'), p.bidType)
    setValue(worksheet.getCell('C9'), p.revision)
  }
  const customerName = customerSafe(p.addressee) || (customerSafe(opp.sellTo) && `M/s. ${customerSafe(opp.sellTo)}`)
  const subject = customerSafe(p.subject) || customerSafe(opp.oppName) || `${route || 'Techno-Commercial'} Proposal`
  const coverTargets = [
    ['customerName', customerName, 'B11:Q11', 'B11'],
    ['location', opp.eucLocation || opp.location || '', 'B12:Q12', 'B12'],
    ['customerAddress', opp.customerAddress || '', 'B13:Q13', 'B13'],
    ['contactPerson', customerSafe(p.kindAttn) || customerSafe(opp.contactPerson), 'C16:Q16', 'C16'],
    ['subject', [p.rfqNumber && `RFQ ${p.rfqNumber}`, subject].filter(Boolean).join(' - '), 'C18:Q18', 'C18'],
    ['rfqNumber', p.rfqNumber || opp.id, null, null],
    ['project', customerSafe(p.project), 'C20:Q20', 'C20'],
  ]
  const writtenTargets = coverTargets.map(([key, value, range, cell]) => writeField(key, value, range, cell)).filter(Boolean)
  if (mappedMode && writtenTargets.length === 0) {
    // A mapping without cover fields is still usable; leave the uploaded
    // cover content intact rather than forcing the legacy cell coordinates.
  }
  if (!mappedMode) {
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
  }

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

// The costing keys the app actually stores are baseRate/bnkDiscPct/
// cdErvContPct (see clampCosting in utils.js); Eff. Rate is derived, never
// stored. This used to read euroBase/discount/cdErv/effectiveRate — keys that
// exist nowhere — so every export silently shipped the hardcoded defaults
// instead of the proposal's real factors.
function setSummaryCard(worksheet, p, totals, financeCost = 0) {
  const costing = p.costing || {}
  // K4/K5 and M6 are percent-formatted in the template, so they take fractions:
  // writing the app's whole-number 50 into K4 rendered as 5000%, and dragged
  // the template's =O18*(1-K4) "ModAE PO to BKV" negative with it.
  const netGM = totals ? totals.target - totals.cost - financeCost : null
  const values = [
    ['J2', 'Imported Items Pricing & Costing Factors'],
    ['J3', 'Euro-₹ Base'], ['K3', number(costing.baseRate || 112)],
    ['J4', 'B&K Disc%'], ['K4', number(costing.bnkDiscPct ?? 35) / 100],
    ['J5', 'CD+ Handl+ERV'], ['K5', number(costing.cdErvContPct ?? 15) / 100],
    ['J6', 'Eff. Rate-€'], ['K6', number(costing.baseRate ? effectiveRate(costing) : 84.4675)],
    // M4:M6 are blank in the template — the roll-up the app already computes.
    ...(totals ? [
      ['M4', number(totals.target)],
      ['M5', number(netGM)],
      ['M6', totals.target ? number(netGM) / number(totals.target) : 0],
    ] : []),
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

const isEmptyCell = cell => {
  const value = cell?.value
  if (value == null) return true
  if (typeof value === 'object') return !value.formula && !value.richText && !value.text
  return String(value).trim() === ''
}

// The customer-bound copy must never carry the J:O internal costing block, and
// must not trail a wide empty region either — the template's used range runs to
// column Y and row 41 while the customer table ends at H. Delete rather than
// blank: hidden columns still travel with the file, and the empty padding is
// what reads as "much space" when the customer opens it.
function stripInternalCosting(worksheet) {
  // Everything from column J rightwards is the internal cost/margin block —
  // unit and total cost in ₹ and €, the costing-factors card, the ModAE
  // cost/target/GM roll-up and the deal notes beside it.
  const firstInternal = 9 // column I is the spacer before the internal block
  for (const range of Object.values(worksheet._merges || {})) {
    const model = range?.model
    if (!model || model.right < firstInternal) continue
    worksheet.unMergeCells(`${columnName(model.left)}${model.top}:${columnName(model.right)}${model.bottom}`)
  }
  // Do not use worksheet.columnCount here. ExcelJS reports the full XLSX
  // column universe (16,384) when the source template has default styles.
  // Removing cells and columns directly avoids reintroducing the internal
  // costing block or its style-only tail during serialization.
  worksheet.eachRow({ includeEmpty: false }, row => {
    row._cells = row._cells.filter(cell => cell && cell.col < firstInternal)
  })
  worksheet._columns = worksheet._columns.slice(0, firstInternal - 1)

  // Drop the template's trailing blank rows so the sheet ends with the terms.
  let lastUsedRow = 0
  worksheet.eachRow({ includeEmpty: false }, (row, number) => {
    let used = false
    row.eachCell({ includeEmpty: false }, cell => { if (!isEmptyCell(cell)) used = true })
    if (used) lastUsedRow = number
  })
  if (worksheet.rowCount > lastUsedRow) worksheet.spliceRows(lastUsedRow + 1, worksheet.rowCount - lastUsedRow)
}

function setCommercialSheet(workbook, worksheet, args) {
  const { p, opp, doc, totalQty, lineQuoted, lineCost, linePrice, totals, route, redactInternalCosting } = args
  setPrintLayout(worksheet, 'landscape')
  setSummaryCard(worksheet, p, totals, (p.costing?.financeCostK || 0) * 1000)
  // B8/C8 were never written, so every proposal shipped the source template's
  // own deal title ("Item-10 · Proposal For B&K Vibro Spare Sensors…").
  const group = (doc.groups || [])[0]
  setValue(worksheet.getCell('B8'), group?.no || 'Item-10')
  setValue(worksheet.getCell('C8'), customerSafe(group?.title) || customerSafe(p.subject)
    || customerSafe(opp.oppName) || `${route || 'Techno-Commercial'} Proposal`)
  // The reference Spares template owns the three standard support rows. They
  // are restored below, so do not write proposal-level support rows twice.
  const lines = (p.bom || []).filter(line => !isSparesSupportRow(line))
  const firstRow = 10
  const originalTotalRow = 18
  // The supplied Spares workbook has three required non-product rows after
  // the five catalogue items. Capture them before writing the live BoQ so the
  // download keeps the customer's Warranty, Origin and Freight lines instead
  // of treating them as disposable template leftovers.
  const templateProducts = new Map()
  const templateSupportRows = []
  const proposalSupportRows = (p.bom || []).filter(isSparesSupportRow)
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
    // The proposal BoQ is the source of truth. Template rows provide layout
    // and fallback descriptions only; they must not override live quantities.
    const qty = number(totalQty(line))
    const unitPrice = number(lineQuoted(line))
    // Landed cost and list price are derived (docProps.buildPricing), never
    // stored on the line — reading line.unitCost/unitPriceEuro wrote 0 into
    // every internal cost cell of the ModAE copy.
    const unitLandedCost = lineCost ? number(lineCost(line)) : 0
    const unitEuro = linePrice ? number(linePrice(line)) : 0
    setValue(worksheet.getCell(`B${row}`), index + 1, { alignment: { horizontal: 'center', vertical: 'top' } })
    setValue(worksheet.getCell(`C${row}`), line.desc || line.itemCategory || templateProduct?.description || '', { alignment: { vertical: 'top', wrapText: true } })
    setValue(worksheet.getCell(`D${row}`), line.pn || line.custRef || '', { alignment: { vertical: 'top', wrapText: true } })
    setValue(worksheet.getCell(`E${row}`), qty, { alignment: { horizontal: 'center', vertical: 'top' } })
    setValue(worksheet.getCell(`F${row}`), unitPrice, { alignment: { horizontal: 'right', vertical: 'top' } })
    setValue(worksheet.getCell(`G${row}`), { formula: `F${row}*E${row}`, result: unitPrice * qty }, { alignment: { horizontal: 'right', vertical: 'top' } })
    setValue(worksheet.getCell(`J${row}`), unitPrice, { alignment: { horizontal: 'right', vertical: 'top' } })
    setValue(worksheet.getCell(`K${row}`), { formula: `J${row}*E${row}`, result: unitPrice * qty }, { alignment: { horizontal: 'right', vertical: 'top' } })
    setValue(worksheet.getCell(`L${row}`), unitLandedCost, { alignment: { horizontal: 'right', vertical: 'top' } })
    setValue(worksheet.getCell(`M${row}`), { formula: `L${row}*E${row}`, result: unitLandedCost * qty }, { alignment: { horizontal: 'right', vertical: 'top' } })
    setValue(worksheet.getCell(`N${row}`), unitEuro, { alignment: { horizontal: 'right', vertical: 'top' } })
    setValue(worksheet.getCell(`O${row}`), { formula: `N${row}*E${row}`, result: unitEuro * qty }, { alignment: { horizontal: 'right', vertical: 'top' } })
    setWrappedHeight(worksheet, row, [
      { value: line.desc || line.itemCategory || templateProduct?.description || '', width: columnWidth(worksheet, 3) },
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
    const proposalRow = proposalSupportRows[index]
    worksheet.getRow(row).height = templateRow.height
    templateRow.cells.forEach((source, cellIndex) => {
      const cell = worksheet.getRow(row).getCell(cellIndex + 2)
      cell.value = source.value
      cell.style = { ...source.style }
      if (source.numFmt) cell.numFmt = source.numFmt
    })
    if (proposalRow) {
      const qty = number(totalQty(proposalRow))
      const unitPrice = proposalRow.quoted === '' || proposalRow.quoted == null ? 0 : number(lineQuoted(proposalRow))
      setValue(worksheet.getCell(`C${row}`), proposalRow.desc || templateRow.description, { alignment: { vertical: 'top', wrapText: true } })
      setValue(worksheet.getCell(`D${row}`), proposalRow.pn || 'NA', { alignment: { vertical: 'top', wrapText: true } })
      setValue(worksheet.getCell(`E${row}`), qty, { alignment: { horizontal: 'center', vertical: 'top' } })
      setValue(worksheet.getCell(`F${row}`), proposalRow.quoted === '' || proposalRow.quoted == null ? null : unitPrice, { alignment: { horizontal: 'right', vertical: 'top' } })
      setValue(worksheet.getCell(`G${row}`), { formula: `F${row}*E${row}`, result: unitPrice * qty }, { alignment: { horizontal: 'right', vertical: 'top' } })
      worksheet.getCell(`E${row}`).numFmt = '#,##0'
      worksheet.getCell(`F${row}`).numFmt = rupeeFormat
      worksheet.getCell(`G${row}`).numFmt = rupeeFormat
    }
  })

  const footer = totalRow
  setValue(worksheet.getCell(`B${footer}`), 'Total For', { font: { bold: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE9D9' } } })
  setValue(worksheet.getCell(`C${footer}`), customerSafe(doc.subject) || customerSafe(p.subject)
    || customerSafe(opp.oppName) || `${route || 'Techno-Commercial'} Proposal`, { font: { bold: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE9D9' } }, alignment: { wrapText: true } })
  for (const column of ['F', 'G', 'J', 'K', 'L', 'M', 'N', 'O']) {
    const cell = worksheet.getCell(`${column}${footer}`)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE9D9' } }
    cell.border = allBorders
    cell.numFmt = ['N', 'O'].includes(column) ? euroFormat : rupeeFormat
    if (['G', 'K', 'M', 'O'].includes(column)) {
      const result = lines.reduce((sum, line, index) => {
        const row = firstRow + index
        const qty = totalQty(line)
        const unit = column === 'G' || column === 'K' ? number(lineQuoted(line)) : column === 'M' ? (lineCost ? number(lineCost(line)) : 0) : (linePrice ? number(linePrice(line)) : 0)
        return sum + unit * number(qty)
      }, 0) + proposalSupportRows.reduce((sum, line, index) => {
        const row = firstRow + lines.length + index
        return sum + number(line.quoted === '' || line.quoted == null ? 0 : lineQuoted(line)) * number(totalQty(line))
      }, 0)
      cell.value = { formula: `SUM(${column}${firstRow}:${column}${footer - 1})`, result }
    }
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

  if (redactInternalCosting) stripInternalCosting(worksheet)
}

// Uploaded workbooks can use different sheet names, header rows and column
// order. When Gemini has identified a line table, write only into those mapped
// cells and leave the workbook's own layout, logo, formulas and surrounding
// content untouched.
function setMappedCommercialSheet(worksheet, args) {
  const { p, totalQty, lineQuoted, mapping } = args
  const table = mapping?.lineTable
  const columns = table?.columns || {}
  if (!table || !Number.isInteger(table.headerRow) || !Number.isInteger(columns.description) || !Number.isInteger(columns.quantity)) return false
  setPrintLayout(worksheet, 'landscape')
  const lines = (p.bom || []).filter(line => !isSparesSupportRow(line))
  const firstRow = table.headerRow + 2
  const cell = (row, key) => Number.isInteger(columns[key]) ? worksheet.getCell(row, columns[key] + 1) : null
  lines.forEach((line, index) => {
    const row = firstRow + index
    const qty = number(totalQty(line))
    const unit = number(lineQuoted(line))
    const values = {
      partNumber: line.pn || line.custRef || '',
      description: line.desc || line.itemCategory || '',
      quantity: qty,
      unitPrice: unit,
      totalPrice: unit * qty,
    }
    for (const [key, value] of Object.entries(values)) {
      const target = cell(row, key)
      if (target) {
        setValue(target, value, { alignment: { vertical: 'top', wrapText: true } })
        if (['unitPrice', 'totalPrice'].includes(key)) target.numFmt = '#,##0.00'
      }
    }
  })
  const totalRow = firstRow + lines.length
  const total = lines.reduce((sum, line) => sum + number(lineQuoted(line)) * number(totalQty(line)), 0)
  const totalCell = cell(totalRow, 'totalPrice')
  if (totalCell) setValue(totalCell, total, { font: { bold: true }, alignment: { horizontal: 'right' } })
  const descriptionCell = cell(totalRow, 'description')
  if (descriptionCell) setValue(descriptionCell, 'Total', { font: { bold: true } })
  return true
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
  const cover = byName(args.mapping?.coverSheet) || byName('Cover Letter') || workbook.worksheets[0]
  const commercial = byName(args.mapping?.commercialSheet) || byName(args.route === 'Services' ? 'Proposal' : 'Firm Rev-00') || workbook.worksheets[1] || cover
  if (!cover || !commercial) throw new Error('Proposal template must contain a cover and commercial worksheet')
  ensureLogo(workbook, cover, logo, 18)
  ensureLogo(workbook, commercial, logo, 24)
  setCoverSheet(workbook, cover, args)
  const mappedCommercial = args.mapping?.method?.startsWith('gemini') && args.mapping?.lineTable?.sheet === commercial.name
  if (mappedCommercial && !setMappedCommercialSheet(commercial, args)) setCommercialSheet(workbook, commercial, args)
  else if (!mappedCommercial) setCommercialSheet(workbook, commercial, args)
  return new Uint8Array(await workbook.xlsx.writeBuffer())
}

export { MIME_XLSX }
