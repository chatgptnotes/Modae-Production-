import React from 'react'
import { Icon } from '../../icons.jsx'

export const phoneMoney = value => `₹${((Number(value) || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`

// Native disclosures provide keyboard toggling and announce expansion state.
// React only supplies the initial open value; user toggles survive rerenders.
export function DashboardSection({ title, subtitle, icon, defaultOpen = false, children }) {
  return <details className="mobile-dashboard-section" open={defaultOpen}>
    <summary><span className="mobile-section-icon"><Icon name={icon} size={22} /></span><span className="mobile-section-heading"><h2>{title}</h2><small>{subtitle}</small></span><Icon name="chevronDown" size={20} /></summary>
    <div className="mobile-section-content">{children}</div>
  </details>
}

function Performance({ model, showMoney, nav, period, setPeriod, fy, canOpen }) {
  const { perf } = model
  const maximum = Math.max(1, perf.achieved, perf.annual)
  const gap = Math.max(0, perf.annual - perf.achieved)
  return <DashboardSection title="Performance" subtitle={`Actual vs target · ${fy}`} icon="chartBar">
    <div className="mobile-report-tabs" aria-label="Performance period"><button type="button" aria-pressed={period === 'fy'} onClick={() => setPeriod('fy')}>YTD</button><button type="button" aria-pressed={period.startsWith('q')} onClick={() => setPeriod(`q${model.currentQuarter}`)}>QTD</button></div>
    {showMoney ? <>
      <div className="mobile-performance-bars">{[['Actual', perf.achieved, 'actual'], ['Target', perf.annual, 'target']].map(([label, value, kind]) => <div className="mobile-performance-row" key={kind}><div><span>{label}</span><strong>{phoneMoney(value)}</strong></div><div className="mobile-performance-track" aria-label={`${label}: ${phoneMoney(value)}`}><i data-kind={kind} style={{ width: `${Math.max(0, value) / maximum * 100}%` }} /></div></div>)}</div>
      <div className="mobile-performance-gap"><span>Gap to target</span><strong>{phoneMoney(gap)}{perf.annual > 0 && <small> · {Math.round(gap / perf.annual * 100)}%</small>}</strong></div>
      {!perf.annual && <p className="mobile-report-empty">No sales target configured for this period.</p>}
    </> : <p className="mobile-report-empty">Sales values and targets are restricted for your role.</p>}
    {canOpen('po') && <button type="button" className="mobile-report-link" onClick={() => nav('/order')}>View Orders<Icon name="chevronRight" size={16} /></button>}
  </DashboardSection>
}

function Funnel({ model, showMoney, fy }) {
  const useValue = showMoney && model.funnel.every(row => row.segments.every(segment => !segment.count || segment.valueK > 0))
  const metric = row => useValue ? row.valueK : row.count
  const maximum = Math.max(1, ...model.funnel.map(metric))
  return <DashboardSection title="Sales Pipeline Funnel" subtitle={`Stages and probability · ${fy}`} icon="filter">
    <div className="mobile-funnel-legend">{['high', 'medium', 'low'].map(key => <span key={key}><i data-probability={key} />{key[0].toUpperCase() + key.slice(1)}</span>)}</div>
    <div className="mobile-funnel-rows">{model.funnel.map(row => <div className="mobile-funnel-row" key={row.key}>
      <div className="mobile-funnel-label"><strong>{row.label}</strong><span>{row.count}{showMoney && ` · ${phoneMoney(row.valueK)}`}</span></div>
      <div className="mobile-funnel-track"><div className={`mobile-funnel-shape${row.count ? '' : ' is-empty'}`} style={{ width: `${row.count ? metric(row) / maximum * 100 : 18}%` }} aria-label={`${row.label}: ${row.count} opportunities${showMoney ? `, ${phoneMoney(row.valueK)}` : ''}`}>
        {row.segments.filter(segment => segment.count > 0).map(segment => <span key={segment.key} data-probability={segment.key} style={{ flex: useValue ? segment.valueK : segment.count }} title={`${segment.count} ${segment.key} probability opportunities${showMoney ? ` · ${phoneMoney(segment.valueK)}` : ''}`} />)}
      </div></div>
    </div>)}</div>
    <div className="mobile-funnel-total"><span>Open Pipeline <small>(excl. Won)</small></span><strong>{model.headlineOpenCount} opportunities{showMoney && <span>{phoneMoney(model.headlinePipelineK)}</span>}</strong></div>
  </DashboardSection>
}

function ReasonBars({ rows, maximum }) {
  return <div className="mobile-reason-list">{rows.map(row => <div className="mobile-reason-row" key={row.reason}><span>{row.reason}</span><div><i data-result="won" style={{ width: `${row.won / maximum * 100}%` }} /><i data-result="lost" style={{ width: `${row.lost / maximum * 100}%` }} /></div><strong>{row.won} / {row.lost}</strong></div>)}</div>
}

function WinLoss({ model, nav, fy, canOpen }) {
  const { summary, byReason } = model.outcomes
  const reasons = byReason.filter(row => row.won || row.lost)
  const maximum = Math.max(1, ...reasons.map(row => row.won + row.lost))
  const losses = reasons.filter(row => row.lost).sort((a, b) => b.lost - a.lost)
  return <DashboardSection title="Win/Loss Analysis" subtitle={`Closed opportunities · ${fy}`} icon="target">
    <div className="mobile-winloss-summary"><div className={`mobile-winrate${summary.total ? '' : ' is-empty'}`} style={{ '--win-share': `${summary.total ? summary.won / summary.total * 100 : 0}%` }} role="img" aria-label={summary.total ? `Win rate ${summary.winRate}%` : 'No closed opportunities yet'}><div><strong>{summary.total ? `${summary.winRate}%` : '—'}</strong><span>Win Rate</span></div></div><dl><div><dt>Won</dt><dd>{summary.won}</dd></div><div><dt>Lost</dt><dd>{summary.lost}</dd></div><div><dt>Total Closed</dt><dd>{summary.total}</dd></div></dl></div>
    {summary.total ? <><h3 className="mobile-report-heading">Won vs Lost by Reason</h3><ReasonBars rows={reasons} maximum={maximum} /><h3 className="mobile-report-heading">Top Loss Reasons (by count)</h3>{losses.map((row, index) => <div className="mobile-loss-reason" key={row.reason}><span>{index + 1}. {row.reason}</span><strong>{row.lost}</strong></div>)}{!losses.length && <p className="mobile-report-empty">No lost opportunities yet.</p>}</> : <p className="mobile-report-empty">No closed opportunities yet.</p>}
    {canOpen('analytics') && <button type="button" className="mobile-card-action mobile-analysis-action" onClick={() => nav('/analytics')}>Open detailed analysis<Icon name="arrowRight" size={16} /></button>}
  </DashboardSection>
}

export function PhoneReports(props) {
  return <><Performance {...props} /><Funnel {...props} /><WinLoss {...props} /></>
}
