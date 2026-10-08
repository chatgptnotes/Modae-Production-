import React, { useState } from 'react'
import { displayOpportunityId } from '../../seed.js'
import { ddMMyyyy } from '../../utils.js'

const money = value => `₹${((Number(value) || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 1 })} L`

export default function PhoneDashboard({ model, showMoney, nav, period, setPeriod, topPeriod, setTopPeriod, fy }) {
  const [tab, setTab] = useState('overview')
  const value = amount => showMoney ? money(amount) : amount
  const { perf, outcomes } = model
  const gap = Math.max(0, perf.annual - perf.achieved)
  return <main className="page phone-dashboard">
    <div className="phone-segments" aria-label="Dashboard sections">{['overview', 'reports'].map(item => <button key={item} aria-pressed={tab === item} onClick={() => setTab(item)}>{item === 'overview' ? 'Overview' : 'Reports'}</button>)}</div>
    {tab === 'overview' ? <>
      <section className="phone-kpis" aria-label="Dashboard summary">
        {[["Open pipeline", showMoney ? money(model.headlinePipelineK) : model.headlineOpenCount, `${model.headlineOpenCount} opportunities`], ['Follow-ups due', model.followups.length, '14+ days since proposal'], ['Pending approvals', model.pending.length, 'Awaiting a decision'], ['Blocked work', model.blocked.length, 'Needs attention']].map(([label, count, hint]) => <article key={label}><span>{label}</span><strong>{count}</strong><small>{hint}</small></article>)}
      </section>
      <section className="phone-section"><header><h2>Sales performance</h2><div className="phone-segments"><button aria-pressed={period === 'fy'} onClick={() => setPeriod('fy')}>YTD</button><button aria-pressed={period.startsWith('q')} onClick={() => setPeriod(`q${model.currentQuarter}`)}>QTD</button></div></header>
        <div className="phone-performance-values"><div><small>Actual</small><strong>{value(perf.achieved)}</strong></div><div><small>Target</small><strong>{value(perf.annual)}</strong></div></div>
        <progress aria-label="Sales target achieved" max={Math.max(1, perf.annual)} value={Math.min(perf.achieved, Math.max(1, perf.annual))} />
        <div className="phone-section-footer"><span>{perf.annual ? `${value(gap)} to target` : 'No target configured'}</span><button onClick={() => nav('/po')}>View orders ↗</button></div>
      </section>
      <section className="phone-section"><header><h2>Pipeline by stage</h2><button onClick={() => nav('/opportunities')}>View all ↗</button></header>
        {model.funnel.map(row => <button className="phone-metric-row" key={row.key} onClick={() => nav(`/opportunities?stage=${encodeURIComponent(row.stages.join(','))}`)}><span>{row.label}</span><b>{row.count}</b>{showMoney && <span>{money(row.valueK)}</span>}</button>)}
      </section>
      <section className="phone-section"><header><h2>Top opportunities</h2><select aria-label="Top opportunities period" value={topPeriod} onChange={e => setTopPeriod(e.target.value)}><option value="fy">{fy}</option>{[1, 2, 3, 4].map(q => <option key={q} value={`q${q}`}>Q{q}</option>)}</select></header>
        {model.topOpportunities.map(opp => <button className="phone-record" key={opp.id} onClick={() => nav(`/opp/${opp.id}`)}><strong>{opp.sellTo || opp.oppName || 'Untitled opportunity'}</strong><span>{displayOpportunityId(opp.id)} · {opp.stage || 'No stage'}</span><small>{opp.orderDate ? ddMMyyyy(opp.orderDate) : 'No order date'}{showMoney ? ` · ${money(opp.valueK)}` : ''}</small></button>)}
        {!model.topOpportunities.length && <p className="phone-empty">No open opportunities expected in this period.</p>}
      </section>
      <section className="phone-section"><header><h2>Next actions</h2></header>{model.queue.slice(0, 3).map(task => <button key={task.id} className="phone-record" onClick={() => nav(task.path)}><strong>{task.opp?.sellTo || task.opp?.oppName || 'Workspace approval'}</strong><span>{task.text}</span><small>{task.owner || 'Unassigned'} · {task.timing || 'Needs attention'}</small></button>)}{!model.queue.length && <p className="phone-empty">Nothing needs your attention.</p>}</section>
    </> : <>
      <section className="phone-section"><header><h2>Win / loss</h2><button onClick={() => nav('/analytics')}>Analysis ↗</button></header>
        {outcomes.summary.total ? <><div className="phone-performance-values"><div><small>Win rate</small><strong>{outcomes.summary.winRate}%</strong></div><div><small>Closed</small><strong>{outcomes.summary.total}</strong></div></div><p>{outcomes.summary.won} won · {outcomes.summary.lost} lost</p>{outcomes.byReason.filter(row => row.won || row.lost).map(row => <div className="phone-metric-row" key={row.reason}><span>{row.reason}</span><span>{row.won} won / {row.lost} lost</span></div>)}</> : <p className="phone-empty">No closed opportunities yet. Results will appear here after a win or loss.</p>}
      </section>
      <section className="phone-section"><header><h2>Pipeline probability</h2></header>{model.funnel.map(row => <div className="phone-report-row" key={row.key}><strong>{row.label}</strong>{row.segments.map(segment => <div className="phone-metric-row" key={segment.key}><span>{segment.key}</span><b>{segment.count}</b>{showMoney && <span>{money(segment.valueK)}</span>}</div>)}</div>)}</section>
    </>}
  </main>
}
