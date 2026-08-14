import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { fmt, fmtLakh, monthKey, monthLabel, exportCSV, canViewCommercial } from '../utils.js'

// The "Pivot" sheet, shaped like the real one: rows = customers, columns =
// Expected Order Date months, values = Sum of Value (K₹), with an Expected Order Date quarter
// range slicer on top.
const quarterOf = k => `${k.slice(0, 4)}-Q${Math.ceil(parseInt(k.slice(5, 7), 10) / 3)}`
const QUARTERS = []
for (let y = 2024; y <= 2027; y++) for (let q = 1; q <= 4; q++) QUARTERS.push(`${y}-Q${q}`)

export default function Dashboard() {
  const store = useStore()
  const nav = useNavigate()
  const [ownerFilter, setOwnerFilter] = useState('All')
  const [fromQ, setFromQ] = useState('2026-Q2')
  const [toQ, setToQ] = useState('2027-Q4')
  const [forecastOnly, setForecastOnly] = useState(true)

  // The whole pivot is Sum of Value — commercial data, restricted per role.
  if (!canViewCommercial(store.role)) {
    return (
      <div className="page">
        <h2>Pivot — Sum of Value (K₹) by Customer × Order Month</h2>
        <div className="restricted" style={{ maxWidth: 640 }}>
          Restricted — the forecast pivot rolls up commercial values and is visible to approvers/admin only.
          Switch the acting-as persona in the header to view it.
        </div>
      </div>
    )
  }

  const owners = ['All', ...new Set(store.opportunities.map(o => o.owner))]

  const open = store.opportunities.filter(o =>
    o.status === 'Open' && (ownerFilter === 'All' || o.owner === ownerFilter))

  const inScope = open.filter(o => {
    if (forecastOnly && !o.forecast) return false
    const k = monthKey(o.orderDate)
    if (!k) return false
    const q = quarterOf(k)
    return q >= fromQ && q <= toQ
  })

  // customer × order-month matrix
  const matrix = {}
  const monthSet = new Set()
  for (const o of inScope) {
    const k = monthKey(o.orderDate)
    monthSet.add(k)
    matrix[o.sellTo] = matrix[o.sellTo] || {}
    matrix[o.sellTo][k] = (matrix[o.sellTo][k] || 0) + (+o.valueK || 0)
  }
  const months = [...monthSet].sort()
  const customers = Object.keys(matrix).sort()
  const rowTotal = c => months.reduce((s, k) => s + (matrix[c][k] || 0), 0)
  const colTotal = k => customers.reduce((s, c) => s + (matrix[c][k] || 0), 0)
  const grandTotal = customers.reduce((s, c) => s + rowTotal(c), 0)

  const pipelineK = open.reduce((s, o) => s + (+o.valueK || 0), 0)
  const won = store.opportunities.filter(o => o.stage === 'Won' && (ownerFilter === 'All' || o.owner === ownerFilter))
  const lost = store.opportunities.filter(o => o.stage === 'Lost' && (ownerFilter === 'All' || o.owner === ownerFilter))

  const doExport = () => exportCSV(
    'forecast_pivot.csv',
    ['Sum of Value (K₹)', ...months.map(monthLabel), 'Grand Total'],
    [...customers.map(c => [c, ...months.map(k => matrix[c][k] || ''), rowTotal(c)]),
     ['Grand Total', ...months.map(colTotal), grandTotal]]
  )

  return (
    <div className="page">
      <h2>Pivot — Sum of Value (K₹) by Customer × Order Month</h2>
      <div className="toolbar">
        <label>Owner:{' '}
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}>
            {owners.map(p => <option key={p}>{p}</option>)}
          </select>
        </label>
        <label>Expected Order Date:{' '}
          <select value={fromQ} onChange={e => setFromQ(e.target.value)}>
            {QUARTERS.map(q => <option key={q}>{q}</option>)}
          </select>
          {' '}→{' '}
          <select value={toQ} onChange={e => setToQ(e.target.value)}>
            {QUARTERS.map(q => <option key={q}>{q}</option>)}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={forecastOnly} onChange={e => setForecastOnly(e.target.checked)} />
          {' '}Forecast-ticked only
        </label>
        <span className="spacer" />
        <button onClick={doExport}>Extract to Excel</button>
      </div>

      <div className="stat-row">
        <div className="stat-card"><div className="label">Forecast {fromQ} → {toQ}</div><div className="value">{fmtLakh(grandTotal)}</div></div>
        <div className="stat-card"><div className="label">Total open pipeline</div><div className="value">{fmtLakh(pipelineK)}</div></div>
        <div className="stat-card"><div className="label">Open opportunities</div><div className="value">{open.length}</div></div>
        <div className="stat-card"><div className="label">Won / Lost (FY)</div><div className="value">{won.length} / {lost.length}</div></div>
      </div>

      <div className="sheet-wrap">
        <table className="sheet">
          <thead>
            <tr>
              <th>Sum of Value (K₹)</th>
              {months.map(k => <th key={k} className="num">{monthLabel(k)}</th>)}
              <th className="num">Grand Total</th>
            </tr>
          </thead>
          <tbody>
            {customers.map(c => (
              <tr key={c}>
                <td>{c}</td>
                {months.map(k => <td key={k} className="num">{matrix[c][k] ? `₹ ${fmt(matrix[c][k])}` : ''}</td>)}
                <td className="num"><b>₹ {fmt(rowTotal(c))}</b></td>
              </tr>
            ))}
            {!customers.length && (
              <tr><td colSpan={months.length + 2} className="hint">
                Nothing in this window — tick Forecast on tracker rows and set likely Expected Order Dates.
              </td></tr>
            )}
          </tbody>
          {customers.length > 0 && (
            <tfoot>
              <tr>
                <td>Grand Total</td>
                {months.map(k => <td key={k} className="num">₹ {fmt(colTotal(k))}</td>)}
                <td className="num">₹ {fmt(grandTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="section-title">Rows in this roll-up</div>
      <div className="sheet-wrap">
        <table className="sheet">
          <thead><tr><th>Opp ID</th><th>Customer</th><th>Opportunity</th><th>Owner</th><th>Stage</th><th>Prob</th><th>Order Month</th><th>Value (K₹)</th></tr></thead>
          <tbody>
            {inScope.map(o => (
              <tr key={o.id}>
                <td className="oppid">{o.id}</td><td>{o.sellTo}</td><td>{o.oppName}</td>
                <td>{o.owner}</td><td>{o.stage}</td><td>{o.prob || ''}</td>
                <td>{monthLabel(monthKey(o.orderDate))}</td>
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
