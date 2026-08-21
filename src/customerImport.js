import XLSX from 'xlsx-js-style'

// The Customer Master's "upload existing customers" path (20 Aug review:
// admin must be able to add or upload ModAE's existing accounts so their
// Green-class continuity works from day one). The client's sheets arrive in
// whatever shape their Excel happens to have, so the header mapping is
// deliberately tolerant — but deterministic, so a test can pin it.

const HEADER_ALIASES = {
  name: ['name', 'customer', 'customer name', 'customers', 'sell to', 'sell to customer', 'account', 'account name', 'company', 'company name', 'party'],
  category: ['category', 'customer category', 'type', 'customer type', 'class of customer'],
  status: ['status', 'customer status', 'class', 'customer class', 'colour', 'color', 'code', 'colour code', 'color code'],
  kyc: ['kyc', 'kyc status', 'kyc state'],
  payment: ['payment', 'payment pattern', 'payment terms', 'payment behaviour', 'payment behavior'],
  location: ['location', 'city', 'place', 'site', 'region'],
}

const canon = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

// header text (as found in the sheet) → our field name, or null.
export function fieldForHeader(header) {
  const c = canon(header)
  if (!c) return null
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(c)) return field
  }
  return null
}

const STATUS_WORDS = {
  green: 'Green', amber: 'Amber', yellow: 'Amber', red: 'Red', blue: 'Blue', new: 'Blue',
}

export function normalizeStatus(value) {
  const c = canon(value)
  for (const [word, status] of Object.entries(STATUS_WORDS)) {
    if (c === word || c.startsWith(word + ' ') || c.endsWith(' ' + word)) return status
  }
  // These are the client's existing verified accounts — the whole point of the
  // import — so an unrecognised or missing class reads Green, not Blue.
  return 'Green'
}

// One raw sheet row (keyed by original headers) → a customer-master record,
// or null when no name could be found.
export function normalizeCustomerRow(raw) {
  const record = {}
  for (const [header, value] of Object.entries(raw || {})) {
    const field = fieldForHeader(header)
    if (field && !(field in record) && String(value ?? '').trim()) {
      record[field] = String(value).trim()
    }
  }
  if (!record.name) return null
  const status = normalizeStatus(record.status)
  return {
    name: record.name,
    category: record.category || '—',
    status,
    kyc: record.kyc || (status === 'Green' ? 'Valid' : 'Pending'),
    payment: record.payment || '—',
    ...(record.location ? { location: record.location } : {}),
  }
}

// ArrayBuffer of an .xlsx/.xls/.csv → normalized customer records (first sheet).
export function parseCustomerFile(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) return []
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  return rawRows.map(normalizeCustomerRow).filter(Boolean)
}
