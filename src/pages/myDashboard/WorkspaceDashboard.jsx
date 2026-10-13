import NormalFunnel, { FunnelViewSwitch, useFunnelView } from './FunnelView.jsx'
import QuarterPeriodControl from './QuarterPeriodControl.jsx'
import React, { useMemo, useState } from 'react'
import { Icon } from '../../icons.jsx'
import { displayOpportunityId } from '../../seed.js'
import { FY_QUARTERS } from '../../kpi.js'
import { canPriceProposal, ddMMyyyy } from '../../utils.js'
import { dashboardModel } from './model.js'
import { useWorkspaceView } from '../../ui/WorkspaceViewContext.jsx'
import './workspace.css'
import usePhoneLayout from '../../tablet/usePhoneLayout.js'
import PhoneDashboard from './PhoneDashboard.jsx'
import WinLossReport from './WinLossReport.jsx'
import { WonValueNotice } from '../../BookingReview.jsx'
import { bookingReviewer } from '../../orderBookings.js'
import TargetManagerDialog from './TargetManagerDialog.jsx'
import './sculptedGlass.css'
import './phoneWrapping.css'
import './surfaceMotion.css'
import './compactDashboard.css'
import useSurfaceLight from './useSurfaceLight.js'
import { DashboardDrilldownProvider, PipelineCounts } from './DashboardDrilldown.jsx'
import { drillClick, useDashboardDrilldown } from './drillInteraction.js'
export { TargetManagerDialog }

const money = value => `₹${((Number(value) || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`
const scopeLabel = scope => scope === 'my' ? 'My' : 'Global'

function Card({ label, value, hint, icon, tone, explanation, selection }) {
  const open = useDashboardDrilldown()
  const light = useSurfaceLight()
  const action = () => open(selection)
  return <article {...light} className={`reference-kpi reference-kpi--${tone}`} {...drillClick(action, `View ${label}`)} role="group" tabIndex={undefined}
    data-explain-title={label} data-explain={explanation}>
    <div><h2>{label}</h2><strong {...drillClick(action, `View ${label}`)}>{value}</strong><p>{hint}</p></div><span><Icon name={icon} size={34} /></span>
  </article>
}

function Section({ title, accent, action, children, className = '', explanation = '' }) {
  return <section className={`reference-section ${className}`}><header><h2 tabIndex={explanation ? 0 : undefined}
    data-explain-title={explanation ? title : undefined} data-explain={explanation || undefined}>
    <i className={`reference-accent reference-accent--${accent}`} />{title}</h2>{action}</header>{children}</section>
}

