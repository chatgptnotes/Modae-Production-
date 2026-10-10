import React, { useMemo } from 'react'
import { Icon } from '../../icons.jsx'
import { displayOpportunityId } from '../../seed.js'
import { FY_QUARTERS } from '../../kpi.js'
import { canPriceProposal, ddMMyyyy } from '../../utils.js'
import { dashboardModel } from './model.js'
import { useWorkspaceView } from '../../ui/WorkspaceViewContext.jsx'
import './workspace.css'
import usePhoneLayout from '../../tablet/usePhoneLayout.js'
import PhoneDashboard from './PhoneDashboard.jsx'

const money = value => `₹${((Number(value) || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`
const scopeLabel = scope => scope === 'my' ? 'My' : 'Global'

function Card({ label, value, hint, icon, tone, explanation }) {
  return <article className={`reference-kpi reference-kpi--${tone}`} tabIndex={0}
    data-explain-title={label} data-explain={explanation}>
    <div><h2>{label}</h2><strong>{value}</strong><p>{hint}</p></div><span><Icon name={icon} size={27} /></span>
  </article>
}

function Section({ title, accent, action, children, className = '', explanation = '' }) {
  return <section className={`reference-section ${className}`}><header><h2 tabIndex={explanation ? 0 : undefined}
    data-explain-title={explanation ? title : undefined} data-explain={explanation || undefined}>
    <i className={`reference-accent reference-accent--${accent}`} />{title}</h2>{action}</header>{children}</section>
}

function Performance({ model, showMoney, scope, nav, period, setPeriod }) {
  const { perf } = model
  if (model.workbookOnly && !perf.annual && !perf.achieved) {
    return <Section title={`${scopeLabel(scope)} Performance`} accent="green" className="reference-performance">
      <div className="reference-data-empty" role="status">
        <strong>No sales target or booked-order data in the workbook.</strong>
        <span>Pipeline metrics below are calculated from the Excel opportunities.</span>
      </div>
    </Section>
  }
  const maximum = Math.max(1, perf.achieved, perf.annual)
  const gap = Math.max(0, perf.annual - perf.achieved)
  return <Section title={`${scopeLabel(scope)} Performance`} accent="green" className="reference-performance"
    explanation="Compares booked sales with target; YTD target includes quarters through this quarter."
    action={<div className="reference-performance-actions"><button className={period === 'fy' ? 'active' : ''} data-explain-title="Year to date" data-explain="Show fiscal year actuals and target through this quarter." onClick={() => setPeriod('fy')}>YTD</button><button className={period.startsWith('q') ? 'active' : ''} data-explain-title="Quarter to date" data-explain="Show actuals and target for the current quarter." onClick={() => setPeriod(`q${model.currentQuarter}`)}>QTD</button><button className="reference-orders-button" data-explain-title="View orders" data-explain="Open purchase orders." onClick={() => nav('/order')}>View Orders</button></div>}>
    <div className="reference-performance-chart">{[['Actual', perf.achieved, 'actual'], ['Target', perf.annual, 'target']].map(([label, value, kind]) => <div className="reference-bar" key={label} tabIndex={0}
      data-explain-title={label}
      data-explain={label === 'Actual'
        ? 'Actual is the total value of orders booked in the selected period.'
        : 'Target is the configured sales goal for the selected period.'}>
      <span>{label}</span><i><b className={kind} style={{ width: `${Number(value) / maximum * 100}%` }} /></i><strong>{showMoney ? money(value) : value}</strong></div>)}<small>Value ({showMoney ? '₹ L' : 'opportunities'})</small></div>
    <aside className={`reference-gap ${gap > 0 ? 'is-below-target' : 'is-on-target'}`} tabIndex={0} data-explain-title="Gap to target"
      data-explain="Gap is target minus actual, with a minimum of zero.">
      <span>Gap</span><strong>{showMoney ? money(gap) : gap}</strong><b>{perf.annual ? `(${Math.round(gap / perf.annual * 100)}%)` : '—'}</b></aside>
  </Section>
}

