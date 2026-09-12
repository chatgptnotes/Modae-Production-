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

// ---------------------------------------------------------------------------
// Supplier workbooks
//
// A real manufacturer price file is nothing like the template: the header can
// sit several rows down, products spread over many tabs, the part-number column
// is called "Code" or "Mat-No.", descriptions come in German *and* English, a
// price is often written once per block and left merged across the rows under
// it, and section headings ("Price Category B") share the same columns as
// products. Rather than reject all of that, read whatever can be read and
// report the rest — an upload should extract as much as possible.

const CODE_HEADERS = ['code', 'part number', 'part no', 'partno', 'part', 'pn', 'article',
  'article no', 'item', 'item no', 'mat no', 'material', 'model', 'order code', 'cat no', 'type',
  'prefix']
const DESC_HEADERS = ['description', 'desc', 'product', 'produktbezeichnung', 'designation',
  'bezeichnung', 'text', 'item description', 'product description']
const PRICE_HEADERS = ['price', 'list price', 'unit price', 'net price', 'net', 'amount',
  'preis', 'listenpreis', 'rate']
const CURRENCY_TOKENS = { EUR: 'EUR', '€': 'EUR', USD: 'USD', $: 'USD', INR: 'INR', '₹': 'INR', GBP: 'GBP' }
const HEADER_WORDS = new Set([...CODE_HEADERS, ...DESC_HEADERS, ...PRICE_HEADERS])
// Imported parts deliberately carry no `keywords`. The tender parser's
// description-only tier (tenderParse.js) scores a line against a part's
// keywords and needs a strictly best candidate; auto-generating them from a
// supplier description gives thousands of rows generic words ("sensor",
// "cable") that tie with — and beat — the hand-curated entries, which silently
// picked the wrong part. Imported rows still match on part number (tiers 1-3).

const squash = value => String(value ?? '').replace(/\s+/g, ' ').trim()
const slugOf = value => squash(value).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')
const headerMatch = (text, names) => {
  const key = canon(text)
  return !!key && names.some(name => key === name || key.startsWith(`${name} `) || key.includes(name))
}

// Cells by column index. sheet_to_json drops a wholly-empty leading column and
// silently shifts every index with it, so read the grid by address instead.
function gridOf(sheet) {
  if (!sheet || !sheet['!ref']) return { rows: [], width: 0 }
  const range = XLSX.utils.decode_range(sheet['!ref'])
  const rows = []
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })]
      row[c] = cell && cell.v !== undefined ? cell : null
    }
    rows.push(row)
  }
  return { rows, width: range.e.c + 1 }
}

function columnStats({ rows, width }) {
  const stats = []
  for (let c = 0; c < width; c++) {
    let numeric = 0
    let text = 0
    let length = 0
    const distinct = new Set()
    rows.forEach(row => {
      const cell = row[c]
      // Some writers emit empty-string cells; counting them as zero-length text
      // drags the average down and makes a real code column look like a prefix.
      if (!cell || squash(cell.v) === '') return
      if (Number.isFinite(numberValue(cell.v))) numeric++
      else { text++; length += squash(cell.v).length; distinct.add(squash(cell.v)) }
    })
    stats[c] = { c, numeric, text, avg: text ? length / text : 0, distinct: distinct.size }
  }
  return stats
}