export function Performance({ model, showMoney, scope, nav, period, setPeriod, store = {} }) {
  const open = useDashboardDrilldown()
  const [targetsOpen, setTargetsOpen] = useState(false)
  const canManageTargets = bookingReviewer(store.role)
  const { perf, wonPerformance: won } = model
  const periodActions = <div className="reference-performance-actions"><button className={period === 'fy' ? 'active' : ''} data-explain-title="Year to date" data-explain="Show Won work dated this fiscal year through today against the full-year target." onClick={() => setPeriod('fy')}>YTD</button><QuarterPeriodControl period={period} setPeriod={setPeriod} currentQuarter={model.currentQuarter} fy={store.sales?.fy} /><button className="reference-orders-button" data-explain-title="View orders" data-explain="Open purchase orders." onClick={() => nav('/order')}>View Orders</button>{canManageTargets && <button type="button" onClick={() => setTargetsOpen(true)}>Manage targets</button>}</div>
  if (!showMoney) return <Section title={`${scopeLabel(scope)} Performance`} accent="green" className="reference-performance"><p className="reference-chart-empty">Sales values and targets are restricted for your role.</p></Section>
  const hasTarget = period !== 'all' && perf.targetConfigured
  const comparison = hasTarget && !perf.targetNeedsConfirmation && won.estimatedCount === 0 && perf.annual > 0
  const bars = [['Actual', won.valueK, 'actual'], ...(hasTarget
    ? [['Target', perf.annual, 'target']]
    : [['Target', null, 'target', period === 'all' ? 'Shown in YTD or QTD' : perf.targetNeedsConfirmation ? `${perf.targetPendingCount || perf.targetOwnerCount} owner target${(perf.targetPendingCount || perf.targetOwnerCount) === 1 ? '' : 's'} need confirmation` : 'Not configured']])]
  const maximum = Math.max(1, won.valueK, hasTarget ? perf.annual : 0)
  const gap = Math.max(0, perf.annual - won.valueK)
  const gapUnavailable = period === 'all'
    ? 'Targets are shown in YTD and QTD.'
    : perf.targetNeedsConfirmation
    ? `${perf.targetPendingCount} owner target${perf.targetPendingCount === 1 ? '' : 's'} still need confirmation; gap appears when all are confirmed and bookings are verified.`
    : !perf.targetConfigured
      ? 'Available after a target is configured and wins are verified.'
      : 'Available after all included Won values are verified.'
  return <Section title={`${scopeLabel(scope)} Performance`} accent="green" className={`reference-performance${comparison ? '' : ' has-no-comparison'}`}
    explanation="Shows Won opportunity value, using confirmed PO values where available and opportunity estimates otherwise."
    action={periodActions}>
    <div className="reference-performance-chart"><WonValueNotice won={won} perf={perf} period={period} />{bars.map(([label, value, kind, unavailable]) => <div className={`reference-bar${unavailable ? ' reference-bar--pending' : ''}`} key={label} {...drillClick(open && (() => open({ kind })), `View ${label} details`)}
      data-explain-title={label}
      data-explain={kind === 'actual'
        ? 'Won value uses the confirmed PO amount where available and the opportunity estimate otherwise.'
        : 'Target is the configured sales goal for the selected period.'}>
      <span>{label}</span><i>{value !== null && <b className={kind} style={{ width: `${Number(value) / maximum * 100}%` }} />}</i><strong>{unavailable || (showMoney ? money(value) : value)}</strong></div>)}<small>Value ({showMoney ? '₹ L' : 'opportunities'})</small></div>
    {hasTarget && perf.targetNeedsConfirmation && <p className="reference-target-note">Confirmed company target includes {perf.targetOwnerCount - perf.targetPendingCount} of {perf.targetOwnerCount} owner targets. {perf.targetPendingCount} still need confirmation.</p>}
    {comparison && <aside className={`reference-gap ${gap > 0 ? 'is-below-target' : 'is-on-target'}`} {...drillClick(open && (() => open({ kind: 'gap' })), 'View remaining-to-target calculation')} data-explain-title="Remaining to full-period target"
      data-explain="Gap is target minus actual, with a minimum of zero.">
      <span>Gap</span><strong>{showMoney ? money(gap) : gap}</strong><b>{perf.annual ? `(${Math.round(gap / perf.annual * 100)}%)` : '—'}</b></aside>}
    {!comparison && <aside className="reference-gap-placeholder" {...drillClick(open && (() => open({ kind: 'gap' })), 'Why the gap is unavailable')}><span>Gap</span><p>{gapUnavailable}</p></aside>}
    {targetsOpen && canManageTargets && <TargetManagerDialog store={store} onClose={() => setTargetsOpen(false)} />}
  </Section>
}

function TopOpportunities({ model, nav, showMoney, scope, topPeriod, setTopPeriod, fy }) {
  return <Section title={`Top 5 ${scopeLabel(scope)} Opportunities`} accent="yellow" className="reference-table-section"
    explanation={topPeriod === 'all' ? 'Shows up to five open opportunities across all expected order dates, including dates not set.' : showMoney ? 'Shows up to five open opportunities, earliest expected order date first, then highest value for the same date.' : 'Shows up to five open opportunities with order dates in this period.'}
    action={<label className="reference-quarter"><span className="visually-hidden">Top 5 fiscal period</span><select aria-label="Top 5 fiscal period" data-explain-title="Top opportunities period" data-explain="Filters by expected order date. All dates includes opportunities without an expected order date." value={topPeriod} onChange={event => setTopPeriod(event.target.value)}><option value="fy">{fy}</option><option value="all">All dates</option>{FY_QUARTERS.map((label, index) => <option key={label} value={`q${index + 1}`}>{label} · {fy}</option>)}</select></label>}>
    <div className="reference-table-wrap"><table className="reference-table reference-top-opportunities"><thead><tr><th>Sr No</th><th>Opp ID</th><th>Name</th><th>Expected Order Date</th>{showMoney && <th>Expected Order Value</th>}<th>Probability</th><th>Stage</th><th>Action</th></tr></thead><tbody>
    {model.topOpportunities.map((opp, index) => <tr key={opp.id} {...drillClick(() => nav(`/opp/${opp.id}`), `Open opportunity ${displayOpportunityId(opp.id)}`, { row: true })}
      data-explain-title={`Rank ${index + 1} · ${displayOpportunityId(opp.id)}`}
      data-explain={showMoney ? `Ranked by expected order date, then value; stage: ${opp.stage || 'not set'}.` : `Stage: ${opp.stage || 'not set'}.`}>
      <td><b className="reference-rank">{index + 1}</b></td><td><strong>{displayOpportunityId(opp.id)}</strong></td><td>{opp.sellTo || opp.oppName || 'Untitled opportunity'}</td><td>{opp.orderDate ? ddMMyyyy(opp.orderDate) : '—'}</td>{showMoney && <td>{money(opp.valueK)}</td>}<td>{opp.prob || 'Not set'}</td><td><span className="reference-stage"><i className={`stage-${String(opp.stage || '').toLowerCase().replaceAll(' ', '-')}`} />{opp.stage || '—'}</span></td><td><button data-explain-title="Open opportunity" data-explain="Open this opportunity." onClick={() => nav(`/opp/${opp.id}`)}>Open</button></td></tr>)}
    {!model.topOpportunities.length && <tr><td colSpan={showMoney ? 8 : 7}>{model.topOpportunitiesEmptyMessage}</td></tr>}
  </tbody></table></div></Section>
}

