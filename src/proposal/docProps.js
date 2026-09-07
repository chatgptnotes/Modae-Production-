// Everything needed to render the customer document, derived from the store.
//
// PrintDoc takes six props and every one of them used to be a closure inside the
// Proposal page, which meant the only way to see the real document was to open
// that page. The opportunity workspace needs the same document in its Preview
// tab, so the pure derivations live here and both callers share them.
//
// Plain JS, no JSX — `node --test` cannot parse JSX, and the migration in
// normalizeProposal is exactly the kind of thing that has to be testable.
import { defaultCosting, newProposal, proposalTypeForOpp } from '../seed.js'
import { unitCostINR, unitSellINR } from '../utils.js'
import { docModel, docRoute } from '../proposalDoc.js'
import { signalsFromBom, signalsAreEmpty } from '../rack.js'
import { applyAdjustment, normalizePriceFields, resolvePriceSource } from '../pricing.js'
import { withSparesSupportRows } from './sparesBoq.js'

// Qty/Unit × units + Common + Spares — the BoQ quantity rule, in one place so
// the signal-list derivation reads the same totals the sheet shows.
export const lineQty = (l, u) => (l.qtyPerUnit || 0) * u + (l.common || 0) + (l.spares || 0)

// Older saved proposals (and newProposal before this change) used a single
// `qty`; the real BoQ splits quantities into Qty/Unit × units + Common + Spares.
export function normalizeProposal(pr, opp) {
  const units = pr.units || 7
  const route = docRoute(pr, opp)
  const bom = (pr.bom || []).map(l => ({
    itemCategory: '', qtyPerUnit: 0, common: 0, spares: 0, quoted: '',
    list: 'BNK', currency: 'EUR', uom: 'EA', custRef: '',
    ...normalizePriceFields(l),
    ...(l.qtyPerUnit === undefined && l.qty != null ? { common: l.qty } : {}),
  }))
  // Tender intake saves the signal rows zeroed (spares quantities are absolute,
  // not per-unit), which left the tab blank. Counts are implied by the BoQ, so
  // adopt them as the default until someone types a figure of their own.
  const stored = pr.signals || newProposal(pr.oppId).signals
  const derived = signalsFromBom(bom, units, l => lineQty(l, units))
  const signals = signalsAreEmpty(stored) && !signalsAreEmpty(derived) ? derived : stored
  const defaultArtifacts = route === 'Project'
    ? ['Cover Letter', 'Signal List', 'Rack Layout', 'Priced BoQ', 'Compliance Table']
      : route === 'Service'
      ? ['Cover Letter', 'Scope of Work', 'Issues List', 'Proposal', 'Service Rate Schedule']
      : ['Cover Letter', 'Firm Offer', 'Clarifications', 'Sensor Comparison', 'Priced BoQ']
  return {
    ...pr,
    proposalType: pr.proposalType || proposalTypeForOpp(opp),
    route: pr.route || route,
    // Edit Sheet is an application navigation action, not a customer-facing
    // artifact. Remove it from older saved proposals so it cannot duplicate the
    // opportunity-level Edit Sheet control.
    artifactSheets: (pr.artifactSheets || defaultArtifacts).filter(x => x !== 'Edit Sheet'),
    signals: signals.map(s => ({ parameter: s.signal, sensorType: '', location: '', ...s })),
    bom: (route === 'Spares' ? withSparesSupportRows(bom) : bom)
      .map(l => ({ groupId: 'g1', custDesc: '', rfqItem: '', ...l })),
    extractedItems: pr.extractedItems || bom.map(l => ({
      description: l.desc || '',
      partNumber: l.custRef || l.pn || '',
      customerRef: l.custRef || l.pn || '',
      qty: lineQty(l, units),
      uom: l.uom || 'EA',
      evidence: 'Saved proposal BoQ',
    })),
    units,
    pricingMode: pr.pricingMode || (pr.discountPct > 0 ? 'discount' : pr.markupPct > 0 ? 'markup' : 'none'),
    discountPct: Number(pr.discountPct) || 0,
    markupPct: Number(pr.markupPct) || 0,
    pricingHistory: pr.pricingHistory || [],
    approvedPricing: pr.approvedPricing || null,
    costing: { ...defaultCosting, ...pr.costing },
    // `section`, `compliance` and `workflowStatus` are the sample compliance
    // table's own columns. `status` is left exactly as stored — gates.js reads
    // it to raise deviation approvals, so it is not ours to reinterpret.
    terms: (pr.terms || []).map(t => ({
      key: '', clauseRef: '', section: '',
      compliance: t.status === 'Deviation' ? 'Deviate' : 'Comply',
      workflowStatus: 'Open',
      ...t,
    })),
    // One priced group unless the proposal says otherwise — the samples'
    // `Item-10`. A line whose group has been deleted still prints, under the
    // first group, rather than disappearing off a priced document.
    itemGroups: (pr.itemGroups || []).length ? pr.itemGroups : [{
      id: 'g1',
      no: 'Item-10',
      title: pr.subject || pr.project || 'Scope of supply',
      notes: [],
    }],
    // Hidden annexes in the samples: prepared, not issued. Off until opted in.
    printAnnexes: pr.printAnnexes || [],
  }
}

