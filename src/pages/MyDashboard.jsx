import React, { useEffect, useId, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ROLES, OWNERS } from '../seed.js'
import { readiness, isBlocked, nextActionWith } from '../gates.js'
import { isApprover, isAdminRole, isSalesOwner, canViewCommercial, canPriceProposal, fmtLakh, ddMmmYY, displayRole, displayRoleLabel, isHiddenDashboardOpportunity } from '../utils.js'
import { analyticsSnapshot, counts, salesPerformance, FY_QUARTERS, FY_MONTHS, PROB_WEIGHT } from '../kpi.js'
import { ArcGauge } from '../dashviz.jsx'
import { Icon } from '../icons.jsx'
import Analytics, { Funnel as AnalyticsFunnel } from './Analytics.jsx'
import ForecastDashboard from './Dashboard.jsx'

// My Dashboard — "there has to be something called My Dashboard… it will be
// different for all the roles" (13 Aug review). The salesperson's version is
// the one the client walked through in the HTML prototype: target, attainment,
// quarterly performance, then their own work queue.

const roleLabel = role => displayRoleLabel(role) || role

function Metric({ label, value, hint, tone = '', onClick, variant = '' }) {
  const El = onClick ? 'button' : 'div'
  return (
    <El className={`stat-card-v2 tone-${tone}${onClick ? ' clickable' : ''}${variant ? ` ${variant}` : ''}`} onClick={onClick}>
      <span className="sc-value">{value}</span>
      <span className="sc-label">{label}</span>
      {hint && <span className="hint">{hint}</span>}
    </El>
  )
}

function Card({ title, icon, tone = '', span = 6, children, action, className = '' }) {
  return (
    <section className={`ana-card dashboard-card c-${span}${className ? ` ${className}` : ''}`}>
      <div className="ana-title">
        {icon && <span className={`ana-ico ${tone}`}><Icon name={icon} size={15} /></span>}
        <span className="dashboard-card-title">{title}</span>
        {action && <span className="ana-title-action">{action}</span>}
      </div>
      {children}
    </section>
  )
}

function ForecastReportCard() {
  const location = useLocation()
  const [forecastOpen, setForecastOpen] = useState(false)

  useEffect(() => {
    if (location.hash === '#forecast-details') setForecastOpen(true)
  }, [location.hash])

  return (
    <>
      <Card title="Forecast reporting" icon="chartLine" tone="tone-sky" span={12}>
        <div className="dashboard-report-actions">
          <button onClick={() => setForecastOpen(value => !value)} aria-expanded={forecastOpen}>
            {forecastOpen ? 'Hide forecast pivot' : 'Open forecast by customer/month'}
            <span aria-hidden="true">{forecastOpen ? ' ↑' : ' ↓'}</span>
          </button>
        </div>
        {!forecastOpen && <p className="hint">Review forecast by customer and month.</p>}
      </Card>
      {forecastOpen && <div id="forecast-details" className="dashboard-embedded-report"><ForecastDashboard embedded /></div>}
    </>
  )
}

