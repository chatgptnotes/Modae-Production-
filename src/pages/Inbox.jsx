import React, { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ddMmmYY } from '../utils.js'
import { Icon } from '../icons.jsx'
import { useDrawer } from '../drawer.jsx'

// Common-mailbox lead inbox: AI parses each inquiry, a human decides whether it
// becomes an opportunity (Qualify → intake form) or is dropped with a reason.
const PILL = { New: 'Blue', Qualified: 'Amber', Dropped: 'Red' }
const FILTERS = ['All', 'New', 'Qualified', 'Dropped']
const DROP_REASONS = ['Outside business scope', 'Window shopping / budgetary only',
  'Duplicate inquiry', 'No response from customer', 'Other']

const confClass = c => (c >= 0.9 ? 'hi' : c >= 0.6 ? 'med' : 'lo')
const confLabel = c => (c >= 0.9 ? 'High' : c >= 0.6 ? 'Medium' : 'Low')
const ConfBadge = ({ c }) => (
  <span className={`conf-badge ${confClass(c || 0)}`}>AI · {confLabel(c || 0)}</span>
)

const simulatedLead = () => ({
  id: 'LD-' + Date.now(), ts: new Date().toISOString(), channel: 'Email',
  from: 'stores.korba@balco.example.in',
  subject: 'Quotation required — vibration sensor spares for TG-3',
  body: 'Dear ModAE team,\n\nFor our TG-3 condition monitoring system we require:\n1) 4 nos velocity sensors P/N 9200-01-05-10-00\n2) 2 nos signal cables, 9 m\n\nPlease send your best quotation with delivery to Korba, Chhattisgarh. Material required within 6 weeks.\n\nThanks & regards,\nStores Dept, BALCO Korba',
  status: 'New',
  parse: {
    sellTo: 'BALCO Korba', category: 'EUC', location: 'Korba',
    eucName: 'BALCO Korba', eucLocation: 'Korba',
    oppName: 'Vibration sensor spares — TG-3',
    oppType: 'Spares', bu: 'Energy', segment: 'Industrial', product: 'ModAE',
    contactPerson: 'Stores Dept', contactPhone: '',
    items: [
      { desc: 'Velocity sensor', pn: '9200-01-05-10-00', qty: 4 },
      { desc: 'Signal cable, 9 m', pn: '', qty: 2 },
    ],
    confidence: 0.8,
    note: 'Part numbers matched sensor family; verify cable length variant before quoting.',
  },
})

const PARSE_FIELDS = [
  ['Sell-to', 'sellTo'], ['Category', 'category'], ['Location', 'location'],
  ['EUC name', 'eucName'], ['EUC location', 'eucLocation'], ['Opp name', 'oppName'],
  ['Opp type', 'oppType'], ['BU', 'bu'], ['Segment', 'segment'], ['Product', 'product'],
  ['Contact person', 'contactPerson'], ['Contact phone', 'contactPhone'],
]

