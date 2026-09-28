import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ROLES } from '../seed.js'
import { isApprover, canViewCommercial, ddMmmYY, displayRole, displayRoles, formatISTTime, fmt } from '../utils.js'
import { useDrawer } from '../drawer.jsx'
import { Icon } from '../icons.jsx'
import { AiBadge, Modal } from '../ui.jsx'
import { runTaskResult } from '../ai.js'
import { pricingThresholdExceptions } from '../gates.js'
import { buildPricing, normalizeProposal } from '../proposal/docProps.js'

const NEW_APPROVAL_MS = 48 * 60 * 60 * 1000
const APPROVAL_REFRESH_MS = 5000
// Approval ts/decisionTs are full ISO stamps; ddMmmYY wants YYYY-MM-DD.
const day = ts => ddMmmYY((ts || '').slice(0, 10))
const time = ts => {
  return formatISTTime(ts, { hour: '2-digit', hourCycle: 'h23' })
}
const stamp = ts => {
  const d = day(ts)
  const t = time(ts) || (ts ? new Date(ts).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }) : '')
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

// New decisions are intentionally limited to the two outcomes users need.
// Legacy records may still display their historical status in the audit view.
const DECISIONS = ['Approved', 'Rejected']
const DECISION_LABELS = {
  'Approved': 'Approve',
  'Rejected': 'Reject',
}

const conditionalCommentPattern = /\b(subject to|provided that|unless|only after|after (?:you|the)|once (?:you|the)|condition(?:al)?|before (?:approval|proceeding)|pending (?:receipt|confirmation|correction)|upon receipt)\b/i

const fallbackApprovalCommentReview = (decision, comment) => {
  const text = String(comment || '').trim()
  const conditional = conditionalCommentPattern.test(text)
  return {
    classification: conditional ? 'conditional' : 'clear',
    summary: text,
    requiredActions: decision === 'Rejected' ? [text] : [],
    confidence: 100,
    source: 'fallback',
  }
}

const normalizeApprovalCommentReview = (result, decision, comment) => {
  const fallback = fallbackApprovalCommentReview(decision, comment)
  const data = result?.data?.data || result?.data
  if (!data || result.error) return fallback
  const classification = ['clear', 'conditional', 'unclear'].includes(data.classification)
    ? data.classification : fallback.classification
  const actions = Array.isArray(data.requiredActions)
    ? data.requiredActions.map(item => String(item || '').trim()).filter(Boolean).slice(0, 8)
    : []
  return {
    classification,
    summary: String(data.summary || comment).trim(),
    requiredActions: decision === 'Rejected' ? (actions.length ? actions : [String(comment).trim()]) : actions,
    confidence: Number.isFinite(Number(data.confidence)) ? Number(data.confidence) : null,
    source: 'AI',
  }
}

function RejectionRequirements({ approval, pending = false }) {
  const actions = approval?.rejectionActions || approval?.previousRejection?.requiredActions || []
  if (approval?.status !== 'Rejected' && !pending) return null
  if (!actions.length) return null
  return (
    <div className="approval-rejection-requirements">
      <b>{pending ? 'Previous rejection — complete these changes before approval:' : 'Required before requesting approval again:'}</b>
      <ul>{actions.map((action, index) => <li key={`${action}-${index}`}>{action}</li>)}</ul>
    </div>
  )
}

