import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { canPriceProposal } from '../utils.js'
import { Chip, AiBadge } from '../ui.jsx'
import { Icon } from '../icons.jsx'
import SurveyPanel from './SurveyPanel.jsx'
import RateSheetPanel from './RateSheetPanel.jsx'
import { serviceCost, estimateQuantities, serviceMoney, serviceAbsolute, sheetFor } from '../serviceRates.js'
import { serviceMatrixExempt, legacyServiceReview, serviceOfferCleared } from '../gates.js'

const DEFAULT_EST = {
  workDays: 1, travelDays: 1, dailyHours: 8, otHours: 0,
  weekendDays: 0, standbyDays: 0, engineer: '', mobilisation: '', toolsCerts: '',
  travelConfirmed: false,
}

const NUM_FIELDS = [
  ['workDays', 'Working days'], ['travelDays', 'Travel days'], ['dailyHours', 'Daily hours'],
  ['otHours', 'Overtime hours'], ['weekendDays', 'Weekend days'], ['standbyDays', 'Standby days'],
]

const serviceText = opp => [
  opp?.oppName, opp?.remarks, opp?.solution, opp?.product,
].flat().filter(Boolean).join(' ').toLowerCase()

// Step 2 of the workflow: what does this enquiry actually need? The three
// sources are what decide the lane, so they are a field the salesperson
// confirms rather than something inferred from the opportunity's name.
export const REQUIREMENT_SOURCES = ['Site visit', 'SoW / Proposal', 'AMC']

// AMC and a formal Statement of Work both mean a customised proposal. A site
// visit on its own does not — a standard inspection is still rate-sheet work.
const offerForSources = sources =>
  (sources.includes('AMC') || sources.includes('SoW / Proposal')
    ? 'Customized Proposal'
    : 'Standard Rate Sheet')

// The AI's opening guess, from the enquiry text. It seeds the checkboxes; the
// confirmed field is what the rest of the flow reads.
const aiSourcesFor = opp => {
  const text = serviceText(opp)
  const sources = []
  if (/amc|annual maintenance|recurring maintenance/.test(text)) sources.push('AMC')
  if (/statement of work|\bsow\b|\bboq\b|complex|diagnostic|long[- ]duration|negotiat/.test(text)) sources.push('SoW / Proposal')
  if (/survey|site visit|inspection|troubleshoot/.test(text)) sources.push('Site visit')
  return sources
}

const suggestedOfferFor = opp => offerForSources(aiSourcesFor(opp))

