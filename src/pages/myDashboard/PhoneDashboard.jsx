import React, { useMemo, useState } from 'react'
import { displayOpportunityId } from '../../seed.js'
import { ddMMyyyy, displayRole } from '../../utils.js'
import { approvalNeedsRole } from './model.js'
import { Icon, ModaeLogo } from '../../icons.jsx'
import './mobileDashboard.css'

const money = value => `₹${((Number(value) || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 1 })} L`
const stageKey = value => String(value || '').toLowerCase()
const isQualified = opp => opp.qualified === true || /qualified/.test(stageKey(opp.qualificationStatus || opp.qualification)) || !['lead', 'rfi'].includes(stageKey(opp.stage))
const isProposal = opp => Boolean(opp.proposalDate) || /proposal|sent|quote/.test(stageKey(opp.stage))

function ApprovalDrawer({ approval, role, nav, store, onClose }) {
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  if (!approval) return null
  const canDecide = approvalNeedsRole(approval, role)
  const decide = async decision => {
    if (!comment.trim() || busy || !canDecide) return
    setBusy(true)
    const saved = await store.recordDecision(approval.id, { d: decision, comment: comment.trim() })
    setBusy(false)
    if (saved) onClose()
  }
  return <div className="mobile-approval-layer" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className="mobile-approval-drawer" role="dialog" aria-modal="true" aria-labelledby="mobile-approval-title">
      <div className="mobile-drawer-handle" />
      <header><div><span className="mobile-eyebrow">Approval review</span><h2 id="mobile-approval-title">{approval.type || 'Commercial deviation'}</h2></div><button className="mobile-icon-button" type="button" aria-label="Close approval review" onClick={onClose}><Icon name="x" size={19} /></button></header>
      <div className="mobile-approval-facts"><strong>{approval.oppId ? displayOpportunityId(approval.oppId) : 'Workspace request'}</strong><span>{approval.requestedBy ? `Raised by ${displayRole(approval.requestedBy)}` : 'Needs review'}</span></div>
      <div className="mobile-deviation"><span>Commercial deviation</span><strong>{approval.detail || approval.reason || '90 Days Credit requested'}</strong><small>Review the requested terms before the proposal can continue.</small></div>
      <div className="mobile-decision-history">{Object.entries(approval.decisions || {}).map(([approver, decision]) => <span key={approver}><b>{displayRole(approver)}</b> {decision.d}</span>)}</div>
      {canDecide ? <><label className="mobile-note-label" htmlFor="mobile-approval-note">Decision note <span>required</span></label><textarea id="mobile-approval-note" value={comment} onChange={event => setComment(event.target.value)} placeholder="Add the reason for your decision…" rows={3} /><div className="mobile-drawer-actions"><button type="button" className="mobile-button mobile-button--approve" disabled={!comment.trim() || busy} onClick={() => decide('Approved')}><Icon name="check" size={16} />Approve</button><button type="button" className="mobile-button mobile-button--reject" disabled={!comment.trim() || busy} onClick={() => decide('Rejected')}><Icon name="x" size={16} />Reject</button><button type="button" className="mobile-button mobile-button--revision" onClick={() => { onClose(); nav(`/proposal/${approval.oppId}`) }}>Return for Revision</button></div></> : <p className="mobile-readonly-note">Awaiting a decision from {displayRole(approval.approver || approval.requestedBy || 'the assigned approver')}.</p>}
      {approval.oppId && <button type="button" className="mobile-link-button" onClick={() => { onClose(); nav(`/proposal/${approval.oppId}`) }}>Open proposal workbench <Icon name="arrowRight" size={15} /></button>}
    </section>
  </div>
}

function FilterChip({ active, label, count, onClick }) {
  return <button type="button" className={`mobile-filter-chip${active ? ' is-active' : ''}`} aria-pressed={active} onClick={onClick}>{label} <b>{count}</b></button>
}

