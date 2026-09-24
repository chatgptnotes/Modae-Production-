import { matchParts, parseLeadLineItems } from './tenderParse.js'

const relevantField = /line items?|requested items?|scope|coverage|materials?|parts?|spares?/i

const usableDescription = value => {
  const description = String(value || '').trim()
  return !!description
    && !/^Customer-requested item\s+\d+(?:\.\d+)?$/i.test(description)
    && !/^\d+(?:\.\d+)?$/.test(description)
}

const normalizeItem = item => ({
  description: item.description || item.desc || '',
  partNumber: item.partNumber || item.pn || '',
  customerRef: item.customerRef || item.customerReference || item.sapCode || item.partNumber || item.pn || '',
  qty: Number(item.qty) || 1,
  uom: item.uom || 'EA',
  confidence: Number(item.confidence ?? item.conf) || 0,
  evidence: item.evidence || item.ev || 'Linked lead',
  sourceDocument: item.sourceDocument || item.document || '',
  manufacturer: item.manufacturer || item.oem || '',
  model: item.model || '',
  size: item.size || '',
  length: item.length || '',
  productType: item.productType || item.type || '',
  structured: item.structured || item.details || item.specification || {},
})

// AI and deterministic extraction can surface the same requested part more
// than once (for example from both a table and the email body). Keep one
// sourcing row per part/description and combine its requested quantity.
const consolidateItems = items => {
  const merged = new Map()
  items.map(normalizeItem).filter(item => item.description || item.partNumber || item.customerRef).forEach(item => {
    const key = item.partNumber.trim()
      ? `pn:${item.partNumber.trim().toUpperCase()}`
      : item.description.trim()
        ? `desc:${item.description.trim().toLowerCase()}`
        : `ref:${String(item.customerRef || '').trim().toLowerCase()}`
    const existing = merged.get(key)
    if (existing) {
      existing.qty += item.qty
      if (!existing.description && item.description) existing.description = item.description
      if (!existing.customerRef && item.customerRef) existing.customerRef = item.customerRef
      existing.descriptionMissing = !existing.description.trim()
    }
    else merged.set(key, { ...item })
  })
  return [...merged.values()]
}

export function lineItemsFromLead(lead) {
  const aiItems = Array.isArray(lead?.ai?.lineItems) ? lead.ai.lineItems : []
  const structuredLeadItems = [
    ...(Array.isArray(lead?.parse?.items) ? lead.parse.items : []),
    ...(Array.isArray(lead?.requestedItems) ? lead.requestedItems : []),
  ]
  const attachmentItems = (lead?.attachments || []).flatMap(attachment => {
    const parsed = parseLeadLineItems(attachment?.text || '')
    const document = attachment?.name || attachment?.fileName || attachment?.path || 'Original attachment'
    return parsed.map(item => ({ ...item, sourceDocument: document, evidence: `${document}: ${item.evidence}` }))
  })

  // AI extraction is useful for interpretation, but it can return only a
  // customer reference (for example "9") when the original document contains
  // the description. Enrich that incomplete row from the attachment without
  // importing unrelated prose as new requested items.
  if (aiItems.length) {
    const enriched = aiItems.map((raw, index) => {
      const item = normalizeItem(raw)
      if (usableDescription(item.description)) return item
      const ref = String(item.customerRef || '').trim().toLowerCase()
      const pn = String(item.partNumber || '').trim().toLowerCase()
      const candidate = attachmentItems.find((source, sourceIndex) => {
        const sourceRef = String(source.customerRef || '').trim().toLowerCase()
        const sourcePn = String(source.partNumber || '').trim().toLowerCase()
        const sameReference = ref && sourceRef && ref === sourceRef
        const samePart = pn && sourcePn && pn === sourcePn
        const samePosition = !ref && !pn && sourceIndex === index && attachmentItems.length === aiItems.length
        return usableDescription(source.description) && (sameReference || samePart || samePosition)
      })
      return candidate ? {
        ...item,
        description: candidate.description,
        evidence: [item.evidence, candidate.evidence].filter(Boolean).join('; '),
        sourceDocument: candidate.sourceDocument || item.sourceDocument,
      } : item
    })
    // AI extraction is a useful interpretation layer, not a complete source
    // of truth. Keep structured parser/request rows and attachment rows too;
    // otherwise one incomplete AI response can silently hide customer lines.
    return consolidateItems([...enriched, ...structuredLeadItems, ...attachmentItems])
  }

  const sources = [
    lead?.body || '',
    ...structuredLeadItems,
    ...attachmentItems,
    ...(lead?.ai?.fields || []).filter(f => relevantField.test(f.k || '')).map(f => f.v || ''),
  ].filter(Boolean)
  return consolidateItems(sources.flatMap(source => typeof source === 'string' ? parseLeadLineItems(source) : [source]))
}

