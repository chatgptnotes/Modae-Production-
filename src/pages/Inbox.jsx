import React, { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ddMmmYY, ageDays } from '../utils.js'
import { Icon } from '../icons.jsx'
import { useDrawer } from '../drawer.jsx'
import { Chip, ConfChip, WarnBox, ErrBox } from '../ui.jsx'

// Common-mailbox lead inbox: AI parses each inquiry, a human decides whether it
// becomes an opportunity (Qualify → registration / intake form) or is dropped.
const PILL = { New: 'Blue', Qualified: 'Amber', Dropped: 'Red', Converted: 'Green' }
const STATUS_OPTIONS = ['New', 'Qualified', 'Converted', 'Dropped']
const ROUTE_OPTIONS = ['Project', 'Spares', 'Service']
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

// Best-effort customer match against the master, off the AI sell-to field.
export function matchCustomer(customers, lead) {
  const sellTo = (lead.ai?.fields || []).find(f => /sell-to/i.test(f.k))?.v || lead.parse?.sellTo || ''
  const s = sellTo.toLowerCase()
  return customers.find(c => {
    const n = c.name.toLowerCase()
    return s && (s.includes(n) || n.includes(s))
  }) || null
}

const fieldChip = (f, med) => {
  if (f.state === 'accepted') return <Chip tone="state-Accepted">Accepted</Chip>
  if (f.state === 'rejected') return <Chip tone="state-Rejected">Rejected</Chip>
  return f.conf >= med
    ? <Chip tone="state-Review">Review required</Chip>
    : <Chip tone="state-Blocks">Blocks stage</Chip>
}

