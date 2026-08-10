import React, { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { effectiveRate, unitCostINR, unitSellINR, fmt, exportCSV } from '../utils.js'

const TABS = ['Cover Letter', 'Signal List', 'Rack Layout', 'Priced BoQ']

export default function Proposal() {
  const { oppId } = useParams()
  const store = useStore()
  const opp = store.opportunities.find(o => o.id === oppId)
  const [tab, setTab] = useState('Cover Letter')
  const [p, setP] = useState(() => store.getProposal(oppId))

  if (!opp) return <div className="page"><h2>Unknown opportunity</h2><Link to="/">Back to tracker</Link></div>

  const save = next => { setP(next); store.saveProposal(oppId, next) }
  const set = k => e => save({ ...p, [k]: e.target.value })
  const setCosting = k => e => save({ ...p, costing: { ...p.costing, [k]: +e.target.value || 0 } })

  const allParts = Object.entries(store.priceLists).flatMap(([list, pl]) =>
    pl.parts.map(part => ({ ...part, list, currency: pl.currency })))

  const addBomLine = pn => {
    const part = allParts.find(x => x.pn === pn)
    if (!part) return
    save({ ...p, bom: [...p.bom, { pn: part.pn, desc: part.desc, listPrice: part.price, adders: [], qty: 1 }] })
  }
  const updLine = (i, k) => e => {
    const bom = p.bom.map((l, j) => (j === i ? { ...l, [k]: +e.target.value || 0 } : l))
    save({ ...p, bom })
  }
  const toggleAdder = (i, adder) => () => {
    const bom = p.bom.map((l, j) => {
      if (j !== i) return l
      const has = l.adders.includes(adder.code)
      return { ...l, adders: has ? l.adders.filter(a => a !== adder.code) : [...l.adders, adder.code] }
    })
    save({ ...p, bom })
  }
  const removeLine = i => () => save({ ...p, bom: p.bom.filter((_, j) => j !== i) })

  const linePriceEUR = l => {
    const part = allParts.find(x => x.pn === l.pn)
    const adderSum = (part?.adders || []).filter(a => l.adders.includes(a.code)).reduce((s, a) => s + a.price, 0)
    return l.listPrice + adderSum
  }
  const effRate = effectiveRate(p.costing)
  const totals = p.bom.reduce((t, l) => {
    const eur = linePriceEUR(l) * l.qty
    return { eur: t.eur + eur, cost: t.cost + unitCostINR(linePriceEUR(l), p.costing) * l.qty, sell: t.sell + unitSellINR(linePriceEUR(l), p.costing) * l.qty }
  }, { eur: 0, cost: 0, sell: 0 })
  const netGM = totals.sell - totals.cost
  const totalSignals = p.signals.reduce((s, r) => s + r.perUnit * r.units, 0)

  const exportBoQ = () => exportCSV(
    `${oppId}_Priced_BoQ.csv`,
    ['Proposed Model & Part Number', 'Description', 'Adders', 'Qty', 'Unit Price €', 'Unit Cost ₹', 'Unit Price ₹', 'Total Price ₹'],
    p.bom.map(l => [l.pn, l.desc, l.adders.join('+'), l.qty, linePriceEUR(l), unitCostINR(linePriceEUR(l), p.costing), Math.round(unitSellINR(linePriceEUR(l), p.costing)), Math.round(unitSellINR(linePriceEUR(l), p.costing) * l.qty)])
  )

  return (
    <div className="page">
      <h2>{oppId} — {opp.sellTo} — Proposal Workbook</h2>
      <div className="toolbar">
        <Link className="btn" to={`/folders/${oppId}`}>◂ Back to folder</Link>
        <span className="spacer" />
        {tab === 'Priced BoQ' && <button onClick={exportBoQ}>Extract to Excel</button>}
        <button className="primary" onClick={() => window.print()}>Print / PDF proposal</button>
      </div>

      {tab === 'Cover Letter' && (
        <div className="cover-sheet">
          <div className="cover-head">
            <span className="brand">‖a·e‖</span>
            <span className="tagline">Your Partners In Achieving Excellence</span>
          </div>
          <div className="cover-meta">
            <div><b>Date:</b> <span className="cover-field"><input type="date" value={p.revisionDate} onChange={set('revisionDate')} /></span></div>
            <div><b>Our Ref:</b> {p.ourRef}</div>
            <div><b>Bid Stage:</b> <select value={p.bidStage} onChange={set('bidStage')}><option>Binding</option><option>Budgetary</option></select></div>
            <div><b>Bid Type:</b> <select value={p.bidType} onChange={set('bidType')}><option>Priced</option><option>Unpriced (Technical)</option></select></div>
            <div><b>Revision:</b> <select value={p.revision} onChange={set('revision')}>{['00','01','02','03','04'].map(r => <option key={r}>{r}</option>)}</select></div>
          </div>
          <div className="cover-meta">
            <div><b>{p.addressee}</b></div>
            <div>Kind Attn: <span className="cover-field"><input value={p.kindAttn} onChange={set('kindAttn')} /></span></div>
            <div>Mobile: {p.attnPhone}</div>
          </div>
          <div className="cover-meta">
            <div><b>Subject:</b> RFQ # <span className="cover-field"><input value={p.rfqNumber} onChange={set('rfqNumber')} placeholder="RFQ number & date" style={{ minWidth: 180 }} /></span></div>
            <div style={{ marginLeft: 62 }}>{p.subject}</div>
            <div><b>Project:</b> <span className="cover-field"><input value={p.project} onChange={set('project')} style={{ minWidth: 420 }} /></span></div>
          </div>
          <div className="cover-body">
            <p>Dear Sir,</p>
            <p>With reference to your RFQ {p.rfqNumber && `# ${p.rfqNumber}`} we are pleased to submit our Techno-Commercial Proposal for your review and consideration.</p>
            <p>Based on our understanding of the requirement and the information shared by your team, we have prepared the enclosed proposal to support your planning, budgeting, and technical evaluation activities.</p>
          </div>
        </div>
      )}

      {tab === 'Signal List' && (
        <div className="form-card">
          <div className="section-title">Signal List {['Spares', 'Service', 'Training', 'AMC'].includes(opp.oppType) && <span className="hint">(not applicable for spares/service proposals — shown for reference)</span>}</div>
          <table className="sheet">
            <thead><tr><th>Signal</th><th>Per Unit</th><th>Units</th><th>Total</th><th>PI Tags (×15)</th></tr></thead>
            <tbody>
              {p.signals.map((s, i) => (
                <tr key={i}>
                  <td>{s.signal}</td>
                  <td className="num"><input type="number" value={s.perUnit} onChange={e => { const signals = p.signals.map((x, j) => j === i ? { ...x, perUnit: +e.target.value || 0 } : x); save({ ...p, signals }) }} style={{ width: 60, textAlign: 'right' }} /></td>
                  <td className="num"><input type="number" value={s.units} onChange={e => { const signals = p.signals.map((x, j) => j === i ? { ...x, units: +e.target.value || 0 } : x); save({ ...p, signals }) }} style={{ width: 60, textAlign: 'right' }} /></td>
                  <td className="num">{s.perUnit * s.units}</td>
                  <td className="num">{s.perUnit * s.units * 15}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>Total</td><td></td><td></td><td className="num">{totalSignals}</td><td className="num">{totalSignals * 15}</td></tr>
            </tfoot>
          </table>
          <div className="costing-note">
            1 vibration signal ≈ 15 AVEVA PI tags. {totalSignals * 15} tags → select the next-higher CMS license tier from the B&K price list (e.g. CMS-TAG-4000).
          </div>
        </div>
      )}

      {tab === 'Rack Layout' && (
        <div className="form-card">
          <div className="section-title">Rack Layout (engineering output — placeholder in Phase 1)</div>
          <pre style={{ background: '#f7f7f7', border: '1px solid #ddd', padding: 14, fontSize: 12 }}>
{`┌─────────────────────── 16-SLOT RACK (RK16-BASE + CE) ───────────────────────┐
│ PSU │ PSU │ RCM │ UMM │ UMM │ UMM │ UMM │ eSAM │ ... │ ... │ ... │ spare... │
└──────────────────────────────────────────────────────────────────────────────┘`}
          </pre>
          <div className="hint">Module selection follows the signal list; the rack drawing is attached by the engineer.</div>
        </div>
      )}

      {tab === 'Priced BoQ' && (
        <>
          <div className="factors">
            <table>
              <thead><tr><th colSpan={2}>Imported Items Pricing &amp; Costing Factors</th></tr></thead>
              <tbody>
                <tr><td>Euro-₹ Base</td><td className="num"><input type="number" step="0.01" value={p.costing.baseRate} onChange={setCosting('baseRate')} /></td></tr>
                <tr><td>CD+ERV+Cont.</td><td className="num"><input type="number" step="0.1" value={p.costing.cdErvContPct} onChange={setCosting('cdErvContPct')} />%</td></tr>
                <tr><td>B&amp;K Disc%</td><td className="num"><input type="number" step="0.1" value={p.costing.bnkDiscPct} onChange={setCosting('bnkDiscPct')} />%</td></tr>
                <tr><td><b>Eff. Rate</b></td><td className="num"><b>₹ {fmt(effRate, 2)}</b></td></tr>
                <tr><td>Input GM%</td><td className="num"><input type="number" step="0.1" value={p.costing.inputGMPct} onChange={setCosting('inputGMPct')} />%</td></tr>
              </tbody>
            </table>
            <table>
              <thead><tr><th colSpan={2}>Roll-up</th></tr></thead>
              <tbody>
                <tr><td>ModAE Costs</td><td className="num">₹ {fmt(totals.cost)}</td></tr>
                <tr><td>Target Price</td><td className="num">₹ {fmt(totals.sell)}</td></tr>
                <tr><td>Net GM ₹</td><td className="num">₹ {fmt(netGM)}</td></tr>
                <tr><td>Net GM %</td><td className="num">{totals.sell ? ((netGM / totals.sell) * 100).toFixed(2) + '%' : '—'}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="costing-note">
            Eff. Rate = ROUNDUP(Euro-₹ Base × (1 + CD+ERV+Cont.) × (1 − B&amp;K Disc)) — e.g. 112 × 1.16 × 0.50 → ₹65. Unit ₹ price = € list × Eff. Rate ÷ (1 − GM).
          </div>

          <div className="toolbar">
            <label>Add part from price list:{' '}
              <select value="" onChange={e => addBomLine(e.target.value)}>
                <option value="">— select part number —</option>
                {allParts.map(x => <option key={x.pn} value={x.pn}>{x.list} · {x.pn} — {x.desc} ({x.currency} {fmt(x.price)})</option>)}
              </select>
            </label>
            <span className="hint">Non-B&amp;K parts: capture the trader quote in Price Lists → Ad-hoc parts first.</span>
          </div>

          <div className="sheet-wrap">
            <table className="sheet">
              <thead>
                <tr>
                  <th>Proposed Model &amp; Part Number</th><th>Description</th><th>Configurable Adders</th>
                  <th>Qty</th><th>Unit Price €</th><th>Unit Cost ₹</th><th>Unit Price ₹</th><th>Total Price ₹</th><th></th>
                </tr>
              </thead>
              <tbody>
                {p.bom.map((l, i) => {
                  const part = allParts.find(x => x.pn === l.pn)
                  const eur = linePriceEUR(l)
                  return (
                    <tr key={i}>
                      <td>{l.pn}</td>
                      <td>{l.desc}</td>
                      <td>
                        {(part?.adders || []).length
                          ? part.adders.map(a => (
                            <label key={a.code} style={{ marginRight: 10 }}>
                              <input type="checkbox" checked={l.adders.includes(a.code)} onChange={toggleAdder(i, a)} />
                              {' '}{a.desc} (+€{a.price})
                            </label>
                          ))
                          : <span className="hint">—</span>}
                      </td>
                      <td className="num"><input type="number" min="1" value={l.qty} onChange={updLine(i, 'qty')} style={{ width: 56, textAlign: 'right' }} /></td>
                      <td className="num">€ {fmt(eur)}</td>
                      <td className="num">₹ {fmt(unitCostINR(eur, p.costing))}</td>
                      <td className="num">₹ {fmt(unitSellINR(eur, p.costing))}</td>
                      <td className="num">₹ {fmt(unitSellINR(eur, p.costing) * l.qty)}</td>
                      <td><button onClick={removeLine(i)} title="Remove line">✕</button></td>
                    </tr>
                  )
                })}
                {!p.bom.length && <tr><td colSpan={9} className="hint">No lines yet — add parts from the price list above. Try RK16-BASE and tick CE mark + Flush mount kit: €2000 + €110 + €65 = €2175.</td></tr>}
              </tbody>
              {p.bom.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={4}>Totals</td>
                    <td className="num">€ {fmt(totals.eur)}</td>
                    <td className="num">₹ {fmt(totals.cost)}</td>
                    <td></td>
                    <td className="num">₹ {fmt(totals.sell)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}

      <div className="sheet-tabs">
        {TABS.map(t => (
          <div key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</div>
        ))}
        <div className="tab">＋</div>
      </div>
    </div>
  )
}
