const clean = value => String(value ?? '').trim()
const key = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '')
const number = value => {
  const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

const aliases = {
  description: ['item description', 'description', 'item scope', 'scope', 'scope / equipment description'],
  partNumber: ['proposed model part no', 'proposed modelpart no', 'model part number', 'modelpartnumber', 'part no', 'part number', 'model'],
  quantity: ['total qty', 'total quantity', 'qty', 'quantity', 'qty unit'],
  uom: ['uom', 'unit'],
  unitPrice: ['unit price', 'unit price inr', 'unit price rs'],
  totalPrice: ['total price', 'total price inr', 'quoted total'],
}

const matches = (value, candidates) => candidates.some(candidate => key(value) === key(candidate))

function findTable(workbook) {
  let best = null
  for (const sheet of workbook?.sheets || []) {
    for (let rowIndex = 0; rowIndex < (sheet.rows || []).length; rowIndex++) {
      const row = sheet.rows[rowIndex] || []
      const columns = {}
      row.forEach((value, columnIndex) => {
        for (const [field, names] of Object.entries(aliases)) {
          if (columns[field] == null && matches(value, names)) columns[field] = columnIndex
        }
      })
      if (columns.description == null || columns.quantity == null) continue
      const score = Object.keys(columns).length + (/firm|pricing|proposal|boq/i.test(sheet.name) ? 2 : 0)
      if (!best || score > best.score) best = { sheet, headerRow: rowIndex, columns, score }
    }
  }
  return best
}

const valueAt = (row, index) => index == null ? '' : row[index]
const rowIsTotal = row => row.some(value => /total/i.test(clean(value)))

const displayValue = value => value == null || value === '' ? 'blank' : String(value)
const sameNumber = (left, right) => Number(left) === Number(right)

const changedField = (field, label, before, after, equal = (left, right) => clean(left) === clean(right)) => {
  if (equal(before, after)) return null
  return { field, label, before, after }
}

const totalQuantity = (line, units = 1) =>
  (Number(line?.qtyPerUnit) || 0) * (Number(units) || 1)
  + (Number(line?.common) || 0)
  + (Number(line?.spares) || 0)

const changesForRow = (old, row, units) => [
  changedField('description', 'Description', old.desc, row.description),
  changedField('partNumber', 'Part number', old.pn, row.pn),
  changedField('quantity', 'Quantity', totalQuantity(old, units), row.qty, sameNumber),
  changedField('uom', 'UOM', old.uom || 'EA', row.uom),
  row.unitPrice == null ? null : changedField('unitPrice', 'Unit price', old.quoted, row.unitPrice, sameNumber),
  row.totalPrice == null ? null : changedField(
    'totalPrice',
    'Total price',
    Number(old.quoted) * totalQuantity(old, units),
    row.totalPrice,
    sameNumber,
  ),
].filter(Boolean)

const valueChangeIssue = (row, change, sheetName) => ({
  severity: 'warning',
  code: 'line.value-changed',
  text: `Workbook row ${row.index} changed ${change.label} for "${row.description || row.pn}" from ${displayValue(change.before)} to ${displayValue(change.after)}.`,
  evidence: `${sheetName}, Row ${row.index}`,
  change: { ...change, row: row.index, line: row.description || row.pn },
})

export function importReviewedWorkbook(workbook, proposal, opportunity) {
  const issues = []
  const changes = []
  const table = findTable(workbook)
  if (!table) {
    return { proposal, issues: [{ severity: 'block', code: 'workbook.table', text: 'No proposal BoQ table with description and quantity columns was found.' }], changes, table: null }
  }

  const importedRows = (table.sheet.rows || []).slice(table.headerRow + 1)
    .filter(row => row.some(value => clean(value)) && !rowIsTotal(row))
    .map((row, index) => ({
      index: index + table.headerRow + 2,
      description: clean(valueAt(row, table.columns.description)),
      pn: clean(valueAt(row, table.columns.partNumber)),
      qty: number(valueAt(row, table.columns.quantity)),
      uom: clean(valueAt(row, table.columns.uom)) || 'EA',
      unitPrice: table.columns.unitPrice == null ? null : number(valueAt(row, table.columns.unitPrice)),
      totalPrice: table.columns.totalPrice == null ? null : number(valueAt(row, table.columns.totalPrice)),
    }))
    .filter(row => row.description || row.pn)

  if (!importedRows.length) issues.push({ severity: 'block', code: 'workbook.empty', text: 'The reviewed workbook contains no proposal line items.' })

  const nextBom = [...(proposal.bom || [])].map(line => ({ ...line }))
  const used = new Set()
  const normalized = value => key(value).replace(/ea|nos|pcs|sets?$/g, '')
  const findExisting = row => {
    const exactPn = nextBom.findIndex((line, index) => !used.has(index) && row.pn && normalized(line.pn) === normalized(row.pn))
    if (exactPn >= 0) return exactPn
    return nextBom.findIndex((line, index) => !used.has(index) && row.description && normalized(line.desc) === normalized(row.description))
  }

  for (const row of importedRows) {
    if (!row.description) issues.push({ severity: 'warning', code: 'line.description', text: `Workbook row ${row.index} is missing an item description.` })
    if (!row.pn) issues.push({ severity: 'warning', code: 'line.part', text: `Workbook row ${row.index} is missing a model or part number.` })
    if (row.qty <= 0) issues.push({ severity: 'block', code: 'line.quantity', text: `Workbook row ${row.index} must have a quantity greater than zero.` })
    if (row.unitPrice != null && row.unitPrice < 0) issues.push({ severity: 'block', code: 'line.price', text: `Workbook row ${row.index} has a negative unit price.` })
    if (row.unitPrice != null && row.totalPrice != null && Math.abs(row.unitPrice * row.qty - row.totalPrice) > 0.01) {
      issues.push({ severity: 'block', code: 'line.total', text: `Workbook row ${row.index} total price does not equal unit price × quantity.` })
    }
    const existingIndex = findExisting(row)
    if (existingIndex >= 0) {
      used.add(existingIndex)
      const old = nextBom[existingIndex]
      const fieldChanges = changesForRow(old, row, proposal.units)
      const updated = {
        ...old,
        desc: row.description || old.desc,
        pn: row.pn || old.pn,
        uom: row.uom || old.uom,
        // Exported proposal workbooks contain Total Qty. Store it as a common
        // quantity so the proposal's existing Qty/Unit × Units rule does not
        // multiply an imported total a second time.
        qtyPerUnit: 0,
        common: row.qty,
        spares: 0,
        ...(row.unitPrice != null ? { quoted: row.unitPrice } : {}),
      }
      nextBom[existingIndex] = updated
      changes.push({ type: 'updated', line: row.description || row.pn, fields: fieldChanges })
      issues.push(...fieldChanges.map(change => valueChangeIssue(row, change, table.sheet.name)))
    } else {
      nextBom.push({ itemCategory: 'Imported', desc: row.description, pn: row.pn, custRef: '', adders: [], qtyPerUnit: 0, common: row.qty, spares: 0, quoted: row.unitPrice == null ? '' : row.unitPrice, uom: row.uom, currency: 'INR' })
      changes.push({ type: 'added', line: row.description || row.pn })
      issues.push({ severity: 'warning', code: 'line.unmatched', text: `Workbook row ${row.index} did not match an existing proposal line and was added for review.` })
    }
  }

  nextBom.forEach((line, index) => {
    if (!used.has(index) && index < (proposal.bom || []).length) issues.push({ severity: 'warning', code: 'line.missing', text: `Existing proposal line ${index + 1} was not found in the uploaded workbook.` })
  })

  const customerText = (workbook.sheets || []).flatMap(sheet => sheet.rows || []).flat().map(clean).join(' ')
  if (opportunity?.sellTo && customerText && !customerText.toLowerCase().includes(clean(opportunity.sellTo).toLowerCase())) {
    issues.push({ severity: 'warning', code: 'customer.mismatch', text: 'The uploaded workbook does not clearly contain the opportunity customer name.' })
  }
  return { proposal: { ...proposal, bom: nextBom }, issues, changes, table: { sheet: table.sheet.name, headerRow: table.headerRow, columns: table.columns } }
}

export function reviewWorkbookPayload(workbook, proposal, opportunity, localIssues) {
  return {
    opportunity: { id: opportunity?.id, customer: opportunity?.sellTo, name: opportunity?.oppName, route: opportunity?.oppType },
    proposal: { revision: proposal?.revision, terms: proposal?.terms || [], lines: (proposal?.bom || []).map(line => ({ description: line.desc, partNumber: line.pn, quantity: line.qtyPerUnit, common: line.common, spares: line.spares, quoted: line.quoted, uom: line.uom })) },
    workbook: (workbook?.sheets || []).map(sheet => ({ name: sheet.name, rows: (sheet.rows || []).slice(0, 160) })),
    localIssues: localIssues.map(issue => ({ severity: issue.severity, code: issue.code, text: issue.text })),
  }
}

export function normalizeAiReview(result) {
  const rows = result?.findings || result?.issues || []
  return Array.isArray(rows) ? rows.map((item, index) => ({
    severity: ['block', 'warning', 'info'].includes(item?.severity) ? item.severity : 'warning',
    code: item?.code || `ai-${index + 1}`,
    text: clean(item?.text || item?.finding || item?.concern || 'AI review finding'),
    evidence: clean(item?.evidence),
    source: 'AI',
  })) : []
}