function ActionQueue({ model, nav, scope }) {
  const tasks = model.queue.slice(0, 3)
  const priorityReason = task => ({
    1: 'Approval requests are highest priority.',
    2: 'Blocked work comes next.',
    3: 'Follow-ups due after 14 days come next.',
    4: 'Records unchanged for 30+ days come next.',
    5: 'Other assigned actions appear last.',
  }[task.rank] || 'This item needs attention.')
  return <Section title={`${scopeLabel(scope)} Action Queue`} accent="red" className="reference-table-section reference-action-queue"
    explanation="Shows the three highest-priority actions: approvals, blockers, overdue follow-ups, stale records, then other actions."
  ><div className="reference-table-wrap"><table className="reference-table"><thead><tr><th>Opportunity / Customer</th><th>Action Needed</th><th>Owner</th><th>Due / Status</th><th>Action</th></tr></thead><tbody>
    {tasks.map(task => <tr key={task.id} {...drillClick(() => nav(task.path), `Open ${task.text}`, { row: true })}
      data-explain-title={task.text}
      data-explain={priorityReason(task)}>
      <td><strong>{task.opp ? displayOpportunityId(task.opp.id) : 'Approval'}</strong> <span>· {task.opp?.sellTo || task.opp?.oppName || 'Workspace approval'}</span></td><td>{task.text}</td><td>{task.owner || 'Unassigned'}</td><td><span className="reference-blocked" data-tone={task.rank === 2 ? 'danger' : task.rank <= 4 ? 'warning' : 'neutral'}><i />{task.timing || 'Blocked'}</span></td><td><button data-explain-title="Open action" data-explain="Open this action." onClick={() => nav(task.path)}>Open</button></td></tr>)}
    {!tasks.length && <tr><td colSpan="5">Nothing requires action right now.</td></tr>}
  </tbody></table></div></Section>
}

export function Funnel({ model, showMoney, scope, title, onStageClick }) {
  const open = useDashboardDrilldown()
  const [view, setView] = useFunnelView()
  return <Section title={title || `${scopeLabel(scope)} Sales Pipeline Funnel`} accent="blue" className="reference-funnel"
    explanation={view === 'normal' ? 'Each opportunity appears at its current saved stage. Funnel widths represent stage order, not counts. Probability splits and totals reflect saved opportunities.' : "Each opportunity appears at its current saved stage. Curved stage widths vary with opportunity count within a 30%–80% display range for readability; they are not directly proportional to counts. Probability splits and totals reflect the current saved opportunities. Empty stages show zero counts and values."}
    action={<><FunnelViewSwitch view={view} onChange={setView} /><span className="reference-funnel-metric">Opportunities{showMoney ? ' (and Value ₹ L)' : ''}</span><span className="reference-legend"><b className="high" />High <b className="medium" />Medium <b className="low" />Low</span></>}><p className="reference-analysis-subtitle">{view === 'normal' ? 'Current stage · Widths show stage order, not counts · Splits show probability · Grey = empty' : 'Current stage · Widths adjusted for readability · Splits show probability · Grey = empty'}</p><NormalFunnel view={view} rows={model.funnel} animate showMoney={showMoney} formatMoney={money} onStageClick={onStageClick || (open && (row => open({ kind: 'funnel', stageKey: row.key })))} onSegmentClick={open && ((row, probability) => open({ kind: 'funnel', stageKey: row.key, probability }))} /></Section>
}

