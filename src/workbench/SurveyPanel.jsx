import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { displayRole } from '../utils.js'
import { Chip } from '../ui.jsx'
import { Icon } from '../icons.jsx'

// Diagram 02 §4 — the service special flow. "Site Survey Required?" is the
// decision diamond: No goes straight to the standard rate-sheet build-up
// (WbService's own calculator), Yes runs survey request -> site visit ->
// survey report -> Statement of Work, and only then service pricing.
// `readiness()` already blocks the proposal on each of those, so this panel is
// what makes those blockers reachable and clearable.
export default function SurveyPanel({ opp, est }) {
  const store = useStore()
  const survey = (store.surveys || []).find(v => v.oppId === opp.id)
  const required = !!est.surveyRequired
  const [detail, setDetail] = useState('')
  const [report, setReport] = useState('')
  const [sow, setSow] = useState('')
  const [sentToProposal, setSentToProposal] = useState(false)

  // The SoW is what the service price is quoted against, so it is pushed into
  // the document's Scope of Work note rather than left on the survey record.
  // `scopeNote` is the editable block under that heading (proposalDoc.js:421);
  // `scope` itself is derived from the BoQ and cannot be overwritten.
  const sowToProposal = () => {
    const p = store.getProposal(opp.id)
    store.saveProposal(opp.id, {
      ...p,
      scopeNote: [(p.scopeNote || '').trim(), `Statement of Work (survey ${survey.id}):`, survey.sow]
        .filter(Boolean).join('\n\n'),
    })
    setSentToProposal(true)
  }

  const stageChip = () => {
    if (!survey) return <Chip tone="state-Blocks">Not raised</Chip>
    if (survey.sow) return <Chip tone="state-Accepted">SoW ready</Chip>
    if (survey.report) return <Chip tone="state-Review">Report in</Chip>
    if (survey.visitOn) return <Chip tone="state-Review">Visit booked</Chip>
    return <Chip tone="state-Review">{survey.state}</Chip>
  }

  return (
    <div className="ana-card c-12">
      <div className="ana-title">Site survey {stageChip()}</div>
      <div className="check-row">
        <input type="checkbox" checked={required}
          onChange={e => store.updateSvcEstimate(opp.id, { surveyRequired: e.target.checked })} />
        <span>Site survey required for this service opportunity</span>
      </div>

      {!required ? (
        <p className="hint">
          Standard service — priced from the rate sheet below (service rates, travel / lodging,
          manpower days and consumables). Tick the box if the scope cannot be priced without a site visit.
        </p>
      ) : !survey ? (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <input placeholder="What the survey must establish" style={{ flex: 1, minWidth: 200 }}
            value={detail} onChange={e => setDetail(e.target.value)} />
          <button className="primary" onClick={() => store.requestSurvey(opp.id, detail.trim())}>
            <Icon name="send" size={13} /> Generate survey request
          </button>
        </div>
      ) : (
        <>
          <p className="hint" style={{ marginTop: 6 }}>
            {survey.id} · requested by {displayRole(survey.requestedBy)} on {survey.requestedOn}
            {survey.detail ? ` — ${survey.detail}` : ''}
          </p>

          <label style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
            Site visit date
            <input type="date" value={survey.visitOn || ''} style={{ maxWidth: 200, display: 'block' }}
              onChange={e => store.updateSurvey(opp.id, { visitOn: e.target.value, state: e.target.value ? 'Visit scheduled' : 'Requested' }, 'Site visit scheduled')} />
          </label>

          <div className="section-title" style={{ marginTop: 10 }}>Survey report</div>
          {survey.report ? (
            <div className="okbox" style={{ whiteSpace: 'pre-wrap' }}>{survey.report}</div>
          ) : (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <textarea rows={3} placeholder="Findings from the site visit" style={{ flex: 1, minWidth: 240 }}
                value={report} onChange={e => setReport(e.target.value)} />
              <button className="primary" disabled={!report.trim() || !survey.visitOn}
                title={!survey.visitOn ? 'Record the site visit date first' : ''}
                onClick={() => store.updateSurvey(opp.id, { report: report.trim(), state: 'Report submitted' }, 'Survey report filed')}>
                File report
              </button>
            </div>
          )}

          <div className="section-title" style={{ marginTop: 10 }}>Statement of Work</div>
          {survey.sow ? (
            <>
              <div className="okbox" style={{ whiteSpace: 'pre-wrap' }}>{survey.sow}</div>
              <button onClick={sowToProposal}>
                <Icon name="arrowRight" size={13} /> Carry the SoW into the proposal scope
              </button>
              {sentToProposal && <div className="okbox">SoW added to the proposal scope — price the service against it below.</div>}
            </>
          ) : (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <textarea rows={3} placeholder="Scope of work written up from the survey report" style={{ flex: 1, minWidth: 240 }}
                value={sow} onChange={e => setSow(e.target.value)} />
              <button className="primary" disabled={!sow.trim() || !survey.report}
                title={!survey.report ? 'File the survey report first' : ''}
                onClick={() => store.updateSurvey(opp.id, { sow: sow.trim(), state: 'SoW ready' }, 'Statement of Work written')}>
                Save SoW
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