function AnalyticsOverview({ store, role, nav }) {
  const snapshot = analyticsSnapshot(store, role)
  const location = useLocation()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const metric = row => snapshot.comm ? fmtLakh(row.valueK) : row.count
  const max = Math.max(1, ...snapshot.funnel.map(row => snapshot.comm ? row.valueK : row.count))
  const scope = snapshot.owner ? `Your pipeline · ${snapshot.owner}` : 'Company pipeline'
  const closed = store.opportunities
    .filter(o => (!snapshot.owner || o.owner === snapshot.owner) && (o.stage === 'Won' || o.stage === 'Lost'))
  React.useEffect(() => {
    if (location.hash === '#detailed-analytics') setDetailsOpen(true)
  }, [location.hash])
  return (
    <section className="home-analytics dashboard-analytics" aria-labelledby="dashboard-analytics-title">
      <div className="home-analytics-head">
        <div>
          <div className="eyebrow">Live business view</div>
          <h3 id="dashboard-analytics-title">Pipeline overview</h3>
          <p>{scope} · Open opportunities and current stage distribution</p>
        </div>
        <button className="home-analytics-link" onClick={() => nav('/analytics')}>Open detailed analytics <span aria-hidden="true">↗</span></button>
      </div>
      <div className="home-analytics-grid">
        <div className="home-funnel-panel">
          <div className="home-panel-title"><span>Pipeline by stage</span><span className="home-panel-note">{snapshot.openCount} open</span></div>
          <div className="home-funnel" role="list" aria-label="Open opportunities by stage">
            {snapshot.funnel.map((row, index) => (
              <button key={row.label} className="home-funnel-row" onClick={() => nav(`/?stage=${encodeURIComponent(row.label)}`)} role="listitem">
                <span className="home-funnel-stage"><span className="home-funnel-index">{String(index + 1).padStart(2, '0')}</span>{row.label}</span>
                <span className="home-funnel-track"><span className="home-funnel-fill" style={{ width: `${Math.max(row.count ? 5 : 0, ((snapshot.comm ? row.valueK : row.count) / max) * 100)}%` }} /></span>
                <span className="home-funnel-value">{metric(row)}</span>
              </button>
            ))}
          </div>
          {!snapshot.funnel.some(row => row.count) && <div className="home-empty">No open opportunities in the current scope.</div>}
        </div>
        <div className="home-forecast-panel">
          <div className="home-panel-title"><span>Forecast signal</span><span className="home-signal-dot" /><span className="home-panel-note">live</span></div>
          <div className="home-forecast-value">{snapshot.comm ? fmtLakh(snapshot.pipelineK) : snapshot.openCount}</div>
          <div className="home-forecast-label">{snapshot.comm ? 'Open pipeline' : 'Open opportunities'}</div>
          <div className="home-forecast-split">
            <div><b>{snapshot.comm ? fmtLakh(snapshot.weightedK) : `${snapshot.openCount} open`}</b><span>{snapshot.comm ? 'Weighted forecast' : 'Current scope'}</span></div>
            <div><b>{snapshot.decided ? `${snapshot.winPct}%` : '—'}</b><span>{snapshot.decided ? 'Win rate' : 'No closed data'}</span></div>
          </div>
          <button className="home-forecast-action" onClick={() => nav(snapshot.comm ? '/dashboard' : '/my')}>{snapshot.comm ? 'Review forecast' : 'Review my opportunities'} <span aria-hidden="true">→</span></button>
        </div>
      </div>
      <div className="home-alert-rail" aria-label="Work queue summary">
        <button onClick={() => nav('/inbox')}><span className="home-alert-value">{snapshot.counts.newLeads}</span><span>New leads</span></button>
        <button onClick={() => nav('/approvals')}><span className="home-alert-value">{snapshot.counts.forMe || snapshot.counts.myPending}</span><span>{snapshot.counts.forMe ? 'Awaiting your decision' : 'Your requests'}</span></button>
        <button onClick={() => nav('/my')}><span className="home-alert-value">{snapshot.counts.myStale}</span><span>Need an update</span></button>
      </div>
      <Card title="Win / loss reasons" icon="checkCircle" tone="tone-green" span={12}>
        {closed.length ? (
          <div className="dashboard-win-loss-list" role="list" aria-label="Closed opportunities and reasons">
            {closed.map(o => (
              <div key={o.id} className="dashboard-win-loss-row" role="listitem">
                <button className="oppid-link" onClick={() => nav(`/folders/${o.id}`)}>{o.id}</button>
                <span className={`pill ${o.stage === 'Won' ? 'won' : 'lost'}`}>{o.stage}</span>
                <span className="dashboard-win-loss-reason">{o.closedReason || '—'}</span>
              </div>
            ))}
          </div>
        ) : <p className="hint">No closed opportunities yet.</p>}
      </Card>
      <Card title="Detailed reporting" icon="chartLine" tone="tone-sky" span={12}>
        <div className="dashboard-report-actions">
          <button onClick={() => setDetailsOpen(value => !value)} aria-expanded={detailsOpen}>
            {detailsOpen ? 'Hide detailed analytics' : 'Open detailed analytics'}
            <span aria-hidden="true">{detailsOpen ? ' ↑' : ' ↓'}</span>
          </button>
        </div>
        {!detailsOpen && <p className="hint">Use this view for filtered funnel analysis, win/loss detail, margins, and supporting records.</p>}
      </Card>
      {detailsOpen && <div id="detailed-analytics" className="dashboard-embedded-report"><Analytics embedded /></div>}
    </section>
  )
}

