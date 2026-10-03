import React from 'react'
import { Link } from 'react-router-dom'
import { ddMmmYY, ddMMyyyy } from './utils.js'
import { displayOpportunityId } from './seed.js'

export const shouldShowSparseCards = (count, showDenseView) => count > 0 && count <= 3 && !showDenseView

const detail = (label, value) => <div className="sparse-card-detail" key={label}>
  <span>{label}</span><strong>{value || '—'}</strong>
</div>

export function OpportunitySummaryCard({ opportunity: o, stage, nextAction, roleNames }) {
  return <article className="sparse-result-card opportunity-summary-card">
    <div className="sparse-card-heading">
      <div className="sparse-card-heading-text">
        <span className="sparse-card-eyebrow">Opportunity · {displayOpportunityId(o.id, roleNames)}</span>
        <h3>{o.oppName || 'Untitled opportunity'}</h3>
        <p>{o.sellTo || 'Customer not set'}</p>
      </div>
      <span className={`sparse-card-status ${o.status === 'Closed' ? 'closed' : ''}`}>{o.status || 'Open'}</span>
    </div>
    <div className="sparse-card-details">
      {detail('Stage', stage)}
      {detail('Type', o.oppType)}
      {detail('Probability', o.prob)}
      {detail('Value', o.valueK ? `₹ ${new Intl.NumberFormat('en-IN').format(o.valueK * 1000)}` : '—')}
      {detail('Proposal sent', o.proposalDate ? ddMMyyyy(o.proposalDate) : '—')}
      {detail('Expected order', o.orderDate ? ddMMyyyy(o.orderDate) : '—')}
      {detail('Next action', nextAction)}
    </div>
    <div className="sparse-card-footer"><Link className="sparse-card-open" to={`/opp/${o.id}`}>Open opportunity <span aria-hidden="true">→</span></Link></div>
  </article>
}

export function LeadSummaryCard({ lead: l, selected, onSelect, onStar, completeness, route, age }) {
  const preview = l.ai?.summary || l.body?.replace(/\s+/g, ' ').slice(0, 180) || 'No preview available'
  return <article className={`sparse-result-card lead-summary-card${l.status === 'New' && !l.readAt ? ' unread' : ''}`}>
    <div className="sparse-card-heading">
      <div className="sparse-card-heading-text">
        <span className="sparse-card-eyebrow">Lead · {l.id}</span>
        <h3><Link to={`/inbox/${l.id}`}>{l.subject || 'Untitled enquiry'}</Link></h3>
        <p>{l.sender || l.from || 'Unknown sender'} · {l.source || l.channel || 'Common mailbox'}</p>
      </div>
      <span className="sparse-card-status">{l.status || 'New'}</span>
    </div>
    <p className="sparse-card-preview">{preview}</p>
    <div className="sparse-card-details">
      {detail('Received', l.ts ? ddMmmYY(l.ts.slice(0, 10)) : '—')}
      {detail('Route', route)}
      {detail('Owner', l.suggestedOwner)}
      {detail('Urgency', l.urgency || 'Normal')}
      {detail('Completeness', completeness == null ? '—' : `${completeness}%`)}
      {detail('Duplicate risk', l.duplicateRisk || 'Low')}
      {detail('Age', age)}
    </div>
    <div className="sparse-card-footer">
      <label className="sparse-card-select"><input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Select ${l.subject}`} /> Select</label>
      <button type="button" className={`sparse-card-star${l.starred ? ' starred' : ''}`} onClick={onStar} aria-label={`${l.starred ? 'Unstar' : 'Star'} lead ${l.subject}`} aria-pressed={!!l.starred}>{l.starred ? '★' : '☆'}</button>
      {l.oppId && <Link className="sparse-card-linked" to={`/opp/${l.oppId}`}>Opportunity {l.oppId}</Link>}
      <Link className="sparse-card-open" to={`/inbox/${l.id}`}>Open lead <span aria-hidden="true">→</span></Link>
    </div>
  </article>
}
