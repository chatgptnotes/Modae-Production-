import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { ROLES } from '../seed.js'
import { ErrBox } from '../ui.jsx'
import { releaseState } from '../gates.js'
import { Icon } from '../icons.jsx'

// Simulated customer send — only unlocked by an approved 'Final quote release'
// and a three-point human-in-the-loop checklist.
export default function SubmissionPanel({ opp }) {
  const store = useStore()
  const p = store.getProposal(opp.id)
  const [checks, setChecks] = useState({ c1: false, c2: false, c3: false })
  const [sentNow, setSentNow] = useState(false)

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

  const from = `${opp.owner.toLowerCase()}@mod-ae.com`
  const to = opp.contactPerson || opp.sellTo
  const subject = `Proposal — ${opp.oppName} (${opp.id} Rev ${p.revision})`
  const allChecked = checks.c1 && checks.c2 && checks.c3
  const canSend = allChecked && !pendingConds.length

  const send = () => {
    store.addCommunication(opp.id, { to, subject, kind: 'submission' })
    store.updateOpportunity(opp.id, {
      milestone: 'Submitted',
      proposalDate: new Date().toISOString().slice(0, 10),
    })
    setSentNow(true)
  }

  const rows = [
    ['From', `${from} (sales owner's personal mailbox)`],
    ['To', to],
    ['CC', 'sales@mod-ae.com'],
    ['Subject', subject],
    ['Attachment', `${opp.id} Proposal Workbook`],
  ]

  return (
    <div className="form-card">
      <div className="section-title">Submission (simulated send)</div>
      <table className="cost-table" style={{ width: '100%' }}>
        <tbody>
          {rows.map(([k, v]) => <tr key={k}><td style={{ width: 90 }}><b>{k}</b></td><td>{v}</td></tr>)}
        </tbody>
      </table>

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
        <button className="primary" disabled={!canSend}
          title={pendingConds.length ? 'Confirm all approval conditions first' : !allChecked ? 'Complete the human-review checklist' : ''}
          onClick={send}>
          <Icon name="send" size={13} /> Simulate send
        </button>
      </div>
      {(sentNow || alreadySent) && (
        <div className="okbox">Proposal sent (simulated) — logged in Communications; milestone moved to Submitted.</div>
      )}
    </div>
  )
}
