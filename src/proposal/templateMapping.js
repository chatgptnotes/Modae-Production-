import { runTaskResult } from '../ai.js'

const FIELD_ALIASES = {
  customerName: [/customer(?:\s+name)?/, /sell\s*to/, /addressee/, /client/],
  customerAddress: [/billing\s+address/, /customer\s+address/, /^address$/],
  location: [/euc\s+location/, /plant\s+location/, /site\s+location/, /^location$/],
  contactPerson: [/contact\s+person/, /kind\s+attention/, /^attention$/, /^contact$/],
  subject: [/subject/, /project\s+title/, /proposal\s+title/],
  rfqNumber: [/rfq/, /reference/, /our\s+ref/, /tender\s+no/],
  project: [/project/, /application/, /equipment/, /installed\s+base/],
  terms: [/terms/, /commercial\s+terms/, /payment\s+terms/],
}

const HEADER_ALIASES = {
  partNumber: [/part\s*(?:no|number)/, /model/, /proposed\s+model/, /item\s+code/],
  description: [/description/, /item\s+description/, /scope/],
  quantity: [/^qty$/, /quantity/, /no\.\s*of/],
  unitPrice: [/unit\s+price/, /unit\s+rate/, /rate/, /price\s*\/\s*unit/],
  totalPrice: [/total\s+price/, /total\s+amount/, /line\s+total/, /amount/],
}

const textOf = value => String(value ?? '').replace(/\s+/g, ' ').trim()
const normalized = value => textOf(value).toLowerCase().replace(/[:.]/g, '')
const matchAlias = (value, aliases) => aliases.some(pattern => pattern.test(normalized(value)))

const fieldAt = (sheet, row, column, label) => ({
  sheet: sheet.name,
  row: row + Number(sheet.sourceRowOffset || 0),
  column: column + Number(sheet.sourceColumnOffset || 0),
  label: textOf(label),
})

const validLocation = (workbook, location) => {
  if (!location || typeof location !== 'object') return false
  const sheet = (workbook?.sheets || []).find(item => item.name === location.sheet)
  return !!sheet && Number.isInteger(location.row) && location.row >= 0
    && Number.isInteger(location.column) && location.column >= 0
}

const rawLocation = (workbook, location) => {
  if (!location || typeof location !== 'object') return null
  const sheet = (workbook?.sheets || []).find(item => item.name === location.sheet)
  if (!sheet || !Number.isInteger(location.row) || !Number.isInteger(location.column)) return null
  // Gemini receives the compact preview's zero-based coordinates. Convert
  // them back to the original worksheet coordinates before ExcelJS writes.
  if (location.rawRow != null || location.rawColumn != null) return location
  return {
    ...location,
    row: location.row + Number(sheet.sourceRowOffset || 0),
    column: location.column + Number(sheet.sourceColumnOffset || 0),
  }
}

