import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { ENCLOSURES } from '../proposalDoc.js'
import { SERVICE_RATE_SCHEDULE_URL } from '../proposal/emailAttachments.js'
import { gmailComposeHref, displayRole, fmt } from '../utils.js'
import { normalizeSheet } from '../serviceRates.js'
import { Chip } from '../ui.jsx'
import { Icon } from '../icons.jsx'

// Path A's defining step: the published rate schedule goes to the customer
// *before* the site visit, so the day rates are acknowledged up front and the
// engineer's time can simply be billed against them afterwards. The same PDF
// already rides along with a full service proposal as an enclosure
// (proposalDoc.js `enclosuresFor`), but a standard job never gets that far —
// it needs the sheet on its own, early.
const RATE_PREVIEW = [
  ['Engineer — per day', 'engineerDay'],
  ['Senior engineer — per day', 'seniorDay'],
  ['Travel — per day', 'travelDay'],
  ['Overtime — per hour', 'otHour'],
]

export default function RateSheetPanel({ opp, est }) {
  const store = useStore()
  const sheet = normalizeSheet(est.sheet)
  const rs = store.rateSheets[sheet]
  const customer = (store.customers || []).find(c => c.id === opp.sellTo || c.name === opp.sellTo)
  const enclosure = ENCLOSURES.serviceRates
  const sentLog = (store.communications?.[opp.id] || []).filter(c => c.kind === 'rate-sheet')
  const lastSent = sentLog[0]

  const [emailTo, setEmailTo] = useState(opp.contactEmail || customer?.email || '')
  const [subject, setSubject] = useState(`Service rate schedule — ${opp.oppName} (${opp.id})`)
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
    'Please confirm your acceptance and we will schedule the site visit.', '',
    'Best regards,', displayRole(store.role), 'ModAE',
  ].join('\n')

  const send = () => {
    if (!emailTo.trim()) return
    const href = gmailComposeHref({ to: emailTo, cc: 'sales@mod-ae.com', subject, body })
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
      to: emailTo, cc: 'sales@mod-ae.com', subject, body,
      kind: 'rate-sheet', status: 'draft', revision: String(issue),
      attachmentNames: [enclosure.filename],
    })
    // Sending the published sheet *is* preparing the Path A offer — this is what
    // clears the "Prepare the Standard Rate Sheet or Customized Proposal" blocker.
    store.updateServiceFlow(opp.id, {
      rateSheetRev: issue,
      rateSheetSentOn: new Date().toISOString().slice(0, 10),
      offerPrepared: true,
      offerPreparedOn: new Date().toISOString().slice(0, 10),
    })
    setDrafted(id)
  }

  const markSent = () => {
    store.updateCommunication(opp.id, drafted || lastSent?.id, { status: 'sent' }, 'Rate schedule marked as sent')
    setDrafted('')
  }

  const pendingDraft = drafted || (lastSent?.status === 'draft' ? lastSent.id : '')

  return (
    <div className="ana-card c-12">
      <div className="ana-title">
        Standard rate schedule
        {est.rateSheetSentOn
          ? <Chip tone="state-Accepted">Issue {est.rateSheetRev} sent {est.rateSheetSentOn}</Chip>
          : <Chip tone="state-Blocks">Not issued</Chip>}
      </div>
      <p className="hint">
        Sent before the site visit so the customer accepts the published day rates up front.
        Billing afterwards is on actual engineer days at these rates.
      </p>

      <table className="cost-table" style={{ width: '100%', maxWidth: 420 }}>
        <tbody>
          {RATE_PREVIEW.map(([label, key]) => (
            <tr key={key}><td>{label}</td><td className="num">{money(rs.rates[key])}</td></tr>
          ))}
          <tr><td>Weekend premium</td><td className="num">{rs.rates.weekendPct}%</td></tr>
        </tbody>
      </table>
      <p className="hint">{sheet} schedule · {rs.currency} · attached as {enclosure.filename}</p>

      <div style={{ display: 'grid', gap: 8, marginTop: 10, maxWidth: 560 }}>
        <label style={{ fontSize: 12 }}>To
          <input type="text" value={emailTo} onChange={e => setEmailTo(e.target.value)}
            placeholder="customer@company.com" style={{ width: '100%' }} />
        </label>
        <label style={{ fontSize: 12 }}>Subject
          <input type="text" value={subject} onChange={e => setSubject(e.target.value)} style={{ width: '100%' }} />
        </label>
      </div>

      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="primary" disabled={!emailTo.trim()} onClick={send}>
          <Icon name="send" size={13} /> {est.rateSheetSentOn ? 'Re-issue rate schedule' : 'Download schedule & draft email'}
        </button>
        {pendingDraft && <button onClick={markSent}>Mark as sent</button>}
        {!emailTo.trim() && <span className="hint">A customer address is required.</span>}
      </div>

      {pendingDraft && (
        <div className="warnbox">
          Draft opened in Gmail with {enclosure.filename} downloaded — attach it, send, then mark it as sent here.
        </div>
      )}
      {est.rateSheetSentOn && !pendingDraft && (
        <div className="okbox">
          Issue {est.rateSheetRev} sent on {est.rateSheetSentOn}. Re-issue it if the scope or rates are renegotiated.
        </div>
      )}
    </div>
  )
}
