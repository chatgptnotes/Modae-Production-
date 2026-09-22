import React from 'react'
import { useStore } from '../store.jsx'
import { Chip } from '../ui.jsx'

export default function ServiceReportPanel({ opp }) {
  const store = useStore()
  const est = store.svcEstimates.find(e => e.oppId === opp.id) || { oppId: opp.id }
  const save = e => store.updateServiceFlow(opp.id, { serviceReport: e.target.value, reportSubmittedOn: e.target.value.trim() ? new Date().toISOString().slice(0, 10) : '' })
  const executionReady = !!est.engineer && !!est.executionDate && Number(est.actualEngineerDays) > 0
  const survey = (store.surveys || []).find(v => v.oppId === opp.id)

  // The engineer can find on site that the job is not a standard one after all.
  // That flips the opportunity onto the customised path: a survey is raised from
  // what they saw, and the offer is rebuilt as a proposal rather than billed off
  // the rate sheet. The work already done still bills — the escalation is about
  // what happens next, so the report and the actuals are left untouched.
  const escalate = () => {
    store.updateServiceFlow(opp.id, {
      surveyRequired: true,
      offerMode: 'Customized Proposal',
      scopeEscalatedOn: new Date().toISOString().slice(0, 10),
    })
    if (!survey) {
      store.requestSurvey(opp.id, `Raised from site: ${(est.serviceReport || '').trim().slice(0, 180) || 'detailed BOQ / SoW required'}`)
    }
  }

  return <div className="ana-grid"><div className="ana-card c-12">
    <div className="ana-title">Service Report {est.serviceReport && <Chip tone="state-Accepted">Submitted</Chip>}</div>
    {!executionReady && <div className="warnbox">Complete Execute Service first: engineer, service date, and actual engineer days are required.</div>}
    <label style={{ display: 'block', fontSize: 12 }}>Completed work, findings, and deliverables
      <textarea rows={7} disabled={!executionReady} value={est.serviceReport || ''} onChange={save} placeholder="Record the service performed and attach or describe deliverables" style={{ width: '100%' }} />
    </label>

    <div className="section-title" style={{ marginTop: 12 }}>Scope escalation</div>
    {est.scopeEscalatedOn ? (
      <div className="warnbox">
        Escalated to the customised path on {est.scopeEscalatedOn}. Work the site survey and Statement of Work
        on Scope &amp; Survey, then rebuild the offer as a proposal.
      </div>
    ) : (
      <>
        <p className="hint">
          Did the site visit show the job needs a detailed BOQ or Statement of Work — a complex diagnostic,
          specialised engineering, spares, or an AMC?
        </p>
        <button disabled={!executionReady} onClick={escalate}>
          Detailed BOQ / SoW required — move to the customised path
        </button>
      </>
    )}
    <p className="hint" style={{ marginTop: 8 }}>The Invoice stage opens after this report is submitted.</p>
  </div></div>
}