function TopOpportunities({ model, nav, showMoney, scope, topPeriod, setTopPeriod, fy }) {
  return <Section title={`Top 5 ${scopeLabel(scope)} Opportunities`} accent="yellow" className="reference-table-section"
    explanation={showMoney ? 'Shows the five highest-value open opportunities with order dates in this period.' : 'Shows up to five open opportunities with order dates in this period.'}
    action={<label className="reference-quarter"><span className="visually-hidden">Top 5 fiscal period</span><select aria-label="Top 5 fiscal period" data-explain-title="Top opportunities period" data-explain="Filters by expected order date." value={topPeriod} onChange={event => setTopPeriod(event.target.value)}><option value="fy">{fy}</option>{FY_QUARTERS.map((label, index) => <option key={label} value={`q${index + 1}`}>{label} · {fy}</option>)}</select></label>}>
    <div className="reference-table-wrap"><table className="reference-table"><thead><tr><th>#</th><th>Opportunity / Customer</th><th>Expected Order Date</th>{showMoney && <th>Expected Order Value</th>}<th>Stage</th><th>Action</th></tr></thead><tbody>
    {model.topOpportunities.map((opp, index) => <tr key={opp.id} tabIndex={0}
      data-explain-title={`Rank ${index + 1} · ${displayOpportunityId(opp.id)}`}
      data-explain={showMoney ? `Ranked by value; stage: ${opp.stage || 'not set'}.` : `Stage: ${opp.stage || 'not set'}.`}>
      <td><b className="reference-rank">{index + 1}</b></td><td><strong>{displayOpportunityId(opp.id)}</strong> <span>· {opp.sellTo || opp.oppName || 'Untitled opportunity'}</span></td><td>{opp.orderDate ? ddMMyyyy(opp.orderDate) : '—'}</td>{showMoney && <td>{money(opp.valueK)}</td>}<td><span className="reference-stage"><i className={`stage-${String(opp.stage || '').toLowerCase().replaceAll(' ', '-')}`} />{opp.stage || '—'}</span></td><td><button data-explain-title="Open opportunity" data-explain="Open this opportunity." onClick={() => nav(`/opp/${opp.id}`)}>Open</button></td></tr>)}
    {!model.topOpportunities.length && <tr><td colSpan={showMoney ? 6 : 5}>No open opportunities with an expected order date in {model.periodLabel}.</td></tr>}
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
  return <Section title={`${scopeLabel(scope)} Action Queue`} accent="red" className="reference-table-section"
    explanation="Shows the three highest-priority actions: approvals, blockers, overdue follow-ups, stale records, then other actions."
  ><div className="reference-table-wrap"><table className="reference-table"><thead><tr><th>Opportunity / Customer</th><th>Action Needed</th><th>Owner</th><th>Due / Status</th><th>Action</th></tr></thead><tbody>
    {tasks.map(task => <tr key={task.id} tabIndex={0}
      data-explain-title={task.text}
      data-explain={priorityReason(task)}>
      <td><strong>{task.opp ? displayOpportunityId(task.opp.id) : 'Approval'}</strong> <span>· {task.opp?.sellTo || task.opp?.oppName || 'Workspace approval'}</span></td><td>{task.text}</td><td>{task.owner || 'Unassigned'}</td><td><span className="reference-blocked" data-tone={task.rank === 2 ? 'danger' : task.rank <= 4 ? 'warning' : 'neutral'}><i />{task.timing || 'Blocked'}</span></td><td><button data-explain-title="Open action" data-explain="Open this action." onClick={() => nav(task.path)}>Open</button></td></tr>)}
    {!tasks.length && <tr><td colSpan="5">Nothing requires action right now.</td></tr>}
  </tbody></table></div></Section>
}

