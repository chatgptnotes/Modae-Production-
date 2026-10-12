// Workbook contract shared by the table, importer and server. Contains no customer data.
const columns = [
  ['id', 'Opp ID', 11], ['sellTo', 'Sell To Customer*', 16], ['category', 'Category*', 6],
  ['location', 'Location', 6], ['customerStatus', 'Customer Status', 5], ['eucName', 'EUC Name*', 8],
  ['eucLocation', 'EUC Location', 6], ['oppName', 'Oppurtunity Name/Description*', 22], ['owner', 'LJS', 4],
  ['oppType', 'Opp Type*', 10], ['bu', 'BU*', 4], ['segment', 'Segment', 5], ['product', 'Product*', 6],
  ['prob', 'Prob (%)*', 9], ['valueK', 'Value (K₹)*', 7], ['cogsK', 'COGS (K₹)*', 5],
  ['gmK', 'GM (K₹)', 4], ['gmPct', 'GM%', 3], ['createDate', 'Create Date*', 5],
  ['proposalDate', 'Proposal Date', 5], ['orderDate', 'Order Date*', 14], ['fqFy', 'FQ-FY', 7],
  ['invoiceDate', 'Invoice Date*', 7], ['status', 'Status*', 5], ['stage', 'Stage*', 11],
  ['closedReason', 'Closed Reason*', 6], ['contactPerson', 'Contact Person*', 7],
  ['contactPhone', 'Contact Phone #*', 6], ['lastUpdated', 'Last Updated', 5],
  ['forecast', 'Forecast', 3], ['remarks', 'Update/Remarks', 10],
]
const letter = number => number > 26 ? `A${String.fromCharCode(64 + number - 26)}` : String.fromCharCode(64 + number)
export const PIPELINE_COLUMNS = columns.map(([key, label, w], index) => ({
  key, label, w, letter: letter(index + 3),
  ...(['valueK', 'cogsK', 'gmK', 'gmPct'].includes(key) ? { num: true } : {}),
  ...(['createDate', 'proposalDate', 'orderDate', 'invoiceDate', 'lastUpdated'].includes(key) ? { wAll: 7 } : {}),
}))

export function fiscalQuarter(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return ''
  const date = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return ''
  const month = date.getUTCMonth() + 1
  return `Q${month < 4 ? 4 : Math.floor((month - 4) / 3) + 1}-${date.getUTCFullYear() + (month >= 4 ? 1 : 0)}`
}
export function financials(row) {
  const value = Number(row.valueK) || 0
  const gmK = value - (Number(row.cogsK) || 0)
  return { gmK, gmPct: value ? gmK / value : null }
}
export const customerKey = value => String(value || '').trim().toLowerCase()
const missing = value => value == null || value === '' || value === '—'

export function customersFromOpportunities(opportunities) {
  const customers = new Map()
  for (const row of opportunities) {
    const key = customerKey(row.sellTo)
    if (!key) continue
    let customer = customers.get(key)
    if (!customer) {
      customer = { name: row.sellTo.trim(), category: row.category || '', status: row.customerStatus || 'Blue',
        kyc: 'Pending', payment: '', email: '', location: row.location || '', source: 'Excel workbook',
        classificationCriteria: {}, classificationNeedsReview: !row.customerStatus, importedStatuses: [] }
      customers.set(key, customer)
    }
    if (row.customerStatus) {
      customer.importedStatuses = [...new Set([...customer.importedStatuses, row.customerStatus])]
      customer.status = customer.importedStatuses[0]
      customer.classificationNeedsReview = customer.importedStatuses.length > 1
    }
  }
  return [...customers.values()]
}

// Only fill missing fields. Differences are review items, never overwrites.
export function mergeWorkbookData(state, imported) {
  const conflicts = []
  const deleted = new Set(state.deletedOpportunityIds || [])
  const mergeRows = (current, incoming, keyOf, entity) => {
    const rows = new Map(current.map(row => [keyOf(row), { ...row }]))
    for (const row of incoming) {
      const key = keyOf(row)
      if (entity === 'opportunity' && deleted.has(key)) continue
      const existing = rows.get(key)
      if (!existing) { rows.set(key, { ...row }); continue }
      for (const [field, value] of Object.entries(row)) {
        if (missing(value)) continue
        if (missing(existing[field])) existing[field] = value
        else if (JSON.stringify(existing[field]) !== JSON.stringify(value)) conflicts.push({ entity, id: key, field, saved: existing[field], incoming: value })
      }
    }
    return [...rows.values()]
  }
  return { ...state,
    opportunities: mergeRows(state.opportunities || [], imported.opportunities || [], row => row.id, 'opportunity'),
    customers: mergeRows(state.customers || [], imported.customers || [], row => customerKey(row.name), 'customer'),
    conflicts,
  }
}

export function classificationGuidance(sheet) {
  if (!Array.isArray(sheet)) return []
  const headerIndex = sheet.findIndex(row => row[0] === 'Criteria')
  if (headerIndex < 0) return []
  const headers = sheet[headerIndex]
  return sheet.slice(headerIndex + 1).filter(row => row[0]).map(row => ({
    label: String(row[0]),
    values: Object.fromEntries(['Blue', 'Red', 'Amber', 'Green'].map(cls => [cls, String(row[headers.indexOf(cls)] ?? '')])),
  }))
}

export function applyCustomerChange(state, name, patch) {
  const matches = value => customerKey(value) === customerKey(name)
  const colourPatch = patch.status ? { customerStatus: patch.status } : {}
  return { ...state,
    customers: state.customers.map(row => matches(row.name) ? { ...row, ...patch } : row),
    opportunities: (state.opportunities || []).map(row => matches(row.sellTo) ? { ...row, ...colourPatch } : row),
    leads: (state.leads || []).map(row => matches(row.sellTo || row.customerName) ? { ...row, ...colourPatch } : row),
  }
}
