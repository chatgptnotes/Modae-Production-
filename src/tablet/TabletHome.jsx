import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ROLES } from '../seed.js'
import { canViewCommercial, fmtLakh, ddMmmYY, displayRole, displayRoleLabel } from '../utils.js'
import { buildTabletTiles, TABLET_SECTIONS, tabletRoleGroup } from './tabletTiles.js'
import { counts, pipelineSeries, winRate, turnaround } from '../kpi.js'
import { Sparkline, DonutGauge, ArcGauge, TrendPill } from '../dashviz.jsx'
import { Icon } from '../icons.jsx'

export default function TabletHome() {
  const store = useStore()
  const nav = useNavigate()
  const role = store.role
  const comm = canViewCommercial(role)

  const tiles = buildTabletTiles(store)
  const byKey = Object.fromEntries(tiles.map(t => [t.key, t]))
  const sections = TABLET_SECTIONS[tabletRoleGroup(role)] || TABLET_SECTIONS.sales

  const placed = new Set(sections.flatMap(s => s.keys))
  const leftovers = tiles.filter(t => !placed.has(t.key))

  const c = counts(store, role)
  const series = pipelineSeries(store, comm)
  const win = winRate(store)
  const ta = turnaround(store)

  const Tile = ({ t }) => (
    <button className={`dash-tile tint-${t.color}`} onClick={() => nav(t.to)}>
      {t.badge > 0 && <span className="dash-badge" title={t.badgeHint}>{t.badge}</span>}
      <span className="dash-tile-icon"><Icon name={t.icon} size={18} /></span>
      <span className="dash-tile-label">{t.label}</span>
      {t.hint && <span className="dash-tile-hint">{t.hint}</span>}
    </button>
  )

  const QUICK = [
    { icon: 'plus', to: '/new', title: 'Create opportunity' },
    { icon: 'inbox', to: '/inbox', title: 'Lead inbox' },
    { icon: 'mic', to: '/voice', title: 'Voice update' },
    { icon: 'checkCircle', to: '/approvals', title: 'Approvals' },
    { icon: 'folder', to: '/folders', title: 'Files & folders' },
  ]

  const KPI = {
    command: (
      <div key="command" className="dash-tile feature">
        <div className="feature-head">
          <span className="dash-tile-icon tint-sky"><Icon name="target" size={18} /></span>
          <span className="dash-tile-label">Command centre</span>
        </div>
        <div className="cmd-stats">
          <button onClick={() => nav('/inbox')}><b>{c.newLeads}</b><span>New leads</span></button>
          <button onClick={() => nav('/approvals')}>
            <b>{c.forMe || c.myPending}</b><span>{c.forMe ? 'Await you' : 'Your requests'}</span>
          </button>
          <button onClick={() => nav('/my')}><b>{c.myStale || c.stale}</b><span>Need update</span></button>
        </div>
        <div className="cmd-actions">
          {QUICK.map(q => (
            <button key={q.to + q.icon} title={q.title} onClick={() => nav(q.to)}>
              <Icon name={q.icon} size={15} />
            </button>
          ))}
        </div>
      </div>
    ),
    turnaround: (
      <div key="turnaround" className="dash-tile feature">
        <div className="feature-head">
          <span className="dash-tile-icon tint-teal"><Icon name="clock" size={18} /></span>
          <span className="dash-tile-label">Proposal turnaround</span>
        </div>
        <div className="feature-body center">
          <ArcGauge pct={ta.pct} value={`${ta.pct}%`} />
        </div>
        <div className="feature-foot">
          {ta.onTime} of {ta.total} within target · avg {ta.avgDays} d
          <span className="dash-tile-hint">Spares 24 h · projects 2 weeks</span>
        </div>
      </div>
    ),
    pipeline: (
      <div key="pipeline" className="dash-tile feature">
        <div className="feature-head">
          <span className="dash-tile-icon tint-navy"><Icon name="chartLine" size={18} /></span>
          <span className="dash-tile-label">{comm ? 'Pipeline trend' : 'Opportunity trend'}</span>
          <TrendPill delta={series.deltaPct} />
        </div>
        <div className="feature-body">
          <Sparkline points={series.points} />
        </div>
        <div className="feature-foot">
          {comm
            ? <><b>{fmtLakh(series.total)}</b> open · <b>{fmtLakh(series.weighted)}</b> weighted</>
            : <><b>{c.open}</b> open opportunities · <b>{c.mine}</b> yours</>}
          <span className="dash-tile-hint">
            {series.points.length ? `${series.points[0].label} — ${series.points[series.points.length - 1].label}` : 'No history yet'}
          </span>
        </div>
      </div>
    ),
    winrate: (
      <div key="winrate" className="dash-tile feature">
        <div className="feature-head">
          <span className="dash-tile-icon tint-green"><Icon name="checkCircle" size={18} /></span>
          <span className="dash-tile-label">Win rate</span>
        </div>
        <div className="feature-body center">
          <DonutGauge pct={win.pct} />
        </div>
        <div className="feature-foot">
          {win.won} won · {win.lost} lost
          <span className="dash-tile-hint">Of {win.decided} closed opportunities</span>
        </div>
      </div>
    ),
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="tablet-dash">
      <div className="dash-greet">
        <div>
          <h2>Good day, {displayRole(role)}</h2>
          <p>{ddMmmYY(today)} · {displayRoleLabel(role)}</p>
        </div>
      </div>

      {sections.map(sec => {
        const secTiles = sec.keys.map(k => byKey[k]).filter(Boolean)
        const widgets = (sec.kpis || []).map(k => KPI[k]).filter(Boolean)
        if (!secTiles.length && !widgets.length) return null
        return (
          <section key={sec.title} className="dash-section">
            <div className="dash-head">
              <span>{sec.title}</span>
              <span className="dash-head-count">{secTiles.length}</span>
            </div>
            <div className="dash-grid">
              {widgets}
              {secTiles.map(t => <Tile key={t.key} t={t} />)}
            </div>
          </section>
        )
      })}

      {leftovers.length > 0 && (
        <section className="dash-section">
          <div className="dash-head">
            <span>More tools</span>
            <span className="dash-head-count">{leftovers.length}</span>
          </div>
          <div className="dash-grid">
            {leftovers.map(t => <Tile key={t.key} t={t} />)}
          </div>
        </section>
      )}
    </div>
  )
}
