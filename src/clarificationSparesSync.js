const clean = value => String(value ?? '').trim()

const normalizePart = value => clean(value).toUpperCase().replace(/[\u2013\u2014]/g, '-')

const quantityFrom = value => {
  const match = String(value ?? '').match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(?:nos?|pcs?|pieces?|units?|ea|each)?\b/i)
  return match ? Number(match[1]) : 0
}

const partToken = /\b[A-Z][A-Z0-9]*(?:[-/][A-Z0-9]+)+\b|\b[A-Z]{2,}\d+[A-Z0-9]*\b/gi

function knownPartNames(priceLists = {}) {
  return Object.values(priceLists || {})
    .flatMap(list => list?.parts || [])
    .map(part => clean(part.pn))
    .filter(part => /^[A-Z]/i.test(part) && /\d/.test(part) && part.length >= 4)
    .sort((a, b) => b.length - a.length)
}

function catalogPart(partNumber, priceLists = {}) {
  const key = normalizePart(partNumber)
  for (const [list, data] of Object.entries(priceLists || {})) {
    const part = (data?.parts || []).find(item => normalizePart(item.pn) === key)
    if (part) return { ...part, list, version: data.version || '', currency: data.currency || 'INR' }
  }
  return null
}

// Supports the structured response returned by clarification.answer and a
// deterministic fallback for pasted table-like replies. The fallback only
// accepts known catalogue part numbers when a catalogue is supplied, which
// prevents ordinary words in a customer's prose becoming BOQ rows.
export function extractCustomerSparesLines(text = '', structured = [], priceLists = {}) {
  const structuredRows = (Array.isArray(structured) ? structured : [])
    .map(row => ({
      pn: clean(row.partNumber || row.pn || row.partNo),
      desc: clean(row.description || row.desc),
      qty: Number(row.qty ?? row.quantity) || quantityFrom(row.quantityText),
      uom: clean(row.uom) || 'EA',
      evidence: clean(row.evidence) || clean(text),
    }))
    .filter(row => row.pn && row.qty > 0)
  if (structuredRows.length) return consolidate(structuredRows)

  const source = clean(text)
  if (!source) return []
  const known = knownPartNames(priceLists)
  const tokens = known.length
    ? known.map(part => ({ part, index: source.toUpperCase().indexOf(normalizePart(part)) })).filter(item => item.index >= 0).sort((a, b) => a.index - b.index)
    : [...source.matchAll(partToken)].map(match => ({ part: match[0], index: match.index }))
  return consolidate(tokens.map((token, index) => {
    const end = index + 1 < tokens.length ? tokens[index + 1].index : source.length
    const fragment = source.slice(token.index + token.part.length, end).replace(/[|:_;]+/g, ' ').trim()
    const qtyMatch = fragment.match(/(\d+(?:\.\d+)?)\s*(?:nos?|pcs?|pieces?|units?|ea|each)\b/i)
    if (!qtyMatch) return null
    const desc = fragment.slice(0, qtyMatch.index).replace(/^[\s-]+|[\s-]+$/g, '').trim()
    return { pn: token.part, desc, qty: Number(qtyMatch[1]), uom: 'EA', evidence: source }
  }).filter(Boolean))
}

function consolidate(rows) {
  const byPart = new Map()
  rows.forEach(row => {
    const key = normalizePart(row.pn)
    const previous = byPart.get(key)
    if (!previous) byPart.set(key, { ...row })
    else byPart.set(key, {
      ...previous,
      qty: Number(row.qty) || previous.qty,
      desc: row.desc || previous.desc,
      evidence: [previous.evidence, row.evidence].filter(Boolean).join('; '),
    })
  })
  return [...byPart.values()]
}

export function reconcileSparesLines(existing = [], requested = [], { priceLists = {}, clarificationId = '', answeredAt = '', answerSource = '' } = {}) {
  const lines = existing.map(line => ({ ...line }))
  const byPart = new Map(lines.map(line => [normalizePart(line.pn || line.custRef), line]))
  const changes = []
  const unmatched = []

  requested.forEach(row => {
    const pn = normalizePart(row.pn)
    if (!pn || !(Number(row.qty) > 0)) return
    const current = byPart.get(pn)
    if (current) {
      const previousQty = current.qty
      const previousDesc = current.desc
      const patch = {
        qty: Number(row.qty),
        custRef: current.custRef || row.pn,
        desc: row.desc || current.desc,
        customerConfirmed: true,
        customerConfirmationSource: answerSource || 'Customer',
        customerConfirmationId: clarificationId,
        customerConfirmationDate: answeredAt,
        customerConfirmationEvidence: row.evidence || '',
      }
      const changed = patch.qty !== previousQty || (patch.desc && patch.desc !== previousDesc)
      if (changed) patch.customerConfirmationPreviousQty = previousQty
      Object.assign(current, patch)
      if (changed) changes.push({ pn, fromQty: previousQty, toQty: patch.qty, descriptionChanged: patch.desc !== previousDesc })
      return
    }

    const catalog = catalogPart(pn, priceLists)
    const line = {
      origin: 'customer-clarification', custRef: row.pn, pn: row.pn, desc: row.desc || catalog?.desc || '',
      qty: Number(row.qty), uom: row.uom || 'EA', oem: catalog ? 'B&K' : '', match: catalog ? 'Exact' : 'Customer confirmed',
      conf: 100, confirmed: !!catalog, priceList: catalog ? `${catalog.list}${catalog.version ? ` ${catalog.version}` : ''}` : 'Ad-hoc',
      priceSource: catalog ? 'price-list' : 'manual', priceSourceName: catalog?.list || 'Customer clarification',
      priceState: catalog ? 'Current' : 'Needs pricing', listPrice: Number(catalog?.price) || 0,
      listUnitPrice: Number(catalog?.price) || 0, currency: catalog?.currency || 'INR',
      customerConfirmed: true, customerConfirmationSource: answerSource || 'Customer',
      customerConfirmationId: clarificationId, customerConfirmationDate: answeredAt,
      customerConfirmationEvidence: row.evidence || '',
    }
    lines.push(line)
    byPart.set(pn, line)
    changes.push({ pn, added: true })
  })

  const requestedParts = new Set(requested.map(row => normalizePart(row.pn)).filter(Boolean))
  existing.forEach(line => {
    const pn = normalizePart(line.pn || line.custRef)
    if (pn && !requestedParts.has(pn) && !line.removedFromSourcing) unmatched.push(pn)
  })
  return { lines, changes, unmatched }
}