export function buildLeadProposalData(lead, priceLists, vendorPrices = []) {
  const extracted = lineItemsFromLead(lead)
  const allParts = Object.entries(priceLists || {})
    .flatMap(([list, pl]) => (pl.parts || []).map(p => ({ ...p, list, version: pl.version || '', currency: pl.currency || 'INR' })))
    .concat((vendorPrices || []).map(a => ({
      pn: a.pn, desc: a.note ? `${a.note} (${a.supplier || 'Vendor'})` : a.supplier || 'Vendor reference',
      price: a.price, adders: [], list: 'Vendor quote', currency: a.currency || 'INR',
    })))
  const workbenchRows = matchParts(extracted.map(item => ({
    description: item.description,
    pn: item.partNumber,
    customerRef: item.customerRef,
    qty: item.qty,
    manufacturer: item.manufacturer,
    model: item.model,
    size: item.size,
    length: item.length,
    productType: item.productType,
    structured: item.structured,
  })), allParts).map(({ item, match }, i) => {
    // A description-only match is a useful catalogue suggestion, but it is
    // not evidence that the customer requested that exact catalogue part.
    // Do not import its price into Sourcing until a salesperson confirms it.
    const pricedMatch = match && match.tier <= 4 ? match : null
    const exactCatalogueReference = pricedMatch?.matchKind === 'exact'
      && String(extracted[i].partNumber || '').trim().toUpperCase() === String(pricedMatch.pn || '').trim().toUpperCase()
    const isSuggested = !!pricedMatch && !exactCatalogueReference
    return {
      origin: 'customer',
      custRef: extracted[i].customerRef || item.pn || item.description,
      pn: pricedMatch?.pn || item.pn || '',
      desc: pricedMatch?.desc || item.description || '',
      missingDescription: !String(pricedMatch?.desc || item.description || '').trim()
        && !String(item.partNumber || '').trim().replace(/^\d+(?:\.\d+)?$/, ''),
      qty: item.qty,
      uom: extracted[i].uom || 'EA',
      oem: pricedMatch ? 'B&K' : '',
      match: pricedMatch ? (isSuggested ? 'Suggested price-list match' : 'Exact') : 'Unmatched',
      conf: pricedMatch ? (exactCatalogueReference ? 100 : Math.max(75, extracted[i].confidence)) : extracted[i].confidence,
      confirmed: exactCatalogueReference,
      priceList: pricedMatch ? `${pricedMatch.list || 'Price list'}${pricedMatch.version ? ` ${pricedMatch.version}` : ''}` : 'Ad-hoc',
      priceSource: pricedMatch?.list === 'Vendor quote' ? 'vendor-quote' : pricedMatch ? 'price-list' : 'manual',
      priceSourceName: pricedMatch?.list === 'Vendor quote' ? (pricedMatch.desc || 'Vendor reference') : pricedMatch?.list || 'Manual entry',
      priceSourceSuggested: isSuggested,
      priceSourceSuggestedPart: isSuggested ? pricedMatch.pn : '',
      priceSourceSuggestedDescription: isSuggested ? pricedMatch.desc : '',
      priceSourceSuggestedList: isSuggested ? pricedMatch.list || '' : '',
      priceSourceSuggestedVersion: isSuggested ? pricedMatch.version || '' : '',
      // An unmatched line has never had a usable price source. Keep that
      // distinct from an actual catalogue row whose validity has elapsed.
      priceState: pricedMatch ? 'Current' : 'Needs pricing',
      listPrice: pricedMatch?.price || 0,
      currency: pricedMatch?.currency || 'INR',
      evidence: extracted[i].evidence,
    }
  })
  const bom = workbenchRows.map(row => ({
    itemCategory: 'Hardware', pn: row.pn, custRef: row.custRef,
    desc: row.desc, uom: row.uom, listPrice: row.listPrice,
    adders: [], qtyPerUnit: 0, common: row.qty, spares: 0, quoted: '',
    list: row.priceList.startsWith('BNK') ? 'BNK' : 'Ad-hoc', currency: row.currency,
  }))
  return { extracted, workbenchRows, bom }
}
