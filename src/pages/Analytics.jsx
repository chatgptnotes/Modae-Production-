import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { STAGES, CUSTOMER_STATUSES } from '../seed.js'
import { fmt, fmtLakh, ageDays, canViewCommercial } from '../utils.js'

// Funnel ramp validated with the dataviz palette checker (ordinal, light
// surface): monotone lightness, ≥0.06 step gaps, light end ≥2:1 on white.
const FUNNEL_RAMP = ['#8db1d3', '#729fc6', '#588cb8', '#4477a4', '#2f608c', '#123a5e']
const PROB_WEIGHT = { Low: 0.25, Medium: 0.5, High: 0.75 }

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
      <polygon fill="none" stroke="#b5bac2" strokeDasharray="5 4"
        points={stages.map((_, i) => `${LBL + (plotW - idealW(i)) / 2},${y(i) + ROW / 2}`).join(' ') + ' ' +
          stages.map((_, i) => `${LBL + (plotW + idealW(i)) / 2},${y(i) + ROW / 2}`).reverse().join(' ')} />
      {stages.map((s, i) => {
        const w = Math.max(plotW * 0.05, (s.count / max) * plotW)
        return (
          <g key={s.label}>
            <text x={LBL - 10} y={y(i) + ROW / 2 - 2} textAnchor="end" fontSize="12" fontWeight="600" fill="#252423">{s.label}</text>
            {i > 0 && (
              <text x={LBL - 10} y={y(i) + ROW / 2 + 12} textAnchor="end" fontSize="10.5" fill="#888">
                {stages[i - 1].count ? Math.round((s.count / stages[i - 1].count) * 100) : 0}% of prior
              </text>
            )}
            <rect x={LBL + (plotW - w) / 2} y={y(i) + 6} width={w} height={ROW - 12} rx="4" fill={FUNNEL_RAMP[i]} />
            <text x={LBL + plotW / 2} y={y(i) + ROW / 2 + 4} textAnchor="middle" fontSize="13" fontWeight="700"
              fill={i < 2 ? '#252423' : '#fff'}>{s.count}</text>
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

  return (
    <div className="page">
      <h2>Analytics</h2>
      <div className="hint" style={{ marginBottom: 10 }}>Click any bar to open the supporting records.</div>

      <div className="ana-grid">
        <div className="ana-card c-6">
          <div className="ana-title">Funnel &amp; conversion</div>
          <Funnel stages={funnel} />
          <div className="legend">
            <span><svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#b5bac2" strokeDasharray="4 3" strokeWidth="1.5" /></svg> Ideal funnel shape</span>
            <span><span style={{ width: 12, height: 12, background: '#4477a4', borderRadius: 3, display: 'inline-block' }} /> Actual stage volume (at or beyond)</span>
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

        <BarCard title="Owner" entries={countBy(open, 'owner')} color="#1f4e79"
          onPick={v => toTracker('owner', v)} hint="Open opportunities per owner." />
        <BarCard title="Opp type" entries={countBy(open, 'oppType')} color="#217346"
          onPick={v => toTracker('oppType', v)} />
        <BarCard title="BU / business area" entries={countBy(open, 'bu')} color="#6d6d6d"
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
                    <span className="mb-fill" style={{ width: `${Math.min(100, Math.max(4, o.gm))}%`, background: o.gm >= 25 ? '#217346' : o.gm >= 20 ? '#bf9000' : '#9c0006' }} />
                  </span>
                  <span className="mb-val">{o.gm}%</span>
                </div>
              ))}
              {!margins.length && <div className="hint">No open opportunities with a value yet.</div>}
              <div className="hint" style={{ marginTop: 6 }}>Green ≥ 25% · amber ≥ 20% · red below 20% (Net GM heuristic; the Priced BoQ holds the exact number).</div>
            </>
          ) : <Restricted />}
        </div>
      </div>
    </div>
  )
}
