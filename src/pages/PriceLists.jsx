import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { fmt, exportCSV, canViewCommercial } from '../utils.js'

export default function PriceLists() {
  const store = useStore()
  const [list, setList] = useState('BNK')
  const pl = store.priceLists[list]

  if (!canViewCommercial(store.role)) {
    return (
      <div className="page">
        <h2>Price Lists (Admin)</h2>
        <div className="restricted" style={{ maxWidth: 640 }}>
          Restricted — supplier price lists, trader quotes and rate sheets are visible to approvers/admin only.
        </div>
      </div>
    )
  }

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
      <h2>Price Lists (Admin)</h2>
      <div className="toolbar">
        {Object.keys(store.priceLists).map(k => (
          <button key={k} className={list === k ? 'primary' : ''} onClick={() => setList(k)}>{k}</button>
        ))}
        <span className="hint">Version {pl.version} · uploaded {pl.uploaded} · {pl.currency}. Admin uploads the current file; the tool uses whatever is uploaded.</span>
        <span className="spacer" />
        <button onClick={() => exportCSV(`${list}_pricelist.csv`, ['Part Number','Description',`Price (${pl.currency})`,'Adders'], pl.parts.map(x => [x.pn, x.desc, x.price, x.adders.map(a => `${a.desc} +${a.price}`).join('; ')]))}>Extract to Excel</button>
        <button onClick={() => alert('Upload new version (mock): in Phase 1 the admin uploads the yearly B&K / Metrics Excel here; the latest upload becomes current and older versions are kept.')}>Upload new version</button>
      </div>

      <div className="sheet-wrap" style={{ maxWidth: 900 }}>
        <table className="sheet">
          <thead><tr><th>Part Number</th><th>Description</th><th>Price ({pl.currency})</th><th>Configurable Adders</th></tr></thead>
          <tbody>
            {pl.parts.map(x => (
              <tr key={x.pn}>
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
      <div className="sheet-wrap" style={{ maxWidth: 900 }}>
        <table className="sheet">
          <thead><tr><th>Part Number</th><th>Supplier</th><th>Price</th><th>Currency</th><th>Quoted On</th><th>Note</th></tr></thead>
          <tbody>
            {store.adhocParts.map((x, i) => (
              <tr key={i}><td>{x.pn}</td><td>{x.supplier}</td><td className="num">{fmt(x.price)}</td><td>{x.currency}</td><td>{x.date}</td><td>{x.note}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="toolbar" onSubmit={addAdhoc} style={{ marginTop: 8 }}>
        <input name="pn" type="text" placeholder="Part number" />
        <input name="supplier" type="text" placeholder="Supplier" />
        <input name="price" type="number" placeholder="Price" style={{ width: 90 }} />
        <select name="currency"><option>INR</option><option>USD</option><option>EUR</option></select>
        <input name="note" type="text" placeholder="Note" />
        <button className="primary" type="submit">+ Capture quote</button>
      </form>

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
