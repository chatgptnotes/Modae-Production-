import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { Chip } from '../ui.jsx'
import { fmt, ddMmmYY } from '../utils.js'
import { Icon } from '../icons.jsx'

// Customer-facing portal shell (role CUST sees only this). Internal IDs,
// pricing and assessments are deliberately absent — statuses are translated
// to customer-friendly wording.

const FRIENDLY = {
  Intake: 'Request received', Qualification: 'Request received', 'Customer/KYC': 'Under review',
  Registration: 'Request registered', Screening: 'Under review', Clarification: 'Awaiting your clarification',
  Sourcing: 'Proposal in preparation', Proposal: 'Proposal in preparation', Approval: 'Proposal in final review',
  Submitted: 'Proposal sent to you', 'Follow-up': 'Awaiting your decision', 'PO Validation': 'Order under validation',
  Handover: 'Order confirmed',
}
const FRIENDLY_TONE = { 'Proposal sent to you': 'state-Review', 'Order confirmed': 'state-Accepted', 'Order under validation': 'state-Review' }

// The 2-3 seeded requests the demo walks through (fallback: first open opps).
const PORTAL_OPP_IDS = ['2608222RS', '2608219PP', '2607215RS']

export default function Portal() {
  const store = useStore()
  const [answers, setAnswers] = useState({})
  const custNames = Object.keys(store.kyc || {})
  const [kycCust, setKycCust] = useState(custNames[0] || '')

  let requests = PORTAL_OPP_IDS.map(id => store.opportunities.find(o => o.id === id)).filter(Boolean)
  if (!requests.length) {
    requests = store.opportunities.filter(o => o.status === 'Open' && o.customerStatus !== undefined).slice(0, 3)
  }

  const openClars = (store.clarifications || []).filter(c => c.audience === 'Customer' && c.status !== 'Answered')
  const answeredClars = (store.clarifications || []).filter(c => c.audience === 'Customer' && c.status === 'Answered')

  const fee = store.config?.amberFee || { amount: 25000, cur: 'INR', days: 7 }
  const amberOpp = store.opportunities.find(o => o.status === 'Open' && o.customerStatus === 'Amber')

  const submissions = Object.entries(store.communications || {})
    .flatMap(([oppId, rows]) => (rows || []).filter(r => r.kind === 'submission').map(r => ({ ...r, oppId })))
    .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
  const latestSub = submissions[0]
  const acked = latestSub && (store.communications[latestSub.oppId] || []).some(r => r.kind === 'ack')

  const sendAnswer = c => {
    const response = (answers[c.id] || '').trim()
    if (!response) return
    store.updateClarification(c.id, { response, status: 'Answered' })
    setAnswers(a => ({ ...a, [c.id]: '' }))
  }

  return (
    <div className="page">
      <h2>Customer portal — ModAE WinTrack</h2>
      <div className="hint" style={{ marginBottom: 14, maxWidth: 680 }}>
        Simulated customer-facing view. In production this is a separate authenticated site on its own
        domain — customers never see the internal WinTrack screens, and only their own requests appear here.
      </div>

      <div className="ana-grid">
        <div className="ana-card c-6">
          <div className="ana-title">Your requests</div>
          <ul className="stat-list">
            {requests.map(o => {
              const friendly = FRIENDLY[o.milestone] || 'Under review'
              return (
                <li key={o.id}>
                  <span>{o.oppName.slice(0, 52)} <span className="hint">{o.sellTo}</span></span>
                  <b><Chip tone={FRIENDLY_TONE[friendly] || 'grey'}>{friendly}</Chip></b>
                </li>
              )
            })}
            {!requests.length && <li className="hint-li">No active requests on record.</li>}
          </ul>
          <div className="hint" style={{ marginTop: 6 }}>Internal assessments and pricing details are not displayed here.</div>
        </div>

        <div className="ana-card c-6">
          <div className="ana-title">Clarifications from ModAE</div>
          {openClars.map(c => (
            <div key={c.id} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12.5, marginBottom: 4 }}>{c.q}</div>
              <div className="hint" style={{ marginBottom: 4 }}>Requested by {ddMmmYY(c.due)}</div>
              <textarea rows={2} style={{ width: '100%' }} placeholder="Type your answer…"
                value={answers[c.id] || ''}
                onChange={e => setAnswers(a => ({ ...a, [c.id]: e.target.value }))} />
              <button style={{ marginTop: 4 }} disabled={!(answers[c.id] || '').trim()} onClick={() => sendAnswer(c)}>
                <Icon name="send" size={12} /> Submit answer
              </button>
            </div>
          ))}
          {answeredClars.map(c => (
            <div key={c.id} className="okbox">Answered: {c.q.slice(0, 70)}… — “{c.response}”</div>
          ))}
          {!openClars.length && !answeredClars.length && <div className="hint">No open clarifications right now.</div>}
        </div>

        <div className="ana-card c-6">
          <div className="ana-title">Documents (KYC)</div>
          {custNames.length > 1 && (
            <div style={{ marginBottom: 8 }}>
              <label className="hint" style={{ marginRight: 6 }}>Company</label>
              <select value={kycCust} onChange={e => setKycCust(e.target.value)}>
                {custNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          )}
          {(store.config?.kycItems || []).map(item => {
            const rec = (store.kyc?.[kycCust] || []).find(k => k.name === item)
            const state = rec?.state || 'Missing'
            const done = state === 'Verified' || state === 'Uploaded'
            return (
              <div key={item} className="check-row">
                <span style={{ flex: 1 }}>{item}</span>
                <Chip tone={state === 'Verified' ? 'state-Accepted' : state === 'Uploaded' ? 'state-Review' : state === 'Expired' ? 'state-Rejected' : 'grey'}>{state}</Chip>
                {!done && (
                  <button onClick={() => store.setKycState(kycCust, item, 'Uploaded')}>
                    <Icon name="upload" size={12} /> Upload
                  </button>
                )}
              </div>
            )
          })}
          <div className="hint" style={{ marginTop: 6 }}>Uploads are simulated — no real documents are transferred in this demo.</div>
        </div>

        <div className="ana-card c-6">
          <div className="ana-title">Processing fee</div>
          {amberOpp ? (
            amberOpp.amberFeePaid ? (
              <div className="okbox">
                Payment received — ₹{fmt(fee.amount)} processing fee for “{amberOpp.oppName.slice(0, 48)}”.
                Receipt ref AMB-{amberOpp.id}. Your request is progressing.
              </div>
            ) : (
              <>
                <p style={{ fontSize: 12.5 }}>
                  A processing fee of <b>₹{fmt(fee.amount)}</b> applies to your request
                  “{amberOpp.oppName.slice(0, 48)}” (payable within {fee.days} days).
                </p>
                <button onClick={() => store.updateOpportunity(amberOpp.id, { amberFeePaid: true })}>
                  <Icon name="wallet" size={12} /> Simulate payment
                </button>
                <div className="hint" style={{ marginTop: 6 }}>The payment gateway is simulated — no real transaction occurs.</div>
              </>
            )
          ) : <div className="hint">No processing fee is due on your requests.</div>}
        </div>

        <div className="ana-card c-6">
          <div className="ana-title">Proposal acknowledgement</div>
          {latestSub ? (
            acked ? (
              <div className="okbox">Receipt acknowledged — thank you. Your account manager has been notified.</div>
            ) : (
              <>
                <p style={{ fontSize: 12.5 }}>
                  ModAE sent you a proposal: <b>{latestSub.subject}</b>
                  {latestSub.ts && <span className="hint"> · {ddMmmYY(latestSub.ts.slice(0, 10))}</span>}
                </p>
                <button onClick={() => store.addCommunication(latestSub.oppId, { to: 'sales', subject: 'Proposal acknowledged by customer', kind: 'ack' })}>
                  <Icon name="check" size={12} /> Acknowledge receipt
                </button>
              </>
            )
          ) : <div className="hint">No proposal has been sent yet. Once ModAE submits one, you can acknowledge receipt here.</div>}
        </div>
      </div>
    </div>
  )
}
