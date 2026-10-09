import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { OWNERS, displayOpportunityId } from '../seed.js'
import { canPriceProposal, canViewCommercial, isSalesOwner, fmtRupeesFromK, ddMmmYY, ddMMyyyy, stageClass, productDisplayLabel, displayRole, isHiddenDashboardOpportunity } from '../utils.js'
import { nextActionWith } from '../gates.js'
import { useDrawer } from '../drawer.jsx'
import { Icon } from '../icons.jsx'
import { COLS } from './Tracker.jsx'
import { useWorkspaceView } from '../ui/WorkspaceViewContext.jsx'
import { usePagedRows } from '../ui/Pagination.jsx'
import usePhoneLayout from '../tablet/usePhoneLayout.js'

// My Opportunities — a single table view of the pipeline (no Cards/Sheet
// toggle). Each row opens the same slide-in drawer the tracker uses, so every
// sheet field stays viewable and editable.
export default function MyOpps() {
  const store = useStore()
  const { scope } = useWorkspaceView()
  const drawer = useDrawer()
  const [colView, setColView] = useState('key')
  const phone = usePhoneLayout() && store.viewMode === 'tablet'
  const [table, setTable] = useState(false)
  const [query, setQuery] = useState('')

  const role = store.role
  const comm = canPriceProposal(role)
  // Sales owners may see cost and margin for proposal work; org-wide reports
  // remain protected by canViewCommercial elsewhere.
  const canSeeCommercial = canViewCommercial(role) || isSalesOwner(role)
  const mine = OWNERS.includes(role)
  // Where the next action sits — derived from the live blockers, overridden by
  // anything typed into the sheet's Next Action Pending Owner column.
  const na = o => nextActionWith(o, store.getProposal(o.id), store)

  let rows = store.opportunities.filter(o => !isHiddenDashboardOpportunity(o))
    .sort((a, b) => (b.lastUpdated || '').localeCompare(a.lastUpdated || ''))
  // Role-based filtering: sales reps see only their opportunities by default
  // Admin/System Owner/Management roles see all opportunities by default
  if (scope === 'my') rows = rows.filter(o => o.owner === role)
  const search = query.trim().toLowerCase()
  if (phone && search) rows = rows.filter(o => [o.id, displayOpportunityId(o.id), o.sellTo, o.oppName, o.stage].some(value => String(value || '').toLowerCase().includes(search)))
  const { pagedRows: pageRows, pagination } = usePagedRows(rows, JSON.stringify([scope, colView, phone && query]))

  const devCount = o => ((store.proposals?.[o.id] || {}).terms || []).filter(t => t.status === 'Deviation').length

  const fullCell = (o, key) => {
    if (['cogsK', 'gmK', 'gmPct'].includes(key) && !canSeeCommercial) return <Icon name="lock" size={12} />
    if (key === 'id') return <b>{displayOpportunityId(o.id)}</b>
    if (key === 'product') return productDisplayLabel(o.product) || '—'
    if (key === 'valueK') return o.valueK ? fmtRupeesFromK(o.valueK) : '—'
    if (key === 'cogsK') return o.cogsK ? fmtRupeesFromK(o.cogsK) : '—'
    if (key === 'gmK') return o.valueK ? fmtRupeesFromK((o.valueK || 0) - (o.cogsK || 0)) : '—'
    if (key === 'gmPct') return o.valueK ? `${Math.round((((o.valueK || 0) - (o.cogsK || 0)) / o.valueK) * 100)}%` : '—'
    if (key === 'createDate' || key === 'proposalDate' || key === 'orderDate' || key === 'invoiceDate') return o[key] ? ddMMyyyy(o[key]) : '—'
    if (key === 'lastUpdated') return ddMmmYY(o[key]) || '—'
    if (key === 'forecast') return o.forecast ? 'Checked' : '—'
    if (key === 'nextActionOwner') return displayRole(na(o).owner) || '—'
    return o[key] || '—'
  }

  return (
    <div className="page status-update-page">
      <h2>{scope === 'my' ? `My Opportunities${mine ? ` — ${displayRole(role)}` : ''}` : 'Opportunities'}</h2>
      <div className="toolbar">
        <span className="hint">{scope === 'my'
          ? 'Your pipeline — click a row to view and edit every field.'
          : 'Company pipeline — click a row to view and edit every field.'}</span>
        <span className="spacer" />
        {phone && <button type="button" onClick={() => setTable(!table)} aria-pressed={table}>{table ? 'Show list' : 'Edit in table'}</button>}
        {(!phone || table) && <button type="button" onClick={() => setColView(colView === 'key' ? 'all' : 'key')}>
          {colView === 'key' ? 'All columns' : 'Key columns'}
        </button>}
        <Link className="btn primary" to="/new">Create Opportunity</Link>
      </div>

      {phone && <label className="phone-status-search">Search opportunities<input type="search" placeholder="Customer, opportunity, ID or stage" value={query} onChange={event => setQuery(event.target.value)} /></label>}
      {phone && !table ? <section aria-label="Opportunities to update">
        {pageRows.map(o => <button type="button" className="phone-record" key={o.id} onClick={() => drawer.open({ type: 'opp', id: o.id })}>
          <strong>{o.sellTo || 'Customer not recorded'}</strong>
          <span>{o.oppName}</span>
          <small>{displayOpportunityId(o.id)} · {o.stage} · {o.prob || 'Probability not set'}</small>
          <span>{na(o).text || 'No next action recorded'}</span>
          {na(o).owner && <small>Next action: {displayRole(na(o).owner)}</small>}
          <small>Expected order: {o.orderDate ? ddMMyyyy(o.orderDate) : 'Not set'}{comm && o.valueK ? ` · ${fmtRupeesFromK(o.valueK)}` : ''}</small>
          {store.approvals.some(a => a.oppId === o.id && a.status === 'Pending') && <small>Approval pending</small>}
          {devCount(o) > 0 && <small>{devCount(o)} commercial deviations</small>}
        </button>)}
        {!pageRows.length && <p className="phone-empty">No opportunities match this view.</p>}
      </section> : <div className="sheet-wrap">
        {colView === 'all' ? (
          <table className="sheet">
            <thead>
              <tr><th>Sl</th>{COLS.map(col => <th key={col.key}>{col.label}</th>)}<th>Proposal</th></tr>
            </thead>
            <tbody>
              {pageRows.map(o => (
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
            {pageRows.map(o => {
              const dc = devCount(o)
              return (
                <tr key={o.id} className="rowclick" onClick={() => drawer.open({ type: 'opp', id: o.id })}>
                  <td><b>{displayOpportunityId(o.id)}</b></td>
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
                    {o.orderDate ? ddMMyyyy(o.orderDate) : '— set —'}
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
      </div>}
      {pagination}
    </div>
  )
}
