const clean = value => String(value ?? '').trim()
const key = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '')
const number = value => {
  const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}
const money = value => Math.round((Number(value) || 0) * 100) / 100

const aliases = {
  description: ['item description', 'description', 'item scope', 'scope', 'scope / equipment description'],
  partNumber: ['proposed model part no', 'proposed modelpart no', 'model part number', 'modelpartnumber', 'part no', 'part number', 'part number / customer reference', 'model'],
  quantity: ['total qty', 'total quantity', 'qty', 'quantity', 'qty unit'],
  uom: ['uom', 'unit'],
  unitPrice: ['unit price', 'unit price inr', 'unit price rs', 'customer unit price', 'quoted unit price'],
  totalPrice: ['total price', 'total price inr', 'quoted total', 'customer total price', 'line total'],
}

const commercialTermPatterns = [
  { key: 'payment', label: 'Payment', pattern: /payment(?:\s+terms?)?/i, start: /^payment(?:\s+terms?)?\s*:?\s*/i },
  { key: 'freight', label: 'Freight / Incoterms', pattern: /freight|incoterms?|shipping/i, start: /^(?:and\s+)?(?:freight(?:\s*&\s*insurance)?|incoterms?|shipping)\s*:?\s*/i },
  { key: 'delivery', label: 'Delivery', pattern: /delivery(?:\s+period|\s+terms?)?/i, start: /^delivery(?:\s+period|\s+terms?)?\s*:?\s*/i },
  { key: 'warranty', label: 'Warranty', pattern: /warranty/i, start: /^warranty(?:\s+certificate)?\s*:?\s*/i },
  { key: 'validity', label: 'Proposal validity', pattern: /proposal\s+validity|offer\s+validity/i, start: /^proposal\s+validity(?:\s*&\s*price\s+escalation\s+clause)?\s*:?\s*/i },
]

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

const compactTermText = value => clean(value).replace(/\s+/g, ' ').trim()
const comparableTermText = value => compactTermText(value).toLowerCase().replace(/[“”‘’]/g, "'")
const termForKey = keyValue => commercialTermPatterns.find(term => term.key === keyValue)
const termKeyForText = value => commercialTermPatterns.find(term => term.pattern.test(compactTermText(value)))?.key || ''

const termTextWithoutLabel = (value, term) => {
  let text = compactTermText(value).replace(/^\d+\s*[.)-]?\s*/, '')
  return compactTermText(text.replace(term.start, ''))
}

const proposalTermValue = term => compactTermText(
  term?.ourResponse || term?.proposedTerm || term?.customerAsk || term?.standardTerm || '',
)
const comparisonTermValue = term => compactTermText(term?.text || proposalTermValue(term))

// Customer-facing proposal workbooks print terms as a heading followed by one
// or more prose rows. Keep the rows grouped until the next recognised term so
// split/wrapped Excel cells still produce one comparable value.
export function extractCommercialTerms(workbook) {
  const found = new Map()
  for (const sheet of workbook?.sheets || []) {
    let termsStarted = false
    let current = null
    for (let rowIndex = 0; rowIndex < (sheet.rows || []).length; rowIndex++) {
      const row = sheet.rows[rowIndex] || []
      const text = compactTermText(row.filter(value => compactTermText(value)).join(' '))
      if (!text) continue
      if (!termsStarted) {
        if (/terms\s*&?\s*conditions?/i.test(text)) termsStarted = true
        continue
      }
      const termKey = termKeyForText(text)
      if (termKey) {
        const definition = termForKey(termKey)
        current = found.get(termKey) || {
          key: termKey,
          label: definition.label,
          sheet: sheet.name,
          row: rowIndex + 1,
          text: '',
        }
        const value = termTextWithoutLabel(text, definition)
        if (value) current.text = compactTermText([current.text, value].filter(Boolean).join(' '))
        found.set(termKey, current)
      } else if (current) {
        current.text = compactTermText([current.text, text].filter(Boolean).join(' '))
      }
    }
  }
  return [...found.values()].filter(term => term.text)
}

const commercialTermChanges = (workbook, proposal, comparisonTerms = null) => {
  const uploaded = extractCommercialTerms(workbook)
  const baseline = Array.isArray(comparisonTerms) && comparisonTerms.length
    ? comparisonTerms
    : proposal?.terms || []
  const original = new Map(baseline.flatMap(term => {
    const keyValue = term?.key || termKeyForText(term?.label || term?.term)
    const value = comparisonTermValue(term)
    return keyValue && value ? [[keyValue, { key: keyValue, label: termForKey(keyValue)?.label || term.term, text: value }]] : []
  }))
  const changes = []
  const issues = []
  for (const term of uploaded) {
    const before = original.get(term.key)
    if (!before || comparableTermText(before.text) === comparableTermText(term.text)) continue
    const change = { field: 'commercialTerm', label: term.label, before: before.text, after: term.text, line: term.label, row: term.row }
    changes.push(change)
    issues.push({
      severity: 'info',
      code: 'term.value-changed',
      humanReview: true,
      text: `${term.label} changed from ${displayValue(before.text)} to ${displayValue(term.text)}.`,
      evidence: `${term.sheet}, Row ${term.row}`,
      change,
    })
  }
  return { changes, issues }
}

