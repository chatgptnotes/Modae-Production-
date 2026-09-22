// Shared price-source and proposal-adjustment rules.
// Approved price-list rows always win over vendor references and manual values.

import { ddMmmYY, effectiveRate, unitCostINR } from './utils.js'
import { defaultCosting } from './seed.js'

export const PRICE_SOURCES = Object.freeze({
  LIST: 'price-list',
  VENDOR: 'vendor-quote',
  MANUAL: 'manual',
})

export const MAX_MARKUP_PCT = 100
export const normalizeMarkupPct = value => Math.max(0, Math.min(MAX_MARKUP_PCT, Number(value) || 0))

// Converts the persisted source fields into a consistent human-readable
// representation for sourcing tables and evidence views. Older rows may only
// have `priceList`, so every field deliberately has a safe fallback.
export function formatPriceSource(line = {}) {
  if (line.priceSourceSuggested) {
    const name = String(line.priceSourceSuggestedList || line.priceSourceName || 'Price list').trim()
    const version = String(line.priceSourceSuggestedVersion || '').trim()
    const ref = String(line.priceSourceSuggestedPart || '').trim()
    return {
      source: PRICE_SOURCES.MANUAL,
      kind: 'Suggested price-list match',
      primary: 'Suggested price list',
      secondary: [name, version, ref && `Part ${ref}`].filter(Boolean).join(' · '),
      full: ['Suggested price-list match', name, version && `Version ${version}`, ref && `Part ${ref}`].filter(Boolean).join(' · '),
    }
  }
  if (line.origin === 'customer' && !line.pn && line.priceState === 'Needs pricing') {
    return {
      source: PRICE_SOURCES.MANUAL,
      kind: 'Customer request',
      primary: 'Customer request',
      secondary: 'Requested BOM · no price selected',
      full: 'Customer request · Requested BOM · no price selected',
    }
  }
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
  const rawDate = String(line.priceSourceDate || line.addedAt || '').trim().slice(0, 10)
  const date = rawDate ? ddMmmYY(rawDate) : ''
  const kind = source === PRICE_SOURCES.LIST
    ? 'Approved price list'
    : source === PRICE_SOURCES.VENDOR
      ? 'Supplier quotation'
      : 'Manual pricing'
  const primary = kind
  const secondary = source === PRICE_SOURCES.LIST
    ? [name, version, ref && `Part ${ref}`].filter(Boolean).join(' · ')
    : source === PRICE_SOURCES.VENDOR
      ? [name, ref && `Quote ${ref}`, date].filter(Boolean).join(' · ')
      : [ref && `Ref ${ref}`, date].filter(Boolean).join(' · ')
  const full = [kind, name && name !== kind ? name : '', version && `Version ${version}`, ref && `Reference ${ref}`, date && `Date ${date}`]
    .filter(Boolean).join(' · ')
  return { source, kind, primary, secondary, full: full || 'No pricing source' }
}

const samePart = (a, b) => {
  const left = String(a || '').trim().toUpperCase()
  const right = String(b || '').trim().toUpperCase()
  return left && right && left === right
}

const normalizedPart = value => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
const usableReference = value => {
  const text = String(value || '').trim()
  return text && !/^\d+(?:\.\d+)?$/.test(text) ? text : ''
}
const partAliases = part => [part?.pn, ...(Array.isArray(part?.aliases) ? part.aliases : [])]
  .map(value => String(value || '').trim())
  .filter(Boolean)

// Catalogue aliases are part of the approved price-list row. This resolver is
// shared by new lead matching and reconciliation of already-saved sourcing
// rows, so an alias cannot work in only one path.
export function findPriceListMatch(line = {}, priceLists = {}) {
  const references = [line.pn, line.custRef, line.customerReference]
    .map(usableReference)
    .filter(Boolean)
  if (!references.length) return null
  for (const [name, list] of Object.entries(priceLists || {})) {
    const parts = list.parts || []
    const exact = parts.find(part => references.some(reference => samePart(part.pn, reference)))
    if (exact) return { name, list, part: exact, matchKind: 'exact' }
    const normalized = parts.find(part => references.some(reference =>
      partAliases(part).some(alias => normalizedPart(alias) === normalizedPart(reference))))
    if (normalized) return { name, list, part: normalized, matchKind: 'alias' }
  }
  return null
}

const sourceFromPriceListMatch = match => match && ({
  source: PRICE_SOURCES.LIST,
  sourceName: match.name,
  sourceVersion: match.list.version || '',
  sourceRef: match.part.pn,
  sourceDate: match.list.uploaded || '',
  price: Number(match.part.price) || 0,
  currency: match.list.currency || 'INR',
  adders: match.part.adders || [],
  matchKind: match.matchKind,
  description: match.part.desc || '',
})

