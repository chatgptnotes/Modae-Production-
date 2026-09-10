import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { OWNERS, ROLES } from '../seed.js'
import { canPriceProposal, canViewCommercial, isSalesOwner, fmtRupeesFromK, mmmYY, ddMmmYY, stageClass, productLabel, displayRole } from '../utils.js'
import { nextActionWith } from '../gates.js'
import { useDrawer } from '../drawer.jsx'
import { Icon } from '../icons.jsx'
import { COLS } from './Tracker.jsx'

// My Opportunities — a single table view of the pipeline (no Cards/Sheet
// toggle). Each row opens the same slide-in drawer the tracker uses, so every
// sheet field stays viewable and editable.
export default function MyOpps() {
  const store = useStore()
  const drawer = useDrawer()
  const [showAll, setShowAll] = useState(false)
  const [colView, setColView] = useState('key')

  const role = store.role
  const comm = canPriceProposal(role)
  // Sales owners may see cost and margin for proposal work; org-wide reports
  // remain protected by canViewCommercial elsewhere.
  const canSeeCommercial = canViewCommercial(role) || isSalesOwner(role)
  const mine = OWNERS.includes(role)
  // Where the next action sits — derived from the live blockers, overridden by
  // anything typed into the sheet's Next Action Pending Owner column.
  const na = o => nextActionWith(o, store.getProposal(o.id), store)

  let rows = [...store.opportunities]
    .sort((a, b) => (b.lastUpdated || '').localeCompare(a.lastUpdated || ''))
  // Role-based filtering: sales reps see only their opportunities by default
  // Admin/System Owner/Management roles see all opportunities by default
  const isAdmin = ROLES[role]?.admin || ROLES[role]?.commercial
  if (mine && !isAdmin && !showAll) rows = rows.filter(o => o.owner === role)

  const devCount = o => ((store.proposals[o.id] || {}).terms || []).filter(t => t.status === 'Deviation').length

  const fullCell = (o, key) => {
    if (['cogsK', 'gmK', 'gmPct'].includes(key) && !canSeeCommercial) return <Icon name="lock" size={12} />
    if (key === 'id') return <b>{o.id}</b>
    if (key === 'product') return productLabel(o.product) || '—'
    if (key === 'valueK') return o.valueK ? fmtRupeesFromK(o.valueK) : '—'
    if (key === 'cogsK') return o.cogsK ? fmtRupeesFromK(o.cogsK) : '—'
    if (key === 'gmK') return o.valueK ? fmtRupeesFromK((o.valueK || 0) - (o.cogsK || 0)) : '—'
    if (key === 'gmPct') return o.valueK ? `${Math.round((((o.valueK || 0) - (o.cogsK || 0)) / o.valueK) * 100)}%` : '—'
    if (key === 'createDate' || key === 'proposalDate' || key === 'orderDate' || key === 'invoiceDate') return o[key] ? mmmYY(o[key]) : '—'
    if (key === 'lastUpdated') return ddMmmYY(o[key]) || '—'
    if (key === 'forecast') return o.forecast ? 'Checked' : '—'
    if (key === 'nextActionOwner') return displayRole(na(o).owner) || '—'
    return o[key] || '—'
  }

  return (
    <div className="page">
      <h2>{mine ? `My Opportunities — ${displayRole(role)}` : 'Opportunities'}</h2>
      <div className="toolbar">
        {mine && !isAdmin && (
          <label className="show-all-toggle">
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
            Show All Opportunities
          </label>
        )}
        <span className="hint">{mine
          ? 'Your pipeline — click a row to view and edit every field.'
          : 'Click a row to view and edit every field of its sheet row.'}</span>
        <span className="spacer" />
        <button type="button" onClick={() => setColView(colView === 'key' ? 'all' : 'key')}>
          {colView === 'key' ? 'All columns' : 'Key columns'}
        </button>
        <Link className="btn primary" to="/new">Create Opportunity</Link>
      </div>

      <div className="sheet-wrap">
        {colView === 'all' ? (
          <table className="sheet">
            <thead>
              <tr><th>Sl</th>{COLS.map(col => <th key={col.key}>{col.label}</th>)}<th>Proposal</th></tr>
            </thead>
            <tbody>
              {rows.map(o => (
                <tr key={o.id} className="rowclick" onClick={() => drawer.open({ type: 'opp', id: o.id })}>
                  <td>{o.sl || '—'}</td>
                  {COLS.map(col => <td key={col.key} title={String(fullCell(o, col.key))}>{fullCell(o, col.key)}</td>)}
                  <td>Open ▸</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={COLS.length + 2}>Nothing here — no opportunities for this owner yet.</td></tr>}
            </tbody>
          </table>
        ) : (
        <table className="sheet opportunity-list">
          <thead>
            {/* Exactly the columns Biji listed on 13 Aug. Owner and Updated are
                deliberately absent: this list is already filtered to one owner,
                and Last Updated is system noise on a working list. */}
            <tr>
              <th>Opp ID</th><th>Customer</th><th>Opportunity</th>
              <th>Stage</th><th>Type</th><th>Prob</th>
              <th>{comm ? 'Value (₹)' : ''}</th>
              <th>Expected Order Date</th><th>Next Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(o => {
              const dc = devCount(o)
              return (
                <tr key={o.id} className="rowclick" onClick={() => drawer.open({ type: 'opp', id: o.id })}>
                  <td><b>{o.id}</b></td>
                  <td>{o.sellTo}</td>
                  <td className="opportunity-cell">
                    <span className="opportunity-name">{o.oppName}</span>
                    {store.approvals.some(a => a.oppId === o.id && a.status === 'Pending') && <span className="pill Amber" style={{ marginLeft: 6 }}>Approval pending</span>}
                    {dc > 0 && <span className="pill Red" style={{ marginLeft: 6 }}>{dc} deviation{dc > 1 ? 's' : ''}</span>}
                  </td>
                  <td><span className={`pill ${stageClass(o)}`}>{o.stage}</span></td>
                  <td>{o.oppType || '—'}</td>
                  <td>{o.prob || '—'}</td>
                  <td>{comm ? (o.valueK ? fmtRupeesFromK(o.valueK) : '—') : ''}</td>
                  <td className={o.status === 'Open' && !o.orderDate ? 'need' : ''}
                    title={o.orderDate ? '' : 'No expected order date set'}>
                    {o.orderDate ? mmmYY(o.orderDate) : '— set —'}
                  </td>
                  <td title={na(o).text}>
                    {na(o).owner
                      ? <span className={na(o).derived ? 'hint' : ''}>{displayRole(na(o).owner)}</span>
                      : <span className="hint">—</span>}
                  </td>
                </tr>
              )
            })}
            {!rows.length && (
              <tr><td colSpan={9}>Nothing here — no opportunities for this owner yet.</td></tr>
            )}
          </tbody>
        </table>
        )}
      </div>
    </div>
  )
}