const displayValue = value => `"${value == null || value === '' ? 'blank' : String(value)}"`
const LOGICAL_CHANGE_CODES = new Set(['line.value-changed', 'line.removed', 'term.value-changed'])

// Local parsing identifies possible changes. The AI review is the second pass:
// it confirms which candidates are meaningful business changes. Structural
// validation findings remain visible regardless of the AI decision.
export function filterLogicalChangeIssues(issues = [], aiReview = {}, { aiAvailable = false } = {}) {
  if (!aiAvailable || !Array.isArray(aiReview?.confirmedChangeIndexes)) return issues
  const confirmed = new Set(aiReview.confirmedChangeIndexes.filter(index => Number.isInteger(index)))
  let candidateIndex = 0
  return issues.filter(issue => {
    if (!LOGICAL_CHANGE_CODES.has(issue?.code) || !issue?.change) return true
    const keep = confirmed.has(candidateIndex)
    candidateIndex += 1
    return keep
  })
}

const sameNumber = (left, right) => Number(left) === Number(right)
const sameMoney = (left, right) => money(left) === money(right)
const normalizedMoney = value => value == null || String(value).trim() === '' ? value : money(value)
const normalizedUom = value => {
  const normalized = clean(value).toLowerCase().replace(/[.\s_-]+/g, '')
  if (['ea', 'no', 'nos', 'pc', 'pcs', 'piece', 'pieces'].includes(normalized)) return 'EA'
  if (['set', 'sets'].includes(normalized)) return 'SET'
  if (['m', 'meter', 'meters', 'mtr', 'mtrs'].includes(normalized)) return 'M'
  return normalized.toUpperCase()
}

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
  changedField('uom', 'UOM', old.uom || 'EA', row.uom, (left, right) => normalizedUom(left) === normalizedUom(right)),
  row.unitPrice == null ? null : changedField('unitPrice', 'Unit price', normalizedMoney(old.quoted), money(row.unitPrice), sameMoney),
  row.totalPrice == null ? null : changedField(
    'totalPrice',
    'Total price',
    money(money(old.quoted) * totalQuantity(old, units)),
    money(row.totalPrice),
    sameMoney,
  ),
].filter(Boolean)

const valueChangeIssue = (row, change, sheetName) => ({
  severity: 'warning',
  code: 'line.value-changed',
  text: `${change.label} for "${row.description || row.pn}" changed from ${displayValue(change.before)} to ${displayValue(change.after)}.`,
  evidence: `${sheetName}, Row ${row.index}`,
  change: { ...change, row: row.index, line: row.description || row.pn },
})

