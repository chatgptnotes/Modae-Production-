import React, { useEffect, useMemo, useRef, useState } from 'react'
import { isPlaceholderSparesLine, useStore } from '../store.jsx'
import { defaultCosting } from '../seed.js'
import { canPriceProposal, unitCostINR, fmt, ddMmmYY } from '../utils.js'
import { pricingThresholdExceptions } from '../gates.js'
import { Chip, ConfChip, AiBadge, Modal } from '../ui.jsx'
import { Icon } from '../icons.jsx'
import { PRICE_SOURCES, formatPriceSource, isConfirmableSparesLine, normalizeMarkupPct, resolvePriceSource, sparesLineFinancials } from '../pricing.js'
import { convertCurrency, currencySymbol, normalizedCurrencyRates } from '../currency.js'

const n = value => Number.isFinite(Number(value)) ? Number(value) : 0
const money = value => `₹ ${fmt(n(value))}`

function PricingApprovalCard({ approval, approvers, role, canRequest, onRequest, onDecide, pricingRows }) {
  const [decision, setDecision] = useState('Approved')
  const [note, setNote] = useState('')
  const [condition, setCondition] = useState('')
  const [error, setError] = useState('')
  const needed = approval?.needed?.length ? approval.needed : [approval?.approver].filter(Boolean)
  const myDecision = approval && (approval.decisions || {})[role]
  const canDecide = approval?.status === 'Pending' && needed.includes(role) && !myDecision
  const status = approval?.status || 'Required'
  const statusClass = status === 'Approved' || status === 'Approved with conditions' ? 'okbox' : status === 'Rejected' ? 'errbox' : 'warnbox'

  const submitDecision = event => {
    event.preventDefault()
    if (!note.trim()) {
      setError('Add a decision note before submitting.')
      return
    }
    if (decision === 'Approved with conditions' && !condition.trim()) {
      setError('Add at least one condition, or choose Approve.')
      return
    }
    setError('')
    onDecide({ d: decision, comment: note.trim(), conditions: decision === 'Approved with conditions' ? [condition.trim()] : [] })
    setNote('')
    setCondition('')
  }

  return <div className={`sourcing-pricing-approval ${statusClass}`} role="status">
    <div className="sourcing-pricing-approval-header">
      <div><b>Pricing approval</b><span className="hint"> Approval from either {approvers.join(' or ')} is required before proposal.</span></div>
      <span className="sourcing-approval-status">{status === 'Required' ? 'Required' : status}</span>
    </div>
    {!approval && <div className="sourcing-approval-copy">The pricing threshold exception must be reviewed before this opportunity can continue.</div>}
    {approval && <div className="sourcing-approval-copy">Requested by <b>{approval.requestedBy || 'user'}</b>{approval.ts ? ` · ${ddMmmYY(approval.ts.slice(0, 10))}` : ''}{approval.status === 'Pending' && !myDecision ? ` · awaiting ${needed.filter(r => !(approval.decisions || {})[r]).join(' or ')}` : ''}</div>}
    {!!pricingRows?.length && <div className="sourcing-approval-reason"><b>Reason:</b> pricing exceeds the configured approval threshold.
      <div className="sourcing-approval-reason-rows">{pricingRows.map((row, index) => <div key={`${row.label}-${index}`}><b>{row.label}</b>{row.discount > row.discountPct && <span>Discount {row.discount}% <small>(limit {row.discountPct}%)</small></span>}{row.markup > row.markupPct && <span>Markup {row.markup}% <small>(limit {row.markupPct}%)</small></span>}</div>)}</div>
    </div>}
    {approval?.status === 'Rejected' && approval.decisionNote && <div className="sourcing-approval-copy">Decision note: {approval.decisionNote}</div>}
    {approval && myDecision && <div className="sourcing-approval-copy">Your decision: <b>{myDecision.d}</b>{myDecision.c ? ` — ${myDecision.c}` : ''}</div>}
    {canRequest && <button type="button" className="sourcing-approval-action" onClick={onRequest}><Icon name="clipboardCheck" size={13} /> Request approval</button>}
    {canDecide && <form className="sourcing-approval-form" onSubmit={submitDecision}>
      <label>Decision note <textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Explain the pricing decision" rows="2" /></label>
      <div className="sourcing-approval-decision-row">
        <select value={decision} onChange={event => setDecision(event.target.value)} aria-label="Pricing approval decision">
          <option>Approved</option><option>Approved with conditions</option><option>Rejected</option>
        </select>
        {decision === 'Approved with conditions' && <input value={condition} onChange={event => setCondition(event.target.value)} placeholder="Condition" aria-label="Approval condition" />}
        <button type="submit" className="sourcing-approval-action"><Icon name="check" size={13} /> Submit decision</button>
      </div>
      {error && <div className="sourcing-approval-error">{error}</div>}
    </form>}
  </div>
}

