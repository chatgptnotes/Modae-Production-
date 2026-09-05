import { matchParts, parseLeadLineItems } from './tenderParse.js'

const relevantField = /line items?|requested items?|scope|coverage|materials?|parts?|spares?/i

const normalizeItem = item => ({
  description: item.description || item.desc || item.partNumber || item.pn || '',
  partNumber: item.partNumber || item.pn || '',
  customerRef: item.customerRef || item.partNumber || item.pn || '',
  qty: Number(item.qty) || 1,
  uom: item.uom || 'EA',
  confidence: Number(item.confidence ?? item.conf) || 0,
  evidence: item.evidence || item.ev || 'Linked lead',
})

export function lineItemsFromLead(lead) {
  if (Array.isArray(lead?.ai?.lineItems) && lead.ai.lineItems.length) {
    return lead.ai.lineItems.map(normalizeItem).filter(item => item.description || item.partNumber)
  }

  const sources = [
    lead?.body || '',
    ...(lead?.attachments || []).map(a => a.text || ''),
    ...(lead?.ai?.fields || []).filter(f => relevantField.test(f.k || '')).map(f => f.v || ''),
  ].filter(Boolean)
  const seen = new Set()
  return sources.flatMap(parseLeadLineItems).map(normalizeItem).filter(item => {
    const key = `${item.partNumber.toUpperCase()}|${item.description.toLowerCase()}|${item.qty}`
    if (seen.has(key)) return false
    seen.add(key)
    return item.description || item.partNumber
  })
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
    qty: item.qty,
  })), allParts).map(({ item, match }, i) => ({
    custRef: extracted[i].customerRef || item.pn || item.description,
    pn: match?.pn || item.pn || '',
    desc: item.description,
    qty: item.qty,
    uom: extracted[i].uom || 'EA',
    oem: match ? 'B&K' : 'TBD',
    match: match ? (match.tier === 1 ? 'Exact' : `Suggested · tier ${match.tier}`) : 'Unmatched',
    conf: match ? (match.tier === 1 ? 100 : Math.max(60, extracted[i].confidence)) : extracted[i].confidence,
    confirmed: !!match && match.tier === 1,
    priceList: match ? `${match.list || 'Price list'}${match.version ? ` ${match.version}` : ''}` : 'Ad-hoc',
    priceSource: match?.list === 'Vendor quote' ? 'vendor-quote' : match ? 'price-list' : 'manual',
    priceSourceName: match?.list === 'Vendor quote' ? (match.desc || 'Vendor reference') : match?.list || 'Manual entry',
    priceState: match ? 'Current' : 'Expired',
    listPrice: match?.price || 0,
    currency: match?.currency || 'INR',
    evidence: extracted[i].evidence,
  }))
  const bom = workbenchRows.map(row => ({
    itemCategory: 'Hardware', pn: row.pn, custRef: row.custRef,
    desc: row.desc, uom: row.uom, listPrice: row.listPrice,
    adders: [], qtyPerUnit: 0, common: row.qty, spares: 0, quoted: '',
    list: row.priceList.startsWith('BNK') ? 'BNK' : 'Ad-hoc', currency: row.currency,
  }))
  return { extracted, workbenchRows, bom }
}
