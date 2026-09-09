// Shared price-source and proposal-adjustment rules.
// Approved price-list rows always win over vendor references and manual values.

export const PRICE_SOURCES = Object.freeze({
  LIST: 'price-list',
  VENDOR: 'vendor-quote',
  MANUAL: 'manual',
})

// Converts the persisted source fields into a consistent human-readable
// representation for sourcing tables and evidence views. Older rows may only
// have `priceList`, so every field deliberately has a safe fallback.
export function formatPriceSource(line = {}) {
  const hasSource = [line.priceSource, line.priceSourceName, line.priceList, line.priceSourceRef, line.quoteRef]
    .some(value => String(value || '').trim())
  if (!hasSource) return { source: '', kind: 'No pricing source', primary: 'No pricing source', secondary: '', full: 'No pricing source' }
  const source = line.priceSource || (
    String(line.priceList || '').startsWith('Ad-hoc') || line.priceList === 'Manual entry'
      ? PRICE_SOURCES.MANUAL : PRICE_SOURCES.LIST
  )
  const name = String(line.priceSourceName || line.priceList || '').trim()
  const version = String(line.priceSourceVersion || '').trim()
  const ref = String(line.priceSourceRef || line.quoteRef || '').trim()
  const date = String(line.priceSourceDate || '').trim()
  const kind = source === PRICE_SOURCES.LIST
    ? 'Price list'
    : source === PRICE_SOURCES.VENDOR
      ? 'Vendor quote'
      : 'Manual entry'
  const primary = source === PRICE_SOURCES.MANUAL
    ? (name === 'Manual override' ? 'Manual override' : 'Manual entry')
    : (name || kind)
  const secondary = source === PRICE_SOURCES.LIST
    ? [version, ref && `Part ${ref}`].filter(Boolean).join(' · ')
    : source === PRICE_SOURCES.VENDOR
      ? [ref && `Quote ${ref}`, date].filter(Boolean).join(' · ')
      : [ref && `Ref ${ref}`, date].filter(Boolean).join(' · ')
  const full = [kind, primary !== kind ? primary : '', version && `Version ${version}`, ref && `Reference ${ref}`, date && `Date ${date}`]
    .filter(Boolean).join(' · ')
  return { source, kind, primary, secondary, full: full || 'No pricing source' }
}

const samePart = (a, b) => {
  const left = String(a || '').trim().toUpperCase()
  const right = String(b || '').trim().toUpperCase()
  return left && right && left === right
}

export function resolvePriceSource(line, priceLists = {}, adhocParts = [], vendorQuotes = []) {
  const pn = line?.pn || line?.custRef
  if (pn) {
    for (const [name, list] of Object.entries(priceLists || {})) {
      const part = (list.parts || []).find(row => samePart(row.pn, pn))
      if (part) return {
        source: PRICE_SOURCES.LIST,
        sourceName: name,
        sourceVersion: list.version || '',
        sourceRef: part.pn,
        sourceDate: list.uploaded || '',
        price: Number(part.price) || 0,
        currency: list.currency || 'INR',
        adders: part.adders || [],
      }
    }
  }

  const vendorPrice = (vendorQuotes || []).flatMap(quote =>
    (quote.prices || []).map(price => ({ quote, price })))
    .reverse()
    .find(({ quote, price }) => (line?.id && price.lineId === line.id) || samePart(price.pn, pn))
  if (vendorPrice) return {
    source: PRICE_SOURCES.VENDOR,
    sourceName: vendorPrice.quote.manufacturer || 'Vendor',
    sourceVersion: '',
    sourceRef: vendorPrice.price.quoteRef || vendorPrice.quote.quoteRef || vendorPrice.quote.id || '',
    sourceDate: vendorPrice.price.appliedAt || vendorPrice.quote.receivedAt || vendorPrice.quote.sentAt || '',
    price: Number(vendorPrice.price.unitPrice) || 0,
    currency: vendorPrice.price.currency || 'INR',
    adders: [],
  }

  const adhoc = (adhocParts || []).find(row => samePart(row.pn, pn))
  if (adhoc) return {
    source: PRICE_SOURCES.VENDOR,
    sourceName: adhoc.supplier || 'Vendor reference',
    sourceVersion: '',
    sourceRef: adhoc.pn,
    sourceDate: adhoc.date || '',
    price: Number(adhoc.price) || 0,
    currency: adhoc.currency || 'INR',
    adders: [],
  }

  if (Number(line?.listPrice) > 0) return {
    source: PRICE_SOURCES.MANUAL,
    sourceName: line.priceList || 'Manual entry',
    sourceVersion: '',
    sourceRef: line.quoteRef || '',
    sourceDate: line.priceSourceDate || '',
    price: Number(line.listPrice) || 0,
    currency: line.currency || 'INR',
    adders: [],
  }
  return null
}

export function adjustmentMultiplier({ discountPct = 0, markupPct = 0 } = {}) {
  const discount = Math.max(0, Math.min(100, Number(discountPct) || 0))
  const markup = Math.max(0, Number(markupPct) || 0)
  return discount > 0 ? (1 - discount / 100) : (1 + markup / 100)
}

export function applyAdjustment(value, pricing = {}) {
  return Number(value || 0) * adjustmentMultiplier(pricing)
}

export function normalizePriceFields(line = {}) {
  const source = line.priceSource || (
    String(line.priceList || '').startsWith('Ad-hoc') || line.priceList === 'Manual entry'
      ? PRICE_SOURCES.MANUAL : PRICE_SOURCES.LIST)
  const listUnitPrice = Number(line.listUnitPrice ?? line.listPrice) || 0
  const legacyUnpriced = line.priceState === 'Expired' && source === PRICE_SOURCES.MANUAL && listUnitPrice <= 0
  return {
    ...line,
    priceSource: source,
    priceSourceName: line.priceSourceName || line.priceList || '',
    priceSourceVersion: line.priceSourceVersion || '',
    priceSourceRef: line.priceSourceRef || line.quoteRef || '',
    priceSourceDate: line.priceSourceDate || '',
    priceState: legacyUnpriced ? 'Needs pricing' : (line.priceState || 'Current'),
    listUnitPrice,
    listTotalPrice: Number(line.listTotalPrice) || (Number(line.listPrice) || 0) * (Number(line.qty) || 0),
    approvedUnitPrice: Number(line.approvedUnitPrice) || 0,
    approvedTotalPrice: Number(line.approvedTotalPrice) || 0,
    quotedUnitPrice: line.quotedUnitPrice ?? line.quoted ?? '',
    quotedTotalPrice: Number(line.quotedTotalPrice) || 0,
  }
}
