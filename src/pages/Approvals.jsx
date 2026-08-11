import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ROLES } from '../seed.js'
import { isApprover, canViewCommercial, ddMmmYY } from '../utils.js'
import { useDrawer } from '../drawer.jsx'
import { Icon } from '../icons.jsx'
import { Chip } from '../ui.jsx'

// Approval ts/decisionTs are full ISO stamps; ddMmmYY wants YYYY-MM-DD.
const day = ts => ddMmmYY((ts || '').slice(0, 10))
const pillFor = s =>
  s === 'Approved' ? 'Green'
    : s === 'Rejected' ? 'Red'
    : s === 'Approved with conditions' || s === 'Returned' ? 'Amber'
    : 'Blue'
const byTsDesc = (a, b) => (b.ts || '').localeCompare(a.ts || '')
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
    <form onSubmit={submit} style={{ marginTop: 10, borderTop: '1px solid #e3e3e3', paddingTop: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
        Your decision as {ROLES[role]?.label || role}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {DECISIONS.map(v => (
          <label key={v} style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input type="radio" name={`dec-${a.id}`} checked={d === v} onChange={() => setD(v)} />
            {DECISION_LABELS[v]}
          </label>
        ))}
      </div>
      <textarea
        rows={2} value={comment} onChange={e => setComment(e.target.value)}
        placeholder="Decision note (required)"
        style={{ width: '100%', maxWidth: 560, marginTop: 6 }}
      />
      {d === 'Approved with conditions' && (
        <textarea
          rows={2} value={conds} onChange={e => setConds(e.target.value)}
          placeholder="Conditions the salesperson must incorporate — one condition per line"
          style={{ width: '100%', maxWidth: 560, marginTop: 6 }}
        />
      )}
      {err && <div className="errbox" style={{ marginTop: 6 }}>{err}</div>}
      <div style={{ marginTop: 8 }}>
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

  // ---- Salespeople: read-only view of their own requests ------------------
  if (!approverView) {
    const mine = store.approvals.filter(a => a.requestedBy === role).sort(byTsDesc)
    return (
      <div className="page">
        <h2>Approvals — my requests ({mine.length})</h2>
        <div className="restricted" style={{ maxWidth: 640, marginBottom: 12 }}>
          Approvals are decided by LJS / AH
        </div>
        <div className="sheet-wrap" style={{ maxWidth: 980 }}>
          <table className="sheet">
            <thead><tr><th>ID</th><th>Opportunity</th><th>Type</th><th>Detail</th><th>Approvers</th><th>Status</th><th>Requested</th><th>Decision note</th></tr></thead>
            <tbody>
              {mine.map(a => (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td><RefLink a={a} /></td>
                  <td>{a.type}</td>
                  <td><Detail a={a} /></td>
                  <td>
                    {neededOf(a).map(r => {
                      const d = (a.decisions || {})[r]?.d
                      return <Chip key={r} tone={chipTone(d)}>{r} {d || 'pending'}</Chip>
                    })}
                  </td>
                  <td><span className={`pill ${pillFor(a.status)}`}>{a.status}</span></td>
                  <td>{day(a.ts)}</td>
                  <td>{COMMERCIAL_RX.test(a.decisionNote || '') && !comm
                    ? <span className="restricted"><Icon name="lock" size={11} /> restricted</span>
                    : a.decisionNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!mine.length && <p className="hint">No approval requests yet — raise one from the proposal workbench when a deviation needs clearance.</p>}
      </div>
    )
  }

  // ---- Approver / admin workbench ----------------------------------------
  const pending = store.approvals.filter(a => a.status === 'Pending').sort(byTsDesc)
  const myTurn = a => canDecide(a) && !(a.decisions || {})[role]
  const forMe = pending.filter(myTurn)
  const others = pending.filter(a => !myTurn(a))
  const condOpen = store.approvals
    .filter(a => a.status === 'Approved with conditions' && (a.conditions || []).some(c => !c.incorporated))
    .sort(byTsDesc)
  const decided = store.approvals
    .filter(a => a.status !== 'Pending')
    .sort((a, b) => (b.decisionTs || '').localeCompare(a.decisionTs || ''))

  const PendingCard = ({ a }) => {
    const remaining = neededOf(a).filter(r => !(a.decisions || {})[r])
    const myDecision = (a.decisions || {})[role]
    return (
      <div className="form-card" style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <b>{a.id}</b>
          <span className="pill Blue">Pending</span>
          <span style={{ fontSize: 12.5 }}>{a.type}</span>
          <span className="hint" style={{ marginLeft: 'auto' }}>requested by {a.requestedBy} · {day(a.ts)}</span>
        </div>
        <div style={{ margin: '6px 0' }}><RefLink a={a} /></div>
        <Detail a={a} />
        <RoleChips a={a} />
        {myTurn(a)
          ? <DecisionForm a={a} role={role} onDecide={dec => store.recordDecision(a.id, dec)} />
          : myDecision
            ? (
              <div className="hint" style={{ marginTop: 8 }}>
                You decided <b>{myDecision.d}</b> — "{myDecision.c}" · waiting on {remaining.join(' + ') || 'no one'}
              </div>
            )
            : (
              <div className="hint" style={{ marginTop: 8 }}>
                Awaiting {remaining.map(r => ROLES[r]?.label || r).join(' + ')}
              </div>
            )}
      </div>
    )
  }

  return (
    <div className="page">
      <h2>Approvals — {ROLES[role]?.label || role}</h2>
      <div className="toolbar">
        <span className="hint">
          Commercial deviations and credit-term clearances routed to LJS / AH. Joint gates resolve once every
          named approver has decided. "Approved with conditions" blocks proposal submission until every
          condition is confirmed incorporated.
        </span>
        <span className="spacer" />
      </div>

      <div className="section-title">Pending — your decision ({forMe.length})</div>
      {forMe.map(a => <PendingCard key={a.id} a={a} />)}
      {!forMe.length && <p className="hint">Nothing pending for you — all clear.</p>}

      {others.length > 0 && (
        <>
          <div className="section-title">Pending — awaiting other approvers ({others.length})</div>
          {others.map(a => <PendingCard key={a.id} a={a} />)}
        </>
      )}

      <div className="section-title">Conditions awaiting incorporation ({condOpen.length})</div>
      {condOpen.map(a => (
        <div key={a.id} className="form-card" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <b>{a.id}</b>
            <span className="pill Amber">Approved with conditions</span>
            <span className="hint" style={{ marginLeft: 'auto' }}>decided {day(a.decisionTs)}</span>
          </div>
          <div style={{ margin: '6px 0' }}><RefLink a={a} /></div>
          {(a.conditions || []).map((c, i) => (
            <div key={i} style={{ fontSize: 12.5, margin: '4px 0' }}>
              {c.incorporated
                ? <span style={{ color: '#1e7145' }}><Icon name="check" size={12} /> {c.text}{c.note && <span className="hint"> — {c.note}</span>}</span>
                : <span><Icon name="alert" size={12} /> {c.text}</span>}
            </div>
          ))}
          <div className="hint" style={{ marginTop: 6 }}>The salesperson confirms this in the proposal workbench.</div>
          {a.oppId && (
            <button style={{ marginTop: 6 }} onClick={() => nav('/proposal/' + a.oppId)}>
              <Icon name="fileText" size={13} /> Open proposal workbench
            </button>
          )}
        </div>
      ))}
      {!condOpen.length && <p className="hint">No open conditions — everything decided is fully incorporated.</p>}

      <div className="section-title">Decided ({decided.length})</div>
      {decided.map(a => (
        <div key={a.id} className="form-card" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <b>{a.id}</b>
            <span className={`pill ${pillFor(a.status)}`}>{a.status}</span>
            <span style={{ fontSize: 12.5 }}>{a.type}</span>
            <span className="hint" style={{ marginLeft: 'auto' }}>decided {day(a.decisionTs)}</span>
          </div>
          <div style={{ margin: '6px 0' }}><RefLink a={a} /></div>
          <RoleChips a={a} />
          {Object.entries(a.decisions || {}).map(([r, dd]) => (
            <div key={r} style={{ fontSize: 12.5, margin: '4px 0' }}>
              <b>{r}</b>: {dd.d}{dd.c && <span> — "{dd.c}"</span>} <span className="hint">· {day(dd.when)}</span>
            </div>
          ))}
          {!Object.keys(a.decisions || {}).length && a.decisionNote && (
            <div style={{ fontSize: 12.5, margin: '4px 0' }}>{a.decisionNote}</div>
          )}
        </div>
      ))}
      {!decided.length && <p className="hint">No decisions yet.</p>}
    </div>
  )
}
