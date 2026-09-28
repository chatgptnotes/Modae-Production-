import React from 'react'
import { useStore } from '../store.jsx'
import { Chip } from '../ui.jsx'
import { Icon } from '../icons.jsx'
import SurveyPanel from './SurveyPanel.jsx'

const DEFAULT_ESTIMATE = { requirementSource: [], surveyRequired: false }

export default function ServiceScopePanel({ opp, onContinue }) {
  const store = useStore()
  const est = store.svcEstimates.find(item => item.oppId === opp.id) || { oppId: opp.id, ...DEFAULT_ESTIMATE }
  const siteVisitSelected = Array.isArray(est.requirementSource)
    ? est.requirementSource.includes('Site visit') || !!est.surveyRequired
    : !!est.surveyRequired
  const survey = (store.surveys || []).find(v => v.oppId === opp.id)
  const surveyReady = !siteVisitSelected || !!survey?.report

  const updateSiteVisit = checked => store.updateSvcEstimate(opp.id, {
    requirementSource: checked ? ['Site visit'] : [],
    requirementSourceSource: 'manual',
    surveyRequired: checked,
  })

  const confirmScope = () => {
    if (!surveyReady) return
    store.updateServiceFlow(opp.id, {
      offerMode: 'Standard Rate Sheet',
      requirementSource: siteVisitSelected ? ['Site visit'] : [],
      requirementSourceSource: est.requirementSourceSource || 'manual',
      surveyRequired: siteVisitSelected,
      scopeConfirmed: true,
      requestConfirmed: true,
    })
    window.setTimeout(onContinue, 0)
  }

  return (
    <div className="ana-grid service-scope-grid">
      <div className="ana-card c-8 service-decision-panel">
        <div className="service-panel-heading">
          <div>
            <div className="service-panel-kicker">Scope Confirmation</div>
            <div className="ana-title">Confirm scope before pricing</div>
          </div>
        </div>
        <div className="service-decision-intro">
          <span className="service-decision-icon"><Icon name="sparkles" size={15} /></span>
          <span>This opportunity will use the <b>Standard Rate Sheet</b>.</span>
        </div>
        <div className="service-requirement-block">
          <div className="service-field-label">Is a site visit needed?</div>
          <label className={`service-requirement-option ${siteVisitSelected ? 'is-selected' : ''}`}>
            <input type="checkbox" checked={siteVisitSelected}
              onChange={event => updateSiteVisit(event.target.checked)} />
            <span>Site visit</span>
          </label>
          <p className="hint">This is the only place to decide whether a site visit is needed. The saved choice will be used by the rate schedule.</p>
        </div>
      </div>
      <div className="ana-card c-4 service-lane-card">
        <div className="service-panel-kicker">Current lane</div>
        <div className="service-lane-value">Standard Rate Sheet</div>
        <div className="service-lane-row">
          <span>Site visit</span>
          <Chip tone={siteVisitSelected ? 'state-Review' : 'grey'}>{siteVisitSelected ? 'Required' : 'Not required'}</Chip>
        </div>
        <p className="hint">Scope is confirmed once before the estimate and rate schedule are prepared.</p>
      </div>
      <SurveyPanel opp={opp} est={est} />
      <div className="ana-card c-12 service-scope-handoff">
        <div>
          <div className="service-panel-kicker">Next step</div>
          <div className="ana-title">{surveyReady ? 'Ready for Standard Rate Schedule' : 'Complete the site survey before preparing the rate schedule'}</div>
          <p className="hint">{surveyReady
            ? 'Lock this scope once. The published rate schedule will be prepared next.'
            : 'Raise the survey, record the visit, and submit the findings before pricing begins.'}</p>
        </div>
        <button className="primary" disabled={!surveyReady} onClick={confirmScope}>Confirm scope and continue to rate schedule</button>
      </div>
    </div>
  )
}
