import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { Chip } from '../ui.jsx'
import { serviceOfferCleared } from '../gates.js'

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
  // Cleared means "this offer may be in front of the customer" — no approval for
  // published Path A rates, the single review for legacy records, §5 otherwise.
  const review = serviceOfferCleared(opp, store.getProposal(opp.id), store)
  return <div className="ana-grid">
    <div className="ana-card c-12">
      <div className="ana-title">Customer decision {est.customerDecision && <Chip tone={est.customerDecision === 'Accepted' ? 'state-Accepted' : 'state-Review'}>{est.customerDecision}</Chip>}</div>
      {!review && <div className="warnbox">Record a decision once the offer has been approved for release to the customer.</div>}
      <p className="hint">Record the customer’s single response. Changes create a revision and return to the offer stage without restarting intake.</p>
      <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Acceptance, requested change, or rejection reason" style={{ width: '100%' }} />
      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['Accepted', 'Changes requested', 'Rejected'].map(decision => <button key={decision} className={decision === 'Accepted' ? 'primary' : ''} disabled={!review || (decision === 'Rejected' && !note.trim())} onClick={() => record(decision)}>{decision}</button>)}
      </div>
      <div className="hint">A rejection requires a reason in the note above.</div>

      {/* Spec Scenario 2. Published rates carry no approval; the moment one is
          discounted the pricing thresholds apply and route it for sign-off. */}
      {(est.offerMode || est.aiOfferMode) === 'Standard Rate Sheet' && (
        <>
          <div className="section-title" style={{ marginTop: 12 }}>Negotiated rates</div>
          <label style={{ fontSize: 12, display: 'block', maxWidth: 260 }}>Discount off the published sheet (%)
            <input type="number" min="0" max="100" value={est.rateDiscountPct ?? ''} placeholder="0"
              onChange={e => store.updateServiceFlow(opp.id, { rateDiscountPct: Math.max(0, Math.min(100, +e.target.value || 0)) })}
              style={{ width: '100%' }} />
          </label>
          <p className="hint">
            {Number(est.rateDiscountPct) > 0
              ? 'Discounted — this offer now needs technical, commercial and margin approval before it can be released.'
              : 'Selling at published rates. No approval is required.'}
          </p>
        </>
      )}
      {est.customerDecision && <div className={est.customerDecision === 'Accepted' ? 'okbox' : 'warnbox'} style={{ marginTop: 10 }}>Recorded: {est.customerDecision}{est.revision ? ` · revision ${est.revision}` : ''}{est.customerNote ? ` — ${est.customerNote}` : ''}</div>}
    </div>
  </div>
}
