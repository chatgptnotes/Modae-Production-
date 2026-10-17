import { opportunityProbabilityWeight } from '../opportunityProbability.js'
import { useFieldLists } from '../useFieldLists.js'
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store.jsx'

import { fmtRupeesFromK as fmtLakh, ageDays, canViewCommercial, isAdminRole, isApprover, isSalesOwner, sameCustomer, productList, displayRoleLabel, displayRole } from '../utils.js'
import { winLossAnalysis, FUNNEL_STAGES } from '../kpi.js'
import { Icon } from '../icons.jsx'
import { Funnel } from './myDashboard/WorkspaceDashboard.jsx'
import { segmentedFunnel } from './myDashboard/model.js'
import WinLossFlow from '../WinLossFlow.jsx'
import WinLossPie from '../WinLossPie.jsx'
import { useWorkspaceView } from '../ui/WorkspaceViewContext.jsx'

// ---- Filter model -------------------------------------------------------
const RANGES = [
  { key: 'all', label: 'All time' },
  { key: 'd30', label: 'Last 30 days' },
  { key: 'd90', label: 'Last 90 days' },
  { key: 'q', label: 'This quarter' },
  { key: 'fy', label: 'This FY' },
  { key: 'custom', label: 'Custom range' },
]
const DEFAULTS = {
  range: 'all', from: '', to: '',
  owner: 'All', customer: 'All', bu: 'All', oppType: 'All',
  segment: 'All', product: 'All', stage: 'All', prob: 'All', status: 'All', lossReason: 'All',
}

const pad = n => String(n).padStart(2, '0')
const isoLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// Resolve a preset to [from, to] ISO strings; null means "no date bound".
// Quarters follow the Indian FY (April start), same as the targets card.
function rangeFor(key, from, to) {
  if (key === 'all') return null
  if (key === 'custom') return from || to ? [from || '', to || ''] : null
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth() + 1
  const fy = m >= 4 ? y : y - 1
  if (key === 'fy') return [`${fy}-04-01`, `${fy + 1}-03-31`]
  if (key === 'q') {
    const qi = m >= 4 ? Math.floor((m - 4) / 3) : 3
    const sy = qi === 3 ? fy + 1 : fy
    const sm = qi === 3 ? 1 : 4 + qi * 3
    const em = sm + 2
    return [`${sy}-${pad(sm)}-01`, `${sy}-${pad(em)}-${new Date(sy, em, 0).getDate()}`]
  }
  const start = new Date(now)
  start.setDate(start.getDate() - (key === 'd30' ? 30 : 90) + 1)
  return [isoLocal(start), isoLocal(now)]
}

// ISO dates compare correctly as strings. A row with no create date is out of
// scope whenever a range is set.
const inRange = (v, r) => {
  if (!r) return true
  if (!v) return false
  return (!r[0] || v >= r[0]) && (!r[1] || v <= r[1])
}