function Funnel({ model, showMoney, scope }) {
  const useValue = showMoney && model.funnel.every(row => row.segments.every(segment => !segment.count || segment.valueK > 0))
  const metric = row => useValue ? row.valueK : row.count
  const maximum = Math.max(1, ...model.funnel.map(metric))
  return <Section title={`${scopeLabel(scope)} Sales Pipeline Funnel`} accent="blue" className="reference-funnel"
    explanation={`Groups opportunities by stage and probability; unknown probabilities count as Low. Funnel widths use ${useValue ? 'expected value' : 'opportunity count'}. Compact colored shapes for empty stages are placeholders; totals show the actual data.`}
    action={<span className="reference-legend"><b className="high" />High <b className="medium" />Medium <b className="low" />Low</span>}><div className="reference-funnel-body"><div className="reference-funnel-list">{model.funnel.map(row => <div className="reference-funnel-row" key={row.key}>
      <strong tabIndex={0} data-explain-title={row.label}
        data-explain={row.key === 'won'
          ? 'Only closed opportunities explicitly marked Won count.'
          : row.key === 'closed-no-win'
            ? 'Includes every closed opportunity not explicitly marked Won. The original Excel stage and reason remain on the record.'
            : `Includes ${row.stages.join(', ')} opportunities. Only open opportunities count.`}>
        {row.label}</strong><div className="reference-funnel-track"><div className={`reference-funnel-fill${row.count ? '' : ' is-empty'}`} style={{ width: `${row.count ? metric(row) / maximum * 100 : 18}%` }}>{row.segments.filter(segment => !row.count || segment.count > 0).map(segment => <span key={segment.key} className={segment.key} tabIndex={0}
        data-explain-title={`${row.label} · ${segment.key} probability`}
        data-explain={`${segment.count} ${segment.count === 1 ? 'opportunity' : 'opportunities'} in this band.${segment.key === 'low' ? ' Missing probability counts as Low.' : ''}`}
        title={`${segment.count} opportunities${showMoney ? ` · ${money(segment.valueK)}` : ''}`}
        style={{ flex: !row.count ? 1 : useValue ? segment.valueK : segment.count }} aria-label={`${segment.count} ${segment.key} probability opportunities${showMoney ? `, ${money(segment.valueK)}` : ''}`} />)}</div></div></div>)}</div><aside className="reference-funnel-totals"><span>Total Count</span>{model.funnel.map(row => <strong key={row.key} tabIndex={0} data-explain-title={`${row.label} · opportunity count`} data-explain={`${row.count} ${row.label} opportunities.`}>{row.count}</strong>)}</aside>{showMoney && <aside className="reference-funnel-totals"><span>Total Value</span>{model.funnel.map(row => <strong key={row.key} tabIndex={0} data-explain-title={`${row.label} · total value`} data-explain={`Combined ${row.label} value: ${money(row.valueK)}.`}>{money(row.valueK)}</strong>)}</aside>}</div></Section>
}

function WinLoss({ model, scope, nav }) {
  const { summary, byReason, closedOther = { count: 0, byStage: [] } } = model.outcomes
  const reasons = byReason.filter(row => row.won || row.lost)
  const maximum = Math.max(1, ...reasons.map(row => Math.max(row.won, row.lost)))
  return <Section title={`${scopeLabel(scope)} Win/Loss Analysis`} accent="purple" className="reference-winloss"
    explanation="Win rate is Won ÷ (Won + Lost); missing reasons are Unspecified, and less common reasons group as Other."
    action={<button className="reference-analysis-button" data-explain-title="Detailed win/loss analysis" data-explain="Open detailed results." onClick={() => nav('/analytics')}>Open detailed analysis ↗</button>}><p className="reference-analysis-subtitle">Analysis of closed opportunities in this view</p><div className="reference-winloss-grid"><div className="reference-rate"><div tabIndex={0} className={`reference-rate-ring${summary.total ? '' : ' is-empty'}`} style={{ '--win-share': `${summary.total ? summary.won / summary.total * 100 : 0}%` }}
      data-explain-title="Win rate"
      data-explain={summary.total ? 'Win rate is Won divided by all closed Won and Lost opportunities.' : 'No closed Won or Lost opportunities yet.'}>
      <strong>{summary.total ? `${summary.winRate}%` : '—'}</strong><span>Win Rate</span></div><p><b>{summary.won}</b> Won<br /><b>{summary.lost}</b> Lost</p><small>Won/Lost Closed <b>{summary.total}</b></small>{closedOther.count > 0 && <small>Closed / No Win <b>{closedOther.count}</b></small>}</div><div className="reference-reasons"><h3>Won vs Lost by Reason</h3>{reasons.map(row => <div key={row.reason} tabIndex={0}
      data-explain-title={row.reason}
      data-explain={`Won: ${row.won}; Lost: ${row.lost}.`}>
      <span>{row.reason}</span><i><b className="won" style={{ width: `${row.won / maximum * 100}%` }} /><b className="lost" style={{ width: `${row.lost / maximum * 100}%` }} /></i><strong>{row.won} / {row.lost}</strong></div>)}{!reasons.length && <p className="reference-chart-empty">No closed opportunities yet.</p>}</div><div className="reference-reasons"><h3>Top Loss Reasons (by count)</h3>{reasons.filter(row => row.lost > 0).sort((a, b) => b.lost - a.lost).map((row, index) => <div key={row.reason} tabIndex={0}
      data-explain-title={`${index + 1}. ${row.reason}`}
      data-explain={`Lost: ${row.lost}; ranked by lost count.`}>
      <span>{index + 1}. {row.reason}</span><i><b className="lost" style={{ width: `${row.lost / maximum * 100}%` }} /></i><strong>{row.lost}</strong></div>)}{!summary.lost && <p className="reference-chart-empty">No lost opportunities yet.</p>}{closedOther.count > 0 && <><h3 className="reference-closed-heading">Closed / No Win</h3>{closedOther.byStage.map(row => <div key={row.stage} tabIndex={0} data-explain-title={row.stage} data-explain="Closed in Excel without an explicit Won or Lost result."><span>{row.stage}</span><strong>{row.count}</strong></div>)}</>}</div></div></Section>
}