// The line-pricing chain. Prices come off the published price lists plus the
// ad-hoc trader quotes, so this needs the store, not just the proposal.
export function buildPricing(store, p) {
  const units = p.units || 7
  const sparesLines = p.route === 'Spares' ? (store.sparesLines || []) : []
  const allParts = Object.entries(store.priceLists).flatMap(([list, pl]) =>
    pl.parts.map(part => ({ ...part, list, currency: pl.currency })))

  const totalQty = (l, u = units) => lineQty(l, u)
  // Identity is strongest first: a part number identifies a line, a customer
  // reference next, and the description only when the line carries neither.
  // Treating all three as equal alternatives let a shared description match the
  // wrong spares line, and — because the match used to be spread OVER the line
  // — overwrite its part number, so every line resolved to the same price.
  const sourceLine = l => {
    if (l.pn) return sparesLines.find(x => x.pn === l.pn)
    if (l.custRef) return sparesLines.find(x => x.custRef === l.custRef)
    if (l.desc) return sparesLines.find(x => x.desc === l.desc)
    return undefined
  }
  // The matched spares line fills gaps only — it must never replace a value the
  // proposal line already carries (a blank/undefined field is not a value).
  const withSource = l => {
    const source = sourceLine(l)
    if (!source) return l
    const merged = { ...source }
    for (const [key, value] of Object.entries(l)) {
      if (value !== undefined && value !== null && value !== '') merged[key] = value
    }
    return merged
  }
  const lineSource = l => resolvePriceSource(
    withSource(l),
    store.priceLists,
    store.adhocParts,
    store.vendorQuotes,
  )
  const linePrice = l => {
    const source = lineSource(l)
    const part = allParts.find(x => x.pn === l.pn)
    const adderSum = (source?.adders || part?.adders || [])
      .filter(a => (l.adders || []).includes(a.code)).reduce((s, a) => s + a.price, 0)
    return (source?.price || 0) + adderSum
  }
  const isBnk = l => (lineSource(l)?.sourceName || l.list || 'BNK') === 'BNK'
  const lineCurrency = l => lineSource(l)?.currency || l.currency || 'EUR'
  const lineCost = (l, c = p.costing) => unitCostINR(linePrice(l), c, lineCurrency(l), isBnk(l))
  const lineComputed = (l, c = p.costing) => applyAdjustment(
    unitSellINR(linePrice(l), c, lineCurrency(l), isBnk(l)), p)
  // Customer-facing (target) price — editable; defaults to the computed GM price.
  const lineQuoted = (l, c = p.costing) => (l.quoted !== '' && l.quoted != null ? +l.quoted : Math.round(lineComputed(l, c)))

  const computeTotals = pr => pr.bom.reduce((t, l) => {
    const q = totalQty(l, pr.units || 7)
    const base = unitSellINR(linePrice(l), pr.costing, lineCurrency(l), isBnk(l))
    return {
      cost: t.cost + lineCost(l, pr.costing) * q,
      listValue: t.listValue + base * q,
      target: t.target + lineQuoted(l, pr.costing) * q,
    }
  }, { cost: 0, listValue: 0, target: 0 })

  return { allParts, totalQty, linePrice, lineSource, lineCurrency, isBnk, lineCost, lineComputed, lineQuoted, computeTotals }
}

// The six props PrintDoc wants, read-only, straight off the store. Returns null
// when the opportunity is unknown so callers can render their own empty state.
export function buildDocProps(store, oppId) {
  const opp = store.opportunities.find(o => o.id === oppId)
  if (!opp) return null
  const p = normalizeProposal(store.getProposal(oppId), opp)
  const { lineQuoted, computeTotals } = buildPricing(store, p)
  const specFiles = ((store.files || {})[oppId] || {})['Customer Specs'] || []
  return {
    p,
    opp,
    doc: docModel(p, opp, { files: specFiles.map(f => f.name).filter(Boolean), config: store.config }),
    // Selling rates are visible on every priced proposal. Internal cost and
    // margin values are not part of this public document model.
    priced: p.bidType !== 'Unpriced (Technical)',
    totals: computeTotals(p),
    lineQuoted,
  }
}
