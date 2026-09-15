// Standard non-catalogue rows that belong to the customer-facing Spares firm
// offer. They are kept on the proposal so the editor, preview and export share
// one row set; sourcing remains authoritative for catalogue product rows.
import { defaultCosting } from '../seed.js'
import { PRICE_SOURCES, sparesLineFinancials } from '../pricing.js'

export const SPARES_SUPPORT_ROWS = [
  { desc: 'Warranty Certificate', pn: 'NA', common: 1 },
  { desc: 'Country of Origin Certificate', pn: 'NA', common: 1 },
  { desc: 'Freight Charges from B&K Germany To ModAE India', pn: 'NA', common: 1 },
]

export const isSparesSupportRow = line => line?.sparesSupport === true

export const isPlaceholderSparesLine = line => {
  const values = [line?.pn, line?.custRef, line?.desc].map(value => String(value || '').trim())
  return values.some(value => /^item[-\s]?\d+$/i.test(value))
}

const supportKey = line => `${String(line?.pn || '').trim().toLowerCase()}|${String(line?.desc || '').trim().toLowerCase()}`

const partKey = value => String(value || '').trim().toLowerCase()

export function catalogueDescriptionForLine(line, priceLists = {}) {
  const pn = partKey(line?.pn || line?.custRef)
  if (!pn || pn === 'na') return ''
  for (const priceList of Object.values(priceLists || {})) {
    const match = (priceList?.parts || []).find(part => partKey(part.pn) === pn)
    if (match?.desc) return match.desc
  }
  return ''
}

export function sparesProposalBom(lines = [], priceLists = {}, costing = defaultCosting) {
  return lines
    .filter(line => line?.confirmed && !line.removedFromSourcing && Number(line.qty) > 0 && !isPlaceholderSparesLine(line))
    .map(line => {
      const financials = sparesLineFinancials(line, costing)
      return {
        quoted: financials.adjustedUnitPriceINR,
        listTotalPrice: financials.listTotalINR,
        itemCategory: 'Hardware',
        pn: line.pn || '',
        custRef: line.custRef || line.pn || line.desc || '',
        desc: catalogueDescriptionForLine(line, priceLists) || line.desc || line.custRef || line.pn || '',
        listPrice: Number(line.listPrice) || 0,
        adders: [],
        qtyPerUnit: 0,
        common: Number(line.qty) || 0,
        spares: 0,
        uom: line.uom || 'EA',
        list: String(line.priceList || '').startsWith('BNK') ? 'BNK' : 'Ad-hoc',
        currency: line.currency || 'INR',
        priceSource: line.priceSource || (String(line.priceList || '').startsWith('Ad-hoc') ? PRICE_SOURCES.MANUAL : PRICE_SOURCES.LIST),
        priceSourceName: line.priceSourceName || line.priceList || '',
        priceSourceVersion: line.priceSourceVersion || '',
        priceSourceRef: line.priceSourceRef || line.quoteRef || '',
        priceSourceDate: line.priceSourceDate || '',
        listUnitPrice: Number(line.listUnitPrice ?? line.listPrice) || 0,
        listUnitPriceINR: financials.listUnitPriceINR,
        baseCost: line.baseCost == null ? undefined : Number(line.baseCost) || 0,
        discountPct: Number(line.discountPct) || 0,
        markupPct: Number(line.markupPct) || 0,
      }
    })
}

export function withSparesSupportRows(bom = []) {
  const existing = new Map(bom.filter(isSparesSupportRow).map(line => [supportKey(line), line]))
  const products = bom.filter(line => !isSparesSupportRow(line))
  const support = SPARES_SUPPORT_ROWS.map(row => ({
    itemCategory: 'Support',
    custRef: 'NA',
    listPrice: 0,
    adders: [],
    qtyPerUnit: 0,
    spares: 0,
    quoted: '',
    uom: 'EA',
    list: 'Ad-hoc',
    currency: 'INR',
    sparesSupport: true,
    ...row,
    ...(existing.get(supportKey(row)) || {}),
  }))
  return [...products, ...support]
}