const deterministicMapping = workbook => {
  const mapping = { version: 1, method: 'deterministic', coverSheet: '', commercialSheet: '', fields: {}, lineTable: null }
  const candidates = []
  for (const sheet of workbook?.sheets || []) {
    const rows = sheet.rows || []
    let score = 0
    const fields = {}
    rows.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
      const label = textOf(value)
      if (!label) return
      for (const [key, aliases] of Object.entries(FIELD_ALIASES)) {
        if (!fields[key] && matchAlias(label, aliases)) fields[key] = fieldAt(sheet, rowIndex, columnIndex, label)
      }
      if (matchAlias(label, Object.values(HEADER_ALIASES).flat())) score += 1
    }))
    candidates.push({ sheet, score, fields })
  }
  const cover = candidates.find(item => Object.keys(item.fields).length >= 2) || candidates[0]
  const commercial = [...candidates].sort((a, b) => b.score - a.score)[0] || candidates[0]
  mapping.coverSheet = cover?.sheet.name || ''
  mapping.commercialSheet = commercial?.sheet.name || mapping.coverSheet
  mapping.fields = { ...(cover?.fields || {}) }
  if (commercial) {
    const rows = commercial.sheet.rows || []
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex] || []
      const columns = {}
      row.forEach((value, columnIndex) => {
        const label = textOf(value)
        if (!label) return
        for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
          if (!columns[key] && matchAlias(label, aliases)) columns[key] = columnIndex
        }
      })
      if (Object.keys(columns).length >= 2) {
        mapping.lineTable = {
          sheet: commercial.sheet.name,
          headerRow: rowIndex + Number(commercial.sheet.sourceRowOffset || 0),
          columns: Object.fromEntries(Object.entries(columns).map(([key, column]) => [key, column + Number(commercial.sheet.sourceColumnOffset || 0)])),
        }
        break
      }
    }
  }
  const required = ['customerName', 'subject']
  const warnings = required.filter(key => !mapping.fields[key]).map(key => `${key} was not detected`)
  if (!mapping.coverSheet) warnings.push('No cover sheet was detected')
  if (!mapping.commercialSheet) warnings.push('No commercial sheet was detected')
  if (!mapping.lineTable) warnings.push('No line-item table was detected')
  return { mapping, warnings }
}

const compactWorkbook = workbook => (workbook?.sheets || []).map(sheet => ({
  name: sheet.name,
  sourceRowOffset: Number(sheet.sourceRowOffset || 0),
  sourceColumnOffset: Number(sheet.sourceColumnOffset || 0),
  rows: (sheet.rows || []).slice(0, 120).map(row => row.slice(0, 24).map(textOf)),
}))

const applyAiMapping = (workbook, base, ai) => {
  if (!ai || typeof ai !== 'object') return base
  const fields = { ...base.mapping.fields }
  for (const [key, location] of Object.entries(ai.fields || {})) {
    const converted = rawLocation(workbook, location)
    if (converted && validLocation(workbook, converted)) fields[key] = converted
  }
  const lineTable = ai.lineTable && typeof ai.lineTable === 'object'
    ? {
      ...ai.lineTable,
      headerRow: Number(ai.lineTable.headerRow) + Number((workbook?.sheets || []).find(sheet => sheet.name === ai.lineTable.sheet)?.sourceRowOffset || 0),
      columns: Object.fromEntries(Object.entries(ai.lineTable.columns || {}).map(([key, column]) => [
        key,
        Number(column) + Number((workbook?.sheets || []).find(sheet => sheet.name === ai.lineTable.sheet)?.sourceColumnOffset || 0),
      ])),
    }
    : base.mapping.lineTable
  const mappedSheet = (workbook?.sheets || []).find(sheet => sheet.name === lineTable?.sheet)
  const safeLineTable = mappedSheet && Number.isInteger(lineTable?.headerRow) && lineTable.headerRow >= 0
    ? lineTable
    : base.mapping.lineTable
  const mapping = { ...base.mapping, ...ai, lineTable: safeLineTable, method: 'gemini+deterministic', fields }
  return { mapping, warnings: [...new Set([...(base.warnings || []), ...(ai.warnings || [])])] }
}

export async function analyzeProposalTemplate(workbook, { model, fallback: useFallback = false } = {}) {
  const deterministic = deterministicMapping(workbook)
  const payload = {
    workbook: compactWorkbook(workbook),
    deterministic: deterministic.mapping,
    instructions: 'Return only mapping JSON. Use zero-based row and column indexes from the supplied sheet rows. Do not invent fields or sheets. Preserve the deterministic mapping when uncertain.',
  }
  const result = await runTaskResult('template.map', payload, { model, fallback: useFallback, timeoutMs: 30000 })
  if (!result.data?.data) return { ...deterministic, ai: { ok: false, error: result.error || 'Gemini unavailable' } }
  return { ...applyAiMapping(workbook, deterministic, result.data.data), ai: { ok: true, model: result.data.model } }
}

export { deterministicMapping }
