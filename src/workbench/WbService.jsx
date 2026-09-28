import React from 'react'
import { useStore } from '../store.jsx'
import { canPriceProposal } from '../utils.js'
import { Chip } from '../ui.jsx'
import { Icon } from '../icons.jsx'
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

// Reactive-service workbench: published rate-sheet issuance followed by the
// internal deployment estimate and execution-readiness gate.
export default function WbService({ opp, focus = 'offer', onConfirmSent }) {
  const store = useStore()
  const comm = canPriceProposal(store.role)
  const est = store.svcEstimates.find(e => e.oppId === opp.id) || { oppId: opp.id, ...DEFAULT_EST }
  // The site's location picks the sheet; the toggle below stays as an override
  // for the cases the address does not settle.
  const sheet = sheetFor(opp, est)
  const rs = store.rateSheets[sheet]
  // New Service opportunities use one commercial lane. Historical saved modes
  // remain readable without rewriting existing records.
  const offerMode = serviceUsesStandardRates(opp, store) ? 'Standard Rate Sheet' : (est.offerMode || 'Standard Rate Sheet')
  // Three approval regimes meet here. A published-rate Path A offer needs none;
  // an opportunity raised before 22 Sep still runs its single combined review;
  // everything else is approved as a proposal under §5.
  const exempt = serviceMatrixExempt(opp, store)
  const onLegacyReview = !!legacyServiceReview(opp, store.approvals)
  const reviewApproval = onLegacyReview
    ? (store.approvals || []).find(a => a.oppId === opp.id && a.type === 'Service offer review' && ['Pending', 'Approved', 'Approved with conditions'].includes(a.status))
    : null
  const approvalCleared = serviceOfferCleared(opp, store.getProposal(opp.id), store)
  const survey = (store.surveys || []).find(v => v.oppId === opp.id)
  const evidenceReady = !!est.travelConfirmed && (!est.surveyRequired || !!survey?.report)

  const upd = patch => store.updateSvcEstimate(opp.id, patch)

  // India rates are K INR / day; International are USD. The build-up itself
  // lives in serviceRates.js so the invoice can bill the same lines off the
  // engineer's actual days.
  const { rows, subtotal, gst, total } = serviceCost(store.rateSheets, sheet, estimateQuantities(est))
  const money = v => serviceMoney(sheet, v)

  const requestServiceReview = () => {
    if (!est.travelConfirmed || (est.surveyRequired && !((store.surveys || []).find(v => v.oppId === opp.id)?.report))) return
    store.requestApproval({
      oppId: opp.id, type: 'Service offer review', approver: 'AH', needed: ['AH', 'LJS'], anyOf: false,
      detail: `${offerMode} — ${opp.oppName}; ${est.workDays || 0} work days + ${est.travelDays || 0} travel days; engineer ${est.engineer || 'TBC'}.`,
    })
    store.updateServiceFlow(opp.id, { reviewRequested: true })
  }

  return (
    <div className="ana-grid service-scope-grid">
      {focus === 'offer' && <>
        {offerMode === 'Standard Rate Sheet' && <RateSheetPanel opp={opp} est={est} onConfirmSent={onConfirmSent} />}
      </>}
      {focus === 'offer' && <>
        {/* Standard Service is priced from the published rate sheet. */}
      <div className="ana-card c-6 service-estimate-panel">
        <div className="service-panel-kicker">Internal deployment planning</div>
        <div className="ana-title">Service estimate — inputs</div>
        <p className="hint">The rate schedule is published independently. Use this estimate to prepare travel, staffing, and execution readiness.</p>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
          <span className="hint">Rate sheet</span>
          {['India', 'International'].map(m => (
            <button key={m} className={sheet === m ? 'primary' : ''} onClick={() => upd({ sheet: m })}>{m}</button>
          ))}
          <span className="hint">currency {rs.currency}, GST {rs.gst}%</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {NUM_FIELDS.map(([k, label]) => (
            <label key={k} className="service-form-field">
              {label}
              <input className="service-form-control service-number-input" type="number" min="0" value={est[k] ?? ''} placeholder="0"
                onChange={e => upd({ [k]: e.target.value === '' ? '' : Math.max(0, Number(e.target.value) || 0) })}
                onBlur={() => { if (est[k] === '') upd({ [k]: 0 }) }} />
            </label>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          <label className="service-form-field">
            Engineer
            <input className="service-form-control" value={est.engineer || ''} placeholder="Name / availability"
              onChange={e => upd({ engineer: e.target.value })} />
          </label>
          <label className="service-form-field">
            Mobilisation date
            <input className="service-form-control" type="date" value={est.mobilisation || ''}
              onChange={e => upd({ mobilisation: e.target.value })} />
          </label>
        </div>
        <label className="service-form-field service-form-field-spaced">
          Tools / certifications
          <input className="service-form-control" value={est.toolsCerts || ''} placeholder="e.g. balancing kit, permits"
            onChange={e => upd({ toolsCerts: e.target.value })} />
        </label>
        <div className="check-row" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={!!est.travelConfirmed}
            onChange={e => upd({ travelConfirmed: e.target.checked })} />
          <span>Confirm entered travel days</span>
          {est.travelConfirmed
            ? <Chip tone="state-Accepted">Confirmed</Chip>
            : <Chip tone="state-Blocks">Blocks execution</Chip>}
        </div>
        <div className={evidenceReady ? 'okbox' : 'warnbox'} style={{ marginTop: 10 }}>
          {evidenceReady ? 'Estimate and survey evidence are ready for execution.' : 'Confirm travel days before Service Execution.'}
        </div>
        {onLegacyReview && (
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="primary" disabled={!est.travelConfirmed || (est.surveyRequired && !((store.surveys || []).find(v => v.oppId === opp.id)?.report)) || !!reviewApproval} onClick={requestServiceReview}>
              <Icon name="users" size={13} /> {reviewApproval ? 'Service review submitted' : 'Request one Service Review'}
            </button>
          </div>
        )}
        {reviewApproval && <div className={reviewApproval.status === 'Approved' ? 'okbox' : 'warnbox'}>One combined Service Review: {reviewApproval.status}. Track the decision on Approvals.</div>}
        {!onLegacyReview && (
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
    </div>
  )
}