export default function WbSpares({ opp, openBuilder, onContinue }) {
  const store = useStore()
  const comm = canPriceProposal(store.role)
  const lines = store.sparesLines.filter(l => l.oppId === opp.id && !isPlaceholderSparesLine(l))
  const proposal = store.getProposal(opp.id)
  const [compareFor, setCompareFor] = useState(null)
  const [compareSearch, setCompareSearch] = useState('')
  const [evidence, setEvidence] = useState(null)
  const [pricePreview, setPricePreview] = useState(null)
  const [sent, setSent] = useState(false)
  const [showAddPart, setShowAddPart] = useState(false)
  const [newLine, setNewLine] = useState({ pn: '', desc: '', qty: '1', listPrice: '' })
  const sourcingSheetWrapRef = useRef(null)
  const sourcingScrollbarRef = useRef(null)
  const sourcingScrollbarContentRef = useRef(null)
  const quoteValidityDays = Math.max(1, n(store.config?.proposalValidityDays ?? 30))
  const currencyRates = normalizedCurrencyRates(store.config?.currencyRates)
  const displayCurrencies = ['INR', ...Object.keys(currencyRates).filter(currency => currency !== 'INR')]
  const [displayCurrency, setDisplayCurrency] = useState('INR')
  const costingDefaults = store.config?.costingDefaults || {}
  const hasSplitCosting = ['customsDutyPct', 'ervPct', 'handlingPct'].some(key => proposal.costing?.[key] != null)
  const legacyImportFactor = proposal.costing?.cdErvHandlingPct ?? proposal.costing?.cdErvContPct
  const costing = {
    ...defaultCosting,
    ...costingDefaults,
    ...(proposal.costing || {}),
    customsDutyPct: proposal.costing?.customsDutyPct ?? (!hasSplitCosting && legacyImportFactor != null ? legacyImportFactor : costingDefaults.customsDutyPct ?? 8.5),
    ervPct: proposal.costing?.ervPct ?? (!hasSplitCosting && legacyImportFactor != null ? 0 : costingDefaults.ervPct ?? 2.5),
    handlingPct: proposal.costing?.handlingPct ?? (!hasSplitCosting && legacyImportFactor != null ? 0 : costingDefaults.handlingPct ?? 5),
    cdErvHandlingPct: proposal.costing?.cdErvHandlingPct ?? proposal.costing?.cdErvContPct ?? costingDefaults.cdErvHandlingPct ?? defaultCosting.cdErvContPct,
    currencyRates: normalizedCurrencyRates(proposal.costing?.currencyRates || currencyRates),
  }
  const handlingMin = n(costingDefaults.cdErvHandlingMinPct ?? 15)
  const handlingMax = n(costingDefaults.cdErvHandlingMaxPct ?? 20)
  const importFactorPct = costing.customsDutyPct + costing.ervPct + costing.handlingPct
  const handlingOutOfRange = importFactorPct < handlingMin || importFactorPct > handlingMax
  const displayAmount = value => convertCurrency(value, 'INR', displayCurrency, costing.currencyRates)
  const displayMoney = value => `${currencySymbol(displayCurrency)} ${fmt(n(displayAmount(value)))} `
  const updateCosting = (field, value) => {
    if (!comm) return
    if (field === 'currencyRates') {
      store.updateProposalCosting(opp.id, { currencyRates: normalizedCurrencyRates(value) })
      return
    }
    const next = Math.max(0, n(value))
    store.updateProposalCosting(opp.id, { [field]: next })
  }

  const values = line => {
    const row = sparesLineFinancials(line, costing)
    return {
      ...row,
      adjustedUnitPrice: row.adjustedUnitPriceINR,
      baseCost: row.baseCostINR,
      listUnitPriceINR: row.listUnitPriceINR,
      listTotal: row.listTotalINR,
      lineTotal: row.lineTotalINR,
      cogs: row.cogsINR,
    }
  }
  // Adapt persisted sourcing rows to the calculation schema, then derive every
  // monetary value from the current inputs. Store updates trigger this memo to
  // recalculate immediately without duplicating business values in local state.
  const lineItems = useMemo(() => lines.map(line => {
    const row = values(line)
    return {
      id: line.id,
      partNo: line.pn || line.custRef || '',
      description: line.desc || '',
      qty: row.qty,
      listUnitPrice: row.listUnitPrice,
      listUnitPriceINR: row.listUnitPriceINR,
      discountPercent: row.discountPct,
      markupPercent: row.markupPct,
      baseCost: row.baseCost,
      listTotal: row.listTotal,
      adjustedUnitPrice: row.adjustedUnitPrice,
      lineTotal: row.lineTotal,
      lineTotalCogs: row.cogs,
      confirmed: !!line.confirmed,
      sourceLine: line,
    }
  }), [lines, proposal])
  const calculatedItems = useMemo(() => lineItems.map(item => {
    return { ...item, lineProfit: item.lineTotal - item.lineTotalCogs }
  }), [lineItems])
  const pricedItems = calculatedItems.filter(item => item.qty > 0 && item.listUnitPrice > 0)
  const activeItems = calculatedItems.filter(item => item.qty > 0 && item.confirmed)
  const pendingConfirmationCount = pricedItems.filter(item => !item.confirmed).length
  const pricingExceptions = pricingThresholdExceptions(opp, proposal, store)
  const pricingApprovers = store.config?.approvalThresholds?.pricingApprovers?.filter(Boolean)?.length
    ? store.config.approvalThresholds.pricingApprovers.filter(Boolean)
    : ['AH', 'LJS']
  const pricingApproval = pricingExceptions.rows.length
    ? (store.approvals || []).find(a => a.status !== 'Cancelled' && a.oppId === opp.id && a.type === 'Pricing threshold exception' && (a.rev == null || String(a.rev) === String(proposal?.revision ?? '')))
    : null
  const pricingApprovalClear = !pricingExceptions.rows.length || ['Approved', 'Approved with conditions'].includes(pricingApproval?.status)
  const canContinueToProposal = pricedItems.length > 0 && pendingConfirmationCount === 0 && activeItems.length > 0 && pricingApprovalClear
  useEffect(() => {
    const wrap = sourcingSheetWrapRef.current
    const scrollbar = sourcingScrollbarRef.current
    const scrollbarContent = sourcingScrollbarContentRef.current
    const table = wrap?.querySelector('table')
    if (!wrap || !scrollbar || !scrollbarContent || !table) return undefined

    let syncing = false
    const syncScrollbarSize = () => {
      scrollbarContent.style.width = `${table.scrollWidth}px`
      scrollbar.scrollLeft = wrap.scrollLeft
    }
    const syncFromTable = () => {
      if (syncing) return
      syncing = true
      scrollbar.scrollLeft = wrap.scrollLeft
      syncing = false
    }
    const syncFromScrollbar = () => {
      if (syncing) return
      syncing = true
      wrap.scrollLeft = scrollbar.scrollLeft
      syncing = false
    }

    wrap.addEventListener('scroll', syncFromTable, { passive: true })
    scrollbar.addEventListener('scroll', syncFromScrollbar, { passive: true })
    syncScrollbarSize()
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncScrollbarSize)
    resizeObserver?.observe(table)
    resizeObserver?.observe(wrap)
    return () => {
      wrap.removeEventListener('scroll', syncFromTable)
      scrollbar.removeEventListener('scroll', syncFromScrollbar)
      resizeObserver?.disconnect()
    }
  }, [displayCurrency, lines.length, showAddPart])
  const totals = useMemo(() => pricedItems.reduce((total, item) => ({
    revenue: total.revenue + item.lineTotal,
    cogs: total.cogs + item.lineTotalCogs,
    originalTotal: total.originalTotal + item.listTotal,
    quantity: total.quantity + item.qty,
  }), { revenue: 0, cogs: 0, originalTotal: 0, quantity: 0 }), [pricedItems])
  const grossProfit = totals.revenue - totals.cogs
  const grossMarginPct = totals.revenue > 0 ? grossProfit / totals.revenue * 100 : 0
  const proposalOnlyMismatch = !lines.length && (proposal.bom || []).length > 0
  const expiredLines = lines.filter(l => l.priceState === 'Expired')
  const needsPricingLines = lines.filter(l => l.priceState === 'Needs pricing')
  const clarifications = (store.clarifications || []).filter(c => c.oppId === opp.id && c.status === 'Answered')

  const requestPricingApproval = () => store.requestApproval({
    oppId: opp.id,
    type: 'Pricing threshold exception',
    rev: String(proposal?.revision ?? ''),
    approver: pricingApprovers[0],
    needed: pricingApprovers,
    anyOf: pricingApprovers.length > 1,
    detail: `Pricing threshold exception: discount above ${pricingExceptions.discountPct}% or markup above ${pricingExceptions.markupPct}%`,
    pricingRows: pricingExceptions.rows,
  })
  const removeLine = line => {
    const removedLine = { ...line, qty: 0, removedFromSourcing: true, confirmed: false }
    const remainingPricing = pricingThresholdExceptions(opp, proposal, {
      ...store,
      sparesLines: store.sparesLines.map(item => item.id === line.id ? removedLine : item),
    })
    store.updateSparesLine(line.id, {
      qty: 0,
      removedQty: Math.max(1, n(line.qty)),
      removedFromSourcing: true,
      confirmed: false,
    })
    if (!remainingPricing.rows.length && pricingApproval?.status === 'Pending') {
      store.cancelApproval(pricingApproval.id, 'Cancelled automatically: the pricing-exception line was removed from Sourcing.')
    }
  }
  const restoreLine = line => store.updateSparesLine(line.id, {
    qty: Math.max(1, n(line.removedQty)),
    removedFromSourcing: false,
    confirmed: false,
    markupPct: normalizeMarkupPct(line.markupPct),
  })
  const continueTitle = !canContinueToProposal
    ? (pricingExceptions.rows.length && !pricingApprovalClear
      ? (pricingApproval?.status === 'Pending' ? `Awaiting pricing approval from ${pricingApprovers.join(' or ')}` : `Request pricing approval from ${pricingApprovers.join(' or ')}`)
      : pendingConfirmationCount ? `Confirm ${pendingConfirmationCount} remaining priced line${pendingConfirmationCount === 1 ? '' : 's'} first` : 'Add and price at least one sourcing line first')
    : ''

  const updateLine = (line, field, value) => {
    if (!comm) return
    const patch = { [field]: value }
    if (field === 'listUnitPrice') {
      const addedAt = new Date().toISOString()
      const addedBy = store.auth?.user?.name || store.auth?.user?.email || store.role
      patch.listPrice = value
      // Manual values are entered in the INR-denominated table. Rebuild the
      // cost basis as INR too, rather than retaining the old EUR/USD/BNK cost
      // from the previous source row.
      patch.currency = 'INR'
      patch.baseCost = unitCostINR(value, { ...defaultCosting, ...(proposal.costing || {}) }, 'INR', false)
      patch.priceSource = 'manual'
      patch.priceSourceName = 'Manual pricing'
      patch.priceList = 'Manual pricing'
      patch.priceState = 'Current'
      patch.addedBy = addedBy
      patch.addedByName = addedBy
      patch.addedAt = addedAt
      patch.priceSourceDate = addedAt.slice(0, 10)
    }
    store.updateSparesLine(line.id, patch)
  }

  const addManual = () => {
    if (!newLine.pn.trim() && !newLine.desc.trim()) return
    const price = Math.max(0, n(newLine.listPrice))
    const addedAt = new Date().toISOString()
    const addedBy = store.auth?.user?.name || store.auth?.user?.email || store.role
    store.addSparesLine(opp.id, { origin: 'manual', custRef: newLine.pn.trim() || newLine.desc.trim(), pn: newLine.pn.trim(), desc: newLine.desc.trim(), qty: Math.max(0, n(newLine.qty)), confirmed: false, listPrice: price, listUnitPrice: price, baseCost: price, currency: 'INR', priceList: 'Manual pricing', priceSource: 'manual', priceState: 'Current', priceSourceDate: addedAt.slice(0, 10), oem: 'Manual', leadTime: 'TBC', addedBy, addedByName: addedBy, addedAt })
    setNewLine({ pn: '', desc: '', qty: '1', listPrice: '' })
    setShowAddPart(false)
  }
  const onNewKeyDown = event => { if (event.key === 'Enter') { event.preventDefault(); addManual() } }
  const sourceDetails = line => formatPriceSource(line)
  const manualAttribution = line => {
    if (line.addedByName || line.addedBy || line.addedAt) return line
    const audit = (store.audit || []).find(entry => entry.action === 'Spares line updated'
      && entry.objectId === line.oppId
      && String(entry.detail || '').includes(line.id)
      && /listUnitPrice|listPrice/.test(entry.detail || ''))
    return audit ? { addedBy: audit.role || '', addedAt: audit.ts || '' } : {}
  }
  const priceListNameFor = line => {
    const sourceName = String(line.priceSourceName || '').trim()
    const sourceLabel = String(line.priceList || '').trim()
    return Object.keys(store.priceLists || {}).find(name =>
      name === sourceName || name === sourceLabel || sourceLabel.startsWith(`${name} `)) || sourceName
  }
  const openPriceList = line => {
    const part = line.pn || line.custRef || ''
    const list = priceListNameFor(line)
    if (!part || !list) return
    const priceList = store.priceLists?.[list]
    const requestedVersion = String(line.priceSourceVersion || '').trim()
    const version = requestedVersion
      ? priceList?.versions?.find(item => item.version === requestedVersion)
      : null
    const displayList = requestedVersion ? version : priceList
    const priceListPart = displayList?.parts?.find(item =>
      String(item.pn || '').trim().toUpperCase() === String(part).trim().toUpperCase())
    const priceListPartIndex = displayList?.parts?.findIndex(item =>
      String(item.pn || '').trim().toUpperCase() === String(part).trim().toUpperCase()) ?? -1
    setPricePreview({
      part,
      list,
      version: displayList?.version || requestedVersion,
      uploaded: displayList?.uploaded || priceList?.uploaded || '',
      currency: displayList?.currency || line.currency || '',
      price: priceListPart?.price,
      partNumber: priceListPart?.pn || part,
      srNo: priceListPartIndex >= 0 ? priceListPartIndex + 1 : null,
      description: priceListPart?.desc || '',
      adders: priceListPart?.adders || [],
      found: !!priceList && (!requestedVersion || !!version) && !!priceListPart,
    })
  }
  // Where an alternative's price would come from if selected — mirrors the same
  // price-list → vendor-quote → manual precedence used for confirmed lines.
  const altSourceInfo = alt => {
    const resolved = resolvePriceSource({ pn: alt.pn }, store.priceLists, [], store.vendorQuotes)
    if (resolved?.source === PRICE_SOURCES.LIST) return { tone: '', label: `Price list · ${resolved.sourceName} ${resolved.sourceVersion}`.trim() }
    if (resolved?.source === PRICE_SOURCES.VENDOR) return { tone: 'state-Review', label: `Vendor price list · ${resolved.sourceName}` }
    return { tone: 'grey', label: 'Manual — no priced match yet' }
  }

  const STOPWORDS = new Set(['and', 'the', 'for', 'with', 'w/', 'a', 'of', 'to'])
  const wordsOf = text => String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOPWORDS.has(w))
  const familyOf = pn => String(pn || '').split(/[./]/)[0]
  const allPriceListParts = () => Object.entries(store.priceLists || {})
    .flatMap(([name, pl]) => (pl.parts || []).map(part => ({ ...part, list: name, version: pl.version, currency: pl.currency })))
  // Lists are quoted in their own currency (BNK in EUR, Metrics in USD), so the
  // suggestion has to name it rather than assume rupees.
  const listPriceLabel = part => `${part.list} ${part.version} price list · ${part.currency || ''} ${fmt(part.price)}`.replace(/\s+/g, ' ')
  const searchPriceListParts = (line, query) => {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return []
    return allPriceListParts()
      .filter(part => part.pn !== line.pn && (part.pn.toLowerCase().includes(q) || String(part.desc || '').toLowerCase().includes(q)))
      .slice(0, 20)
      .map(part => ({
        forPn: line.pn, pn: part.pn, desc: part.desc, conf: null,
        note: listPriceLabel(part),
        priceState: 'Current',
      }))
  }
  const priceListAlternatives = line => {
    const allParts = allPriceListParts()
    const target = new Set(wordsOf(line.desc))
    const family = familyOf(line.pn)
    const toAlt = (part, conf, note, reason) => ({
      forPn: line.pn, pn: part.pn, desc: part.desc, conf,
      note: note || listPriceLabel(part), reason, suggestedBy: 'AI',
      priceState: 'Current',
    })
    const results = []
    // Exact part-number match — same part sitting in the current price list,
    // offered so a manually-priced line can be refreshed to the list price.
    const exact = allParts.find(part => part.pn === line.pn)
    if (exact) results.push(toAlt(exact, 100, `Same part in ${exact.list} ${exact.version} — refresh to list price ${exact.currency || ''} ${fmt(exact.price)}`.replace(/\s+/g, ' '), 'The part number is an exact match in the current approved price list.'))
    // Description overlap — catches genuine substitutes with different part numbers.
    allParts.filter(part => part.pn !== line.pn).forEach(part => {
      const partWords = wordsOf(part.desc)
      const overlap = partWords.filter(w => target.has(w)).length
      const score = target.size ? overlap / Math.max(target.size, partWords.length || 1) : 0
      if (score > 0.25) {
        const matchedWords = partWords.filter(w => target.has(w)).slice(0, 4).join(', ')
        results.push(toAlt(part, Math.round(Math.min(95, score * 100)), undefined,
          `The description overlaps on ${matchedWords || 'key product terms'}.`))
      }
    })
    // Same part-number family (e.g. "DS821.*") — related accessories/variants worth reviewing.
    if (family) {
      allParts.filter(part => part.pn !== line.pn && familyOf(part.pn) === family
        && !results.some(r => r.pn === part.pn)).forEach(part => results.push(toAlt(part, 55, undefined,
        `The part number shares the ${family} family with the requested line.`)))
    }
    const seen = new Set()
    return results.filter(a => (seen.has(a.pn) ? false : (seen.add(a.pn), true))).slice(0, 6)
  }
  const useAlternative = (line, alt) => {
    const resolved = resolvePriceSource({ pn: alt.pn }, store.priceLists, [], store.vendorQuotes)
    const priced = resolved && resolved.price > 0 ? {
      listPrice: resolved.price, listUnitPrice: resolved.price, currency: resolved.currency,
      priceList: `${resolved.sourceName} ${resolved.sourceVersion}`.trim(),
      priceSource: resolved.source, priceSourceName: resolved.sourceName, priceSourceVersion: resolved.sourceVersion,
    } : null
    const nextLine = { ...line, pn: alt.pn, desc: alt.desc, ...(priced || {}), priceState: priced ? (alt.priceState || 'Current') : 'Needs pricing' }
    store.updateSparesLine(line.id, { pn: alt.pn, desc: alt.desc, confirmed: isConfirmableSparesLine(nextLine), ...(priced || {}), priceState: nextLine.priceState })
    setCompareFor(null)
    setCompareSearch('')
  }
  const sendToProposal = () => {
    if (!canContinueToProposal) return
    store.sendLinesToProposal(opp.id)
    setSent(true)
    onContinue?.()
  }

  return <div className="sourcing-workbench">
    <div className="section-title">Spares workbench — part matching ({lines.length} line{lines.length === 1 ? '' : 's'})</div>
    {clarifications.length > 0 && <details className="okbox customer-information-banner sourcing-clarification-context">
      <summary><b>Confirmed customer information</b><span className="hint"> These answers stay attached to the opportunity and should be checked while validating each line.</span></summary>
      <div className="sourcing-clarification-content">{clarifications.map(c => <div key={c.id} className="sourcing-clarification-row"><b>{c.category || 'Clarification'}:</b> {c.response}<span className="hint"> · {c.answerSource || 'Customer'}{c.answeredAt ? ` · ${c.answeredAt}` : ''}</span></div>)}</div>
    </details>}
    {!!expiredLines.length && <div className="warnbox spares-price-warning"><b>{expiredLines.length} price source{expiredLines.length === 1 ? '' : 's'} expired.</b>{' '}Use <b>Compare</b> in the Actions column to select a current price-list part, or apply a current manufacturer quote only when the approved price list cannot be used.</div>}
    {!!needsPricingLines.length && <div className="warnbox spares-price-warning"><b>{needsPricingLines.length} line{needsPricingLines.length === 1 ? '' : 's'} need pricing.</b>{' '}Use <b>Compare</b> to select a current price-list part, apply a manufacturer quote, or enter a manual price before continuing.</div>}
    {!!pricingExceptions.rows.length && <PricingApprovalCard approval={pricingApproval} approvers={pricingApprovers} role={store.role} pricingRows={pricingExceptions.rows} canRequest={(comm || pricingApprovers.includes(store.role)) && (!pricingApproval || pricingApproval.status === 'Rejected')} onRequest={requestPricingApproval} onDecide={decision => pricingApproval && store.recordDecision(pricingApproval.id, decision)} />}
    {proposalOnlyMismatch && <div className="warnbox sourcing-flow-warning"><b>Proposal data is not linked to Sourcing.</b> Existing proposal rows are not imported automatically. Add or import the real parts here before continuing to Proposal.</div>}
    <div className="sourcing-table-card">
      <div className="sourcing-table-heading"><div><b>Source, adjust and validate each line here</b><span className="hint"> Price-list values are loaded first; vendor values are the fallback.</span></div><div className="sourcing-table-heading-actions"><span className="sourcing-currency-indicator" title={`All displayed amounts are in ${displayCurrency}`}>Currency: {displayCurrency} ({currencySymbol(displayCurrency)})</span>{comm && <label className="sourcing-currency-view">View amounts in <select value={displayCurrency} onChange={e => setDisplayCurrency(e.target.value)}>{displayCurrencies.map(currency => <option key={currency}>{currency}</option>)}</select></label>}{comm && <button type="button" className="sourcing-add-part-link" aria-expanded={showAddPart} aria-controls="sourcing-manual-line" onClick={() => setShowAddPart(open => !open)}>{showAddPart ? 'Close manual line' : 'Add manual line'}</button>}{!comm && <span className="restricted"><Icon name="lock" size={12} /> Pricing restricted</span>}</div></div>
      {comm && <div className="sourcing-costing-controls" aria-label="Sourcing costing basis">
        <b>Costing basis</b>
        <label>1 EUR = ₹ <input type="number" min="0.0001" step="0.01" value={costing.currencyRates.EUR || ''} onChange={e => updateCosting('currencyRates', { ...costing.currencyRates, EUR: n(e.target.value) })} onBlur={() => updateCosting('currencyRates', costing.currencyRates)} /></label>
        <label>1 USD = ₹ <input type="number" min="0.0001" step="0.01" value={costing.currencyRates.USD || ''} onChange={e => updateCosting('currencyRates', { ...costing.currencyRates, USD: n(e.target.value) })} onBlur={() => updateCosting('currencyRates', costing.currencyRates)} /></label>
        <label>Customs Duty <input type="number" min="0" max="200" step="0.1" value={costing.customsDutyPct} onChange={e => updateCosting('customsDutyPct', e.target.value)} />%</label>
        <label>ERV <input type="number" min="0" max="200" step="0.1" value={costing.ervPct} onChange={e => updateCosting('ervPct', e.target.value)} />%</label>
        <label>Handling <input type="number" min="0" max="200" step="0.1" value={costing.handlingPct} onChange={e => updateCosting('handlingPct', e.target.value)} />%</label>
        <span className={handlingOutOfRange ? 'warnbox sourcing-costing-warning' : 'hint'}>{handlingOutOfRange ? `Combined total ${importFactorPct.toFixed(1)}% — recommended range is ${handlingMin}–${handlingMax}%` : `Combined: ${importFactorPct.toFixed(1)}% · Admin guide: ${handlingMin}–${handlingMax}%`}</span>
      </div>}
      <div ref={sourcingSheetWrapRef} className="sheet-wrap sourcing-sheet-wrap"><table id="sourcing-spares-grid" className="sheet sourcing-sheet sourcing-sheet--fixed table-fixed w-full border-collapse">
        <thead><tr><th className="w-[20%]">Part</th><th className="w-[10%]">Source</th><th className="w-[5%]">Qty</th><th className="w-[7%]">List unit</th><th className="w-[6%]">Discount %</th><th className="w-[6%]">Markup %</th><th className="w-[10%]">Adjusted Unit Price</th><th className="w-[10%]">Base cost</th><th className="w-[9%]">Original total</th><th className="w-[9%]">Quoted total</th><th className="w-[8%]">Actions</th></tr></thead>
        <tbody>
          {calculatedItems.map(item => { const line = item.sourceLine; const row = { ...item, discountPct: item.discountPercent, markupPct: item.markupPercent, listTotal: item.listTotal, lineTotal: item.lineTotal, cogs: item.lineTotalCogs }; const confirmable = isConfirmableSparesLine(line); const invalidState = row.qty <= 0 ? 'Cannot confirm' : 'Needs pricing'; const partDescription = `${line.pn || 'Manual part'}${line.desc ? ` — ${line.desc}` : ''}`; const removed = !!line.removedFromSourcing; return <tr key={line.id} className={row.qty === 0 ? 'sourcing-zero-row' : ''}>
            <td className="sourcing-cell-part align-top p-2 overflow-hidden"><div className="sourcing-part-line">{comm && (removed ? <button type="button" className="sourcing-restore-row" title="Restore row to active proposal" aria-label={`Restore ${line.pn || line.id}`} onClick={() => restoreLine(line)}>✓</button> : <button type="button" className="sourcing-remove-row sourcing-row-action" title="Remove row from active proposal" aria-label={`Remove ${line.pn || line.id}`} onClick={() => removeLine(line)}><Icon name="x" size={14} /></button>)}<div className="sourcing-part-copy"><div className="sourcing-part-description line-clamp-2 text-xs font-medium text-gray-900 leading-snug" title={partDescription}>{partDescription}</div><small className="hint truncate overflow-hidden text-ellipsis whitespace-nowrap">{line.oem || '—'} · Lead: {line.leadTime || 'TBC'}</small></div></div></td>
            <td className="sourcing-cell-source align-top p-2 overflow-hidden"><div className="sourcing-source-stack">{(() => { const source = sourceDetails(line); const attribution = manualAttribution(line); const sourcePayload = { ...source, pn: line.pn || line.custRef || line.id, priceState: line.priceState || 'Unstated', listPrice: line.listUnitPrice ?? line.listPrice, currency: line.currency || 'INR', addedBy: attribution.addedByName || attribution.addedBy || '', addedAt: attribution.addedAt || '' }; const isCatalogued = source.source === PRICE_SOURCES.LIST && priceListNameFor(line); return <><div className="sourcing-source-primary">{isCatalogued ? <button type="button" className="sourcing-source-link sourcing-source-name" title={`Open ${source.full} in the price list`} aria-label={`Open ${source.full} in the price list`} onClick={() => openPriceList(line)}>{source.primary}</button> : <button type="button" className="sourcing-source-details-link sourcing-source-name" title={`View full source: ${source.full}`} aria-label={`View full source: ${source.full}`} onClick={() => setEvidence(sourcePayload)}>{source.primary}</button>}</div>{source.secondary && <span className="sourcing-source-meta" title={source.full}>{source.secondary}</span>}{line.priceState === 'Expired' ? <><Chip tone="state-Blocks">Expired</Chip><AiBadge label="pricing anomaly" /></> : line.priceState === 'Needs pricing' ? <Chip tone="state-Review">Needs pricing</Chip> : source.source !== PRICE_SOURCES.MANUAL ? <Chip tone="state-Accepted">Current</Chip> : null}</> })()}</div></td>
            <td className="num"><EditableNumber value={row.qty} label={`Quantity for ${line.pn || line.id}`} disabled={!comm} step="1" onChange={value => updateLine(line, 'qty', Math.max(0, Math.round(value)))} /></td>
            <td className="num"><EditableNumber value={Math.round(displayAmount(row.listUnitPriceINR))} label={`List price for ${line.pn || line.id} in ${displayCurrency}`} disabled={!comm} onChange={value => updateLine(line, 'listUnitPrice', convertCurrency(value, displayCurrency, 'INR', costing.currencyRates))} /><small className="hint">{displayCurrency}{line.currency && line.currency !== displayCurrency ? ` · source ${line.currency}` : ''}</small></td>
            <td className="num"><EditableNumber value={Math.round(row.discountPct)} label={`Discount for ${line.pn || line.id}`} disabled={!comm} step="1" onChange={value => updateLine(line, 'discountPct', Math.min(100, Math.max(0, Math.round(value))))} suffix="%" /></td>
            <td className="num"><EditableNumber value={Math.round(row.markupPct)} label={`Markup for ${line.pn || line.id}`} disabled={!comm} step="1" onChange={value => updateLine(line, 'markupPct', normalizeMarkupPct(Math.round(value)))} suffix="%" /></td>
            <td className="num">{comm ? displayMoney(row.adjustedUnitPrice) : <span className="restricted"><Icon name="lock" size={11} /></span>}</td>
            <td className="num"><EditableNumber className={`sourcing-base-cost-input ${line.baseCost == null || n(line.baseCost) <= 0 || row.adjustedUnitPrice < row.baseCost ? 'is-warning' : ''}`} value={Math.round(displayAmount(row.baseCost))} label={`Base cost for ${line.pn || line.id}`} disabled={!comm} onChange={value => store.updateSparesLine(line.id, { baseCost: Math.max(0, convertCurrency(value, displayCurrency, 'INR', costing.currencyRates)) })} /></td>
            <td className="num">{comm ? displayMoney(row.listTotal) : '—'}</td><td className="num"><b>{comm ? displayMoney(row.lineTotal) : '—'}</b></td>
            <td className="sourcing-cell-actions align-top p-2">{comm && <div className="sourcing-row-actions">{line.confirmed && confirmable ? <Chip tone="state-Accepted" title="Sourcing line confirmed"><Icon name="check" size={11} /> CONFIRMED</Chip> : confirmable ? <button type="button" className="primary sourcing-row-action sourcing-row-action--confirm" title="Confirm sourcing line" aria-label={`Confirm ${line.pn || line.id}`} onClick={() => store.updateSparesLine(line.id, { confirmed: true })}><Icon name="check" size={12} /> Confirm</button> : <button type="button" className="sourcing-row-action sourcing-row-action--confirm sourcing-row-action--disabled" disabled title={`${invalidState}: enter a positive ${row.qty <= 0 ? 'quantity' : 'list price'}`} aria-label={`${invalidState} for ${line.pn || line.id}`}><Icon name="lock" size={12} /> {invalidState}</button>}<button type="button" className="sourcing-row-action sourcing-row-action--compare" title="Compare sourcing alternatives" aria-label={`Compare alternatives for ${line.pn || line.id}`} onClick={() => { setCompareFor(line.id); setCompareSearch('') }}><Icon name="gitCompare" size={14} /> Compare</button></div>}</td>
          </tr> })}
          {comm && showAddPart && <tr id="sourcing-manual-line" className="sourcing-manual-row">
            <td><input aria-label="Manual part number" placeholder="Part number" value={newLine.pn} onKeyDown={onNewKeyDown} onChange={e => setNewLine({ ...newLine, pn: e.target.value })} /></td>
            <td><input aria-label="Manual description" placeholder="Description" value={newLine.desc} onKeyDown={onNewKeyDown} onChange={e => setNewLine({ ...newLine, desc: e.target.value })} /></td>
            <td className="num"><input className="sourcing-number sourcing-qty w-full max-w-[60px] px-1 py-0.5 text-xs text-right" aria-label="Manual quantity" type="number" min="0" value={newLine.qty} onKeyDown={onNewKeyDown} onChange={e => setNewLine({ ...newLine, qty: e.target.value })} /></td>
            <td className="num"><input className="sourcing-number w-full max-w-[60px] px-1 py-0.5 text-xs text-right" aria-label="Manual list price" placeholder="List price" type="number" min="0" step="0.01" value={newLine.listPrice} onKeyDown={onNewKeyDown} onChange={e => setNewLine({ ...newLine, listPrice: e.target.value })} /></td>
            <td colSpan="6"><span className="sourcing-helper-text">Press Enter in any field to add a line.</span></td>
            <td><button className="primary sourcing-manual-add" onClick={addManual}><Icon name="plus" size={13} /> Add line</button></td>
          </tr>}
        </tbody>
        {comm && <tfoot className="sourcing-total-row"><tr>
          <td><b>Totals</b></td><td></td><td className="num"><b>{totals.quantity}</b></td><td></td><td></td><td></td><td></td><td></td>
          <td className="num"><b>{displayMoney(totals.originalTotal)}</b></td><td className="num"><b>{displayMoney(totals.revenue)}</b></td><td></td>
        </tr></tfoot>}
      </table></div>
      <div ref={sourcingScrollbarRef} className="sourcing-horizontal-scrollbar" tabIndex="0" role="scrollbar" aria-controls="sourcing-spares-grid" aria-label="Scroll sourcing table horizontally"><div ref={sourcingScrollbarContentRef} /></div>
      {comm && <div className="sourcing-financial-summary-bar mt-3 flex flex-col sm:flex-row items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-3.5 shadow-sm" aria-label="BOQ financial totals" aria-live="polite">
        <div className="sourcing-financial-summary-metrics flex items-center space-x-6 text-xs">
          <div><span>BOQ Revenue</span><strong className="font-semibold text-gray-900">{displayMoney(totals.revenue)}</strong></div>
          <div><span>Projected COGS</span><strong className="font-semibold text-gray-700">{displayMoney(totals.cogs)}</strong></div>
          <div><span>Gross Profit</span><strong className="font-bold text-red-600">{displayMoney(grossProfit)}</strong></div>
          <div><span>Gross Margin</span><strong className={`inline-flex items-center px-2 py-0.5 rounded font-bold bg-red-100 text-red-700 text-xs ${grossMarginPct >= 0 ? 'is-positive' : ''}`}>{grossMarginPct.toFixed(1)}%</strong></div>
          <div className="sourcing-summary-validity"><span>Quote Validity</span><strong>{quoteValidityDays} days</strong></div>
        </div>
        <div className="sourcing-summary-actions ml-auto flex-shrink-0"><button className="primary sourcing-summary-action bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded text-xs transition-colors" disabled={!canContinueToProposal} title={continueTitle} onClick={sendToProposal}><Icon name="arrowRight" size={13} /> Continue to proposal</button></div>
      </div>}
      {!comm && <div className="restricted sourcing-restricted-footer"><Icon name="lock" size={12} /> Totals and margin are restricted — sales owners, approvers and admin only</div>}
      {sent && <div className="okbox">Proposal workbook BoM synchronized from the confirmed sourcing lines. <a style={{ cursor: 'pointer' }} onClick={openBuilder}>Open the proposal builder</a></div>}
    </div>
    {compareFor && (() => {
      const line = lines.find(x => x.id === compareFor)
      if (!line) return null
      const close = () => { setCompareFor(null); setCompareSearch('') }
      const searchResults = searchPriceListParts(line, compareSearch)
      const curated = store.sparesAlternatives.filter(a => a.forPn === line.pn)
      const fromPriceLists = priceListAlternatives(line).filter(a => !curated.some(c => c.pn === a.pn))
      const suggested = [...curated, ...fromPriceLists]
      const renderAlt = a => { const src = altSourceInfo(a); const isAiSuggested = a.suggestedBy === 'AI' || a.conf != null; const reason = a.reason || a.note || 'Configured interchangeability evidence.'; return <div key={a.pn} className="compare-alt-row">
        <div className="compare-alt-info">
          <div className="compare-alt-header">
            <b>{a.pn}</b>
            {isAiSuggested && <AiBadge label="AI suggested" />}
            {a.conf != null && <ConfChip conf={a.conf} thresholds={store.config?.aiThresholds} />}
            {a.priceState === 'Expired' ? <Chip tone="state-Blocks">Expired price</Chip> : <Chip tone="state-Accepted">Current price</Chip>}
            <Chip tone={src.tone}>{src.label}</Chip>
          </div>
          <div className="compare-alt-desc">{a.desc}</div>
          {isAiSuggested && <div className="compare-alt-reason"><b>Why AI suggested this:</b> {reason}</div>}
          {a.note && <span className="hint">{a.note}</span>}
        </div>
        <button className="primary compare-alt-action" onClick={() => useAlternative(line, a)}>Use this</button>
      </div> }
      return <Modal title={`Compare / select alternative — ${line.pn}`} onClose={close} wide>
        <input type="text" placeholder="Search all price lists by part number or description…" value={compareSearch} onChange={e => setCompareSearch(e.target.value)} style={{ width: '100%', marginBottom: 10, padding: '6px 8px' }} autoFocus />
        {compareSearch.trim()
          ? <>{searchResults.map(renderAlt)}{!searchResults.length && <p className="hint">No price-list parts match "{compareSearch}".</p>}</>
          : <>{suggested.map(renderAlt)}{!suggested.length && <p className="hint">No catalogued alternatives or similar price-list parts found for this part — search above, confirm the match, or add a manual line.</p>}</>}
        <div style={{ marginTop: 10, textAlign: 'right' }}><button onClick={close}>Close</button></div>
      </Modal>
    })()}
    {pricePreview && <Modal title="Approved price list preview" className="sourcing-price-preview-modal" onClose={() => setPricePreview(null)}><div className="sourcing-price-preview">{pricePreview.found ? <><div className="sourcing-price-preview-heading"><b>{pricePreview.list}{pricePreview.version ? ` · ${pricePreview.version}` : ''}</b><span className="chip state-Accepted">APPROVED PRICE LIST</span></div>{pricePreview.uploaded && <p className="sourcing-price-preview-published">Published {ddMmmYY(pricePreview.uploaded)}</p>}<div className="sourcing-price-preview-table-wrap"><table className="sourcing-price-preview-table"><thead><tr><th className="pl-sr-no">Sr. No.</th><th>Part number</th><th>Description</th><th>Price ({pricePreview.currency})</th><th>Configurable adders</th></tr></thead><tbody><tr><td className="pl-sr-no"><b>{pricePreview.srNo || '—'}</b></td><td><b>{pricePreview.partNumber}</b></td><td>{pricePreview.description || '—'}</td><td className="num"><b>{fmt(pricePreview.price)}</b></td><td>{pricePreview.adders.length ? pricePreview.adders.map((adder, index) => <div key={`${adder.code || adder.desc || 'adder'}-${index}`}>{adder.code ? `${adder.code} — ` : ''}{adder.desc || 'Unnamed adder'}{adder.price != null ? ` (+${fmt(adder.price)} ${pricePreview.currency})` : ''}</div>) : '—'}</td></tr></tbody></table></div></> : <p className="hint">The approved price-list row for <b>{pricePreview.part}</b> is unavailable in the saved list version.</p>}<div className="sourcing-price-preview-actions"><button onClick={() => setPricePreview(null)}>Close</button></div></div></Modal>}
    {evidence && <Modal title="Evidence — price source" onClose={() => setEvidence(null)}><p style={{ fontSize: 12.5 }}><b>{evidence.pn}</b> uses <b>{evidence.full}</b>.</p><dl className="sourcing-source-evidence"><div><dt>Source type</dt><dd>{evidence.kind}</dd></div><div><dt>Price status</dt><dd>{evidence.priceState}</dd></div>{comm && evidence.listPrice != null && <div><dt>Unit price</dt><dd>{fmt(evidence.listPrice)} {evidence.currency}</dd></div>}{evidence.secondary && <div><dt>Source detail</dt><dd>{evidence.secondary}</dd></div>}{evidence.source === PRICE_SOURCES.MANUAL && <div><dt>Added by</dt><dd>{evidence.addedBy || 'Existing manual entry'}</dd></div>}{evidence.source === PRICE_SOURCES.MANUAL && <div><dt>Added on</dt><dd>{evidence.addedAt ? ddMmmYY(evidence.addedAt.slice(0, 10)) : 'Not recorded'}</dd></div>}</dl><p className="hint">Row-level evidence is simulated in this demo — the production system links the exact price-list row.</p><div style={{ textAlign: 'right' }}><button onClick={() => setEvidence(null)}>Close</button></div></Modal>}
  </div>
}

