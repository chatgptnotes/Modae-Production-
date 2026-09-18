// Optional non-catalogue rows that may be added to a customer-facing Spares
// firm offer. They are not inserted automatically.
import { defaultCosting } from '../seed.js'
import { PRICE_SOURCES, isMissingSparesDescription, sparesLineFinancials } from '../pricing.js'

export const SPARES_SUPPORT_ROWS = [
  { desc: 'Warranty Certificate', pn: 'NA', common: 1 },
  { desc: 'Country of Origin Certificate', pn: 'NA', common: 1 },
  { desc: 'Freight Charges from B&K Germany To ModAE India', pn: 'NA', common: 1 },
]

export const isSparesSupportRow = line => line?.sparesSupport === true

export function orderSparesLines(lines = [], getLine = line => line) {
  return lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => {
      const aSupport = Number(!!getLine(a.line)?.sparesSupport)
      const bSupport = Number(!!getLine(b.line)?.sparesSupport)
      return aSupport - bSupport || a.index - b.index
    })
    .map(entry => entry.line)
}

const isDefaultSupportRow = line => isSparesSupportRow(line)
  && SPARES_SUPPORT_ROWS.some(row => supportKey(row) === supportKey(line))

export const isManuallyAddedSparesSupportRow = line => line?.origin === 'manual' || line?.supportAddedManually === true
export const isLegacyAutoSparesSupportRow = line => isDefaultSupportRow(line) && !isManuallyAddedSparesSupportRow(line)

export const supportRowForDescription = description => SPARES_SUPPORT_ROWS.find(row =>
  String(row.desc).trim().toLowerCase() === String(description || '').trim().toLowerCase()) || null

export const isPlaceholderSparesLine = line => {
  const values = [line?.pn, line?.custRef, line?.desc].map(value => String(value || '').trim())
  return values.some(value => /^item[-\s]?\d+$/i.test(value))
}

const supportPartKey = value => /^na$/i.test(String(value || '').trim()) ? '' : String(value || '').trim().toLowerCase()
const supportKey = line => `${supportPartKey(line?.pn)}|${String(line?.desc || '').trim().toLowerCase()}`

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
    .filter(line => line?.confirmed && !line.removedFromSourcing && Number(line.qty) > 0 && !isPlaceholderSparesLine(line) && !isMissingSparesDescription(line))
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

export function orderedSparesProposalBom(lines = [], priceLists = {}, costing = defaultCosting) {
  return orderSparesLines(lines).flatMap(line => {
    if (!isSparesSupportRow(line)) return sparesProposalBom([line], priceLists, costing)
    return withSparesSupportRows([{
      ...line,
      quoted: Number(line.listUnitPrice ?? line.listPrice) > 0 ? Number(line.listUnitPrice ?? line.listPrice) : '',
    }])
  })
}

export function withSparesSupportRows(bom = []) {
  // Legacy builds injected the three standard rows on every Spares proposal.
  // Drop those rows unless an explicit manual origin/marker says the user
  // added them. Preserve every other line and its existing order.
  return bom.filter(line => !isLegacyAutoSparesSupportRow(line))
}
