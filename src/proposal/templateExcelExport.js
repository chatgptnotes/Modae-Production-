import ExcelJS from 'exceljs'
import { effectiveRate } from '../utils.js'
import { currencySymbol } from '../currency.js'
import { BUILT_IN_PROPOSAL_TEMPLATES, proposalTemplateLane } from './templateRegistry.js'
import { customerLocationValue, isPlaceholderLocation } from '../locations.js'
import { MODAE_DOCUMENT_STANDARDS } from '../branding/modae.js'

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const LOGO_URL = new URL('../../assets/brand/modae/images/official-logo.png', import.meta.url).href

const clean = value => value == null ? '' : String(value)
const round2 = value => Math.round((Number(value) || 0) * 100) / 100

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

const rupeeFormat = '₹#,##0.00'
const euroFormat = '€#,##0.00'
const customerFormat = symbol => `${symbol}#,##0.00`

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

function setValue(cell, value, options = {}) {
  cell.value = value
  if (options.font) cell.font = { ...(cell.font || {}), ...options.font }
  if (options.alignment) cell.alignment = { ...(cell.alignment || {}), ...options.alignment }
  if (options.fill) cell.fill = options.fill
  if (options.border) cell.border = options.border
}

function styleNarrative(cell) {
  cell.alignment = { ...(cell.alignment || {}), vertical: 'middle', wrapText: true }
}

const setNumberFormat = (cell, numFmt) => {
  cell.style = { ...(cell.style || {}), numFmt }
}

function setCoverRow(worksheet, range, value) {
  const [startRef, endRef] = range.split(':')
  const start = worksheet.getCell(startRef)
  const end = worksheet.getCell(endRef)
  const row = worksheet.getRow(start.row)

  // Clear stale template values before merging so old cover text cannot leak
  // into the new customer-facing field.
  for (let column = start.col + 1; column <= end.col; column++) row.getCell(column).value = null
  setValue(start, value)
}

function cellText(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value?.richText)) return value.richText.map(item => item.text || '').join('')
  return ''
}

function clearPlaceholderLocations(worksheet) {
  worksheet.eachRow(row => row.eachCell(cell => {
    if (isPlaceholderLocation(cellText(cell.value))) cell.value = null
  }))
}

function applyTaglineBranding(workbook) {
  const tagline = MODAE_DOCUMENT_STANDARDS.header.tagline
  const argb = 'FF3333FF'
  for (const worksheet of workbook.worksheets) worksheet.eachRow(row => row.eachCell(cell => {
    if (cellText(cell.value).trim() !== tagline) return
    cell.font = { ...(cell.font || {}), color: { type: 'argb', argb } }
  }))
}

function applyHeaderRule(worksheet, firstColumn, lastColumn) {
  for (let column = firstColumn; column <= lastColumn; column++) {
    const cell = worksheet.getRow(3).getCell(column)
    cell.border = {
      ...(cell.border || {}),
      bottom: { style: 'double', color: { argb: 'FF090759' } },
    }
  }
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
  if (!worksheet.views?.length) worksheet.views = [{ showGridLines: true, activeCell: 'A1' }]
  worksheet.views = worksheet.views.map(view => ({ ...view, style: 'normal' }))
  worksheet.pageSetup = {
    ...(worksheet.pageSetup || {}),
    orientation: worksheet.pageSetup?.orientation || orientation,
    paperSize: worksheet.pageSetup?.paperSize || 9,
    fitToPage: worksheet.pageSetup?.fitToPage ?? true,
    fitToWidth: worksheet.pageSetup?.fitToWidth ?? 1,
    fitToHeight: orientation === 'portrait' ? 1 : 0,
  }
}

const hasWorkbookValue = value => value !== null && value !== undefined && value !== ''

function trimEmptyTemplateRows(worksheet, lastContentRow) {
  for (let rowNumber = lastContentRow + 1; rowNumber <= worksheet.rowCount; rowNumber++) {
    let hasValue = false
    for (let column = 1; column <= worksheet.columnCount; column++) {
      if (hasWorkbookValue(worksheet.getCell(rowNumber, column).value)) {
        hasValue = true
        break
      }
    }
    if (!hasValue) worksheet.getRow(rowNumber).hidden = true
  }
}

