import React, { useEffect, useState } from 'react'
import { useStore } from '../store.jsx'
import { ENCLOSURES } from '../proposalDoc.js'
import { SERVICE_RATE_SCHEDULE_URL } from '../proposal/emailAttachments.js'
import { gmailComposeHref, displayRole, fmt } from '../utils.js'
import { sheetFor } from '../serviceRates.js'
import { Chip } from '../ui.jsx'
import { Icon } from '../icons.jsx'
import { serviceOfferCleared } from '../gates.js'

// Path A's defining step: after scope and any required survey are complete,
// the published rate schedule goes to the customer before execution, so the
// day rates are acknowledged up front and the engineer's time can simply be
// billed against them afterwards. The same PDF
// already rides along with a full service proposal as an enclosure
// (proposalDoc.js `enclosuresFor`), but a standard job never gets that far —
// it needs the sheet on its own, early.
const RATE_PREVIEW = [
  ['Engineer — per day', 'engineerDay'],
  ['Senior engineer — per day', 'seniorDay'],
  ['Travel — per day', 'travelDay'],
  ['Overtime — per hour', 'otHour'],
]

export default function RateSheetPanel({ opp, est, readOnly = false, onConfirmSent, legacyReview = false, reviewApproval = null, reviewReady = false, onRequestReview }) {
  const store = useStore()
  const sheet = sheetFor(opp, est)
  const rs = store.rateSheets[sheet]
  const customer = (store.customers || []).find(c => c.id === opp.sellTo || c.name === opp.sellTo)
  const enclosure = ENCLOSURES.serviceRates
  const sentLog = (store.communications?.[opp.id] || []).filter(c => c.kind === 'rate-sheet')
  const lastSent = sentLog[0]

  const [emailTo, setEmailTo] = useState(opp.contactEmail || customer?.email || '')
  const [emailCc, setEmailCc] = useState('sales@mod-ae.com')
  const [subject, setSubject] = useState(`Service rate schedule — ${opp.oppName} (${opp.id})`)
  const [emailBody, setEmailBody] = useState('')
  const [drafted, setDrafted] = useState('')

  const money = v => (sheet === 'India' ? `₹ ${fmt(v)}K` : `$ ${fmt(v)}`)
  const issue = (est.rateSheetRev || 0) + 1
  const body = [
    `Dear ${opp.contactPerson || 'Sir / Madam'},`, '',
    `Thank you for your service enquiry (${opp.id}).`, '',
    `Please find attached our ${enclosure.label}. Our engineers are charged on the`,
    'day rates set out in that schedule; weekend and overtime deployment carry the',
    'premiums stated there. The final invoice is raised on the actual engineer days',
    'deployed on site.', '',
    'Please confirm your acceptance and we will confirm the service deployment plan.', '',
    'Best regards,', displayRole(store.role), 'ModAE',
  ].join('\n')
  useEffect(() => {
    setEmailBody(current => current || body)
  }, [body])

  const send = () => {
    if (!emailTo.trim()) return
    const href = gmailComposeHref({ to: emailTo, cc: emailCc, subject, body: emailBody })
    if (!href) return
    // The schedule is a static bundled asset, so it downloads straight from its
    // URL — no base64 round-trip is needed for a single enclosure.
    const link = document.createElement('a')
    link.href = SERVICE_RATE_SCHEDULE_URL
    link.download = enclosure.filename
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.open(href, '_blank', 'noopener')

    const id = 'CM-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    store.addCommunication(opp.id, {
      id, direction: 'outbound', from: store.config?.gmailAccount || 'sales@mod-ae.com',
      to: emailTo, cc: emailCc, subject, body: emailBody,
      kind: 'rate-sheet', status: 'draft', revision: String(issue),
      attachmentNames: [enclosure.filename],
    })
    // Sending the published sheet *is* preparing the Path A offer — this is what
    // clears the "Prepare the Standard Rate Sheet or Customized Proposal" blocker.
    store.updateServiceFlow(opp.id, {
      rateSheetRev: issue,
      offerPrepared: true,
      offerPreparedOn: new Date().toISOString().slice(0, 10),
    })
    setDrafted(id)
  }

  const markSent = () => {
    store.updateCommunication(opp.id, drafted || lastSent?.id, { status: 'sent' }, 'Rate schedule marked as sent')
    store.updateServiceFlow(opp.id, { rateSheetSentOn: new Date().toISOString().slice(0, 10), offerPrepared: true })
    setDrafted('')
    // Let the communication and service-flow updates render before the parent
    // evaluates the handoff blockers.
    if (onConfirmSent) window.setTimeout(onConfirmSent, 0)
  }

  const pendingDraft = drafted || (lastSent?.status === 'draft' ? lastSent.id : '')
  const offerCleared = serviceOfferCleared(opp, store.getProposal(opp.id), store)

  return (
    <div className="ana-card c-12 service-rate-composer">
      <div className="ana-title">
        Standard rate schedule
        {est.rateSheetSentOn
          ? <Chip tone="state-Accepted">Issue {est.rateSheetRev} sent {est.rateSheetSentOn}</Chip>
          : <Chip tone="state-Blocks">Not issued</Chip>}
      </div>
      <div className="service-rate-layout">
        <section className="service-rate-details" aria-label="Standard rate schedule details">
          <p className="hint">
            Sent after scope and any required survey so the customer accepts the published day
            rates before execution. Billing afterwards is on actual engineer days at these rates.
          </p>
          <table className="cost-table" style={{ width: '100%' }}>
            <tbody>
              {RATE_PREVIEW.map(([label, key]) => (
                <tr key={key}><td>{label}</td><td className="num">{money(rs.rates[key])}</td></tr>
              ))}
              <tr><td>Weekend premium</td><td className="num">{rs.rates.weekendPct}%</td></tr>
            </tbody>
          </table>
          <p className="hint">{sheet} schedule · {rs.currency} · attached as {enclosure.filename}</p>
          <p style={{ marginTop: 8 }}>
            <a href={SERVICE_RATE_SCHEDULE_URL} target="_blank" rel="noreferrer">Preview rate schedule</a>
          </p>
        </section>

        <section className="service-rate-email" aria-label="Customer rate schedule email">
          <div className="service-rate-email-heading">Review customer email</div>
          <p className="hint">Edit the message, open Gmail, attach the rate schedule, send it, then confirm the email was sent.</p>
          <div className="service-form-stack">
            <label className="service-form-field">To
              <input className="service-form-control" type="text" value={emailTo} disabled={readOnly} onChange={e => setEmailTo(e.target.value)}
                placeholder="customer@company.com" />
            </label>
            <label className="service-form-field">Subject
              <input className="service-form-control" type="text" value={subject} disabled={readOnly} onChange={e => setSubject(e.target.value)} />
            </label>
            <label className="service-form-field">CC
              <input className="service-form-control" type="text" value={emailCc} disabled={readOnly} onChange={e => setEmailCc(e.target.value)} />
            </label>
            <label className="service-form-field">Email body
              <textarea className="service-form-control service-rate-email-body" rows={14} value={emailBody} disabled={readOnly}
                onChange={e => setEmailBody(e.target.value)} />
            </label>
          </div>

          <div className="service-rate-email-actions">
            <button className="primary" disabled={readOnly || !offerCleared || !emailTo.trim()} onClick={send}>
              <Icon name="send" size={13} /> {est.rateSheetSentOn ? 'Re-issue rate schedule' : 'Download schedule & draft email'}
            </button>
            {pendingDraft && <button disabled={readOnly} onClick={markSent}>Confirm sent</button>}
            {!emailTo.trim() && <span className="hint">A customer address is required.</span>}
            {!offerCleared && <span className="hint">Approval is required before a discounted rate schedule can be sent.</span>}
          </div>

          {pendingDraft && (
            <div className="warnbox">
              Draft opened in Gmail with {enclosure.filename} downloaded — attach it, send, then confirm sent here.
            </div>
          )}
          {est.rateSheetSentOn && !pendingDraft && (
            <div className="okbox">
              Issue {est.rateSheetRev} sent on {est.rateSheetSentOn}. Re-issue it if the scope or rates are renegotiated.
            </div>
          )}

          {legacyReview && (
            <div className="service-rate-review-inline">
              <div>
                <div className="service-panel-kicker">Legacy exception</div>
                <b>One Service Review</b>
                <p className="hint">This historical Service record retains its combined internal review before customer acceptance.</p>
              </div>
              <button className="primary" disabled={readOnly || !reviewReady || !!reviewApproval} onClick={onRequestReview}>
                <Icon name="users" size={13} /> {reviewApproval ? `Service review ${reviewApproval.status.toLowerCase()}` : 'Request one Service Review'}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
