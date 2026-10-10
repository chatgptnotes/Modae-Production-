import XLSX from 'xlsx-js-style'

const canon = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const HEADER_ALIASES = {
  id: ['opp id', 'opportunity id', 'id'],
  sellTo: ['sell to customer', 'customer', 'customer name'],
  oppName: ['opportunity name description', 'oppurtunity name description', 'opportunity name', 'description'],
  owner: ['owner', 'sales owner'],
  stage: ['stage', 'funnel stage'],
  valueK: ['value', 'value inr', 'value rs', 'opportunity value'],
  orderDate: ['expected order date', 'expected close date', 'close date'],
  status: ['status'],
}

const valueFor = (row, names) => {
  const wanted = new Set(names.map(canon))
  const key = Object.keys(row).find(name => wanted.has(canon(name)))
  return key ? row[key] : ''
}

const valueOf = value => {
  if (value && typeof value === 'object' && 'result' in value) return value.result
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return value
}

const textOf = value => {
  const resolved = valueOf(value)
  if (resolved == null || resolved === '') return null
  const text = String(resolved).replace(/\s+/g, ' ').trim()
  return text || null
}

const numberOf = value => {
  const resolved = valueOf(value)
  if (resolved == null || resolved === '' || resolved === '[object Object]') return null
  const number = Number(resolved)
  return Number.isFinite(number) ? number : null
}

const booleanOf = value => ['true', 'yes', 'y', '1'].includes(String(valueOf(value) ?? '').toLowerCase())

const routeFor = type => type === 'Spares' || type === 'Retrofit' ? 'Spares' : type === 'Service' ? 'Service' : 'Project'
const contextFor = type => type === 'Service' ? 'Service' : routeFor(type) === 'Spares' ? 'Brownfield' : 'Greenfield'
const milestoneFor = (status, stage) => {
  if (status === 'Closed') return stage === 'Lost' ? 'Follow-up' : 'Screening'
  return ({ RFQ: 'Sourcing', RFI: 'Clarification' }[stage] || 'Proposal')
}

const workbookRows = worksheet => {
  const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null, raw: true })
  const headers = (matrix[0] || []).map(value => String(value ?? ''))
  return matrix.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index]])))
}

const rowValue = (row, ...names) => valueFor(row, names)

function currentOpportunity(row) {
  const id = textOf(rowValue(row, 'Opp ID'))
  const status = textOf(rowValue(row, 'Status*', 'Status'))
  if (!id || status !== 'Open') return null
  const oppType = textOf(rowValue(row, 'Opp Type*', 'Opp Type')) || 'Project'
  const stage = textOf(rowValue(row, 'Stage*', 'Stage')) || 'Lead'
  const valueK = numberOf(rowValue(row, 'Value (K₹)*', 'Value (K₹)'))
  const cogsK = numberOf(rowValue(row, 'COGS (K₹)*', 'COGS (K₹)'))
  const gmK = numberOf(rowValue(row, 'GM (K₹)'))
  const gmPct = numberOf(rowValue(row, 'GM%')) ?? (valueK ? (valueK - cogsK) / valueK : null)
  const remarks = textOf(rowValue(row, 'Update/Remarks', 'Remarks'))
  return {
    id,
    oppName: textOf(rowValue(row, 'Oppurtunity Name/Description*', 'Opportunity Name/Description')) || textOf(rowValue(row, 'Sell To Customer*', 'Sell To Customer')) || id,
    sellTo: textOf(rowValue(row, 'Sell To Customer*', 'Sell To Customer')),
    category: textOf(rowValue(row, 'Category*', 'Category')),
    location: textOf(rowValue(row, 'Location')),
    customerStatus: textOf(rowValue(row, 'Customer Status')),
    eucName: textOf(rowValue(row, 'EUC Name*', 'End User Customer')),
    eucLocation: textOf(rowValue(row, 'EUC Location', 'EU Location')),
    owner: textOf(rowValue(row, 'LJS', 'Owner')),
    oppType,
    bu: textOf(rowValue(row, 'BU*', 'BU')),
    segment: textOf(rowValue(row, 'Segment')),
    product: textOf(rowValue(row, 'Product*', 'Product')),
    prob: textOf(rowValue(row, 'Prob (%)*', 'Prob (%)')),
    valueK, cogsK, gmK, gmPct,
    createDate: textOf(rowValue(row, 'Create Date*', 'Offer Date')),
    proposalDate: textOf(rowValue(row, 'Proposal Date')),
    orderDate: textOf(rowValue(row, 'Order Date*', 'EDD/ADD')),
    fqFy: textOf(rowValue(row, 'FQ-FY')),
    invoiceDate: textOf(rowValue(row, 'Invoice Date*', 'Invoice Date')),
    status, stage,
    closedReason: textOf(rowValue(row, 'Closed Reason*', 'Closed Reason')),
    contactPerson: textOf(rowValue(row, 'Contact Person*', 'Contact Person')),
    contactPhone: textOf(rowValue(row, 'Contact Phone #*', 'Contact Phone #')),
    lastUpdated: textOf(rowValue(row, 'Last Updated', 'Updated On')),
    forecast: booleanOf(rowValue(row, 'Forecast')),
    remarks, updateRemarks: remarks,
    route: routeFor(oppType), context: contextFor(oppType), milestone: milestoneFor(status, stage),
    importedFrom: 'Excel workbook / Current Opps', sourceSheet: 'Current Opps', legacyOppRefId: null,
  }
}