// ---------------------------------------------------------------------------
// Rich three-panel detail for AI-parsed leads (LD-201..LD-206 shape).
// ---------------------------------------------------------------------------
function AiLeadDetail({ lead }) {
  const store = useStore()
  const nav = useNavigate()
  const drawer = useDrawer()
  const ai = lead.ai
  const med = store.config.aiThresholds?.med ?? 75
  const [evOpen, setEvOpen] = useState(null)      // field index with evidence expanded
  const [editFor, setEditFor] = useState(null)    // { idx, val, note }
  const [rejFor, setRejFor] = useState(null)      // { idx, note }

  const customer = matchCustomer(store.customers, lead)
  const isRed = lead.redFlag || customer?.status === 'Red'
  const redApproval = store.approvals.find(a => a.leadId === lead.id && a.type === 'Red customer clearance')
  const redCleared = redApproval && ['Approved', 'Approved with conditions'].includes(redApproval.status)

  const groups = [...new Set(ai.fields.map(f => f.group))]
  const pendingLow = ai.fields.filter(f => f.state === 'pending' && f.conf < med)

  const patchField = (idx, patch) => {
    store.updateLead(lead.id, {
      ai: { ...ai, fields: ai.fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)) },
    })
  }

  const saveEdit = () => {
    patchField(editFor.idx, {
      v: editFor.val, note: editFor.note || 'Edited by user',
      conf: Math.max(ai.fields[editFor.idx].conf, 95), state: 'accepted',
    })
    setEditFor(null)
  }
  const saveReject = () => {
    patchField(rejFor.idx, { state: 'rejected', note: rejFor.note })
    setRejFor(null)
  }

  const rule = (store.config.ownershipRules || []).find(r => r.owner === lead.suggestedOwner)

  const qualifyBlocked = isRed && !redCleared
  const canAct = !['Converted', 'Dropped'].includes(lead.status)
  // Read-only progress readout for the fields column footer.
  const decided = ai.fields.filter(f => f.state !== 'pending').length
  const attachments = lead.attachments || []

  return (
    <div className="ws-grid">
      {/* ---- Column 1 — original email ---- */}
      <section className="ws-col">
        <header className="ws-head">
          <span className="ws-head-icon blue"><Icon name="mail" size={13} /></span>
          <span className="ws-head-title">Original email</span>
          <span className="ws-head-meta">{lead.source || lead.channel || 'Common mailbox'}</span>
        </header>
        <div className="ws-body">
          <div className="ws-sender">
            <b>{lead.sender || lead.from}</b>
            <span>{lead.from}</span>
          </div>
          <div className="ws-subject">{lead.subject}</div>
          {lead.ref && <div className="ws-tag">Ref {lead.ref}</div>}
          <div className="email-body">{lead.body}</div>
          {attachments.length > 0 && (
            <>
              <div className="ws-group">Attachments</div>
              {attachments.map((a, i) => (
                <div key={i} className="attach-row">
                  <span className="attach-icon"><Icon name="fileText" size={13} /></span>
                  <span className="attach-name">{a.name}</span>
                  <span className="attach-meta">{a.pages} p.</span>
                </div>
              ))}
            </>
          )}
        </div>
        <footer className="ws-foot ws-foot-meta">
          <span><Icon name="clock" size={12} /> {ddMmmYY((lead.ts || '').slice(0, 10))}</span>
          <span>{attachments.length} attachment{attachments.length === 1 ? '' : 's'}</span>
        </footer>
      </section>

      {/* ---- Column 2 — AI-extracted fields ---- */}
      <section className="ws-col">
        <header className="ws-head">
          <span className="ws-head-icon violet"><Icon name="bot" size={13} /></span>
          <span className="ws-head-title">AI-extracted fields</span>
          <span className="ws-head-meta">AI proposes · humans decide</span>
        </header>
        <div className="ws-body">
          {groups.map(g => (
            <div key={g}>
              <div className="ws-group">{g}</div>
              {ai.fields.map((f, idx) => f.group === g && (
                <div key={idx} className={`ai-field state-${f.state}${f.state === 'pending' && f.conf < med ? ' low' : ''}`}>
                  <div className="af-top">
                    <span className="af-key">{f.k}</span>
                    <span className="af-chips">
                      <ConfChip conf={f.conf} thresholds={store.config.aiThresholds} />
                      {fieldChip(f, med)}
                    </span>
                  </div>
                  {editFor?.idx === idx
                    ? <div className="af-edit">
                        <input value={editFor.val} onChange={e => setEditFor({ ...editFor, val: e.target.value })} />
                        <input placeholder="Edit note (why the value changed)" value={editFor.note}
                          onChange={e => setEditFor({ ...editFor, note: e.target.value })} />
                        <div className="af-edit-actions">
                          <button className="primary" onClick={saveEdit}>Save</button>
                          <button onClick={() => setEditFor(null)}>Cancel</button>
                        </div>
                      </div>
                    : <div className="af-val">{f.v}</div>}
                  <button className="af-ev" onClick={() => setEvOpen(evOpen === idx ? null : idx)}>
                    <Icon name="eye" size={11} /> Evidence
                  </button>
                  {evOpen === idx && (
                    <div className="af-evidence">{f.ev}{f.note ? ` — ${f.note}` : ''}</div>
                  )}
                  {rejFor?.idx === idx && (
                    <div className="af-reject">
                      <input placeholder="Rejection note (required)" value={rejFor.note}
                        onChange={e => setRejFor({ ...rejFor, note: e.target.value })} />
                      <button className="primary" disabled={!rejFor.note.trim()} onClick={saveReject}>Reject</button>
                      <button onClick={() => setRejFor(null)}>Cancel</button>
                    </div>
                  )}
                  {f.state === 'pending' && canAct && editFor?.idx !== idx && rejFor?.idx !== idx && (
                    <div className="af-actions">
                      <button className="act-accept" onClick={() => patchField(idx, { state: 'accepted' })}>
                        <Icon name="check" size={11} /> Accept
                      </button>
                      <button onClick={() => { setRejFor(null); setEditFor({ idx, val: f.v, note: '' }) }}>Edit</button>
                      <button className="act-reject" onClick={() => { setEditFor(null); setRejFor({ idx, note: '' }) }}>
                        <Icon name="x" size={11} /> Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
        <footer className="ws-foot ws-foot-meta">
          <span><b>{decided}</b> of {ai.fields.length} fields decided</span>
          <span className="ws-progress">
            <span style={{ width: `${ai.fields.length ? (decided / ai.fields.length) * 100 : 0}%` }} />
          </span>
        </footer>
      </section>

      {/* ---- Column 3 — AI summary, alerts, actions ---- */}
      <section className="ws-col">
        <header className="ws-head">
          <span className="ws-head-icon emerald"><Icon name="sparkles" size={13} /></span>
          <span className="ws-head-title">AI summary &amp; actions</span>
        </header>
        <div className="ws-body">
          <p className="ws-summary">{ai.summary}</p>

          {ai.missing?.length > 0 && (
            <WarnBox>
              <b>Missing information</b>
              <ul>{ai.missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </WarnBox>
          )}

          {ai.duplicates?.length > 0 && (
            <WarnBox>
              <b>Duplicate candidates</b>
              {ai.duplicates.map((d, i) => (
                <div key={i} className="ws-dup">
                  <span>{d.leadId} — {d.note}</span>
                  <div className="ws-dup-actions">
                    <button onClick={() => store.updateLead(lead.id, {
                      ai: { ...ai, duplicates: ai.duplicates.filter((_, j) => j !== i) },
                    })}>Not a duplicate</button>
                    <button onClick={() => store.updateLead(lead.id, { status: 'Dropped', droppedReason: 'Duplicate' })}>
                      Mark duplicate
                    </button>
                  </div>
                </div>
              ))}
            </WarnBox>
          )}

          <div className="ws-group">Qualification &amp; ownership</div>
          <div className="ws-kv">
            <span className="ws-kv-k">Customer match</span>
            <span className="ws-kv-v">
              {customer ? customer.name : 'Unmatched (new — Blue)'}
              {customer && <span className={`pill ${customer.status}`}>{customer.status}</span>}
            </span>
          </div>
          <div className="ws-kv">
            <span className="ws-kv-k">Suggested owner</span>
            <span className="ws-kv-v">
              {lead.suggestedOwner}
              <span className="ws-kv-note">{rule ? `${rule.region} rule` : 'regional rule'} · override needs LJS/AH + reason</span>
            </span>
          </div>

          {ai.next?.length > 0 && (
            <>
              <div className="ws-group">Suggested next actions</div>
              <ul className="ws-next">{ai.next.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </>
          )}

          {isRed && !redCleared && (
            <ErrBox>
              <b>Red-class customer</b> — continuation needs joint LJS + AH approval (AP-1).
              No opportunity ID until approved.{' '}
              {redApproval
                ? <>Approval <b>{redApproval.id}</b> is <b>{redApproval.status}</b>.{' '}
                    <button onClick={() => nav('/approvals')}>Open approvals</button></>
                : <button onClick={() => store.requestApproval({
                    leadId: lead.id, oppId: '', type: 'Red customer clearance',
                    detail: `${customer?.name || lead.sender || lead.from} (Red) — ${lead.subject}. Continuation needs joint LJS + AH clearance before any opportunity ID is generated.`,
                    approver: 'LJS', needed: ['LJS', 'AH'],
                  })}>Request joint approval</button>}
            </ErrBox>
          )}
          {isRed && redCleared && (
            <div className="okbox">
              Red gate cleared — {redApproval.id} <b>{redApproval.status}</b>.
              {redApproval.status === 'Approved with conditions' && ' Proceed on prepayment-only conditions.'}
            </div>
          )}

          {lead.status === 'Converted' && (
            <div className="okbox">
              Qualified and converted{lead.oppId && <> — <span className="oppid-link" style={{ cursor: 'pointer' }}
                onClick={() => drawer.open({ type: 'opp', id: lead.oppId })}>{lead.oppId}</span></>}.
            </div>
          )}
          {lead.status === 'Dropped' && (
            <div className="warn-box">
              Dropped — {lead.droppedReason || 'no reason recorded'}. Kept minimally for analytics.
            </div>
          )}

          {lead.status === 'Qualified' && pendingLow.length > 0 && (
            <WarnBox>
              <b>Registration still blocked</b> by {pendingLow.length} low-confidence
              field{pendingLow.length > 1 ? 's' : ''} awaiting a decision:
              <ul>{pendingLow.map((f, i) => <li key={i}>{f.k} ({f.conf}% confidence)</li>)}</ul>
              Each must be accepted, edited or rejected.
            </WarnBox>
          )}
        </div>

        <footer className="ws-foot">
          {canAct && lead.status !== 'Qualified' && (
            <>
              <button className="primary ws-action" disabled={qualifyBlocked}
                title={qualifyBlocked ? 'Blocked: Red continuation approval required first' : undefined}
                onClick={() => store.updateLead(lead.id, { status: 'Qualified' })}>
                <Icon name="check" size={14} /> Qualify lead
              </button>
              {qualifyBlocked && <p className="ws-foot-note">Blocked — Red continuation approval required first.</p>}
            </>
          )}
          {lead.status === 'Qualified' && (
            <>
              <button className="primary ws-action" disabled={pendingLow.length > 0}
                title={pendingLow.length ? 'Resolve the low-confidence fields first' : undefined}
                onClick={() => nav('/register/' + lead.id)}>
                Continue to registration <Icon name="arrowRight" size={14} />
              </button>
              {pendingLow.length > 0 && (
                <p className="ws-foot-note">
                  Blocked — {pendingLow.length} field{pendingLow.length > 1 ? 's' : ''} below the {med}% confidence threshold.
                </p>
              )}
            </>
          )}
          {!canAct && (
            <p className="ws-foot-note">
              Lead {lead.status.toLowerCase()} — no further action required.
            </p>
          )}
        </footer>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Legacy detail — simple parse table + qualify-via-intake for non-AI leads.
// ---------------------------------------------------------------------------
function LegacyLeadDetail({ lead }) {
  const store = useStore()
  const nav = useNavigate()
  const drawer = useDrawer()
  const [dropping, setDropping] = useState(false)
  const [dropReason, setDropReason] = useState(DROP_REASONS[0])
  const p = lead.parse || {}

  // The lead stays 'New' until the intake form is actually submitted —
  // IntakeForm flips it to Qualified and records the created oppId.
  const qualify = () => {
    const pick = k => p[k] ?? ''
    nav('/new', {
      state: {
        leadId: lead.id,
        prefill: {
          sellTo: pick('sellTo'), category: pick('category'), location: pick('location'),
          eucName: pick('eucName'), eucLocation: pick('eucLocation'), oppName: pick('oppName'),
          owner: '', oppType: pick('oppType'), bu: pick('bu'), segment: pick('segment'),
          product: pick('product'), contactPerson: pick('contactPerson'), contactPhone: pick('contactPhone'),
        },
      },
    })
  }

  return (
    <div className="form-card" style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <b>{lead.subject}</b>
        <span className="spacer" style={{ flex: 1 }} />
        <span className={`pill ${PILL[lead.status] || 'Blue'}`}>{lead.status}</span>
      </div>
      <p className="hint" style={{ margin: '4px 0 10px' }}>
        From {lead.from} · {lead.channel} · {ddMmmYY((lead.ts || '').slice(0, 10))}
      </p>
      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', background: '#f8fafc', border: '1px solid var(--grid-line)', padding: '10px 12px', fontSize: 12.5 }}>
        {lead.body}
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

      {lead.status === 'Qualified' && (
        <p className="hint" style={{ marginTop: 12 }}>
          <Icon name="checkCircle" size={12} /> Qualified — converted to opportunity{' '}
          {lead.oppId
            ? <span className="oppid-link" style={{ cursor: 'pointer' }}
                onClick={() => drawer.open({ type: 'opp', id: lead.oppId })}>{lead.oppId}</span>
            : '(pending intake submit)'}.
        </p>
      )}
      {lead.status === 'Dropped' && (
        <div className="warn-box" style={{ marginTop: 12 }}>
          Dropped — {lead.droppedReason || 'no reason recorded'}. Kept minimally for future analytics.
        </div>
      )}

      {lead.status === 'New' && (
        <div className="toolbar" style={{ marginTop: 14, marginBottom: 0 }}>
          <button className="primary" onClick={qualify}>
            <Icon name="check" size={13} /> Qualify → intake form
          </button>
          {!dropping
            ? <button onClick={() => { setDropping(true); setDropReason(DROP_REASONS[0]) }}>
                <Icon name="x" size={13} /> Drop lead
              </button>
            : <>
                <select value={dropReason} onChange={e => setDropReason(e.target.value)}>
                  {DROP_REASONS.map(r => <option key={r}>{r}</option>)}
                </select>
                <button onClick={() => { store.updateLead(lead.id, { status: 'Dropped', droppedReason: dropReason }); setDropping(false) }}>
                  Confirm drop
                </button>
                <button onClick={() => setDropping(false)}>Cancel</button>
              </>}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inbox — table list, or per-lead detail when /inbox/:leadId matches.
// ---------------------------------------------------------------------------
export default function Inbox() {
  const store = useStore()
  const nav = useNavigate()
  const { leadId } = useParams()
  const [q, setQ] = useState('')
  const [statusF, setStatusF] = useState('')
  const [routeF, setRouteF] = useState('')

  const sel = leadId ? store.leads.find(l => l.id === leadId) : null
  if (sel) {
    const age = ageDays((sel.ts || '').slice(0, 10))
    return (
      <div className="lead-workspace">
        <div className="ws-topbar">
          <button className="ws-back" onClick={() => nav('/inbox')}>
            <Icon name="inbox" size={13} /> Back to inbox
          </button>
          <div className="ws-topbar-title">
            <h2>{sel.subject}</h2>
            <div className="ws-topbar-meta">
              {sel.ref && <span className="ws-tag">{sel.ref}</span>}
              <span>{sel.sender || sel.from}</span>
              <span>·</span>
              <span>{ddMmmYY((sel.ts || '').slice(0, 10))}</span>
              {age != null && <><span>·</span><span>{age} d old</span></>}
            </div>
          </div>
          <span className={`pill ${PILL[sel.status] || 'Blue'}`}>{sel.status}</span>
        </div>
        {sel.ai
          ? <AiLeadDetail lead={sel} />
          : <div className="ws-grid single"><section className="ws-col"><div className="ws-body">
              <LegacyLeadDetail lead={sel} />
            </div></section></div>}
      </div>
    )
  }

  const rows = store.leads.filter(l => {
    if (q) {
      const hay = `${l.subject} ${l.sender || ''} ${l.from} ${l.ref || ''}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    if (statusF && l.status !== statusF) return false
    if (routeF && (l.route || l.parse?.oppType || '') !== routeF) return false
    return true
  })

  return (
    <div className="page">
      <h2><Icon name="inbox" size={18} /> Lead Inbox</h2>
      <p className="hint">
        Common sales mailbox is the intake source of truth — AI structures, humans decide.
      </p>
      <div className="toolbar">
        <input placeholder="Search subject, sender, ref…" value={q} onChange={e => setQ(e.target.value)}
          style={{ minWidth: 220 }} />
        <select value={statusF} onChange={e => setStatusF(e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={routeF} onChange={e => setRouteF(e.target.value)}>
          <option value="">All routes</option>
          {ROUTE_OPTIONS.map(r => <option key={r}>{r}</option>)}
        </select>
        <span className="spacer" />
        <button onClick={() => store.addLead(simulatedLead())}>
          <Icon name="mail" size={13} /> Simulate incoming inquiry
        </button>
      </div>

      <div className="sheet-wrap">
        <table className="sheet">
          <thead>
            <tr>
              <th>Received</th><th>Source</th><th>Sender</th><th>Subject / ref</th>
              <th>AI route</th><th>Urgency</th><th>Dup. risk</th><th>Completeness</th>
              <th>Sugg. owner</th><th>Status</th><th>Age</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(l => {
              const completeness = l.completeness ?? (l.parse?.confidence != null ? Math.round(l.parse.confidence * 100) : null)
              const route = l.route || l.parse?.oppType || '—'
              return (
                <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => nav('/inbox/' + l.id)}>
                  <td>{ddMmmYY((l.ts || '').slice(0, 10))}</td>
                  <td>{l.source || l.channel}</td>
                  <td>
                    <b>{l.sender || l.from}</b>
                    {l.sender && <><br /><span className="hint">{l.from}</span></>}
                  </td>
                  <td>
                    <b>{l.subject}</b>
                    {l.ref && <><br /><span className="hint">{l.ref}</span></>}
                  </td>
                  <td><Chip tone="grey">{route}</Chip></td>
                  <td>{l.urgency === 'Urgent'
                    ? <Chip tone="state-Rejected">Urgent</Chip>
                    : <Chip tone="grey">Normal</Chip>}</td>
                  <td>{l.duplicateRisk === 'Medium'
                    ? <Chip tone="conf-med">Medium</Chip>
                    : <Chip tone="grey">Low</Chip>}</td>
                  <td>{completeness != null
                    ? <ConfChip conf={completeness} thresholds={store.config.aiThresholds} />
                    : '—'}</td>
                  <td>{l.suggestedOwner || '—'}</td>
                  <td><span className={`pill ${PILL[l.status] || 'Blue'}`}>{l.status}</span></td>
                  <td>{ageDays((l.ts || '').slice(0, 10))} d</td>
                </tr>
              )
            })}
            {!rows.length && (
              <tr><td colSpan={11}>No leads match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        Dropped leads are kept as a minimal record — reason and source only — for future demand analytics.
      </p>
    </div>
  )
}
