import React from 'react'
import { Link } from 'react-router-dom'

const fields = [
  ['Opp ID', 'id'],
  ['Customer', 'sellTo'],
  ['Opportunity', 'oppName'],
  ['Opportunity type', 'oppType'],
  ['Owner', 'owner'],
  ['Stage', 'stage'],
  ['Status', 'status'],
  ['Scope', 'opportunityScope'],
]

export default function OpportunityComingSoon({ opp, created = false, onDismiss }) {
  return (
    <div className="page opportunity-coming-soon">
      <div className="opportunity-coming-soon-card" role="status" aria-live="polite">
        <span className="opportunity-coming-soon-kicker">{opp.oppType} opportunity</span>
        <h1>{created ? 'Opportunity created' : 'Coming soon'}</h1>
        <p className="opportunity-coming-soon-message">
          {created
            ? `The ${opp.oppType || opp.route || 'opportunity'} record is ready. Its workflow is not available yet, but the record is retained for pipeline visibility.`
            : 'The workflow for this opportunity type is not available yet. This record is retained for pipeline visibility and will be enabled when the workflow is released.'}
        </p>
        <div className="opportunity-coming-soon-details">
          {fields.map(([label, key]) => (
            <div className="opportunity-coming-soon-row" key={key}>
              <span>{label}</span>
              <strong>{opp[key] || '—'}</strong>
            </div>
          ))}
        </div>
        <div className="opportunity-coming-soon-actions">
          {created && onDismiss && <button className="btn-secondary" type="button" onClick={onDismiss}>Dismiss</button>}
          <Link className="btn-secondary" to="/opportunities">Back to opportunities</Link>
        </div>
      </div>
    </div>
  )
}
