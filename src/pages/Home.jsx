import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ROLES } from '../seed.js'
import { isApprover } from '../utils.js'
import { buildTiles, roleGroup } from '../tiles.js'
import { useDrawer } from '../drawer.jsx'
import { KpiCard } from '../ui.jsx'
import { Icon } from '../icons.jsx'

// Tiles come from the shared registry (src/tiles.js) so the desktop Home and
// the tablet launcher never drift; only the "Generate Proposal" action tile is
// local (it needs the pick modal).
const FOR_YOU = {
  sales: ['inbox', 'new', 'tender', 'my'],
  approver: ['approvals', 'inbox', 'dashboard', 'tracker'],
  admin: ['users', 'audit', 'pricelists', 'tender'],
}

export default function Home() {
  const store = useStore()
  const nav = useNavigate()
  const drawer = useDrawer()
  const [q, setQ] = useState('')
  const [pick, setPick] = useState(false)

  const role = store.role
  const approver = isApprover(role)

  const openOpps = store.opportunities.filter(o => o.status === 'Open')
  const myOpen = openOpps.filter(o => o.owner === role).length
  const unproposed = openOpps.filter(o => !o.proposalDate).length
  const newLeads = (store.leads || []).filter(l => l.status === 'New').length
  const pendingApprovals = (store.approvals || []).filter(a => a.status === 'Pending').length

  const TILES = [...buildTiles(store)]
  TILES.splice(2, 0, {
    key: 'genprop', icon: 'fileText', label: 'Generate Proposal', hint: 'Pick an open opportunity',
    action: () => setPick(true), badge: unproposed, badgeHint: 'open opportunities without a proposal',
  })

  const primaryKeys = FOR_YOU[roleGroup(role)]
  const primary = primaryKeys.map(k => TILES.find(t => t.key === k)).filter(Boolean)
  const rest = TILES.filter(t => !primaryKeys.includes(t.key))

  const ql = q.trim().toLowerCase()
  const hits = ql ? [
    ...store.opportunities
      .filter(o => o.id.toLowerCase().includes(ql) || o.sellTo.toLowerCase().includes(ql) || o.oppName.toLowerCase().includes(ql))
      .slice(0, 6)
      .map(o => ({ type: 'opp', id: o.id, label: `${o.id} — ${o.sellTo} — ${o.oppName}` })),
    ...store.customers
      .filter(c => c.name.toLowerCase().includes(ql))
      .slice(0, 3)
      .map(c => ({ type: 'customer', id: c.name, label: `Customer · ${c.name}` })),
  ].slice(0, 8) : []

  const Tile = ({ t, big }) => (
    <div className={`tile ${big ? 'big' : ''}`} onClick={() => (t.action ? t.action() : nav(t.to))}>
      {t.badge > 0 && <span className="tile-badge" title={t.badgeHint}>{t.badge}</span>}
      <span className="tile-icon"><Icon name={t.icon} size={big ? 30 : 24} /></span>
      <span className="tile-label">{t.label}</span>
      {t.hint && <span className="tile-hint">{t.hint}</span>}
    </div>
  )

  return (
    <div className="page">
      <h2>Home — {ROLES[role]?.name}</h2>

      <div className="kpi-row">
        <KpiCard label="New leads" value={newLeads} hint="Leads to qualify in the inbox" onClick={() => nav('/inbox')} />
        {approver && (
          <KpiCard label="Pending approvals" value={pendingApprovals} hint="Decisions waiting on an approver" onClick={() => nav('/approvals')} />
        )}
        <KpiCard label="My open opportunities" value={myOpen} hint="Open opportunities you own" onClick={() => nav('/my')} />
      </div>

      <input className="tile-search" type="text" placeholder="Search opportunities, customers…"
        value={q} onChange={e => setQ(e.target.value)} />
      {hits.length > 0 && (
        <div className="tile-hits">
          {hits.map(h => (
            <div key={h.type + h.id} className="tile-hit"
              onClick={() => { drawer.open({ type: h.type === 'opp' ? 'opp' : 'customer', id: h.id }); setQ('') }}>
              {h.label}
            </div>
          ))}
        </div>
      )}

      <div className="tile-section">For you</div>
      <div className="tile-grid primary">
        {primary.map(t => <Tile key={t.key} t={t} big />)}
      </div>

      {rest.length > 0 && (
        <>
          <div className="tile-section">All tools</div>
          <div className="tile-grid">
            {rest.map(t => <Tile key={t.key} t={t} />)}
          </div>
        </>
      )}

      {pick && (
        <>
          <div className="filter-overlay" onClick={() => setPick(false)} />
          <div className="modal form-card">
            <div className="section-title">Generate proposal — pick an open opportunity</div>
            <div className="pick-list">
              {[...openOpps].sort((a, b) => (b.lastUpdated || '').localeCompare(a.lastUpdated || '')).map(o => (
                <div key={o.id} className="tile-hit" onClick={() => nav(`/proposal/${o.id}`)}>
                  <b>{o.id}</b> — {o.sellTo} <span className="hint">{o.oppName.slice(0, 48)}{o.proposalDate ? '' : ' · no proposal yet'}</span>
                </div>
              ))}
            </div>
            <div className="forms-actions"><button onClick={() => setPick(false)}>Cancel</button></div>
          </div>
        </>
      )}
    </div>
  )
}
