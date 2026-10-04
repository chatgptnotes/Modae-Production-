import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Icon } from '../../icons.jsx'
import { displayOpportunityId } from '../../seed.js'
import { canPriceProposal, ddMMyyyy, displayRole, displayRoleLabel, isSalesOwner } from '../../utils.js'
import { FY_QUARTERS } from '../../kpi.js'
import { dashboardModel, dashboardTiming, paginationNumbers, PAGE_SIZE, registerRows } from './model.js'
import './workspace.css'

function Panel({ title, icon, subtitle, children, className = '', action }) {
  return <section className={`dw-panel ${className}`}>
    <div className="dw-panel-head"><div><h3><Icon name={icon} size={19} />{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{action}</div>
    {children}
  </section>
}

function SummaryCard({ label, value, hint, icon, tone = 'neutral', onClick }) {
  return <button type="button" className={`dw-kpi dw-${tone}`} onClick={onClick}>
    <span className="dw-kpi-copy"><span className="dw-kpi-label">{label}</span><strong>{value}</strong><span className="dw-muted">{hint}</span></span>
    <span className="dw-kpi-icon"><Icon name={icon} size={24} /></span>
  </button>
}

const money = value => {
  const amount = Number(value) || 0
  return `₹${(amount / 100).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: amount && Math.abs(amount) < 10 ? 3 : 1 })} L`
}

function OutcomeIcon({ won = false, name }) {
  return <span className="dw-outcome-icon">{won ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M7 3h10v6a5 5 0 0 1-10 0V3Zm5 11v5m-4 2h8M7 5H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4" /></svg> : <Icon name={name} size={21} />}</span>
}

function Timing({ due, fallback = '—', title }) {
  const timing = dashboardTiming(due, fallback)
  return <span className={`dw-timing dw-${timing.tone}`} title={timing.title || title}>{due && timing.title && <i aria-hidden="true" />}{timing.label}</span>
}

function Outcomes({ model, showMoney }) {
  const closed = model.pipeline.filter(o => o.stage === 'Won' || o.stage === 'Lost')
  const { summary } = model.outcomes
  return <div className="dw-outcomes" aria-label="Closed opportunity results">
    {[{ label: 'Won', count: summary.won, tone: 'success', stage: 'Won' }, { label: 'Lost', count: summary.lost, tone: 'danger', stage: 'Lost' }].map(row =>
      <div key={row.stage} className={`dw-${row.tone}`}><OutcomeIcon won={row.stage === 'Won'} name="x" /><div><span>{row.label}</span><strong>{row.count}</strong>{showMoney && <small>{money(closed.filter(o => o.stage === row.stage).reduce((s, o) => s + (+o.valueK || 0), 0))}</small>}</div></div>)}
    <div><OutcomeIcon name="target" /><div><span>Win rate</span><strong>{summary.total ? `${summary.winRate}%` : '—'}</strong><small>{summary.total ? `${summary.total} closed` : 'No closed results'}</small></div></div>
  </div>
}

function Performance({ model, showMoney, scope, period }) {
  const rows = model.team.slice().sort((a, b) => b.achieved - a.achieved).slice(0, 5)
  const max = Math.max(1, ...rows.flatMap(row => showMoney ? [row.annual, row.achieved] : [row.open]))
  return <Panel title={scope === 'my' ? 'My performance' : 'Team performance'} icon="users"
    subtitle={showMoney ? 'Actual vs target · ₹ L' : 'Open opportunities by owner'}
    action={showMoney && <div className="dw-legend"><span><i />Actual</span><span><i className="dw-target" />Target</span></div>}>
    <div className={`dw-team-bars ${showMoney ? '' : 'dw-count-only'}`}>
      <div className="dw-team-head"><span>{scope === 'my' ? 'Owner' : 'Team'}</span><span />{showMoney ? <><span>Actual</span><span>Target</span></> : <span>Open</span>}</div>
      {rows.map(row => <div className="dw-team-row" key={row.owner}>
        <span title={displayRoleLabel(row.owner)}>{row.owner}</span>
        <span className="dw-team-track" role="img" aria-label={showMoney ? `${displayRole(row.owner)}: ${money(row.achieved)} actual, ${money(row.annual)} target` : `${displayRole(row.owner)}: ${row.open} open opportunities`}>
          {showMoney && <i className="dw-team-target" style={{ width: `${row.annual / max * 100}%` }} />}
          <i className="dw-team-actual" style={{ width: `${(showMoney ? row.achieved : row.open) / max * 100}%` }} />
        </span>
        <b>{showMoney ? money(row.achieved) : row.open}</b>
        {showMoney && <span className="dw-team-target-value">{money(row.annual)}</span>}
      </div>)}
      {!rows.length && <p className="dw-empty">No performance data in this view.</p>}
    </div>
    <div className="dw-results-label">Closed results {period === 'all' ? '(all dates)' : `(${period.startsWith('q') ? `${period.toUpperCase()} · ` : ''}${model.perf.fy || 'This FY'})`}</div><Outcomes model={model} showMoney={showMoney} />
  </Panel>
}

function QuarterlyPerformance({ perf, period }) {
  const chartId = useId()
  const max = Math.max(1, ...perf.quarterActual, ...perf.quarterTarget)
  return <Panel title="Performance against target" icon="chartBar" subtitle="Quarterly actual vs target · ₹ L"
    action={<div className="dw-legend"><span><i />Actual</span><span><i className="dw-target" />Target</span></div>}>
    <div className="dw-quarter-layout">
      <div>
        <svg className="dw-quarter-chart" viewBox="0 0 640 190" role="img" aria-labelledby={chartId}>
          <title id={chartId}>Quarterly actual versus target: {FY_QUARTERS.map((q, i) => `${q}: ${money(perf.quarterActual[i])} actual, ${money(perf.quarterTarget[i])} target`).join('; ')}</title>
          {[0, 0.5, 1].map(tick => <g key={tick}><line x1="50" x2="628" y1={145 - tick * 120} y2={145 - tick * 120} /><text x="42" y={149 - tick * 120} textAnchor="end">{(max * tick / 100).toLocaleString('en-IN', { maximumFractionDigits: 1 })}</text></g>)}
          {FY_QUARTERS.map((q, i) => <g key={q}>
            <rect className="dw-chart-actual" x={76 + i * 142} y={145 - (perf.quarterActual[i] || 0) / max * 120} width="44" height={(perf.quarterActual[i] || 0) / max * 120} rx="2" />
            <rect className="dw-chart-target" x={122 + i * 142} y={145 - (perf.quarterTarget[i] || 0) / max * 120} width="44" height={(perf.quarterTarget[i] || 0) / max * 120} rx="2" />
            <text className="dw-chart-label" x={98 + i * 142} y={Math.max(14, 139 - (perf.quarterActual[i] || 0) / max * 120)} textAnchor="middle">{((perf.quarterActual[i] || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</text>
            <text className="dw-chart-label" x={144 + i * 142} y={Math.max(14, 139 - (perf.quarterTarget[i] || 0) / max * 120)} textAnchor="middle">{((perf.quarterTarget[i] || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</text>
            <text x={121 + i * 142} y="168" textAnchor="middle">{q.slice(0, 2)}</text>
          </g>)}
        </svg>
        <table className="visually-hidden"><caption>Quarterly performance</caption><thead><tr><th>Quarter</th><th>Actual</th><th>Target</th></tr></thead><tbody>{FY_QUARTERS.map((q, i) => <tr key={q}><th scope="row">{q}</th><td>{money(perf.quarterActual[i])}</td><td>{money(perf.quarterTarget[i])}</td></tr>)}</tbody></table>
      </div>
      <dl className="dw-target-summary"><dt>{period.startsWith('q') ? `${period.toUpperCase()} target summary` : `${perf.fy || 'FY'} target summary`}</dt>
        <div><dt>Target</dt><dd>{money(perf.annual)}</dd></div><div><dt>Achieved</dt><dd>{money(perf.achieved)}</dd></div><div><dt>Gap</dt><dd>{money(perf.gap)}</dd></div>
      </dl>
    </div>
  </Panel>
}

export default function WorkspaceDashboard({ store, nav, renderReports, reportHash = '' }) {
  const role = store.role
  const [scope, setScope] = useState(() => isSalesOwner(role) ? 'my' : 'global')
  const [owner, setOwner] = useState('all')
  const [period, setPeriod] = useState('fy')
  const [query, setQuery] = useState('')
  const [stage, setStage] = useState('all')
  const [workFilter, setWorkFilter] = useState('all')
  const [tab, setTab] = useState('opportunities')
  const [page, setPage] = useState(1)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshNote, setRefreshNote] = useState('')
  const [showAllTasks, setShowAllTasks] = useState(false)
  const [reportsOpen, setReportsOpen] = useState(reportHash === '#forecast-details')
  const register = useRef(null)
  const reportMenu = useRef(null)
  const reportPanel = useRef(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    setScope(isSalesOwner(role) ? 'my' : 'global'); setOwner('all'); setReportsOpen(false)
  }, [role])
  useEffect(() => { if (reportHash === '#forecast-details') setReportsOpen(true) }, [reportHash, role])
  useEffect(() => { if (reportsOpen) reportPanel.current?.focus({ preventScroll: true }) }, [reportsOpen])
  const showMoney = canPriceProposal(role)
  const owners = [...new Set([...(store.opportunities || []).map(o => o.owner), ...Object.keys(store.sales?.targets || {})])].filter(Boolean).sort()
  const effectiveOwner = owners.includes(owner) ? owner : 'all'
  const model = useMemo(() => dashboardModel(store, { scope, owner: effectiveOwner, period }), [store, scope, effectiveOwner, period])
  const rows = registerRows(model, { query, stage, workFilter, tab })
  const approvals = model.pending.filter(a => !query.trim() || [a.id, a.oppId, a.type, a.requestedBy, a.approver].some(value => String(value || '').toLowerCase().includes(query.trim().toLowerCase())))
  const team = model.team.filter(row => !query.trim() || `${row.owner} ${displayRole(row.owner)}`.toLowerCase().includes(query.trim().toLowerCase()))
  const records = tab === 'approvals' ? approvals : tab === 'team' ? team : rows
  const pages = Math.max(1, Math.ceil(records.length / PAGE_SIZE))
  const currentPage = Math.min(page, pages)
  const preview = records.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  useEffect(() => { setPage(1) }, [scope, effectiveOwner, period, query, stage, workFilter, tab])
  useEffect(() => { setShowAllTasks(false); setStage('all'); setWorkFilter('all'); setQuery(''); setTab('opportunities') }, [scope])
  const switchView = value => { setScope(value); setOwner('all') }
  const openRegister = (nextTab = 'opportunities', nextStage = 'all', filter = 'open') => {
    setTab(nextTab); setStage(nextStage); setWorkFilter(filter); setQuery(''); setPage(1)
    register.current?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    register.current?.focus({ preventScroll: true })
  }
  const refresh = async () => {
    if (refreshing) return
    setRefreshing(true); setRefreshNote('')
    try {
      const success = await store.refreshSharedData()
      if (mounted.current) setRefreshNote(success ? `Refreshed at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Cloud refresh unavailable. Showing current workspace data.')
    } catch {
      if (mounted.current) setRefreshNote('Refresh failed. Try again.')
    } finally { if (mounted.current) setRefreshing(false) }
  }
  const scopeName = scope === 'my' ? 'My' : 'Company'
  const firstTasks = showAllTasks ? model.queue : model.queue.slice(0, 3)
  const maxFunnel = Math.max(1, ...model.funnel.map(row => row.count))
  const renderOpportunity = opp => {
    const work = model.work.find(item => item.opp.id === opp.id)
    const action = work?.action
    const stageKey = model.funnel.find(row => row.stages.includes(opp.stage))?.key || String(opp.stage || '').toLowerCase()
    const blocker = work?.blockers.find(b => b.severity === 'block' || b.severity === 'wait')
    const due = blocker?.key === 'clarifications' ? work.clarificationDue : ''
    const status = blocker ? (blocker.severity === 'wait' ? 'Waiting' : 'Blocked') : opp.status === 'Closed' ? opp.stage : '—'
    return <tr key={opp.id}>
      <td><button className="dw-text-link ghost" onClick={() => nav(`/opp/${opp.id}`)}>{displayOpportunityId(opp.id)}</button></td>
      <td title={opp.oppName || ''}><b>{opp.sellTo || opp.oppName || 'Untitled opportunity'}</b></td>
      <td><span className={`dw-stage dw-stage-${stageKey}`}>{model.funnel.find(row => row.stages.includes(opp.stage))?.label || opp.stage || '—'}</span></td>
      {showMoney && <td className="dw-num">{money(opp.valueK)}</td>}
      <td title={displayRole(opp.owner)}>{opp.owner || 'Unassigned'}</td><td>{action?.text || opp.remarks || 'Review next step'}</td><td><Timing due={due} fallback={status} title={opp.orderDate ? `Expected close: ${ddMMyyyy(opp.orderDate)}` : undefined} /></td>
    </tr>
  }
  return <div className="page dashboard-page dashboard-workspace">
    <header className="dw-header"><div><h2 className="workspace-page-title"><Icon name="chartBar" size={18} /> My Dashboard</h2><p>{displayRoleLabel(role).replace(displayRole(role), role)}{store.sales?.fy ? ` · ${store.sales.fy}` : ''}</p></div>
      <div className="dw-header-controls">
        <div className="dw-scope" role="group" aria-label="Dashboard view">{['my', 'global'].map(value => <button key={value} type="button" className="ghost" aria-pressed={scope === value} onClick={() => switchView(value)}>{value === 'my' ? 'My View' : 'Global View'}</button>)}</div>
        <label className="dw-filter"><span className="visually-hidden">Opportunity creation and booking period</span><select value={period} title="Opportunities by creation date; orders by booking date" onChange={event => setPeriod(event.target.value)}><option value="all">All dates</option><option value="fy">{store.sales?.fy || 'This FY'}</option>{FY_QUARTERS.map((label, i) => <option key={label} value={`q${i + 1}`}>{label}</option>)}</select></label>
        {scope === 'global' && <label className="dw-filter"><span className="visually-hidden">Owner</span><select value={effectiveOwner} onChange={event => setOwner(event.target.value)}><option value="all">All owners</option>{owners.map(key => <option key={key} value={key}>{displayRole(key)}</option>)}</select></label>}
        <button className="dw-refresh ghost" onClick={refresh} disabled={refreshing} aria-label={refreshing ? 'Refreshing dashboard' : 'Refresh dashboard'} title="Refresh dashboard"><Icon name="refresh" size={19} /><span className="visually-hidden">{refreshing ? 'Refreshing…' : 'Refresh'}</span></button>
        <span className="dw-refresh-note" role="status">{refreshNote || 'Current workspace'}</span>
      </div>
    </header>
    <p className="visually-hidden">{scope === 'my' ? 'Your assigned opportunities and work needing your attention' : effectiveOwner === 'all' ? 'Company overview · All owners' : `Company overview · ${displayRole(effectiveOwner)}`}</p>
    <section className="dw-summary" aria-label="Dashboard summary">
      <SummaryCard label={`${scopeName} pipeline`} value={showMoney ? money(model.pipelineK) : model.open.length} hint={`${model.open.length} open opportunities`} icon="chartBar" tone="info" onClick={() => openRegister()} />
      {scope === 'my' ? <SummaryCard label="Follow-ups due" value={model.followups.length} hint="14+ days since proposal" icon="send" tone={model.followups.length ? 'warning' : 'success'} onClick={() => openRegister('followups')} /> : <SummaryCard label={showMoney ? 'Weighted forecast' : 'Needs update'} value={showMoney ? money(model.weightedK) : model.stale.length} hint={showMoney ? 'Based on win probability' : 'No update in 30+ days'} icon="chartLine" onClick={() => openRegister()} />}
      <SummaryCard label={scope === 'my' ? 'My pending approvals' : 'Pending approvals'} value={model.pending.length} hint={scope === 'my' ? `${model.decisions.length} need your decision · Including your requests` : effectiveOwner === 'all' ? 'Across the company' : 'For selected owner'} icon="clock" tone={model.pending.length ? 'warning' : 'success'} onClick={() => openRegister('approvals')} />
      <SummaryCard label={scope === 'my' ? 'My blocked work' : 'Blocked opportunities'} value={model.blocked.length} hint="Review missing requirements" icon="alert" tone={model.blocked.length ? 'danger' : 'success'} onClick={() => openRegister('opportunities', 'all', 'blocked')} />
    </section>
    <Panel title="Needs attention" icon="alert" className="dw-attention-panel" action={model.queue.length > 3 && <button onClick={() => setShowAllTasks(value => !value)}>{showAllTasks ? 'Show fewer' : `View all ${model.queue.length}`}</button>}>
      <div className="dw-table-wrap"><table className="dw-table dw-attention"><thead><tr><th>Opportunity / customer</th><th>Issue</th><th>Assigned to</th><th>Due / status</th><th>Action</th></tr></thead><tbody>
        {firstTasks.map(task => <tr key={task.id}><td title={task.opp?.oppName}><b>{task.opp ? displayOpportunityId(task.opp.id) : 'Approval request'}</b>{' · '}{task.opp?.sellTo || task.opp?.oppName || 'Workspace approval'}</td><td>{task.text}</td><td data-label="Assigned to" title={task.owner?.split(', ').map(key => displayRole(key)).join(', ')}>{task.owner || 'Unassigned'}</td><td><Timing due={task.due} fallback={task.timing} /></td><td><button className={task.cta === 'Review' ? 'dw-primary primary' : ''} onClick={() => nav(task.path)}>{task.cta}</button></td></tr>)}
        {!firstTasks.length && <tr><td colSpan={5} className="dw-empty">No pending decisions, blockers or follow-ups in this view.</td></tr>}
      </tbody></table></div>
    </Panel>
    <div className="dw-analytics">
      <Panel title="Sales funnel" icon="layers" subtitle="Open opportunity count by stage">
        <div className="dw-funnel-head"><span>Stage</span><span>Count</span>{showMoney && <span>Value</span>}</div>
        <div className={`dw-funnel ${showMoney ? '' : 'dw-count-only'}`}>
          {model.funnel.map(row => <button key={row.key} type="button" className="dw-funnel-row ghost" aria-label={`${row.label}: ${row.count} opportunities${showMoney ? `, ${money(row.valueK)}` : ''}. Filter opportunity register.`} onClick={() => openRegister('opportunities', row.stages.join(','))}>
            <span>{row.label}</span><span className="dw-funnel-track"><i style={{ width: `${row.count / maxFunnel * 100}%` }} /></span><b>{row.count}</b>{showMoney && <strong>{money(row.valueK)}</strong>}
          </button>)}
        </div>
        <p className="dw-chart-note">{model.open.length} open opportunities{showMoney && ` · ${money(model.pipelineK)} total`}. Won and Lost are shown separately.</p>
      </Panel>
      <Performance model={model} showMoney={showMoney} scope={scope} period={period} />
    </div>
    {showMoney && <QuarterlyPerformance perf={model.perf} period={period} />}
    <div ref={register} tabIndex={-1} className="dw-register-anchor">
      <Panel title="Opportunity register" icon="sheet" className="dw-register-panel" action={<details ref={reportMenu} className="dw-more"><summary aria-label="Register menu" title="Register menu"><Icon name="menu" size={16} /></summary><div><button onClick={() => { setReportsOpen(true); if (reportMenu.current) reportMenu.current.open = false }}>More reports &amp; settings</button></div></details>}>
        <div className="dw-register-controls"><div className="dw-tabs" role="group" aria-label="Register view">{[
          ['opportunities', scope === 'my' ? 'My Opportunities' : 'All Opportunities'],
          [scope === 'my' ? 'followups' : 'team', scope === 'my' ? 'My Follow-ups' : 'Team Performance'],
          ['approvals', scope === 'my' ? 'My Approvals' : 'All Approvals'],
        ].map(([key, label]) => <button key={key} className="ghost" aria-pressed={tab === key} onClick={() => { setTab(key); setWorkFilter('all'); setStage('all') }}>{label}</button>)}</div>
          <div className="dw-register-filters"><label className="dw-search"><Icon name="search" size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={tab === 'team' ? 'Search owners…' : tab === 'approvals' ? 'Search approvals…' : 'Search opportunities…'} aria-label="Search current register" /></label>
            {(tab === 'opportunities' || tab === 'followups') && <select value={stage} aria-label="Opportunity stage" onChange={event => { setStage(event.target.value); if (event.target.value === 'Won' || event.target.value === 'Lost') setWorkFilter('all') }}><option value="all">All stages</option>{model.funnel.map(row => <option key={row.key} value={row.stages.join(',')}>{row.label}</option>)}<option value="Won">Won</option><option value="Lost">Lost</option></select>}
          </div>
        </div>
        {tab === 'opportunities' && workFilter !== 'all' && <div className="dw-applied-filter">{workFilter === 'blocked' ? 'Blocked work' : 'Open opportunities'} <button onClick={() => setWorkFilter('all')}>Clear filter</button></div>}
        <div className="dw-table-wrap"><table className="dw-table dw-register-table"><caption className="visually-hidden">{scopeName} {tab} register</caption>
          {tab === 'approvals' ? <><thead><tr><th>Approval</th><th>Opportunity</th><th>Type</th><th>Requested by</th><th>Awaiting</th><th>Action</th></tr></thead><tbody>{preview.map(a => <tr key={a.id}><td>{a.id}</td><td>{a.oppId ? displayOpportunityId(a.oppId) : '—'}</td><td>{a.type}</td><td>{displayRole(a.requestedBy)}</td><td>{(a.needed?.length ? a.needed : [a.approver]).filter(key => !a.decisions?.[key]).map(displayRole).join(', ') || '—'}</td><td><button onClick={() => nav('/approvals')}>Open</button></td></tr>)}</tbody></> : tab === 'team' ? <><thead><tr><th>Owner</th><th>Open opportunities</th>{showMoney && <><th>Target</th><th>Achieved</th><th>Attainment</th><th>Gap</th></>}</tr></thead><tbody>{preview.map(row => <tr key={row.owner}><td>{displayRole(row.owner)}</td><td>{row.open}</td>{showMoney && <><td>{money(row.annual)}</td><td>{money(row.achieved)}</td><td>{row.annual ? `${Math.round(row.attainPct)}%` : '—'}</td><td>{money(row.gap)}</td></>}</tr>)}</tbody></> : <><thead><tr><th>ID</th><th>Opportunity / customer</th><th>Stage</th>{showMoney && <th className="dw-num">Value (₹ L)</th>}<th>Owner</th><th>Next action</th><th>Due / status</th></tr></thead><tbody>{preview.map(renderOpportunity)}</tbody></>}
          {!preview.length && <tbody><tr><td colSpan={7} className="dw-empty">No records match this view{query || stage !== 'all' || workFilter !== 'all' ? ' and filters' : ''}.</td></tr></tbody>}
        </table></div>
        <div className="dw-pagination"><span>{records.length ? `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, records.length)} of ${records.length} ${tab === 'approvals' ? 'approvals' : tab === 'team' ? 'owners' : 'opportunities'}` : '0 records'}</span><nav aria-label="Register pagination"><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} aria-label="Previous page"><Icon name="chevronLeft" size={14} /></button>{paginationNumbers(currentPage, pages).map(value => typeof value === 'number' ? <button key={value} className={`dw-page-number ghost${currentPage === value ? ' dw-selected' : ''}`} aria-label={`Page ${value}`} aria-current={currentPage === value ? 'page' : undefined} onClick={() => setPage(value)}>{value}</button> : <span key={value}>…</span>)}<button disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} aria-label="Next page"><Icon name="chevronRight" size={14} /></button></nav></div>
      </Panel>
    </div>
    {reportsOpen && <section className="dw-reports" ref={reportPanel} tabIndex={-1} aria-label="More reports and settings"><div className="dw-reports-head"><h3>More reports &amp; settings</h3><button onClick={() => { setReportsOpen(false); reportMenu.current?.querySelector('summary')?.focus() }}>Close reports</button></div>{renderReports(model.reportStore, scope)}</section>}
  </div>
}
