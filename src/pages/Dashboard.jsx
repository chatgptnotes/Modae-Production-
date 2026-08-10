import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { fmt, fmtLakh, monthKey, monthLabel, exportCSV } from '../utils.js'

// The "Pivot" sheet: forecast roll-up of open, forecast-flagged opportunities
// by likely invoice month, filterable like Swami's pivot.
export default function Dashboard() {
  const store = useStore()
  const nav = useNavigate()
  const [ownerFilter, setOwnerFilter] = useState('All')
  const [horizon, setHorizon] = useState('2026-12')

  const owners = ['All', ...new Set(store.opportunities.map(o => o.owner))]

  const open = store.opportunities.filter(o => o.status === 'Open')
  const inScope = open.filter(o =>
    o.forecast &&
    (ownerFilter === 'All' || o.owner === ownerFilter) &&
    monthKey(o.invoiceDate || o.orderDate) &&
    monthKey(o.invoiceDate || o.orderDate) <= horizon
  )

  const byMonth = {}
  for (const o of inScope) {
    const k = monthKey(o.invoiceDate || o.orderDate)
    byMonth[k] = (byMonth[k] || 0) + (+o.valueK || 0)
  }
  const months = Object.keys(byMonth).sort()
  const totalK = months.reduce((s, k) => s + byMonth[k], 0)
  const pipelineK = open.reduce((s, o) => s + (+o.valueK || 0), 0)
  const won = store.opportunities.filter(o => o.stage === 'Won')
  const lost = store.opportunities.filter(o => o.stage === 'Lost')

  return (
    <div className="page">
      <h2>Pivot — Forecast Roll-up (Forecast-ticked, open opportunities)</h2>
      <div className="toolbar">
        <label>Owner:{' '}
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}>
            {owners.map(p => <option key={p}>{p}</option>)}
          </select>
        </label>
        <label>Until:{' '}
          <select value={horizon} onChange={e => setHorizon(e.target.value)}>
            <option value="2026-09">Sep-26</option>
            <option value="2026-12">Dec-26 (calendar year)</option>
            <option value="2027-03">Mar-27 (FY end)</option>
            <option value="2027-12">Dec-27</option>
          </select>
        </label>
        <span className="spacer" />
        <button onClick={() => exportCSV('forecast_pivot.csv', ['Month', 'Value (K₹)'], months.map(k => [monthLabel(k), byMonth[k]]))}>Extract to Excel</button>
      </div>

      <div className="stat-row">
        <div className="stat-card"><div className="label">Forecast till {monthLabel(horizon)}</div><div className="value">{fmtLakh(totalK)}</div></div>
        <div className="stat-card"><div className="label">Total open pipeline</div><div className="value">{fmtLakh(pipelineK)}</div></div>
        <div className="stat-card"><div className="label">Open opportunities</div><div className="value">{open.length}</div></div>
        <div className="stat-card"><div className="label">Won / Lost (FY)</div><div className="value">{won.length} / {lost.length}</div></div>
      </div>

      <div className="sheet-wrap" style={{ maxWidth: 560 }}>
        <table className="sheet">
          <thead><tr><th>Row Labels (Invoice Month)</th><th>Sum of Value (K₹)</th><th></th></tr></thead>
          <tbody>
            {months.map(k => (
              <tr key={k}>
                <td>{monthLabel(k)}</td>
                <td className="num">{fmt(byMonth[k])}</td>
                <td>
                  <div style={{ background: '#217346', height: 12, width: `${Math.max(3, (byMonth[k] / Math.max(...months.map(m => byMonth[m]))) * 220)}px` }} />
                </td>
              </tr>
            ))}
            {!months.length && <tr><td colSpan={3} className="hint">Nothing in the forecast window — tick the Forecast box on tracker rows and set likely invoice dates.</td></tr>}
          </tbody>
          <tfoot>
            <tr><td>Grand Total</td><td className="num">{fmt(totalK)}</td><td>{fmtLakh(totalK)}</td></tr>
          </tfoot>
        </table>
      </div>

      <div className="section-title">Rows in this roll-up</div>
      <div className="sheet-wrap">
        <table className="sheet">
          <thead><tr><th>Opp ID</th><th>Customer</th><th>Opportunity</th><th>Owner</th><th>Stage</th><th>Invoice Month</th><th>Value (K₹)</th></tr></thead>
          <tbody>
            {inScope.map(o => (
              <tr key={o.id}>
                <td className="oppid">{o.id}</td><td>{o.sellTo}</td><td>{o.oppName}</td>
                <td>{o.owner}</td><td>{o.stage}</td>
                <td>{monthLabel(monthKey(o.invoiceDate || o.orderDate))}</td>
                <td className="num">{fmt(o.valueK)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sheet-tabs">
        <div className="tab active">Pivot</div>
        <div className="tab" onClick={() => nav('/')}>Opportunities</div>
        <div className="tab" onClick={() => nav('/')}>Old Closed Opps</div>
        <div className="tab">＋</div>
      </div>
    </div>
  )
}
