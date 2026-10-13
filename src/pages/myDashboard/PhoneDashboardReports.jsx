import NormalFunnel, { FunnelViewSwitch, useFunnelView } from './FunnelView.jsx'
import QuarterPeriodControl from './QuarterPeriodControl.jsx'
import React from 'react'
import { Icon } from '../../icons.jsx'
import WinLossReport from './WinLossReport.jsx'
import { drillClick, useDashboardDrilldown } from './drillInteraction.js'
import { WonValueNotice } from '../../BookingReview.jsx'

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
  const open = useDashboardDrilldown()
  const { perf, wonPerformance: won } = model
  const hasTarget = period !== 'all' && perf.targetConfigured && !perf.targetNeedsConfirmation
  const maximum = Math.max(1, won.valueK, hasTarget ? perf.annual : 0)
  const gap = Math.max(0, perf.annual - won.valueK)
  const bars = [['Won value', won.valueK, 'actual'],
    ...(hasTarget ? [[period.startsWith('q') ? 'Full-quarter target' : 'Full-year target', perf.annual, 'target']] : [])]
  return <DashboardSection title="Performance" subtitle={`Won value · ${period === 'all' ? 'All history' : fy}`} icon="chartBar">
    <div className="mobile-report-tabs" aria-label="Performance period"><button type="button" aria-pressed={period === 'all'} onClick={() => setPeriod('all')}>All history</button><button type="button" aria-pressed={period === 'fy'} onClick={() => setPeriod('fy')}>YTD</button><QuarterPeriodControl period={period} setPeriod={setPeriod} currentQuarter={model.currentQuarter} fy={fy} /></div>
    {showMoney ? <>
      <WonValueNotice won={won} perf={perf} period={period} />
      <div className="mobile-performance-bars">{bars.map(([label, value, kind]) => <div className="mobile-performance-row" key={kind} {...drillClick(open && (() => open({ kind })), `View ${label} details`)}><div><span>{label}</span><strong>{phoneMoney(value)}</strong></div><div className="mobile-performance-track" aria-label={`${label}: ${phoneMoney(value)}`}><i data-kind={kind} style={{ width: `${Math.max(0, value) / maximum * 100}%` }} /></div></div>)}</div>
      {won.estimatedCount === 0 && hasTarget && perf.annual > 0 && <div className="mobile-performance-gap" {...drillClick(open && (() => open({ kind: 'gap' })), 'View remaining-to-target calculation')}><span>Remaining to target</span><strong>{phoneMoney(gap)}<small> · {Math.round(gap / perf.annual * 100)}%</small></strong></div>}
      {open && !hasTarget && <p {...drillClick(() => open({ kind: 'target' }), 'View target details')}>Target · {period === 'all' ? 'Choose YTD or QTD' : perf.targetNeedsConfirmation ? 'Needs confirmation' : 'Not configured'}</p>}
      {open && !(won.estimatedCount === 0 && hasTarget && perf.annual > 0) && <p {...drillClick(() => open({ kind: 'gap' }), 'Why the gap is unavailable')}>Gap · Unavailable</p>}
    </> : <p className="mobile-report-empty">Sales values and targets are restricted for your role.</p>}
    {canOpen('po') && <button type="button" className="mobile-report-link" onClick={() => nav('/order')}>View Orders<Icon name="chevronRight" size={16} /></button>}
  </DashboardSection>
}

function Funnel({ model, showMoney }) {
  const open = useDashboardDrilldown()
  const [view, setView] = useFunnelView()
  return <DashboardSection title="Sales Pipeline Funnel" subtitle="Current stage · All history" icon="filter">
    <FunnelViewSwitch view={view} onChange={setView} />
    <p className="mobile-report-empty">{view === 'normal' ? 'Widths show stage order, not counts · Splits show probability · Grey = empty' : 'Widths adjusted for readability · Splits show probability · Grey = empty'}</p>
    <div className="mobile-funnel-legend">{['high', 'medium', 'low'].map(key => <span key={key}><i data-probability={key} />{key[0].toUpperCase() + key.slice(1)}</span>)}</div>
    <NormalFunnel view={view} rows={model.funnel} showMoney={showMoney} formatMoney={phoneMoney} onStageClick={open && (row => open({ kind: 'funnel', stageKey: row.key }))} onSegmentClick={open && ((row, probability) => open({ kind: 'funnel', stageKey: row.key, probability }))} />
    <div className="mobile-funnel-total" {...drillClick(open && (() => open({ kind: 'pipeline' })), 'View open pipeline')}><span>Open Pipeline <small>(excl. Won)</small></span><strong>{model.headlineOpenCount} opportunities{showMoney && <span>{phoneMoney(model.headlinePipelineK)}</span>}</strong></div>
  </DashboardSection>
}

function WinLoss({ model, nav, canOpen, showMoney }) {
  return <DashboardSection title="Win/Loss Analysis" subtitle="Closed opportunities · All history" icon="target">
    <WinLossReport outcomes={model.outcomes} showMoney={showMoney} />
    {canOpen('analytics') && <button type="button" className="mobile-card-action mobile-analysis-action" onClick={() => nav('/analytics')}>Open detailed analysis<Icon name="arrowRight" size={16} /></button>}
  </DashboardSection>
}

export function PhoneReports(props) {
  return <><Performance {...props} /><Funnel {...props} /><WinLoss {...props} /></>
}
