import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ROLES } from '../seed.js'
import { isApprover, canViewCommercial, ddMmmYY } from '../utils.js'
import { useDrawer } from '../drawer.jsx'
import { Icon } from '../icons.jsx'
import { Chip } from '../ui.jsx'

const NEW_APPROVAL_MS = 48 * 60 * 60 * 1000
// Approval ts/decisionTs are full ISO stamps; ddMmmYY wants YYYY-MM-DD.
const day = ts => ddMmmYY((ts || '').slice(0, 10))
const time = ts => {
  const d = new Date(ts || '')
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
}
const stamp = ts => {
  const d = day(ts)
  const t = time(ts)
  return t ? `${d} at ${t}` : d
}
const pillFor = s =>
  s === 'Approved' ? 'Green'
    : s === 'Rejected' ? 'Red'
    : s === 'Approved with conditions' || s === 'Returned' ? 'Amber'
    : 'Blue'
const byTsDesc = (a, b) => (b.ts || '').localeCompare(a.ts || '')
const isNewApproval = a => {
  const ts = Date.parse(a?.ts || '')
  const age = Date.now() - ts
  return a?.status === 'Pending' && Number.isFinite(ts) && age >= 0 && age <= NEW_APPROVAL_MS
}
const cardClass = (a, extra = '') => [
  'approval-card',
  isNewApproval(a) && 'approval-card-new',
  extra,
].filter(Boolean).join(' ')
const NewMarker = ({ a }) => isNewApproval(a) ? <span className="approval-new-pill">New</span> : null
// Joint approvals carry needed:[roles]; legacy single-approver rows only `approver`.
const neededOf = a => (a.needed && a.needed.length ? a.needed : [a.approver].filter(Boolean))
const chipTone = d =>
  !d ? 'grey' : d === 'Approved' ? 'state-Accepted' : d === 'Rejected' ? 'state-Rejected' : 'state-Review'
// Detail lines that carry commercial trigger values (GM%, discount, value).
// Exported: the Workbench approvals tab applies the same gate.
export const COMMERCIAL_RX = /GM\s*%|\bGM\b|discount|₹|\bvalue\b|\bmargin\b/i

const DECISIONS = ['Approved', 'Approved with conditions', 'Returned', 'Rejected']
const DECISION_LABELS = {
  'Approved': 'Approve',
  'Approved with conditions': 'Approve with conditions',
  'Returned': 'Return',
  'Rejected': 'Reject',
}

// Inline decision form shown on a pending card when the acting role can decide.
function DecisionForm({ a, role, onDecide }) {
  const [d, setD] = useState('Approved')
  const [comment, setComment] = useState('')
  const [conds, setConds] = useState('')
  const [err, setErr] = useState('')

  const submit = e => {
    e.preventDefault()
    if (!comment.trim()) { setErr('A note is required for every decision.'); return }
    const lines = conds.split('\n').map(l => l.trim()).filter(Boolean)
    if (d === 'Approved with conditions' && !lines.length) {
      setErr('List at least one condition (one per line).')
      return
    }
    setErr('')
    onDecide({ d, comment: comment.trim(), conditions: d === 'Approved with conditions' ? lines : [] })
  }

  return (
    <form onSubmit={submit} className="approval-decision-form">
      <div className="approval-decision-title">
        Your decision as {ROLES[role]?.label || role}
      </div>
      <div className="approval-decision-options">
        {DECISIONS.map(v => (
          <label key={v}>
            <input type="radio" name={`dec-${a.id}`} checked={d === v} onChange={() => setD(v)} />
            {DECISION_LABELS[v]}
          </label>
        ))}
      </div>
      <textarea
        rows={2} value={comment} onChange={e => setComment(e.target.value)}
        placeholder="Decision note (required)"
        className="approval-decision-input"
      />
      {d === 'Approved with conditions' && (
        <textarea
          rows={2} value={conds} onChange={e => setConds(e.target.value)}
          placeholder="Conditions the salesperson must incorporate — one condition per line"
          className="approval-decision-input"
        />
      )}
      {err && <div className="errbox approval-decision-error">{err}</div>}
      <div className="approval-decision-submit">
        <button className="primary" type="submit"><Icon name="clipboardCheck" size={13} /> Record decision</button>
      </div>
    </form>
  )
}