function ApprovalBoqModal({ opp, proposal, store, onClose }) {
  const normalized = normalizeProposal(proposal || { oppId: opp.id }, opp)
  const pricing = buildPricing(store, normalized)
  const rows = normalized.bom || []
  const symbol = pricing.currencySymbol(normalized.sourceCurrency || 'INR')
  const totals = pricing.computeTotals(normalized)
  const totalMargin = totals.target - totals.cost

  return (
    <Modal title={`BOQ / COMMERCIAL REVIEW — ${opp.id}`} wide className="approval-boq-modal" onClose={onClose}>
      <div className="approval-boq-document-head">
        <div className="approval-boq-document-kicker">MATERIALS CONTROL // BILL OF QUANTITIES</div>
        <div className="approval-boq-document-id">{opp.id}</div>
      </div>
      <dl className="approval-boq-meta">
        <div><dt>Customer</dt><dd>{opp.sellTo || 'Not recorded'}</dd></div>
        <div><dt>Route</dt><dd>{opp.route || 'Not recorded'}</dd></div>
        <div><dt>Revision</dt><dd>{normalized.revision || '—'}</dd></div>
        <div><dt>Line count</dt><dd>{rows.length}</dd></div>
      </dl>
      <div className="approval-boq-table-wrap">
        <table className="approval-boq-table" aria-readonly="true">
          <caption>Read-only bill of quantities and commercial review for {opp.id}</caption>
          <colgroup>
            <col className="boq-col-index" /><col className="boq-col-description" /><col className="boq-col-part" />
            <col className="boq-col-qty" /><col className="boq-col-uom" /><col className="boq-col-unit" />
            <col className="boq-col-total" /><col className="boq-col-source" /><col className="boq-col-cogs" />
            <col className="boq-col-gm" /><col className="boq-col-price-source" />
          </colgroup>
          <thead>
            <tr className="approval-boq-group-row">
              <th colSpan={5}>Specification</th>
              <th colSpan={6}>Commercial review</th>
            </tr>
            <tr>
              <th scope="col" className="num">#</th>
              <th scope="col">Scope description</th>
              <th scope="col">Part / model</th>
              <th scope="col" className="num">Quantity</th>
              <th scope="col">UOM</th>
              <th scope="col" className="num">Unit price ({symbol})</th>
              <th scope="col" className="num">Total price (₹)</th>
              <th scope="col" className="num">Source price</th>
              <th scope="col" className="num">COGS (₹)</th>
              <th scope="col" className="num">GM (₹)</th>
              <th scope="col">Price source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((line, index) => {
              const qty = pricing.totalQty(line)
              const unitQuoted = pricing.lineQuoted(line)
              const totalQuoted = pricing.lineQuotedInr(line) * qty
              const cogs = pricing.lineCost(line) * qty
              const sourcePrice = pricing.linePrice(line)
              const sourceCurrency = pricing.lineCurrency(line)
              const source = pricing.lineSource(line)
              return (
                <tr key={`${line.pn || line.custRef || line.desc || 'line'}-${index}`}>
                  <td className="num">{index + 1}</td>
                  <td>{line.desc || line.itemCategory || '—'}</td>
                  <td>{line.pn || line.custRef || '—'}</td>
                  <td className="num">{qty || '—'}</td>
                  <td>{line.uom || 'EA'}</td>
                  <td className="num">{symbol} {fmt(unitQuoted, 2)}</td>
                  <td className="num">₹ {fmt(totalQuoted, 2)}</td>
                  <td className="num">{sourceCurrency} {fmt(sourcePrice, 2)}</td>
                  <td className="num">₹ {fmt(cogs, 2)}</td>
                  <td className="num">₹ {fmt(pricing.lineQuotedInr(line) * qty - cogs, 2)}</td>
                  <td>{source?.full || line.priceState || 'No pricing source'}</td>
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan={11} className="hint">No BOQ lines are available for this opportunity.</td></tr>}
          </tbody>
          {!!rows.length && <tfoot><tr>
            <td colSpan={6}><span className="approval-boq-total-label">Commercial totals</span></td>
            <td className="num">₹ {fmt(totals.target, 2)}</td>
            <td></td>
            <td className="num">₹ {fmt(totals.cost, 2)}</td>
            <td className="num">₹ {fmt(totalMargin, 2)}</td>
            <td></td>
          </tr></tfoot>}
        </table>
      </div>
      <div className="form-actions approval-boq-actions">
        <button type="button" className="approval-boq-close" onClick={onClose}>Close review</button>
      </div>
    </Modal>
  )
}

// Inline decision form shown on a pending card when the acting role can decide.
function DecisionForm({ a, role, draft = {}, onDraftChange, onDecide }) {
  const d = draft.d || ''
  const comment = draft.comment || ''
  const [err, setErr] = useState('')
  const [checking, setChecking] = useState(false)

  const submit = async e => {
    e.preventDefault()
    if (!d) { setErr('Choose a decision before continuing.'); return }
    if (!comment.trim()) { setErr('A note is required for every decision.'); return }
    setChecking(true)
    setErr('')
    const result = await runTaskResult('approval.comment-review', { decision: d, comment: comment.trim() })
    const review = normalizeApprovalCommentReview(result, d, comment.trim())
    if (d === 'Approved' && review.classification !== 'clear') {
      setChecking(false)
      setErr('This comment appears to contain a condition. Choose Reject and explain what must be corrected.')
      return
    }
    const saved = await onDecide({ d, comment: comment.trim(), commentReview: review })
    setChecking(false)
    if (!saved) setErr('Your decision could not be shared. Check your connection and try again.')
  }

  return (
    <form onSubmit={submit} className="approval-decision-form">
      <div className="approval-decision-title">Record your decision</div>
      <div className="approval-decision-options">
        {DECISIONS.map(v => (
          <label key={v}>
            <input type="radio" name={`dec-${a.id}`} checked={d === v} onChange={() => onDraftChange({ d: v })} />
            {DECISION_LABELS[v]}
          </label>
        ))}
      </div>
      {d && <textarea
          rows={1}
          onInput={e => {
            e.currentTarget.style.height = 'auto'
            e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`
          }}
          value={comment} onChange={e => onDraftChange({ comment: e.target.value })}
          placeholder="Decision note (required)"
          className="approval-decision-input"
        />}
      {err && <div className="errbox approval-decision-error">{err}</div>}
      <div className="approval-decision-submit">
        <button className="primary" type="submit" disabled={checking}><Icon name="clipboardCheck" size={13} /> {checking ? 'Checking comment…' : 'Submit'}</button>
      </div>
    </form>
  )
}

// Keep this component at module scope. Defining it inside Approvals creates a
// new component type on every parent render, which remounts the decision form
// and steals focus from the note textarea while the user is typing.
function PendingCard({
  a,
  role,
  store,
  myTurn,
  renderRef,
  renderDetail,
  renderRoleChips,
  renderQuickLinks,
  draft,
  onDraftChange,
  onDecide,
}) {
  const remaining = neededOf(a).filter(r => !(a.decisions || {})[r])
  const myDecision = (a.decisions || {})[role]
  const opp = store.opportunities.find(o => o.id === a.oppId)
  return (
    <div className={cardClass(a, 'form-card approval-pending-card')}>
      <div className="approval-card-top approval-card-top-redesigned">
        <div className="approval-card-identity">
          <b>{approvalTitle(opp)}</b>
          <span>{opp?.sellTo || a.customerName || 'Customer account not recorded'} · {opp?.valueK != null ? `₹${opp.valueK}K` : 'Proposal value not recorded'} · {a.id}</span>
        </div>
        <div className="approval-card-status">
          <NewMarker a={a} />
          <span className="approval-wait-chip">{waitingLabel(a.ts)}</span>
          <span className="hint">raised by {displayRole(a.requestedBy)} on {shortDate(a.ts)}</span>
        </div>
      </div>
      {renderRef(a)}
      {renderDetail(a)}
      <RejectionRequirements approval={a} pending />
      <div className="approval-approvers"><span>Approvers</span>{renderRoleChips(a)}</div>
      {renderQuickLinks(a)}
      {myTurn(a)
        ? <DecisionForm
            a={a}
            role={role}
            draft={draft}
            onDraftChange={onDraftChange}
            onDecide={onDecide}
          />
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

function FilterBar({
  q,
  statusF,
  typeF,
  typeOptions,
  hasFilters,
  onQueryChange,
  onStatusChange,
  onTypeChange,
  onClearFilters,
}) {
  return (
    <div className="approval-filters" role="search">
      <label className="approval-search">
        <Icon name="search" size={14} />
        <input aria-label="Search approvals" placeholder="Search by request, opportunity, customer or type" value={q} onChange={onQueryChange} />
      </label>
      <select aria-label="Filter by status" value={statusF} onChange={onStatusChange}><option value="">All statuses</option>{['Pending', 'Approved', 'Rejected'].map(s => <option key={s}>{s}</option>)}</select>
      <select aria-label="Filter by type" value={typeF} onChange={onTypeChange}><option value="">All types</option>{typeOptions.map(t => <option key={t}>{t}</option>)}</select>
      {hasFilters && <button type="button" className="approval-clear" onClick={onClearFilters}>Clear filters</button>}
    </div>
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
  const [boqOppId, setBoqOppId] = useState('')
  const [decisionDrafts, setDecisionDrafts] = useState({})
  const [refreshError, setRefreshError] = useState(false)

  useEffect(() => {
    let active = true
    const isVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible'
    const refresh = async () => {
      if (!active || !isVisible()) return
      const refreshed = await store.refreshApprovals()
      if (active) setRefreshError(!refreshed)
    }
    const onVisibilityChange = () => {
      if (isVisible()) void refresh()
    }
    void refresh()
    const timer = setInterval(refresh, APPROVAL_REFRESH_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      active = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  const refreshNotice = refreshError
    ? <div className="approval-notice approval-notice-info"><Icon name="info" size={14} /> Approval updates are temporarily unavailable. Your saved decisions are safe; try refreshing the page.</div>
    : null
  // Approver workbench for LJS/AH/admins, plus any role named on a joint gate.
  const approverView = isApprover(role) || store.approvals.some(a => neededOf(a).includes(role))
  const canDecide = a => neededOf(a).includes(role)
  const updateDecisionDraft = (id, patch) => setDecisionDrafts(current => ({
    ...current,
    [id]: { ...(current[id] || {}), ...patch },
  }))
  const clearDecisionDraft = id => setDecisionDrafts(current => {
    if (!current[id]) return current
    const next = { ...current }
    delete next[id]
    return next
  })

  const oppName = id => (store.opportunities.find(o => o.id === id) || {}).oppName || ''
  const pricingRowsFor = a => {
    if (a.type !== 'Pricing threshold exception' || !a.oppId) return a.pricingRows || []
    const opp = store.opportunities.find(item => item.id === a.oppId)
    const current = pricingThresholdExceptions(opp, store.getProposal(a.oppId), store).rows
    return current.length ? current : (a.pricingRows || [])
  }
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
      : <span className="hint">No linked opportunity or lead</span>

  // Detail may embed commercial trigger values (GM%, discount, value) — gate it.
  const PricingRows = ({ rows = [], approvers = [] }) => {
    const discountRows = rows.filter(row => row.discount > row.discountPct)
    const markupRows = rows.filter(row => row.markup > row.markupPct)
    const totalDiscount = rows.reduce((sum, row) => sum + (Number(row.discountAmountINR) || 0), 0)
    const totalList = rows.reduce((sum, row) => sum + (Number(row.listTotalINR) || 0), 0)
    const approvalRoles = approvers.length ? approvers : ['AH', 'LJS']
    return <div className="approval-pricing-rows">
      <div className="approval-pricing-explanation">
        <b>Why approval is required</b>
        <span>The requested pricing is outside the configured commercial limit. One approval from {displayRoles(approvalRoles)} is required before the quote can continue.</span>
      </div>
      <div className="approval-pricing-summary">
        <span><b>Affected lines</b>{rows.length}</span>
        {discountRows.length > 0 && <span><b>Discount exceptions</b>{discountRows.length}</span>}
        {markupRows.length > 0 && <span><b>Markup exceptions</b>{markupRows.length}</span>}
        {totalList > 0 && <span><b>Total list value</b>₹ {fmt(totalList)}</span>}
        {totalDiscount > 0 && <span><b>Total discount impact</b>₹ {fmt(totalDiscount)}</span>}
      </div>
      {rows.map((row, i) => <div className="approval-pricing-row" key={`${row.label}-${i}`}>
        <b>{row.label}</b>
        {row.discount > row.discountPct && <span>Discount {row.discount}% <small>(allowed {row.discountPct}%, exceeds by {row.discountExcessPct} points)</small></span>}
        {row.markup > row.markupPct && <span>Markup {row.markup}% <small>(allowed {row.markupPct}%, exceeds by {row.markupExcessPct} points)</small></span>}
        {row.quantity > 0 && <span>Qty {row.quantity}</span>}
        {row.discountAmountINR > 0 && <span>Impact ₹ {fmt(row.discountAmountINR)}</span>}
        {row.afterDiscountTotalINR > 0 && <span>After discount ₹ {fmt(row.afterDiscountTotalINR)}</span>}
      </div>)}
    </div>
  }
  const Detail = ({ a }) => {
    const hasContext = Boolean(a.oppId || a.opportunitySummary || a.blockingReason)
    // OpportunityContext owns the reason whenever a request is linked to an
    // opportunity. Rendering the raw detail again below created duplicate
    // lines on approval cards.
    const showStandaloneDetail = !hasContext
    return <>
      <OpportunityContext a={a} />
      <RejectionRequirements approval={a} />
      {showStandaloneDetail && (a.type === 'Pricing threshold exception' && a.pricingRows?.length && comm
        ? <><div style={{ fontSize: 12.5 }}>{a.detail}</div><PricingRows rows={pricingRowsFor(a)} approvers={neededOf(a)} /></>
        : COMMERCIAL_RX.test(a.detail || '') && !comm
          ? <div className="restricted" style={{ fontSize: 12.5 }}><Icon name="lock" size={11} /> Commercial exception — trigger values (GM% / discount / value) visible to LJS / AH only.</div>
          : <div style={{ fontSize: 12.5 }}>{a.detail}</div>)}
    </>
  }

  const OpportunityContext = ({ a }) => {
    if (!a.oppId && !a.opportunitySummary && !a.blockingReason) return null
    const opp = a.oppId ? store.opportunities.find(o => o.id === a.oppId) : null
    const proposal = opp ? store.getProposal(opp.id) : null
    const snapshot = a.opportunitySnapshot || {}
    const summary = a.opportunitySummary || opp?.remarks || 'No opportunity summary was captured.'
    const isCommercialRequest = a.type === 'Commercial deviation'
    const baseReason = !comm && isCommercialRequest
      ? 'Commercial deviation approval is required before submission.'
      : (a.blockingReason || a.detail || 'Approval is required before the workflow can continue.')
    const reviewFindings = comm
      ? (proposal?.reviewIssues || [])
        .filter(issue => ['block', 'warning'].includes(issue?.severity) && String(issue?.text || '').trim())
        .slice(0, 3)
        .map(issue => String(issue.text).trim())
      : []
    // Older and newly-created requests may both carry the findings in their
    // stored detail. Render them as a structured list here instead of one
    // dense inline paragraph.
    const reason = baseReason.replace(/\s+Review findings:[\s\S]*$/i, '').trim()
    const deviations = comm ? (a.deviationDetails || []) : []
    const pricingRows = comm && a.type === 'Pricing threshold exception' ? pricingRowsFor(a) : []
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
          {opp && <span><b>BOQ</b><button type="button" className="approval-boq-link" onClick={() => setBoqOppId(opp.id)}>{proposal?.bom?.length ? `Open BOQ · ${proposal.bom.length} line${proposal.bom.length === 1 ? '' : 's'}` : 'Open BOQ preview'}</button></span>}
          {comm && snapshot.valueK != null && <span><b>Value</b>₹{snapshot.valueK}K</span>}
        </div>
        <div className="approval-context-reason">
          <b>What you're approving</b>
          <div className="approval-context-reason-body">
            <span>{reason}</span>
            {reviewFindings.length > 0 && (
              <div className="approval-context-findings">
                <strong>Review findings</strong>
                <ul>{reviewFindings.map((finding, index) => <li key={`${finding}-${index}`}>{finding}</li>)}</ul>
              </div>
            )}
          </div>
        </div>
        {pricingRows.length > 0 && <PricingRows rows={pricingRows} approvers={neededOf(a)} />}
        {deviations.length > 0 && (
          <div className="approval-context-deviations">
            <div className="approval-context-deviation-head"><span></span><b>Customer asked</b><b>ModAE standard</b><b>Requested response</b></div>
            {deviations.map((d, i) => <div key={`${d.term}-${i}`}><b>{d.term}</b><span>{d.customerAsk}</span><span>{d.standardTerm || 'Not recorded'}</span><span>{d.ourResponse}</span></div>)}
          </div>
        )}
        {boqOppId === opp?.id && opp && (
          <ApprovalBoqModal opp={opp} proposal={proposal} store={store} onClose={() => setBoqOppId('')} />
        )}
      </div>
    )
  }

  // On an `anyOf` gate the named roles are alternatives, not a quorum. Joint
  // gates deliberately omit this marker and display both outstanding roles.
  const RoleChips = ({ a }) => {
    const needed = neededOf(a)
    const others = needed.filter(r => r !== role)
    const approved = others.filter(r => (a.decisions || {})[r]?.d === 'Approved')
    if (a.anyOf) {
      if (needed.includes(role)) {
        return <div className="approval-approver-summary">One approval required — your approval or {displayRoles(others)} can clear this request</div>
      }
      return <div className="approval-approver-summary">One approval required — {displayRoles(needed)}</div>
    }
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
        <button className="primary" title="Open this opportunity" onClick={() => nav('/opp/' + a.oppId)}><Icon name="arrowRight" size={12} /> Open opportunity</button>
      </>}
      {a.leadId && <button className="primary" onClick={() => nav('/inbox/' + a.leadId)}><Icon name="inbox" size={12} /> Open opportunity workspace</button>}
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
  const filterBarProps = {
    q,
    statusF,
    typeF,
    typeOptions,
    hasFilters,
    onQueryChange: e => setQ(e.target.value),
    onStatusChange: e => setStatusF(e.target.value),
    onTypeChange: e => setTypeF(e.target.value),
    onClearFilters: clearFilters,
  }

  // ---- Salespeople: read-only view of their own requests ------------------
  if (!approverView) {
    const mine = store.approvals.filter(a => a.requestedBy === role && matches(a)).sort(byTsDesc)
    return (
      <div className="page approvals-page">
        <div className="approval-head"><div><div className="approval-eyebrow">REQUEST TRACKING</div><h2><Icon name="checkCircle" size={18} /> My approval requests</h2><p className="hint">Track decisions and approvers for requests raised by you.</p></div></div>
        {refreshNotice}
        <div className="approval-summary approval-summary-three"><div className="approval-summary-card summary-pending"><b>{store.approvals.filter(a => a.requestedBy === role && a.status === 'Pending').length}</b><span>Pending</span></div><div className="approval-summary-card summary-approved"><b>{store.approvals.filter(a => a.requestedBy === role && a.status === 'Approved').length}</b><span>Approved</span></div><div className="approval-summary-card summary-rejected"><b>{store.approvals.filter(a => a.requestedBy === role && a.status === 'Rejected').length}</b><span>Rejected</span></div></div>
        <FilterBar {...filterBarProps} />
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
  const decided = store.approvals
    .filter(a => a.status !== 'Pending' && matches(a))
    .sort((a, b) => (b.decisionTs || '').localeCompare(a.decisionTs || ''))
  const oldestForMe = [...forMe].sort((a, b) => (a.ts || '').localeCompare(b.ts || ''))[0]

  return (
    <div className="page approvals-page">
      <div className="approval-head"><div><div className="approval-eyebrow">DECISION WORKSPACE</div><h2><Icon name="checkCircle" size={18} /> Approvals — {displayRole(role)}</h2><p className="hint">Resolve requests, inspect linked records, and keep the pipeline moving.</p></div></div>
      {refreshNotice}
      <div className="approval-summary"><div className="approval-summary-card summary-pending"><b>{forMe.length}</b><span>Needs your decision</span></div><div className="approval-summary-card summary-waiting"><b>{others.length}</b><span>Awaiting others</span></div><div className="approval-summary-card summary-decided"><b>{decided.length}</b><span>Approved requests</span></div></div>
      <FilterBar {...filterBarProps} />
      <div className="approval-explainer"><span className="hint">
          Approve moves the request forward. Reject stops it and allows the owner to submit a new request with a comment.
          Joint gates resolve once every named approver has decided.
        </span></div>

      <div className="approval-section-heading approval-section-primary">
        <div>
          <h3>{forMe.length} approvals waiting on you</h3>
          <p className="approval-section-subtitle">{oldestForMe ? `Oldest has been waiting since ${shortDate(oldestForMe.ts)}. Review each one and record a decision.` : 'Nothing is waiting on you right now.'}</p>
        </div>
      </div>
      {forMe.map(a => <PendingCard
        key={a.id}
        a={a}
        role={role}
        store={store}
        myTurn={myTurn}
        renderRef={item => <div className="approval-ref"><RefLink a={item} /></div>}
        renderDetail={item => <Detail a={item} />}
        renderRoleChips={item => <RoleChips a={item} />}
        renderQuickLinks={item => <QuickLinks a={item} />}
        draft={decisionDrafts[a.id]}
        onDraftChange={patch => updateDecisionDraft(a.id, patch)}
        onDecide={async dec => {
          const saved = await store.recordDecision(a.id, dec)
          if (saved) clearDecisionDraft(a.id)
          return saved
        }}
      />)}
      {!forMe.length && <p className="hint">Nothing pending for you — all clear.</p>}

      {others.length > 0 && (
        <>
          <div className="approval-section-heading"><div><span className="approval-section-kicker">IN PROGRESS</span><h3>Awaiting other approvers <span>{others.length}</span></h3></div></div>
          {others.map(a => <PendingCard
            key={a.id}
            a={a}
            role={role}
            store={store}
            myTurn={myTurn}
            renderRef={item => <div className="approval-ref"><RefLink a={item} /></div>}
            renderDetail={item => <Detail a={item} />}
            renderRoleChips={item => <RoleChips a={item} />}
            renderQuickLinks={item => <QuickLinks a={item} />}
            draft={decisionDrafts[a.id]}
            onDraftChange={patch => updateDecisionDraft(a.id, patch)}
            onDecide={async dec => {
              const saved = await store.recordDecision(a.id, dec)
              if (saved) clearDecisionDraft(a.id)
              return saved
            }}
          />)}
        </>
      )}

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
