import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { displayRole } from '../utils.js'
import { Chip } from '../ui.jsx'
import { Icon } from '../icons.jsx'

// A site visit is selected once in Scope Confirmation and is read-only here.
export default function SurveyPanel({ opp, est }) {
  const store = useStore()
  const survey = (store.surveys || []).find(v => v.oppId === opp.id)
  const required = !!est.surveyRequired
  const [detail, setDetail] = useState('')
  const [report, setReport] = useState('')

  const stageChip = () => {
    if (!survey) return <Chip tone="state-Blocks">Not raised</Chip>
    if (survey.report) return <Chip tone="state-Review">Report in</Chip>
    if (survey.visitOn) return <Chip tone="state-Review">Visit booked</Chip>
    return <Chip tone="state-Review">{survey.state}</Chip>
  }

  return (
    <div className="ana-card c-12">
      <div className="ana-title">Site survey {stageChip()}</div>
      <div className="check-row">
        <span>Site survey requirement is locked from Scope Confirmation</span>
        <Chip tone={required ? 'state-Review' : 'grey'}>{required ? 'Required' : 'Not required'}</Chip>
      </div>

      {!required ? (
        <p className="hint">
          No site survey is required. Scope can proceed to the Standard Rate Schedule using the
          published service rates and the internal deployment estimate.
        </p>
      ) : !survey ? (
        <div className="service-form-action-row">
          <label className="service-form-field service-form-grow">Survey requirement
            <input className="service-form-control" placeholder="What must the site visit confirm?"
            value={detail} onChange={e => setDetail(e.target.value)} />
          </label>
          <button className="primary" onClick={() => store.requestSurvey(opp.id, detail.trim())}>
            <Icon name="send" size={13} /> Raise site survey request
          </button>
        </div>
      ) : (
        <>
          <p className="hint" style={{ marginTop: 6 }}>
            {survey.id} · requested by {displayRole(survey.requestedBy)} on {survey.requestedOn}
            {survey.detail ? ` — ${survey.detail}` : ''}
          </p>

          <label className="service-form-field service-form-field-spaced">
            Site visit date
            <input className="service-form-control service-date-control" type="date" value={survey.visitOn || ''}
              onChange={e => store.updateSurvey(opp.id, { visitOn: e.target.value, state: e.target.value ? 'Visit scheduled' : 'Requested' }, 'Site visit scheduled')} />
          </label>

          <div className="section-title service-form-section-title">Survey findings</div>
          {survey.report ? (
            <div className="okbox" style={{ whiteSpace: 'pre-wrap' }}>{survey.report}</div>
          ) : (
            <div className="service-form-action-row service-report-entry">
              <label className="service-form-field service-form-grow">Survey findings
                <textarea className="service-form-control" rows={6} placeholder="Record findings, access conditions, and recommendations"
                value={report} onChange={e => setReport(e.target.value)} />
              </label>
              <button className="primary" disabled={!report.trim() || !survey.visitOn}
                title={!survey.visitOn ? 'Record the site visit date first' : ''}
                onClick={() => store.updateSurvey(opp.id, { report: report.trim(), state: 'Report submitted' }, 'Survey report filed')}>
                Submit site survey report
              </button>
            </div>
          )}

          <p className="hint">The survey report is evidence for the standard service rate schedule. No Statement of Work or proposal is required.</p>
        </>
      )}
    </div>
  )
}
