import React from 'react'
import { useStore } from '../store.jsx'
import { canPriceProposal } from '../utils.js'
import { Chip } from '../ui.jsx'
import { Icon } from '../icons.jsx'
import SurveyPanel from './SurveyPanel.jsx'
import RateSheetPanel from './RateSheetPanel.jsx'
import { serviceCost, estimateQuantities, serviceMoney, sheetFor } from '../serviceRates.js'
import { serviceMatrixExempt, serviceUsesStandardRates, legacyServiceReview, serviceOfferCleared } from '../gates.js'

const DEFAULT_EST = {
  workDays: 1, travelDays: 1, dailyHours: 8, otHours: 0,
  weekendDays: 0, standbyDays: 0, engineer: '', mobilisation: '', toolsCerts: '',
  travelConfirmed: false,
}

const NUM_FIELDS = [
  ['workDays', 'Working days'], ['travelDays', 'Travel days'], ['dailyHours', 'Daily hours'],
  ['otHours', 'Overtime hours'], ['weekendDays', 'Weekend days'], ['standbyDays', 'Standby days'],
]

// Reactive-service workbench: rate-sheet driven cost build-up with the manual
// travel-estimate confirmation gate.
export default function WbService({ opp, focus = 'scope' }) {
  const store = useStore()
  const comm = canPriceProposal(store.role)
  const est = store.svcEstimates.find(e => e.oppId === opp.id) || { oppId: opp.id, ...DEFAULT_EST }
  // The site's location picks the sheet; the toggle below stays as an override
  // for the cases the address does not settle.
  const sheet = sheetFor(opp, est)
  const rs = store.rateSheets[sheet]
  const scopeConfirmed = !!est.scopeConfirmed
  // New Service opportunities use one commercial lane. Historical saved modes
  // remain readable without rewriting existing records.
  const offerMode = serviceUsesStandardRates(opp, store) ? 'Standard Rate Sheet' : (est.offerMode || 'Standard Rate Sheet')
  const requirementSource = Array.isArray(est.requirementSource)
    ? est.requirementSource.filter(source => source === 'Site visit')
    : []
  const siteVisitSelected = requirementSource.includes('Site visit') || !!est.surveyRequired
  // Three approval regimes meet here. A published-rate Path A offer needs none;
  // an opportunity raised before 22 Sep still runs its single combined review;
  // everything else is approved as a proposal under §5.
  const exempt = serviceMatrixExempt(opp, store)
  const onLegacyReview = !!legacyServiceReview(opp, store.approvals)
  const reviewApproval = onLegacyReview
    ? (store.approvals || []).find(a => a.oppId === opp.id && a.type === 'Service offer review' && ['Pending', 'Approved', 'Approved with conditions'].includes(a.status))
    : null
  const approvalStep = exempt ? '3 No approval needed' : onLegacyReview ? '3 One internal review' : '3 §5 approvals'
  const approvalCleared = serviceOfferCleared(opp, store.getProposal(opp.id), store)

  const upd = patch => store.updateSvcEstimate(opp.id, patch)

  // India rates are K INR / day; International are USD. The build-up itself
  // lives in serviceRates.js so the invoice can bill the same lines off the
  // engineer's actual days.
  const { rows, subtotal, gst, total } = serviceCost(store.rateSheets, sheet, estimateQuantities(est))
  const money = v => serviceMoney(sheet, v)

  const confirmScope = () => {
    store.updateServiceFlow(opp.id, {
      offerMode: 'Standard Rate Sheet', requirementSource, scopeConfirmed: true,
      surveyRequired: siteVisitSelected,
    })
  }

  const requestServiceReview = () => {
    if (!scopeConfirmed || !est.travelConfirmed || (est.surveyRequired && !((store.surveys || []).find(v => v.oppId === opp.id)?.report))) return
    store.requestApproval({
      oppId: opp.id, type: 'Service offer review', approver: 'AH', needed: ['AH', 'LJS'], anyOf: false,
      detail: `${offerMode} — ${opp.oppName}; ${est.workDays || 0} work days + ${est.travelDays || 0} travel days; engineer ${est.engineer || 'TBC'}.`,
    })
    store.updateServiceFlow(opp.id, { reviewRequested: true })
  }

  return (
    <div className="ana-grid service-scope-grid">
      <div className="ana-card c-12 service-flow-summary service-status-strip">
        <div>
          <div className="service-panel-kicker">Service Scope &amp; Survey</div>
          <div className="ana-title">{focus === 'scope' ? 'Confirm the commercial lane before estimating' : 'Prepare the accepted service offer'}</div>
        </div>
        <div className="service-status-steps" aria-label="Service flow status">
          {['1 AI identifies', '2 Confirm scope', approvalStep, '4 Customer decision'].map((step, i) => (
            <Chip key={step} tone={i === 0 || (i === 1 && scopeConfirmed) || (i === 2 && approvalCleared) || (i === 3 && est.customerDecision) ? 'state-Accepted' : 'grey'}>{step}</Chip>
          ))}
        </div>
        <p className="hint">
          Standard Service uses the published rate sheet. Confirm whether a site visit is needed.{' '}
          {exempt
            ? 'Published rates need no approval — issue the schedule and record the decision.'
            : onLegacyReview
              ? 'This opportunity runs on its single combined review.'
              : 'Any discount or commercial change may require approval.'}{' '}
          Customer changes create a revision rather than restarting intake.
        </p>
      </div>
      {focus === 'scope' && <>
      <div className="ana-card c-8 service-decision-panel">
        <div className="service-panel-heading">
          <div><div className="service-panel-kicker">Decision required</div><div className="ana-title">Standard service identification</div></div>
        </div>
        <div className="service-decision-intro"><span className="service-decision-icon"><Icon name="sparkles" size={15} /></span><span>This opportunity is a <b>Service</b>. It will use the <b>Standard Rate Sheet</b>.</span></div>
        <div className="service-scope-controls">
          <label className="service-field-label">Offer path
            <div className="service-confirmed-copy">Standard Rate Sheet</div>
          </label>
          <div className="service-suggestion-note">This is the only Service offer path.</div>
        </div>
        <div className="service-requirement-block">
          <div className="service-field-label">Is a site visit needed?</div>
          <div className="service-requirement-options">
            <label className={`service-requirement-option ${siteVisitSelected ? 'is-selected' : ''}`}>
              <input type="checkbox" checked={siteVisitSelected} disabled={scopeConfirmed}
                onChange={e => upd({
                  requirementSource: e.target.checked ? ['Site visit'] : [],
                  requirementSourceSource: 'manual',
                  surveyRequired: e.target.checked,
                })} />
              <span>Site visit</span>
            </label>
          </div>
          <p className="hint">The site visit is optional. If selected, complete the survey before preparing the rate schedule.</p>
        </div>
        <div className="service-decision-footer">
          <span className={scopeConfirmed ? 'service-confirmed-copy' : 'hint'}>{scopeConfirmed ? 'Scope and offer path confirmed.' : 'Review the selection before locking the scope.'}</span>
          <button className="primary" disabled={scopeConfirmed} onClick={confirmScope}>{scopeConfirmed ? 'Scope confirmed' : 'Confirm standard service scope'}</button>
        </div>
      </div>
      <div className="ana-card c-4 service-lane-card">
        <div className="service-panel-kicker">Current lane</div>
        <div className="service-lane-value">{offerMode}</div>
        <div className="service-lane-row"><span>Survey</span><Chip tone={est.surveyRequired ? 'state-Review' : 'grey'}>{est.surveyRequired ? 'Required' : 'Not raised'}</Chip></div>
        <div className="service-lane-row"><span>Approval</span><Chip tone={exempt ? 'state-Accepted' : 'state-Review'}>{exempt ? 'Not required' : onLegacyReview ? 'Service Review' : '§5 proposal'}</Chip></div>
        <p className="hint">This summary updates from the confirmed scope and stays visible while the estimate is prepared.</p>
      </div>
      </>}
      {focus === 'scope' && scopeConfirmed && <SurveyPanel opp={opp} est={est} />}
      {focus === 'offer' && <>
        <div className="ana-card c-12 service-offer-context">
          <div className="service-panel-kicker">Confirmed scope</div>
          <div className="service-offer-context-row">
            <div><b>{offerMode}</b><span>{requirementSource.length ? requirementSource.join(' · ') : 'No additional requirement source selected'}</span></div>
            <Chip tone={est.surveyRequired ? 'state-Review' : 'state-Accepted'}>{est.surveyRequired ? 'Survey evidence required' : 'No survey required'}</Chip>
          </div>
          <p className="hint">Scope is locked. Complete the service estimate below, then issue the standard rate schedule.</p>
          {!est.travelConfirmed && <div className="warnbox service-offer-blocker" role="status">
            <b>Next action required:</b> confirm the manual travel estimate below before the offer can be prepared or reviewed.
          </div>}
        </div>
        {offerMode === 'Standard Rate Sheet' && <RateSheetPanel opp={opp} est={est} />}
      </>}
      {focus === 'offer' && scopeConfirmed && <>
        {/* Standard Service is priced from the published rate sheet. */}
      <div className="ana-card c-6 service-estimate-panel">
        <div className="ana-title">Service estimate — inputs</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
          <span className="hint">Rate sheet</span>
          {['India', 'International'].map(m => (
            <button key={m} className={sheet === m ? 'primary' : ''} onClick={() => upd({ sheet: m })}>{m}</button>
          ))}
          <span className="hint">currency {rs.currency}, GST {rs.gst}%</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {NUM_FIELDS.map(([k, label]) => (
            <label key={k} style={{ fontSize: 12 }}>
              {label}
              <input type="number" min="0" value={est[k] ?? 0} style={{ width: '100%' }}
                onChange={e => upd({ [k]: Math.max(0, +e.target.value || 0) })} />
            </label>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          <label style={{ fontSize: 12 }}>
            Engineer
            <input value={est.engineer || ''} style={{ width: '100%' }} placeholder="Name / availability"
              onChange={e => upd({ engineer: e.target.value })} />
          </label>
          <label style={{ fontSize: 12 }}>
            Mobilisation date
            <input type="date" value={est.mobilisation || ''} style={{ width: '100%' }}
              onChange={e => upd({ mobilisation: e.target.value })} />
          </label>
        </div>
        <label style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          Tools / certifications
          <input value={est.toolsCerts || ''} style={{ width: '100%' }} placeholder="e.g. balancing kit, permits"
            onChange={e => upd({ toolsCerts: e.target.value })} />
        </label>
        <div className="check-row" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={!!est.travelConfirmed}
            onChange={e => upd({ travelConfirmed: e.target.checked })} />
          <span>Confirm manual travel estimate</span>
          {est.travelConfirmed
            ? <Chip tone="state-Accepted">Confirmed</Chip>
            : <Chip tone="state-Blocks">Blocks readiness</Chip>}
        </div>
        {onLegacyReview && (
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="primary" disabled={!scopeConfirmed || !est.travelConfirmed || (est.surveyRequired && !((store.surveys || []).find(v => v.oppId === opp.id)?.report)) || !!reviewApproval} onClick={requestServiceReview}>
              <Icon name="users" size={13} /> {reviewApproval ? 'Service review submitted' : 'Request one Service Review'}
            </button>
          </div>
        )}
        {!scopeConfirmed && <p className="hint">Confirm the AI suggestion and scope above first.</p>}
        {reviewApproval && <div className={reviewApproval.status === 'Approved' ? 'okbox' : 'warnbox'}>One combined Service Review: {reviewApproval.status}. Track the decision on Approvals.</div>}
        {!onLegacyReview && scopeConfirmed && (
          <div className={exempt ? 'okbox' : 'warnbox'} style={{ marginTop: 10 }}>
            {exempt
              ? 'Published rates — no approval needed. Issue the rate schedule above and record the customer’s decision.'
              : 'Approvals run on the proposal: technical (LJS or AN), commercial (AH) where terms deviate, and the value / margin matrix on release.'}
          </div>
        )}
      </div>

      <div className="ana-card c-6 service-cost-panel">
        <div className="ana-title">Cost build-up ({rs.currency})</div>
        {comm ? (
          <table className="cost-table" style={{ width: '100%' }}>
            <tbody>
              {rows.map(([label, v]) => (
                <tr key={label}><td>{label}</td><td className="num">{money(v)}</td></tr>
              ))}
              <tr><td><b>Subtotal</b></td><td className="num"><b>{money(subtotal)}</b></td></tr>
              <tr><td>GST {sheet === 'India' ? '(18%)' : '(0% — export of services)'}</td><td className="num">{money(gst)}</td></tr>
              <tr className="total"><td>Customer-facing total</td><td className="num">{money(total)}</td></tr>
            </tbody>
          </table>
        ) : (
          <div className="restricted"><Icon name="lock" size={12} /> Cost build-up and rates restricted — sales owners, approvers and admin only</div>
        )}
        <p className="hint" style={{ marginTop: 12 }}>Issue the rate schedule from the Standard rate schedule card above. No proposal line is created for this workflow.</p>
      </div>
      </>}
      {((focus === 'scope' && !scopeConfirmed) || (focus === 'offer' && !scopeConfirmed)) && <div className="ana-card c-12 service-next-step-card">
        <div className="service-panel-kicker">Next step locked</div>
        <div className="ana-title">Confirm the scope before preparing evidence or pricing</div>
        <p className="hint">Return to Scope &amp; Survey and confirm the offer path before this work area can be completed.</p>
      </div>}
    </div>
  )
}
