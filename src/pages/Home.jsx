import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ROLES } from '../seed.js'
import { canViewCommercial, isAdminRole, ageDays } from '../utils.js'
import { useDrawer } from '../drawer.jsx'
import { Icon } from '../icons.jsx'

// Every tile is a door into a screen the app already has — one registry,
// filtered and ordered by the signed-in role. No duplicated screens.
const roleGroup = role =>
  isAdminRole(role) ? 'admin' : role === 'LJS' || role === 'AH' ? 'approver' : 'sales'

const FOR_YOU = {
  sales: ['new', 'tender', 'my', 'genprop'],
  approver: ['approvals', 'dashboard', 'tracker', 'analytics'],
  admin: ['users', 'pricelists', 'customers', 'tender'],
}

export default function Home() {
  const store = useStore()
  const nav = useNavigate()
  const drawer = useDrawer()
  const [q, setQ] = useState('')
  const [pick, setPick] = useState(false)

  const role = store.role
  const comm = canViewCommercial(role)
  const admin = isAdminRole(role)

  const openOpps = store.opportunities.filter(o => o.status === 'Open')
  const stale = openOpps.filter(o => (ageDays(o.lastUpdated) ?? 0) > 30).length
  const unproposed = openOpps.filter(o => !o.proposalDate).length
  const deviations = openOpps.filter(o =>
    ((store.proposals[o.id] || {}).terms || []).some(t => t.status === 'Deviation')).length

  const TILES = [
    { key: 'new', icon: 'plus', label: 'Add Lead', hint: 'Intake form — row + folder created on submit', to: '/new' },
    { key: 'tender', icon: 'bot', label: 'Tender → Proposal', hint: 'Upload an RFQ PDF, AI extracts it', to: '/tender' },
    { key: 'my', icon: 'cards', label: 'My Opportunities', hint: 'Your pipeline as cards', to: '/my', badge: stale, badgeHint: 'not updated in 30+ days' },
    { key: 'genprop', icon: 'fileText', label: 'Generate Proposal', hint: 'Pick an open opportunity', action: () => setPick(true), badge: unproposed, badgeHint: 'open opportunities without a proposal' },
    { key: 'approvals', icon: 'checkCircle', label: 'Approvals / Deviations', hint: 'Proposals with commercial deviations', to: '/my?filter=deviations', show: role === 'LJS' || role === 'AH' || admin, badge: deviations, badgeHint: 'open deviations' },
    { key: 'tracker', icon: 'sheet', label: 'All Opportunities', hint: 'The pipeline sheet', to: '/' },
    { key: 'folders', icon: 'folder', label: 'Folders', hint: 'Customer Specs · Partner Docs · Proposal', to: '/folders' },
    { key: 'dashboard', icon: 'chartBar', label: 'Pivot / Forecast', hint: 'Order intake by month', to: '/dashboard', show: comm },
    { key: 'analytics', icon: 'chartLine', label: 'Analytics', hint: 'Funnel, ageing, win/loss', to: '/analytics' },
    { key: 'pricelists', icon: 'tag', label: 'Price Lists', hint: 'B&K · Metrix · ad-hoc quotes', to: '/pricelists', show: comm },
    { key: 'customers', icon: 'users', label: 'Customers', hint: 'Master + classification', to: '/customers' },
    { key: 'users', icon: 'shield', label: 'Users & Roles', hint: 'Accounts and approvals', to: '/users', show: admin },
  ].filter(t => t.show !== false)

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