function setCustomerPrintArea(workbook, worksheet, firstColumn, lastColumn) {
  let lastContentRow = 1
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber++) {
    for (let column = firstColumn; column <= lastColumn; column++) {
      if (hasWorkbookValue(worksheet.getCell(rowNumber, column).value)) {
        lastContentRow = rowNumber
        break
      }
    }
  }
  const start = columnName(firstColumn)
  const end = columnName(lastColumn)
  const area = `${start}1:${end}${lastContentRow}`
  worksheet.pageSetup.printArea = area
  trimEmptyTemplateRows(worksheet, lastContentRow)
  const sheetIndex = workbook.worksheets.indexOf(worksheet)
  const definedPrintArea = (workbook.definedNames.model || []).find(name => name.name === '_xlnm.Print_Area' && name.localSheetId === sheetIndex)
  if (definedPrintArea) definedPrintArea.ranges = [`'${worksheet.name}'!$${start}$1:$${end}$${lastContentRow}`]
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
    setNumberFormat(worksheet.getCell('B5'), 'd-mmm-yyyy')
    setValue(worksheet.getCell('C6'), p.ourRef || opp.id)
    setValue(worksheet.getCell('C7'), p.bidStage)
    setValue(worksheet.getCell('C8'), p.bidType)
    setValue(worksheet.getCell('C9'), p.revision)
  }
  const customerName = customerSafe(p.addressee) || (customerSafe(opp.sellTo) && `M/s. ${customerSafe(opp.sellTo)}`)
  const subject = customerSafe(p.subject) || customerSafe(opp.oppName) || `${route || 'Techno-Commercial'} Proposal`
  const coverTargets = [
    ['customerName', customerName, 'B11:Q11', 'B11'],
    ['location', customerLocationValue(opp.eucLocation || opp.location), 'B12:Q12', 'B12'],
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

}

const MODAE_PHONE_EMAIL = '+91 973 15 77 199 · ceo@mod-ae.com'

// The costing keys the app actually stores are baseRate/bnkDiscPct/
// cdErvHandlingPct (with cdErvContPct retained as a legacy fallback);
// Eff. Rate is derived, never
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
    ['J5', 'CD+ Handl+ERV'], ['K5', number((costing.customsDutyPct ?? 8.5) + (costing.ervPct ?? 2.5) + (costing.handlingPct ?? 5)) / 100],
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
    setValue(cell, value)
  }
}

