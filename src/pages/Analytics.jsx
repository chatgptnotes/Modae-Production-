import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { STAGES, CUSTOMER_STATUSES } from '../seed.js'
import { fmtLakh, ageDays, canViewCommercial } from '../utils.js'
import { PROB_WEIGHT } from '../kpi.js'
import { Icon } from '../icons.jsx'
import { ArcGauge } from '../dashviz.jsx'

// Funnel ramp validated with the dataviz palette checker (ordinal, light
// surface): monotone lightness, ≥0.06 step gaps, light end ≥2:1 on white.
const FUNNEL_RAMP = ['#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#075985']
// Weighting lives in src/kpi.js so the dashboard and this page agree.

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

// Single-hue horizontal bars (counts by category); clicking a bar opens the
// supporting records.
function BarCard({ title, icon, tone, span = 4, entries, color, onPick, hint }) {
  const max = Math.max(1, ...entries.map(([, v]) => v))
  return (
    <div className={`ana-card c-${span}`}>
      <CardHead icon={icon} tone={tone}>{title}</CardHead>
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

// Stage funnel. Each stage is a tapered band whose top edge is its own volume
// and whose bottom edge is the next stage's — so the silhouette *is* the
// conversion — over a dashed "ideal shape". A numbered rail sits on the left
// and the per-stage detail on the right.
function Funnel({ stages }) {
  const W = 620, ROW = 46, GAP = 7, NUM = 46, DETAIL = 156
  const H = stages.length * ROW + (stages.length - 1) * GAP
  const plotW = W - NUM - DETAIL
  const max = Math.max(1, ...stages.map(s => s.count))
  const cx = NUM + plotW / 2
  const y = i => i * (ROW + GAP)
  // Width is strictly proportional to the count — no minimum that would flatter
  // the thin end of the funnel. Narrow bands move their count outside instead.
  const bandW = i => (stages[i].count / max) * plotW
  // Below this a centred count no longer fits inside the band.
  const FITS = 30
  const idealEnd = 0.28
  const idealW = i => plotW * (1 - (1 - idealEnd) * (i / (stages.length - 1)))
  const conv = i => (i > 0 && stages[i - 1].count ? Math.round((stages[i].count / stages[i - 1].count) * 100) : null)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" className="funnel-svg" style={{ width: '100%' }}
      aria-label={`Stage funnel: ${stages.map(s => `${s.label} ${s.count}`).join(', ')}`}>
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
              ? <text x={cx} y={y(i) + ROW / 2 + 5} textAnchor="middle" fontSize="14" fontWeight="800"
                fill={i < 2 ? '#0f172a' : '#fff'}>{s.count}</text>
              : <text x={cx + wTop / 2 + 7} y={y(i) + ROW / 2 + 5} fontSize="14" fontWeight="800"
                fill={FUNNEL_RAMP[i]}>{s.count}</text>}

            <line x1={cx + wTop / 2 + (wTop >= FITS ? 6 : 30)} y1={y(i) + ROW / 2} x2={W - DETAIL + 4} y2={y(i) + ROW / 2}
              stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
            <text x={W - DETAIL + 12} y={y(i) + ROW / 2 - 3} fontSize="12" fontWeight="700" fill="#0f172a">{s.label}</text>
            <text x={W - DETAIL + 12} y={y(i) + ROW / 2 + 12} fontSize="10.5" fill="#64748b">
              {pct == null
                ? 'starting volume'
                : `${pct}% of prior · ${stages[i - 1].count - s.count} dropped`}
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
    <div className="page ana-page">
      <h2>Analytics</h2>
      <div className="hint" style={{ marginBottom: 10 }}>Click any bar to open the supporting records.</div>

      <div className="ana-grid">
        <div className="ana-card c-8">
          <CardHead icon="layers">Funnel &amp; conversion</CardHead>
          <Funnel stages={funnel} />
          <div className="legend">
            <span><svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#cbd5e1" strokeDasharray="4 3" strokeWidth="1.5" /></svg> Ideal funnel shape</span>
            <span><span style={{ width: 12, height: 12, background: `linear-gradient(${FUNNEL_RAMP[1]}, ${FUNNEL_RAMP[4]})`, borderRadius: 3, display: 'inline-block' }} /> Actual stage volume (at or beyond)</span>
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

        <BarCard title="Owner" icon="users" entries={countBy(open, 'owner')} color="#0369a1"
          onPick={v => toTracker('owner', v)} hint="Open opportunities per owner." />
        <BarCard title="Opp type" icon="tag" tone="tone-teal" entries={countBy(open, 'oppType')} color="#0d9488"
          onPick={v => toTracker('oppType', v)} />
        <BarCard title="BU / business area" icon="building" tone="tone-slate" entries={countBy(open, 'bu')} color="#475569"
          onPick={v => toTracker('bu', v)} />

        <div className="ana-card c-4">
          <CardHead icon="flag" tone="tone-green" count={store.customers.length}>Customer classes</CardHead>
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
          <CardHead icon="clock" tone="tone-amber" count={ageing.length}>Quote ageing / validity</CardHead>
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
          <CardHead icon="checkCircle" tone="tone-green" count={closed.length}>Win / loss reasons</CardHead>
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
