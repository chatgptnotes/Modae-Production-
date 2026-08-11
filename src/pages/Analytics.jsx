import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { STAGES, CUSTOMER_STATUSES } from '../seed.js'
import { fmt, fmtLakh, ageDays, canViewCommercial } from '../utils.js'
import { PROB_WEIGHT } from '../kpi.js'

// Funnel ramp validated with the dataviz palette checker (ordinal, light
// surface): monotone lightness, ≥0.06 step gaps, light end ≥2:1 on white.
const FUNNEL_RAMP = ['#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#075985']
// Weighting lives in src/kpi.js so the dashboard and this page agree.

function Restricted() {
  return <div className="restricted">Restricted — commercial data (approvers/admin only)</div>
}

// Single-hue horizontal bars (counts by category); clicking a bar opens the
// supporting records.
function BarCard({ title, span = 4, entries, color, onPick, hint }) {
  const max = Math.max(1, ...entries.map(([, v]) => v))
  return (
    <div className={`ana-card c-${span}`}>
      <div className="ana-title">{title}</div>
      {entries.length === 0 && <div className="hint">No records.</div>}
      {entries.map(([label, v]) => (
        <div key={label} className={`mbar ${onPick ? 'clickable' : ''}`} role={onPick ? 'button' : undefined}
          tabIndex={onPick ? 0 : undefined} title={onPick ? 'Open the supporting records' : undefined}
          onClick={onPick ? () => onPick(label) : undefined}
          onKeyDown={onPick ? e => { if (e.key === 'Enter') onPick(label) } : undefined}>
          <span className="mb-lbl">{label}</span>
          <span className="mb-track"><span className="mb-fill" style={{ width: `${Math.max(3, (v / max) * 100)}%`, background: color }} /></span>
          <span className="mb-val">{v}</span>
        </div>
      ))}
      {hint && <div className="hint" style={{ marginTop: 6 }}>{hint}</div>}
    </div>
  )
}

