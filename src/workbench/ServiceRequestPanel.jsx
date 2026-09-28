import React from 'react'
import { useStore } from '../store.jsx'
import { Icon } from '../icons.jsx'

export default function ServiceRequestPanel({ opp, onContinue }) {
  const store = useStore()

  const continueToScope = () => {
    store.updateServiceFlow(opp.id, {
      offerMode: 'Standard Rate Sheet',
      requestConfirmed: true,
    })
    onContinue()
  }

  return (
    <div className="ana-grid service-request-grid">
      <div className="ana-card c-8 service-decision-panel">
        <div className="service-panel-heading">
          <div>
            <div className="service-panel-kicker">Service Request</div>
            <div className="ana-title">Review the service enquiry</div>
          </div>
        </div>
        <div className="service-decision-intro">
          <span className="service-decision-icon"><Icon name="sparkles" size={15} /></span>
          <span>This opportunity will use the <b>Standard Rate Sheet</b>.</span>
        </div>
        <p className="hint">Confirm the request first. The site-visit requirement is decided once in Scope Confirmation.</p>
        <div className="service-decision-footer">
          <span className="hint">Next, confirm the service scope before pricing.</span>
          <button className="primary" onClick={continueToScope}>Continue to Scope Confirmation</button>
        </div>
      </div>
      <div className="ana-card c-4 service-lane-card">
        <div className="service-panel-kicker">Next stage</div>
        <div className="service-lane-value">Scope Confirmation</div>
        <p className="hint">The site-visit decision is recorded there once and carried into the rate schedule.</p>
      </div>
    </div>
  )
}
