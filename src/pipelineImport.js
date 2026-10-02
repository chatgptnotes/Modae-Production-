import XLSX from 'xlsx-js-style'

const canon = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const HEADER_ALIASES = {
  id: ['opp id', 'opportunity id', 'id'],
  sellTo: ['sell to customer', 'customer', 'customer name'],
  oppName: ['opportunity name description', 'opportunity name', 'description'],
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
  return { headers, rows: normalized, previewRows: rows, missing }
}