// Stage funnel: centered SVG bars over a dashed "ideal shape" taper.
function Funnel({ stages }) {
  const W = 460, ROW = 46, GAP = 8, LBL = 118
  const H = stages.length * ROW + (stages.length - 1) * GAP
  const plotW = W - LBL
  const max = Math.max(1, ...stages.map(s => s.count))
  const idealEnd = 0.28
  const y = i => i * (ROW + GAP)
  const idealW = i => plotW * (1 - (1 - idealEnd) * (i / (stages.length - 1)))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" style={{ width: '100%', maxWidth: 560 }}
      aria-label={`Stage funnel: ${stages.map(s => `${s.label} ${s.count}`).join(', ')}`}>
      <polygon fill="none" stroke="#cbd5e1" strokeDasharray="5 4"
        points={stages.map((_, i) => `${LBL + (plotW - idealW(i)) / 2},${y(i) + ROW / 2}`).join(' ') + ' ' +
          stages.map((_, i) => `${LBL + (plotW + idealW(i)) / 2},${y(i) + ROW / 2}`).reverse().join(' ')} />
      {stages.map((s, i) => {
        const w = Math.max(plotW * 0.05, (s.count / max) * plotW)
        return (
          <g key={s.label}>
            <text x={LBL - 10} y={y(i) + ROW / 2 - 2} textAnchor="end" fontSize="12" fontWeight="600" fill="#0f172a">{s.label}</text>
            {i > 0 && (
              <text x={LBL - 10} y={y(i) + ROW / 2 + 12} textAnchor="end" fontSize="10.5" fill="#888">
                {stages[i - 1].count ? Math.round((s.count / stages[i - 1].count) * 100) : 0}% of prior
              </text>
            )}
            <rect x={LBL + (plotW - w) / 2} y={y(i) + 6} width={w} height={ROW - 12} rx="4" fill={FUNNEL_RAMP[i]} />
            <text x={LBL + plotW / 2} y={y(i) + ROW / 2 + 4} textAnchor="middle" fontSize="13" fontWeight="700"
              fill={i < 2 ? '#0f172a' : '#fff'}>{s.count}</text>
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

  const opps = store.opportunities
  const open = opps.filter(o => o.status === 'Open')
  const closed = opps.filter(o => o.stage === 'Won' || o.stage === 'Lost')

  // Count of opps at or beyond each stage; Lost opps count only in the total.
  const stageIdx = o => (o.stage === 'Lost' ? -1 : STAGES.indexOf(o.stage))
  const funnel = [
    { label: 'All opps', count: opps.length },
    ...['RFI', 'Budgetary', 'RFQ', 'Firm Bid', 'Won'].map(s => ({
      label: s, count: opps.filter(o => stageIdx(o) >= STAGES.indexOf(s)).length,
    })),
  ]

  const countBy = (rows, key) => {
    const m = {}
    rows.forEach(r => { const k = r[key] || '—'; m[k] = (m[k] || 0) + 1 })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }

  const pipelineK = open.reduce((s, o) => s + (+o.valueK || 0), 0)
  const weightedK = open.reduce((s, o) => s + (+o.valueK || 0) * (PROB_WEIGHT[o.prob] ?? PROB_WEIGHT.Low), 0)

  const ageing = open
    .map(o => ({ ...o, age: ageDays(o.createDate) }))
    .sort((a, b) => b.age - a.age)

  const margins = open
    .filter(o => o.valueK > 0)
    .map(o => ({ ...o, gm: Math.round(((o.valueK - o.cogsK) / o.valueK) * 100) }))
    .sort((a, b) => a.gm - b.gm)

  // Bar click-throughs land on the Tracker pre-filtered via query params.
  const toTracker = (key, val) => nav(`/?${key}=${encodeURIComponent(val)}`)

  // ---- Sales targets vs booked orders (Indian FY, quarters start April) ----
  const sales = store.sales || { fy: '', targets: {}, orders: [] }
  const fyQuarter = dateStr => {
    const m = parseInt((dateStr || '').split('-')[1], 10)
    if (!m) return -1
    return m >= 4 ? Math.floor((m - 4) / 3) : 3
  }
  const Q_LABELS = ['Q1 Apr-Jun', 'Q2 Jul-Sep', 'Q3 Oct-Dec', 'Q4 Jan-Mar']
  const teamQ = [0, 1, 2, 3].map(i => ({
    label: Q_LABELS[i],
    target: Object.values(sales.targets || {}).reduce((s, t) => s + (t.q?.[i] || 0), 0),
    actual: (sales.orders || []).filter(o => fyQuarter(o.booked) === i)
      .reduce((s, o) => s + (+o.valueK || 0), 0),
  }))
  const attainment = Object.entries(sales.targets || {})
    .filter(([, t]) => (t.annual || 0) > 0)
    .map(([owner, t]) => {
      const booked = (sales.orders || []).filter(o => o.owner === owner)
        .reduce((s, o) => s + (+o.valueK || 0), 0)
      return { owner, booked, annual: t.annual, pct: Math.round((booked / t.annual) * 100) }
    })
    .sort((a, b) => b.pct - a.pct)

  return (
    <div className="page">
      <h2>Analytics</h2>
      <div className="hint" style={{ marginBottom: 10 }}>Click any bar to open the supporting records.</div>

      <div className="ana-grid">
        <div className="ana-card c-6">
          <div className="ana-title">Funnel &amp; conversion</div>
          <Funnel stages={funnel} />
          <div className="legend">
            <span><svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#cbd5e1" strokeDasharray="4 3" strokeWidth="1.5" /></svg> Ideal funnel shape</span>
            <span><span style={{ width: 12, height: 12, background: '#0284c7', borderRadius: 3, display: 'inline-block' }} /> Actual stage volume (at or beyond)</span>
          </div>
        </div>

        <div className="ana-card c-6">
          <div className="ana-title">Pipeline &amp; weighted forecast</div>
          {comm ? (
            <ul className="stat-list">
              <li><span>Open opportunities</span><b>{open.length}</b></li>
              <li><span>Pipeline (Sum of Value)</span><b>{fmtLakh(pipelineK)}</b></li>
              <li><span>Weighted forecast (prob-adjusted)</span><b>{fmtLakh(weightedK)}</b></li>
              <li className="hint-li">Weights: Low 25% · Medium 50% · High 75% of Value (K₹); unset probability counts as Low.</li>
            </ul>
          ) : <Restricted />}
        </div>

        <BarCard title="Owner" entries={countBy(open, 'owner')} color="#0369a1"
          onPick={v => toTracker('owner', v)} hint="Open opportunities per owner." />
        <BarCard title="Opp type" entries={countBy(open, 'oppType')} color="#0d9488"
          onPick={v => toTracker('oppType', v)} />
        <BarCard title="BU / business area" entries={countBy(open, 'bu')} color="#475569"
          onPick={v => toTracker('bu', v)} />

        <div className="ana-card c-4">
          <div className="ana-title">Customer classes</div>
          {CUSTOMER_STATUSES.map(cls => {
            const n = store.customers.filter(c => c.status === cls).length
            return (
              <div key={cls} className="mbar clickable" role="button" tabIndex={0}
                onClick={() => nav('/customers')} onKeyDown={e => { if (e.key === 'Enter') nav('/customers') }}>
                <span className="mb-lbl"><span className={`pill ${cls}`}>{cls}</span></span>
                <span className="mb-track"><span className={`mb-fill class-${cls}`} style={{ width: `${Math.max(3, (n / Math.max(1, store.customers.length)) * 100)}%` }} /></span>
                <span className="mb-val">{n}</span>
              </div>
            )
          })}
          <div className="hint" style={{ marginTop: 6 }}>Blue = new customer pending admin verification.</div>
        </div>

        <div className="ana-card c-4">
          <div className="ana-title">Quote ageing / validity</div>
          <ul className="stat-list scrolly">
            {ageing.map(o => (
              <li key={o.id}>
                <span><Link className="oppid-link" to={`/proposal/${o.id}`}>{o.id}</Link> <span className="hint">{o.sellTo}</span></span>
                <b>{o.age} d old · {o.proposalDate ? 'submitted' : 'not submitted'}</b>
              </li>
            ))}
            {!ageing.length && <li className="hint-li">No open opportunities.</li>}
          </ul>
        </div>

        <div className="ana-card c-4">
          <div className="ana-title">Win / loss reasons</div>
          <ul className="stat-list scrolly">
            {closed.map(o => (
              <li key={o.id}>
                <span><Link className="oppid-link" to={`/folders/${o.id}`}>{o.id}</Link>{' '}
                  <span className={`pill ${o.stage === 'Won' ? 'won' : 'lost'}`}>{o.stage}</span></span>
                <b>{o.closedReason || '—'}</b>
              </li>
            ))}
            {!closed.length && <li className="hint-li">No closed opportunities yet.</li>}
          </ul>
        </div>

        <div className="ana-card c-12">
          <div className="ana-title">Margin view — GM% by opportunity</div>
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
          <div className="ana-title">Team target vs actual — {sales.fy}</div>
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
          <div className="ana-title">Attainment by owner</div>
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