function cloneRowPresentation(worksheet, sourceRowNumber, targetRowNumber) {
  const source = worksheet.getRow(sourceRowNumber)
  const target = worksheet.getRow(targetRowNumber)
  target.height = source.height
  for (let column = 1; column <= worksheet.columnCount; column++) {
    const sourceCell = source.getCell(column)
    const targetCell = target.getCell(column)
    targetCell.style = { ...sourceCell.style }
    targetCell.numFmt = sourceCell.numFmt
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
function stripInternalCosting(worksheet, firstInternal = 9) {
  // Everything from column J rightwards is the internal cost/margin block —
  // unit and total cost in ₹ and €, the costing-factors card, the ModAE
  // cost/target/GM roll-up and the deal notes beside it.
  // firstInternal is one-based. For Spares it is column I, the spacer before
  // the internal J:O costing block. Other route templates supply their own
  // last customer column through the template mapping.
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
  const proposalSymbol = currencySymbol(p.sourceCurrency || 'INR')
  const proposalFormat = customerFormat(proposalSymbol)
  setPrintLayout(worksheet, 'landscape')
  setSummaryCard(worksheet, p, totals, (p.costing?.financeCostK || 0) * 1000)
  // B8/C8 were never written, so every proposal shipped the source template's
  // own deal title ("Item-10 · Proposal For B&K Vibro Spare Sensors…").
  const group = (doc.groups || [])[0]
  setValue(worksheet.getCell('B8'), group?.no || 'Item-10')
  setValue(worksheet.getCell('C8'), customerSafe(group?.title) || customerSafe(p.subject)
    || customerSafe(opp.oppName) || `${route || 'Techno-Commercial'} Proposal`)
  // The saved proposal BoQ is the customer-facing source of truth. Keep every
  // row, including support rows, in its saved order so the workbook matches
  // the on-screen BoQ exactly.
  const lines = p.bom || []
  const firstRow = 10
  const originalTotalRow = 18
  // Capture support-row styles from the reference workbook. These styles are
  // reused by matching live rows without importing the template's old order or
  // values.
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
  // Keep the reference sheet's minimum body height for small direct exports,
  // while still writing the live BoQ in full when it has more rows.
  const totalRow = Math.max(firstRow + lines.length, originalTotalRow)
  if (totalRow > originalTotalRow) {
    const addedRows = totalRow - originalTotalRow
    worksheet.spliceRows(originalTotalRow, 0, ...Array.from({ length: addedRows }, () => []))
    for (let row = originalTotalRow; row < totalRow; row++) cloneRowPresentation(worksheet, originalTotalRow - 1, row)
  }

    const headers = [['B9', 'Sl. No.'], ['C9', 'Scope / Equipment Description'], ['D9', 'Proposed Model / Part No.'], ['E9', 'Quantity'], ['F9', `Unit Price (${proposalSymbol})`], ['G9', `Total Price (${proposalSymbol})`], ['J9', 'Unit Price (₹)'], ['K9', 'Total Price (₹)'], ['L9', 'Unit Cost (₹)'], ['M9', 'Total Cost (₹)'], ['N9', 'Unit Cost (€)'], ['O9', 'Total Cost (€)']]
  for (const [ref, value] of headers) {
    setValue(worksheet.getCell(ref), value)
  }

  lines.forEach((line, index) => {
    const row = firstRow + index
    const templateProduct = templateProducts.get(clean(line.pn).trim().toLowerCase())
    const templateSupport = templateSupportRows.find(item => item.description.toLowerCase() === clean(line.desc).trim().toLowerCase())
    if (templateSupport) {
      worksheet.getRow(row).height = templateSupport.height
      templateSupport.cells.forEach((source, cellIndex) => {
        const cell = worksheet.getRow(row).getCell(cellIndex + 2)
        cell.value = source.value
        cell.style = { ...source.style }
        if (source.numFmt) setNumberFormat(cell, source.numFmt)
      })
    }
    // The proposal BoQ is the source of truth. Template rows provide layout
    // and fallback descriptions only; they must not override live quantities.
    const qty = number(totalQty(line))
    const unitPrice = round2(lineQuoted(line))
    // Landed cost and list price are derived (docProps.buildPricing), never
    // stored on the line — reading line.unitCost/unitPriceEuro wrote 0 into
    // every internal cost cell of the ModAE copy.
    const unitLandedCost = lineCost ? number(lineCost(line)) : 0
    const unitEuro = linePrice ? number(linePrice(line)) : 0
    setValue(worksheet.getCell(`B${row}`), index + 1)
    setValue(worksheet.getCell(`C${row}`), line.desc || line.itemCategory || templateProduct?.description || '')
    setValue(worksheet.getCell(`D${row}`), line.pn || '')
    setValue(worksheet.getCell(`E${row}`), qty)
    setValue(worksheet.getCell(`F${row}`), unitPrice)
    setValue(worksheet.getCell(`G${row}`), { formula: `F${row}*E${row}`, result: round2(unitPrice * qty) })
    setValue(worksheet.getCell(`J${row}`), unitPrice)
    setValue(worksheet.getCell(`K${row}`), { formula: `J${row}*E${row}`, result: round2(unitPrice * qty) })
    setValue(worksheet.getCell(`L${row}`), unitLandedCost)
    setValue(worksheet.getCell(`M${row}`), { formula: `L${row}*E${row}`, result: unitLandedCost * qty })
    setValue(worksheet.getCell(`N${row}`), unitEuro)
    setValue(worksheet.getCell(`O${row}`), { formula: `N${row}*E${row}`, result: unitEuro * qty })
    for (const column of ['F', 'G']) setNumberFormat(worksheet.getCell(`${column}${row}`), proposalFormat)
    for (const column of ['J', 'K', 'L', 'M']) setNumberFormat(worksheet.getCell(`${column}${row}`), rupeeFormat)
    for (const column of ['N', 'O']) setNumberFormat(worksheet.getCell(`${column}${row}`), euroFormat)
    setNumberFormat(worksheet.getCell(`E${row}`), '#,##0')
  })

  // Remove any unused template body rows between the live BoQ and footer.
  for (let row = firstRow + lines.length; row < totalRow; row++) {
    for (let column = 2; column <= 15; column++) worksheet.getCell(row, column).value = null
  }

  const footer = totalRow
  const footerPriceMerge = `F${footer}:G${footer}`
  const mergedCustomerTotal = worksheet.model.merges.includes(footerPriceMerge)
  setValue(worksheet.getCell(`B${footer}`), 'Total For')
  setValue(worksheet.getCell(`C${footer}`), customerSafe(doc.subject) || customerSafe(p.subject)
    || customerSafe(opp.oppName) || `${route || 'Techno-Commercial'} Proposal`)
  for (const column of ['J', 'K', 'L', 'M', 'N', 'O']) {
    const cell = worksheet.getCell(`${column}${footer}`)
    setNumberFormat(cell, ['F', 'G'].includes(column) ? proposalFormat : ['N', 'O'].includes(column) ? euroFormat : rupeeFormat)
    if (['G', 'K', 'M', 'O'].includes(column)) {
      const result = lines.reduce((sum, line, index) => {
        const row = firstRow + index
        const qty = totalQty(line)
        const unit = column === 'G' || column === 'K' ? round2(lineQuoted(line)) : column === 'M' ? (lineCost ? number(lineCost(line)) : 0) : (linePrice ? number(linePrice(line)) : 0)
        return sum + round2(unit * number(qty))
      }, 0)
      cell.value = { formula: `SUM(${column}${firstRow}:${column}${footer - 1})`, result }
    }
  }
  const customerTotal = lines.reduce((sum, line) => sum + round2(lineQuoted(line)) * number(totalQty(line)), 0)
  if (mergedCustomerTotal) {
    const totalCell = worksheet.getCell(`F${footer}`)
    totalCell.value = { formula: `SUM(G${firstRow}:G${footer - 1})`, result: round2(customerTotal) }
    setNumberFormat(totalCell, proposalFormat)
  } else {
    worksheet.getCell(`F${footer}`).value = null
    const totalCell = worksheet.getCell(`G${footer}`)
    totalCell.value = { formula: `SUM(G${firstRow}:G${footer - 1})`, result: round2(customerTotal) }
    setNumberFormat(totalCell, proposalFormat)
  }
  const termsStart = footer + 2
  // The source templates contain leftover customer-facing rows below the BOQ
  // (including an older, duplicate Terms & Conditions block). Clear those
  // rows before writing the generated terms so they cannot leak into page 2.
  // Keep the internal costing columns J:O untouched.
  for (let row = footer + 1; row <= worksheet.rowCount; row++) {
    for (let column = 2; column <= 8; column++) worksheet.getCell(row, column).value = null
  }

  const writeTermRow = (row, value, heading = false) => {
    if (row > termsStart + 1) cloneRowPresentation(worksheet, termsStart + 1, row)
    setValue(worksheet.getCell(`B${row}`), value, heading ? { font: { bold: true } } : {})
  }

  writeTermRow(termsStart, doc.docTermsHeading || 'Terms & Conditions:', true)
  ;(doc.docTerms || []).forEach((term, index) => {
    const row = termsStart + index + 1
    writeTermRow(row, `${index + 1}. ${term.label || ''}: ${term.text || ''}`.trim())
  })
  if (redactInternalCosting) stripInternalCosting(worksheet)
}

// Uploaded workbooks can use different sheet names, header rows and column
// order. When Gemini has identified a line table, write only into those mapped
// cells and leave the workbook's own layout, logo, formulas and surrounding
// content untouched.
function setMappedCommercialSheet(worksheet, args) {
  const { p, doc, totalQty, lineQuoted, mapping, redactInternalCosting } = args
  const table = mapping?.lineTable
  const columns = table?.columns || {}
  if (!table || !Number.isInteger(table.headerRow) || !Number.isInteger(columns.description) || !Number.isInteger(columns.quantity)) return false
  setPrintLayout(worksheet, 'landscape')
  const lines = p.bom || []
  // Admin template mappings store the detected header as a zero-based raw
  // worksheet index, so the first ExcelJS data row is two greater. Built-in
  // mappings use an explicit firstDataRow to avoid any coordinate ambiguity.
  const firstRow = Number.isInteger(table.firstDataRow) ? table.firstDataRow : table.headerRow + 2
  const customerLastColumn = Number(mapping?.customerLastColumn)
    || Math.max(...Object.values(columns).filter(Number.isInteger).map(index => index + 1))
  const customerFirstColumn = Math.min(...Object.values(columns).filter(Number.isInteger).map(index => index + 1))
  const detectedTotalRow = Number.isInteger(table.totalRow) ? table.totalRow : (() => {
    for (let row = firstRow; row <= worksheet.rowCount; row++) {
      const rowText = Array.from({ length: customerLastColumn - 1 }, (_, index) => clean(worksheet.getCell(row, index + 2).value)).join(' ')
      if (/\b(?:grand\s+)?total\b/i.test(rowText)) return row
    }
    return null
  })()
  const lastDataRow = Number.isInteger(table.lastDataRow)
    ? table.lastDataRow
    : detectedTotalRow ? detectedTotalRow - 1 : firstRow + Math.max(lines.length - 1, 0)
  const totalRow = detectedTotalRow || firstRow + lines.length
  if (lines.length > lastDataRow - firstRow + 1) {
    throw new Error(`${worksheet.name} supports ${lastDataRow - firstRow + 1} proposal lines; remove or consolidate lines before generating the customer workbook`)
  }
  const cell = (row, key) => Number.isInteger(columns[key]) ? worksheet.getCell(row, columns[key] + 1) : null
  const contentEndRow = Number.isInteger(table.contentEndRow) ? table.contentEndRow : totalRow
  for (let row = firstRow; row <= contentEndRow; row++) {
    for (let column = customerFirstColumn; column <= customerLastColumn; column++) worksheet.getCell(row, column).value = null
  }
  lines.forEach((line, index) => {
    const row = firstRow + index
    const qty = number(totalQty(line))
    const unit = round2(lineQuoted(line))
    const values = {
      serial: index + 1,
      itemCategory: line.itemCategory || '',
      partNumber: line.pn || '',
      description: line.desc || line.itemCategory || '',
      quantity: qty,
      unitPrice: unit,
      totalPrice: round2(unit * qty),
    }
    for (const [key, value] of Object.entries(values)) {
      const target = cell(row, key)
      if (target) {
        setValue(target, value)
        if (['unitPrice', 'totalPrice'].includes(key)) setNumberFormat(target, '#,##0.00')
      }
    }
  })
  const total = round2(lines.reduce((sum, line) => sum + round2(lineQuoted(line)) * number(totalQty(line)), 0))
  const totalCell = cell(totalRow, 'totalPrice')
  if (totalCell) setValue(totalCell, total)
  const descriptionCell = cell(totalRow, 'description')
  if (descriptionCell) setValue(descriptionCell, 'Total')
  const termsStartRow = Number.isInteger(table.termsStartRow) ? table.termsStartRow : totalRow + 2
  const terms = doc?.docTerms || []
  if (terms.length) {
    const headingCell = worksheet.getCell(termsStartRow, 2)
    setValue(headingCell, doc?.docTermsHeading || 'Terms & Conditions:', { font: { bold: true } })
    terms.forEach((term, index) => {
      const row = termsStartRow + index + 1
      if (row > worksheet.rowCount) cloneRowPresentation(worksheet, Math.min(termsStartRow + 1, worksheet.rowCount), row)
      setValue(worksheet.getCell(row, 2), `${index + 1}. ${term.label || ''}: ${term.text || ''}`.trim())
    })
  }
  if (redactInternalCosting) {
    stripInternalCosting(worksheet, customerLastColumn + 1)
  }
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
  const builtInTemplate = BUILT_IN_PROPOSAL_TEMPLATES.find(item => item.key === proposalTemplateLane(args.route))
  const templateUrl = args.templateBuffer || args.templateUrl || builtInTemplate?.url
  if (!templateUrl) throw new Error(`No proposal template is available for ${args.route || 'this route'}`)
  const generationArgs = { ...args, mapping: args.mapping || builtInTemplate?.mapping }
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await readBuffer(templateUrl))
  expandSharedFormulas(workbook)
  sanitizeWorkbook(workbook)
  const logo = await fetchOptionalLogo(args.logoBuffer)
  const byName = name => workbook.worksheets.find(sheet => sheet.name.trim() === name)
  const cover = byName(generationArgs.mapping?.coverSheet) || byName('Cover Letter') || workbook.worksheets[0]
  const defaultCommercialSheet = args.route === 'Project' ? 'Priced BoQ' : args.route === 'Services' ? 'Proposal' : 'Firm Rev-00'
  const commercial = byName(generationArgs.mapping?.commercialSheet) || byName(defaultCommercialSheet) || workbook.worksheets[1] || cover
  if (!cover || !commercial) throw new Error('Proposal template must contain a cover and commercial worksheet')
  ensureLogo(workbook, cover, logo, 18)
  ensureLogo(workbook, commercial, logo, 24)
  setCoverSheet(workbook, cover, generationArgs)
  clearPlaceholderLocations(cover)
  applyHeaderRule(cover, 1, 18)
  applyTaglineBranding(workbook)
  const mappedCommercial = generationArgs.mapping?.lineTable?.sheet === commercial.name
  if (mappedCommercial && !setMappedCommercialSheet(commercial, generationArgs)) setCommercialSheet(workbook, commercial, generationArgs)
  else if (!mappedCommercial) setCommercialSheet(workbook, commercial, generationArgs)
  applyHeaderRule(commercial, 1, 9)
  setCustomerPrintArea(workbook, cover, 1, Math.min(18, cover.columnCount))
  setCustomerPrintArea(workbook, commercial, 1, Math.min(8, commercial.columnCount))
  return new Uint8Array(await workbook.xlsx.writeBuffer())
}

export { MIME_XLSX }
