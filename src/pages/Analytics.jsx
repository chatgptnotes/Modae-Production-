import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { STAGES, CUSTOMER_STATUSES, OWNERS, OPP_TYPES, BUS, SEGMENTS, PRODUCTS, PROB_LEVELS, ROLES } from '../seed.js'
import { fmtLakh, ageDays, canViewCommercial, isAdminRole, isApprover, sameCustomer } from '../utils.js'
import { PROB_WEIGHT } from '../kpi.js'
import { Icon } from '../icons.jsx'
import { ArcGauge } from '../dashviz.jsx'

// Funnel ramp validated with the dataviz palette checker (ordinal, light
// surface): monotone lightness, ≥0.06 step gaps, light end ≥2:1 on white.
const FUNNEL_RAMP = ['#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#075985']
// Weighting lives in src/kpi.js so the dashboard and this page agree.

// ---- Filter model -------------------------------------------------------
// Which date column the range applies to — an opp has four, and "last 30 days"
// means something different on each.
const DATE_FIELDS = [
  { key: 'createDate', label: 'Create date' },
  { key: 'proposalDate', label: 'Proposal date' },
  { key: 'orderDate', label: 'Order date' },
  { key: 'invoiceDate', label: 'Invoice date' },
]
const RANGES = [
  { key: 'all', label: 'All time' },
  { key: 'd30', label: 'Last 30 days' },
  { key: 'd90', label: 'Last 90 days' },
  { key: 'q', label: 'This quarter' },
  { key: 'fy', label: 'This FY' },
  { key: 'custom', label: 'Custom range' },
]
const DEFAULTS = {
  basis: 'createDate', range: 'all', from: '', to: '',
  owner: 'All', customer: 'All', bu: 'All', oppType: 'All',
  segment: 'All', product: 'All', stage: 'All', prob: 'All', status: 'All',
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

// ISO dates compare correctly as strings. A row with no date on the chosen
// column is out of scope whenever a range is set — it hasn't reached that step.
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
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
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

// Card header: icon chip + label + optional count pill. Icons come from the
// shared registry in icons.jsx — no one-off inline SVG, no emoji.
function CardHead({ icon, tone = '', children, count }) {
  return (
    <div className="ana-title">
      <span className={`ana-ico ${tone}`}><Icon name={icon} size={15} /></span>
      {children}
      {count != null && <span className="ana-count">{count}</span>}
    </div>
  )
}

// Compact data table for the row-based cards. cols: [{key, label, align, width}]
// — fixed widths keep the numeric columns aligned and truncate long customer
// names with an ellipsis instead of wrapping to a second line.
function StatTable({ cols, rows, empty }) {
  return (
    <div className="ana-scroll">
      <table className="ana-table">
        <colgroup>{cols.map(c => <col key={c.key} style={{ width: c.width }} />)}</colgroup>
        <thead>
          <tr>{cols.map(c => (
            <th key={c.key} style={c.align === 'right' ? { textAlign: 'right' } : undefined}>{c.label}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key} className={r.className || ''}>
              {cols.map(c => (
                <td key={c.key} className={[c.align === 'right' ? 'num' : '', c.muted ? 'muted' : ''].join(' ').trim()}
                  title={r.titles?.[c.key]}>{r.cells[c.key]}</td>
              ))}
            </tr>
          ))}
          {!rows.length && <tr><td className="empty" colSpan={cols.length}>{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// Single-hue horizontal bars by category. The bar length and the trailing figure
// follow the money on those opportunities (summed Value K₹) whenever the role may
// see commercials; otherwise both fall back to the row count. Clicking a bar opens
// the supporting records.
function BarCard({ title, icon, tone, span = 4, entries, color, onPick, hint, showValue }) {
  const metric = ([, valueK, count]) => (showValue ? valueK : count)
  const max = Math.max(1, ...entries.map(metric))
  return (
    <div className={`ana-card c-${span}`}>
      <CardHead icon={icon} tone={tone}>{title}</CardHead>
      {entries.length === 0 && <div className="hint">No records.</div>}
      {entries.map(e => (
        <div key={e[0]} className={`mbar ${onPick ? 'clickable' : ''}`} role={onPick ? 'button' : undefined}
          tabIndex={onPick ? 0 : undefined} title={onPick ? 'Open the supporting records' : undefined}
          onClick={onPick ? () => onPick(e[0]) : undefined}
          onKeyDown={onPick ? ev => { if (ev.key === 'Enter') onPick(e[0]) } : undefined}>
          <span className="mb-lbl">{e[0]}</span>
          <span className="mb-track"><span className="mb-fill" style={{ width: `${Math.max(3, (metric(e) / max) * 100)}%`, background: color }} /></span>
          <span className="mb-val" style={showValue ? { flexBasis: 120 } : undefined}>
            {showValue ? <>{fmtLakh(e[1])} <span className="hint">· {e[2]}</span></> : e[2]}
          </span>
        </div>
      ))}
      {hint && <div className="hint" style={{ marginTop: 6 }}>{hint}</div>}
    </div>
  )
}

// Stage funnel. Each stage is a tapered band whose top edge is its own volume
// and whose bottom edge is the next stage's — so the silhouette *is* the
// conversion — over a dashed "ideal shape". A numbered rail sits on the left
// and the per-stage detail on the right. The metric is the summed opportunity
// value when the role may see commercials, else the plain row count.
function Funnel({ stages, showValue }) {
  // The detail column has to hold "89% of prior · ₹2.27 Cr dropped" without
  // clipping — wider than the count-only version needed.
  const W = 620, ROW = 46, GAP = 7, NUM = 46, DETAIL = 190
  const H = stages.length * ROW + (stages.length - 1) * GAP
  const plotW = W - NUM - DETAIL
  const metric = s => (showValue ? s.valueK : s.count)
  const label = s => (showValue ? fmtLakh(s.valueK) : String(s.count))
  const max = Math.max(1, ...stages.map(metric))
  const cx = NUM + plotW / 2
  const y = i => i * (ROW + GAP)
  // Width is strictly proportional to the metric — no minimum that would flatter
  // the thin end of the funnel. Narrow bands move their figure outside instead.
  const bandW = i => (metric(stages[i]) / max) * plotW
  // Below this a centred figure no longer fits inside the band. A "₹9.67 Cr"
  // string needs far more room than a two-digit count.
  const FITS = showValue ? 76 : 30
  const idealEnd = 0.28
  const idealW = i => plotW * (1 - (1 - idealEnd) * (i / (stages.length - 1)))
  const conv = i => (i > 0 && metric(stages[i - 1])
    ? Math.round((metric(stages[i]) / metric(stages[i - 1])) * 100)
    : null)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" className="funnel-svg" style={{ width: '100%' }}
      aria-label={`Stage funnel: ${stages.map(s => `${s.label} ${label(s)}`).join(', ')}`}>
      <defs>
        {stages.map((s, i) => (
          <linearGradient key={s.label} id={`fnl${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={FUNNEL_RAMP[i]} />
            <stop offset="100%" stopColor={FUNNEL_RAMP[Math.min(i + 1, FUNNEL_RAMP.length - 1)]} />
          </linearGradient>
        ))}
      </defs>

      <polygon fill="none" stroke="#cbd5e1" strokeDasharray="5 4"
        points={stages.map((_, i) => `${cx - idealW(i) / 2},${y(i) + ROW / 2}`).join(' ') + ' ' +
          stages.map((_, i) => `${cx + idealW(i) / 2},${y(i) + ROW / 2}`).reverse().join(' ')} />

      {stages.map((s, i) => {
        const wTop = bandW(i)
        // Last band tapers to a point-ish tail, echoing a real funnel spout.
        const wBot = i < stages.length - 1 ? bandW(i + 1) : wTop * 0.45
        const top = y(i) + 3, bot = y(i) + ROW - 3
        const pct = conv(i)
        return (
          <g key={s.label}>
            <text x={NUM - 12} y={y(i) + ROW / 2 + 9} textAnchor="end" fontSize="25" fontWeight="800"
              fill={FUNNEL_RAMP[i]} opacity=".7">{String(i + 1).padStart(2, '0')}</text>

            <polygon fill={`url(#fnl${i})`}
              points={`${cx - wTop / 2},${top} ${cx + wTop / 2},${top} ${cx + wBot / 2},${bot} ${cx - wBot / 2},${bot}`} />
            {wTop >= FITS
              ? <text x={cx} y={y(i) + ROW / 2 + 5} textAnchor="middle" fontSize={showValue ? 12.5 : 14} fontWeight="800"
                fill={i < 2 ? '#0f172a' : '#fff'}>{label(s)}</text>
              : <text x={cx + wTop / 2 + 7} y={y(i) + ROW / 2 + 5} fontSize={showValue ? 12.5 : 14} fontWeight="800"
                fill={FUNNEL_RAMP[i]}>{label(s)}</text>}

            <line x1={cx + wTop / 2 + (wTop >= FITS ? 6 : showValue ? 76 : 30)} y1={y(i) + ROW / 2} x2={W - DETAIL + 4} y2={y(i) + ROW / 2}
              stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
            <text x={W - DETAIL + 12} y={y(i) + ROW / 2 - 3} fontSize="12" fontWeight="700" fill="#0f172a">
              {s.label}{showValue ? ` (${s.count})` : ''}
            </text>
            <text x={W - DETAIL + 12} y={y(i) + ROW / 2 + 12} fontSize="10.5" fill="#64748b">
              {pct == null
                ? (showValue ? 'starting value' : 'starting volume')
                : `${pct}% of prior · ${showValue
                  ? fmtLakh(stages[i - 1].valueK - s.valueK)
                  : stages[i - 1].count - s.count} dropped`}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default function Analytics() {
  const store = useStore()
  const nav = useNavigate()
  const comm = canViewCommercial(store.role)

  const [f, setF] = useState(DEFAULTS)
  // Typing a custom date implies the custom preset — otherwise the input looks
  // live but the preset keeps overriding it.
  const set = (k, v) => setF(p => ({ ...p, [k]: v, ...(k === 'from' || k === 'to' ? { range: 'custom' } : {}) }))

  // Role scope: approvers and admins can look across the team; a sales owner
  // only ever sees their own book, so the owner filter is fixed to their code.
  const canPickOwner = isAdminRole(store.role) || isApprover(store.role)
  const selfOwner = OWNERS.includes(store.role) ? store.role : null
  const lockedOwner = canPickOwner ? null : selfOwner
  const ownerSel = lockedOwner || f.owner

  const allOpps = store.opportunities
  const dateRange = rangeFor(f.range, f.from, f.to)
  const customers = [...new Set(allOpps.map(o => o.sellTo))].sort((a, b) => a.localeCompare(b))
  const ownerOpts = ['All', ...OWNERS.filter(o => allOpps.some(x => x.owner === o))].map(o => ({
    value: o,
    label: o === 'All' ? 'All owners' : `${o} — ${ROLES[o]?.name || o}${o === selfOwner ? ' (you)' : ''}`,
  }))

  const opps = allOpps.filter(o =>
    (ownerSel === 'All' || o.owner === ownerSel) &&
    (f.customer === 'All' || o.sellTo === f.customer) &&
    (f.bu === 'All' || o.bu === f.bu) &&
    (f.oppType === 'All' || o.oppType === f.oppType) &&
    (f.segment === 'All' || o.segment === f.segment) &&
    (f.product === 'All' || o.product === f.product) &&
    (f.stage === 'All' || o.stage === f.stage) &&
    (f.prob === 'All' || (o.prob || 'Low') === f.prob) &&
    (f.status === 'All' || o.status === f.status) &&
    inRange(o[f.basis], dateRange))

  const open = opps.filter(o => o.status === 'Open')
  const closed = opps.filter(o => o.stage === 'Won' || o.stage === 'Lost')

  // Every card reports the money on the records rather than how many rows there
  // are; roles without commercial access fall back to the count instead.
  const sumK = rows => rows.reduce((s, o) => s + (+o.valueK || 0), 0)

  // Active chips — the locked owner is scope, not a chip the user can drop.
  const CHIP_LABELS = {
    owner: 'Owner', customer: 'Customer', bu: 'BU', oppType: 'Opp type',
    segment: 'Segment', product: 'Product', stage: 'Stage', prob: 'Probability', status: 'Status',
  }
  const chips = Object.keys(CHIP_LABELS)
    .filter(k => f[k] !== 'All' && !(k === 'owner' && lockedOwner))
    .map(k => ({ k, text: `${CHIP_LABELS[k]}: ${f[k]}` }))
  if (dateRange) {
    chips.unshift({
      k: 'range',
      text: `${DATE_FIELDS.find(d => d.key === f.basis).label}: ${dateRange[0] || '…'} → ${dateRange[1] || '…'}`,
    })
  }
  const clearChip = k => (k === 'range'
    ? setF(p => ({ ...p, range: 'all', from: '', to: '' }))
    : set(k, 'All'))

  // Opps at or beyond each stage, carrying both the row count and the money on
  // them; Lost opps register only in the total.
  const stageIdx = o => (o.stage === 'Lost' ? -1 : STAGES.indexOf(o.stage))
  const atStage = s => opps.filter(o => stageIdx(o) >= STAGES.indexOf(s))
  const funnel = [
    { label: 'All opps', count: opps.length, valueK: sumK(opps) },
    ...['RFI', 'Budgetary', 'RFQ', 'Firm Bid', 'Negotiation', 'Won'].map(s => {
      const rows = atStage(s)
      return { label: s, count: rows.length, valueK: sumK(rows) }
    }),
  ]

  // [label, valueK, count][], ordered by whichever metric is on display.
  const groupBy = (rows, key) => {
    const m = {}
    rows.forEach(r => {
      const k = r[key] || '—'
      if (!m[k]) m[k] = { valueK: 0, count: 0 }
      m[k].valueK += +r.valueK || 0
      m[k].count += 1
    })
    return Object.entries(m)
      .map(([k, v]) => [k, v.valueK, v.count])
      .sort((a, b) => (comm ? b[1] - a[1] : b[2] - a[2]))
  }

  // With filters on, the customer card follows the visible opportunities;
  // unfiltered it stays the full master list.
  const custRows = chips.length
    ? store.customers.filter(c => opps.some(o => sameCustomer(o.sellTo, c.name)))
    : store.customers

  // Opportunity value rolled up by the class of the customer it sells to. An opp
  // whose customer isn't on the master list contributes to no class.
  const classOf = name => custRows.find(c => sameCustomer(name, c.name))?.status
  const byClass = Object.fromEntries(CUSTOMER_STATUSES.map(cls => [cls, { valueK: 0, n: 0 }]))
  opps.forEach(o => {
    const b = byClass[classOf(o.sellTo)]
    if (b) { b.valueK += +o.valueK || 0; b.n += 1 }
  })

  const pipelineK = open.reduce((s, o) => s + (+o.valueK || 0), 0)
  const weightedK = open.reduce((s, o) => s + (+o.valueK || 0) * (PROB_WEIGHT[o.prob] ?? PROB_WEIGHT.Low), 0)

  const ageing = open
    .map(o => ({ ...o, age: ageDays(o.createDate) }))
    .sort((a, b) => b.age - a.age)

  const margins = open
    .filter(o => o.valueK > 0)
    .map(o => ({ ...o, gm: Math.round(((o.valueK - o.cogsK) / o.valueK) * 100) }))
    .sort((a, b) => a.gm - b.gm)

  // Bar click-throughs land on the Tracker pre-filtered via query params —
  // carrying the filters the Tracker understands so the two views agree.
  const toTracker = (key, val) => {
    const p = new URLSearchParams({ [key]: val })
    if (key !== 'owner' && ownerSel !== 'All') p.set('owner', ownerSel)
    for (const k of ['oppType', 'bu']) if (k !== key && f[k] !== 'All') p.set(k, f[k])
    nav(`/?${p}`)
  }

  // ---- Sales targets vs booked orders (Indian FY, quarters start April) ----
  const sales = store.sales || { fy: '', targets: {}, orders: [] }
  const fyQuarter = dateStr => {
    const m = parseInt((dateStr || '').split('-')[1], 10)
    if (!m) return -1
    return m >= 4 ? Math.floor((m - 4) / 3) : 3
  }
  const Q_LABELS = ['Q1 Apr-Jun', 'Q2 Jul-Sep', 'Q3 Oct-Dec', 'Q4 Jan-Mar']
  // Booked orders honour owner, customer and the date range (always on the
  // booking date — an order has no create/proposal column of its own).
  const orders = (sales.orders || []).filter(o =>
    (ownerSel === 'All' || o.owner === ownerSel) &&
    (f.customer === 'All' || sameCustomer(o.customer, f.customer)) &&
    inRange(o.booked, dateRange))
  const targetOwners = Object.keys(sales.targets || {})
    .filter(o => ownerSel === 'All' || o === ownerSel)
  const teamQ = [0, 1, 2, 3].map(i => ({
    label: Q_LABELS[i],
    target: targetOwners.reduce((s, o) => s + (sales.targets[o].q?.[i] || 0), 0),
    actual: orders.filter(o => fyQuarter(o.booked) === i)
      .reduce((s, o) => s + (+o.valueK || 0), 0),
  }))
  const attainment = Object.entries(sales.targets || {})
    .filter(([owner, t]) => (t.annual || 0) > 0 && targetOwners.includes(owner))
    .map(([owner, t]) => {
      const booked = orders.filter(o => o.owner === owner)
        .reduce((s, o) => s + (+o.valueK || 0), 0)
      return { owner, booked, annual: t.annual, pct: Math.round((booked / t.annual) * 100) }
    })
    .sort((a, b) => b.pct - a.pct)

  return (
    <div className="page ana-page">
      <h2>Analytics</h2>
      <div className="hint" style={{ marginBottom: 10 }}>Click any bar to open the supporting records.</div>

      <div className="ana-filters">
        <div className="af-row">
          <Field label="Date basis" value={f.basis} onChange={v => set('basis', v)}
            title="Which date column the range below applies to"
            options={DATE_FIELDS.map(d => ({ value: d.key, label: d.label }))} />
          <Field label="Period" value={f.range} onChange={v => set('range', v)}
            options={RANGES.map(r => ({ value: r.key, label: r.label }))} />
          <label className="ana-field">
            <span>From</span>
            <input type="date" value={f.range === 'custom' ? f.from : (dateRange?.[0] || '')}
              onChange={e => set('from', e.target.value)} />
          </label>
          <label className="ana-field">
            <span>To</span>
            <input type="date" value={f.range === 'custom' ? f.to : (dateRange?.[1] || '')}
              onChange={e => set('to', e.target.value)} />
          </label>
          {lockedOwner ? (
            <label className="ana-field">
              <span>Owner</span>
              <span className="af-locked" title="Sales owners see their own records only — approvers and admins can switch owner">
                <Icon name="lock" size={11} /> {lockedOwner} — {ROLES[lockedOwner]?.name}
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
          <Field label="Product" value={f.product} onChange={v => set('product', v)} options={['All', ...PRODUCTS]} />
          <Field label="Stage" value={f.stage} onChange={v => set('stage', v)} options={['All', ...STAGES]} />
          <Field label="Probability" value={f.prob} onChange={v => set('prob', v)} options={['All', ...PROB_LEVELS]} />
          <Field label="Status" value={f.status} onChange={v => set('status', v)} options={['All', 'Open', 'Closed']} />
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

      <div className="ana-grid">
        <div className="ana-card c-8">
          <CardHead icon="layers">Funnel &amp; conversion</CardHead>
          <Funnel stages={funnel} showValue={comm} />
          <div className="legend">
            <span><svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#cbd5e1" strokeDasharray="4 3" strokeWidth="1.5" /></svg> Ideal funnel shape</span>
            <span><span style={{ width: 12, height: 12, background: `linear-gradient(${FUNNEL_RAMP[1]}, ${FUNNEL_RAMP[4]})`, borderRadius: 3, display: 'inline-block' }} /> Actual stage {comm ? 'value' : 'volume'} (at or beyond)</span>
          </div>
        </div>

        <div className="ana-card c-4">
          <CardHead icon="wallet" tone="tone-teal">Pipeline &amp; weighted forecast</CardHead>
          {comm ? (
            <>
              <div className="ana-headline">
                <div>
                  <div className="ah-value">{fmtLakh(pipelineK)}</div>
                  <div className="ah-label">Pipeline (sum of value)</div>
                </div>
                <ArcGauge size={104} caption="weighted share"
                  pct={pipelineK ? (weightedK / pipelineK) * 100 : 0}
                  value={pipelineK ? `${Math.round((weightedK / pipelineK) * 100)}%` : '—'} />
              </div>
              <div className="ana-splits">
                <div><b>{open.length}</b><span>Open opportunities</span></div>
                <div><b>{fmtLakh(weightedK)}</b><span>Weighted forecast</span></div>
              </div>
              <div className="hint" style={{ marginTop: 10 }}>
                Weights: Low 25% · Medium 50% · High 75% of Value (K₹); unset probability counts as Low.
              </div>
            </>
          ) : <Restricted />}
        </div>

        <BarCard title="Owner" icon="users" entries={groupBy(open, 'owner')} color="#0369a1" showValue={comm}
          onPick={v => toTracker('owner', v)}
          hint={comm ? 'Open opportunity value per owner · opportunity count.' : 'Open opportunities per owner.'} />
        <BarCard title="Opp type" icon="tag" tone="tone-teal" entries={groupBy(open, 'oppType')} color="#0d9488"
          showValue={comm} onPick={v => toTracker('oppType', v)} />
        <BarCard title="BU / business area" icon="building" tone="tone-slate" entries={groupBy(open, 'bu')} color="#475569"
          showValue={comm} onPick={v => toTracker('bu', v)} />

        <div className="ana-card c-4">
          <CardHead icon="flag" tone="tone-green" count={comm ? fmtLakh(sumK(opps)) : custRows.length}>Customer classes</CardHead>
          {CUSTOMER_STATUSES.map(cls => {
            const b = byClass[cls]
            const share = comm
              ? b.valueK / Math.max(1, sumK(opps))
              : custRows.filter(c => c.status === cls).length / Math.max(1, custRows.length)
            return (
              <div key={cls} className="mbar clickable" role="button" tabIndex={0}
                onClick={() => nav('/customers')} onKeyDown={e => { if (e.key === 'Enter') nav('/customers') }}>
                <span className="mb-lbl"><span className={`pill ${cls}`}>{cls}</span></span>
                <span className="mb-track"><span className={`mb-fill class-${cls}`} style={{ width: `${Math.max(3, share * 100)}%` }} /></span>
                <span className="mb-val" style={comm ? { flexBasis: 120 } : undefined}>
                  {comm ? <>{fmtLakh(b.valueK)} <span className="hint">· {b.n}</span></> : custRows.filter(c => c.status === cls).length}
                </span>
              </div>
            )
          })}
          <div className="hint" style={{ marginTop: 6 }}>
            {comm && 'Opportunity value by the class of the customer it sells to. '}
            Blue = new customer pending admin verification.
            {chips.length > 0 && ' Scoped to the customers in the filtered opportunities.'}
          </div>
        </div>

        <div className="ana-card c-4">
          <CardHead icon="clock" tone="tone-amber" count={comm ? fmtLakh(sumK(ageing)) : ageing.length}>Quote ageing / validity</CardHead>
          <StatTable
            empty="No open opportunities."
            cols={[
              { key: 'id', label: 'Opp', width: '30%' },
              { key: 'cust', label: 'Customer', width: '34%', muted: true },
              { key: 'age', label: 'Age', width: '16%', align: 'right' },
              { key: 'status', label: 'Status', width: '20%', align: 'right' },
            ]}
            rows={ageing.map(o => ({
              key: o.id,
              className: o.age > 30 ? 'stale' : '',
              titles: { cust: o.sellTo },
              cells: {
                id: <Link className="oppid-link" to={`/proposal/${o.id}`}>{o.id}</Link>,
                cust: o.sellTo,
                age: `${o.age} d`,
                status: <span className={`pill ${o.proposalDate ? 'won' : 'Amber'}`}>{o.proposalDate ? 'Sent' : 'Draft'}</span>,
              },
            }))}
          />
          <div className="hint" style={{ marginTop: 6 }}>Amber edge = open more than 30 days.</div>
        </div>

        <div className="ana-card c-4">
          <CardHead icon="checkCircle" tone="tone-green" count={comm ? fmtLakh(sumK(closed)) : closed.length}>Win / loss reasons</CardHead>
          <StatTable
            empty="No closed opportunities yet."
            cols={[
              { key: 'id', label: 'Opp', width: '32%' },
              { key: 'result', label: 'Result', width: '24%' },
              { key: 'reason', label: 'Reason', width: '44%', align: 'right' },
            ]}
            rows={closed.map(o => ({
              key: o.id,
              titles: { reason: o.closedReason || '—' },
              cells: {
                id: <Link className="oppid-link" to={`/folders/${o.id}`}>{o.id}</Link>,
                result: <span className={`pill ${o.stage === 'Won' ? 'won' : 'lost'}`}>{o.stage}</span>,
                reason: o.closedReason || '—',
              },
            }))}
          />
        </div>

        <div className="ana-card c-12">
          <CardHead icon="chartBar">Margin view — GM% by opportunity</CardHead>
          {comm ? (
            <>
              {margins.map(o => (
                <div key={o.id} className="mbar clickable" role="button" tabIndex={0}
                  onClick={() => nav(`/proposal/${o.id}`)} onKeyDown={e => { if (e.key === 'Enter') nav(`/proposal/${o.id}`) }}>
                  <span className="mb-lbl wide"><span className="oppid-link">{o.id}</span> <span className="hint">{fmtLakh(o.valueK)}</span></span>
                  <span className="mb-track">
                    <span className="mb-fill" style={{ width: `${Math.min(100, Math.max(4, o.gm))}%`, background: o.gm >= 25 ? '#15803d' : o.gm >= 20 ? '#b45309' : '#b91c1c' }} />
                  </span>
                  <span className="mb-val">{o.gm}%</span>
                </div>
              ))}
              {!margins.length && <div className="hint">No open opportunities with a value yet.</div>}
              <div className="hint" style={{ marginTop: 6 }}>Green ≥ 25% · amber ≥ 20% · red below 20% (Net GM heuristic; the Priced BoQ holds the exact number).</div>
            </>
          ) : <Restricted />}
        </div>

        <div className="ana-card c-6">
          <CardHead icon="target" tone="tone-teal">Team target vs actual — {sales.fy}</CardHead>
          {comm ? (
            <>
              {teamQ.map(q => (
                <div key={q.label} className="mbar">
                  <span className="mb-lbl wide">{q.label}</span>
                  <span className="mb-track">
                    <span className="mb-fill" style={{ width: `${Math.min(100, Math.max(2, q.target ? (q.actual / q.target) * 100 : 0))}%`, background: '#0284c7' }} />
                  </span>
                  <span className="mb-val" style={{ flexBasis: 140 }}>{fmtLakh(q.actual)} / {fmtLakh(q.target)}</span>
                </div>
              ))}
              <div className="hint" style={{ marginTop: 6 }}>
                Booked orders vs the summed owner targets per quarter (Indian FY, April start).
              </div>
            </>
          ) : <Restricted />}
        </div>

        <div className="ana-card c-6">
          <CardHead icon="trendUp" tone="tone-green">Attainment by owner</CardHead>
          {comm ? (
            <>
              {attainment.map(a => (
                <div key={a.owner} className="mbar">
                  <span className="mb-lbl">{a.owner}</span>
                  <span className="mb-track">
                    <span className="mb-fill" style={{ width: `${Math.min(100, Math.max(2, a.pct))}%`, background: a.pct >= 50 ? '#15803d' : a.pct >= 25 ? '#b45309' : '#b91c1c' }} />
                  </span>
                  <span className="mb-val" style={{ flexBasis: 140 }}>{a.pct}% · {fmtLakh(a.booked)}</span>
                </div>
              ))}
              {!attainment.length && <div className="hint">No sales targets configured.</div>}
              <div className="hint" style={{ marginTop: 6 }}>
                Booked order value as a share of each owner's annual target, best first.
              </div>
            </>
          ) : <Restricted />}
        </div>
      </div>
    </div>
  )
}