export default function Approvals() {
  const store = useStore()
  const nav = useNavigate()
  const drawer = useDrawer()
  const role = store.role
  const comm = canViewCommercial(role)
  const [q, setQ] = useState('')
  const [statusF, setStatusF] = useState('')
  const [typeF, setTypeF] = useState('')
  // Approver workbench for LJS/AH/admins, plus any role named on a joint gate.
  const approverView = isApprover(role) || store.approvals.some(a => neededOf(a).includes(role))
  const canDecide = a => neededOf(a).includes(role)

  const oppName = id => (store.opportunities.find(o => o.id === id) || {}).oppName || ''
  const OppLink = ({ id }) => (
    <a onClick={() => drawer.open({ type: 'opp', id })} style={{ cursor: 'pointer' }}>
      <b>{id}</b>{oppName(id) && <span> — {oppName(id)}</span>}
    </a>
  )
  const RefLink = ({ a }) => a.oppId
    ? <OppLink id={a.oppId} />
    : a.customerName
      ? (
        <a onClick={() => drawer.open({ type: 'customer', id: a.customerName })} style={{ cursor: 'pointer' }}>
          <b>{a.customerName}</b> <span className="hint">(customer master)</span>
        </a>
      )
      : a.leadId
      ? (
        <a onClick={() => nav('/inbox/' + a.leadId)} style={{ cursor: 'pointer' }}>
          <b>{a.leadId}</b> <span className="hint">(AI lead)</span>
        </a>
      )
      : <span className="hint">No linked record</span>

  // Detail may embed commercial trigger values (GM%, discount, value) — gate it.
  const Detail = ({ a }) => (COMMERCIAL_RX.test(a.detail || '') && !comm)
    ? (
      <div className="restricted" style={{ fontSize: 12.5 }}>
        <Icon name="lock" size={11} /> Commercial exception — trigger values (GM% / discount / value) visible to LJS / AH only.
      </div>
    )
    : <div style={{ fontSize: 12.5 }}>{a.detail}</div>

  const RoleChips = ({ a }) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      {neededOf(a).map(r => {
        const d = (a.decisions || {})[r]?.d
        return <Chip key={r} tone={chipTone(d)}>{r} {d || 'pending'}</Chip>
      })}
    </div>
  )

  const QuickLinks = ({ a }) => (
    <div className="approval-links">
      {a.oppId && <>
        <button onClick={() => drawer.open({ type: 'opp', id: a.oppId })}><Icon name="eye" size={12} /> Preview opportunity</button>
        <button className="primary" title="Open this opportunity's Approvals tab" onClick={() => nav('/opp/' + a.oppId + '/approvals')}><Icon name="arrowRight" size={12} /> Open approval workspace</button>
      </>}
      {a.leadId && <button className="primary" onClick={() => nav('/inbox/' + a.leadId)}><Icon name="inbox" size={12} /> Open workspace</button>}
      {a.customerName && <button onClick={() => drawer.open({ type: 'customer', id: a.customerName })}><Icon name="users" size={12} /> Open customer</button>}
    </div>
  )

  const matches = a => {
    const hay = [a.id, a.type, a.detail, a.oppId, a.customerName, a.leadId, a.requestedBy].join(' ').toLowerCase()
    return (!q || hay.includes(q.toLowerCase())) && (!statusF || a.status === statusF) && (!typeF || a.type === typeF)
  }
  const typeOptions = [...new Set(store.approvals.map(a => a.type).filter(Boolean))].sort()
  const clearFilters = () => { setQ(''); setStatusF(''); setTypeF('') }
  const hasFilters = Boolean(q || statusF || typeF)
  const FilterBar = () => (
    <div className="approval-filters" role="search">
      <label className="approval-search">
        <Icon name="search" size={14} />
        <input aria-label="Search approvals" placeholder="Search by request, opportunity, customer or type" value={q} onChange={e => setQ(e.target.value)} />
      </label>
      <select aria-label="Filter by status" value={statusF} onChange={e => setStatusF(e.target.value)}><option value="">All statuses</option>{['Pending', 'Approved', 'Approved with conditions', 'Returned', 'Rejected'].map(s => <option key={s}>{s}</option>)}</select>
      <select aria-label="Filter by type" value={typeF} onChange={e => setTypeF(e.target.value)}><option value="">All types</option>{typeOptions.map(t => <option key={t}>{t}</option>)}</select>
      {hasFilters && <button type="button" className="approval-clear" onClick={clearFilters}>Clear filters</button>}
    </div>
  )

  // ---- Salespeople: read-only view of their own requests ------------------
  if (!approverView) {
    const mine = store.approvals.filter(a => a.requestedBy === role && matches(a)).sort(byTsDesc)
    return (
      <div className="page approvals-page">
        <div className="approval-head"><div><div className="approval-eyebrow">REQUEST TRACKING</div><h2><Icon name="checkCircle" size={18} /> My approval requests</h2><p className="hint">Track decisions and approvers for requests raised by you.</p></div></div>
        <div className="approval-summary approval-summary-three"><div className="approval-summary-card summary-pending"><b>{store.approvals.filter(a => a.requestedBy === role && a.status === 'Pending').length}</b><span>Pending</span></div><div className="approval-summary-card summary-approved"><b>{store.approvals.filter(a => a.requestedBy === role && a.status === 'Approved').length}</b><span>Approved</span></div><div className="approval-summary-card summary-rejected"><b>{store.approvals.filter(a => a.requestedBy === role && a.status === 'Rejected').length}</b><span>Rejected</span></div></div>
        <FilterBar />
        <div className="approval-notice approval-notice-info">
          <Icon name="info" size={14} /> Approvals are decided by LJS / AH. Your requests remain visible here until resolved.
        </div>
        <div className="approval-list">{mine.map(a => <div key={a.id} className={cardClass(a)}><div className="approval-card-top"><b>{a.id}</b><span className={`pill ${pillFor(a.status)}`}>{a.status}</span><NewMarker a={a} /><span className="approval-type">{a.type}</span><span className="hint">requested {stamp(a.ts)}</span></div><div className="approval-ref"><RefLink a={a} /></div><Detail a={a} /><div className="approval-meta"><div><span>Approvers</span><RoleChips a={a} /></div><div><span>Decision note</span><p>{COMMERCIAL_RX.test(a.decisionNote || '') && !comm ? 'Restricted' : (a.decisionNote || 'No decision yet')}</p></div></div><QuickLinks a={a} /></div>)}</div>
        {!mine.length && <p className="hint">No approval requests yet — raise one from the proposal workbench when a deviation needs clearance.</p>}
      </div>
    )
  }

  // ---- Approver / admin workbench ----------------------------------------
  const pending = store.approvals.filter(a => a.status === 'Pending' && matches(a)).sort(byTsDesc)
  const myTurn = a => canDecide(a) && !(a.decisions || {})[role]
  const forMe = pending.filter(myTurn)
  const others = pending.filter(a => !myTurn(a))
  const condOpen = store.approvals
    .filter(a => a.status === 'Approved with conditions' && matches(a) && (a.conditions || []).some(c => !c.incorporated))
    .sort(byTsDesc)
  const decided = store.approvals
    .filter(a => a.status !== 'Pending' && matches(a))
    .sort((a, b) => (b.decisionTs || '').localeCompare(a.decisionTs || ''))

  const PendingCard = ({ a }) => {
    const remaining = neededOf(a).filter(r => !(a.decisions || {})[r])
    const myDecision = (a.decisions || {})[role]
    return (
      <div className={cardClass(a, 'form-card approval-pending-card')}>
        <div className="approval-card-top">
          <b>{a.id}</b>
          <span className="pill Blue">Pending</span>
          <NewMarker a={a} />
          <span className="approval-type">{a.type}</span>
          <span className="hint">requested by {a.requestedBy} · {stamp(a.ts)}</span>
        </div>
        <div className="approval-ref"><RefLink a={a} /></div>
        <Detail a={a} />
        <div className="approval-approvers"><span>Approvers</span><RoleChips a={a} /></div>
        <QuickLinks a={a} />
        {myTurn(a)
          ? <DecisionForm a={a} role={role} onDecide={dec => store.recordDecision(a.id, dec)} />
          : myDecision
            ? (
              <div className="approval-awaiting hint">
                You decided <b>{myDecision.d}</b> — "{myDecision.c}" · waiting on {remaining.join(' + ') || 'no one'}
              </div>
            )
            : (
              <div className="approval-awaiting hint">
                Awaiting {remaining.map(r => ROLES[r]?.label || r).join(' + ')}
              </div>
            )}
      </div>
    )
  }

  return (
    <div className="page approvals-page">
      <div className="approval-head"><div><div className="approval-eyebrow">DECISION WORKSPACE</div><h2><Icon name="checkCircle" size={18} /> Approvals — {ROLES[role]?.label || role}</h2><p className="hint">Resolve requests, inspect linked records, and keep the pipeline moving.</p></div></div>
      <div className="approval-summary"><div className="approval-summary-card summary-pending"><b>{forMe.length}</b><span>Needs your decision</span></div><div className="approval-summary-card summary-waiting"><b>{others.length}</b><span>Awaiting others</span></div><div className="approval-summary-card summary-conditions"><b>{condOpen.length}</b><span>Open conditions</span></div><div className="approval-summary-card summary-decided"><b>{decided.length}</b><span>Decided</span></div></div>
      <FilterBar />
      <div className="approval-explainer"><span className="hint">
          Commercial deviations and credit-term clearances routed to LJS / AH. Joint gates resolve once every
          named approver has decided. "Approved with conditions" blocks proposal submission until every
          condition is confirmed incorporated.
        </span></div>

      <div className="approval-section-heading approval-section-primary"><div><span className="approval-section-kicker">ACTION REQUIRED</span><h3>Needs your decision <span>{forMe.length}</span></h3></div><span className="hint">Review and record a decision</span></div>
      {forMe.map(a => <PendingCard key={a.id} a={a} />)}
      {!forMe.length && <p className="hint">Nothing pending for you — all clear.</p>}

      {others.length > 0 && (
        <>
          <div className="approval-section-heading"><div><span className="approval-section-kicker">IN PROGRESS</span><h3>Awaiting other approvers <span>{others.length}</span></h3></div></div>
          {others.map(a => <PendingCard key={a.id} a={a} />)}
        </>
      )}

      <div className="approval-section-heading"><div><span className="approval-section-kicker">FOLLOW-UP</span><h3>Conditions awaiting incorporation <span>{condOpen.length}</span></h3></div></div>
      {condOpen.map(a => (
        <div key={a.id} className="form-card approval-card" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <b>{a.id}</b>
            <span className="pill Amber">Approved with conditions</span>
            <span className="hint" style={{ marginLeft: 'auto' }}>decided {stamp(a.decisionTs)}</span>
          </div>
          <div style={{ margin: '6px 0' }}><RefLink a={a} /></div>
          {(a.conditions || []).map((c, i) => (
            <div key={i} style={{ fontSize: 12.5, margin: '4px 0' }}>
              {c.incorporated
                ? <span style={{ color: '#15803d' }}><Icon name="check" size={12} /> {c.text}{c.note && <span className="hint"> — {c.note}</span>}</span>
                : <span><Icon name="alert" size={12} /> {c.text}</span>}
            </div>
          ))}
          <div className="hint" style={{ marginTop: 6 }}>The salesperson confirms this in the proposal workbench.</div>
          {a.oppId && (
            <button style={{ marginTop: 6 }} onClick={() => nav('/proposal/' + a.oppId)}>
              <Icon name="fileText" size={13} /> Open workspace
            </button>
          )}
          <QuickLinks a={a} />
        </div>
      ))}
      {!condOpen.length && <p className="hint">No open conditions — everything decided is fully incorporated.</p>}

      <div className="approval-section-heading"><div><span className="approval-section-kicker">HISTORY</span><h3>Decided <span>{decided.length}</span></h3></div></div>
      {decided.map(a => (
        <div key={a.id} className="form-card approval-card" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <b>{a.id}</b>
            <span className={`pill ${pillFor(a.status)}`}>{a.status}</span>
            <span style={{ fontSize: 12.5 }}>{a.type}</span>
            <span className="hint" style={{ marginLeft: 'auto' }}>decided {stamp(a.decisionTs)}</span>
          </div>
          <div style={{ margin: '6px 0' }}><RefLink a={a} /></div>
          <RoleChips a={a} />
          {Object.entries(a.decisions || {}).map(([r, dd]) => (
            <div key={r} style={{ fontSize: 12.5, margin: '4px 0' }}>
              <b>{r}</b>: {dd.d}{dd.c && <span> — "{dd.c}"</span>} <span className="hint">· {stamp(dd.when)}</span>
            </div>
          ))}
          {!Object.keys(a.decisions || {}).length && a.decisionNote && (
            <div style={{ fontSize: 12.5, margin: '4px 0' }}>{a.decisionNote}</div>
          )}
          <QuickLinks a={a} />
        </div>
      ))}
      {!decided.length && <p className="hint">No decisions yet.</p>}
    </div>
  )
}
