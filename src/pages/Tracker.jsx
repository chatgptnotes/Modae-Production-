import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { STAGES, CLOSE_REASONS, CUSTOMER_STATUSES } from '../seed.js'
import { fmt, mmmYY, exportCSV } from '../utils.js'

const OPEN_STAGES = STAGES.filter(s => s !== 'Won' && s !== 'Lost')

export default function Tracker() {
  const store = useStore()
  const nav = useNavigate()
  const [sheet, setSheet] = useState('Opportunities') // Pivot | Opportunities | Old Closed Opps
  const [ownerFilter, setOwnerFilter] = useState('All')

  const all = [...store.opportunities].sort((a, b) => a.sl - b.sl)
  const owners = ['All', ...new Set(all.map(o => o.owner))]
  const rows = all.filter(o =>
    (ownerFilter === 'All' || o.owner === ownerFilter) &&
    (sheet !== 'Old Closed Opps' || o.status === 'Closed')
  )

  const gmK = o => (o.valueK || 0) - (o.cogsK || 0)
  const gmPct = o => (o.valueK ? Math.round((gmK(o) / o.valueK) * 100) + '%' : null)
  const totals = rows.reduce((t, o) => ({ v: t.v + (+o.valueK || 0), c: t.c + (+o.cogsK || 0) }), { v: 0, c: 0 })

  const upd = (id, field) => e => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    const patch = { [field]: value }
    if (field === 'status' && value === 'Open') Object.assign(patch, { closedReason: '' })
    if (field === 'stage' && (value === 'Won' || value === 'Lost')) patch.status = 'Closed'
    store.updateOpportunity(id, patch)
  }

  const doExport = () => exportCSV(
    'Sales_Pipeline_Report.csv',
    ['Sl','Opp ID','Sell To Customer','Category','Location','Customer Status','EUC Name','EUC Location','Opportunity Name','Owner','Opp Type','BU','Segment','Product','Value (K₹)','COGS (K₹)','GM (K₹)','GM%','Create Date','Proposal Date','Order Date','Invoice Date','Status','Stage','Closed Reason','Contact Person','Contact Phone #','Last Updated','Forecast','Update/Remarks'],
    rows.map(o => [o.sl,o.id,o.sellTo,o.category,o.location,o.customerStatus,o.eucName,o.eucLocation,o.oppName,o.owner,o.oppType,o.bu,o.segment,o.product,o.valueK,o.cogsK,gmK(o),gmPct(o)||'',o.createDate,o.proposalDate,o.orderDate,o.invoiceDate,o.status,o.stage,o.closedReason,o.contactPerson,o.contactPhone,o.lastUpdated,o.forecast?'Y':'N',o.remarks])
  )

  return (
    <div className="page">
      <h2>Sales Pipeline Report FY26–27 {sheet === 'Old Closed Opps' && '— Old Closed Opps'}</h2>
      <div className="toolbar">
        <label>Owner:{' '}
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}>
            {owners.map(p => <option key={p}>{p}</option>)}
          </select>
        </label>
        <span className="hint">Rows are never deleted — close them via Stage (Won/Lost) with a mandatory Closed Reason.</span>
        <span className="spacer" />
        <button onClick={doExport}>Extract to Excel</button>
        <Link className="btn primary" to="/new">+ New Opportunity</Link>
      </div>

      <div className="sheet-wrap">
        <table className="sheet">
          <thead>
            <tr>
              <th className="rowhead">Sl</th>
              {['Opp ID','Sell To Customer*','Category','Location','Customer Status','EUC Name*','EUC Location','Opportunity Name','Owner','Value (K₹)*','COGS (K₹)*','GM (K₹)','GM%','Create Date','Proposal Date','Order Date','Invoice Date','Status*','Stage*','Closed Reason*','Contact Person*','Contact Phone #','Last Updated','Forecast','Update/Remarks']
                .map(h => <th key={h}>{h}<span className="filter-caret">▼</span></th>)}
              <th>Proposal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(o => (
              <tr key={o.id}>
                <td className="rowhead">{o.sl}</td>
                <td className={`oppid ${o.stage === 'Won' ? 'won' : o.stage === 'Lost' ? 'lost' : ''}`}>
                  <Link to={`/folders/${o.id}`}>{o.id}</Link>
                </td>
                <td>{o.sellTo}</td>
                <td>{o.category}</td>
                <td>{o.location}</td>
                <td className={`cstat ${o.customerStatus}`}>{o.customerStatus}</td>
                <td>{o.eucName}</td>
                <td>{o.eucLocation}</td>
                <td title={o.oppName} style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.oppName}</td>
                <td>{o.owner}</td>
                <td className="num"><input type="number" value={o.valueK || ''} onChange={upd(o.id, 'valueK')} style={{ textAlign: 'right', width: 70 }} placeholder="-" /></td>
                <td className="num"><input type="number" value={o.cogsK || ''} onChange={upd(o.id, 'cogsK')} style={{ textAlign: 'right', width: 70 }} placeholder="-" /></td>
                <td className="num">{o.valueK ? fmt(gmK(o)) : '-'}</td>
                {gmPct(o) ? <td className="num">{gmPct(o)}</td> : <td className="err">#DIV/0!</td>}
                <td>{mmmYY(o.createDate)}</td>
                <td>{mmmYY(o.proposalDate)}</td>
                <td><input type="date" value={o.orderDate} onChange={upd(o.id, 'orderDate')} style={{ width: 108 }} /></td>
                <td><input type="date" value={o.invoiceDate} onChange={upd(o.id, 'invoiceDate')} style={{ width: 108 }} /></td>
                <td>
                  <select value={o.status} onChange={upd(o.id, 'status')}>
                    <option>Open</option><option>Closed</option>
                  </select>
                </td>
                <td>
                  <select value={o.stage} onChange={upd(o.id, 'stage')}>
                    {(o.status === 'Closed' ? STAGES : OPEN_STAGES.concat(['Won', 'Lost'])).map(s => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td>
                  {o.status === 'Closed' ? (
                    <select value={o.closedReason} onChange={upd(o.id, 'closedReason')}>
                      <option value="">— required —</option>
                      {CLOSE_REASONS.map(r => <option key={r}>{r}</option>)}
                    </select>
                  ) : ''}
                </td>
                <td>{o.contactPerson}</td>
                <td>{o.contactPhone}</td>
                <td>{mmmYY(o.lastUpdated)}</td>
                <td style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={!!o.forecast} onChange={upd(o.id, 'forecast')} title="Include for roll-up" />
                </td>
                <td><input type="text" value={o.remarks} onChange={upd(o.id, 'remarks')} style={{ minWidth: 220 }} /></td>
                <td><Link to={`/proposal/${o.id}`}>Open ▸</Link></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="rowhead"></td>
              <td colSpan={9}>Totals</td>
              <td className="num">₹ {fmt(totals.v)}</td>
              <td className="num">₹ {fmt(totals.c)}</td>
              <td className="num">₹ {fmt(totals.v - totals.c)}</td>
              <td className="num">{totals.v ? Math.round(((totals.v - totals.c) / totals.v) * 100) + '%' : ''}</td>
              <td colSpan={12}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="sheet-tabs">
        {['Pivot', 'Opportunities', 'Old Closed Opps'].map(t => (
          <div key={t} className={`tab ${sheet === t ? 'active' : ''}`}
            onClick={() => (t === 'Pivot' ? nav('/dashboard') : setSheet(t))}>
            {t}
          </div>
        ))}
        <div className="tab">＋</div>
      </div>
    </div>
  )
}