function EditableNumber({ value, label, disabled, onChange, suffix = '', className = '', step = '0.01' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value ?? 0))

  const begin = event => {
    if (disabled) return
    setDraft(String(value ?? 0))
    setEditing(true)
    window.requestAnimationFrame(() => event.currentTarget?.querySelector('input')?.focus())
  }
  const commit = () => {
    if (!editing) return
    setEditing(false)
    onChange(n(draft))
  }
  const cancel = () => { setDraft(String(value ?? 0)); setEditing(false) }

  return <span className={`sourcing-edit-number ${className}`.trim()}>{editing ? <input className="sourcing-number sourcing-edit-input w-full max-w-[60px] px-1 py-0.5 text-xs text-right" style={{ width: `${Math.max(3, String(draft ?? '').length + 1)}ch`, maxWidth: 'none' }} aria-label={label} type="text" inputMode={step === '1' ? 'numeric' : 'decimal'} value={draft} autoFocus onFocus={event => { if (n(value) === 0) event.currentTarget.select() }} onChange={event => setDraft(step === '1' ? event.target.value.replace(/\D/g, '') : event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit() } if (event.key === 'Escape') { event.preventDefault(); cancel() } }} /> : <button type="button" className="sourcing-read-value" aria-label={`${label}; click to edit`} disabled={disabled} onClick={begin}>{value}</button>}{suffix && <small>{suffix}</small>}</span>
}
