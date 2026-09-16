import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { Chip } from '../ui.jsx'

export default function ServiceDecisionPanel({ opp }) {
  const store = useStore()
  const est = store.svcEstimates.find(e => e.oppId === opp.id) || { oppId: opp.id }
  const [note, setNote] = useState('')
  const record = decision => {
    if (decision === 'Rejected' && !note.trim()) return
    store.updateServiceFlow(opp.id, {
      customerDecision: decision,
      customerNote: note.trim(),
      customerDecisionOn: new Date().toISOString().slice(0, 10),
      ...(decision === 'Changes requested' ? { revision: (est.revision || 0) + 1 } : {}),
    })
    setNote('')
  }
  const review = (store.approvals || []).find(a => a.oppId === opp.id && a.type === 'Service offer review' && ['Approved', 'Approved with conditions'].includes(a.status))
  return <div className="ana-grid">
    <div className="ana-card c-12">
      <div className="ana-title">Customer decision {est.customerDecision && <Chip tone={est.customerDecision === 'Accepted' ? 'state-Accepted' : 'state-Review'}>{est.customerDecision}</Chip>}</div>
      {!review && <div className="warnbox">Customer decision is available after the combined Service Review is approved.</div>}
      <p className="hint">Record the customer’s single response. Changes create a revision and return to the offer stage without restarting intake.</p>
      <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Acceptance, requested change, or rejection reason" style={{ width: '100%' }} />
      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['Accepted', 'Changes requested', 'Rejected'].map(decision => <button key={decision} className={decision === 'Accepted' ? 'primary' : ''} disabled={!review || (decision === 'Rejected' && !note.trim())} onClick={() => record(decision)}>{decision}</button>)}
      </div>
      <div className="hint">A rejection requires a reason in the note above.</div>
      {est.customerDecision && <div className={est.customerDecision === 'Accepted' ? 'okbox' : 'warnbox'} style={{ marginTop: 10 }}>Recorded: {est.customerDecision}{est.revision ? ` · revision ${est.revision}` : ''}{est.customerNote ? ` — ${est.customerNote}` : ''}</div>}
    </div>
  </div>
}