export default function WorkspaceDashboard({ store, nav }) {
  const phone = usePhoneLayout()
  const { scope, period, setPeriod, topPeriod, setTopPeriod, owner } = useWorkspaceView()
  const showMoney = canPriceProposal(store.role)
  const knownOwners = [...new Set([...(store.opportunities || []).map(row => row.owner), ...Object.keys(store.sales?.targets || {})])].filter(Boolean)
  const effectiveOwner = knownOwners.includes(owner) ? owner : 'all'
  const model = useMemo(() => dashboardModel(store, { scope, owner: effectiveOwner, period, topPeriod }), [store, scope, effectiveOwner, period, topPeriod])
  const fy = store.sales?.fy || 'current FY'
  if (phone && store.viewMode === 'tablet') return <PhoneDashboard {...{ model, showMoney, nav, store }} />
  return <main className="page dashboard-page dw-reference-dashboard">
    <section className="reference-kpis" aria-label="Dashboard summary">
      <Card label={`${scopeLabel(scope)} Pipeline`} value={showMoney ? money(model.headlinePipelineK) : model.headlineOpenCount}
        hint={`${model.headlineOpenCount} open opportunities`} icon="chartBar" tone="neutral"
        explanation={showMoney ? 'Counts open opportunities and totals their expected values.' : 'Shows open opportunity count; values are restricted.'} />
      <Card label="Follow-ups Due" value={model.followups.length} hint="14+ days since proposal" icon="send" tone="yellow"
        explanation="Counts proposals at least 14 days old; excludes opportunities with pending approvals." />
      <Card label="Pending Approvals" value={model.pending.length} hint={model.workbookOnly ? 'No approval data in workbook' : scope === 'my' ? 'Raised by you or assigned to you' : 'Pending in this view'} icon="clock" tone="yellow"
        explanation={scope === 'my' ? 'Counts requests you raised or approvals assigned to you.' : 'Counts pending approvals matching this view.'} />
      <Card label="Blocked Work" value={model.blocked.length} hint="Review missing requirements" icon="alert" tone="red"
        explanation="Counts open opportunities with a blocking or waiting requirement; each counts once." />
    </section>
    <Performance model={model} showMoney={showMoney} scope={scope} nav={nav} period={period} setPeriod={setPeriod} />
    <TopOpportunities model={model} nav={nav} showMoney={showMoney} scope={scope} topPeriod={topPeriod} setTopPeriod={setTopPeriod} fy={fy} />
    <ActionQueue model={model} nav={nav} scope={scope} />
    <Funnel model={model} showMoney={showMoney} scope={scope} />
    <WinLoss model={model} scope={scope} nav={nav} />
  </main>
}
