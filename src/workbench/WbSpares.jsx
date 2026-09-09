import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isPlaceholderSparesLine, useStore } from '../store.jsx'
import { defaultCosting } from '../seed.js'
import { canPriceProposal, unitCostINR, fmt } from '../utils.js'
import { pricingThresholdExceptions } from '../gates.js'
import { Chip, ConfChip, AiBadge, Modal } from '../ui.jsx'
import { Icon } from '../icons.jsx'
import { PRICE_SOURCES, formatPriceSource, resolvePriceSource } from '../pricing.js'

const n = value => Number.isFinite(Number(value)) ? Number(value) : 0
const money = value => `₹ ${fmt(n(value))}`

export default function WbSpares({ opp, openBuilder }) {
  const store = useStore()
  const navigate = useNavigate()
  const comm = canPriceProposal(store.role)
  const lines = store.sparesLines.filter(l => l.oppId === opp.id && !isPlaceholderSparesLine(l))
  const proposal = store.getProposal(opp.id)
  const [compareFor, setCompareFor] = useState(null)
  const [compareSearch, setCompareSearch] = useState('')
  const [evidence, setEvidence] = useState(null)
  const [sent, setSent] = useState(false)
  const [showAddPart, setShowAddPart] = useState(false)
  const [newLine, setNewLine] = useState({ pn: '', desc: '', qty: '1', listPrice: '' })
  const quoteValidityDays = Math.max(1, n(store.config?.proposalValidityDays ?? 30))

  const isBnk = line => String(line.priceList || '').startsWith('BNK')
  const fallbackBaseCost = line => unitCostINR(n(line.listUnitPrice ?? line.listPrice), { ...defaultCosting, ...(proposal.costing || {}) }, line.currency || 'INR', isBnk(line))
  const values = line => {
    const qty = Math.max(0, n(line.qty))
    const listUnitPrice = n(line.listUnitPrice ?? line.listPrice)
    const discountPct = Math.max(0, Math.min(100, n(line.discountPct)))
    const markupPct = Math.max(0, n(line.markupPct))
    const adjustedUnitPrice = listUnitPrice * (1 - discountPct / 100) * (1 + markupPct / 100)
    const baseCost = line.baseCost == null ? fallbackBaseCost(line) : Math.max(0, n(line.baseCost))
    return { qty, listUnitPrice, discountPct, markupPct, adjustedUnitPrice, baseCost, listTotal: listUnitPrice * qty, lineTotal: adjustedUnitPrice * qty, cogs: baseCost * qty }
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
      discountPercent: row.discountPct,
      markupPercent: row.markupPct,
      baseCost: row.baseCost,
      confirmed: !!line.confirmed,
      sourceLine: line,
    }
  }), [lines, proposal])
  const calculatedItems = useMemo(() => lineItems.map(item => {
    const listTotal = item.qty * item.listUnitPrice
    const adjustedUnitPrice = item.listUnitPrice
      * (1 - item.discountPercent / 100)
      * (1 + item.markupPercent / 100)
    const lineTotal = item.qty * adjustedUnitPrice
    const lineTotalCogs = item.qty * item.baseCost
    return { ...item, listTotal, adjustedUnitPrice, lineTotal, lineTotalCogs, lineProfit: lineTotal - lineTotalCogs }
  }), [lineItems])
  const pricedItems = calculatedItems.filter(item => item.qty > 0 && item.listUnitPrice > 0)
  const activeItems = calculatedItems.filter(item => item.qty > 0 && item.confirmed)
  const pendingConfirmationCount = pricedItems.filter(item => !item.confirmed).length
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
  const pricingExceptions = pricingThresholdExceptions(opp, proposal, store)
  const clarifications = (store.clarifications || []).filter(c => c.oppId === opp.id && c.status === 'Answered')

  const updateLine = (line, field, value) => {
    if (!comm) return
    const patch = { [field]: value }
    if (field === 'listUnitPrice') {
      patch.listPrice = value
      // Manual values are entered in the INR-denominated table. Rebuild the
      // cost basis as INR too, rather than retaining the old EUR/USD/BNK cost
      // from the previous source row.
      patch.currency = 'INR'
      patch.baseCost = unitCostINR(value, { ...defaultCosting, ...(proposal.costing || {}) }, 'INR', false)
      patch.priceSource = 'manual'
      patch.priceSourceName = 'Manual override'
      patch.priceList = 'Manual override'
      patch.priceState = 'Current'
    }
    store.updateSparesLine(line.id, patch)
  }

  const addManual = () => {
    if (!newLine.pn.trim() && !newLine.desc.trim()) return
    const price = Math.max(0, n(newLine.listPrice))
    store.addSparesLine(opp.id, { origin: 'manual', custRef: newLine.pn.trim() || newLine.desc.trim(), pn: newLine.pn.trim(), desc: newLine.desc.trim(), qty: Math.max(0, n(newLine.qty)), confirmed: true, listPrice: price, listUnitPrice: price, baseCost: price, currency: 'INR', priceList: 'Manual entry', priceSource: 'manual', priceState: 'Current', oem: 'Manual', leadTime: 'TBC' })
    setNewLine({ pn: '', desc: '', qty: '1', listPrice: '' })
    setShowAddPart(false)
  }
  const onNewKeyDown = event => { if (event.key === 'Enter') { event.preventDefault(); addManual() } }
  const sourceDetails = line => formatPriceSource(line)
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
    navigate(`/pricelists?list=${encodeURIComponent(list)}&part=${encodeURIComponent(part)}`)
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
  const searchPriceListParts = (line, query) => {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return []
    return allPriceListParts()
      .filter(part => part.pn !== line.pn && (part.pn.toLowerCase().includes(q) || String(part.desc || '').toLowerCase().includes(q)))
      .slice(0, 20)
      .map(part => ({
        forPn: line.pn, pn: part.pn, desc: part.desc, conf: null,
        note: `${part.list} ${part.version} price list · ₹${fmt(part.price)}`,
        priceState: 'Current',
      }))
  }
  const priceListAlternatives = line => {
    const allParts = allPriceListParts()
    const target = new Set(wordsOf(line.desc))
    const family = familyOf(line.pn)
    const toAlt = (part, conf, note) => ({
      forPn: line.pn, pn: part.pn, desc: part.desc, conf,
      note: note || `${part.list} ${part.version} price list · ₹${fmt(part.price)}`,
      priceState: 'Current',
    })
    const results = []
    // Exact part-number match — same part sitting in the current price list,
    // offered so a manually-priced line can be refreshed to the list price.
    const exact = allParts.find(part => part.pn === line.pn)
    if (exact) results.push(toAlt(exact, 100, `Same part in ${exact.list} ${exact.version} — refresh to list price ₹${fmt(exact.price)}`))
    // Description overlap — catches genuine substitutes with different part numbers.
    allParts.filter(part => part.pn !== line.pn).forEach(part => {
      const partWords = wordsOf(part.desc)
      const overlap = partWords.filter(w => target.has(w)).length
      const score = target.size ? overlap / Math.max(target.size, partWords.length || 1) : 0
      if (score > 0.25) results.push(toAlt(part, Math.round(Math.min(95, score * 100))))
    })
    // Same part-number family (e.g. "DS821.*") — related accessories/variants worth reviewing.
    if (family) {
      allParts.filter(part => part.pn !== line.pn && familyOf(part.pn) === family
        && !results.some(r => r.pn === part.pn)).forEach(part => results.push(toAlt(part, 55)))
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
    store.updateSparesLine(line.id, { pn: alt.pn, desc: alt.desc, confirmed: true, ...(priced || {}), priceState: priced ? (alt.priceState || 'Current') : 'Needs pricing' })
    setCompareFor(null)
    setCompareSearch('')
  }
  const sendToProposal = () => { if (!activeItems.length) return; store.sendLinesToProposal(opp.id); setSent(true) }

  return <div className="sourcing-workbench">
    <div className="section-title">Spares workbench — part matching ({lines.length} line{lines.length === 1 ? '' : 's'})</div>
    {clarifications.length > 0 && <div className="okbox customer-information-banner sourcing-clarification-context"><b>Confirmed customer information</b><span className="hint"> These answers stay attached to the opportunity and should be checked while validating each line.</span>{clarifications.map(c => <div key={c.id} className="sourcing-clarification-row"><b>{c.category || 'Clarification'}:</b> {c.response}<span className="hint"> · {c.answerSource || 'Customer'}{c.answeredAt ? ` · ${c.answeredAt}` : ''}</span></div>)}</div>}
    {!!expiredLines.length && <div className="warnbox spares-price-warning"><b>{expiredLines.length} price source{expiredLines.length === 1 ? '' : 's'} expired.</b>{' '}Use <b>Compare</b> in the Actions column to select a current price-list part, or apply a current manufacturer quote only when the approved price list cannot be used.</div>}
    {!!needsPricingLines.length && <div className="warnbox spares-price-warning"><b>{needsPricingLines.length} line{needsPricingLines.length === 1 ? '' : 's'} need pricing.</b>{' '}Use <b>Compare</b> to select a current price-list part, apply a manufacturer quote, or enter a manual price before continuing.</div>}
    {!!pricingExceptions.rows.length && <div className="warnbox" role="status"><b>Pricing approval required.</b>{' '}A discount above {pricingExceptions.discountPct}% or markup above {pricingExceptions.markupPct}% needs one approval from AH or LJS before Proposal.</div>}
    {proposalOnlyMismatch && <div className="warnbox sourcing-flow-warning"><b>Proposal data is not linked to Sourcing.</b> Existing proposal rows are not imported automatically. Add or import the real parts here before continuing to Proposal.</div>}
    <div className="sourcing-table-card">
      <div className="sourcing-table-heading"><div><b>Source, adjust and validate each line here</b><span className="hint"> Price-list values are loaded first; vendor values are the fallback.</span></div><div className="sourcing-table-heading-actions">{comm && <button type="button" className="sourcing-add-part-link" aria-expanded={showAddPart} aria-controls="sourcing-manual-line" onClick={() => setShowAddPart(open => !open)}>{showAddPart ? 'Close manual line' : 'Add manual line'}</button>}{!comm && <span className="restricted"><Icon name="lock" size={12} /> Pricing restricted</span>}</div></div>
      <div className="sheet-wrap sourcing-sheet-wrap"><table className="sheet sourcing-sheet sourcing-sheet--fixed table-fixed w-full border-collapse">
        <thead><tr><th className="w-[30%]">Part / customer reference</th><th className="w-[9%]">Source</th><th className="w-[5%]">Qty</th><th className="w-[6%]">List unit</th><th className="w-[5%]">Discount %</th><th className="w-[5%]">Markup %</th><th className="w-[7%]">Adjusted U</th><th className="w-[7%]">Base cost</th><th className="w-[7%]">Original total</th><th className="w-[7%]">Quoted total</th><th className="w-[12%]">Actions</th></tr></thead>
        <tbody>
          {calculatedItems.map(item => { const line = item.sourceLine; const row = { ...item, discountPct: item.discountPercent, markupPct: item.markupPercent, listTotal: item.listTotal, lineTotal: item.lineTotal, cogs: item.lineTotalCogs }; const partDescription = `${line.pn || 'Manual part'}${line.desc ? ` — ${line.desc}` : ''}`; return <tr key={line.id} className={row.qty === 0 ? 'sourcing-zero-row' : ''}>
            <td className="sourcing-cell-part align-top p-2 overflow-hidden"><div className="sourcing-part-line"><div className="sourcing-part-copy"><span className="hint sourcing-part-ref truncate overflow-hidden text-ellipsis whitespace-nowrap">{line.custRef}</span><div className="sourcing-part-description line-clamp-2 text-xs font-medium text-gray-900 leading-snug" title={partDescription}>{partDescription}</div><small className="hint truncate overflow-hidden text-ellipsis whitespace-nowrap">{line.oem || '—'} · Lead: {line.leadTime || 'TBC'}</small></div>{comm && <button className="sourcing-remove-row" title="Remove row from active proposal" aria-label={`Remove ${line.pn || line.id}`} onClick={() => updateLine(line, 'qty', 0)}>×</button>}</div></td>
            <td className="sourcing-cell-source align-top p-2 overflow-hidden"><div className="sourcing-source-stack">{(() => { const source = sourceDetails(line); const sourcePayload = { ...source, pn: line.pn || line.custRef || line.id, priceState: line.priceState || 'Unstated', listPrice: line.listUnitPrice ?? line.listPrice, currency: line.currency || 'INR' }; const isCatalogued = source.source === PRICE_SOURCES.LIST && priceListNameFor(line); return <><div className="sourcing-source-primary">{isCatalogued ? <button type="button" className="sourcing-source-link sourcing-source-name" title={`Open ${source.full} in the price list`} aria-label={`Open ${source.full} in the price list`} onClick={() => openPriceList(line)}>{source.primary}</button> : <button type="button" className="sourcing-source-details-link sourcing-source-name" title={`View full source: ${source.full}`} aria-label={`View full source: ${source.full}`} onClick={() => setEvidence(sourcePayload)}>{source.primary}</button>}</div>{source.secondary && <span className="sourcing-source-meta" title={source.full}>{source.secondary}</span>}{line.priceSource === 'vendor-quote' && <Chip tone="state-Review">Vendor fallback</Chip>}{line.priceSource === 'manual' && <Chip tone="grey">Manual/override</Chip>}{line.priceState === 'Expired' ? <><Chip tone="state-Blocks">Expired</Chip><AiBadge label="pricing anomaly" /></> : line.priceState === 'Needs pricing' ? <Chip tone="state-Review">Needs pricing</Chip> : <Chip tone="state-Accepted">Current</Chip>}</> })()}</div></td>
            <td className="num"><EditableNumber value={row.qty} label={`Quantity for ${line.pn || line.id}`} disabled={!comm} step="1" onChange={value => updateLine(line, 'qty', Math.max(0, Math.round(value)))} /></td>
            <td className="num"><EditableNumber value={row.listUnitPrice} label={`List price for ${line.pn || line.id}`} disabled={!comm} onChange={value => updateLine(line, 'listUnitPrice', value)} /></td>
            <td className="num"><EditableNumber value={Math.round(row.discountPct)} label={`Discount for ${line.pn || line.id}`} disabled={!comm} step="1" onChange={value => updateLine(line, 'discountPct', Math.min(100, Math.max(0, Math.round(value))))} suffix="%" /></td>
            <td className="num"><EditableNumber value={Math.round(row.markupPct)} label={`Markup for ${line.pn || line.id}`} disabled={!comm} step="1" onChange={value => updateLine(line, 'markupPct', Math.max(0, Math.round(value)))} suffix="%" /></td>
            <td className="num">{comm ? money(row.adjustedUnitPrice) : <span className="restricted"><Icon name="lock" size={11} /></span>}</td>
            <td className="num"><EditableNumber className={`sourcing-base-cost-input ${line.baseCost == null || n(line.baseCost) <= 0 || row.adjustedUnitPrice < row.baseCost ? 'is-warning' : ''}`} value={row.baseCost} label={`Base cost for ${line.pn || line.id}`} disabled={!comm} onChange={value => updateLine(line, 'baseCost', Math.max(0, value))} /></td>
            <td className="num">{comm ? money(row.listTotal) : '—'}</td><td className="num"><b>{comm ? money(row.lineTotal) : '—'}</b></td>
            <td className="sourcing-cell-actions align-top p-2">{comm && <div className="sourcing-row-actions" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{!line.confirmed && <button className="primary" onClick={() => store.updateSparesLine(line.id, { confirmed: true })}><Icon name="check" size={12} /> Confirm</button>}{line.confirmed && <Chip tone="state-Accepted">Confirmed</Chip>}<button onClick={() => { setCompareFor(line.id); setCompareSearch('') }}><Icon name="gitCompare" size={12} /> Compare</button></div>}</td>
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
          <td className="num"><b>{money(totals.originalTotal)}</b></td><td className="num"><b>{money(totals.revenue)}</b></td><td></td>
        </tr></tfoot>}
      </table></div>
      {comm && <div className="sourcing-financial-summary-bar mt-3 flex flex-col sm:flex-row items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-3.5 shadow-sm" aria-label="BOQ financial totals" aria-live="polite">
        <div className="sourcing-financial-summary-metrics flex items-center space-x-6 text-xs">
          <div><span>BOQ Revenue</span><strong className="font-semibold text-gray-900">{money(totals.revenue)}</strong></div>
          <div><span>Projected COGS</span><strong className="font-semibold text-gray-700">{money(totals.cogs)}</strong></div>
          <div><span>Gross Profit</span><strong className="font-bold text-red-600">{money(grossProfit)}</strong></div>
          <div><span>Gross Margin</span><strong className={`inline-flex items-center px-2 py-0.5 rounded font-bold bg-red-100 text-red-700 text-xs ${grossMarginPct >= 0 ? 'is-positive' : ''}`}>{grossMarginPct.toFixed(1)}%</strong></div>
          <div className="sourcing-summary-validity"><span>Quote Validity</span><strong>{quoteValidityDays} days</strong></div>
          {pendingConfirmationCount > 0 && <div className="sourcing-summary-note"><span>Preview includes {pendingConfirmationCount} priced line{pendingConfirmationCount === 1 ? '' : 's'} pending confirmation</span></div>}
        </div>
        <div className="sourcing-summary-actions ml-auto flex-shrink-0"><button className="primary sourcing-summary-action bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded text-xs transition-colors" disabled={!activeItems.length} title={!activeItems.length ? 'Add or confirm at least one sourcing line first' : ''} onClick={sendToProposal}><Icon name="arrowRight" size={13} /> Continue to proposal</button></div>
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
      const renderAlt = a => { const src = altSourceInfo(a); return <div key={a.pn} className="compare-alt-row">
        <div className="compare-alt-info">
          <div className="compare-alt-header">
            <b>{a.pn}</b>
            {a.conf != null && <ConfChip conf={a.conf} thresholds={store.config?.aiThresholds} />}
            {a.priceState === 'Expired' ? <Chip tone="state-Blocks">Expired price</Chip> : <Chip tone="state-Accepted">Current price</Chip>}
            <Chip tone={src.tone}>{src.label}</Chip>
          </div>
          <div className="compare-alt-desc">{a.desc}</div>
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
    {evidence && <Modal title="Evidence — price source" onClose={() => setEvidence(null)}><p style={{ fontSize: 12.5 }}><b>{evidence.pn}</b> uses <b>{evidence.full}</b>.</p><dl className="sourcing-source-evidence"><div><dt>Source type</dt><dd>{evidence.kind}</dd></div><div><dt>Price status</dt><dd>{evidence.priceState}</dd></div>{comm && evidence.listPrice != null && <div><dt>Unit price</dt><dd>{fmt(evidence.listPrice)} {evidence.currency}</dd></div>}{evidence.secondary && <div><dt>Source detail</dt><dd>{evidence.secondary}</dd></div>}</dl><p className="hint">Row-level evidence is simulated in this demo — the production system links the exact price-list row.</p><div style={{ textAlign: 'right' }}><button onClick={() => setEvidence(null)}>Close</button></div></Modal>}
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

  return <span className={`sourcing-edit-number ${className}`.trim()}>{editing ? <input className="sourcing-number w-full max-w-[60px] px-1 py-0.5 text-xs text-right" aria-label={label} type="number" min="0" step={step} value={draft} autoFocus onFocus={event => { if (n(value) === 0) event.currentTarget.select() }} onChange={event => setDraft(step === '1' ? event.target.value.replace(/\D/g, '') : event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit() } if (event.key === 'Escape') { event.preventDefault(); cancel() } }} /> : <button type="button" className="sourcing-read-value" aria-label={`${label}; click to edit`} disabled={disabled} onClick={begin}>{value}</button>}{suffix && <small>{suffix}</small>}</span>
}
