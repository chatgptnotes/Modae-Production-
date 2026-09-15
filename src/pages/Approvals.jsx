import React, { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ROLES } from '../seed.js'
import { isApprover, canViewCommercial, ddMmmYY, displayRole, displayRoles, formatISTTime } from '../utils.js'
import { useDrawer } from '../drawer.jsx'
import { Icon } from '../icons.jsx'
import { AiBadge } from '../ui.jsx'
import { runTaskResult } from '../ai.js'
import { putFiles } from '../leadBlobs.js'

const NEW_APPROVAL_MS = 48 * 60 * 60 * 1000
// Approval ts/decisionTs are full ISO stamps; ddMmmYY wants YYYY-MM-DD.
const day = ts => ddMmmYY((ts || '').slice(0, 10))
const time = ts => {
  return formatISTTime(ts, { hour: '2-digit', hourCycle: 'h23' })
}
const stamp = ts => {
  const d = day(ts)
  const t = time(ts)
  return t ? `${d} at ${t}` : d
}
const shortDate = ts => {
  const d = new Date(ts || '')
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })
}
const waitingLabel = ts => {
  const started = Date.parse(ts || '')
  if (!Number.isFinite(started)) return 'Waiting'
  const days = Math.max(0, Math.floor((Date.now() - started) / 86400000))
  return days === 0 ? 'Waiting today' : `Waiting ${days} day${days === 1 ? '' : 's'}`
}
const approvalTitle = opp => String(opp?.oppName || 'Approval request')
  .replace(/\s*[–-]\s*/g, ' — ')
  .replace(/^Spare Parts RFQ/i, 'Spare parts RFQ')
  .replace(/Vibration Monitoring System/i, 'vibration monitoring system')
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
  'Returned': 'Send back',
  'Rejected': 'Reject',
}

// Condition completion is an incorporation confirmation, not a new approval
// decision. Keep it available on every approval surface, but only let the
// linked opportunity owner or original requester record it.
export function ConditionCompletion({ approval, index, condition, canComplete, onConfirm }) {
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [evidenceFile, setEvidenceFile] = useState(null)
  const [evidenceResult, setEvidenceResult] = useState(null)
  const [checking, setChecking] = useState(false)
  const fileRef = useRef(null)

  if (condition.incorporated) {
    return (
      <div className="approval-condition-complete">
        <span className="condition-complete-label"><Icon name="check" size={12} /> Incorporated</span>
        {condition.note && <span className="hint"> — {condition.note}</span>}
        {condition.evidence?.name && <span className="hint"> · Evidence: {condition.evidence.name}</span>}
        {condition.evidence?.assessment && <span className="approval-evidence-result">AI: {condition.evidence.assessment}</span>}
      </div>
    )
  }

  if (!canComplete) {
    return <div className="approval-condition-open"><Icon name="alert" size={12} /> Condition open</div>
  }

  const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const submit = async event => {
    event.preventDefault()
    if (!note.trim()) {
      setError('Add a note describing how this condition was incorporated.')
      return
    }
    setError('')
    onConfirm(approval.id, index, note.trim(), evidenceResult)
    setEvidenceFile(null)
    setEvidenceResult(null)
    setNote('')
  }

  const scanEvidence = async file => {
    setEvidenceFile(file)
    setEvidenceResult(null)
    setError('')
    setChecking(true)
    try {
      await putFiles(`approval:${approval.id}`, [file])
      const result = await runTaskResult('approval.condition-evidence', {
        approvalId: approval.id,
        conditionText: condition.text,
        incorporationNote: note.trim(),
        aiAttachments: [{ name: file.name, mimeType: file.type || 'application/octet-stream', dataBase64: await toBase64(file) }],
      })
      setEvidenceResult({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        checkedAt: new Date().toISOString(),
        assessment: result.data?.data?.assessment || result.data?.assessment || '',
        confidence: result.data?.data?.confidence ?? result.data?.confidence ?? null,
        evidence: result.data?.data?.evidence || result.data?.evidence || '',
        concerns: result.data?.data?.concerns || result.data?.concerns || '',
        aiError: result.error || '',
      })
    } catch (e) {
      setEvidenceResult({ name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, aiError: e?.message || 'Evidence could not be scanned' })
    } finally {
      setChecking(false)
    }
  }

  return (
    <form className="approval-condition-action" onSubmit={submit}>
      <div className="approval-condition-open"><Icon name="alert" size={12} /> Condition open</div>
      <div className="approval-condition-controls">
        <input
          aria-label="Condition completion note"
          placeholder="How was it incorporated?"
          value={note}
          onChange={event => { setNote(event.target.value); setError('') }}
        />
        <input ref={fileRef} type="file" className="approval-evidence-input" onChange={event => {
          const file = event.target.files?.[0]
          if (file && file.size > 5 * 1024 * 1024) { setError('Evidence file must be 5 MB or smaller.'); return }
          if (!file) return
          scanEvidence(file)
        }} />
        <button type="button" onClick={() => fileRef.current?.click()}><Icon name="upload" size={13} /> {evidenceFile ? evidenceFile.name : 'Add file'}</button>
        {evidenceFile && !checking && <button type="button" onClick={() => { setEvidenceFile(null); setEvidenceResult(null); setError(''); if (fileRef.current) fileRef.current.value = '' }}>Cancel upload</button>}
        <button className="primary" type="submit" disabled={checking}><Icon name="clipboardCheck" size={13} /> {checking ? 'Checking evidence...' : 'Complete condition'}</button>
      </div>
      {checking && <div className="hint approval-evidence-status">Scanning evidence…</div>}
      {!checking && evidenceResult?.assessment && <div className="approval-evidence-result">AI: {evidenceResult.assessment}{evidenceResult.confidence != null ? ` · ${evidenceResult.confidence}% confidence` : ''}</div>}
      {!checking && evidenceResult?.aiError && <div className="hint approval-evidence-status">AI scan unavailable — you can still complete the condition.</div>}
      {error && <div className="errbox approval-condition-error">{error}</div>}
    </form>
  )
}

