import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ROLES } from '../seed.js'
import { readiness, isBlocked } from '../gates.js'
import { isApprover, isAdminRole, isSalesOwner, canViewCommercial, canPriceProposal, fmtLakh } from '../utils.js'
import { analyticsSnapshot, counts, salesPerformance, FY_QUARTERS, FY_MONTHS } from '../kpi.js'
import { ArcGauge, Sparkline } from '../dashviz.jsx'
import { Icon } from '../icons.jsx'

// My Dashboard — "there has to be something called My Dashboard… it will be
// different for all the roles" (13 Aug review). The salesperson's version is
// the one the client walked through in the HTML prototype: target, attainment,
// quarterly performance, then their own work queue.

const roleLabel = role => ROLES[role]?.label || role

function Metric({ label, value, hint, tone = '', onClick }) {
  const El = onClick ? 'button' : 'div'
  return (
    <El className={`stat-card-v2 tone-${tone}${onClick ? ' clickable' : ''}`} onClick={onClick}>
      <span className="sc-value">{value}</span>
      <span className="sc-label">{label}</span>
      {hint && <span className="hint">{hint}</span>}
    </El>
  )
}

function Card({ title, icon, tone = '', span = 6, children, action }) {
  return (
    <section className={`ana-card c-${span}`}>
      <div className="ana-title">
        {icon && <span className={`ana-ico ${tone}`}><Icon name={icon} size={15} /></span>}
        {title}
        {action && <span style={{ marginLeft: 'auto' }}>{action}</span>}
      </div>
      {children}
    </section>
  )
}

