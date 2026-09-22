import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { canPriceProposal, ddMmmYY, displayRole, fmtLakh, isSalesOwner } from '../utils.js'
import { Icon } from '../icons.jsx'
import { latestSubmissionForRevision } from '../submissionStatus.js'

const DAY = 86400000

const ageDays = date => {
  if (!date) return null
  const then = new Date(date).getTime()
  if (!Number.isFinite(then)) return null
  return Math.max(0, Math.floor((Date.now() - then) / DAY))
}

const dateValue = date => {
  const value = new Date(date || 0).getTime()
  return Number.isFinite(value) ? value : 0
}

const sentDateFor = (opp, submission) => submission?.ts || opp.proposalDate || ''

const formatSentDate = value => {
  const text = String(value || '')
  const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoDate) return ddMmmYY(`${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`)
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return ''
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return ddMmmYY(`${year}-${month}-${day}`)
}

const statusFor = (opp, communications, submission) => {
  if (opp.status === 'Closed' && opp.stage === 'Won') return { key: 'won', label: 'Won', tone: 'green' }
  if (opp.status === 'Closed' && opp.stage === 'Lost') return { key: 'lost', label: 'Lost', tone: 'red' }
  if (opp.milestone === 'PO Validation') return { key: 'accepted', label: 'Accepted · PO pending', tone: 'green' }
  const rows = communications || []
  const latestReply = rows.find(row => ['ack', 'clarification-response'].includes(row.kind))
  if (latestReply) return { key: 'reply', label: 'Customer replied', tone: 'blue' }
  if (rows.some(row => row.kind === 'follow-up')) return { key: 'follow-up', label: 'Follow-up in progress', tone: 'amber' }
  if (submission?.status === 'draft') return { key: 'draft', label: 'Draft opened', tone: 'grey' }
  return { key: 'awaiting', label: 'Awaiting response', tone: 'grey' }
}

const urgencyFor = ({ age, daysLeft, status }) => {
  if (['won', 'lost', 'accepted', 'reply'].includes(status.key)) return { key: 'closed', label: 'Recorded', tone: 'grey' }
  if (daysLeft != null && daysLeft < 0) return { key: 'expired', label: 'Validity expired', tone: 'red' }
  if (daysLeft != null && daysLeft <= 7) return { key: 'expiring', label: `${daysLeft}d validity left`, tone: 'amber' }
  if (age != null && age >= 14) return { key: 'overdue', label: 'Follow-up due', tone: 'red' }
  if (age != null && age >= 7) return { key: 'due', label: 'Due this week', tone: 'amber' }
  return { key: 'new', label: 'Recently sent', tone: 'green' }
}

const statusOptions = [
  ['all', 'All statuses'],
  ['awaiting', 'Awaiting response'],
  ['follow-up', 'Follow-up in progress'],
  ['reply', 'Customer replied'],
  ['accepted', 'Accepted / PO pending'],
  ['won', 'Won'],
  ['lost', 'Lost'],
]

function Pill({ tone = 'grey', children }) {
  return <span className={`proposal-sent-pill proposal-sent-pill-${tone}`}>{children}</span>
}

function Stat({ label, value, detail, tone = '' }) {
  return <div className={`proposal-sent-stat ${tone ? `proposal-sent-stat-${tone}` : ''}`}>
    <span className="proposal-sent-stat-value">{value}</span>
    <span className="proposal-sent-stat-label">{label}</span>
    {detail && <span className="proposal-sent-stat-detail">{detail}</span>}
  </div>
}

