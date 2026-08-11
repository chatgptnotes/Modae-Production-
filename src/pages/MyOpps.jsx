import React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { OWNERS } from '../seed.js'
import { canViewCommercial, fmt, ddMmmYY } from '../utils.js'
import { useDrawer } from '../drawer.jsx'
import { Icon } from '../icons.jsx'

// Each tracker row as a card; tapping opens the same slide-in drawer as the
// grid, so every Excel field stays viewable and editable — nothing is lost
// versus the sheet, which stays one tap away.
export default function MyOpps() {
  const store = useStore()
  const nav = useNavigate()
  const drawer = useDrawer()
  const [params] = useSearchParams()
  const devOnly = params.get('filter') === 'deviations'

  const role = store.role
  const comm = canViewCommercial(role)
  const mine = OWNERS.includes(role)

  let rows = [...store.opportunities]
    .sort((a, b) => (b.lastUpdated || '').localeCompare(a.lastUpdated || ''))
  if (devOnly) {
    rows = rows.filter(o => o.status === 'Open'
      && ((store.proposals[o.id] || {}).terms || []).some(t => t.status === 'Deviation'))
  } else if (mine) {
    rows = rows.filter(o => o.owner === role)
  }

  const devCount = o => ((store.proposals[o.id] || {}).terms || []).filter(t => t.status === 'Deviation').length

  return (
    <div className="page">
      <h2>{devOnly ? 'Approvals / Deviations' : mine ? `My Opportunities — ${role}` : 'Opportunities — cards'}</h2>
      <div className="toolbar">
        <span className="hint">
          {devOnly
            ? 'Open opportunities whose proposal carries commercial deviations — each needs approval before submission.'
            : 'Tap a card to view and edit every field of its sheet row.'}
        </span>
        <span className="spacer" />
        <button className="primary"><Icon name="cards" size={13} /> Cards</button>
        <button onClick={() => nav('/')}><Icon name="sheet" size={13} /> Sheet</button>
      </div>

      <div className="opp-card-grid">
        {rows.map(o => {
          const gmK = (o.valueK || 0) - (o.cogsK || 0)
          const dc = devCount(o)
          return (
            <div key={o.id} className="opp-card" onClick={() => drawer.open({ type: 'opp', id: o.id })}>
              <div className="oc-top">
                <b>{o.id}</b>
                <span className={`pill ${o.customerStatus}`}>{o.customerStatus}</span>
              </div>
              <div className="oc-name" title={o.oppName}>{o.sellTo} — {o.oppName}</div>
              <div className="oc-meta">
                Stage: <b>{o.status === 'Closed' ? o.stage : o.stage}</b> · Prob: {o.prob || '—'} · {o.owner}
                {dc > 0 && <span className="pill Red" style={{ marginLeft: 6 }}>{dc} deviation{dc > 1 ? 's' : ''}</span>}
              </div>
              <div className="oc-meta">
                Value: {comm ? (o.valueK ? `₹ ${fmt(o.valueK)} K` : '—') : <Icon name="lock" size={11} />} · Updated {ddMmmYY(o.lastUpdated)}
              </div>
            </div>
          )
        })}
        {!rows.length && <p className="hint">Nothing here — {devOnly ? 'no open deviations.' : 'no opportunities for this owner yet.'}</p>}
      </div>
    </div>
  )
}