export default function Inbox() {
  const store = useStore()
  const nav = useNavigate()
  const drawer = useDrawer()
  const { leadId } = useParams()
  const [filter, setFilter] = useState('All')
  // Drop UI is two-step (select reason, then confirm); keyed by lead id so
  // switching leads collapses it without a useEffect.
  const [dropFor, setDropFor] = useState(null)
  const [dropReason, setDropReason] = useState(DROP_REASONS[0])

  const rows = filter === 'All' ? store.leads : store.leads.filter(l => l.status === filter)
  // Selection stays within the active filter — a lead the filter excludes must
  // not sit in the detail pane next to a list that doesn't contain it.
  const sel = rows.find(l => l.id === leadId) || rows[0]
  const p = sel?.parse || {}

  // The lead stays 'New' until the intake form is actually submitted —
  // IntakeForm flips it to Qualified and records the created oppId (so an
  // abandoned form leaves the lead re-qualifiable, never stuck).
  const qualify = l => {
    const q = l.parse || {}
    const pick = k => q[k] ?? ''
    nav('/new', {
      state: {
        leadId: l.id,
        prefill: {
          sellTo: pick('sellTo'), category: pick('category'), location: pick('location'),
          eucName: pick('eucName'), eucLocation: pick('eucLocation'), oppName: pick('oppName'),
          owner: '', oppType: pick('oppType'), bu: pick('bu'), segment: pick('segment'),
          product: pick('product'), contactPerson: pick('contactPerson'), contactPhone: pick('contactPhone'),
        },
      },
    })
  }

  const confirmDrop = l => {
    store.updateLead(l.id, { status: 'Dropped', droppedReason: dropReason })
    setDropFor(null)
  }

  return (
    <div className="page">
      <h2><Icon name="inbox" size={18} /> Lead Inbox</h2>
      <div className="toolbar">
        {FILTERS.map(f => (
          <button key={f} className={filter === f ? 'primary' : ''} onClick={() => setFilter(f)}>{f}</button>
        ))}
        <span className="spacer" />
        <button onClick={() => store.addLead(simulatedLead())}>
          <Icon name="mail" size={13} /> Simulate incoming inquiry
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 300px', maxWidth: 420 }}>
          <p className="hint" style={{ marginBottom: 8 }}>
            Common mailbox intake — AI parses each inquiry; you decide what becomes an opportunity.
          </p>
          <div className="tile-hits" style={{ maxWidth: 'none', boxShadow: 'none' }}>
            {rows.map(l => (
              <div key={l.id} className="tile-hit"
                style={sel?.id === l.id ? { background: 'var(--select-fill)' } : undefined}
                onClick={() => nav('/inbox/' + l.id)}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.from}</b>
                  <span className="spacer" style={{ flex: 1 }} />
                  <span className="hint">{ddMmmYY((l.ts || '').slice(0, 10))}</span>
                </div>
                <div style={{ margin: '2px 0' }}>{l.subject}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span className={`pill ${PILL[l.status]}`}>{l.status}</span>
                  <ConfBadge c={l.parse?.confidence} />
                </div>
              </div>
            ))}
            {!rows.length && <div className="tile-hit" style={{ cursor: 'default' }}>No leads in this view.</div>}
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            Dropped leads are kept as a minimal record — reason and source only — for future demand analytics.
          </p>
        </div>

        {sel && (
          <div className="form-card" style={{ flex: '2 1 380px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <b>{sel.subject}</b>
              <span className="spacer" style={{ flex: 1 }} />
              <span className={`pill ${PILL[sel.status]}`}>{sel.status}</span>
            </div>
            <p className="hint" style={{ margin: '4px 0 10px' }}>
              From {sel.from} · {sel.channel} · {ddMmmYY((sel.ts || '').slice(0, 10))}
            </p>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', background: '#fafafa', border: '1px solid var(--grid-line)', padding: '10px 12px', fontSize: 12.5 }}>
              {sel.body}
            </pre>

            <div className="section-title">
              <Icon name="bot" size={13} /> AI extraction <ConfBadge c={p.confidence} />
            </div>
            <div className="sheet-wrap">
              <table className="sheet">
                <tbody>
                  {PARSE_FIELDS.map(([label, key]) => (
                    <tr key={key}><th style={{ textAlign: 'left', width: 130 }}>{label}</th><td>{p[key] || '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(p.items || []).length > 0 && (
              <div className="sheet-wrap" style={{ marginTop: 8 }}>
                <table className="sheet">
                  <thead><tr><th>Item</th><th>P/N</th><th>Qty</th></tr></thead>
                  <tbody>
                    {p.items.map((it, i) => (
                      <tr key={i}><td>{it.desc}</td><td>{it.pn || '—'}</td><td>{it.qty}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {p.note && <p className="hint" style={{ marginTop: 8 }}><Icon name="alert" size={12} /> {p.note}</p>}

            {sel.status === 'Qualified' && (
              <p className="hint" style={{ marginTop: 12 }}>
                <Icon name="checkCircle" size={12} /> Qualified — converted to opportunity{' '}
                {sel.oppId
                  ? <span className="oppid-link" style={{ cursor: 'pointer' }}
                      onClick={() => drawer.open({ type: 'opp', id: sel.oppId })}>{sel.oppId}</span>
                  : '(pending intake submit)'}.
              </p>
            )}
            {sel.status === 'Dropped' && (
              <div className="warn-box" style={{ marginTop: 12 }}>
                Dropped — {sel.droppedReason || 'no reason recorded'}. Kept minimally for future analytics.
              </div>
            )}

            {sel.status === 'New' && (
              <div className="toolbar" style={{ marginTop: 14, marginBottom: 0 }}>
                <button className="primary" onClick={() => qualify(sel)}>
                  <Icon name="check" size={13} /> Qualify → intake form
                </button>
                {dropFor !== sel.id
                  ? <button onClick={() => { setDropFor(sel.id); setDropReason(DROP_REASONS[0]) }}>
                      <Icon name="x" size={13} /> Drop lead
                    </button>
                  : <>
                      <select value={dropReason} onChange={e => setDropReason(e.target.value)}>
                        {DROP_REASONS.map(r => <option key={r}>{r}</option>)}
                      </select>
                      <button onClick={() => confirmDrop(sel)}>Confirm drop</button>
                      <button onClick={() => setDropFor(null)}>Cancel</button>
                    </>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
