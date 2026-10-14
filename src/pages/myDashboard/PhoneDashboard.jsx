import React, { useMemo, useState } from 'react'
import { displayOpportunityId } from '../../seed.js'
import { canSeePage, ddMMyyyy } from '../../utils.js'
import { Icon } from '../../icons.jsx'
import { useWorkspaceView } from '../../ui/WorkspaceViewContext.jsx'
import { FY_QUARTERS } from '../../kpi.js'
import { isProposal, phoneTopOpportunities } from './phoneDashboard.js'
import { DashboardSection, PhoneReports, phoneMoney } from './PhoneDashboardReports.jsx'
import './mobileDashboard.css'
import { PipelineCounts } from './DashboardDrilldown.jsx'
import { drillClick, useDashboardDrilldown } from './drillInteraction.js'


export default function PhoneDashboard({ model, showMoney, nav, store }) {
  const open = useDashboardDrilldown()
  const [query, setQuery] = useState('')
  const { period, setPeriod, topPeriod, setTopPeriod } = useWorkspaceView()
  const fy = store.sales?.fy || 'Current FY'
  const roles = store.roles || store.role
  const canOpen = page => canSeePage(roles, page)
  const blockedByOpp = useMemo(() => new Map(model.blocked.map(row => [row.opp?.id, row])), [model.blocked])
  const approvalByOpp = useMemo(() => new Map(model.pending.filter(row => row.oppId).map(row => [row.oppId, row])), [model.pending])
  const top = useMemo(() => phoneTopOpportunities(model, { query }), [model, query])
  const kpis = [
    ['Open Pipeline', showMoney ? phoneMoney(model.headlinePipelineK) : model.headlineOpenCount, <PipelineCounts model={model} />, '', 'pipeline'],
    ['Follow-ups Due', model.followups.length, 'Needs your attention', 'is-warning', 'followups'],
    ['Pending Approvals', model.pending.length, 'Across this view', 'is-warning', 'pending'],
    ['Blocked Work', model.blocked.length, 'Requires resolution', 'is-urgent', 'blocked'],
  ]
  const actionFor = opp => {
    if (approvalByOpp.has(opp.id) && canOpen('approvals')) return { label: 'Review Approval', path: '/approvals' }
    if (blockedByOpp.has(opp.id) && canOpen('tracker')) return { label: 'Resolve Blocker', path: `/opp/${opp.id}` }
    if (isProposal(opp) && canOpen('proposal')) return { label: 'View Proposal', path: `/proposal/${opp.id}` }
    return canOpen('tracker') ? { label: 'View Details', path: `/opp/${opp.id}` } : null
  }
  const tasks = model.queue.slice(0, 3)
  const filteredView = Boolean(query.trim())
  return <main className="page wintrack-mobile-dashboard" data-dashboard-depth="glass" aria-label="Mobile sales dashboard">
    <h1 className="visually-hidden">Dashboard</h1>
    <label className="mobile-search"><Icon name="search" size={20} /><span className="visually-hidden">Search opportunities</span><input id="mobile-opportunity-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search customers, opportunities or IDs…" /></label>
    <section className="mobile-kpi-grid" aria-label="Dashboard summary">{kpis.map(([label, value, hint, tone, kind]) => <article key={label} className={`mobile-kpi ${tone}`} {...drillClick(open && (() => open({ kind })), `View ${label}`)} role="group" tabIndex={undefined}><span>{label}<Icon name="chevronRight" size={14} /></span><strong {...drillClick(open && (() => open({ kind })), `View ${label}`)}>{value}</strong><small>{hint}</small></article>)}</section>
    <DashboardSection title="Top 5 Opportunities" subtitle="Nearest expected order date" icon="folder" defaultOpen>
      <label className="mobile-period-label">Expected order period<select aria-label="Top 5 fiscal period" value={topPeriod} onChange={event => setTopPeriod(event.target.value)} name="phone-dashboard-top-5-fiscal-period"><option value="fy">{fy}</option><option value="all">All dates</option>{FY_QUARTERS.map((label, index) => <option key={label} value={`q${index + 1}`}>{label} · {fy}</option>)}</select></label>
      <div className="mobile-opportunity-feed">{top.map(opp => {
        const action = actionFor(opp)
        const blocked = blockedByOpp.get(opp.id)
        const approval = approvalByOpp.has(opp.id)
        const status = approval ? 'Pending Approval' : blocked ? 'Blocked' : isProposal(opp) ? 'Proposal Sent' : opp.stage || 'No stage'
        const tone = approval ? 'warning' : blocked ? 'danger' : isProposal(opp) ? 'warning' : 'neutral'
        const blocker = blocked?.blockers?.find(row => row.severity === 'block' || row.severity === 'wait')
        const stageTone = /won/i.test(opp.stage || '') ? 'success' : /rfq|proposal|negotiat/i.test(opp.stage || '') ? 'warning' : /lead|qualif|budget/i.test(opp.stage || '') ? 'info' : 'neutral'
        return <article className="mobile-deal-row" data-stage-tone={stageTone} key={opp.id} {...drillClick(canOpen('tracker') && (() => nav(`/opp/${opp.id}`)), `Open opportunity ${displayOpportunityId(opp.id)}`, { row: true })}>
          <div className="mobile-deal-heading"><div className="mobile-deal-customer"><h3>{opp.sellTo || opp.oppName || 'Untitled opportunity'}</h3>{opp.sellTo && opp.oppName && opp.sellTo !== opp.oppName && <p>{opp.oppName}</p>}<small>{displayOpportunityId(opp.id)}</small></div><strong className="mobile-deal-value">{showMoney ? phoneMoney(opp.valueK) : 'Value restricted'}</strong></div>
          <div className="mobile-deal-meta"><span className="mobile-deal-stage">{opp.stage || 'No stage'}</span><span><span className="visually-hidden">Expected order date: </span><Icon name="clock" size={14} />{opp.orderDate ? ddMMyyyy(opp.orderDate) : 'Date not set'}</span><span><span className="visually-hidden">Probability: </span>{opp.prob || 'Not set'}</span></div>
          {(approval || blocked || isProposal(opp)) && <span className="mobile-stage-badge" data-tone={tone}>{status}</span>}
          {blocker && <p className="mobile-blocker-note"><Icon name="alert" size={15} />{blocker.text}</p>}
          {action && <button type="button" className="mobile-deal-action" onClick={event => { event.stopPropagation(); nav(action.path) }}>{action.label}<Icon name="chevronRight" size={14} /></button>}
        </article>
      })}</div>
      {!top.length && <p className="mobile-empty-state">{filteredView ? 'No opportunities match your search. Try another term or clear the search.' : model.topOpportunitiesEmptyMessage}</p>}
      {canOpen('tracker') && <button type="button" className="mobile-view-all" onClick={() => nav('/opportunities')}>View all opportunities<Icon name="chevronRight" size={17} /></button>}
    </DashboardSection>
    <DashboardSection title="Priority actions" subtitle={`${model.queue.length} actions need attention`} icon="fileText" defaultOpen>
      <div className="mobile-priority-feed">{tasks.map(task => {
        const approval = task.rank === 1
        const allowed = canOpen(approval ? 'approvals' : 'tracker')
        const label = approval ? 'Review Approval' : task.rank === 2 ? 'Resolve Blocker' : task.rank === 3 ? 'Follow Up' : 'View Details'
        return <article className="mobile-deal-row mobile-task-row" data-stage-tone={task.rank === 2 ? 'danger' : approval || task.rank === 3 ? 'warning' : 'info'} key={task.id} {...drillClick(allowed && (() => nav(task.path)), `Open ${task.text}`, { row: true })}>
          <div className="mobile-deal-customer"><h3>{task.opp?.sellTo || task.opp?.oppName || 'Workspace request'}</h3><p>{task.text}</p></div>
          <div className="mobile-task-footer"><span className="mobile-deal-meta">{task.timing}</span>{allowed && <button type="button" className="mobile-deal-action" onClick={event => { event.stopPropagation(); nav(task.path) }}>{label}<Icon name="chevronRight" size={14} /></button>}</div>
        </article>
      })}</div>
      {!tasks.length && <p className="mobile-empty-state">Nothing needs your attention.</p>}
    </DashboardSection>
    <PhoneReports {...{ model, showMoney, nav, period, setPeriod, fy }} canOpen={canOpen} />
  </main>
}
