import XLSX from 'xlsx-js-style'

export const PART_HEADERS = ['Part Number', 'Description', 'Price', 'Currency']
export const ADDER_HEADERS = ['Part Number', 'Adder Code', 'Adder Description', 'Adder Price']

const canon = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const valueFor = (row, names) => {
  const wanted = new Set(names.map(canon))
  const key = Object.keys(row || {}).find(k => wanted.has(canon(k)))
  return key ? row[key] : ''
}

const numberValue = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
  const clean = String(value ?? '').replace(/[, ]/g, '').trim()
  return clean ? Number(clean) : NaN
}

export function buildPriceListTemplate(listName = 'BNK', currency = 'EUR') {
  const workbook = XLSX.utils.book_new()
  const parts = XLSX.utils.aoa_to_sheet([
    PART_HEADERS,
    ['', '', '', currency],
  ])
  const adders = XLSX.utils.aoa_to_sheet([
    ADDER_HEADERS,
    ['', '', '', ''],
  ])
  const instructions = XLSX.utils.aoa_to_sheet([
    ['Price-list import template'],
    ['Selected list', listName],
    ['How to use'],
    ['1. Add one product per row on Parts. Part Number, Description, and Price are required.'],
    ['2. Add configurable options on Adders. Part Number must match a row on Parts.'],
    ['3. Keep prices numeric. Commas are accepted and the list currency is supplied during upload.'],
    ['Example Parts row', 'RK16-BASE', '16-slot base rack chassis', 2000, currency],
    ['Example Adders row', 'RK16-BASE', 'CE', 'CE mark', 110],
  ])
  parts['!cols'] = [{ wch: 24 }, { wch: 54 }, { wch: 14 }, { wch: 12 }]
  adders['!cols'] = [{ wch: 24 }, { wch: 18 }, { wch: 42 }, { wch: 14 }]
  instructions['!cols'] = [{ wch: 24 }, { wch: 24 }, { wch: 54 }, { wch: 14 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(workbook, parts, 'Parts')
  XLSX.utils.book_append_sheet(workbook, adders, 'Adders')
  XLSX.utils.book_append_sheet(workbook, instructions, 'Instructions')
  return workbook
}

export function downloadPriceListTemplate(listName, currency) {
  XLSX.writeFile(buildPriceListTemplate(listName, currency), `${listName}_price_list_template.xlsx`)
}

export function parsePriceListFile(arrayBuffer, defaultCurrency = 'EUR') {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const partsSheet = workbook.Sheets.Parts || workbook.Sheets[workbook.SheetNames[0]]
  const addersSheet = workbook.Sheets.Adders
  const rawParts = partsSheet ? XLSX.utils.sheet_to_json(partsSheet, { defval: '' }) : []
  const rawAdders = addersSheet ? XLSX.utils.sheet_to_json(addersSheet, { defval: '' }) : []
  const errors = []
  const parts = []
  const seenParts = new Set()

  rawParts.forEach((row, index) => {
    const line = index + 2
    const pn = String(valueFor(row, ['Part Number', 'PN', 'Part No', 'Part']) || '').trim()
    const desc = String(valueFor(row, ['Description', 'Desc']) || '').trim()
    const priceRaw = valueFor(row, ['Price', 'Unit Price', 'Base Price'])
    const price = numberValue(priceRaw)
    const currency = String(valueFor(row, ['Currency', 'CCY']) || defaultCurrency).trim().toUpperCase()
    if (!pn && !desc && String(priceRaw).trim() === '') return
    if (!pn) errors.push(`Parts row ${line}: Part Number is required.`)
    if (!desc) errors.push(`Parts row ${line}: Description is required.`)
    if (!Number.isFinite(price) || price < 0) errors.push(`Parts row ${line}: Price must be a non-negative number.`)
    if (pn && seenParts.has(pn.toUpperCase())) errors.push(`Parts row ${line}: duplicate Part Number ${pn}.`)
    if (pn) seenParts.add(pn.toUpperCase())
    parts.push({ pn, desc, price: Number.isFinite(price) ? price : 0, currency, adders: [] })
  })

  const adderKeys = new Set()
  rawAdders.forEach((row, index) => {
    const line = index + 2
    const pn = String(valueFor(row, ['Part Number', 'PN', 'Part No', 'Part']) || '').trim()
    const code = String(valueFor(row, ['Adder Code', 'Code']) || '').trim()
    const desc = String(valueFor(row, ['Adder Description', 'Description', 'Adder']) || '').trim()
    const priceRaw = valueFor(row, ['Adder Price', 'Price', 'Amount'])
    const price = numberValue(priceRaw)
    if (!pn && !code && !desc && String(priceRaw).trim() === '') return
    const part = parts.find(item => item.pn.toUpperCase() === pn.toUpperCase())
    if (!part) errors.push(`Adders row ${line}: Part Number ${pn || '(blank)'} does not exist on Parts.`)
    if (!code) errors.push(`Adders row ${line}: Adder Code is required.`)
    if (!desc) errors.push(`Adders row ${line}: Adder Description is required.`)
    if (!Number.isFinite(price) || price < 0) errors.push(`Adders row ${line}: Adder Price must be a non-negative number.`)
    const key = `${pn.toUpperCase()}|${code.toUpperCase()}`
    if (adderKeys.has(key)) errors.push(`Adders row ${line}: duplicate adder ${code} for ${pn}.`)
    adderKeys.add(key)
    if (part && code && desc && Number.isFinite(price) && price >= 0) part.adders.push({ code, desc, price })
  })

  if (!parts.length) errors.push('The Parts sheet must contain at least one product row.')
  return { parts, errors, currency: parts.find(p => p.currency)?.currency || defaultCurrency }
}
