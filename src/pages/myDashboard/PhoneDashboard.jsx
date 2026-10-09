import React, { useMemo, useState } from 'react'
import { displayOpportunityId } from '../../seed.js'
import { canSeePage, ddMMyyyy } from '../../utils.js'
import { Icon } from '../../icons.jsx'
import { useWorkspaceView } from '../../ui/WorkspaceViewContext.jsx'
import { FY_QUARTERS } from '../../kpi.js'
import { isQualified, isProposal, phoneTopOpportunities } from './phoneDashboard.js'
import { DashboardSection, PhoneReports, phoneMoney } from './PhoneDashboardReports.jsx'
import './mobileDashboard.css'

const initialsFor = name => String(name || 'M').split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase()

export default function PhoneDashboard({ model, showMoney, nav, store }) {
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const { period, setPeriod, topPeriod, setTopPeriod } = useWorkspaceView()
  const fy = store.sales?.fy || 'Current FY'
  const roles = store.roles || store.role
  const canOpen = page => canSeePage(roles, page)
  const blockedByOpp = useMemo(() => new Map(model.blocked.map(row => [row.opp?.id, row])), [model.blocked])
  const approvalByOpp = useMemo(() => new Map(model.pending.filter(row => row.oppId).map(row => [row.oppId, row])), [model.pending])
  const top = useMemo(() => phoneTopOpportunities(model, { query, filter }), [model, query, filter])
  const candidates = model.topOpportunityCandidates || model.topOpportunities
  const chips = [['all', 'All', candidates.length], ['qualified', 'Qualified', candidates.filter(isQualified).length],
    ['proposal', 'Proposal Sent', candidates.filter(isProposal).length], ['blocked', 'Blocked', candidates.filter(opp => blockedByOpp.has(opp.id)).length]]
  const kpis = [
    ['Open Pipeline', showMoney ? phoneMoney(model.headlinePipelineK) : model.headlineOpenCount, showMoney ? 'Total expected value' : 'Open opportunities', ''],
    ['Follow-ups Due', model.followups.length, 'Needs your attention', ''],
    ['Pending Approvals', model.pending.length, 'Across this view', ''],
    ['Blocked Work', model.blocked.length, 'Requires resolution', 'is-urgent'],
  ]
  const actionFor = opp => {
    if (approvalByOpp.has(opp.id) && canOpen('approvals')) return { label: 'Review Approval', path: '/approvals' }
    if (blockedByOpp.has(opp.id) && canOpen('tracker')) return { label: 'Resolve Blocker', path: `/opp/${opp.id}` }
    if (isProposal(opp) && canOpen('proposal')) return { label: 'View Proposal', path: `/proposal/${opp.id}` }
    return canOpen('tracker') ? { label: 'View Details', path: `/opp/${opp.id}` } : null
  }
  const tasks = model.queue.slice(0, 3)
  const filteredView = Boolean(query.trim()) || filter !== 'all'
  return <main className="page wintrack-mobile-dashboard" aria-label="Mobile sales dashboard">
    <h1 className="visually-hidden">Dashboard</h1>
    <label className="mobile-search"><Icon name="search" size={20} /><span className="visually-hidden">Search opportunities</span><input id="mobile-opportunity-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search customers, opportunities or IDs…" /></label>
    <div className="mobile-filter-row" aria-label="Opportunity filters">{chips.map(([key, label, count]) => <button key={key} type="button" className={`mobile-filter-chip${filter === key ? ' is-active' : ''}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}<b>{count}</b></button>)}</div>
    <section className="mobile-kpi-grid" aria-label="Dashboard summary">{kpis.map(([label, value, hint, tone]) => <article key={label} className={`mobile-kpi ${tone}`}><span>{label}<Icon name="chevronRight" size={14} /></span><strong>{value}</strong><small>{hint}</small></article>)}</section>
    <DashboardSection title="Top 5 Opportunities" subtitle={showMoney ? 'Largest expected value' : 'Open opportunities'} icon="folder" defaultOpen>
      <label className="mobile-period-label">Expected close period<select aria-label="Top 5 fiscal period" value={topPeriod} onChange={event => setTopPeriod(event.target.value)}><option value="fy">{fy}</option>{FY_QUARTERS.map((label, index) => <option key={label} value={`q${index + 1}`}>{label} · {fy}</option>)}</select></label>
      <div className="mobile-opportunity-feed">{top.map((opp, index) => {
        const action = actionFor(opp)
        const blocked = blockedByOpp.get(opp.id)
        const approval = approvalByOpp.has(opp.id)
        const status = approval ? 'Pending Approval' : blocked ? 'Blocked' : isProposal(opp) ? 'Proposal Sent' : opp.stage || 'No stage'
        const tone = approval ? 'warning' : blocked ? 'danger' : isProposal(opp) ? 'warning' : 'neutral'
        const blocker = blocked?.blockers?.find(row => row.severity === 'block' || row.severity === 'wait')
        return <article className="mobile-opportunity-card" key={opp.id}>
          <div className="mobile-customer-line"><span className="mobile-rank">{index + 1}</span><span className={`mobile-customer-avatar mobile-customer-avatar--${index % 4}`}>{initialsFor(opp.sellTo || opp.oppName)}</span><div className="mobile-customer-name"><h3>{opp.sellTo || opp.oppName || 'Untitled opportunity'}</h3><span>{displayOpportunityId(opp.id)}</span></div></div>
          <span className="mobile-stage-badge" data-tone={tone}>{status}</span>
          {blocker && <p className="mobile-blocker-note"><Icon name="alert" size={15} />{blocker.text}</p>}
          <div className="mobile-opportunity-facts"><div><strong>{showMoney ? phoneMoney(opp.valueK) : 'Value restricted'}</strong><small>Expected value</small></div><div><span><Icon name="clock" size={16} />{opp.orderDate ? ddMMyyyy(opp.orderDate) : 'Date not set'}</span><small>Expected close</small></div></div>
          {action && <button type="button" className="mobile-card-action" onClick={() => nav(action.path)}>{action.label}</button>}
        </article>
      })}</div>
      {!top.length && <p className="mobile-empty-state">{filteredView ? 'No opportunities match these filters. Try another filter or clear the search.' : 'No open opportunities expected in this period.'}</p>}
      {canOpen('tracker') && <button type="button" className="mobile-view-all" onClick={() => nav('/opportunities')}>View all opportunities<Icon name="chevronRight" size={17} /></button>}
    </DashboardSection>
    <DashboardSection title="Priority actions" subtitle={`${model.queue.length} actions need attention`} icon="fileText" defaultOpen>
      <div className="mobile-priority-feed">{tasks.map(task => {
        const approval = task.rank === 1
        const allowed = canOpen(approval ? 'approvals' : 'tracker')
        const label = approval ? 'Review Approval' : task.rank === 2 ? 'Resolve Blocker' : task.rank === 3 ? 'Follow Up' : 'View Details'
        return <article className="mobile-priority-action" key={task.id}><span className="mobile-priority-icon"><Icon name={approval ? 'fileText' : task.rank === 3 ? 'clock' : 'alert'} size={22} /></span><div><h3>{task.text}</h3><p>{task.opp?.sellTo || task.opp?.oppName || 'Workspace request'}</p><small>{task.timing}</small></div>{allowed && <button type="button" className="mobile-card-action" onClick={() => nav(task.path)}>{label}</button>}</article>
      })}</div>
      {!tasks.length && <p className="mobile-empty-state">Nothing needs your attention.</p>}
    </DashboardSection>
    <PhoneReports {...{ model, showMoney, nav, period, setPeriod, fy }} canOpen={canOpen} />
  </main>
}