export function resolvePriceSource(line, priceLists = {}, adhocParts = [], vendorQuotes = []) {
  const pn = line?.pn || line?.custRef
  const priceListMatch = findPriceListMatch(line, priceLists)
  if (priceListMatch) return sourceFromPriceListMatch(priceListMatch)

  const vendorPrice = (vendorQuotes || []).flatMap(quote =>
    (quote.prices || []).map(price => ({ quote, price })))
    .reverse()
    .find(({ quote, price }) => (line?.id && price.lineId === line.id) || samePart(price.pn, pn))
  if (vendorPrice) return {
    source: PRICE_SOURCES.VENDOR,
    sourceName: vendorPrice.quote.manufacturer || 'Supplier',
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
    sourceName: adhoc.supplier || 'Supplier quotation/reference',
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

// Repair an old or partially imported sourcing row when the approved list now
// contains a direct part or alias. Suggestions receive a price immediately but
// never become confirmed automatically.
export function reconcileCatalogueMatch(line = {}, priceLists = {}) {
  if (line.confirmed || line.sparesSupport || line.priceSource === PRICE_SOURCES.MANUAL && Number(line.listPrice) > 0) return line
  const match = findPriceListMatch(line, priceLists)
  const resolved = sourceFromPriceListMatch(match)
  if (!resolved || resolved.price <= 0) return line
  const suggested = resolved.matchKind !== 'exact'
  return {
    ...line,
    pn: resolved.sourceRef,
    desc: resolved.description || line.desc || '',
    missingDescription: false,
    match: suggested ? 'Suggested price-list match' : 'Exact',
    conf: suggested ? Math.max(75, Number(line.conf) || 0) : 100,
    confirmed: suggested ? false : Boolean(line.confirmed),
    priceList: `${resolved.sourceName} ${resolved.sourceVersion}`.trim(),
    priceSource: PRICE_SOURCES.LIST,
    priceSourceName: resolved.sourceName,
    priceSourceVersion: resolved.sourceVersion,
    priceSourceRef: resolved.sourceRef,
    priceSourceDate: resolved.sourceDate,
    priceSourceSuggested: suggested,
    priceSourceSuggestedPart: suggested ? resolved.sourceRef : '',
    priceSourceSuggestedDescription: suggested ? resolved.description : '',
    priceSourceSuggestedList: suggested ? resolved.sourceName : '',
    priceSourceSuggestedVersion: suggested ? resolved.sourceVersion : '',
    priceState: 'Current',
    listPrice: resolved.price,
    listUnitPrice: resolved.price,
    baseCost: Number(line.baseCost) > 0 ? line.baseCost : resolved.price,
    currency: resolved.currency,
  }
}

// Reconcile a persisted manual-looking row without changing its amount. A
// source is promoted only when the exact approved source price and currency
// match the current amount; a different amount remains a deliberate manual
// override.
export function reconcilePriceSource(line = {}, priceLists = {}, vendorQuotes = []) {
  const currentPrice = Number(line.listUnitPrice ?? line.listPrice) || 0
  if (currentPrice <= 0) return line
  const resolved = resolvePriceSource(line, priceLists, [], vendorQuotes)
  if (!resolved || resolved.price <= 0) return line
  const currentCurrency = String(line.currency || 'INR').trim().toUpperCase()
  const sourceCurrency = String(resolved.currency || 'INR').trim().toUpperCase()
  if (currentCurrency !== sourceCurrency || Math.abs(currentPrice - Number(resolved.price)) > 0.005) return line
  return {
    ...line,
    priceSource: resolved.source,
    priceSourceName: resolved.sourceName || line.priceSourceName || line.priceList || '',
    priceSourceVersion: resolved.sourceVersion || '',
    priceSourceRef: resolved.sourceRef || line.priceSourceRef || line.quoteRef || '',
    priceSourceDate: resolved.sourceDate || line.priceSourceDate || '',
    priceList: `${resolved.sourceName || ''} ${resolved.sourceVersion || ''}`.trim() || line.priceList,
  }
}

export function adjustmentMultiplier({ discountPct = 0, markupPct = 0 } = {}) {
  const discount = Math.max(0, Math.min(100, Number(discountPct) || 0))
  const markup = normalizeMarkupPct(markupPct)
  return discount > 0 ? (1 - discount / 100) : (1 + markup / 100)
}

export function applyAdjustment(value, pricing = {}) {
  return Number(value || 0) * adjustmentMultiplier(pricing)
}

// Sourcing rows may store a price in EUR/USD/INR, but all financial roll-ups
// are reported in INR. Keep the source unit price intact for editing/evidence
// and expose normalized values for previews, proposals, and margin gates.
export function sparesLineFinancials(line = {}, costing = {}) {
  const effectiveCosting = { ...defaultCosting, ...(costing || {}) }
  const qty = Math.max(0, Number(line.qty) || 0)
  const listUnitPrice = Math.max(0, Number(line.listUnitPrice ?? line.listPrice) || 0)
  const currency = String(line.currency || 'INR').toUpperCase()
  const isBnk = String(line.priceList || '').startsWith('BNK')
  const discountPct = Math.max(0, Math.min(100, Number(line.discountPct) || 0))
  const markupPct = normalizeMarkupPct(line.markupPct)
  // Supplier/list prices are purchase costs. Import charges apply to foreign
  // currency/imported rows; INR rows are assumed to be domestic landed costs.
  // Keep the FX bridge separate from effectiveRate(), which also includes the
  // import factor and is used by legacy proposal calculations.
  const configuredRate = effectiveCosting?.currencyRates?.[currency]
  const sourceRate = currency === 'INR'
    ? 1
    : Number(configuredRate) > 0
      ? Number(configuredRate)
      : currency === 'USD'
        ? (Number(effectiveCosting.usdBase) > 0 ? Number(effectiveCosting.usdBase) : 90)
        : (Number(effectiveCosting.baseRate) > 0 ? Number(effectiveCosting.baseRate) : 112)
  const hasSplitCosting = ['customsDutyPct', 'ervPct', 'handlingPct']
    .some(key => effectiveCosting[key] != null)
  const importFactorPct = hasSplitCosting
    ? Number(effectiveCosting.customsDutyPct ?? 0)
      + Number(effectiveCosting.ervPct ?? 0)
      + Number(effectiveCosting.handlingPct ?? 0)
    : Number(effectiveCosting.cdErvHandlingPct ?? effectiveCosting.cdErvContPct ?? 0)
  const importMultiplier = currency === 'INR' ? 1 : 1 + importFactorPct / 100
  const listUnitPriceINR = listUnitPrice * sourceRate
  const discountedPurchaseUnitPriceINR = listUnitPriceINR * (1 - discountPct / 100)
  const landedUnitCostINR = discountedPurchaseUnitPriceINR * importMultiplier
  const adjustedUnitPriceINR = landedUnitCostINR * (1 + markupPct / 100)
  const baseCostINR = line.baseCost == null
    ? unitCostINR(listUnitPrice * (1 - discountPct / 100), effectiveCosting, currency, isBnk)
    : Math.max(0, Number(line.baseCost) || 0)
  return {
    qty,
    currency,
    listUnitPrice,
    listUnitPriceINR,
    discountPct,
    markupPct,
    importFactorPct,
    importMultiplier,
    discountedPurchaseUnitPriceINR,
    landedUnitCostINR,
    adjustedUnitPriceINR,
    baseCostINR,
    listTotalINR: listUnitPriceINR * qty,
    landedTotalINR: landedUnitCostINR * qty,
    lineTotalINR: adjustedUnitPriceINR * qty,
    cogsINR: baseCostINR * qty,
  }
}

// A sourcing line is confirmable only when it has a positive quantity and
// positive list/unit price. Keep this shared by UI and persistence paths.
export function isMissingSparesDescription(line = {}) {
  const description = String(line.desc || '').trim()
  const generatedDescription = /^Customer-requested item\s+\d+(?:\.\d+)?$/i.test(description)
  const noUsablePartNumber = !String(line.pn || '').trim() || /^\d+(?:\.\d+)?$/.test(String(line.pn || '').trim())
  return (!description || generatedDescription) && noUsablePartNumber && /^\d+(?:\.\d+)?$/.test(String(line.custRef || '').trim())
}

export function isConfirmableSparesLine(line = {}) {
  const qty = Number(line.qty) || 0
  const listUnitPrice = Number(line.listUnitPrice ?? line.listPrice) || 0
  return qty > 0 && listUnitPrice > 0 && !isMissingSparesDescription(line)
}

export function normalizePriceFields(line = {}) {
  const source = line.priceSource || (
    String(line.priceList || '').startsWith('Ad-hoc') || line.priceList === 'Manual entry'
      ? PRICE_SOURCES.MANUAL : PRICE_SOURCES.LIST)
  const listUnitPrice = Number(line.listUnitPrice ?? line.listPrice) || 0
  const legacyUnpriced = line.priceState === 'Expired' && source === PRICE_SOURCES.MANUAL && listUnitPrice <= 0
  const manualPrice = line.priceList === 'Manual pricing' || line.priceSourceName === 'Manual pricing'
  const normalized = {
    ...line,
    priceSource: source,
    priceSourceName: line.priceSourceName || line.priceList || '',
    priceSourceVersion: line.priceSourceVersion || '',
    priceSourceRef: line.priceSourceRef || line.quoteRef || '',
    priceSourceDate: line.priceSourceDate || '',
    priceState: legacyUnpriced ? 'Needs pricing' : (line.priceState || 'Current'),
    markupPct: normalizeMarkupPct(line.markupPct),
    listUnitPrice,
    listTotalPrice: Number(line.listTotalPrice) || (Number(line.listPrice) || 0) * (Number(line.qty) || 0),
    approvedUnitPrice: Number(line.approvedUnitPrice) || 0,
    approvedTotalPrice: Number(line.approvedTotalPrice) || 0,
    quotedUnitPrice: line.quotedUnitPrice ?? line.quoted ?? '',
    quotedTotalPrice: Number(line.quotedTotalPrice) || 0,
  }
  return {
    ...normalized,
    confirmed: (Boolean(normalized.confirmed) || manualPrice && isConfirmableSparesLine(normalized))
      && isConfirmableSparesLine(normalized),
  }
}