export default function ProposalSent() {
  const store = useStore()
  const nav = useNavigate()
  const role = store.role
  const commercial = canPriceProposal(role)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [sort, setSort] = useState('urgency')

  const rows = useMemo(() => {
    const opportunities = (store.opportunities || []).filter(opp => !isSalesOwner(role) || opp.owner === role)
    return opportunities.flatMap(opp => {
      const proposal = store.getProposal(opp.id)
      const communications = (store.communications?.[opp.id] || []).slice().sort((a, b) => dateValue(b.ts) - dateValue(a.ts))
      const revision = String(proposal?.revision || '00')
      const submission = latestSubmissionForRevision(communications, revision)
      if (!opp.proposalDate && !submission) return []
      const sentDate = sentDateFor(opp, submission)
      const age = ageDays(sentDate)
      const validityDays = Number(opp.validityDays || store.config?.proposalValidityDays || 30)
      const daysLeft = age == null ? null : validityDays - age
      const status = statusFor(opp, communications, submission)
      const urgency = urgencyFor({ age, daysLeft, status })
      return [{ opp, proposal, communications, submission, revision, sentDate, age, validityDays, daysLeft, status, urgency }]
    })
  }, [role, store.opportunities, store.communications, store.config?.proposalValidityDays, store.proposals])

  const owners = useMemo(() => [...new Set(rows.map(row => row.opp.owner).filter(Boolean))].sort(), [rows])
  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows
      .filter(row => statusFilter === 'all' || row.status.key === statusFilter)
      .filter(row => ownerFilter === 'all' || row.opp.owner === ownerFilter)
      .filter(row => !needle || [row.opp.id, row.opp.sellTo, row.opp.oppName, displayRole(row.opp.owner)].some(value => String(value || '').toLowerCase().includes(needle)))
      .sort((a, b) => {
        if (sort === 'sent') return dateValue(b.sentDate) - dateValue(a.sentDate)
        if (sort === 'value') return (+b.opp.valueK || 0) - (+a.opp.valueK || 0)
        if (sort === 'customer') return String(a.opp.sellTo || '').localeCompare(String(b.opp.sellTo || ''))
        const rank = { expired: 0, overdue: 1, expiring: 2, due: 3, new: 4, closed: 5 }
        return (rank[a.urgency.key] ?? 9) - (rank[b.urgency.key] ?? 9) || dateValue(a.sentDate) - dateValue(b.sentDate)
      })
  }, [rows, query, statusFilter, ownerFilter, sort])

  const activeRows = rows.filter(row => !['won', 'lost', 'accepted'].includes(row.status.key))
  const dueRows = activeRows.filter(row => ['expired', 'overdue', 'expiring', 'due'].includes(row.urgency.key))
  const expiringRows = activeRows.filter(row => row.daysLeft != null && row.daysLeft >= 0 && row.daysLeft <= 7)
  const totalValue = rows.reduce((sum, row) => sum + (+row.opp.valueK || 0), 0)
  const priorityRows = [...dueRows].sort((a, b) => {
    const rank = { expired: 0, overdue: 1, expiring: 2, due: 3 }
    return (rank[a.urgency.key] ?? 9) - (rank[b.urgency.key] ?? 9) || dateValue(a.sentDate) - dateValue(b.sentDate)
  }).slice(0, 5)

  return (
    <div className="page proposal-sent-page">
      <div className="proposal-sent-head">
        <div>
          <span className="eyebrow">Customer follow-up</span>
          <h2>Proposal Sent</h2>
          <p className="hint">Keep submitted proposals moving from customer review to a clear next decision.</p>
        </div>
        <div className="proposal-sent-head-actions">
          <span className="proposal-sent-scope"><span className="proposal-sent-live-dot" /> {isSalesOwner(role) ? 'My submitted proposals' : 'Company submitted proposals'}</span>
          <button className="primary" onClick={() => nav('/opportunities')}><Icon name="cards" size={13} /> Open opportunities</button>
        </div>
      </div>

      <div className="proposal-sent-stats" aria-label="Proposal sent summary">
        <Stat label="Submitted proposals" value={rows.length} detail="Current visible scope" tone="red" />
        <Stat label="Awaiting response" value={rows.filter(row => row.status.key === 'awaiting').length} detail="No customer reply logged" />
        <Stat label="Follow-up due" value={dueRows.length} detail={expiringRows.length ? `${expiringRows.length} expiring within 7 days` : 'No urgent expiry'} tone={dueRows.length ? 'amber' : 'green'} />
        <Stat label="Submitted value" value={commercial ? fmtLakh(totalValue) : 'Restricted'} detail={commercial ? 'Visible proposal value' : 'Commercial data restricted'} />
      </div>

      <section className="proposal-sent-priority" aria-labelledby="proposal-sent-priority-title">
        <div className="proposal-sent-section-head">
          <div>
            <h3 id="proposal-sent-priority-title">Needs attention</h3>
            <p className="hint">The proposals most likely to lose momentum without a timely customer touch.</p>
          </div>
          <span className="proposal-sent-count">{dueRows.length} requiring attention</span>
        </div>
        {priorityRows.length ? (
          <div className="proposal-sent-priority-list">
            {priorityRows.map(row => (
              <button key={row.opp.id} className="proposal-sent-priority-row" onClick={() => nav(`/opp/${row.opp.id}/followup`)}>
                <span className={`proposal-sent-priority-mark proposal-sent-priority-mark-${row.urgency.tone}`} />
                <span className="proposal-sent-priority-main"><b title={row.opp.sellTo || 'Customer not recorded'}>{row.opp.sellTo || 'Customer not recorded'}</b><span title={`${row.opp.id} · ${row.opp.oppName || ''}`}>{row.opp.id} · {row.opp.oppName}</span></span>
                <span className="proposal-sent-priority-meta"><Pill tone={row.urgency.tone}>{row.urgency.label}</Pill><span>Sent {formatSentDate(row.sentDate) || '—'}</span></span>
                <Icon name="chevronRight" size={14} />
              </button>
            ))}
          </div>
        ) : (
          <div className="proposal-sent-empty"><Icon name="checkCircle" size={18} /><div><b>Nothing urgent right now</b><span>Your submitted proposals are within their follow-up window.</span></div></div>
        )}
      </section>

      <section className="proposal-sent-register" aria-labelledby="proposal-sent-register-title">
        <div className="proposal-sent-section-head proposal-sent-register-head">
          <div><h3 id="proposal-sent-register-title">All submitted proposals</h3><p className="hint">Search the register, then open the opportunity to record the next customer interaction.</p></div>
          <span className="proposal-sent-count">{visibleRows.length} of {rows.length}</span>
        </div>
        <div className="proposal-sent-filters">
          <label className="proposal-sent-search"><Icon name="search" size={14} /><span className="visually-hidden">Search proposals</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search customer, opportunity or reference" /></label>
          <label><span className="visually-hidden">Filter status</span><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span className="visually-hidden">Filter owner</span><select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}><option value="all">All owners</option>{owners.map(owner => <option key={owner} value={owner}>{displayRole(owner)}</option>)}</select></label>
          <label><span className="visually-hidden">Sort proposals</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="urgency">Sort: urgency</option><option value="sent">Sort: newest</option><option value="value">Sort: value</option><option value="customer">Sort: customer</option></select></label>
        </div>
        <div className="proposal-sent-table-wrap">
          <table className="proposal-sent-table">
            <colgroup><col className="proposal-sent-col-opportunity" /><col className="proposal-sent-col-customer" /><col className="proposal-sent-col-owner" /><col className="proposal-sent-col-proposal" /><col className="proposal-sent-col-sent" /><col className="proposal-sent-col-validity" /><col className="proposal-sent-col-status" /><col className="proposal-sent-col-action" /></colgroup>
            <thead><tr><th>Opportunity</th><th>Customer</th><th>Owner</th><th>Proposal</th><th>Sent</th><th>Validity</th><th>Status</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
            <tbody>
              {visibleRows.map(row => (
                <tr key={row.opp.id}>
                  <td><button className="proposal-sent-link" title={`${row.opp.id} — ${row.opp.oppName || 'Untitled opportunity'}`} aria-label={`Open follow-up for ${row.opp.id} — ${row.opp.oppName || 'Untitled opportunity'}`} onClick={() => nav(`/opp/${row.opp.id}/followup`)}><b>{row.opp.id}</b><span>{row.opp.oppName || 'Untitled opportunity'}</span></button></td>
                  <td><span className="proposal-sent-cell-text" title={row.opp.sellTo || '—'}>{row.opp.sellTo || '—'}</span></td>
                  <td><span className="proposal-sent-cell-text" title={displayRole(row.opp.owner) || '—'}>{displayRole(row.opp.owner) || '—'}</span></td>
                  <td><span className="proposal-sent-revision">Rev-{row.revision}</span>{commercial && <span className="proposal-sent-value">{fmtLakh(row.opp.valueK || 0)}</span>}</td>
                  <td className="proposal-sent-date-cell"><span>{formatSentDate(row.sentDate) || '—'}</span><span className="proposal-sent-age">{row.age == null ? '' : `${row.age}d ago`}</span></td>
                  <td><Pill tone={row.urgency.tone}>{row.daysLeft == null ? '—' : row.daysLeft < 0 ? `${Math.abs(row.daysLeft)}d expired` : `${row.daysLeft}d left`}</Pill></td>
                  <td><Pill tone={row.status.tone}>{row.status.label}</Pill></td>
                  <td><button className="proposal-sent-open" onClick={() => nav(`/opp/${row.opp.id}/followup`)} title="Open follow-up" aria-label={`Open follow-up for ${row.opp.id}`}><Icon name="chevronRight" size={14} /></button></td>
                </tr>
              ))}
              {!visibleRows.length && <tr><td colSpan={8}><div className="proposal-sent-no-results"><b>No proposals match these filters.</b><span>Try clearing the search or choosing a different status.</span></div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
