import React, { useEffect, useRef, useState } from 'react'
import { Icon } from '../icons.jsx'
import { sparesLineFinancials } from '../pricing.js'
import { buildSparesBatchReview, sparesBatchTotals, sparesMobileStatus } from './mobileSpares.js'

const MODES = { qty: 'Quantity', supplier: 'Supplier unit cost', customer: 'Customer unit price' }
const readDraft = key => {
  try { return JSON.parse(sessionStorage.getItem(key)) || {} } catch { return {} }
}

export default function PhonePartsWorkspace({ task, oppId, userId, lines, costing, basis, canPrice, canEdit, displayCurrency, formatMoney, formatDraft, sourceDetails, onEdit, onCompare, onSource, onRestore, onApply, onRetrySync, syncStatus, saveStatus, localOnly, canContinue, continueReason, onContinue, actor }) {
  const storageKey = `wintrack-modae-phone-spares-${userId || 'local'}-${oppId}`
  const [initial] = useState(() => readDraft(storageKey))
  const [mode, setMode] = useState(() => MODES[initial.mode] ? initial.mode : 'browse')
  const [drafts, setDrafts] = useState(initial.drafts || {})
  const [baselines, setBaselines] = useState(initial.baselines || {})
  const [draftCurrency, setDraftCurrency] = useState(initial.currency || displayCurrency)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState([])
  const [selecting, setSelecting] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [visibleCount, setVisibleCount] = useState(20)
  const [markup, setMarkup] = useState('')
  const [discount, setDiscount] = useState('')
  const [review, setReview] = useState(null)
  const [message, setMessage] = useState('')
  const [applying, setApplying] = useState(false)
  const busy = useRef(false)
  const root = useRef(null)
  const reviewTitle = useRef(null)
  const draftCount = Object.keys(drafts).length
  const scoped = lines.filter(line => line.oppId === oppId)
  const counts = { all: 0, attention: 0, ready: 0, confirmed: 0, removed: 0 }
  scoped.forEach(line => { const status = sparesMobileStatus(line); counts[status.key]++; if (status.key !== 'removed') counts.all++ })
  const matched = scoped.filter(line => {
    const status = sparesMobileStatus(line)
    return (filter === 'all' ? status.key !== 'removed' : status.key === filter)
      && `${line.pn || ''} ${line.custRef || ''} ${line.desc || ''}`.toLowerCase().includes(query.trim().toLowerCase())
  })
  const visible = matched.slice(0, visibleCount)
  const currentTotals = sparesBatchTotals(scoped, costing)
  const selectedLines = scoped.filter(line => selected.includes(line.id) && !line.removedFromSourcing)
  const enabled = canPrice && canEdit
  const editing = !!MODES[mode]

  useEffect(() => {
    try {
      if (draftCount) sessionStorage.setItem(storageKey, JSON.stringify({ mode, drafts, baselines, currency: draftCurrency }))
      else sessionStorage.removeItem(storageKey)
    } catch { if (draftCount) setMessage('Draft storage is unavailable. Keep this page open until you save your changes.') }
  }, [storageKey, mode, drafts, baselines, draftCurrency, draftCount])
  useEffect(() => {
    if (!draftCount) return undefined
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [draftCount])
  useEffect(() => { setVisibleCount(20) }, [query, filter])
  useEffect(() => {
    if (task === 'issues') setFilter('attention')
    else if (task === 'confirm') { setFilter('ready'); setSelecting(true) }
    else if (task === 'parts') setFilter('all')
  }, [task])
  useEffect(() => { if (review) reviewTitle.current?.focus() }, [review])

  const changeMode = next => {
    if (draftCount && mode !== next) { setMessage('Review or discard your current edits before changing the edit mode.'); return }
    setMode(next); setReview(null); setMessage(''); setExpanded(null)
  }
  const discard = () => { setDrafts({}); setBaselines({}); setReview(null); setMode('browse'); setMessage('Draft changes discarded.') }
  const editDraft = (line, value) => {
    if (!enabled) return
    if (!draftCount) setDraftCurrency(displayCurrency)
    setBaselines(before => ({ ...before, [line.id]: before[line.id] || { ...line } }))
    setDrafts(before => ({ ...before, [line.id]: value }))
    setMessage('')
  }
  const openDetails = action => {
    if (draftCount) { setMessage('Review or discard your edits before opening a detailed editor.'); return }
    action?.()
  }
  const makeReview = operation => {
    if (!enabled) return
    const next = buildSparesBatchReview({ lines, oppId, mode: operation, drafts, baselines, selectedIds: selected, markupPct: markup, discountPct: discount, costing, displayCurrency: draftCount ? draftCurrency : displayCurrency, actor })
    setReview({ ...next, basis }); setMessage('')
    root.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  const apply = async () => {
    if (!enabled || busy.current || !review || review.invalid.length || !review.changes.length) return
    busy.current = true; setApplying(true); setMessage('')
    try {
      const result = await onApply(review.changes, review.basis)
      if (!result?.ok) { setMessage(result?.error || 'The changes could not be applied. Your draft is retained.'); return }
      setDrafts({}); setBaselines({}); setReview(null); setMode('browse'); setSelected([]); setSelecting(false)
      setMessage(localOnly ? 'Changes saved on this device.' : result.synced === false ? 'Changes applied locally. Shared saving is pending; retry syncing below.' : 'Changes saved.')
    } catch (error) { setMessage(error?.message || 'The changes could not be applied. Your draft is retained.') }
    finally { busy.current = false; setApplying(false) }
  }
  const saveLabel = localOnly ? 'Saved on this device' : saveStatus === 'saving' ? 'Saving changes…' : saveStatus === 'error' || ['error', 'degraded', 'auth-error', 'config-error'].includes(syncStatus) ? 'Shared saving needs attention' : saveStatus === 'saved' && syncStatus === 'live' ? 'Changes saved' : 'Shared saving pending'
  const rowValue = line => { const row = sparesLineFinancials(line, costing); return mode === 'qty' ? String(row.qty) : formatDraft(mode === 'supplier' ? row.listUnitPriceINR : row.adjustedUnitPriceINR, draftCount ? draftCurrency : displayCurrency) }

  if (review && !canPrice) return <section className="phone-parts-workspace"><p className="phone-parts-notice">Pricing restricted. Your draft is retained.</p><button type="button" onClick={() => setReview(null)}>Back to parts</button></section>

  return <section ref={root} className="phone-parts-workspace" aria-label="Mobile parts workspace">
    <header className="phone-parts-title"><div><h2>{review ? review.mode === 'confirm' ? 'Review confirmations' : 'Review changes' : mode === 'adjust' ? 'Batch pricing' : editing ? `Edit ${mode === 'qty' ? 'quantities' : 'prices'}` : 'Parts workspace'}</h2><p>{counts.all} active parts · {counts.confirmed} confirmed</p></div>{!review && !editing && mode !== 'adjust' && enabled && <button type="button" aria-pressed={selecting} onClick={() => { setSelecting(!selecting); setSelected([]) }}>{selecting ? 'Cancel selection' : 'Select'}</button>}</header>
    {!canEdit && <p className="phone-parts-notice">Read-only{draftCount ? ' · Your unsaved draft is retained.' : ' · Review the requested parts.'}</p>}
    {message && <p className="phone-parts-notice" role="status">{message}</p>}
    {review ? <>
      <h3 ref={reviewTitle} tabIndex={-1} className="phone-parts-review-title">{review.changes.length} changes · {review.excluded.length} excluded</h3>
      {canPrice && <><p className="hint">Totals include all {review.totalsAfter.parts} active parts. Previewing does not save.</p><div className="phone-parts-review-totals"><div><span /> <b>Current</b><b>After changes</b></div>{[['Revenue', 'revenue'], ['Cost', 'cogs'], ['Gross profit', 'profit'], ['Quantity', 'quantity'], ['Gross margin', 'margin']].map(([label, key]) => <div key={key}><span>{label}</span><strong>{key === 'margin' ? `${review.totalsBefore[key].toFixed(1)}%` : key === 'quantity' ? review.totalsBefore[key] : formatMoney(review.totalsBefore[key])}</strong><strong>{key === 'margin' ? `${review.totalsAfter[key].toFixed(1)}%` : key === 'quantity' ? review.totalsAfter[key] : formatMoney(review.totalsAfter[key])}</strong></div>)}</div></>}
      {!!review.invalid.length && <section className="phone-parts-errors" role="alert"><h3>Fix {review.invalid.length} edits before saving</h3>{review.invalid.map(item => <p key={item.id}><b>{item.label}</b><span>{item.reason}</span></p>)}</section>}
      {!!review.excluded.length && <section className="phone-parts-errors"><h3>{review.excluded.length} parts excluded</h3>{review.excluded.map(item => <p key={item.id}><b>{item.label}</b><span>{item.reason}</span></p>)}</section>}
      <details className="phone-parts-change-list" open={review.changes.length <= 5}><summary>View all {review.changes.length} changes</summary>{review.changes.map(change => <div key={change.id}><b>{change.before.pn || change.before.custRef || change.id}</b><small>Ref: {change.before.custRef || change.id}</small>{Object.entries(change.patch).filter(([key]) => ['qty', 'listUnitPrice', 'markupPct', 'discountPct', 'confirmed'].includes(key)).map(([key, value]) => <span key={key}>{({ qty: 'Quantity', listUnitPrice: 'Supplier cost (INR)', markupPct: 'Markup %', discountPct: 'Discount %', confirmed: 'Confirmed' })[key]}: {String(change.before[key] ?? '—')} → {String(typeof value === 'number' ? Number(value.toFixed(4)) : value)}</span>)}</div>)}</details>
      <div className="phone-parts-bottom"><button type="button" className="primary" disabled={!enabled || applying || !review.changes.length || !!review.invalid.length} onClick={apply}>{applying ? 'Applying…' : review.mode === 'confirm' ? `Confirm ${review.changes.length} eligible parts` : `Apply ${review.changes.length} changes`}</button><button type="button" disabled={applying} onClick={() => setReview(null)}>Back to editing</button></div>
    </> : <>
      <label className="phone-parts-search"><Icon name="search" size={18} /><input aria-label="Search parts or customer reference" placeholder="Search part or customer reference" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <nav className="phone-parts-filters" aria-label="Filter sourcing parts">{[['all', 'All'], ['attention', 'Needs attention'], ['ready', 'Ready'], ['confirmed', 'Confirmed'], ...(counts.removed ? [['removed', 'Removed']] : [])].map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}<b>{counts[key]}</b></button>)}</nav>
      {enabled && <div className="phone-parts-tools">{!editing && mode !== 'adjust' ? <><button type="button" onClick={() => changeMode('qty')}>Edit quantities</button><button type="button" onClick={() => changeMode('supplier')}>Edit prices</button></> : <><p>{mode === 'adjust' ? 'Apply shared adjustments to selected eligible parts.' : 'Edit several rows, then review and save together.'}</p>{editing && mode !== 'qty' && <label>Price field<select aria-label="Price field" value={mode} disabled={!!draftCount} onChange={event => changeMode(event.target.value)}><option value="supplier">Supplier unit cost</option><option value="customer">Customer unit price</option></select></label>}{editing && <p className="hint">{mode === 'qty' ? 'Positive whole quantities. Remove a line from its details to exclude it.' : `${MODES[mode]} in ${draftCount ? draftCurrency : displayCurrency}.${mode === 'supplier' ? ' Entered changes become attributed manual prices.' : ' Changes adjust markup using the existing landed cost.'}`}</p>}<button type="button" disabled={!!draftCount} onClick={() => changeMode('browse')}>Back to parts</button></>}</div>}
      {selecting && enabled && <div className="phone-parts-selection"><b>{selectedLines.length} selected</b><div><button type="button" onClick={() => setSelected([...new Set([...selected, ...visible.filter(l => !l.removedFromSourcing).map(l => l.id)])])}>Select visible results ({visible.filter(l => !l.removedFromSourcing).length})</button><button type="button" onClick={() => setSelected([...new Set([...selected, ...matched.filter(l => !l.removedFromSourcing).map(l => l.id)])])}>Select all matching ({matched.filter(l => !l.removedFromSourcing).length})</button></div></div>}
      {mode === 'adjust' && enabled && <form className="phone-parts-batch-fields" onSubmit={event => { event.preventDefault(); makeReview('adjust') }}><p>{selectedLines.length} selected parts. Blank fields stay unchanged.</p><label>Markup %<input inputMode="decimal" aria-label="Batch markup percent" value={markup} onChange={event => setMarkup(event.target.value)} placeholder="Unchanged" /></label><label>Discount %<input inputMode="decimal" aria-label="Batch discount percent" value={discount} onChange={event => setDiscount(event.target.value)} placeholder="Unchanged" /></label><p className="hint">Supplier prices are retained. Existing pricing approval thresholds still apply.</p><button type="submit" className="primary" disabled={!selectedLines.length}>Preview pricing changes</button></form>}
      <div className="phone-parts-list">{visible.map(line => {
        const status = sparesMobileStatus(line), financials = sparesLineFinancials(line, costing)
        const modified = Object.prototype.hasOwnProperty.call(drafts, line.id)
        return <article key={line.id} className={`phone-part-row${modified ? ' is-modified' : ''}`} data-part-id={line.id}>
          <div className="phone-part-main">{selecting && enabled && <input type="checkbox" aria-label={`Select ${line.pn || line.id}, reference ${line.custRef || line.id}`} checked={selected.includes(line.id)} disabled={!!line.removedFromSourcing} onChange={event => setSelected(event.target.checked ? [...selected, line.id] : selected.filter(id => id !== line.id))} />}
            <div className="phone-part-identity"><strong>{line.pn || line.custRef || 'Unspecified part'}</strong><span>{line.desc || 'Description not recorded'}</span>{line.custRef && line.custRef !== line.pn && <small>Ref: {line.custRef}</small>}<small className={`phone-part-status ${status.key}`}>{status.label}</small></div>
            {editing && enabled && !line.removedFromSourcing ? <label className="phone-part-input"><span>{mode === 'qty' ? 'Qty' : draftCount ? draftCurrency : displayCurrency}</span><input inputMode={mode === 'qty' ? 'numeric' : 'decimal'} aria-label={`${MODES[mode]} for ${line.pn || line.id}, reference ${line.custRef || line.id}`} value={modified ? drafts[line.id] : rowValue(line)} onChange={event => editDraft(line, event.target.value)} />{modified && <><small>Unsaved</small><button type="button" aria-label={`Discard draft for ${line.pn || line.id}`} onClick={() => { setDrafts(old => { const next = { ...old }; delete next[line.id]; return next }); setBaselines(old => { const next = { ...old }; delete next[line.id]; return next }) }}>Reset</button></>}</label> : <><div className="phone-part-values"><span>Qty {financials.qty}</span>{canPrice && <span>Unit {formatMoney(financials.adjustedUnitPriceINR)}</span>}</div><button type="button" className="phone-part-expand" aria-label={`Details for ${line.pn || line.id}, reference ${line.custRef || line.id}`} aria-expanded={expanded === line.id} onClick={() => setExpanded(expanded === line.id ? null : line.id)}><Icon name={expanded === line.id ? 'chevronDown' : 'chevronRight'} size={18} /></button></>}
          </div>
          {expanded === line.id && <div className="phone-part-details"><p>{sourceDetails(line)?.primary || 'Source not recorded'}</p>{line.leadTime && <p>Lead time: {line.leadTime}</p>}{canPrice && <dl><div><dt>Supplier unit cost</dt><dd>{formatMoney(financials.listUnitPriceINR)}</dd></div><div><dt>Line total</dt><dd>{formatMoney(financials.lineTotalINR)}</dd></div></dl>}<button type="button" onClick={() => onSource?.(line)}>View source</button>{enabled && <><button type="button" onClick={() => openDetails(() => onEdit?.(line))}>Edit details</button><button type="button" onClick={() => openDetails(() => onCompare?.(line))}>Compare sources</button>{status.key === 'removed' && <button type="button" onClick={() => openDetails(() => onRestore?.(line))}>Restore line</button>}{status.key === 'ready' && <button type="button" onClick={() => { if (draftCount) { setMessage('Review or discard your edits before confirming parts.'); return }; setSelected([line.id]); const next = buildSparesBatchReview({ lines, oppId, mode: 'confirm', selectedIds: [line.id], costing }); setReview({ ...next, basis }) }}>Review confirmation</button>}</>}</div>}
        </article>
      })}{!matched.length && <p className="phone-empty">{scoped.length ? 'No parts match this search and filter.' : 'Add customer-requested parts to begin.'}</p>}</div>
      <p className="phone-parts-showing">Showing {visible.length} of {matched.length} matching parts</p>{matched.length > visibleCount && <button type="button" className="phone-parts-more" onClick={() => setVisibleCount(count => count + 20)}>Show next {Math.min(20, matched.length - visibleCount)} parts</button>}
      {!canPrice && <p className="phone-parts-notice">Pricing restricted</p>}
      {selecting && enabled && <div className="phone-parts-selection-actions"><button type="button" disabled={!selectedLines.length || !!draftCount} onClick={() => changeMode('adjust')}>Batch pricing</button><button type="button" className="primary" disabled={!selectedLines.length || !!draftCount} onClick={() => makeReview('confirm')}>Confirm selected ({selectedLines.length})</button><button type="button" onClick={() => setSelected([])}>Clear selection</button></div>}
      <div className="phone-parts-bottom">
        {draftCount > 0 && <><p role="status">{draftCount} unsaved edits{draftCurrency !== displayCurrency ? ` · Entered in ${draftCurrency}` : ''}</p><button type="button" className="primary" disabled={!enabled} onClick={() => makeReview(mode)}>Review {draftCount} changes</button><button type="button" onClick={discard}>Discard changes</button></>}
        {!draftCount && mode === 'browse' && <>
          {canPrice && <div className="phone-parts-totals"><div><span>Revenue</span><b>{formatMoney(currentTotals.revenue)}</b></div><div><span>Gross margin</span><b className={currentTotals.margin < 0 ? 'is-negative' : ''}>{currentTotals.margin.toFixed(1)}%</b></div></div>}
          <p role="status">{saveLabel}</p>{!localOnly && (saveStatus === 'error' || ['degraded', 'error'].includes(syncStatus)) && <button type="button" onClick={onRetrySync}>Retry syncing</button>}
          {enabled && <><p>{counts.attention ? `${counts.attention} parts need attention.` : counts.ready ? `${counts.ready} parts are ready to confirm together.` : continueReason || 'All active parts confirmed.'}</p>{(counts.attention > 0 || counts.ready > 0) && <button type="button" onClick={() => { setFilter(counts.attention ? 'attention' : 'ready'); setSelecting(!counts.attention); root.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }}>{counts.attention ? 'Show parts needing attention' : 'Select ready parts'}</button>}<button type="button" className="primary" disabled={!canContinue} title={continueReason || undefined} onClick={onContinue}>Next: Proposal<Icon name="arrowRight" size={18} /></button>{!canContinue && continueReason && <small>{continueReason}</small>}</>}
        </>}
      </div>
    </>}
  </section>
}