function AnalyticsOverview({ store, role, nav }) {
  const snapshot = analyticsSnapshot(store, role)
  const metric = row => snapshot.comm ? fmtLakh(row.valueK) : row.count
  const max = Math.max(1, ...snapshot.funnel.map(row => snapshot.comm ? row.valueK : row.count))
  const scope = snapshot.owner ? `Your pipeline · ${snapshot.owner}` : 'Company pipeline'
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

function NextActions({ nextActions, nav }) {
  if (!nextActions.length) return <p className="hint">Nothing is waiting — no open opportunity needs an action.</p>
  return nextActions.map(({ opp, text, severity }) => (
    <button key={opp.id} className="dashboard-action" onClick={() => nav(`/opp/${opp.id}`)}>
      <span>
        {severity === 'block' && <span className="pill Red" style={{ marginRight: 6 }}>Blocked</span>}
        <b>{opp.id}</b> — {opp.oppName}
      </span>
      <span className="hint">{text}</span>
    </button>
  ))
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
      <button onClick={() => nav('/home')}><Icon name="home" size={13} /> Home</button>
    </div>
  )

  if (sales) return <SalesDashboard {...{ store, nav, role, c, open, blocked, nextActions, head }} />
  if (approver) return <ApproverDashboard {...{ store, nav, role, c, open, blocked, nextActions, head }} />
  if (admin) return <AdminDashboard {...{ store, nav, role, c, open, blocked, nextActions, head }} />
  if (tech) return <TechDashboard {...{ store, nav, role, c, open, blocked, nextActions, head }} />

  // Any future role still gets the work queue rather than a blank page.
  return (
    <div className="page">
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
  const leads = store.leads.filter(l => (l.assignedOwner || l.suggestedOwner) === role && l.status === 'New')
  const unproposed = open.filter(o => !o.proposalDate)
  const monthPoints = FY_MONTHS.map((m, i) => ({ key: m, label: m, value: perf.monthly[i] }))
  const variance = perf.achieved - perf.expected

  return (
    <div className="page">
      {head}

      <div className="stat-cards">
        <Metric label="Annual target" value={fmtLakh(perf.annual)} tone="slate" />
        <Metric label="Achieved to date" value={fmtLakh(perf.achieved)} tone={variance >= 0 ? 'green' : 'amber'}
          hint={`${variance >= 0 ? '+' : ''}${fmtLakh(variance)} vs pace`} />
        <Metric label="Gap to target" value={fmtLakh(perf.gap)} tone="sky" />
        <Metric label="Run rate, annualised" value={fmtLakh(perf.runRate)} tone={perf.runRate >= perf.annual ? 'green' : 'amber'} />
      </div>

      <AnalyticsOverview {...{ store, role, nav }} />

      <div className="ana-grid">
        <Card title="Annual attainment" icon="target" tone="tone-green" span={4}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 10px' }}>
            <ArcGauge pct={perf.attainPct} value={`${Math.round(perf.attainPct)}%`} caption={`of ${fmtLakh(perf.annual)}`} />
          </div>
          <table className="cost-table" style={{ width: '100%' }}>
            <tbody>
              <tr><td>Expected by now</td><td className="num">{fmtLakh(perf.expected)}</td></tr>
              <tr><td>Achieved</td><td className="num">{fmtLakh(perf.achieved)}</td></tr>
              <tr className="total"><td>Variance</td>
                <td className="num" style={{ color: variance >= 0 ? 'var(--won-text)' : 'var(--amber-text)' }}>
                  {variance >= 0 ? '+' : ''}{fmtLakh(variance)}
                </td></tr>
            </tbody>
          </table>
        </Card>

        <Card title="Quarterly target vs actual" icon="chartBar" tone="tone-sky" span={8}>
          <QuarterBars perf={perf} />
          <div className="hint" style={{ marginTop: 8 }}>Booked orders against your quarterly number.</div>
        </Card>

        <Card title="Monthly bookings" icon="chartLine" tone="tone-violet" span={6}>
          <div style={{ color: 'var(--primary-accent)' }}><Sparkline points={monthPoints} height={64} /></div>
          <div className="hint">{FY_MONTHS[0]} – {FY_MONTHS[FY_MONTHS.length - 1]} · {perf.orders.length} order{perf.orders.length === 1 ? '' : 's'} booked</div>
        </Card>

        <Card title="Pipeline snapshot" icon="chartBar" tone="tone-teal" span={6}>
          <table className="cost-table" style={{ width: '100%' }}>
            <tbody>
              <tr><td>Open opportunities</td><td className="num">{open.length}</td></tr>
              {money && <tr><td>Open value</td><td className="num">{fmtLakh(openValue)}</td></tr>}
              <tr><td>Without a proposal</td><td className="num">{unproposed.length}</td></tr>
              <tr><td>New leads in your queue</td><td className="num">{leads.length}</td></tr>
              <tr className="total"><td>Blocked</td><td className="num">{blocked.length}</td></tr>
            </tbody>
          </table>
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
            <thead><tr><th>Order</th><th>Customer</th><th className="num">Value</th><th>Status</th></tr></thead>
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
    </div>
  )
}

// --------------------------------------------------------------- approvers
function ApproverDashboard({ store, nav, role, c, open, blocked, nextActions, head }) {
  const perf = salesPerformance(store)   // whole company
  const mine = (store.approvals || []).filter(a => a.status === 'Pending'
    && (a.needed?.length ? a.needed : [a.approver]).includes(role) && !(a.decisions || {})[role])
  const openValue = open.reduce((s, o) => s + (+o.valueK || 0), 0)

  return (
    <div className="page">
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
              <span className="hint">{a.oppId || '—'} · requested by {a.requestedBy}</span>
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

        <Card title="Blocked opportunities" icon="alert" tone="tone-red" span={6}
          action={<span className="pill Red">{blocked.length}</span>}>
          {blocked.slice(0, 6).map(({ opp }) => (
            <button key={opp.id} className="dashboard-action" onClick={() => nav(`/opp/${opp.id}`)}>
              <span><b>{opp.id}</b> — {opp.oppName}</span>
              <span className="hint">{opp.owner} · {opp.stage}</span>
            </button>
          ))}
          {!blocked.length && <p className="hint">No opportunity is currently blocked.</p>}
        </Card>

        <Card title="Next best actions" icon="target" tone="tone-amber" span={6}>
          <NextActions {...{ nextActions, nav }} />
        </Card>
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
    <div className="page">
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
    <div className="page">
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
              <span className="hint">{(p.bom || []).length} BoQ line(s) · Rev {p.revision} · {opp.route}</span>
            </button>
          ))}
          {!forReview.length && <p className="hint">No proposal has a BoQ to review yet.</p>}
        </Card>

        <Card title="Next best actions" icon="target" tone="tone-amber" span={6}>
          <NextActions {...{ nextActions, nav }} />
        </Card>
      </div>
    </div>
  )
}
