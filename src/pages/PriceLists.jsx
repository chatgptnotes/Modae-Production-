import React, { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { fmt, exportCSV, canViewCommercial } from '../utils.js'

export default function PriceLists() {
  const store = useStore()
  const canEdit = canViewCommercial(store.role)
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedList = searchParams.get('list') || ''
  const requestedPart = searchParams.get('part') || ''
  const firstList = Object.keys(store.priceLists || {})[0] || 'BNK'
  const initialList = store.priceLists?.[requestedList] ? requestedList : firstList
  const [list, setList] = useState(initialList)
  const [highlightedPart, setHighlightedPart] = useState('')
  const rowRefs = useRef({})
  const pl = store.priceLists[list]
  const requestedPartMatch = pl?.parts.find(part => String(part.pn).trim().toUpperCase() === requestedPart.trim().toUpperCase())
  const requestedListAvailable = !requestedList || !!store.priceLists?.[requestedList]

  useEffect(() => {
    if (store.priceLists?.[requestedList] && requestedList !== list) setList(requestedList)
  }, [list, requestedList, store.priceLists])

  useEffect(() => {
    if (!requestedPart || !pl) return
    const match = pl.parts.find(part => String(part.pn).trim().toUpperCase() === requestedPart.trim().toUpperCase())
    setHighlightedPart(match?.pn || '')
    if (!match) return
    const timer = window.setTimeout(() => rowRefs.current[match.pn]?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0)
    return () => window.clearTimeout(timer)
  }, [list, pl, requestedPart])

  const addAdhoc = e => {
    e.preventDefault()
    const f = new FormData(e.target)
    if (!f.get('pn')) return
    store.addAdhocPart({
      pn: f.get('pn'), supplier: f.get('supplier'), price: +f.get('price') || 0,
      currency: f.get('currency'), date: new Date().toISOString().slice(0, 10), note: f.get('note'),
    })
    e.target.reset()
  }

  return (
    <div className="page">
      <h2>Price Lists</h2>
      <div className="toolbar">
        {Object.keys(store.priceLists).map(k => (
          <button key={k} className={list === k ? 'primary' : ''} onClick={() => {
            setList(k)
            setHighlightedPart('')
            setSearchParams({ list: k })
          }}>{k}</button>
        ))}
        <span className="hint">Version {pl.version} · uploaded {pl.uploaded} · {pl.currency}. Current approved pricing reference.</span>
        <span className="spacer" />
        <button onClick={() => exportCSV(`${list}_pricelist.csv`, ['Part Number','Description',`Price (${pl.currency})`,'Adders'], pl.parts.map(x => [x.pn, x.desc, x.price, x.adders.map(a => `${a.desc} +${a.price}`).join('; ')]))}>Extract to Excel</button>
        {canEdit && <button onClick={() => alert('Upload new version (mock): in Phase 1 the admin uploads the yearly B&K / Metrics Excel here; the latest upload becomes current and older versions are kept.')}>Upload new version</button>}
      </div>

      {requestedPart && (!requestedListAvailable || !requestedPartMatch) && (
        <div className="warnbox" role="status" style={{ maxWidth: 900, marginBottom: 10 }}>
          {!requestedListAvailable
            ? <>The original source list <b>{requestedList}</b> is not available. Showing <b>{list}</b>; part <b>{requestedPart}</b> was not found there.</>
            : <>Part <b>{requestedPart}</b> was not found in the <b>{list}</b> price list. Search the selected list or choose another list above.</>}
        </div>
      )}

      <div className="sheet-wrap sheet-wrap-fill">
        <table className="sheet">
          <thead><tr><th>Part Number</th><th>Description</th><th>Price ({pl.currency})</th><th>Configurable Adders</th></tr></thead>
          <tbody>
            {pl.parts.map(x => (
              <tr key={x.pn} ref={row => { rowRefs.current[x.pn] = row }} className={highlightedPart === x.pn ? 'price-list-highlight' : undefined}>
                <td>{x.pn}</td><td>{x.desc}</td>
                <td className="num">{fmt(x.price)}</td>
                <td>{x.adders.length ? x.adders.map(a => `${a.desc} (+${a.price})`).join(' · ') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-title">Ad-hoc / Non-B&amp;K parts — last referred price grows over time</div>
      <div className="hint" style={{ marginBottom: 6 }}>
        Every trader quote for a non-price-list part is captured here with its date; the latest entry becomes the reference price for future quotes.
      </div>
      <div className="sheet-wrap sheet-wrap-fill">
        <table className="sheet">
          <thead><tr><th>Part Number</th><th>Supplier</th><th>Price</th><th>Currency</th><th>Quoted On</th><th>Note</th></tr></thead>
          <tbody>
            {store.adhocParts.map((x, i) => (
              <tr key={i}><td>{x.pn}</td><td>{x.supplier}</td><td className="num">{fmt(x.price)}</td><td>{x.currency}</td><td>{x.date}</td><td>{x.note}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <form className="toolbar" onSubmit={addAdhoc} style={{ marginTop: 8 }}>
          <input name="pn" type="text" placeholder="Part number" />
          <input name="supplier" type="text" placeholder="Supplier" />
          <input name="price" type="number" placeholder="Price" style={{ width: 90 }} />
          <select name="currency"><option>INR</option><option>USD</option><option>EUR</option></select>
          <input name="note" type="text" placeholder="Note" />
          <button className="primary" type="submit">+ Capture quote</button>
        </form>
      )}

      <div className="section-title">Service Rate Sheet</div>
      <div className="sheet-wrap" style={{ maxWidth: 520 }}>
        <table className="sheet">
          <thead><tr><th>Role</th><th>Rate / day (K₹)</th></tr></thead>
          <tbody>
            {store.rateSheet.map(r => (
              <tr key={r.role}><td>{r.role}</td><td className="num">{fmt(r.ratePerDayK)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="costing-note">Service quotes = rate sheet × number of days; used directly for service/training proposals.</div>
    </div>
  )
}
