// Optional non-catalogue rows that may be added to a customer-facing Spares
// firm offer. They are not inserted automatically.
import { defaultCosting } from '../seed.js'
import { PRICE_SOURCES, isMissingSparesDescription, normalizePriceFields, sparesLineFinancials } from '../pricing.js'

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

const lineIdentityKeys = line => [line?.pn, line?.custRef, line?.desc]
  .map(value => partKey(value).replace(/[^a-z0-9]+/g, ''))
  .filter(Boolean)

const proposalLineQuantity = (line, proposal = {}) => {
  const common = Number(line?.common)
  if (Number.isFinite(common) && common > 0) return common
  const qty = Number(line?.qty)
  if (Number.isFinite(qty) && qty > 0) return qty
  return Math.max(0, Number(line?.qtyPerUnit) || 0) * Math.max(1, Number(proposal?.units) || 1)
}

// A released Spares proposal is the baseline for a new revision. Restore its
// customer-facing commercial values into the editable sourcing rows before the
// user changes the requested revision (for example, a higher discount).
export function restoreSparesLinesFromProposal(existingLines = [], proposal = {}, priceLists = {}, costing = defaultCosting) {
  const sourceLines = existingLines.map(line => ({ ...line }))
  const used = new Set()
  const restored = []
  const proposalBom = (proposal?.bom || []).filter(line => {
    const qty = proposalLineQuantity(line, proposal)
    return !isPlaceholderSparesLine(line) && (line?.sparesSupport || (qty > 0 && !isMissingSparesDescription(line)))
  })

  const findExisting = proposalLine => {
    const proposalKeys = new Set(lineIdentityKeys(proposalLine))
    return sourceLines.findIndex((line, index) => !used.has(index)
      && lineIdentityKeys(line).some(key => proposalKeys.has(key)))
  }

  proposalBom.forEach(proposalLine => {
    const existingIndex = findExisting(proposalLine)
    if (existingIndex >= 0) used.add(existingIndex)
    const existing = existingIndex >= 0 ? sourceLines[existingIndex] : {}
    const qty = proposalLineQuantity(proposalLine, proposal)
    const listUnitPrice = Number(proposalLine.listUnitPrice ?? proposalLine.listPrice) || 0
    const restoredLine = normalizePriceFields({
      ...existing,
      oppId: existing.oppId,
      pn: proposalLine.pn || existing.pn || '',
      custRef: proposalLine.custRef || proposalLine.pn || existing.custRef || '',
      desc: proposalLine.desc || existing.desc || '',
      qty,
      uom: proposalLine.uom || existing.uom || 'EA',
      listPrice: Number(proposalLine.listPrice ?? listUnitPrice) || 0,
      listUnitPrice,
      baseCost: proposalLine.baseCost == null ? existing.baseCost : Number(proposalLine.baseCost) || 0,
      discountPct: Number(proposalLine.discountPct) || 0,
      markupPct: Number(proposalLine.markupPct) || 0,
      currency: proposalLine.currency || existing.currency || 'INR',
      priceList: proposalLine.priceSourceName || proposalLine.priceList || existing.priceList || '',
      priceSource: proposalLine.priceSource || existing.priceSource || PRICE_SOURCES.MANUAL,
      priceSourceName: proposalLine.priceSourceName || existing.priceSourceName || '',
      priceSourceVersion: proposalLine.priceSourceVersion || existing.priceSourceVersion || '',
      priceSourceRef: proposalLine.priceSourceRef || existing.priceSourceRef || '',
      priceSourceDate: proposalLine.priceSourceDate || existing.priceSourceDate || '',
      removedFromSourcing: false,
      removedQty: 0,
      confirmed: qty > 0 && (listUnitPrice > 0 || Number(proposalLine.quoted) > 0),
    })
    restored.push(restoredLine)
  })

  sourceLines.forEach((line, index) => {
    if (used.has(index)) return
    restored.push({
      ...line,
      qty: 0,
      removedQty: Math.max(0, Number(line.qty) || 0),
      removedFromSourcing: true,
      confirmed: false,
    })
  })

  return { lines: restored, costing }
}

export function catalogueDescriptionForLine(line, priceLists = {}) {
  const pn = partKey(line?.pn || line?.custRef)
  if (!pn || pn === 'na') return ''
  for (const priceList of Object.values(priceLists || {})) {
    const match = (priceList?.parts || []).find(part => partKey(part.pn) === pn)
    if (match?.desc) return match.desc
  }
  return ''
}

export function sparesProposalBom(lines = [], priceLists = {}) {
  const costing = arguments[2] || defaultCosting
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
