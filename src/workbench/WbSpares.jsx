import React, { useMemo, useState } from 'react'
import { isPlaceholderSparesLine, useStore } from '../store.jsx'
import { defaultCosting } from '../seed.js'
import { canPriceProposal, unitCostINR, fmt } from '../utils.js'
import { Chip, ConfChip, AiBadge, Modal } from '../ui.jsx'
import { Icon } from '../icons.jsx'

const n = value => Number.isFinite(Number(value)) ? Number(value) : 0
const money = value => `₹ ${fmt(n(value))}`

export default function WbSpares({ opp, openBuilder }) {
  const store = useStore()
  const comm = canPriceProposal(store.role)
  const lines = store.sparesLines.filter(l => l.oppId === opp.id && !isPlaceholderSparesLine(l))
  const proposal = store.getProposal(opp.id)
  const [compareFor, setCompareFor] = useState(null)
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
  const activeItems = calculatedItems.filter(item => item.qty > 0 && item.confirmed)
  const totals = useMemo(() => activeItems.reduce((total, item) => ({
    revenue: total.revenue + item.lineTotal,
    cogs: total.cogs + item.lineTotalCogs,
    originalTotal: total.originalTotal + item.listTotal,
    quantity: total.quantity + item.qty,
  }), { revenue: 0, cogs: 0, originalTotal: 0, quantity: 0 }), [activeItems])
  const grossProfit = totals.revenue - totals.cogs
  const grossMarginPct = totals.revenue > 0 ? grossProfit / totals.revenue * 100 : 0
  const proposalOnlyMismatch = !lines.length && (proposal.bom || []).length > 0
  const expiredLines = lines.filter(l => l.priceState === 'Expired')
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
  const sourceLabel = line => `${line.priceSourceName || line.priceList || 'Unpriced'}${line.priceSourceVersion ? ` ${line.priceSourceVersion}` : ''}`

  const useAlternative = (line, alt) => {
    let priced = null
    for (const [name, pl] of Object.entries(store.priceLists || {})) {
      const row = (pl.parts || []).find(p => p.pn === alt.pn)
      if (row) { priced = { listPrice: row.price, listUnitPrice: row.price, currency: pl.currency, priceList: `${name} ${pl.version}` }; break }
    }
    store.updateSparesLine(line.id, { pn: alt.pn, desc: alt.desc, confirmed: true, ...(priced || {}), priceState: priced ? (alt.priceState || 'Current') : 'Expired' })
    setCompareFor(null)
  }
  const sendToProposal = () => { if (!activeItems.length) return; store.sendLinesToProposal(opp.id); setSent(true) }
  const downloadBoqDraft = () => {
    const previousTitle = document.title
    document.title = `${opp.id}_BOQ_Draft`
    window.print()
    window.setTimeout(() => { document.title = previousTitle }, 1000)
  }

  return <div className="sourcing-workbench">
    <div className="section-title">Spares workbench — part matching ({lines.length} line{lines.length === 1 ? '' : 's'})</div>
    {clarifications.length > 0 && <div className="okbox customer-information-banner sourcing-clarification-context"><b>Confirmed customer information</b><span className="hint"> These answers stay attached to the opportunity and should be checked while validating each line.</span>{clarifications.map(c => <div key={c.id} className="sourcing-clarification-row"><b>{c.category || 'Clarification'}:</b> {c.response}<span className="hint"> · {c.answerSource || 'Customer'}{c.answeredAt ? ` · ${c.answeredAt}` : ''}</span></div>)}</div>}
    {!!expiredLines.length && <div className="warnbox spares-price-warning"><b>{expiredLines.length} price source{expiredLines.length === 1 ? '' : 's'} expired.</b>{' '}Use <b>Refresh</b> in the Actions column, or apply a current manufacturer quote only when the approved price list cannot be used.</div>}
    {proposalOnlyMismatch && <div className="warnbox sourcing-flow-warning"><b>Proposal data is not linked to Sourcing.</b> Existing proposal rows are not imported automatically. Add or import the real parts here before continuing to Proposal.</div>}
    <div className="sourcing-table-card">
      <div className="sourcing-table-heading"><div><b>Source, adjust and validate each line here</b><span className="hint"> Price-list values are loaded first; vendor values are the fallback.</span></div><div className="sourcing-table-heading-actions">{comm && <button type="button" className="sourcing-add-part-link" aria-expanded={showAddPart} aria-controls="sourcing-manual-line" onClick={() => setShowAddPart(open => !open)}>{showAddPart ? 'Close manual line' : 'Add manual line'}</button>}{!comm && <span className="restricted"><Icon name="lock" size={12} /> Pricing restricted</span>}</div></div>
      <div className="sheet-wrap sourcing-sheet-wrap"><table className="sheet sourcing-sheet sourcing-sheet--fixed table-fixed w-full border-collapse">
        <thead><tr><th className="w-[36%]">Part / customer reference</th><th className="w-[10%]">Source</th><th className="w-[5%]">Qty</th><th className="w-[7%]">List unit</th><th className="w-[5%]">Discount %</th><th className="w-[5%]">Markup %</th><th className="w-[8%]">Adjusted U</th><th className="w-[8%]">Base cost</th><th className="w-[8%]">Original total</th><th className="w-[8%]">Quoted total</th></tr></thead>
        <tbody>
          {calculatedItems.map(item => { const line = item.sourceLine; const row = { ...item, discountPct: item.discountPercent, markupPct: item.markupPercent, listTotal: item.listTotal, lineTotal: item.lineTotal, cogs: item.lineTotalCogs }; const partDescription = `${line.pn || 'Manual part'}${line.desc ? ` — ${line.desc}` : ''}`; return <tr key={line.id} className={row.qty === 0 ? 'sourcing-zero-row' : ''}>
            <td className="sourcing-cell-part align-top p-2 overflow-hidden"><div className="sourcing-part-line"><div className="sourcing-part-copy"><span className="hint sourcing-part-ref truncate overflow-hidden text-ellipsis whitespace-nowrap">{line.custRef}</span><div className="sourcing-part-description line-clamp-2 text-xs font-medium text-gray-900 leading-snug" title={partDescription}>{partDescription}</div><small className="hint truncate overflow-hidden text-ellipsis whitespace-nowrap">{line.oem || '—'} · Lead: {line.leadTime || 'TBC'}</small></div>{comm && <button className="sourcing-remove-row" title="Remove row from active proposal" aria-label={`Remove ${line.pn || line.id}`} onClick={() => updateLine(line, 'qty', 0)}>×</button>}</div></td>
            <td className="sourcing-cell-source align-top p-2 overflow-hidden"><div className="sourcing-source-stack"><span className="sourcing-source-name truncate overflow-hidden text-ellipsis whitespace-nowrap">{sourceLabel(line)}</span>{line.priceSource === 'vendor-quote' && <Chip tone="state-Review">Vendor fallback</Chip>}{line.priceSource === 'manual' && <Chip tone="grey">Manual/override</Chip>}{line.priceState === 'Expired' ? <><Chip tone="state-Blocks">Expired</Chip><AiBadge label="pricing anomaly" /></> : <Chip tone="state-Accepted">Current</Chip>}</div></td>
            <td className="num"><EditableNumber value={row.qty} label={`Quantity for ${line.pn || line.id}`} disabled={!comm} step="1" onChange={value => updateLine(line, 'qty', Math.max(0, Math.round(value)))} /></td>
            <td className="num"><EditableNumber value={row.listUnitPrice} label={`List price for ${line.pn || line.id}`} disabled={!comm} onChange={value => updateLine(line, 'listUnitPrice', value)} /></td>
            <td className="num"><EditableNumber value={Math.round(row.discountPct)} label={`Discount for ${line.pn || line.id}`} disabled={!comm} step="1" onChange={value => updateLine(line, 'discountPct', Math.min(100, Math.max(0, Math.round(value))))} suffix="%" /></td>
            <td className="num"><EditableNumber value={Math.round(row.markupPct)} label={`Markup for ${line.pn || line.id}`} disabled={!comm} step="1" onChange={value => updateLine(line, 'markupPct', Math.max(0, Math.round(value)))} suffix="%" /></td>
            <td className="num">{comm ? money(row.adjustedUnitPrice) : <span className="restricted"><Icon name="lock" size={11} /></span>}</td>
            <td className="num"><EditableNumber className={`sourcing-base-cost-input ${line.baseCost == null || n(line.baseCost) <= 0 || row.adjustedUnitPrice < row.baseCost ? 'is-warning' : ''}`} value={row.baseCost} label={`Base cost for ${line.pn || line.id}`} disabled={!comm} onChange={value => updateLine(line, 'baseCost', Math.max(0, value))} /></td>
            <td className="num">{comm ? money(row.listTotal) : '—'}</td><td className="num"><b>{comm ? money(row.lineTotal) : '—'}</b></td>
          </tr> })}
          {comm && showAddPart && <tr id="sourcing-manual-line" className="sourcing-manual-row">
            <td><input aria-label="Manual part number" placeholder="Part number" value={newLine.pn} onKeyDown={onNewKeyDown} onChange={e => setNewLine({ ...newLine, pn: e.target.value })} /></td>
            <td><input aria-label="Manual description" placeholder="Description" value={newLine.desc} onKeyDown={onNewKeyDown} onChange={e => setNewLine({ ...newLine, desc: e.target.value })} /></td>
            <td className="num"><input className="sourcing-number sourcing-qty w-full max-w-[60px] px-1 py-0.5 text-xs text-right" aria-label="Manual quantity" type="number" min="0" value={newLine.qty} onKeyDown={onNewKeyDown} onChange={e => setNewLine({ ...newLine, qty: e.target.value })} /></td>
            <td className="num"><input className="sourcing-number w-full max-w-[60px] px-1 py-0.5 text-xs text-right" aria-label="Manual list price" placeholder="List price" type="number" min="0" step="0.01" value={newLine.listPrice} onKeyDown={onNewKeyDown} onChange={e => setNewLine({ ...newLine, listPrice: e.target.value })} /></td>
            <td colSpan="5"><span className="sourcing-helper-text">Press Enter in any field to add a line.</span></td>
            <td><button className="primary sourcing-manual-add" onClick={addManual}><Icon name="plus" size={13} /> Add line</button></td>
          </tr>}
        </tbody>
        {comm && <tfoot className="sourcing-total-row"><tr>
          <td><b>Totals</b></td><td></td><td className="num"><b>{totals.quantity}</b></td><td></td><td></td><td></td><td></td><td></td>
          <td className="num"><b>{money(totals.originalTotal)}</b></td><td className="num"><b>{money(totals.revenue)}</b></td>
        </tr></tfoot>}
      </table></div>
      {comm && <div className="sourcing-financial-summary-bar mt-3 flex flex-col sm:flex-row items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-3.5 shadow-sm" aria-label="BOQ financial totals" aria-live="polite">
        <div className="sourcing-financial-summary-metrics flex items-center space-x-6 text-xs">
          <div><span>BOQ Revenue</span><strong className="font-semibold text-gray-900">{money(totals.revenue)}</strong></div>
          <div><span>Projected COGS</span><strong className="font-semibold text-gray-700">{money(totals.cogs)}</strong></div>
          <div><span>Gross Profit</span><strong className="font-bold text-red-600">{money(grossProfit)}</strong></div>
          <div><span>Gross Margin</span><strong className={`inline-flex items-center px-2 py-0.5 rounded font-bold bg-red-100 text-red-700 text-xs ${grossMarginPct >= 0 ? 'is-positive' : ''}`}>{grossMarginPct.toFixed(1)}%</strong></div>
          <div className="sourcing-summary-validity"><span>Quote Validity</span><strong>{quoteValidityDays} days</strong><small>Managed in Admin</small></div>
        </div>
        <div className="sourcing-summary-actions ml-auto flex-shrink-0"><button className="btn-secondary sourcing-summary-download" onClick={downloadBoqDraft}><Icon name="download" size={13} /> Download BOQ Draft (PDF)</button><button className="primary sourcing-summary-action bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded text-xs transition-colors" disabled={!activeItems.length} title={!activeItems.length ? 'Add or confirm at least one sourcing line first' : ''} onClick={sendToProposal}><Icon name="arrowRight" size={13} /> Continue to proposal</button></div>
      </div>}
      {!comm && <div className="restricted sourcing-restricted-footer"><Icon name="lock" size={12} /> Totals and margin are restricted — sales owners, approvers and admin only</div>}
      {sent && <div className="okbox">Proposal workbook BoM synchronized from the confirmed sourcing lines. <a style={{ cursor: 'pointer' }} onClick={openBuilder}>Open the proposal builder</a></div>}
    </div>
    {compareFor && (() => { const line = lines.find(x => x.id === compareFor); if (!line) return null; const alts = store.sparesAlternatives.filter(a => a.forPn === line.pn); return <Modal title={`Compare / select alternative — ${line.pn}`} onClose={() => setCompareFor(null)} wide>{alts.map((a, i) => <div key={i} className="check-row"><b>{a.pn}</b><span>{a.desc}</span><ConfChip conf={a.conf} thresholds={store.config?.aiThresholds} />{a.priceState === 'Expired' ? <Chip tone="state-Blocks">Expired price</Chip> : <Chip tone="state-Accepted">Current price</Chip>}<span className="hint">{a.note}</span><span style={{ marginLeft: 'auto' }}><button className="primary" onClick={() => useAlternative(line, a)}>Use this</button></span></div>)}{!alts.length && <p className="hint">No catalogued alternatives for this part — confirm the match or add a manual line.</p>}<div style={{ marginTop: 10, textAlign: 'right' }}><button onClick={() => setCompareFor(null)}>Close</button></div></Modal> })()}
    {evidence && <Modal title="Evidence — price source" onClose={() => setEvidence(null)}><p style={{ fontSize: 12.5 }}><b>{evidence.pn}</b> priced from <b>{evidence.priceList}</b> ({evidence.priceState}), {comm ? <span>{fmt(evidence.listPrice)} {evidence.currency} list. </span> : <span className="restricted"><Icon name="lock" size={11} /> list price restricted. </span>}Row-level evidence is simulated in this demo — the production system links the exact price-list row.</p><div style={{ textAlign: 'right' }}><button onClick={() => setEvidence(null)}>Close</button></div></Modal>}
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