export default function PhoneDashboard({ model, showMoney, nav, store }) {
  const [filter, setFilter] = useState('all')
  const [approvalId, setApprovalId] = useState('')
  const [query, setQuery] = useState('')
  const blockedIds = useMemo(() => new Set(model.blocked.map(row => row.opp?.id).filter(Boolean)), [model.blocked])
  const approvalByOpp = useMemo(() => new Map(model.pending.filter(row => row.oppId).map(row => [row.oppId, row])), [model.pending])
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase()
    return model.open.filter(opp => {
      const matchesFilter = filter === 'all' || (filter === 'qualified' && isQualified(opp)) || (filter === 'proposal' && isProposal(opp)) || (filter === 'blocked' && blockedIds.has(opp.id))
      const matchesSearch = !search || `${opp.sellTo || ''} ${opp.oppName || ''} ${displayOpportunityId(opp.id)}`.toLowerCase().includes(search)
      return matchesFilter && matchesSearch
    })
  }, [blockedIds, filter, model.open, query])
  const initials = String(store?.auth?.user?.name || store?.role || 'M').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()
  const chips = [['all', 'All', model.open.length], ['qualified', 'Qualified', model.open.filter(isQualified).length], ['proposal', 'Proposal Sent', model.open.filter(isProposal).length], ['blocked', 'Blocked', model.blocked.length]]
  const kpis = [['Open Pipeline', showMoney ? money(model.headlinePipelineK) : model.headlineOpenCount, 'chartBar', ''], ['Follow-ups Due', model.followups.length, 'send', ''], ['Pending Approvals', model.pending.length, 'clock', ''], ['Blocked Work', model.blocked.length, 'alert', 'is-urgent']]
  const actionFor = opp => {
    const approval = approvalByOpp.get(opp.id)
    if (approval) return { label: 'Review Approval', onClick: () => setApprovalId(approval.id) }
    if (isProposal(opp)) return { label: 'View Proposal', onClick: () => nav(`/proposal/${opp.id}`) }
    return { label: 'Request Approval', onClick: () => nav(`/opp/${opp.id}`) }
  }
  return <main className="page wintrack-mobile-dashboard" aria-label="Mobile sales dashboard">
    <header className="mobile-dashboard-header"><ModaeLogo size={31} sub="WinTrack" /><span className="mobile-global-indicator"><Icon name="globe" size={15} />Global View</span><button type="button" className="mobile-header-action" aria-label="Search dashboard" onClick={() => document.getElementById('mobile-opportunity-search')?.focus()}><Icon name="search" size={19} /></button><span className="mobile-avatar" aria-label="Signed in user">{initials}</span></header>
    <div className="mobile-dashboard-intro"><div><span className="mobile-eyebrow">Sales workspace</span><h1>Dashboard</h1></div><span className="mobile-sync"><i />Live workspace</span></div>
    <label className="mobile-search"><Icon name="search" size={16} /><span className="visually-hidden">Search opportunities</span><input id="mobile-opportunity-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search customers or Opp ID" /></label>
    <div className="mobile-filter-row" aria-label="Opportunity filters">{chips.map(([key, label, count]) => <FilterChip key={key} active={filter === key} label={label} count={count} onClick={() => setFilter(key)} />)}</div>
    <section className="mobile-kpi-grid" aria-label="Dashboard summary">{kpis.map(([label, value, icon, tone]) => <article key={label} className={`mobile-kpi ${tone}`}><span>{label}</span><strong>{value}</strong><Icon name={icon} size={18} /></article>)}</section>
    <section className="mobile-opportunity-section"><header><div><span className="mobile-eyebrow">Priority feed</span><h2>Open opportunities</h2></div><span className="mobile-result-count">{filtered.length} shown</span></header><div className="mobile-opportunity-feed">{filtered.map(opp => { const action = actionFor(opp); return <article className={`mobile-opportunity-card${blockedIds.has(opp.id) ? ' is-blocked' : ''}`} key={opp.id}><div className="mobile-opportunity-card__top"><span className="mobile-stage-badge">{opp.stage || 'No stage'}</span>{blockedIds.has(opp.id) && <span className="mobile-blocked-badge">Blocked</span>}</div><h3>{opp.sellTo || opp.oppName || 'Untitled opportunity'}</h3><div className="mobile-opportunity-meta"><span>{displayOpportunityId(opp.id)}</span><span>{opp.orderDate ? ddMMyyyy(opp.orderDate) : 'Date not set'}</span></div><div className="mobile-opportunity-footer"><strong>{showMoney ? money(opp.valueK) : 'Value restricted'}</strong><button type="button" className="mobile-card-action" onClick={action.onClick}>{action.label}<Icon name="arrowRight" size={15} /></button></div></article> })}{!filtered.length && <div className="mobile-empty-state"><Icon name="search" size={22} /><strong>No opportunities match this view</strong><span>Try another filter or clear the search.</span></div>}</div></section>
    <ApprovalDrawer approval={model.pending.find(row => row.id === approvalId)} role={store?.role} nav={nav} store={store} onClose={() => setApprovalId('')} />
  </main>
}
