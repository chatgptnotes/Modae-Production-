import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ROLES } from '../seed.js'
import { isAdminRole, ddMmmYY } from '../utils.js'
import { useDrawer } from '../drawer.jsx'
import { Icon } from '../icons.jsx'

const APPROVERS = ['LJS', 'AH']
// Approval ts/decisionTs are full ISO stamps; ddMmmYY wants YYYY-MM-DD.
const day = ts => ddMmmYY((ts || '').slice(0, 10))
const pillFor = s =>
  s === 'Approved' ? 'Green' : s === 'Rejected' ? 'Red' : s === 'Approved with conditions' ? 'Amber' : 'Blue'
const byTsDesc = (a, b) => (b.ts || '').localeCompare(a.ts || '')

export default function Approvals() {
  const store = useStore()
  const nav = useNavigate()
  const drawer = useDrawer()
  const role = store.role
  const admin = isAdminRole(role)
  const isApprover = APPROVERS.includes(role)

  const oppName = id => (store.opportunities.find(o => o.id === id) || {}).oppName || ''
  const OppLink = ({ id }) => (
    <a onClick={() => drawer.open({ type: 'opp', id })} style={{ cursor: 'pointer' }}>
      <b>{id}</b>{oppName(id) && <span> — {oppName(id)}</span>}
    </a>
  )

  // ---- Salespeople: read-only view of their own requests ------------------
  if (!admin && !isApprover) {
    const mine = store.approvals.filter(a => a.requestedBy === role).sort(byTsDesc)
    return (
      <div className="page">
        <h2>Approvals — my requests ({mine.length})</h2>
        <div className="restricted" style={{ maxWidth: 640, marginBottom: 12 }}>
          Approvals are decided by LJS / AH
        </div>
        <div className="sheet-wrap" style={{ maxWidth: 980 }}>
          <table className="sheet">
            <thead><tr><th>ID</th><th>Opportunity</th><th>Type</th><th>Detail</th><th>Status</th><th>Requested</th><th>Decision note</th></tr></thead>
            <tbody>
              {mine.map(a => (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td><OppLink id={a.oppId} /></td>
                  <td>{a.type}</td>
                  <td>{a.detail}</td>
                  <td><span className={`pill ${pillFor(a.status)}`}>{a.status}</span></td>
                  <td>{day(a.ts)}</td>
                  <td>{a.decisionNote}</td>
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
  const forMe = pending.filter(a => admin || a.approver === role)
  const others = admin ? [] : pending.filter(a => a.approver !== role)
  const condOpen = store.approvals
    .filter(a => a.status === 'Approved with conditions' && (a.conditions || []).some(c => !c.incorporated))
    .sort(byTsDesc)
  const decided = store.approvals
    .filter(a => a.status !== 'Pending')
    .sort((a, b) => (b.decisionTs || '').localeCompare(a.decisionTs || ''))

  const approve = id => {
    const note = prompt('Decision note (optional)')
    if (note === null) return // Cancel aborts; empty note approves without one
    store.decideApproval(id, { status: 'Approved', decisionNote: note || '' })
  }
  const approveCond = id => {
    const text = prompt('Condition the salesperson must incorporate (e.g. 100% advance payment)')
    if (text && text.trim()) store.decideApproval(id, { status: 'Approved with conditions', conditions: [text.trim()], decisionNote: '' })
  }
  const reject = id => {
    const reason = prompt('Rejection reason')
    if (reason && reason.trim()) store.decideApproval(id, { status: 'Rejected', decisionNote: reason.trim() })
  }

  const PendingCard = ({ a, readOnly }) => (
    <div className="form-card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <b>{a.id}</b>
        <span className="pill Blue">Pending</span>
        <span style={{ fontSize: 12.5 }}>{a.type}</span>
        <span className="hint" style={{ marginLeft: 'auto' }}>requested by {a.requestedBy} · {day(a.ts)}</span>
      </div>
      <div style={{ margin: '6px 0' }}><OppLink id={a.oppId} /></div>
      <div style={{ fontSize: 12.5 }}>{a.detail}</div>
      {readOnly
        ? <div className="hint" style={{ marginTop: 8 }}>Awaiting {ROLES[a.approver]?.label || a.approver}</div>
        : (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="primary" onClick={() => approve(a.id)}><Icon name="check" size={13} /> Approve</button>
            <button onClick={() => approveCond(a.id)}>Approve with conditions</button>
            <button onClick={() => reject(a.id)}><Icon name="x" size={13} /> Reject</button>
          </div>
        )}
    </div>
  )

  return (
    <div className="page">
      <h2>Approvals — {ROLES[role]?.label || role}</h2>
      <div className="toolbar">
        <span className="hint">
          Commercial deviations and credit-term clearances routed to LJS / AH. "Approved with conditions"
          blocks proposal submission until every condition is confirmed incorporated.
        </span>
        <span className="spacer" />
      </div>

      <div className="section-title">Pending — for you ({forMe.length})</div>
      {forMe.map(a => <PendingCard key={a.id} a={a} />)}
      {!forMe.length && <p className="hint">Nothing pending for you — all clear.</p>}

      {others.length > 0 && (
        <>
          <div className="section-title">Pending — other approvers ({others.length})</div>
          {others.map(a => <PendingCard key={a.id} a={a} readOnly />)}
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
          <div style={{ margin: '6px 0' }}><OppLink id={a.oppId} /></div>
          {(a.conditions || []).map((c, i) => (
            <div key={i} style={{ fontSize: 12.5, margin: '4px 0' }}>
              {c.incorporated
                ? <span style={{ color: '#1e7145' }}>✓ {c.text}{c.note && <span className="hint"> — {c.note}</span>}</span>
                : <span><Icon name="alert" size={12} /> {c.text}</span>}
            </div>
          ))}
          <div className="hint" style={{ marginTop: 6 }}>The salesperson confirms this in the proposal workbench.</div>
          <button style={{ marginTop: 6 }} onClick={() => nav('/proposal/' + a.oppId)}>
            <Icon name="fileText" size={13} /> Open proposal workbench
          </button>
        </div>
      ))}
      {!condOpen.length && <p className="hint">No open conditions — everything decided is fully incorporated.</p>}

      <div className="section-title">Decided ({decided.length})</div>
      <div className="sheet-wrap" style={{ maxWidth: 980 }}>
        <table className="sheet">
          <thead><tr><th>ID</th><th>Opportunity</th><th>Type</th><th>Status</th><th>Decision note</th><th>Decided</th></tr></thead>
          <tbody>
            {decided.map(a => (
              <tr key={a.id}>
                <td>{a.id}</td>
                <td><OppLink id={a.oppId} /></td>
                <td>{a.type}</td>
                <td><span className={`pill ${pillFor(a.status)}`}>{a.status}</span></td>
                <td>{a.decisionNote}</td>
                <td>{day(a.decisionTs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!decided.length && <p className="hint">No decisions yet.</p>}
    </div>
  )
}