function detectLayout(grid) {
  const { rows } = grid
  let best = null
  rows.slice(0, 10).forEach((row, index) => {
    const texts = row.map(cell => (cell ? String(cell.v) : ''))
    const codeCols = texts.map((text, i) => (headerMatch(text, CODE_HEADERS) ? i : -1)).filter(i => i >= 0)
    const code = codeCols.length ? codeCols[0] : -1
    const hasCurrency = text => Object.keys(CURRENCY_TOKENS).some(token => String(text).toUpperCase().includes(token))
    // The price column is often labelled with the list edition ("ISP110 2026")
    // and only named as money by a currency sitting on the row underneath.
    const under = (rows[index + 1] || []).map(cell => (cell ? String(cell.v) : ''))
    let price = texts.findIndex(text => headerMatch(text, PRICE_HEADERS) || hasCurrency(text))
    if (price < 0) price = under.findIndex(text => hasCurrency(text))
    // Prefer the right-most description column: suppliers put the local-language
    // name first and English second (Produktbezeichnung | Product).
    let desc = -1
    texts.forEach((text, i) => { if (headerMatch(text, DESC_HEADERS)) desc = i })
    // Count every matched column, not just the three roles: a decorative first
    // row ("Prefix | Options | Description") then loses to the real header two
    // rows below it ("PREFIX | MODEL | … | DESCRIPTION").
    const score = codeCols.length + (desc >= 0 ? 1 : 0) + (price >= 0 ? 1 : 0)
    const roles = (code >= 0 ? 1 : 0) + (desc >= 0 ? 1 : 0) + (price >= 0 ? 1 : 0)
    if (roles >= 2 && (!best || score > best.score)) best = { headerRow: index, code, codeCols, desc, price, score }
  })

  // Whatever the header did not name, infer from the shape of the data — a
  // supplier commonly labels the price column with the list edition ("ISP110
  // 2026") or a margin formula rather than the word "price".
  const stats = columnStats(grid)
  const layout = best || { headerRow: -1, code: -1, codeCols: [], desc: -1, price: -1, score: 0 }
  const taken = new Set([layout.code, layout.desc].filter(c => c >= 0))
  if (layout.desc < 0) {
    const described = stats.filter(s => s.text > 2 && !taken.has(s.c)).sort((a, b) => b.avg - a.avg)[0]
    if (described) { layout.desc = described.c; taken.add(described.c) }
  }
  if (layout.price < 0) {
    const priced = stats.filter(s => s.numeric > 0 && !taken.has(s.c))
      .sort((a, b) => b.numeric - a.numeric || b.c - a.c)[0]
    if (priced) { layout.price = priced.c; taken.add(priced.c) }
  }
  if (layout.code < 0) {
    const coded = stats.filter(s => s.text > 2 && !taken.has(s.c) && s.avg > 0 && s.avg < 40)
      .sort((a, b) => a.c - b.c)[0]
    if (coded) { layout.code = coded.c; layout.codeCols = [coded.c] }
  }
  if (layout.price < 0 || (layout.desc < 0 && layout.code < 0)) return null

  // Some files split the order code over two columns ("PREFIX | MODEL"). A
  // genuine prefix is short and repeats; a neighbouring material number is long
  // and mostly distinct, so only the short one is folded into the part number.
  const codeCols = (layout.codeCols || [layout.code]).filter(c => c >= 0)
  const primary = codeCols.find(c => (stats[c]?.avg || 0) > 4) ?? layout.code
  layout.code = primary
  // A real prefix is short *and* repeats across many rows ("ST", "SW"); a
  // neighbouring material number is short-ish but nearly all distinct.
  layout.prefixes = codeCols.filter(c => c < primary
    && (stats[c]?.avg || 0) <= 4
    && (stats[c]?.distinct || 0) < (stats[c]?.text || 0)
    && (stats[c]?.distinct || 0) <= Math.max(12, (stats[c]?.text || 0) / 10))
  // Columns between the code and the description carry option fragments
  // ("DR", "-2") on configurator sheets; they name the adder.
  layout.options = []
  if (layout.desc > primary) {
    for (let c = primary + 1; c < layout.desc; c++) {
      if (!layout.prefixes.includes(c) && c !== layout.price) layout.options.push(c)
    }
  }
  return layout
}

function currencyOf(sheet, layout, rows) {
  const header = layout.headerRow >= 0 ? rows[layout.headerRow] : null
  const headerText = header && layout.price >= 0 && header[layout.price] ? String(header[layout.price].v) : ''
  const under = layout.headerRow >= 0 && rows[layout.headerRow + 1] && layout.price >= 0
    ? rows[layout.headerRow + 1][layout.price] : null
  const texts = [headerText, under ? String(under.v) : '']
  for (const text of texts) {
    const hit = Object.keys(CURRENCY_TOKENS).find(token => text.toUpperCase().includes(token))
    if (hit) return CURRENCY_TOKENS[hit]
  }
  const formatted = rows.find(row => layout.price >= 0 && row[layout.price]?.z)
  const format = formatted ? String(formatted[layout.price].z) : ''
  const fromFormat = Object.keys(CURRENCY_TOKENS).find(token => format.toUpperCase().includes(token))
  return fromFormat ? CURRENCY_TOKENS[fromFormat] : ''
}