// Reactive-service workbench: rate-sheet driven cost build-up with the manual
// travel-estimate confirmation gate.
export default function WbService({ opp, openBuilder }) {
  const store = useStore()
  const comm = canPriceProposal(store.role)
  const est = store.svcEstimates.find(e => e.oppId === opp.id) || { oppId: opp.id, ...DEFAULT_EST }
  // The site's location picks the sheet; the toggle below stays as an override
  // for the cases the address does not settle.
  const sheet = sheetFor(opp, est)
  const rs = store.rateSheets[sheet]
  const suggestedOffer = est.aiOfferMode || suggestedOfferFor(opp)
  const offerMode = est.offerMode || suggestedOffer
  // Until it is confirmed the field shows the AI's reading of the enquiry.
  const requirementSource = est.requirementSource || aiSourcesFor(opp)
  const scopeConfirmed = !!est.scopeConfirmed
  // Three approval regimes meet here. A published-rate Path A offer needs none;
  // an opportunity raised before 22 Sep still runs its single combined review;
  // everything else is approved as a proposal under §5.
  const exempt = serviceMatrixExempt(opp, store)
  const onLegacyReview = !!legacyServiceReview(opp, store.approvals)
  const reviewApproval = onLegacyReview
    ? (store.approvals || []).find(a => a.oppId === opp.id && a.type === 'Service offer review' && ['Pending', 'Approved', 'Approved with conditions'].includes(a.status))
    : null
  const [sent, setSent] = useState(false)
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
      aiOfferMode: suggestedOffer, offerMode, requirementSource, scopeConfirmed: true,
      // A site visit or a formal SoW is what makes the survey sub-flow apply.
      surveyRequired: est.surveyRequired || requirementSource.some(s => s === 'Site visit' || s === 'SoW / Proposal'),
    })
  }

  const requestServiceReview = () => {
    if (!scopeConfirmed || !est.travelConfirmed || (est.surveyRequired && !((store.surveys || []).find(v => v.oppId === opp.id)?.sow))) return
    store.requestApproval({
      oppId: opp.id, type: 'Service offer review', approver: 'AH', needed: ['AH', 'LJS'], anyOf: false,
      detail: `${offerMode} — ${opp.oppName}; ${est.workDays || 0} work days + ${est.travelDays || 0} travel days; engineer ${est.engineer || 'TBC'}.`,
    })
    store.updateServiceFlow(opp.id, { reviewRequested: true })
  }

  const sendToProposal = () => {
    if (est.serviceLineAdded) return
    const p = store.getProposal(opp.id)
    const listPrice = serviceAbsolute(sheet, total)
    store.saveProposal(opp.id, {
      ...p,
      bom: [...(p.bom || []), {
        itemCategory: 'Service', pn: 'SVC-REACTIVE',
        desc: `Reactive service — ${est.workDays || 0} days on site`,
        listPrice, adders: [], qtyPerUnit: 0, common: 1, spares: 0, quoted: '',
        list: 'Ad-hoc', currency: rs.currency,
      }],
    })
    store.updateServiceFlow(opp.id, { serviceLineAdded: true, offerPrepared: true, offerPreparedOn: new Date().toISOString().slice(0, 10) })
    setSent(true)
  }

  return (
    <div className="ana-grid">
      <div className="ana-card c-12 service-flow-summary">
        <div className="ana-title">Simplified Service flow</div>
        <div className="check-row" style={{ flexWrap: 'wrap' }}>
          {['1 AI identifies', '2 Confirm scope', approvalStep, '4 Customer decision'].map((step, i) => (
            <Chip key={step} tone={i === 0 || (i === 1 && scopeConfirmed) || (i === 2 && approvalCleared) || (i === 3 && est.customerDecision) ? 'state-Accepted' : 'grey'}>{step}</Chip>
          ))}
        </div>
        <p className="hint">
          AI suggests the offer type and you confirm it once.{' '}
          {exempt
            ? 'Published rates need no approval — issue the schedule and record the decision.'
            : onLegacyReview
              ? 'This opportunity runs on its single combined review.'
              : 'Approvals are raised on the proposal.'}{' '}
          A change from the customer creates a revision rather than restarting the workflow.
        </p>
      </div>
      <div className="ana-card c-6">
        <div className="ana-title">AI service identification <AiBadge label="AI suggestion" /></div>
        <p style={{ fontSize: 12.5 }}>AI identified this opportunity as <b>Service</b>.</p>
        <label style={{ fontSize: 12, display: 'block' }}>
          Suggested offer path
          <select value={offerMode} style={{ width: '100%' }} onChange={e => upd({ offerMode: e.target.value })}>
            <option>Standard Rate Sheet</option>
            <option>Customized Proposal</option>
          </select>
        </label>
        <p className="hint">AI suggestion: {suggestedOffer}. Change it only if the scope requires another path.</p>

        <div className="section-title" style={{ marginTop: 10 }}>What does this enquiry need?</div>
        {REQUIREMENT_SOURCES.map(source => (
          <div className="check-row" key={source}>
            <input type="checkbox" checked={requirementSource.includes(source)} disabled={scopeConfirmed}
              onChange={e => {
                const next = e.target.checked
                  ? [...requirementSource, source]
                  : requirementSource.filter(item => item !== source)
                upd({ requirementSource: next, offerMode: offerForSources(next) })
              }} />
            <span>{source}</span>
          </div>
        ))}
        <p className="hint">
          A Statement of Work or an AMC is priced as a customised proposal; a plain site
          visit is still rate-sheet work. Ticking a site visit or SoW raises the survey below.
        </p>
        <button className="primary" disabled={scopeConfirmed} onClick={confirmScope}>{scopeConfirmed ? 'Scope confirmed' : 'Confirm scope and offer path'}</button>
      </div>
      {/* Diagram 02 §4 decides the lane before anything is priced: a standard
          service comes off the rate sheet, a survey-led one off the SoW. */}
      <SurveyPanel opp={opp} est={est} />
      {/* Path A issues the published schedule on its own, pre-visit. Path B
          prices a customised proposal instead and carries the same PDF as an
          enclosure when that proposal is submitted. */}
      {scopeConfirmed && offerMode === 'Standard Rate Sheet' && <RateSheetPanel opp={opp} est={est} />}
      <div className="ana-card c-6">
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
            <button className="primary" disabled={!scopeConfirmed || !est.travelConfirmed || (est.surveyRequired && !((store.surveys || []).find(v => v.oppId === opp.id)?.sow)) || !!reviewApproval} onClick={requestServiceReview}>
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

      <div className="ana-card c-6">
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
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="primary" disabled={!scopeConfirmed || (onLegacyReview && reviewApproval?.status !== 'Approved') || est.serviceLineAdded} onClick={sendToProposal}>
            <Icon name="arrowRight" size={13} /> Send scope to proposal
          </button>
          <span className="hint">{est.serviceLineAdded
            ? 'Service line already added to the proposal.'
            : onLegacyReview
              ? 'Adds one service line to the workbook BoM after the single review is approved.'
              : 'Adds one service line to the workbook BoM, where the §5 approvals are raised.'}</span>
        </div>
        {sent && (
          <div className="okbox">
            Service scope added to the proposal BoM.{' '}
            <a style={{ cursor: 'pointer' }} onClick={openBuilder}>Open the proposal builder</a>
          </div>
        )}
      </div>
    </div>
  )
}
