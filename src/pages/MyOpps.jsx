import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { OWNERS, ROLES } from '../seed.js'
import { canViewCommercial, fmt, ddMmmYY, stageClass } from '../utils.js'
import { useDrawer } from '../drawer.jsx'
import { Icon } from '../icons.jsx'

// My Opportunities — a single table view of the pipeline (no Cards/Sheet
// toggle). Each row opens the same slide-in drawer the tracker uses, so every
// sheet field stays viewable and editable.
export default function MyOpps() {
  const store = useStore()
  const drawer = useDrawer()
  const [showAll, setShowAll] = useState(false)

  const role = store.role
  const comm = canViewCommercial(role)
  const mine = OWNERS.includes(role)

  let rows = [...store.opportunities]
    .sort((a, b) => (b.lastUpdated || '').localeCompare(a.lastUpdated || ''))
  // Role-based filtering: sales reps see only their opportunities by default
  // Admin/System Owner/Management roles see all opportunities by default
  const isAdmin = ROLES[role]?.admin || ROLES[role]?.commercial
  if (mine && !isAdmin && !showAll) rows = rows.filter(o => o.owner === role)

  const devCount = o => ((store.proposals[o.id] || {}).terms || []).filter(t => t.status === 'Deviation').length

  return (
    <div className="page">
      <h2>{mine ? `My Opportunities — ${role}` : 'Opportunities'}</h2>
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
      </div>

      <div className="sheet-wrap">
        <table className="sheet">
          <thead>
            <tr>
              <th>Opp ID</th><th>Customer</th><th>Opportunity</th>
              <th>Stage</th><th>Prob</th><th>Owner</th>
              <th>{comm ? 'Value (K₹)' : ''}</th><th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(o => {
              const dc = devCount(o)
              return (
                <tr key={o.id} className="rowclick" onClick={() => drawer.open({ type: 'opp', id: o.id })}>
                  <td><b>{o.id}</b></td>
                  <td>{o.sellTo}</td>
                  <td style={{ maxWidth: 360 }}>
                    {o.oppName}
                    {store.approvals.some(a => a.oppId === o.id && a.status === 'Pending') && <span className="pill Amber" style={{ marginLeft: 6 }}>Approval pending</span>}
                    {dc > 0 && <span className="pill Red" style={{ marginLeft: 6 }}>{dc} deviation{dc > 1 ? 's' : ''}</span>}
                  </td>
                  <td><span className={`pill ${stageClass(o)}`}>{o.stage}</span></td>
                  <td>{o.prob || '—'}</td>
                  <td>{o.owner}</td>
                  <td>{comm ? (o.valueK ? `₹ ${fmt(o.valueK)}` : '—') : ''}</td>
                  <td>{ddMmmYY(o.lastUpdated)}</td>
                </tr>
              )
            })}
            {!rows.length && (
              <tr><td colSpan={8}>Nothing here — no opportunities for this owner yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