export function importReviewedWorkbook(workbook, proposal, opportunity, { comparisonTerms = null } = {}) {
  const issues = []
  const changes = []
  const termReview = commercialTermChanges(workbook, proposal, comparisonTerms)
  const table = findTable(workbook)
  if (!table) {
    return { proposal, issues: [{ severity: 'block', code: 'workbook.table', text: 'No proposal BoQ table with description and quantity columns was found.' }, ...termReview.issues], changes, termChanges: termReview.changes, table: null }
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

  const originalBom = proposal.bom || []
  const originalBomLength = originalBom.length
  const nextBom = [...originalBom].map(line => ({ ...line }))
  const used = new Set()
  const ambiguous = new Set()
  const normalized = value => key(value).replace(/ea|nos|pcs|sets?$/g, '')
  const findExisting = row => {
    const exactPn = nextBom.findIndex((line, index) => !used.has(index) && row.pn && normalized(line.pn) === normalized(row.pn))
    if (exactPn >= 0) return { index: exactPn }
    const descriptionMatches = nextBom
      .map((line, index) => ({ line, index }))
      .filter(({ line, index }) => !used.has(index) && row.description && normalized(line.desc) === normalized(row.description))
    if (descriptionMatches.length > 1) return { index: -1, ambiguous: true, indexes: descriptionMatches.map(match => match.index) }
    return { index: descriptionMatches[0]?.index ?? -1 }
  }

  for (const row of importedRows) {
    if (!row.description) issues.push({ severity: 'warning', code: 'line.description', text: `Workbook row ${row.index} is missing an item description.` })
    if (!row.pn) issues.push({ severity: 'warning', code: 'line.part', text: `Workbook row ${row.index} is missing a model or part number.` })
    if (row.qty <= 0) issues.push({ severity: 'block', code: 'line.quantity', text: `Workbook row ${row.index} must have a quantity greater than zero.` })
    if (row.unitPrice != null && row.unitPrice < 0) issues.push({ severity: 'block', code: 'line.price', text: `Workbook row ${row.index} has a negative unit price.` })
    if (row.unitPrice != null && row.totalPrice != null && Math.abs(money(row.unitPrice) * row.qty - money(row.totalPrice)) > 0.01) {
      issues.push({ severity: 'block', code: 'line.total', text: `Workbook row ${row.index} total price does not equal unit price × quantity.` })
    }
    const match = findExisting(row)
    if (match.ambiguous) {
      match.indexes.forEach(index => ambiguous.add(index))
      issues.push({ severity: 'block', code: 'line.ambiguous', text: `Workbook row ${row.index} matches more than one proposal line. Add the exact part number before continuing.`, evidence: `${table.sheet.name}, Row ${row.index}` })
      continue
    }
    const existingIndex = match.index
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
        ...(row.unitPrice != null ? { quoted: money(row.unitPrice) } : {}),
      }
      nextBom[existingIndex] = updated
      changes.push({ type: 'updated', line: row.description || row.pn, fields: fieldChanges })
      issues.push(...fieldChanges.map(change => valueChangeIssue(row, change, table.sheet.name)))
    } else {
      nextBom.push({ itemCategory: 'Imported', desc: row.description, pn: row.pn, custRef: '', adders: [], qtyPerUnit: 0, common: row.qty, spares: 0, quoted: row.unitPrice == null ? '' : money(row.unitPrice), uom: row.uom, currency: 'INR' })
      changes.push({ type: 'added', line: row.description || row.pn })
      issues.push({ severity: 'warning', code: 'line.unmatched', text: `Workbook row ${row.index} did not match an existing proposal line and was added for review.` })
    }
  }

  originalBom.forEach((line, index) => {
    if (used.has(index) || ambiguous.has(index)) return
    const label = line.desc || line.pn || `line ${index + 1}`
    const change = {
      field: 'line',
      before: { description: line.desc || '', partNumber: line.pn || '', quantity: totalQuantity(line, proposal.units), unitPrice: normalizedMoney(line.quoted) },
      after: null,
      line: label,
    }
    changes.push({ type: 'removed', line: label, fields: [change] })
    issues.push({
      severity: 'warning',
      code: 'line.removed',
      text: `Line "${label}" was removed from the uploaded workbook revision.`,
      evidence: `Original proposal line ${index + 1}`,
      change,
    })
  })

  // The uploaded workbook is authoritative for the active customer BoQ. Keep
  // newly imported rows, but do not carry forward original rows absent from it.
  const mergedBom = nextBom.filter((_, index) => index >= originalBomLength || used.has(index) || ambiguous.has(index))

  const customerText = (workbook.sheets || []).flatMap(sheet => sheet.rows || []).flat().map(clean).join(' ')
  if (opportunity?.sellTo && customerText && !customerText.toLowerCase().includes(clean(opportunity.sellTo).toLowerCase())) {
    issues.push({ severity: 'warning', code: 'customer.mismatch', text: 'The uploaded workbook does not clearly contain the opportunity customer name.' })
  }
  issues.push(...termReview.issues)
  return { proposal: { ...proposal, bom: mergedBom }, issues, changes, termChanges: termReview.changes, table: { sheet: table.sheet.name, headerRow: table.headerRow, columns: table.columns } }
}

const proposalLineSnapshot = proposal => (proposal?.bom || []).map(line => ({
  description: line.desc,
  partNumber: line.pn,
  quantity: totalQuantity(line, proposal.units),
  quantityPerUnit: line.qtyPerUnit,
  common: line.common,
  spares: line.spares,
  quoted: line.quoted,
  uom: line.uom,
}))

export function reviewWorkbookPayload(workbook, proposal, opportunity, localIssues, comparison = {}) {
  const candidateChanges = localIssues
    .filter(issue => LOGICAL_CHANGE_CODES.has(issue?.code) && issue?.change)
    .map((issue, index) => ({
      index,
      code: issue.code,
      text: issue.text,
      change: issue.change,
      evidence: issue.evidence,
    }))
  return {
    artifactType: workbook?.sheets?.length ? 'uploaded-workbook' : 'generated-proposal',
    opportunity: { id: opportunity?.id, customer: opportunity?.sellTo, name: opportunity?.oppName, route: opportunity?.oppType },
    proposal: { revision: proposal?.revision, terms: proposal?.terms || [], lines: proposalLineSnapshot(proposal) },
    comparison: {
      method: 'deterministic-local-parse-before-ai',
      baselineLines: proposalLineSnapshot(comparison.baseline),
      baselineTerms: comparison.baselineTerms || [],
      deterministicChanges: comparison.deterministicChanges || [],
      deterministicTermChanges: comparison.deterministicTermChanges || [],
      candidateChanges,
    },
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
