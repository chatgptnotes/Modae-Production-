import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { ROLES } from '../seed.js'
import { ErrBox } from '../ui.jsx'
import { releaseState } from '../gates.js'
import { Icon } from '../icons.jsx'

// Customer send — only unlocked by an approved 'Final quote release'
// and a three-point human-in-the-loop checklist.
export default function SubmissionPanel({ opp }) {
  const store = useStore()
  const p = store.getProposal(opp.id)
  const [checks, setChecks] = useState({ c1: false, c2: false, c3: false })
  const [sentNow, setSentNow] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [attachment, setAttachment] = useState(null)

  // Scoped to the proposal's current revision — a quote revised after release
  // locks submission again until the revision is approved.
  const { release } = releaseState(p, store.approvals, opp.id)
  const pendingConds = store.approvals
    .filter(a => a.oppId === opp.id && a.status === 'Approved with conditions')
    .flatMap(a => (a.conditions || []).filter(c => !c.incorporated)
      .map(c => ({ ...c, approver: a.approver, type: a.type })))
  const alreadySent = (store.communications[opp.id] || []).some(c => c.kind === 'submission')

  if (!release) {
    return (
      <div className="form-card">
        <div className="section-title">Submission (simulated send)</div>
        <p className="hint">
          Release approval pending — submission opens once a 'Final quote release' is approved.
          Prepare the proposal in the builder and submit it for approval first.
        </p>
      </div>
    )
  }

  const customer = (store.customers || []).find(c => c.id === opp.sellTo || c.name === opp.sellTo)
  const to = opp.contactEmail || customer?.email || ''
  const subject = `Proposal — ${opp.oppName} (${opp.id} Rev ${p.revision})`
  const allChecked = checks.c1 && checks.c2 && checks.c3
  const canSend = allChecked && !pendingConds.length && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) && attachment

  const send = async () => {
    setSending(true)
    setSendError('')
    try {
      const bytes = new Uint8Array(await attachment.arrayBuffer())
      let binary = ''
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      const response = await fetch('/api/send-proposal-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          oppId: opp.id,
          to,
          subject,
          body: `Dear Sir/Madam,\n\nPlease find our approved Techno-Commercial Proposal ${opp.id}, revision ${p.revision}.\n\nBest regards,\nModAE India Pvt Ltd`,
          attachment: { filename: attachment.name, mimeType: attachment.type, contentBase64: btoa(binary) },
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.ok) throw new Error(result.error || 'Email could not be sent')
      store.addCommunication(opp.id, { to, subject, kind: 'submission', messageId: result.messageId, status: 'sent' })
      store.updateOpportunity(opp.id, {
        milestone: 'Submitted',
        proposalDate: new Date().toISOString().slice(0, 10),
      })
      setSentNow(true)
    } catch (error) {
      setSendError(error?.message || 'Email could not be sent')
    } finally {
      setSending(false)
    }
  }

  const rows = [
    ['From', 'Configured Gmail account'],
    ['To', to || 'Customer email required'],
    ['CC', 'sales@mod-ae.com'],
    ['Subject', subject],
    ['Attachment', attachment?.name || `${opp.id}_Proposal_Rev_${p.revision}.pdf required`],
  ]

  return (
    <div className="form-card">
      <div className="section-title">Submission (customer email)</div>
      <table className="cost-table" style={{ width: '100%' }}>
        <tbody>
          {rows.map(([k, v]) => <tr key={k}><td style={{ width: 90 }}><b>{k}</b></td><td>{v}</td></tr>)}
        </tbody>
      </table>
      <label style={{ display: 'block', marginTop: 10 }}>
        Proposal PDF attachment *
        <input type="file" accept="application/pdf" style={{ display: 'block', marginTop: 4 }}
          onChange={e => { setAttachment(e.target.files?.[0] || null); setSendError('') }} />
      </label>

      {pendingConds.length > 0 && (
        <ErrBox>
          {pendingConds.length} approval condition{pendingConds.length === 1 ? '' : 's'} not yet confirmed incorporated —
          the proposal cannot go to the customer until every one is accounted for in the builder.
          {pendingConds.map((c, i) => <div key={i} style={{ marginTop: 4 }}>"{c.text}" — set by {c.approver}</div>)}
        </ErrBox>
      )}

      <div className="section-title" style={{ marginTop: 10 }}>Human review required</div>
      {[
        ['c1', 'Customer-facing prices and validity verified'],
        ['c2', 'No restricted commercial data in the document'],
        ['c3', `Named reviewer: ${ROLES[store.role]?.name || store.role}`],
      ].map(([k, label]) => (
        <div key={k} className="check-row">
          <input type="checkbox" checked={checks[k]}
            onChange={e => setChecks({ ...checks, [k]: e.target.checked })} />
          <span>{label}</span>
        </div>
      ))}

      <div style={{ marginTop: 10 }}>
        {sendError && <ErrBox>{sendError}</ErrBox>}
        <button className="primary" disabled={!canSend || sending}
          title={pendingConds.length ? 'Confirm all approval conditions first' : !allChecked ? 'Complete the human-review checklist' : !to ? 'Customer email is missing' : !attachment ? 'Attach the proposal PDF' : ''}
          onClick={send}>
          <Icon name="send" size={13} /> {sending ? 'Sending…' : 'Send quote email'}
        </button>
      </div>
      {(sentNow || alreadySent) && (
        <div className="okbox">Proposal email sent — logged in Communications; milestone moved to Submitted.</div>
      )}
    </div>
  )
}