// Inline decision form shown on a pending card when the acting role can decide.
function DecisionForm({ a, role, onDecide }) {
  const [d, setD] = useState('')
  const [comment, setComment] = useState('')
  const [conds, setConds] = useState('')
  const [err, setErr] = useState('')

  const submit = e => {
    e.preventDefault()
    if (!d) { setErr('Choose a decision before continuing.'); return }
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
      <div className="approval-decision-title">Record your decision</div>
      <div className="approval-decision-options">
        {DECISIONS.map(v => (
          <label key={v}>
            <input type="radio" name={`dec-${a.id}`} checked={d === v} onChange={() => setD(v)} />
            {DECISION_LABELS[v]}
          </label>
        ))}
      </div>
      {d && <textarea
          rows={2} value={comment} onChange={e => setComment(e.target.value)}
          placeholder="Decision note (required)"
          className="approval-decision-input"
        />}
      {d === 'Approved with conditions' && (
        <textarea
          rows={2} value={conds} onChange={e => setConds(e.target.value)}
          placeholder="Conditions the salesperson must incorporate — one condition per line"
          className="approval-decision-input"
        />
      )}
      {err && <div className="errbox approval-decision-error">{err}</div>}
      <div className="approval-decision-submit">
        <button className="primary" type="submit"><Icon name="clipboardCheck" size={13} /> Submit</button>
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
  const PricingRows = ({ rows = [] }) => (
    <div className="approval-pricing-rows">
      {rows.map((row, i) => <div className="approval-pricing-row" key={`${row.label}-${i}`}>
        <b>{row.label}</b>
        {row.discount > row.discountPct && <span>Discount {row.discount}% <small>(limit {row.discountPct}%)</small></span>}
        {row.markup > row.markupPct && <span>Markup {row.markup}% <small>(limit {row.markupPct}%)</small></span>}
      </div>)}
    </div>
  )
  const Detail = ({ a }) => {
    const hasContext = Boolean(a.oppId || a.opportunitySummary || a.blockingReason)
    const showStandaloneDetail = !hasContext || a.type !== 'Commercial deviation'
    return <>
      <OpportunityContext a={a} />
      {showStandaloneDetail && (a.type === 'Pricing threshold exception' && a.pricingRows?.length && comm
        ? <><div style={{ fontSize: 12.5 }}>{a.detail}</div><PricingRows rows={a.pricingRows} /></>
        : COMMERCIAL_RX.test(a.detail || '') && !comm
          ? <div className="restricted" style={{ fontSize: 12.5 }}><Icon name="lock" size={11} /> Commercial exception — trigger values (GM% / discount / value) visible to LJS / AH only.</div>
          : <div style={{ fontSize: 12.5 }}>{a.detail}</div>)}
    </>
  }

  const OpportunityContext = ({ a }) => {
    if (!a.oppId && !a.opportunitySummary && !a.blockingReason) return null
    const opp = a.oppId ? store.opportunities.find(o => o.id === a.oppId) : null
    const snapshot = a.opportunitySnapshot || {}
    const summary = a.opportunitySummary || opp?.remarks || 'No opportunity summary was captured.'
    const isCommercialRequest = a.type === 'Commercial deviation'
    const reason = !comm && isCommercialRequest
      ? 'Commercial deviation approval is required before submission.'
      : (a.blockingReason || a.detail || 'Approval is required before the workflow can continue.')
    const deviations = comm ? (a.deviationDetails || []) : []
    return (
      <div className="approval-opportunity-context">
        <div className="approval-context-head">
          <span className="approval-context-label">Opportunity summary</span>
          {a.summarySource === 'ai' && <AiBadge label="AI summary" />}
        </div>
        <p className="approval-context-summary">{summary}</p>
        <div className="approval-context-facts">
          <span><b>Customer</b>{snapshot.customer || opp?.sellTo || 'Not recorded'}</span>
          <span><b>Route</b>{snapshot.route || opp?.route || 'Not recorded'}</span>
          <span><b>Milestone</b>{snapshot.milestone || opp?.milestone || opp?.stage || 'Not recorded'}</span>
          {(snapshot.product || opp?.product) && <span><b>BOQ</b>{snapshot.product || (Array.isArray(opp.product) ? opp.product.join(', ') : opp.product)}</span>}
          {comm && snapshot.valueK != null && <span><b>Value</b>₹{snapshot.valueK}K</span>}
        </div>
        <div className="approval-context-reason"><b>What you're approving</b><span>{reason}</span></div>
        {deviations.length > 0 && (
          <div className="approval-context-deviations">
            <div className="approval-context-deviation-head"><span></span><b>Customer asked</b><b>ModAE standard</b></div>
            {deviations.map((d, i) => <div key={`${d.term}-${i}`}><b>{d.term}</b><span>{d.customerAsk}</span><span>{d.ourResponse}</span></div>)}
          </div>
        )}
      </div>
    )
  }

  const canCompleteCondition = a => {
    const opp = a.oppId ? store.opportunities.find(o => o.id === a.oppId) : null
    return role === a.requestedBy || role === opp?.owner
  }

  // On an `anyOf` gate the named roles are alternatives, not a quorum. Joint
  // gates deliberately omit this marker and display both outstanding roles.
  const RoleChips = ({ a }) => {
    const needed = neededOf(a)
    const others = needed.filter(r => r !== role)
    const approved = others.filter(r => (a.decisions || {})[r]?.d === 'Approved')
    if (needed.includes(role)) {
      return <div className="approval-approver-summary">
        {others.length === 0
          ? 'You are the only approver'
          : `You + ${others.length} other${others.length === 1 ? '' : 's'}${approved.length ? ` — ${displayRoles(approved)} approved` : ` — awaiting ${displayRoles(others)}`}`}
      </div>
    }
    return <div className="approval-approver-summary">Approval chain — {displayRoles(needed)}</div>
  }

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
          <Icon name="info" size={14} /> Approvals are decided by LJS / AH, and technical approvals by LJS or AN. Your requests remain visible here until resolved.
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
  const oldestForMe = [...forMe].sort((a, b) => (a.ts || '').localeCompare(b.ts || ''))[0]

  const PendingCard = ({ a }) => {
    const remaining = neededOf(a).filter(r => !(a.decisions || {})[r])
    const myDecision = (a.decisions || {})[role]
    const opp = store.opportunities.find(o => o.id === a.oppId)
    return (
      <div className={cardClass(a, 'form-card approval-pending-card')}>
        <div className="approval-card-top approval-card-top-redesigned">
          <div className="approval-card-identity">
            <b>{approvalTitle(opp)}</b>
            <span>{opp?.sellTo || a.customerName || 'Customer not recorded'} · {opp?.valueK != null ? `₹${opp.valueK}K` : 'Value not recorded'} · {a.id}</span>
          </div>
          <div className="approval-card-status">
            <NewMarker a={a} />
            <span className="approval-wait-chip">{waitingLabel(a.ts)}</span>
            <span className="hint">raised by {displayRole(a.requestedBy)} on {shortDate(a.ts)}</span>
          </div>
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
                You decided <b>{myDecision.d}</b> — "{myDecision.c}" · waiting on {displayRoles(remaining) || 'no one'}
              </div>
            )
            : (
              <div className="approval-awaiting hint">
                Awaiting {displayRoles(remaining)}
              </div>
            )}
      </div>
    )
  }

  return (
    <div className="page approvals-page">
      <div className="approval-head"><div><div className="approval-eyebrow">DECISION WORKSPACE</div><h2><Icon name="checkCircle" size={18} /> Approvals — {displayRole(role)}</h2><p className="hint">Resolve requests, inspect linked records, and keep the pipeline moving.</p></div></div>
      <div className="approval-summary"><div className="approval-summary-card summary-pending"><b>{forMe.length}</b><span>Needs your decision</span></div><div className="approval-summary-card summary-waiting"><b>{others.length}</b><span>Awaiting others</span></div><div className="approval-summary-card summary-conditions"><b>{condOpen.length}</b><span>Open conditions</span></div><div className="approval-summary-card summary-decided"><b>{decided.length}</b><span>Approved requests</span></div></div>
      <FilterBar />
      <div className="approval-explainer"><span className="hint">
          Commercial deviations and credit-term clearances routed to LJS / AH. Joint gates resolve once every
          named approver has decided. "Approved with conditions" blocks proposal submission until every
          condition is confirmed incorporated.
        </span></div>

      <div className="approval-section-heading approval-section-primary">
        <div>
          <h3>{forMe.length} approvals waiting on you</h3>
          <p className="approval-section-subtitle">{oldestForMe ? `Oldest has been waiting since ${shortDate(oldestForMe.ts)}. Review each one and record a decision.` : 'Nothing is waiting on you right now.'}</p>
        </div>
      </div>
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
            <span className="hint" style={{ marginLeft: 'auto' }}>Approved {stamp(a.decisionTs)}</span>
          </div>
           <div style={{ margin: '6px 0' }}><RefLink a={a} /></div>
           <OpportunityContext a={a} />
          {(a.conditions || []).map((c, i) => (
            <div key={i} className="approval-condition-row">
              <div className="approval-condition-text">{c.text}</div>
              <ConditionCompletion
                approval={a}
                index={i}
                condition={c}
                canComplete={canCompleteCondition(a)}
                onConfirm={store.confirmCondition}
              />
            </div>
          ))}
          {!canCompleteCondition(a) && <div className="hint" style={{ marginTop: 6 }}>The opportunity owner confirms incorporation of this condition.</div>}
          {a.oppId && (
            <button style={{ marginTop: 6 }} onClick={() => nav('/proposal/' + a.oppId)}>
              <Icon name="fileText" size={13} /> Open workspace
            </button>
          )}
          <QuickLinks a={a} />
        </div>
      ))}
      {!condOpen.length && <p className="hint">No open conditions — everything decided is fully incorporated.</p>}

      <div className="approval-section-heading"><div><span className="approval-section-kicker">HISTORY</span><h3>Approved requests <span>{decided.length}</span></h3></div></div>
      {decided.map(a => (
        <div key={a.id} className="form-card approval-card" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <b>{a.id}</b>
            <span className={`pill ${pillFor(a.status)}`}>{a.status}</span>
            <span style={{ fontSize: 12.5 }}>{a.type}</span>
            <span className="hint" style={{ marginLeft: 'auto' }}>Approved {stamp(a.decisionTs)}</span>
          </div>
           <div style={{ margin: '6px 0' }}><RefLink a={a} /></div>
           <OpportunityContext a={a} />
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