function WinLoss({ model, scope, nav, showMoney }) {
  return <Section title={`${scopeLabel(scope)} Win/Loss Analysis`} accent="purple" className="reference-winloss"
    explanation="All history. Win rate is Won ÷ (Won + Lost); missing reasons are Unspecified. Other closed outcomes are excluded from win rate."
    action={<button className="reference-analysis-button" data-explain-title="Detailed win/loss analysis" data-explain="Open detailed results." onClick={() => nav('/analytics')}>Open detailed analysis ↗</button>}>
    <p className="reference-analysis-subtitle">All history · Closed opportunities in this view</p>
    <WinLossReport outcomes={model.outcomes} showMoney={showMoney} animateDonut />
  </Section>
}

export default function WorkspaceDashboard({ store, nav }) {
  const phone = usePhoneLayout()
  const { scope, period, setPeriod, topPeriod, setTopPeriod, owner } = useWorkspaceView()
  const showMoney = canPriceProposal(store.role)
  const knownOwners = [...new Set([...(store.opportunities || []).map(row => row.owner), ...Object.keys(store.sales?.targets || {})])].filter(Boolean)
  const effectiveOwner = knownOwners.includes(owner) ? owner : 'all'
  const model = useMemo(() => dashboardModel(store, { scope, owner: effectiveOwner, period, topPeriod }), [store, scope, effectiveOwner, period, topPeriod])
  const fy = store.sales?.fy || 'current FY'
  const wrap = children => <DashboardDrilldownProvider {...{ model, showMoney, period, scope, store, nav }} owner={effectiveOwner}>{children}</DashboardDrilldownProvider>
  if (phone && store.viewMode === 'tablet') return wrap(<PhoneDashboard {...{ model, showMoney, nav, store }} />)
  return wrap(<main className="page dashboard-page dw-reference-dashboard" data-dashboard-depth="glass" data-dashboard-density="compact">
    <section className="reference-kpis" aria-label="Dashboard summary">
      <Card label={`${scopeLabel(scope)} Pipeline`} value={showMoney ? money(model.headlinePipelineK) : model.headlineOpenCount}
        hint={<PipelineCounts model={model} />} selection={{ kind: 'pipeline' }} icon="chartGrowth" tone="neutral"
        explanation={showMoney ? 'Totals expected values of open opportunities; the summary counts all, open and closed opportunities in this view.' : 'Shows open opportunity count and the total/open/closed summary for this view; values are restricted.'} />
      <Card selection={{ kind: 'followups' }} label="Follow-ups Due" value={model.followups.length} hint="14+ days since proposal" icon="calendarReminder" tone="yellow"
        explanation="Counts proposals at least 14 days old; excludes opportunities with pending approvals." />
      <Card selection={{ kind: 'pending' }} label="Pending Approvals" value={model.pending.length} hint={model.workbookOnly ? 'No approval data in workbook' : scope === 'my' ? 'Raised by you or assigned to you' : 'Pending in this view'} icon="fileCheck" tone="yellow"
        explanation={scope === 'my' ? 'Counts requests you raised or approvals assigned to you.' : 'Counts pending approvals matching this view.'} />
      <Card selection={{ kind: 'blocked' }} label="Blocked Work" value={model.blocked.length} hint="Review missing requirements" icon="ban" tone="red"
        explanation="Counts open opportunities with a blocking or waiting requirement; each counts once." />
    </section>
    <Performance model={model} showMoney={showMoney} scope={scope} nav={nav} period={period} setPeriod={setPeriod} store={store} />
    <TopOpportunities model={model} nav={nav} showMoney={showMoney} scope={scope} topPeriod={topPeriod} setTopPeriod={setTopPeriod} fy={fy} />
    <ActionQueue model={model} nav={nav} scope={scope} />
    <Funnel model={model} showMoney={showMoney} scope={scope} />
    <WinLoss model={model} scope={scope} nav={nav} showMoney={showMoney} />
  </main>)
}