// Quarterly target vs actual, the prototype's quarter cards.
function QuarterBars({ perf }) {
  return (
    <div className="qcards">
      {FY_QUARTERS.map((q, i) => {
        const target = perf.quarterTarget[i] || 0
        const actual = perf.quarterActual[i] || 0
        const pct = target ? Math.min(100, (actual / target) * 100) : 0
        const met = target > 0 && actual >= target
        const past = i < perf.currentQ
        return (
          <div key={q} className={`qcard ${i === perf.currentQ ? 'cur' : ''}`}>
            <div className="q-t">{q}{i === perf.currentQ ? ' · now' : ''}</div>
            <div className="q-a">{fmtLakh(actual)}</div>
            <div className="q-s">of {fmtLakh(target)} · {Math.round(pct)}%</div>
            <div className="q-bar">
              <i style={{ width: `${pct}%` }} className={met ? 'ok' : past ? 'miss' : ''} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Grouped columns above the quarter cards: grey target beside the coloured
// actual per quarter, green once the quarter is at or above target — ported
// from the prototype's `chartColumns` (Bt_html clickable prototype.html:3712).
// Same 720-wide viewBox trick as RunRateChart below: the card is ~twice the
// prototype's 360px, so doubling the viewBox keeps 10px type reading as 10px.
function QuarterColumns({ perf }) {
  const W = 720, H = 170, pad = 26, base = H - 24
  const max = Math.max(1, ...perf.quarterActual, ...perf.quarterTarget)
  const bw = (W - pad * 2) / FY_QUARTERS.length
  const y = v => base - (v / max) * (base - 16)
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" style={{ width: '100%' }}
        aria-label={`Quarterly actual versus target: ${FY_QUARTERS.map((q, i) =>
          `${q} ${fmtLakh(perf.quarterActual[i] || 0)} of ${fmtLakh(perf.quarterTarget[i] || 0)}`).join(', ')}`}>
        <line x1={pad} y1={base} x2={W - pad} y2={base} stroke="var(--border-soft)" strokeWidth="1" />
        {FY_QUARTERS.map((label, i) => {
          const x = pad + i * bw, w1 = bw * 0.34
          const target = perf.quarterTarget[i] || 0
          const actual = perf.quarterActual[i] || 0
          const ta = y(target), aa = y(actual)
          return (
            <g key={label}>
              <rect x={(x + bw * 0.16).toFixed(1)} y={ta.toFixed(1)} width={w1.toFixed(1)}
                height={(base - ta).toFixed(1)} rx="4" fill="var(--border-soft)" />
              <rect x={(x + bw * 0.52).toFixed(1)} y={aa.toFixed(1)} width={w1.toFixed(1)}
                height={(base - aa).toFixed(1)} rx="4"
                fill={target > 0 && actual >= target ? 'var(--won-text)' : 'var(--primary-accent)'} />
              <text x={(x + bw / 2).toFixed(1)} y={base + 14} textAnchor="middle" fontSize="10.5"
                fontWeight="700" fill="var(--text-subtle)">{label}</text>
            </g>
          )
        })}
      </svg>
      <div className="chart-legend">
        <span><i className="legend-swatch" style={{ background: 'var(--border-soft)' }} />Target</span>
        <span><i className="legend-swatch" style={{ background: 'var(--primary-accent)' }} />Actual</span>
        <span><i className="legend-swatch" style={{ background: 'var(--won-text)' }} />At or above target</span>
      </div>
    </>
  )
}

// Monthly bookings against the target run rate, matching the reference
// prototype's `chartTrend` (Bt_html clickable prototype.html:3733).
//
// The target is the quarter's number over three months (perf.monthlyTarget),
// not a flat annual twelfth, and it is drawn across all twelve months.
//
// The actual is drawn across all twelve months too, dropping to the baseline
// for unbooked months — the Ver 1.1 look the client asked for on 21 Aug,
// screenshot in hand. (A 20 Aug review had the line stop at today instead;
// the comparison overrode it.) The reader learns a month is unbooked from the
// tooltip and the table, which still say "Not booked yet" past `elapsed`,
// rather than from the line stopping.
function RunRateChart({ perf }) {
  // Unique per instance: a hardcoded gradient id collides when two charts share
  // a page, and the second one silently picks up the first one's fill.
  const gradientId = `runrate-fade-${useId().replace(/:/g, '')}`
  // Which month the pointer (or the keyboard) is asking about. null = no readout.
  const [hover, setHover] = useState(null)
  const svgRef = useRef(null)

  const target = perf.monthlyTarget || FY_MONTHS.map(() => perf.annual / 12)
  const elapsed = Math.max(1, Math.min(FY_MONTHS.length, perf.monthsElapsed || FY_MONTHS.length))
  const actual = perf.monthly

  // The reference prototype used a 360-wide viewBox in a ~360px card. This card
  // is twice that, and the svg scales to fill it — which multiplied every
  // fontSize and stroke by ~2.2 and made the month labels compete with the card
  // heading. Doubling the viewBox brings the scale back to ~1.1, so 10px reads
  // as 10px. Nothing else here needs to change: every coordinate is derived.
  const W = 720, H = 160, padL = 16, padR = 16, base = H - 22, topY = 14
  const max = Math.max(1, ...perf.monthly, ...target)
  const step = (W - padL - padR) / Math.max(1, FY_MONTHS.length - 1)
  const px = i => padL + i * step
  const py = v => base - (v / max) * (base - topY)
  const pts = series => series.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ')

  const area = `${padL},${base} ${pts(actual)} ${px(actual.length - 1).toFixed(1)},${base}`
  // Six labels plus a guaranteed last one, so twelve months do not collide.
  const every = Math.ceil(FY_MONTHS.length / 6)

  // The crosshair finds the X: the reader aims at a month, never at a 2px line.
  // The SVG scales to the card width, so map client pixels back through the
  // viewBox before snapping to the nearest month.
  const monthAt = event => {
    const box = svgRef.current?.getBoundingClientRect()
    if (!box?.width) return null
    const x = ((event.clientX - box.left) / box.width) * W
    const i = Math.round((x - padL) / step)
    return Math.max(0, Math.min(FY_MONTHS.length - 1, i))
  }

  // Keyboard reaches the same readout as the pointer.
  const onKeyDown = event => {
    if (event.key === 'Escape') return setHover(null)
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    event.preventDefault()
    setHover(prev => Math.max(0, Math.min(FY_MONTHS.length - 1,
      (prev == null ? (delta > 0 ? -1 : FY_MONTHS.length) : prev) + delta)))
  }

  const booked = hover != null && hover < elapsed
  // Keep the readout inside the card at both ends.
  const side = hover != null && px(hover) > W / 2 ? 'left' : 'right'

  return (
    <div className="runrate-chart">
      <div className="runrate-plot">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} tabIndex={0} role="img"
          aria-label={`Monthly bookings against target run rate, ${FY_MONTHS[0]} to ${FY_MONTHS[FY_MONTHS.length - 1]}. Use the arrow keys to read each month.`}
          onPointerMove={event => setHover(monthAt(event))}
          onPointerLeave={() => setHover(null)}
          onBlur={() => setHover(null)}
          onKeyDown={onKeyDown}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary-accent)" stopOpacity=".28" />
              <stop offset="100%" stopColor="var(--primary-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill={`url(#${gradientId})`} />
          {hover != null && (
            <line className="runrate-crosshair" x1={px(hover)} y1={topY - 6} x2={px(hover)} y2={base} />
          )}
          <polyline points={pts(target)} fill="none" stroke="var(--text-main)" strokeWidth="1.6"
            strokeDasharray="5 4" opacity=".6" />
          <polyline points={pts(actual)} fill="none" stroke="var(--primary-accent)" strokeWidth="2.6"
            strokeLinejoin="round" strokeLinecap="round" />
          {actual.map((v, i) => (
            <circle key={FY_MONTHS[i]} cx={px(i).toFixed(1)} cy={py(v).toFixed(1)}
              r={hover === i ? '5.5' : '4'}
              fill="var(--card-bg)" stroke="var(--primary-accent)" strokeWidth="2" />
          ))}
          {hover != null && (
            <circle cx={px(hover).toFixed(1)} cy={py(target[hover]).toFixed(1)} r="3.6"
              fill="var(--card-bg)" stroke="var(--text-main)" strokeWidth="1.6" opacity=".7" />
          )}
          {FY_MONTHS.map((label, i) => (i % every === 0 || i === FY_MONTHS.length - 1) && (
            <text key={label} x={px(i).toFixed(1)} y={H - 5} fontSize="10" textAnchor="middle"
              fill="var(--text-subtle)">{label}</text>
          ))}
        </svg>
        {hover != null && (
          // One tooltip, every series — the pointer never has to land on a line
          // to get a value, and the value leads while the label follows.
          <div className={`runrate-tip runrate-tip-${side}`}
            style={{ left: `${(px(hover) / W) * 100}%` }} role="status">
            <b>{FY_MONTHS[hover]}</b>
            <span>
              <i className="legend-line actual" />
              <strong>{booked ? fmtLakh(perf.monthly[hover]) : '—'}</strong> actual
            </span>
            <span>
              <i className="legend-line target" />
              <strong>{fmtLakh(target[hover])}</strong> target
            </span>
            {!booked && <em>Not booked yet</em>}
          </div>
        )}
      </div>
      <div className="chart-legend">
        <span><i className="legend-line target" />Target run rate</span>
        <span><i className="legend-line actual" />Actual run rate</span>
      </div>
      {/* The tooltip enhances, it never gates: every figure it shows is also
          here, for a screen reader and for anyone not using a pointer. */}
      <table className="visually-hidden">
        <caption>Monthly bookings against target run rate</caption>
        <thead><tr><th>Month</th><th>Actual</th><th>Target</th></tr></thead>
        <tbody>
          {FY_MONTHS.map((label, i) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{i < elapsed ? fmtLakh(perf.monthly[i]) : 'Not booked yet'}</td>
              <td>{fmtLakh(target[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SalesOpportunitySection({ store, open, nav, money }) {
  const rows = open.filter(o => !isHiddenDashboardOpportunity(o))
    .sort((a, b) => (b.lastUpdated || '').localeCompare(a.lastUpdated || ''))
  const action = o => nextActionWith(o, store.getProposal(o.id), store)
  return (
    <Card title="My opportunities" icon="sheet" tone="tone-sky" span={12}>
      <div className="dashboard-table-scroll"><table className="dashboard-table"><thead><tr><th>ID</th><th>Opportunity</th><th>Customer</th><th>Stage</th><th>Value (₹)</th><th>Win %</th><th>Next action</th><th>Due</th></tr></thead><tbody>{rows.map(o => { const na = action(o); return <tr key={o.id} onClick={() => nav(`/opp/${o.id}`)}><td><b>{o.id}</b></td><td><span className="dashboard-cell-ellipsis">{o.oppName}</span></td><td><span className="dashboard-cell-ellipsis">{o.sellTo}</span></td><td><span className="pill open">{o.stage}</span></td><td>{money ? fmtLakh(o.valueK) : '—'}</td><td>{o.prob || '—'}</td><td title={na.text}><span className="dashboard-cell-clamp">{na.text || o.remarks || 'Review next step'}</span></td><td>{o.orderDate ? ddMmmYY(o.orderDate) : '—'}</td></tr>})}</tbody></table></div>
      {!rows.length && <div className="dashboard-empty">No open opportunities are assigned to you.</div>}
    </Card>
  )
}

function SalesCustomerSection({ store, open, orders, nav, money }) {
  const names = [...new Set([...open.map(o => o.sellTo), ...orders.map(o => o.customer)])]
  const rows = names.map(name => {
    const customer = store.customers.find(c => c.name === name)
    const opps = open.filter(o => o.sellTo === name)
    const booked = orders.filter(o => o.customer === name)
    const region = opps[0]?.location || '—'
    return { name, status: customer?.status || '—', region, open: opps.length, value: opps.reduce((s, o) => s + (+o.valueK || 0), 0), orders: booked.length }
  }).sort((a, b) => b.value - a.value)
  return <Card title="My customers" icon="users" tone="tone-green" span={12} action={<button onClick={() => nav('/customers')}>Open customer master</button>}>
    <div className="dashboard-table-scroll"><table className="dashboard-table customer-table"><thead><tr><th>Customer</th><th>Class</th><th>Region</th><th>Open opportunities</th><th>Open value (₹)</th><th>Orders</th></tr></thead><tbody>{rows.map(row => <tr key={row.name} onClick={() => nav('/customers')}><td><b className="dashboard-cell-ellipsis">{row.name}</b></td><td><span className={`pill ${row.status}`}>{row.status}</span></td><td><span className="dashboard-cell-ellipsis">{row.region}</span></td><td>{row.open}</td><td>{money ? fmtLakh(row.value) : '—'}</td><td>{row.orders}</td></tr>)}</tbody></table></div>
    {!rows.length && <div className="dashboard-empty">Customers will appear here when you have an opportunity or booked order.</div>}
  </Card>
}

// Shared across every role: what is stuck, and what to do next.
function useWorkQueue(store, role, mine) {
  const opportunities = mine ? store.opportunities.filter(o => o.owner === role) : store.opportunities
  const open = opportunities.filter(o => o.status === 'Open')
  const withBlockers = open.map(o => ({ opp: o, blockers: readiness(o, store.getProposal(o.id), store) }))
  const blocked = withBlockers.filter(x => isBlocked(x.blockers))
  const nextActions = withBlockers
    .map(({ opp, blockers }) => {
      const b = blockers.find(x => x.severity === 'block' || x.severity === 'wait')
      return {
        opp,
        text: b?.text || (opp.nextActionOwner ? `Follow up with ${opp.nextActionOwner}` : 'Review and set the next action'),
        owner: b?.approver || opp.nextActionOwner || '',
        severity: b?.severity || 'info',
      }
    })
    // Blocked first, then oldest-touched — the ones going stale.
    .sort((a, b) => (a.severity === 'block' ? -1 : 1) - (b.severity === 'block' ? -1 : 1)
      || (a.opp.lastUpdated || '').localeCompare(b.opp.lastUpdated || ''))
    .slice(0, 6)
  return { opportunities, open, blocked, nextActions }
}

// 'info' rows carry no pill: only a real blocker or a pending decision is worth
// flagging, and tagging everything would make the flags meaningless.
const NEXT_ACTION_TAG = { block: { cls: 'Red', label: 'Blocked' }, wait: { cls: 'Amber', label: 'Waiting' } }

function NextActions({ nextActions, nav }) {
  if (!nextActions.length) return <div className="dashboard-empty">Nothing is waiting — no open opportunity needs an action.</div>
  return nextActions.map(({ opp, text, owner, severity }) => {
    const tag = NEXT_ACTION_TAG[severity]
    return (
      <button key={opp.id} className="dashboard-action" onClick={() => nav(`/opp/${opp.id}`)}>
        <span className="dashboard-action-title">
          <span className="dashboard-action-identity">
            <b className="dashboard-action-id">{opp.id}</b>
            <span className="dashboard-action-name"> — {opp.oppName}</span>
          </span>
          {tag && <span className={`pill ${tag.cls}`}>{tag.label}</span>}
        </span>
        {/* title= keeps the full sentence reachable when the 3-line clamp bites. */}
        <span className="hint dashboard-action-detail" title={text}>{text}</span>
        <span className="dashboard-action-meta">
          {opp.sellTo && <span>{opp.sellTo}</span>}
          {owner && <span>{severity === 'wait' ? `Waiting on ${owner}` : owner}</span>}
          {opp.lastUpdated && <span>Updated {ddMmmYY(opp.lastUpdated)}</span>}
        </span>
      </button>
    )
  })
}

export default function MyDashboard() {
  const store = useStore()
  const nav = useNavigate()
  const role = store.role
  const c = counts(store, role)

  const sales = isSalesOwner(role)
  const approver = isApprover(role) && !isAdminRole(role)
  const admin = isAdminRole(role)
  const tech = role === 'TECH'

  const { open, blocked, nextActions } = useWorkQueue(store, role, sales || tech)
  const head = (
    <div className="home-head">
      <div>
        <h2>My Dashboard</h2>
        <p className="hint">{roleLabel(role)}{store.sales?.fy ? ` · ${store.sales.fy}` : ''}</p>
      </div>
      <div className="home-head-actions">
        <button onClick={() => nav('/opportunities')}><Icon name="cards" size={13} /> Opportunities</button>
      </div>
    </div>
  )

  if (sales) return <SalesDashboard {...{ store, nav, role, c, open, blocked, nextActions, head }} />
  if (approver) return <ApproverDashboard {...{ store, nav, role, c, open, blocked, nextActions, head }} />
  if (admin) return <AdminDashboard {...{ store, nav, role, c, open, blocked, nextActions, head }} />
  if (tech) return <TechDashboard {...{ store, nav, role, c, open, blocked, nextActions, head }} />

  // Any future role still gets the work queue rather than a blank page.
  return (
    <div className="page dashboard-page">
      {head}
      <div className="stat-cards">
        <Metric label="Open opportunities" value={open.length} tone="sky" />
        <Metric label="Blockers" value={blocked.length} tone={blocked.length ? 'red' : 'green'} />
      </div>
      <div className="ana-grid">
        <Card title="Next best actions" icon="target" tone="tone-amber"><NextActions {...{ nextActions, nav }} /></Card>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------- sales
function SalesDashboard({ store, nav, role, c, open, blocked, nextActions, head }) {
  const perf = salesPerformance(store, role)
  const money = canPriceProposal(role)
  const openValue = open.reduce((s, o) => s + (+o.valueK || 0), 0)
  const weightedValue = open.reduce((s, o) => s + (+o.valueK || 0) * (PROB_WEIGHT[o.prob] ?? PROB_WEIGHT.Low), 0)
  const myLeads = store.leads.filter(l => (l.assignedOwner || l.suggestedOwner) === role)
  const leads = myLeads.filter(l => l.status === 'New')
  const unproposed = open.filter(o => !o.proposalDate)
  const variance = perf.achieved - perf.expected
  // The prototype's lead-lifecycle funnel (vSalesDashboard, Bt_html clickable
  // prototype.html:4127), mapped to this data model: no "Submitted" milestone
  // here, so proposalDate stands in for "proposal sent". Unlike the prototype,
  // Qualified is owner-filtered — its team-wide count could exceed the stage
  // above it, which is how the demo printed "400% of prior".
  const wonCount = store.opportunities.filter(o => o.owner === role && o.stage === 'Won').length
  const funnelStages = [
    { label: 'Leads assigned', count: myLeads.length },
    { label: 'Qualified', count: myLeads.filter(l => ['Qualified', 'Converted'].includes(l.status)).length },
    { label: 'Opportunities', count: open.length },
    { label: 'Proposal sent', count: open.filter(o => o.proposalDate).length },
    { label: 'Won', count: wonCount + perf.orders.length },
  ]

  return (
    <div className="page dashboard-page">
      {head}

      <div className="stat-cards">
        <Metric label="Annual target" value={fmtLakh(perf.annual)} tone="slate" variant="dashboard-top-kpi" />
        <Metric label="Achieved to date" value={fmtLakh(perf.achieved)} tone={variance >= 0 ? 'green' : 'amber'}
          hint={`${variance >= 0 ? '+' : ''}${fmtLakh(variance)} vs pace`} variant="dashboard-top-kpi" />
        <Metric label="Gap to target" value={fmtLakh(perf.gap)} tone="sky" variant="dashboard-top-kpi" />
        <Metric label="Run rate, annualised" value={fmtLakh(perf.runRate)} tone={perf.runRate >= perf.annual ? 'green' : 'amber'} variant="dashboard-top-kpi" />
      </div>

      <div className="ana-grid">
        <Card title="Annual attainment" icon="target" tone="tone-green" span={4} className="annual-attainment-card">
          <div className="annual-attainment-body">
            <div className="annual-attainment-gauge">
              <ArcGauge pct={perf.attainPct} size={220} value={`${Math.round(perf.attainPct)}%`} caption={`of ${fmtLakh(perf.annual)}`} />
            </div>
            <table className="cost-table annual-attainment-table" style={{ width: '100%' }}>
              <tbody>
                <tr><td>Expected by now</td><td className="num">{fmtLakh(perf.expected)}</td></tr>
                <tr><td>Achieved</td><td className="num">{fmtLakh(perf.achieved)}</td></tr>
                <tr className="total"><td>Variance</td>
                  <td className="num" style={{ color: variance >= 0 ? 'var(--won-text)' : 'var(--amber-text)' }}>
                    {variance >= 0 ? '+' : ''}{fmtLakh(variance)}
                  </td></tr>
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Quarterly target vs actual" icon="chartBar" tone="tone-sky" span={8}>
          <QuarterColumns perf={perf} />
          <QuarterBars perf={perf} />
          <div className="hint" style={{ marginTop: 8 }}>Booked orders against your quarterly number.</div>
        </Card>

        <Card title="Monthly performance against run rate" icon="chartLine" tone="tone-sky" span={8}>
          <RunRateChart perf={perf} />
          <div className="hint" style={{ marginTop: 8 }}>
            {perf.fy} · {FY_MONTHS[0]}–{FY_MONTHS[FY_MONTHS.length - 1]} · actual against target run rate,
            booked to {FY_MONTHS[Math.max(0, (perf.monthsElapsed || 1) - 1)]} ·{' '}
            {perf.orders.length} order{perf.orders.length === 1 ? '' : 's'}
          </div>
        </Card>

        <Card title="My funnel" icon="layers" tone="tone-teal" span={4}>
          <div className="funnel-stage-link" role="link" tabIndex={0} onClick={() => nav('/proposal-sent')} onKeyDown={event => event.key === 'Enter' && nav('/proposal-sent')} title="Open Proposal Sent workspace">
            <AnalyticsFunnel stages={funnelStages} showValue={false} conversion />
          </div>
          <div className="hint" style={{ marginTop: 8 }}>Your leads through to won business, with the conversion from each stage to the next.</div>
        </Card>

        <ForecastReportCard />

        {/* The "Monthly bookings" sparkline that used to sit here plotted the
            same perf.monthly array as the chart above, with no target line, no
            month labels and a distorted stroke. One chart, above. */}

        <Card title="Pipeline snapshot" icon="chartBar" tone="tone-teal" span={12}>
          {/* The prototype's chartBars rows (Bt_html clickable prototype.html:4170):
              open / weighted / booked as proportional bars, counts as a list. */}
          {money && (
            <div>
              {[
                { label: 'Open value', value: openValue, cls: 'snap-open' },
                { label: 'Weighted', value: weightedValue, cls: 'snap-weighted' },
                { label: 'Booked orders', value: perf.achieved, cls: 'snap-booked' },
              ].map((row, _, rows) => (
                <div key={row.label} className="mbar" aria-label={`${row.label}: ${fmtLakh(row.value)}`}>
                  <span className="mb-lbl wide">{row.label}</span>
                  <span className="mb-track">
                    <span className={`mb-fill ${row.cls}`}
                      style={{ width: `${Math.max(2, (row.value / Math.max(1, ...rows.map(r => r.value))) * 100)}%` }} />
                  </span>
                  <span className="mb-val wide">{fmtLakh(row.value)}</span>
                </div>
              ))}
            </div>
          )}
          <ul className="stat-list" style={{ marginTop: money ? 10 : 0 }}>
            <li>Open opportunities<b>{open.length}</b></li>
            <li>Without a proposal<b>{unproposed.length}</b></li>
            <li>New leads in your queue<b>{leads.length}</b></li>
            <li>Blocked<b>{blocked.length}</b></li>
          </ul>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => nav('/my')}>My opportunities</button>
            <button onClick={() => nav('/inbox')}>Lead inbox</button>
          </div>
        </Card>

        <Card title="Next best actions" icon="target" tone="tone-amber" span={6}
          action={c.myPending > 0 ? <span className="pill Amber">{c.myPending} approval{c.myPending === 1 ? '' : 's'} pending</span> : null}>
          <NextActions {...{ nextActions, nav }} />
        </Card>

        <Card title="My orders" icon="clipboardCheck" tone="tone-green" span={6}>
          <table className="ana-table">
            <thead><tr><th>Order</th><th>Customer</th><th className="num">Value (₹)</th><th>Status</th></tr></thead>
            <tbody>
              {perf.orders.slice(0, 6).map(o => (
                <tr key={o.id}>
                  <td>{o.id}</td>
                  <td title={o.title}>{o.customer}</td>
                  <td className="num">{money ? fmtLakh(o.valueK) : '—'}</td>
                  <td>{o.status}</td>
                </tr>
              ))}
              {!perf.orders.length && <tr><td className="empty" colSpan={4}>No orders booked this year.</td></tr>}
            </tbody>
          </table>
          {perf.orders.length > 6 && <button style={{ marginTop: 8 }} onClick={() => nav('/po')}>All {perf.orders.length} orders</button>}
        </Card>
      </div>

      <div className="ana-grid sales-detail-grid">
        <SalesOpportunitySection {...{ store, open, nav, money }} />
        <SalesCustomerSection store={store} open={open} orders={perf.orders} nav={nav} money={money} />
      </div>
    </div>
  )
}

// ------------------------------------------------------------ team targets
// LJS and AH (and admins) set the FY numbers each owner is measured against —
// until now store.sales.targets was seed-only, with no way to change it.
// Targets are stored in K₹; the editor speaks lakhs, the unit every widget
// prints (1 L = 100 K₹).
function TeamTargetsCard({ store, span = 12 }) {
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState(null)
  const targets = store.sales?.targets || {}
  const owners = [...new Set([...OWNERS, ...Object.keys(targets)])]
  const toL = k => Math.round(k || 0) / 100
  const toK = l => Math.round((parseFloat(l) || 0) * 100)

  const begin = owner => {
    const t = targets[owner] || { annual: 0, q: [0, 0, 0, 0] }
    setEditing(owner)
    setDraft({ annual: String(toL(t.annual)), q: (t.q || [0, 0, 0, 0]).map(v => String(toL(v))) })
  }
  const stop = () => { setEditing(null); setDraft(null) }
  const save = () => {
    store.setSalesTarget(editing, { annual: toK(draft.annual), q: draft.q.map(toK) })
    stop()
  }
  const split = () => setDraft(d => {
    const each = String(Math.round(((parseFloat(d.annual) || 0) / 4) * 100) / 100)
    return { ...d, q: [each, each, each, each] }
  })
  const qSum = draft ? draft.q.reduce((s, v) => s + (parseFloat(v) || 0), 0) : 0
  const mismatch = draft && Math.abs(qSum - (parseFloat(draft.annual) || 0)) > 0.5

  return (
    <Card title="Team targets" icon="target" tone="tone-sky" span={span}
      action={<span className="hint">₹ lakh{store.sales?.fy ? ` · ${store.sales.fy}` : ''}</span>}>
      <table className="ana-table targets-table">
        <thead>
          <tr>
            <th>Owner</th><th className="num">Annual</th>
            {FY_QUARTERS.map(q => <th key={q} className="num">{q.slice(0, 2)}</th>)}
            <th />
          </tr>
        </thead>
        <tbody>
          {owners.map(owner => {
            const t = targets[owner] || { annual: 0, q: [0, 0, 0, 0] }
            if (editing !== owner) return (
              <tr key={owner}>
                <td><b>{displayRole(owner)}</b> <span className="hint">{roleLabel(owner).replace(`${displayRole(owner)} - `, '')}</span></td>
                <td className="num">{fmtLakh(t.annual)}</td>
                {(t.q || [0, 0, 0, 0]).map((v, i) => <td key={FY_QUARTERS[i]} className="num">{fmtLakh(v)}</td>)}
                <td className="num"><button onClick={() => begin(owner)}>Edit</button></td>
              </tr>
            )
            return (
              <tr key={owner} className="targets-editing">
                <td><b>{displayRole(owner)}</b> <span className="hint">{roleLabel(owner).replace(`${displayRole(owner)} - `, '')}</span></td>
                <td className="num">
                  <input type="number" min="0" value={draft.annual} aria-label={`${owner} annual target`}
                    onChange={e => setDraft(d => ({ ...d, annual: e.target.value }))} />
                </td>
                {draft.q.map((v, i) => (
                  <td key={FY_QUARTERS[i]} className="num">
                    <input type="number" min="0" value={v} aria-label={`${owner} Q${i + 1} target`}
                      onChange={e => setDraft(d => ({ ...d, q: d.q.map((x, j) => (j === i ? e.target.value : x)) }))} />
                  </td>
                ))}
                <td className="num">
                  <div className="targets-actions">
                    <button onClick={split}>Split evenly</button>
                    <button onClick={save}>Save</button>
                    <button onClick={stop}>Cancel</button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {mismatch && (
        <p className="hint" role="status">
          Quarters add to ₹{qSum.toFixed(1)} L against an annual of ₹{(parseFloat(draft.annual) || 0).toFixed(1)} L —
          saved as entered, so check the split before you save.
        </p>
      )}
      <p className="hint" style={{ marginTop: 6 }}>
        Changes apply immediately to that owner's dashboard and the company roll-up, and are recorded in the audit trail.
      </p>
    </Card>
  )
}

// --------------------------------------------------------------- approvers
function ApproverDashboard({ store, nav, role, c, open, blocked, nextActions, head }) {
  const perf = salesPerformance(store)   // whole company
  const mine = (store.approvals || []).filter(a => a.status === 'Pending'
    && (a.needed?.length ? a.needed : [a.approver]).includes(role) && !(a.decisions || {})[role])
  const openValue = open.reduce((s, o) => s + (+o.valueK || 0), 0)

  return (
    <div className="page dashboard-page">
      {head}
      <div className="stat-cards">
        <Metric label="Waiting on you" value={mine.length} tone={mine.length ? 'red' : 'green'} onClick={() => nav('/approvals')} />
        <Metric label="All pending gates" value={c.pending} tone="amber" onClick={() => nav('/approvals')} />
        <Metric label="Open opportunities" value={open.length} tone="sky" onClick={() => nav('/')} />
        {canViewCommercial(role) && <Metric label="Open pipeline" value={fmtLakh(openValue)} tone="slate" />}
      </div>

      <AnalyticsOverview {...{ store, role, nav }} />

      <div className="ana-grid">
        <Card title="Your approval queue" icon="checkCircle" tone="tone-green" span={6}>
          {mine.map(a => (
            <button key={a.id} className="dashboard-action" onClick={() => nav('/approvals')}>
              <span><b>{a.id}</b> — {a.type}</span>
              <span className="hint">{a.oppId || '—'} · requested by {displayRole(a.requestedBy)}</span>
            </button>
          ))}
          {!mine.length && <p className="hint">Nothing is waiting on you right now.</p>}
        </Card>

        <Card title="Company attainment" icon="target" tone="tone-sky" span={6}>
          <QuarterBars perf={perf} />
          <div className="hint" style={{ marginTop: 8 }}>
            {fmtLakh(perf.achieved)} booked of {fmtLakh(perf.annual)} · {Math.round(perf.attainPct)}% attained
          </div>
        </Card>

        <TeamTargetsCard store={store} />

        <Card title="Blocked opportunities" icon="alert" tone="tone-red" span={6}
          action={<span className="pill Red">{blocked.length}</span>}>
          {blocked.slice(0, 6).map(({ opp }) => (
            <button key={opp.id} className="dashboard-action" onClick={() => nav(`/opp/${opp.id}`)}>
              <span><b>{opp.id}</b> — {opp.oppName}</span>
              <span className="hint">{displayRole(opp.owner)} · {opp.stage}</span>
            </button>
          ))}
          {!blocked.length && <p className="hint">No opportunity is currently blocked.</p>}
        </Card>

        <Card title="Next best actions" icon="target" tone="tone-amber" span={6}>
          <NextActions {...{ nextActions, nav }} />
        </Card>

        <ForecastReportCard />
      </div>
    </div>
  )
}

// ------------------------------------------------------------------- admin
function AdminDashboard({ store, nav, role, c, open, blocked, head }) {
  const users = store.auth?.users || []
  const pendingUsers = users.filter(u => u.status === 'Pending')
  const perf = salesPerformance(store)

  return (
    <div className="page dashboard-page">
      {head}
      <div className="stat-cards">
        <Metric label="User accounts" value={users.length} tone="slate" onClick={() => nav('/users')} />
        <Metric label="Awaiting approval" value={pendingUsers.length} tone={pendingUsers.length ? 'amber' : 'green'} onClick={() => nav('/users')} />
        <Metric label="Audit entries" value={(store.audit || []).length} tone="sky" onClick={() => nav('/audit')} />
        <Metric label="Open opportunities" value={open.length} tone="violet" onClick={() => nav('/')} />
      </div>

      <AnalyticsOverview {...{ store, role, nav }} />

      <div className="ana-grid">
        <Card title="Registrations awaiting a decision" icon="shield" tone="tone-violet" span={6}>
          {pendingUsers.slice(0, 6).map(u => (
            <button key={u.id || u.email} className="dashboard-action" onClick={() => nav('/users')}>
              <span><b>{u.name || u.email}</b></span>
              <span className="hint">{u.email} · requested {u.role || 'no role'}</span>
            </button>
          ))}
          {!pendingUsers.length && <p className="hint">No registrations are waiting.</p>}
        </Card>

        <Card title="Platform health" icon="gear" tone="tone-slate" span={6}>
          <table className="cost-table" style={{ width: '100%' }}>
            <tbody>
              <tr><td>Connectors configured</td><td className="num">{(store.config?.connectors || []).length}</td></tr>
              <tr><td>Reminder rules</td><td className="num">{(store.config?.reminders || []).length}</td></tr>
              <tr><td>Customers on the master</td><td className="num">{store.customers.length}</td></tr>
              <tr><td>Pending approvals (all)</td><td className="num">{c.pending}</td></tr>
              <tr className="total"><td>Blocked opportunities</td><td className="num">{blocked.length}</td></tr>
            </tbody>
          </table>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => nav('/admin')}>Admin settings</button>
            <button onClick={() => nav('/audit')}>Audit trail</button>
          </div>
        </Card>

        <Card title="Company attainment" icon="target" tone="tone-sky" span={12}>
          <QuarterBars perf={perf} />
          <div className="hint" style={{ marginTop: 8 }}>
            {fmtLakh(perf.achieved)} booked of {fmtLakh(perf.annual)} · {Math.round(perf.attainPct)}% attained
          </div>
        </Card>

        <TeamTargetsCard store={store} />
        <ForecastReportCard />
      </div>
    </div>
  )
}

// --------------------------------------------------- technical reviewer
function TechDashboard({ store, nav, open, blocked, nextActions, head }) {
  // The reviewer works the technical content of live proposals, not a pipeline
  // of their own — so this is scoped by what needs review, not by ownership.
  const projects = store.opportunities.filter(o => o.status === 'Open' && o.route === 'Project')
  const forReview = store.opportunities.filter(o => o.status === 'Open')
    .map(o => ({ opp: o, p: store.getProposal(o.id) }))
    .filter(({ p }) => (p?.bom || []).length > 0)
  const deviations = forReview.reduce((s, { p }) => s + (p.terms || []).filter(t => t.status === 'Deviation').length, 0)

  return (
    <div className="page dashboard-page">
      {head}
      <div className="stat-cards">
        <Metric label="Proposals with a BoQ" value={forReview.length} tone="sky" />
        <Metric label="Open deviations" value={deviations} tone={deviations ? 'amber' : 'green'} />
        <Metric label="Project opportunities" value={projects.length} tone="violet" onClick={() => nav('/')} />
        <Metric label="Blocked" value={blocked.length} tone={blocked.length ? 'red' : 'green'} />
      </div>

      <AnalyticsOverview {...{ store, role: store.role, nav }} />

      <div className="ana-grid">
        <Card title="Proposals to review" icon="fileText" tone="tone-sky" span={6}>
          {forReview.slice(0, 8).map(({ opp, p }) => (
            <button key={opp.id} className="dashboard-action" onClick={() => nav(`/proposal/${opp.id}`)}>
              <span><b>{opp.id}</b> — {opp.oppName}</span>
              <span className="hint">{(p.bom || []).length} BoQ line(s) · Rev-{p.revision} · {opp.route}</span>
            </button>
          ))}
          {!forReview.length && <p className="hint">No proposal has a BoQ to review yet.</p>}
        </Card>

        <Card title="Next best actions" icon="target" tone="tone-amber" span={6}>
          <NextActions {...{ nextActions, nav }} />
        </Card>
        <ForecastReportCard />
      </div>
    </div>
  )
}