function extractSheet(sheet, name) {
  const grid = gridOf(sheet)
  const layout = detectLayout(grid)
  if (!layout) return { name, parts: [], skipped: grid.rows.length, headerRow: 0, currency: '' }

  const parts = []
  const body = grid.rows.slice(layout.headerRow + 1)
  const cellText = (row, index) => (index >= 0 && row[index] ? squash(row[index].v) : '')
  let section = null
  let carried = NaN
  let skipped = 0
  let adderSeq = 0

  body.forEach(row => {
    const rawCode = cellText(row, layout.code)
    const desc = cellText(row, layout.desc)
    const price = layout.price >= 0 && row[layout.price] ? numberValue(row[layout.price].v) : NaN
    // A repeated header word in the code column opens a section rather than
    // naming a product (the "Code | Chassis | Chassis | 4" shape).
    const isHeading = !!rawCode && HEADER_WORDS.has(canon(rawCode))
    const code = isHeading ? '' : rawCode

    if (isHeading) {
      section = desc
        ? { pn: `${slugOf(name)}/${slugOf(desc)}`,
            desc, price: Number.isFinite(price) ? price : 0, adders: [] }
        : null
      if (section) parts.push(section)
      adderSeq = 0
      carried = NaN
      return
    }
    const optionCode = (layout.options || []).map(c => cellText(row, c)).find(Boolean) || ''
    if (code) {
      const pn = [...(layout.prefixes || []).map(c => cellText(row, c)), code].filter(Boolean).join('')
      const previous = parts[parts.length - 1]
      // The same code repeating under a base model is one of its ordering
      // options, not a second product with a duplicate part number.
      if (previous && previous.pn === pn && Number.isFinite(price)) {
        previous.adders.push({ code: optionCode || `OPT-${++adderSeq}`, desc, price })
        return
      }
      // A coded row with no price of its own inherits the block price above it
      // (merged cells); a heading resets that.
      const effective = Number.isFinite(price) ? price : carried
      if (Number.isFinite(price)) carried = price
      if (!Number.isFinite(effective)) { skipped++; return }
      adderSeq = 0
      parts.push({ pn, desc: desc || pn, price: effective, adders: [] })
      return
    }
    if (!desc || !Number.isFinite(price)) { skipped++; carried = NaN; return }
    // Priced, but no code of its own: an option on whatever it sits under.
    const owner = section || parts[parts.length - 1]
    if (owner) owner.adders.push({ code: optionCode || `OPT-${++adderSeq}`, desc, price })
    else skipped++
  })

  return { name, parts, skipped, headerRow: layout.headerRow + 1, currency: currencyOf(sheet, layout, grid.rows) }
}

export function extractSupplierWorkbook(workbook, defaultCurrency = 'EUR') {
  const parts = []
  const byPn = new Map()
  const sheets = []
  let duplicates = 0
  let currency = ''

  for (const name of workbook.SheetNames) {
    const result = extractSheet(workbook.Sheets[name], name)
    let kept = 0
    let adders = 0
    for (const part of result.parts) {
      const key = part.pn.toUpperCase()
      if (byPn.has(key)) { duplicates++; continue }
      byPn.set(key, part)
      parts.push(part)
      kept++
      adders += part.adders.length
    }
    if (!currency && result.currency) currency = result.currency
    sheets.push({ name, headerRow: result.headerRow, parts: kept, adders, skipped: result.skipped })
  }

  const warnings = []
  const skipped = sheets.reduce((total, sheet) => total + sheet.skipped, 0)
  if (skipped) warnings.push(`${skipped} row${skipped === 1 ? '' : 's'} had no usable part number or price (section headings and notes) and were skipped.`)
  if (duplicates) warnings.push(`${duplicates} repeated part number${duplicates === 1 ? ' was' : 's were'} kept once.`)
  const empty = sheets.filter(sheet => !sheet.parts).map(sheet => sheet.name)
  if (empty.length) warnings.push(`No products found on: ${empty.join(', ')}.`)

  return {
    parts,
    errors: parts.length ? [] : ['No part numbers with prices could be read from this workbook.'],
    warnings,
    currency: currency || defaultCurrency,
    report: { sheets, duplicates, adders: parts.reduce((total, part) => total + part.adders.length, 0) },
  }
}

export function parsePriceListFile(arrayBuffer, defaultCurrency = 'EUR') {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  // Anything without the template's Parts sheet is treated as a supplier file.
  if (!workbook.Sheets.Parts) return extractSupplierWorkbook(workbook, defaultCurrency)
  const partsSheet = workbook.Sheets.Parts
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
  return {
    parts,
    errors,
    warnings: [],
    currency: parts.find(p => p.currency)?.currency || defaultCurrency,
    report: {
      sheets: [{ name: 'Parts', headerRow: 1, parts: parts.length, skipped: 0,
        adders: parts.reduce((total, part) => total + part.adders.length, 0) }],
      duplicates: 0,
      adders: parts.reduce((total, part) => total + part.adders.length, 0),
    },
  }
}
