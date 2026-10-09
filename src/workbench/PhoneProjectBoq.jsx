import React, { useEffect, useState } from 'react'
import { computeProposalTotals } from '../gates.js'
import { fmt } from '../utils.js'
import { convertCurrency, currencySymbol } from '../currency.js'
import { projectDraftStorageKey, reviewProjectBoqEdits } from './mobileProjectBoq.js'

const fields = { qtyPerUnit: 'Quantity per unit', common: 'Common quantity', spares: 'Spares quantity', quoted: 'Customer unit price' }

export default function PhoneProjectBoq({ proposal, category, userId, editable, canPrice, onSave }) {
  const storageKey = projectDraftStorageKey(userId, proposal.oppId, category)
  const [initial] = useState(() => { try { return JSON.parse(sessionStorage.getItem(storageKey)) || {} } catch { return {} } })
  const [field, setField] = useState(initial.field || 'common')
  const [query, setQuery] = useState('')
  const [drafts, setDrafts] = useState(initial.drafts || {})
  const [baseline, setBaseline] = useState(initial.baseline || null)
  const [review, setReview] = useState(null)
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState([])
  const [sharedValue, setSharedValue] = useState('')
  const [limit, setLimit] = useState(20)
  const [adding, setAdding] = useState(false)
  const [part, setPart] = useState({ pn: '', desc: '', qty: '1', price: '', currency: 'INR' })
  const rows = (proposal.bom || []).map((line, index) => ({ line, index })).filter(({ line }) => line.itemCategory === category && `${line.pn} ${line.desc}`.toLowerCase().includes(query.toLowerCase()))
  const currency = proposal.sourceCurrency || 'INR'
  const money = value => `${currencySymbol(currency)} ${fmt(convertCurrency(value, 'INR', currency, proposal.costing?.currencyRates), 2)}`
  const totals = computeProposalTotals(proposal)
  const count = Object.keys(drafts).length
  useEffect(() => {
    try { if (count) sessionStorage.setItem(storageKey, JSON.stringify({ field, drafts, baseline })); else sessionStorage.removeItem(storageKey) }
    catch { if (count) setMessage('Draft storage is unavailable. Save before leaving this task.') }
  }, [storageKey, field, drafts, baseline, count])
  useEffect(() => { setLimit(20) }, [query, category])
  const edit = (index, value) => { if (!editable) return; setBaseline(current => current || JSON.stringify(proposal)); setDrafts(current => ({ ...current, [index]: value })) }
  const discard = () => { setDrafts({}); setBaseline(null); setReview(null); setMessage('') }
  const save = async () => {
    if (!editable || !review || review.errors.length) return
    const result = await onSave(review.proposal, baseline)
    if (!result?.ok) { setMessage(result?.error || 'Could not save. Your edits are retained.'); return }
    discard(); setMessage(result.synced === false ? 'Changes saved locally. Shared saving needs a retry.' : 'BOQ changes saved.')
  }
  const preview = () => {
    if (JSON.stringify(proposal) !== baseline) { setMessage('The proposal changed while you were editing. Discard these drafts and review the latest BOQ.'); return }
    setReview(reviewProjectBoqEdits(proposal, field, drafts))
  }
  const add = async event => {
    event.preventDefault()
    if (!editable || count) return
    if (!part.pn.trim() || !part.desc.trim() || !Number.isInteger(Number(part.qty)) || !(Number(part.qty) > 0) || !Number.isFinite(Number(part.price)) || Number(part.price) < 0) { setMessage('Enter a part number, description, positive whole quantity and a valid supplier price.'); return }
    const next = { ...proposal, bom: [...(proposal.bom || []), { itemCategory: category, pn: part.pn.trim(), desc: part.desc.trim(), qtyPerUnit: 0, common: Number(part.qty), spares: 0, listPrice: canPrice ? Number(part.price) : 0, adders: [], quoted: '', uom: 'EA', currency: part.currency, list: 'Manual entry' }] }
    const result = await onSave(next, JSON.stringify(proposal))
    if (!result?.ok) { setMessage(result?.error || 'Could not add this part.'); return }
    setPart({ pn: '', desc: '', qty: '1', price: '', currency: 'INR' }); setMessage('Part added. Enter the next part or close this form.')
  }
  if (field === 'quoted' && !canPrice) return <section className="phone-project-boq"><p>Pricing restricted. Your previous draft is retained.</p><button type="button" onClick={() => { discard(); setField('common') }}>Discard pricing draft</button></section>
  return <section className="phone-project-boq">
    {message && <p className="phone-parts-notice" role="status">{message}</p>}
    {review ? <>
      <h3>Review {review.changes.length} BOQ changes</h3>
      {canPrice && <div className="phone-parts-review-totals">{[['Revenue', 'value'], ['COGS', 'cogs'], ['Gross margin', 'gmPct']].map(([label, key]) => <div key={key}><span>{label}</span><strong>{key === 'gmPct' ? `${totals[key].toFixed(1)}%` : money(totals[key])}</strong><strong>{key === 'gmPct' ? `${computeProposalTotals(review.proposal)[key].toFixed(1)}%` : money(computeProposalTotals(review.proposal)[key])}</strong></div>)}</div>}
      {review.errors.map(error => <p key={error.index} role="alert">{error.label}: {error.reason}</p>)}
      <div className="phone-parts-change-list">{review.changes.map(change => <div key={change.index}><b>{change.label}</b><small>BOQ line {change.index + 1}</small><span>{fields[field]}: {String(change.before ?? 'Calculated')} → {String(change.after === '' ? 'Calculated' : change.after)}{field === 'quoted' ? ' (INR)' : ''}</span></div>)}</div>
      <div className="phone-parts-bottom"><button type="button" className="primary" disabled={!editable || !review.changes.length || !!review.errors.length} onClick={save}>Apply BOQ changes</button><button type="button" onClick={() => setReview(null)}>Back to editing</button></div>
    </> : <>
      <label className="phone-parts-search"><input aria-label={`Search ${category} BOQ`} placeholder="Search part or description" value={query} onChange={event => setQuery(event.target.value)} /></label>
      {editable && <><label className="phone-project-edit-field">Edit across rows<select aria-label="Project BOQ edit field" value={field} disabled={!!count} onChange={event => { setField(event.target.value); setSelected([]) }}>{Object.entries(fields).filter(([key]) => canPrice || key !== 'quoted').map(([key, label]) => <option value={key} key={key}>{label}{key === 'quoted' ? ` (${currency})` : ''}</option>)}</select></label><details className="phone-project-shared"><summary>Apply one value to selected rows ({selected.length})</summary><label>{fields[field]}<input aria-label="Shared BOQ value" inputMode={field === 'quoted' ? 'decimal' : 'numeric'} value={sharedValue} onChange={event => setSharedValue(event.target.value)} /></label><button type="button" disabled={!selected.length} onClick={() => selected.forEach(index => edit(index, sharedValue))}>Fill selected drafts</button><button type="button" onClick={() => setSelected(rows.map(row => row.index))}>Select all matching ({rows.length})</button><button type="button" onClick={() => setSelected([])}>Clear selection</button></details></>}
      <div className="phone-parts-list">{rows.slice(0, limit).map(({ line, index }) => <article key={index} className="phone-part-row"><div className="phone-part-main">
        {editable && <input type="checkbox" aria-label={`Select BOQ line ${index + 1}`} checked={selected.includes(index)} onChange={event => setSelected(event.target.checked ? [...selected, index] : selected.filter(value => value !== index))} />}
        <div className="phone-part-identity"><strong>{line.pn || `Line ${index + 1}`}</strong><span>{line.desc}</span><small>Per unit {line.qtyPerUnit || 0} · Common {line.common || 0} · Spares {line.spares || 0}</small></div>
        {editable ? <label className="phone-part-input"><span>{fields[field]}</span><input inputMode={field === 'quoted' ? 'decimal' : 'numeric'} aria-label={`${fields[field]} for BOQ line ${index + 1}`} value={drafts[index] ?? (field === 'quoted' ? line.quoted === '' || line.quoted == null ? '' : convertCurrency(Number(line.quoted), 'INR', currency, proposal.costing?.currencyRates) : line[field] || 0)} placeholder={field === 'quoted' ? 'Calculated' : ''} onChange={event => edit(index, event.target.value)} />{Object.prototype.hasOwnProperty.call(drafts, index) && <small>Unsaved</small>}</label> : <small>Read-only</small>}
      </div></article>)}</div>
      {!rows.length && <p className="hint">No matching BOQ lines.</p>}{rows.length > limit && <button type="button" onClick={() => setLimit(value => value + 20)}>Show next 20 lines</button>}
      {editable && <><div className="phone-parts-bottom">{count ? <><p>{count} unsaved edits</p><button type="button" className="primary" onClick={preview}>Review BOQ changes</button><button type="button" onClick={discard}>Discard changes</button></> : <button type="button" onClick={() => setAdding(!adding)}>{adding ? 'Close add form' : 'Add requested part'}</button>}</div>{adding && !count && <form className="phone-parts-batch-fields" onSubmit={add}><label>Part number<input value={part.pn} onChange={event => setPart({ ...part, pn: event.target.value })} /></label><label>Description<textarea value={part.desc} onChange={event => setPart({ ...part, desc: event.target.value })} /></label><label>Common quantity<input inputMode="numeric" value={part.qty} onChange={event => setPart({ ...part, qty: event.target.value })} /></label>{canPrice && <label>Supplier unit price<input inputMode="decimal" value={part.price} onChange={event => setPart({ ...part, price: event.target.value })} /></label>}<label>Source currency<select value={part.currency} onChange={event => setPart({ ...part, currency: event.target.value })}>{['INR', 'EUR', 'USD'].map(value => <option key={value}>{value}</option>)}</select></label><button type="submit" className="primary">Add part</button></form>}</>}
    </>}
  </section>
}
