import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ROLES, OWNERS, displayOpportunityId } from '../seed.js'
import { readiness, isBlocked, nextActionWith } from '../gates.js'
import { ageDays, isApprover, isAdminRole, isSalesOwner, canViewCommercial, canPriceProposal, fmtLakh, ddMmmYY, ddMMyyyy, displayRole, displayRoleLabel, isHiddenDashboardOpportunity } from '../utils.js'
import { analyticsSnapshot, counts, salesPerformance, winLossAnalysis, FY_QUARTERS, FY_MONTHS, PROB_WEIGHT, funnelRows } from '../kpi.js'
import { Icon } from '../icons.jsx'
import ForecastDashboard from './Dashboard.jsx'

// My Dashboard — "there has to be something called My Dashboard… it will be
// different for all the roles" (13 Aug review). The salesperson's version is
// the one the client walked through in the HTML prototype: target, attainment,
// quarterly performance, then their own work queue.

const roleLabel = role => displayRoleLabel(role) || role
const dashboardRoleLabel = role => roleLabel(role).replace(displayRole(role), role)
const PREVIEW_LIMIT = 5

function Metric({ label, value, hint, tone = '', onClick, variant = 'dashboard-kpi' }) {
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

function activateDashboardRow(event, action) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  action()
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

function AnalyticsOverview({ store, role, nav, scope = 'role', summary }) {
  const [winLossFilters, setWinLossFilters] = useState({ period: 'all', owner: 'All', reason: 'All' })
  const snapshot = analyticsSnapshot(store, role, { scope })
  const metric = row => snapshot.comm ? fmtLakh(row.valueK) : row.count
  const max = Math.max(1, ...snapshot.funnel.map(row => snapshot.comm ? row.valueK : row.count))
  const scopeLabel = snapshot.owner ? `Your pipeline · ${snapshot.owner}` : 'Company pipeline'
  const scoped = store.opportunities.filter(o => !snapshot.owner || o.owner === snapshot.owner)
  const closedInScope = scoped.filter(o => o.stage === 'Won' || o.stage === 'Lost')
  const canFilterOutcomeOwner = !snapshot.owner && (isAdminRole(role) || isApprover(role))
  const outcomeOwners = [...new Set(closedInScope.map(o => o.owner).filter(Boolean))].sort()
  const outcomeReasons = [...new Set(closedInScope.map(o => String(o.closedReason || '').trim() || 'Unspecified'))].sort()
  const selectedReason = outcomeReasons.includes(winLossFilters.reason) ? winLossFilters.reason : 'All'
  const periodStart = (() => {
    if (winLossFilters.period === 'all') return ''
    const date = new Date()
    if (winLossFilters.period === '90d') date.setDate(date.getDate() - 90)
    if (winLossFilters.period === 'fy') {
      const fyYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1
      date.setFullYear(fyYear, 3, 1)
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  })()
  const filteredClosed = closedInScope.filter(o => {
    const closeDate = o.lastUpdated || o.orderDate || o.createDate || ''
    const reason = String(o.closedReason || '').trim() || 'Unspecified'
    return (!canFilterOutcomeOwner || winLossFilters.owner === 'All' || o.owner === winLossFilters.owner)
      && (!periodStart || (closeDate && closeDate >= periodStart))
      && (selectedReason === 'All' || reason === selectedReason)
  })
  const winLoss = winLossAnalysis(filteredClosed, store.competitors, { commercial: snapshot.comm })
  const lossReasons = winLoss.byReason.filter(row => row.lost > 0)
    .sort((a, b) => snapshot.comm ? b.lostValueK - a.lostValueK : b.lost - a.lost)
    .slice(0, 5)
  const maxLoss = Math.max(1, ...lossReasons.map(row => snapshot.comm ? row.lostValueK : row.lost))
  return (
    <section className="home-analytics dashboard-analytics" aria-labelledby="dashboard-analytics-title">
      {summary && <div className="dashboard-live-kpis" aria-label="Dashboard summary metrics">{summary}</div>}
      <div className="home-analytics-head">
        <div>
          <div className="eyebrow">Live business view</div>
          <h3 id="dashboard-analytics-title">{role === 'AH' ? 'Commercial pipeline' : 'Pipeline overview'}</h3>
          <p>{scopeLabel} · Open opportunities and current stage distribution</p>
        </div>
        <button className="home-analytics-link" onClick={() => nav('/analytics')}>Open detailed analytics <span aria-hidden="true">↗</span></button>
      </div>
      <div className="home-analytics-grid">
        <div className="home-funnel-panel">
          <div className="home-panel-title"><span>Pipeline by stage</span><span className="home-panel-note">{snapshot.openCount} open</span></div>
          <div className="home-funnel" role="list" aria-label="Open opportunities by stage">
            {snapshot.funnel.map((row, index) => (
              <button key={row.label} className={`home-funnel-row stage-${row.key}`} onClick={() => nav(`/?stage=${encodeURIComponent(row.stages.join(','))}`)} role="listitem">
                <span className="home-funnel-stage">{row.label}</span>
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
        <button className={`home-alert-kpi home-alert-leads ${snapshot.counts.newLeads ? 'is-active' : 'is-clear'}`} onClick={() => nav('/inbox')}><span className="home-alert-value">{snapshot.counts.newLeads}</span><span>New leads</span></button>
        <button className={`home-alert-kpi home-alert-requests ${(snapshot.counts.forMe || snapshot.counts.myPending) ? 'is-active' : 'is-clear'}`} onClick={() => nav('/approvals')}><span className="home-alert-value">{snapshot.counts.forMe || snapshot.counts.myPending}</span><span>{snapshot.counts.forMe ? 'Awaiting your decision' : 'Your requests'}</span></button>
        <button className={`home-alert-kpi home-alert-stale ${snapshot.counts.myStale ? 'is-active' : 'is-clear'}`} onClick={() => nav('/my')}><span className="home-alert-value">{snapshot.counts.myStale}</span><span>Need an update</span></button>
      </div>
      <Card title="Win / loss analysis" icon="checkCircle" tone="tone-green" span={12}
        action={<button className="dashboard-card-link" onClick={() => nav('/analytics')}>View detailed analysis <span aria-hidden="true">↗</span></button>}>
        <div className="dashboard-wl-filters" aria-label="Win and loss filters">
          <label><span>Period</span><select value={winLossFilters.period} onChange={event => setWinLossFilters(current => ({ ...current, period: event.target.value }))}>
            <option value="all">All time</option><option value="90d">Last 90 days</option><option value="fy">This FY</option>
          </select></label>
          {canFilterOutcomeOwner && <label><span>Owner</span><select value={winLossFilters.owner} onChange={event => setWinLossFilters(current => ({ ...current, owner: event.target.value }))}>
            <option value="All">All owners</option>{outcomeOwners.map(owner => <option key={owner} value={owner}>{displayRoleLabel(owner)}</option>)}
          </select></label>}
          <label><span>Close reason</span><select value={selectedReason} onChange={event => setWinLossFilters(current => ({ ...current, reason: event.target.value }))}>
            <option value="All">All reasons</option>{outcomeReasons.map(reason => <option key={reason} value={reason}>{reason}</option>)}
          </select></label>
          <span className="dashboard-wl-filter-count">{winLoss.summary.total} closed {winLoss.summary.total === 1 ? 'outcome' : 'outcomes'}</span>
        </div>
        <div className="dashboard-wl-outcomes" aria-label="Won and lost opportunity outcomes">
          <article className="dashboard-wl-outcome is-won">
            <span>Won opportunities</span><strong>{winLoss.summary.won}</strong>
            <small>{snapshot.comm ? fmtLakh(winLoss.summary.wonValueK) : `${winLoss.summary.won} ${winLoss.summary.won === 1 ? 'opportunity' : 'opportunities'}`}</small>
          </article>
          <article className="dashboard-wl-outcome is-lost">
            <span>Lost opportunities</span><strong>{winLoss.summary.lost}</strong>
            <small>{snapshot.comm ? fmtLakh(winLoss.summary.lostValueK) : `${winLoss.summary.lost} ${winLoss.summary.lost === 1 ? 'opportunity' : 'opportunities'}`}</small>
          </article>
          <div className="dashboard-wl-rate">
            <span>Win rate</span><strong>{winLoss.summary.total ? `${winLoss.summary.winRate}%` : '—'}</strong>
            <div className="dashboard-wl-rate-track" role="progressbar" aria-label="Win rate" aria-valuemin="0" aria-valuemax="100" aria-valuenow={winLoss.summary.winRate}>
              <i style={{ width: `${winLoss.summary.winRate}%` }} />
            </div>
            <small>{winLoss.summary.total ? `${winLoss.summary.won} won of ${winLoss.summary.total} closed` : 'No closed outcomes in this selection'}</small>
          </div>
        </div>
        <section className="dashboard-wl-reasons" aria-label="Reasons for lost opportunities">
          <div className="dashboard-wl-reasons-head"><div><span className="analysis-kicker">Decision insight</span><h4>Top loss reasons</h4></div><span>{lossReasons.length} shown</span></div>
          {lossReasons.length ? <div className="dashboard-wl-reason-list">
            {lossReasons.map(row => {
              const amount = snapshot.comm ? row.lostValueK : row.lost
              return <div className="dashboard-wl-reason" key={row.reason}>
                <span className="dashboard-wl-reason-name">{row.reason}</span>
                <span className="dashboard-wl-reason-track"><i style={{ width: `${Math.max(5, (amount / maxLoss) * 100)}%` }} /></span>
                <b>{snapshot.comm ? fmtLakh(row.lostValueK) : `${row.lost} ${row.lost === 1 ? 'loss' : 'losses'}`}</b>
              </div>
            })}
          </div> : <p className="dashboard-wl-no-reasons">No lost opportunities match these filters. Close opportunities with a defined reason to build this analysis.</p>}
          <button className="dashboard-wl-all-reasons" onClick={() => nav('/analytics')}>View all reasons and closed records <span aria-hidden="true">↗</span></button>
        </section>
      </Card>
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

function attainmentStatus(perf) {
  if (!perf.annual) return 'Target not set'
  if (!perf.achieved) return 'No bookings yet'
  if (perf.achieved >= perf.expected) return 'Ahead of pace'
  return 'Behind pace'
}

function RunRateSignal({ perf }) {
  if (!perf.annual) return <div className="performance-signal"><strong>Target not set</strong><span>Set an annual target to begin monthly tracking.</span></div>
  if (!perf.achieved) return <div className="performance-signal"><strong>No bookings yet</strong><span>Monthly targets are ready when the first order is booked.</span></div>
  return <div className="performance-signal"><strong>{attainmentStatus(perf)}</strong><span>Target pace compared with actual pace.</span></div>
}

function AttainmentCard({ perf, scope = 'personal' }) {
  const variance = perf.achieved - perf.expected
  const pct = Math.min(100, Math.max(0, perf.annual ? (perf.achieved / perf.annual) * 100 : 0))
  return (
    <Card title={scope === 'company' ? 'Company attainment' : 'Annual attainment'} icon="target" tone="tone-green" span={4} className="annual-attainment-card">
      <div className="attainment-summary">
        <div className="attainment-summary-top">
          <div>
            <span className="attainment-kicker">{perf.fy || 'Current financial year'}</span>
            <strong>{Math.round(perf.attainPct)}%</strong>
            <span>of {fmtLakh(perf.annual)} target</span>
          </div>
          <span className={`attainment-status ${variance >= 0 ? 'positive' : 'negative'}`}>{attainmentStatus(perf)}</span>
        </div>
        <div className="attainment-progress" aria-label={`${Math.round(perf.attainPct)} percent of annual target achieved`}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="attainment-summary-stats">
          <div><span>Achieved</span><b>{fmtLakh(perf.achieved)}</b></div>
          <div><span>Expected by now</span><b>{fmtLakh(perf.expected)}</b></div>
          <div><span>{variance >= 0 ? 'Ahead by' : 'Gap to pace'}</span><b className={variance >= 0 ? 'positive' : 'negative'}>{fmtLakh(Math.abs(variance))}</b></div>
        </div>
      </div>
    </Card>
  )
}

function QuarterlyTargetCard({ perf }) {
  return (
    <Card title="Quarterly target vs actual" icon="chartBar" tone="tone-sky" span={8}>
      <QuarterColumns perf={perf} />
      <QuarterBars perf={perf} />
      <div className="hint performance-card-note">Booked orders against the quarterly number.</div>
    </Card>
  )
}

function PerformanceScorecard({ perf, scope = 'personal', funnel }) {
  return (
    <div className="performance-scorecard-grid">
      {funnel}
      <QuarterlyTargetCard perf={perf} />
    </div>
  )
}

function DashboardFunnel({ store, role, nav, title = 'ModAE Funnel', scope = 'role' }) {
  const owner = scope === 'my' ? role : (scope === 'role' && isSalesOwner(role) ? role : null)
  const rows = funnelRows(store.opportunities || [], { owner })
  const showValue = canViewCommercial(role) || isSalesOwner(role)
  return (
    <Card title={title} icon="layers" tone="tone-slate" span={4} className="dashboard-funnel funnel-visual">
      <div className="dashboard-funnel-list" role="list" aria-label={`${title} stages`}>
        {rows.map((row, index) => (
          <button key={`${row.label}-${index}`} className={`dashboard-funnel-row stage-${row.key}`} onClick={() => nav(`/?stage=${encodeURIComponent(row.stages.join(','))}`)} role="listitem">
            <span className="dashboard-funnel-shape" style={{ '--funnel-width': `${100 - (index * 13)}%` }}><b>{row.count}</b></span>
            <span className="dashboard-funnel-label"><strong>{row.label}</strong><small>{row.note} · {showValue ? `${fmtLakh(row.valueK)} · ` : ''}{row.count} record{row.count === 1 ? '' : 's'}</small></span>
          </button>
        ))}
      </div>
      <p className="hint performance-card-note">{owner ? 'Your open pipeline. Won and Lost are shown separately.' : 'Company open pipeline. Won and Lost are shown separately.'}</p>
    </Card>
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
  // Which month the pointer (or the keyboard) is asking about. null = no readout.
  const [hover, setHover] = useState(null)
  const svgRef = useRef(null)

  const target = perf.monthlyTarget || FY_MONTHS.map(() => perf.annual / 12)
  const elapsed = Math.max(1, Math.min(FY_MONTHS.length, perf.monthsElapsed || FY_MONTHS.length))
  const actual = perf.monthly
  const hasBookings = actual.some(value => Number(value) > 0)

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
    <div className={`runrate-chart${hasBookings ? '' : ' is-empty'}`}>
      <div className="runrate-plot">
        {!hasBookings && (
          <div className="runrate-empty-note" role="status">
            <strong>No bookings recorded yet</strong>
            <span>Monthly actuals will appear here once orders are booked.</span>
          </div>
        )}
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} tabIndex={0} role="img"
          aria-label={`Monthly bookings against target run rate, ${FY_MONTHS[0]} to ${FY_MONTHS[FY_MONTHS.length - 1]}. Use the arrow keys to read each month.`}
          onPointerMove={event => setHover(monthAt(event))}
          onPointerLeave={() => setHover(null)}
          onBlur={() => setHover(null)}
          onKeyDown={onKeyDown}>
          {hover != null && (
            <line className="runrate-crosshair" x1={px(hover)} y1={topY - 6} x2={px(hover)} y2={base} />
          )}
          <polyline points={pts(target)} fill="none" stroke="var(--text-main)" strokeWidth="1.6"
            strokeDasharray="5 4" opacity=".6" />
          <polyline points={pts(actual)} fill="none" stroke="var(--dashboard-coral)" strokeWidth="2.6"
            strokeLinejoin="round" strokeLinecap="round" />
          {actual.map((v, i) => (
            <circle key={FY_MONTHS[i]} cx={px(i).toFixed(1)} cy={py(v).toFixed(1)}
              r={hover === i ? '5.5' : '4'}
              fill="var(--card-bg)" stroke="var(--dashboard-coral)" strokeWidth="2" />
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
    .slice(0, PREVIEW_LIMIT)
  const action = o => nextActionWith(o, store.getProposal(o.id), store)
  return (
    <Card title="My opportunities" icon="sheet" tone="tone-sky" span={12}
      action={<button onClick={() => nav('/opportunities')}>View all</button>}>
      <div className="dashboard-table-scroll"><table className="dashboard-table"><thead><tr><th>ID</th><th>Opportunity</th><th>Customer</th><th>Stage</th><th>Value (₹)</th><th>Win %</th><th>Next action</th><th>Due</th></tr></thead><tbody>{rows.map(o => { const na = action(o); const go = () => nav(`/opp/${o.id}`); return <tr key={o.id} tabIndex={0} role="link" aria-label={`Open opportunity ${o.id}`} onClick={go} onKeyDown={event => activateDashboardRow(event, go)}><td><b>{o.id}</b></td><td><span className="dashboard-cell-ellipsis">{o.oppName}</span></td><td><span className="dashboard-cell-ellipsis">{o.sellTo}</span></td><td><span className="pill open">{o.stage}</span></td><td>{money ? fmtLakh(o.valueK) : '—'}</td><td>{o.prob || '—'}</td><td title={na.text}><span className="dashboard-cell-clamp">{na.text || o.remarks || 'Review next step'}</span></td><td>{o.orderDate ? ddMMyyyy(o.orderDate) : '—'}</td></tr>})}</tbody></table></div>
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
  }).sort((a, b) => b.value - a.value).slice(0, PREVIEW_LIMIT)
  return <Card title="My customers" icon="users" tone="tone-green" span={12} action={<button onClick={() => nav('/customers')}>View all</button>}>
    <div className="dashboard-table-scroll"><table className="dashboard-table customer-table"><thead><tr><th>Customer</th><th>Class</th><th>Region</th><th>Open opportunities</th><th>Open value (₹)</th><th>Orders</th></tr></thead><tbody>{rows.map(row => { const go = () => nav('/customers'); return <tr key={row.name} tabIndex={0} role="link" aria-label={`Open customer ${row.name}`} onClick={go} onKeyDown={event => activateDashboardRow(event, go)}><td><b className="dashboard-cell-ellipsis">{row.name}</b></td><td><span className={`pill ${row.status}`}>{row.status}</span></td><td><span className="dashboard-cell-ellipsis">{row.region}</span></td><td>{row.open}</td><td>{money ? fmtLakh(row.value) : '—'}</td><td>{row.orders}</td></tr>})}</tbody></table></div>
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
    .slice(0, PREVIEW_LIMIT)
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
  const [scope, setScope] = useState(() => isSalesOwner(role) ? 'my' : 'global')
  const c = counts(store, role)

  const sales = isSalesOwner(role)
  const owner = role === 'LJS'
  const commercial = role === 'AH'
  const approver = isApprover(role) && !isAdminRole(role) && !owner && !commercial
  const admin = isAdminRole(role) && !owner
  const tech = role === 'TECH'

  const { open, blocked, nextActions } = useWorkQueue(store, role, sales && scope === 'my')
  const head = (
    <div className="home-head">
      <div>
        <h2 className="workspace-page-title"><Icon name="chartBar" size={18} /> My Dashboard</h2>
        <p className="hint">{dashboardRoleLabel(role)}{store.sales?.fy ? ` · ${store.sales.fy}` : ''}</p>
      </div>
      <div className="home-head-actions">
        <div className="scope-toggle-group" role="group" aria-label="Dashboard view">
          <button type="button" className={`dashboard-head-action${scope === 'my' ? ' active' : ''}`} aria-pressed={scope === 'my'} onClick={() => setScope('my')}>My View</button>
          <button type="button" className={`dashboard-head-action${scope === 'global' ? ' active' : ''}`} aria-pressed={scope === 'global'} onClick={() => setScope('global')}>Global View</button>
        </div>
        <button className="dashboard-head-action" onClick={() => nav('/opportunities')}><Icon name="cards" size={13} /> Opportunities</button>
      </div>
    </div>
  )

  if (sales) return <SalesDashboard {...{ store, nav, role, c, open, blocked, nextActions, head, scope }} />
  if (owner) return <OwnerDashboard {...{ store, nav, role, c, open, blocked, nextActions, head, scope }} />
  if (commercial) return <CommercialDashboard {...{ store, nav, role, c, open, blocked, nextActions, head, scope }} />
  if (approver) return <ApproverDashboard {...{ store, nav, role, c, open, blocked, nextActions, head, scope }} />
  if (admin) return <AdminDashboard {...{ store, nav, role, c, open, blocked, nextActions, head, scope }} />
  if (tech) return <TechDashboard {...{ store, nav, role, c, open, blocked, nextActions, head, scope }} />

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
function quarterRange(date = new Date()) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const quarter = Math.floor((month - 1) / 3)
  const start = new Date(year, quarter * 3, 1)
  const end = new Date(year, quarter * 3 + 3, 0)
  const iso = value => value.toISOString().slice(0, 10)
  return [iso(start), iso(end)]
}

function SalesPipelineSection({ store, nav, role, scope, money }) {
  const [filter, setFilter] = useState('all')
  const owner = scope === 'my' ? role : null
  const inScope = (store.opportunities || []).filter(o => !owner || o.owner === owner)
    .filter(o => !isHiddenDashboardOpportunity(o))
  const [from, to] = quarterRange()
  const allOpen = inScope.filter(o => o.status === 'Open')
  const open = allOpen.filter(o => o.orderDate && o.orderDate >= from && o.orderDate <= to)
    .sort((a, b) => (+b.valueK || 0) - (+a.valueK || 0))
  // Orders are completed Won opportunities with a customer purchase order.
  // Lost opportunities remain in the opportunity/outcome views, never here.
  const closed = inScope.filter(o => o.status === 'Closed' && o.stage === 'Won')
    .sort((a, b) => String(b.orderDate || b.lastUpdated || '').localeCompare(String(a.orderDate || a.lastUpdated || '')) || ((+b.valueK || 0) - (+a.valueK || 0)))
  const lost = inScope.filter(o => o.status === 'Closed' && o.stage === 'Lost')
    .sort((a, b) => String(b.lastUpdated || b.orderDate || '').localeCompare(String(a.lastUpdated || a.orderDate || '')) || ((+b.valueK || 0) - (+a.valueK || 0)))
  const rows = filter === 'open' ? allOpen : filter === 'closed' ? closed : filter === 'lost' ? lost : [...open, ...closed]
  const preview = rows.slice(0, PREVIEW_LIMIT)
  const tab = (key, label, count) => <button type="button" className={`pipeline-filter${filter === key ? ' active' : ''}`} onClick={() => setFilter(key)}>{label} <b>{count}</b></button>
  return (
    <Card title="My Opportunities / My Orders" icon="sheet" tone="tone-sky" span={12}
      action={<button onClick={() => nav('/opportunities')}>View all</button>}>
      <div className="pipeline-filter-row" aria-label="Opportunity and order filters">
        {tab('all', 'All', inScope.length)}
        {tab('open', 'Open opportunities', allOpen.length)}
        {tab('closed', 'My orders (Won)', closed.length)}
        {tab('lost', 'Lost', lost.length)}
      </div>
      <div className="dashboard-table-scroll"><table className="dashboard-table"><thead><tr><th>ID</th><th>Opportunity / Order</th><th>Customer</th><th>Status</th><th>Stage</th><th>Expected / Close Date</th><th>Value (₹)</th></tr></thead><tbody>
        {preview.map(o => <tr key={o.id} tabIndex={0} role="link" aria-label={`Open opportunity ${displayOpportunityId(o.id)}`} onClick={() => nav(`/opp/${o.id}`)} onKeyDown={event => activateDashboardRow(event, () => nav(`/opp/${o.id}`))}>
          <td><b>{displayOpportunityId(o.id)}</b></td><td><span className="dashboard-cell-ellipsis">{o.oppName}</span></td><td><span className="dashboard-cell-ellipsis">{o.sellTo}</span></td>
          <td><span className={`pill ${o.status === 'Closed' ? (o.stage === 'Won' ? 'won' : 'lost') : 'open'}`}>{o.status === 'Closed' ? `Closed · ${o.stage}` : 'Open'}</span></td>
          <td>{o.stage}</td><td>{o.orderDate ? ddMMyyyy(o.orderDate) : '—'}</td><td>{money ? fmtLakh(o.valueK) : '—'}</td>
        </tr>)}
        {!preview.length && <tr><td className="empty" colSpan={7}>No records in this view.</td></tr>}
      </tbody></table></div>
      {open.length > PREVIEW_LIMIT && filter !== 'closed' && <p className="hint">Showing the five highest-value opportunities expected to close this quarter.</p>}
      {!open.length && filter === 'all' && <p className="hint">No open opportunities are expected to close this quarter.</p>}
    </Card>
  )
}

function SalesDashboard({ store, nav, role, c, open, blocked, nextActions, head, scope }) {
  const perf = salesPerformance(store, scope === 'my' ? role : null)
  const money = canPriceProposal(role)
  const visibleOpen = (scope === 'my' ? store.opportunities.filter(o => o.owner === role && o.status === 'Open') : store.opportunities.filter(o => o.status === 'Open')).filter(o => !isHiddenDashboardOpportunity(o))
  const visibleBlocked = blocked.filter(({ opp }) => !isHiddenDashboardOpportunity(opp))
  const visibleNextActions = nextActions.filter(({ opp }) => !isHiddenDashboardOpportunity(opp))
  const openValue = visibleOpen.reduce((s, o) => s + (+o.valueK || 0), 0)
  const weightedValue = visibleOpen.reduce((s, o) => s + (+o.valueK || 0) * (PROB_WEIGHT[o.prob] ?? PROB_WEIGHT.Low), 0)
  const myLeads = store.leads.filter(l => scope === 'global' || (l.assignedOwner || l.suggestedOwner) === role)
  const leads = myLeads.filter(l => l.status === 'New')
  const unproposed = visibleOpen.filter(o => !o.proposalDate)
  const staleCount = scope === 'my' ? c.myStale : visibleOpen.filter(o => (ageDays(o.lastUpdated) ?? 0) > 30).length
  return (
    <div className="page dashboard-page">
      {head}

      <div className="stat-cards">
        <Metric label="New leads" value={leads.length} tone={leads.length ? 'amber' : 'green'} onClick={() => nav('/inbox')} />
        <Metric label="Blocked" value={visibleBlocked.length} tone={visibleBlocked.length ? 'red' : 'green'} onClick={() => nav('/my')} />
        <Metric label="Needs update" value={staleCount} tone={staleCount ? 'amber' : 'green'} onClick={() => nav('/my')} />
      </div>

      <div className="ana-grid">
        <Card title="Priority queue" icon="target" tone="tone-amber" span={12}
          action={<button onClick={() => nav('/my')}>View all</button>}>
          <NextActions nextActions={visibleNextActions} nav={nav} />
        </Card>

        <Card title="Pipeline snapshot" icon="chartBar" tone="tone-teal" span={12}
          action={<button onClick={() => nav('/analytics')}>Open detailed analytics</button>}>
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
          <div className="pipeline-summary">
            <ul className="stat-list pipeline-stat-list" style={{ marginTop: money ? 10 : 0 }}>
              <li>Open opportunities<b>{visibleOpen.length}</b></li>
              <li>Without a proposal<b>{unproposed.length}</b></li>
              <li>New leads in your queue<b>{leads.length}</b></li>
              <li>Blocked<b>{visibleBlocked.length}</b></li>
            </ul>
          </div>
        </Card>
      </div>

      <div className="ana-grid sales-detail-grid">
        <SalesPipelineSection store={store} nav={nav} role={role} scope={scope} money={money} />
        <SalesCustomerSection store={store} open={visibleOpen} orders={perf.orders} nav={nav} money={money} />
      </div>

      <div className="section-title">Performance</div>
      <PerformanceScorecard perf={perf} scope="personal"
        funnel={<DashboardFunnel store={store} role={role} nav={nav} scope={scope} />} />
      <div className="performance-lower-grid">
        <Card title="Monthly performance against run rate" icon="chartLine" tone="tone-sky" span={8}>
          <RunRateSignal perf={perf} />
          <RunRateChart perf={perf} />
          <div className="hint performance-card-note">
            {perf.fy} · {FY_MONTHS[0]}–{FY_MONTHS[FY_MONTHS.length - 1]} · actual against target run rate,
            booked to {FY_MONTHS[Math.max(0, (perf.monthsElapsed || 1) - 1)]} ·{' '}
            {perf.orders.length} order{perf.orders.length === 1 ? '' : 's'}
          </div>
        </Card>
        <AttainmentCard perf={perf} scope="personal" />
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
                <td className="targets-owner"><b>{displayRole(owner)}</b> <span className="hint">{roleLabel(owner).replace(`${displayRole(owner)} - `, '')}</span></td>
                <td className="num">{fmtLakh(t.annual)}</td>
                {(t.q || [0, 0, 0, 0]).map((v, i) => <td key={FY_QUARTERS[i]} className="num">{fmtLakh(v)}</td>)}
                <td className="num targets-action-cell"><button onClick={() => begin(owner)}>Edit</button></td>
              </tr>
            )
            return (
              <tr key={owner} className="targets-editing">
                <td className="targets-owner"><b>{displayRole(owner)}</b> <span className="hint">{roleLabel(owner).replace(`${displayRole(owner)} - `, '')}</span></td>
                <td className="num targets-action-cell">
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

function ProposalStatusCard({ store, nav }) {
  const [selectedStatus, setSelectedStatus] = useState('all')
  const open = (store.opportunities || []).filter(o => o.status === 'Open')
  const pendingApprovalIds = new Set((store.approvals || [])
    .filter(a => a.status === 'Pending' && a.oppId)
    .map(a => a.oppId))
  const prepared = open.filter(o => o.proposalDate)
  const toPrepare = open.filter(o => !o.proposalDate)
  const awaitingApproval = prepared.filter(o => pendingApprovalIds.has(o.id))
  const sent = prepared.filter(o => !pendingApprovalIds.has(o.id))
  const followUpDue = sent.filter(o => (ageDays(o.proposalDate) || 0) >= 14)
  const statusRows = {
    'To be prepared': toPrepare.map(opp => ({ opp, status: 'To be prepared', action: 'Prepare', path: `/opp/${opp.id}/proposal` })),
    'Awaiting approval': awaitingApproval.map(opp => ({ opp, status: 'Awaiting approval', action: 'Review', path: '/approvals' })),
    Sent: sent.map(opp => ({ opp, status: 'Sent', action: 'View', path: '/proposal-sent' })),
    'Follow-up due': followUpDue.map(opp => ({ opp, status: 'Follow-up due', action: 'Follow up', path: `/opp/${opp.id}/followup` })),
  }
  const priority = [
    ...statusRows['Follow-up due'],
    ...statusRows['Awaiting approval'],
    ...statusRows['To be prepared'],
  ].slice(0, PREVIEW_LIMIT)
  const allStatusRows = Object.values(statusRows).flat()
  const filteredPriority = selectedStatus === 'all' ? priority : allStatusRows.filter(item => item.status === selectedStatus)
  const filteredSummaryLabel = selectedStatus === 'all'
    ? `priority proposal${filteredPriority.length === 1 ? '' : 's'}`
    : `${selectedStatus.toLowerCase()} opportunit${filteredPriority.length === 1 ? 'y' : 'ies'}`
  const toggleStatus = status => setSelectedStatus(current => current === status ? 'all' : status)
  const selectedHeading = selectedStatus === 'all' ? 'Priority proposals' : `${selectedStatus} opportunities`

  return (
    <Card title="Proposal status & follow-up" icon="fileText" tone="tone-sky" span={12}>
      <div className="proposal-status-summary" aria-label="Proposal status summary">
        <button type="button" className={`proposal-status-summary__item proposal-status-summary__item--prepare ${toPrepare.length ? '' : 'is-empty'} ${selectedStatus === 'To be prepared' ? 'is-selected' : ''}`} aria-pressed={selectedStatus === 'To be prepared'} onClick={() => toggleStatus('To be prepared')}><span className="home-alert-value">{toPrepare.length}</span><span>To be prepared</span></button>
        <button type="button" className={`proposal-status-summary__item proposal-status-summary__item--approval ${awaitingApproval.length ? '' : 'is-empty'} ${selectedStatus === 'Awaiting approval' ? 'is-selected' : ''}`} aria-pressed={selectedStatus === 'Awaiting approval'} onClick={() => toggleStatus('Awaiting approval')}><span className="home-alert-value">{awaitingApproval.length}</span><span>Awaiting approval</span></button>
        <button type="button" className={`proposal-status-summary__item proposal-status-summary__item--sent ${sent.length ? '' : 'is-empty'} ${selectedStatus === 'Sent' ? 'is-selected' : ''}`} aria-pressed={selectedStatus === 'Sent'} onClick={() => toggleStatus('Sent')}><span className="home-alert-value">{sent.length}</span><span>Sent</span></button>
        <button type="button" className={`proposal-status-summary__item proposal-status-summary__item--follow-up ${followUpDue.length ? '' : 'is-empty'} ${selectedStatus === 'Follow-up due' ? 'is-selected' : ''}`} aria-pressed={selectedStatus === 'Follow-up due'} onClick={() => toggleStatus('Follow-up due')}><span className="home-alert-value">{followUpDue.length}</span><span>Follow-up due</span></button>
      </div>
      <div className="section-title" style={{ marginTop: 18 }}>{selectedHeading}</div>
      <div className="dashboard-table-scroll">
        <table className="dashboard-table proposal-status-table">
          <thead><tr><th>Opportunity</th><th>Customer</th><th>Owner</th><th>Status</th><th>Value (₹)</th><th>Action</th></tr></thead>
          <tbody>
            {filteredPriority.map(({ opp, status, action, path }) => {
              const go = () => nav(path)
              return (
                <tr key={opp.id} tabIndex={0} role="link" aria-label={`${action} ${opp.id}`} onClick={go} onKeyDown={event => activateDashboardRow(event, go)}>
                  <td><b className="proposal-opportunity-id">{opp.id}</b><span className="proposal-opportunity-name" title={opp.oppName || 'Opportunity unavailable'}>{opp.oppName || '—'}</span></td>
                  <td><span className="proposal-customer-name dashboard-cell-ellipsis" title={opp.sellTo || 'Customer unavailable'}>{opp.sellTo || '—'}</span></td>
                  <td><span className="proposal-owner-name dashboard-cell-ellipsis" title={displayRole(opp.owner)}>{displayRole(opp.owner)}</span></td>
                  <td className="dashboard-status-cell"><span className={`pill ${status === 'Follow-up due' ? 'lost' : status === 'Awaiting approval' ? 'open' : 'won'}`}>{status}</span></td>
                  <td className="num dashboard-value-cell">{fmtLakh(opp.valueK)}</td>
                  <td className="dashboard-action-cell"><span className="hint">{action} →</span></td>
                </tr>
              )
            })}
            {!filteredPriority.length && <tr><td className="empty" colSpan={6}>No {selectedStatus === 'all' ? 'proposal action is' : `${selectedStatus.toLowerCase()} opportunities are`} waiting right now.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="proposal-status-footer"><span className="hint">Showing {filteredPriority.length} {filteredSummaryLabel}</span><button onClick={() => nav('/proposal-sent')}>View all proposals →</button></div>
    </Card>
  )
}

// ------------------------------------------------------------- owner cockpit
// LJS is the strategic owner: start with the whole company picture, then move
// into approvals, risk, attainment, and team targets.
function OwnerDashboard({ store, nav, role, c, blocked, nextActions, head, scope }) {
  const perf = salesPerformance(store, scope === 'my' ? role : null)
  const mine = (store.approvals || []).filter(a => a.status === 'Pending'
    && (a.needed?.length ? a.needed : [a.approver]).includes(role) && !(a.decisions || {})[role])

  return (
    <div className="page dashboard-page">
      {head}
      <AnalyticsOverview {...{ store, role, nav, scope }} summary={(
        <div className="stat-cards">
          <Metric label={scope === 'my' ? 'My pipeline' : 'Company pipeline'} value={analyticsSnapshot(store, role, { scope }).openCount} tone="sky" onClick={() => nav('/analytics')} />
          <Metric label="Waiting on you" value={mine.length} tone={mine.length ? 'amber' : 'green'} onClick={() => nav('/approvals')} />
          <Metric label="Blocked" value={blocked.length} tone={blocked.length ? 'red' : 'green'} onClick={() => nav('/')} />
        </div>
      )} />
      <div className="ana-grid"><ProposalStatusCard {...{ store, nav }} /></div>
      <div className="ana-grid">
        <Card title="Decisions waiting on you" icon="checkCircle" tone="tone-green" span={12}
          action={<button onClick={() => nav('/approvals')}>View all</button>}>
          {mine.slice(0, PREVIEW_LIMIT).map(a => (
            <button key={a.id} className="dashboard-action" onClick={() => nav('/approvals')}>
              <span><b>{a.id}</b> — {a.type}</span>
              <span className="hint">{a.oppId || '—'} · requested by {displayRole(a.requestedBy)}</span>
            </button>
          ))}
          {!mine.length && <p className="hint">Nothing is waiting on you right now.</p>}
        </Card>
      </div>
      <PerformanceScorecard perf={perf} scope="company"
        funnel={<DashboardFunnel store={store} role={role} nav={nav} scope={scope} />} />
      <div className="performance-lower-grid">
        <Card title="Monthly performance against run rate" icon="chartLine" tone="tone-sky" span={8}>
          <RunRateSignal perf={perf} />
          <RunRateChart perf={perf} />
        </Card>
        <AttainmentCard perf={perf} scope="company" />
      </div>
      <div className="ana-grid">
        <TeamTargetsCard store={store} />
        <ForecastReportCard />
      </div>
    </div>
  )
}

// AH's route remains approval-aware, but is intentionally presented as a
// commercial cockpit rather than an application-owner dashboard.
function CommercialDashboard(props) {
  return <ApproverDashboard {...props} commercial />
}

// --------------------------------------------------------------- approvers
function ApproverDashboard({ store, nav, role, c, blocked, nextActions, head, commercial = false, scope }) {
  const perf = salesPerformance(store, scope === 'my' ? role : null)
  const snapshot = analyticsSnapshot(store, role, { scope })
  const mine = (store.approvals || []).filter(a => a.status === 'Pending'
    && (a.needed?.length ? a.needed : [a.approver]).includes(role) && !(a.decisions || {})[role])

  return (
    <div className="page dashboard-page">
      {head}
      <div className="stat-cards">
        <Metric label="Waiting on you" value={mine.length} tone={mine.length ? 'amber' : 'green'} onClick={() => nav('/approvals')} />
        {commercial && <Metric label="Commercial pipeline" value={fmtLakh(snapshot.pipelineK)} tone="sky" onClick={() => nav('/analytics')} />}
        <Metric label="Blocked" value={blocked.length} tone={blocked.length ? 'red' : 'green'} onClick={() => nav('/')} />
        {!commercial && <Metric label="Needs update" value={c.stale} tone={c.stale ? 'amber' : 'green'} onClick={() => nav('/my')} />}
      </div>

      {commercial && <AnalyticsOverview {...{ store, role, nav, scope }} />}

      <div className="ana-grid">
        <Card title="Priority queue" icon="target" tone="tone-amber" span={12}
          action={<button onClick={() => nav('/approvals')}>View all</button>}>
          <NextActions {...{ nextActions, nav }} />
        </Card>

        <Card title={commercial ? 'Commercial decisions' : 'Your approval queue'} icon="checkCircle" tone="tone-green" span={6}
          action={<button onClick={() => nav('/approvals')}>View all</button>}>
          {mine.slice(0, PREVIEW_LIMIT).map(a => (
            <button key={a.id} className="dashboard-action" onClick={() => nav('/approvals')}>
              <span><b>{a.id}</b> — {a.type}</span>
              <span className="hint">{a.oppId || '—'} · requested by {displayRole(a.requestedBy)}</span>
            </button>
          ))}
          {!mine.length && <p className="hint">Nothing is waiting on you right now.</p>}
        </Card>

        <Card title="Blocked opportunities" icon="alert" tone="tone-red" span={6}
          action={<button onClick={() => nav('/')}>View all</button>}>
          {blocked.slice(0, PREVIEW_LIMIT).map(({ opp }) => (
            <button key={opp.id} className="dashboard-action" onClick={() => nav(`/opp/${opp.id}`)}>
              <span><b>{opp.id}</b> — {opp.oppName}</span>
              <span className="hint">{displayRole(opp.owner)} · {opp.stage}</span>
            </button>
          ))}
          {!blocked.length && <p className="hint">No opportunity is currently blocked.</p>}
        </Card>

      </div>

      {!commercial && <AnalyticsOverview {...{ store, role, nav, scope }} />}
      <div className="ana-grid">
        {commercial && (
          <Card title="Commercial posture" icon="chartLine" tone="tone-sky" span={12}>
            <ul className="stat-list">
              <li>Weighted forecast <b>{fmtLakh(snapshot.weightedK)}</b></li>
              <li>Open opportunities <b>{snapshot.openCount}</b></li>
              <li>Win rate <b>{snapshot.decided ? `${snapshot.winPct}%` : '—'}</b></li>
            </ul>
          </Card>
        )}
        <TeamTargetsCard store={store} />
        <ForecastReportCard />
      </div>
      <PerformanceScorecard perf={perf} scope="company"
        funnel={<DashboardFunnel store={store} role={role} nav={nav} scope={scope} />} />
      <div className="performance-lower-grid">
        <Card title="Monthly performance against run rate" icon="chartLine" tone="tone-sky" span={8}>
          <RunRateSignal perf={perf} />
          <RunRateChart perf={perf} />
        </Card>
        <AttainmentCard perf={perf} scope="company" />
      </div>
    </div>
  )
}

// ------------------------------------------------------------------- admin
function AdminDashboard({ store, nav, role, c, blocked, nextActions, head, scope }) {
  const users = store.auth?.users || []
  const pendingUsers = users.filter(u => u.status === 'Pending')
  const perf = salesPerformance(store, scope === 'my' ? role : null)

  return (
    <div className="page dashboard-page">
      {head}
      <div className="stat-cards">
        <Metric label="Awaiting approval" value={pendingUsers.length} tone={pendingUsers.length ? 'amber' : 'green'} onClick={() => nav('/users')} />
        <Metric label="Pending gates" value={c.pending} tone={c.pending ? 'amber' : 'green'} onClick={() => nav('/approvals')} />
        <Metric label="Blocked" value={blocked.length} tone={blocked.length ? 'red' : 'green'} onClick={() => nav('/')} />
      </div>

      <div className="ana-grid">
        <Card title="Priority queue" icon="target" tone="tone-amber" span={12}
          action={<button onClick={() => nav('/approvals')}>View all</button>}>
          <NextActions {...{ nextActions, nav }} />
        </Card>

        <Card title="Registrations awaiting a decision" icon="shield" tone="tone-violet" span={6}
          action={<button onClick={() => nav('/users')}>View all</button>}>
          {pendingUsers.slice(0, PREVIEW_LIMIT).map(u => (
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

      </div>

      <AnalyticsOverview {...{ store, role, nav, scope }} />
      <div className="ana-grid">
        <TeamTargetsCard store={store} />
        <ForecastReportCard />
      </div>
      <PerformanceScorecard perf={perf} scope="company"
        funnel={<DashboardFunnel store={store} role={role} nav={nav} scope={scope} />} />
      <div className="performance-lower-grid">
        <Card title="Monthly performance against run rate" icon="chartLine" tone="tone-sky" span={8}>
          <RunRateSignal perf={perf} />
          <RunRateChart perf={perf} />
        </Card>
        <AttainmentCard perf={perf} scope="company" />
      </div>
    </div>
  )
}

// --------------------------------------------------- technical reviewer
function TechDashboard({ store, nav, blocked, nextActions, head }) {
  // The reviewer works the technical content of live proposals, not a pipeline
  // of their own — so this is scoped by what needs review, not by ownership.
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
        <Metric label="Blocked" value={blocked.length} tone={blocked.length ? 'red' : 'green'} />
      </div>

      <div className="ana-grid">
        <Card title="Priority queue" icon="target" tone="tone-amber" span={12}
          action={<button onClick={() => nav('/')}>View all</button>}>
          <NextActions {...{ nextActions, nav }} />
        </Card>

        <Card title="Proposals to review" icon="fileText" tone="tone-sky" span={12}>
          {forReview.slice(0, PREVIEW_LIMIT).map(({ opp, p }) => (
            <button key={opp.id} className="dashboard-action" onClick={() => nav(`/proposal/${opp.id}`)}>
              <span><b>{opp.id}</b> — {opp.oppName}</span>
              <span className="hint">{(p.bom || []).length} BoQ line(s) · Rev-{p.revision} · {opp.route}</span>
            </button>
          ))}
          {!forReview.length && <p className="hint">No proposal has a BoQ to review yet.</p>}
        </Card>

      </div>

      <div className="ana-grid">
        <Card title="Technical review focus" icon="gear" tone="tone-sky" span={12}>
          <p className="hint">Review proposal BoQs and resolve technical deviations before commercial approval.</p>
          <div className="home-alert-rail" aria-label="Technical review summary">
            <div><span className="home-alert-value">{forReview.length}</span><span>BoQs to review</span></div>
            <div><span className="home-alert-value">{deviations}</span><span>Open deviations</span></div>
            <div><span className="home-alert-value">{blocked.length}</span><span>Blocked opportunities</span></div>
          </div>
        </Card>
      </div>
    </div>
  )
}
