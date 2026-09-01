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

// Qty/Unit × units + Common + Spares — the BoQ quantity rule, in one place so
// the signal-list derivation reads the same totals the sheet shows.
export const lineQty = (l, u) => (l.qtyPerUnit || 0) * u + (l.common || 0) + (l.spares || 0)

// Older saved proposals (and newProposal before this change) used a single
// `qty`; the real BoQ splits quantities into Qty/Unit × units + Common + Spares.
export function normalizeProposal(pr, opp) {
  const units = pr.units || 7
  const bom = (pr.bom || []).map(l => ({
    itemCategory: '', qtyPerUnit: 0, common: 0, spares: 0, quoted: '',
    list: 'BNK', currency: 'EUR', uom: 'EA', custRef: '',
    ...l,
    ...(l.qtyPerUnit === undefined && l.qty != null ? { common: l.qty } : {}),
  }))
  // Tender intake saves the signal rows zeroed (spares quantities are absolute,
  // not per-unit), which left the tab blank. Counts are implied by the BoQ, so
  // adopt them as the default until someone types a figure of their own.
  const stored = pr.signals || newProposal(pr.oppId).signals
  const derived = signalsFromBom(bom, units, l => lineQty(l, units))
  const signals = signalsAreEmpty(stored) && !signalsAreEmpty(derived) ? derived : stored
  const defaultArtifacts = docRoute(pr, opp) === 'Project'
    ? ['Cover Letter', 'Signal List', 'Rack Layout', 'Priced BoQ', 'Compliance Table']
    : docRoute(pr, opp) === 'Service'
      ? ['Cover Letter', 'Scope of Work', 'Issues List', 'Proposal', 'Service Rate Schedule']
      : ['Cover Letter', 'Firm Offer', 'Clarifications', 'Sensor Comparison', 'Priced BoQ']
  return {
    ...pr,
    proposalType: pr.proposalType || proposalTypeForOpp(opp),
    route: pr.route || docRoute(pr, opp),
    // Edit Sheet is an application navigation action, not a customer-facing
    // artifact. Remove it from older saved proposals so it cannot duplicate the
    // opportunity-level Edit Sheet control.
    artifactSheets: (pr.artifactSheets || defaultArtifacts).filter(x => x !== 'Edit Sheet'),
    signals: signals.map(s => ({ parameter: s.signal, sensorType: '', location: '', ...s })),
    bom: bom.map(l => ({ groupId: 'g1', custDesc: '', rfqItem: '', ...l })),
    extractedItems: pr.extractedItems || bom.map(l => ({
      description: l.desc || '',
      partNumber: l.custRef || l.pn || '',
      customerRef: l.custRef || l.pn || '',
      qty: lineQty(l, units),
      uom: l.uom || 'EA',
      evidence: 'Saved proposal BoQ',
    })),
    units,
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
  const allParts = [
    ...Object.entries(store.priceLists).flatMap(([list, pl]) =>
      pl.parts.map(part => ({ ...part, list, currency: pl.currency }))),
    // Trader quotes captured on Price Lists → Ad-hoc parts (latest first = reference price)
    ...store.adhocParts.map(a => ({
      pn: a.pn, desc: a.note ? `${a.note} (${a.supplier})` : a.supplier,
      price: a.price, adders: [], list: 'Ad-hoc', currency: a.currency,
    })),
  ]

  const totalQty = (l, u = units) => lineQty(l, u)
  const linePrice = l => {
    const part = allParts.find(x => x.pn === l.pn && (x.list === l.list || !l.list))
    const adderSum = (part?.adders || []).filter(a => l.adders.includes(a.code)).reduce((s, a) => s + a.price, 0)
    return l.listPrice + adderSum
  }
  const isBnk = l => (l.list || 'BNK') === 'BNK'
  const lineCost = (l, c = p.costing) => unitCostINR(linePrice(l), c, l.currency || 'EUR', isBnk(l))
  const lineComputed = (l, c = p.costing) => unitSellINR(linePrice(l), c, l.currency || 'EUR', isBnk(l))
  // Customer-facing (target) price — editable; defaults to the computed GM price.
  const lineQuoted = (l, c = p.costing) => (l.quoted !== '' && l.quoted != null ? +l.quoted : Math.round(lineComputed(l, c)))

  const computeTotals = pr => pr.bom.reduce((t, l) => {
    const q = totalQty(l, pr.units || 7)
    return { cost: t.cost + lineCost(l, pr.costing) * q, target: t.target + lineQuoted(l, pr.costing) * q }
  }, { cost: 0, target: 0 })

  return { allParts, totalQty, linePrice, isBnk, lineCost, lineComputed, lineQuoted, computeTotals }
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
    doc: docModel(p, opp, { files: specFiles.map(f => f.name).filter(Boolean) }),
    // Selling rates are visible on every priced proposal. Internal cost and
    // margin values are not part of this public document model.
    priced: p.bidType !== 'Unpriced (Technical)',
    totals: computeTotals(p),
    lineQuoted,
  }
}