function oldOpportunity(row) {
  const id = textOf(rowValue(row, 'New Opp ID'))
  if (!id) return null
  const oppType = textOf(rowValue(row, 'Opp Type')) || 'Project'
  const status = 'Closed'
  const stage = textOf(rowValue(row, 'Stage')) || 'Lost'
  const valueK = numberOf(rowValue(row, 'Value (K₹)'))
  const cogsK = numberOf(rowValue(row, 'COGS (K₹)'))
  const gmK = numberOf(rowValue(row, 'GM (K₹)'))
  const gmPct = numberOf(rowValue(row, 'GM%')) ?? (valueK ? (valueK - cogsK) / valueK : null)
  const sellTo = textOf(rowValue(row, 'Sell To Customer'))
  const remarks = textOf(rowValue(row, 'Update/Remarks'))
  return {
    id,
    oppName: textOf(rowValue(row, 'Oppurtunity/Project Name & Description')) || sellTo || id,
    sellTo, category: textOf(rowValue(row, 'Category')), location: textOf(rowValue(row, 'Location')),
    customerStatus: null, eucName: textOf(rowValue(row, 'End User Customer')), eucLocation: textOf(rowValue(row, 'EU Location')),
    owner: textOf(rowValue(row, 'Owner')), oppType, bu: null, segment: null, product: textOf(rowValue(row, 'Product')),
    prob: textOf(rowValue(row, 'Prob (%)')), valueK, cogsK, gmK, gmPct,
    createDate: textOf(rowValue(row, 'Offer Date')), proposalDate: null, orderDate: textOf(rowValue(row, 'EDD/ADD')),
    fqFy: null, invoiceDate: null, status, stage, closedReason: textOf(rowValue(row, 'Closed Reason')),
    contactPerson: textOf(rowValue(row, 'Contact Person')), contactPhone: textOf(rowValue(row, 'Contact Phone #')),
    lastUpdated: textOf(rowValue(row, 'Updated On')), forecast: booleanOf(rowValue(row, 'Forecast')),
    remarks, updateRemarks: remarks,
    route: routeFor(oppType), context: contextFor(oppType), milestone: milestoneFor(status, stage),
    importedFrom: 'Excel workbook / Old Closed Opps', sourceSheet: 'Old Closed Opps', legacyOppRefId: textOf(rowValue(row, 'Opp. Ref. ID')),
  }
}

export function parseBetserWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const currentSheet = workbook.Sheets['Current Opps']
  const oldSheet = workbook.Sheets['Old Closed Opps']
  if (!currentSheet || !oldSheet) return { opportunities: [], customers: [], error: 'Expected Current Opps and Old Closed Opps sheets were not found.' }
  const opportunities = [
    ...workbookRows(currentSheet).map(currentOpportunity).filter(Boolean),
    ...workbookRows(oldSheet).map(oldOpportunity).filter(Boolean),
  ]
  const ids = new Set()
  if (opportunities.some(row => ids.has(row.id))) return { opportunities: [], customers: [], error: 'The workbook contains duplicate opportunity IDs.' }
  opportunities.forEach(row => ids.add(row.id))
  const customers = [...new Map(opportunities.filter(row => row.sellTo).map(row => {
    const key = row.sellTo.toLowerCase()
    return [key, {
      name: row.sellTo,
      category: row.category || '—',
      status: row.customerStatus || 'Blue',
      kyc: row.customerStatus === 'Green' ? 'Valid' : 'Pending',
      payment: '—',
      email: `purchase@${row.sellTo.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 48)}.example.in`,
      source: 'Excel workbook',
    }]
  })).values()]
  return { opportunities, customers, error: '' }
}

export function parsePipelineFile(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })
  const firstSheet = workbook.SheetNames[0]
  if (!firstSheet) return { headers: [], rows: [], missing: [] }
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: '' })
  const headers = rows.length ? Object.keys(rows[0]) : []
  const normalized = rows
    .map(row => Object.fromEntries(Object.entries(HEADER_ALIASES).map(([key, aliases]) => [key, valueFor(row, aliases)])))
    .filter(row => Object.values(row).some(value => String(value).trim()))
  const missing = ['sellTo', 'oppName'].filter(key => !headers.some(header => HEADER_ALIASES[key].includes(canon(header))))
  const importData = parseBetserWorkbook(buffer)
  return { headers, rows: normalized, previewRows: rows, missing, importData }
}