// One labelled select in the filter bar.
function Field({ label, value, onChange, options, disabled, title }) {
  return (
    <label className="ana-field" title={title}>
      <span>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled} name="analytics-value">
        {options.map(o => (typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </label>
  )
}

function Restricted() {
  return <div className="restricted">Restricted — commercial data (approvers/admin only)</div>
}

export default function Analytics({ embedded = false }) {
  const { OWNERS, BUS, OPP_TYPES, SEGMENTS, PRODUCTS, PROB_LEVELS, labelFor } = useFieldLists()

  const store = useStore()
  const { scope } = useWorkspaceView()
  // Sales owners may see commercial analytics for their locked own-owner scope;
  // team-wide commercial reporting remains limited to approvers/admins.
  const comm = canViewCommercial(store.role) || isSalesOwner(store.role)

  const [f, setF] = useState(DEFAULTS)
  // Typing a custom date implies the custom preset — otherwise the input looks
  // live but the preset keeps overriding it.
  const set = (k, v) => setF(p => ({ ...p, [k]: v, ...(k === 'from' || k === 'to' ? { range: 'custom' } : {}) }))

  // Role scope: approvers and admins can look across the team; a sales owner
  // only ever sees their own book, so the owner filter is fixed to their code.
  const canPickOwner = isAdminRole(store.role) || isApprover(store.role)
  const selfOwner = OWNERS.includes(store.role) ? store.role : null
  const lockedOwner = scope === 'my' ? store.role : (canPickOwner ? null : selfOwner)
  const ownerSel = lockedOwner || f.owner

  const allOpps = scope === 'my'
    ? store.opportunities.filter(opportunity => opportunity.owner === store.role)
    : store.opportunities
  const dateRange = rangeFor(f.range, f.from, f.to)
  const customers = [...new Set(allOpps.map(o => o.sellTo))].sort((a, b) => a.localeCompare(b))
  const ownerOpts = ['All', ...OWNERS.filter(o => allOpps.some(x => x.owner === o))].map(o => ({
    value: o,
    label: o === 'All' ? 'All owners' : `${displayRoleLabel(o)}${o === selfOwner ? ' (you)' : ''}`,
  }))

  const stageMatches = (value, row) => value === 'All' || value.split(',').includes(row.stage)
  const filteredOpps = allOpps.filter(o =>
    (ownerSel === 'All' || o.owner === ownerSel) &&
    (f.customer === 'All' || o.sellTo === f.customer) &&
    (f.bu === 'All' || o.bu === f.bu) &&
    (f.oppType === 'All' || o.oppType === f.oppType) &&
    (f.segment === 'All' || o.segment === f.segment) &&
    (f.product === 'All' || productList(o.product).includes(f.product)) &&
    stageMatches(f.stage, o) &&
    (f.prob === 'All' || (o.prob || 'Low') === f.prob) &&
    (f.status === 'All' || o.status === f.status) &&
    inRange(o.createDate, dateRange))

  const open = filteredOpps.filter(o => o.status === 'Open')
  const lossReasons = [...new Set(filteredOpps.filter(o => o.stage === 'Lost').map(o => String(o.closedReason || '').trim() || 'Unspecified'))].sort()
  const opps = f.lossReason === 'All' ? filteredOpps : filteredOpps.filter(o => o.stage !== 'Lost' || (String(o.closedReason || '').trim() || 'Unspecified') === f.lossReason)
  const winLoss = winLossAnalysis(opps, store.competitors, { commercial: comm })

  // Every card reports the money on the records rather than how many rows there
  // are; roles without commercial access fall back to the count instead.
  const sumK = rows => rows.reduce((s, o) => s + (+o.valueK || 0), 0)

  // Active chips — the locked owner is scope, not a chip the user can drop.
  const CHIP_LABELS = {
    owner: 'Owner', customer: 'Customer', bu: 'BU', oppType: 'Opp type',
    segment: 'Segment', product: 'Equipment / Product Family', stage: 'Stage', prob: 'Probability', status: 'Status', lossReason: 'Loss reason',
  }
  const chips = Object.keys(CHIP_LABELS)
    .filter(k => f[k] !== 'All' && !(k === 'owner' && lockedOwner))
    .map(k => ({ k, text: `${CHIP_LABELS[k]}: ${f[k]}` }))
  if (dateRange) {
    chips.unshift({
      k: 'range',
      text: `Date range: ${dateRange[0] || '…'} → ${dateRange[1] || '…'}`,
    })
  }
  const clearChip = k => (k === 'range'
    ? setF(p => ({ ...p, range: 'all', from: '', to: '' }))
    : set(k, 'All'))

  const weightedK = open.reduce((s, o) => s + (+o.valueK || 0) * opportunityProbabilityWeight(store.config, o), 0)

  const ageing = open
    .map(o => ({ ...o, age: ageDays(o.createDate) }))
    .sort((a, b) => b.age - a.age)

  return (
    <div className={`page ana-page${embedded ? ' embedded-analytics' : ''}`}>
      <div className="analytics-page-heading"><h2>{embedded ? 'Detailed analytics' : 'Analytics'}</h2>
        {!embedded && <Link className="btn" to="/my-dashboard"><Icon name="chevronLeft" size={16} /> Back to dashboard</Link>}
      </div>
      <div className="hint" style={{ marginBottom: 10 }}>Click any bar to open the supporting records.</div>

      <div className="ana-filters">
        <div className="af-row">
          <Field label="Period" value={f.range} onChange={v => set('range', v)}
            options={RANGES.map(r => ({ value: r.key, label: r.label }))} />
          <label className="ana-field">
            <span>From</span>
            <input type="date" value={f.range === 'custom' ? f.from : (dateRange?.[0] || '')}
              onChange={e => set('from', e.target.value)} name="analytics-date" />
          </label>
          <label className="ana-field">
            <span>To</span>
            <input type="date" value={f.range === 'custom' ? f.to : (dateRange?.[1] || '')}
              onChange={e => set('to', e.target.value)} name="analytics-date-2" />
          </label>
          {lockedOwner ? (
            <label className="ana-field">
              <span>Owner</span>
              <span className="af-locked" title="Sales owners see their own records only — approvers and admins can switch owner">
                <Icon name="lock" size={11} /> {lockedOwner} — {displayRole(lockedOwner)}
              </span>
            </label>
          ) : (
            <Field label="Owner / user" value={f.owner} onChange={v => set('owner', v)} options={ownerOpts} />
          )}
          <Field label="Customer" value={f.customer} onChange={v => set('customer', v)}
            options={['All', ...customers].map(c => ({ value: c, label: c === 'All' ? 'All customers' : c }))} />
        </div>
        <div className="af-row">
          <Field label="BU" value={f.bu} onChange={v => set('bu', v)} options={['All', ...BUS]} />
          <Field label="Opp type" value={f.oppType} onChange={v => set('oppType', v)} options={['All', ...OPP_TYPES]} />
          <Field label="Segment" value={f.segment} onChange={v => set('segment', v)} options={['All', ...SEGMENTS]} />
          <Field label="Equipment / Product Family" value={f.product} onChange={v => set('product', v)} options={['All', ...PRODUCTS.map(p => p === 'Various' ? { value: 'Various', label: 'Multiple equipment items' } : p)]} />
          <Field label="Stage" value={f.stage} onChange={v => set('stage', v)} options={[{ value: 'All', label: 'All stages' }, ...FUNNEL_STAGES.map(group => ({ value: group.stages.join(','), label: group.label }))]} />
          <Field label="Probability" value={f.prob} onChange={v => set('prob', v)} options={['All', ...PROB_LEVELS]} />
          <Field label="Status" value={f.status} onChange={v => set('status', v)} options={['All', 'Open', 'Closed']} />
          <Field label="Loss reason" value={f.lossReason} onChange={v => set('lossReason', v)} options={['All', ...lossReasons]} disabled={!lossReasons.length} />
        </div>
        <div className="af-foot">
          <span className="af-count">
            <b>{opps.length}</b> of {allOpps.length} opportunities
            {comm && <> · <b>{fmtLakh(sumK(opps))}</b> of {fmtLakh(sumK(allOpps))}</>}
          </span>
          {chips.map(c => (
            <button key={c.k} className="af-chip" onClick={() => clearChip(c.k)} title="Remove this filter">
              {c.text} <Icon name="x" size={10} />
            </button>
          ))}
          {!chips.length && <span className="hint">No filters applied — showing every record{lockedOwner ? ' you own' : ''}.</span>}
          <span className="spacer" />
          <button className="af-reset" onClick={() => setF(DEFAULTS)} disabled={!chips.length}>Reset filters</button>
        </div>
      </div>

      <div className="dw-reference-dashboard analytics-funnel" data-dashboard-depth="glass">
        <Funnel title="Opportunity funnel" model={{ funnel: segmentedFunnel(opps, store.config) }} showMoney={comm} scope={scope}
          onStageClick={stage => set('stage', stage.stages.join(','))} />
      </div>

      <section className="analysis-summary" aria-label="Win and loss summary">
        <div><b>{winLoss.summary.total}</b><span>Closed opportunities</span></div>
        <div className="analysis-summary-won"><b>{winLoss.summary.won}</b><span>Won</span></div>
        <div className="analysis-summary-lost"><b>{winLoss.summary.lost}</b><span>Lost</span></div>
        <div><b>{winLoss.summary.winRate}%</b><span>Win rate</span></div>
        {comm && <><div><b>{fmtLakh(winLoss.summary.wonValueK)}</b><span>Won value</span></div><div><b>{fmtLakh(winLoss.summary.lostValueK)}</b><span>Lost value</span></div></>}
      </section>

      <section className="analysis-hero" aria-label="Win and loss outcome mix">
        <WinLossFlow openCount={open.length} closedCount={winLoss.summary.total} wonCount={winLoss.summary.won} lostCount={winLoss.summary.lost}
          commercial={comm} wonValueK={winLoss.summary.wonValueK} lostValueK={winLoss.summary.lostValueK} />
        <div className="analysis-value-compare">
          <div className="analysis-hero-head"><div><span className="analysis-kicker">Outcome mix</span><h3>How much we win</h3></div><strong>{winLoss.summary.winRate}%</strong></div>
          <p>{comm ? 'Won versus lost commercial value across the selected scope.' : 'Won versus lost opportunities across the selected scope.'}</p>
          <WinLossPie wonCount={winLoss.summary.won} lostCount={winLoss.summary.lost}
            wonValueK={winLoss.summary.wonValueK} lostValueK={winLoss.summary.lostValueK}
            commercial={comm} />
        </div>
        <div className="analysis-insight-grid">
          <article className="analysis-insight good"><span className="analysis-kicker">Top win driver</span><b>{winLoss.insights.topWinReason || 'No win reason yet'}</b><span>{comm ? fmtLakh(winLoss.insights.topWinReasonValueK) : '—'} won value</span></article>
          <article className="analysis-insight bad"><span className="analysis-kicker">Largest loss exposure</span><b>{winLoss.insights.topLossReason || 'No loss reason yet'}</b><span>{comm ? fmtLakh(winLoss.insights.topLossReasonValueK) : '—'} lost value</span></article>
        </div>
      </section>

      <section className="analysis-section">
        <div className="analysis-section-head">
          <div><span className="analysis-kicker">Decision analysis</span><h3>Win / loss by reason</h3><p>Use the comparison to identify which close reasons are costing value and where the team is winning.</p></div>
          <span className="analysis-section-count">{winLoss.byReason.length} reasons</span>
        </div>
        <div className="analysis-table-wrap">
          <table className="analysis-table analysis-reason-table">
            <thead><tr><th>Reason</th><th className="num">Won</th><th className="num">Lost</th><th className="num">Win rate</th>{comm && <><th className="num">Won value</th><th className="num">Lost value</th><th className="num">Total value</th></>}</tr></thead>
            <tbody>
              {winLoss.byReason.map(row => <tr key={row.reason}>
                <th scope="row">{row.reason}</th><td className="num result-won">{row.won}</td><td className="num result-lost">{row.lost}</td><td className="num"><b>{row.winRate}%</b></td>
                {comm && <><td className="num">{fmtLakh(row.wonValueK)}</td><td className="num">{fmtLakh(row.lostValueK)}</td><td className="num"><b>{fmtLakh(row.totalValueK)}</b></td></>}
              </tr>)}
              {!winLoss.byReason.length && <tr><td colSpan={comm ? 7 : 4} className="empty">No closed opportunities match the current filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="analysis-section">
        <div className="analysis-section-head"><div><span className="analysis-kicker">Supporting register</span><h3>Closed opportunities</h3><p>Every row behind the reason summary, with direct links back to the opportunity folder.</p></div><span className="analysis-section-count">{winLoss.rows.length} rows</span></div>
        <div className="analysis-table-wrap">
          <table className="analysis-table closed-opportunity-register">
            <thead><tr><th>Opportunity</th><th>Customer</th><th>Result</th><th>Reason</th>{comm && <th className="num">Value</th>}<th>Owner</th><th>Close date</th><th>Competitor</th></tr></thead>
            <tbody>
              {winLoss.rows.map(row => <tr key={row.id}>
                <td><Link className="oppid-link" to={`/folders/${row.id}`}>{row.id}</Link><small>{row.oppName || '—'}</small></td><td>{row.sellTo || '—'}</td><td><span className={`pill ${row.result === 'Won' ? 'won' : 'lost'}`}>{row.result}</span></td><td>{row.reason}{row.closedReasonNote && <small>{row.closedReasonNote}</small>}</td>{comm && <td className="num">{fmtLakh(row.valueK)}</td>}<td>{displayRole(row.owner) || '—'}</td><td>{row.closeDate || '—'}</td><td>{row.competitor || '—'}</td>
              </tr>)}
              {!winLoss.rows.length && <tr><td colSpan={comm ? 8 : 7} className="empty">No closed opportunities match the current filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="analysis-section">
        <div className="analysis-section-head"><div><span className="analysis-kicker">Live pipeline</span><h3>Open opportunity register</h3><p>Prioritize the active records that can change the next win/loss result.</p></div><span className="analysis-section-count">{open.length} open · {comm ? fmtLakh(weightedK) : 'count'} weighted</span></div>
        <div className="analysis-table-wrap">
          <table className="analysis-table open-pipeline-register">
            <thead><tr><th>Opportunity</th><th>Customer</th><th>Stage</th><th>Owner</th><th>Probability</th>{comm && <><th className="num">Value</th><th className="num">Weighted</th></>}<th>Age</th></tr></thead>
            <tbody>
              {ageing.map(row => <tr key={row.id} className={row.age > 30 ? 'stale' : ''}>
                <td><Link className="oppid-link" to={`/proposal/${row.id}`}>{row.id}</Link><small>{row.oppName || '—'}</small></td><td>{row.sellTo || '—'}</td><td>{row.stage || '—'}</td><td>{displayRole(row.owner) || '—'}</td><td>{row.prob || 'Low'}</td>{comm && <><td className="num">{fmtLakh(row.valueK)}</td><td className="num">{fmtLakh((Number(row.valueK) || 0) * opportunityProbabilityWeight(store.config, row))}</td></>}<td>{row.age} d</td>
              </tr>)}
              {!ageing.length && <tr><td colSpan={comm ? 8 : 6} className="empty">No open opportunities match the current filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
