import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { B_STEPS } from '../seed.js'
import { isAdminRole } from '../utils.js'
import { Chip } from '../ui.jsx'
import { Icon } from '../icons.jsx'

// Diagram 02 §3 — the Brownfield activity chain, B-01 Requirement Validation
// through B-05 Proposal Generation. The diagram's own footnote is the access
// rule: "All above activities are approved only by Assigned Salesperson", so
// the sign-off buttons belong to the opportunity owner alone; everyone else
// reads the ledger. `readiness()` blocks the proposal until all five are
// signed, which is why this panel is the way out of that block.
export default function BSteps({ opp }) {
  const store = useStore()
  const signed = (store.bSteps || {})[opp.id] || {}
  // An admin acts for the owner (the same latitude every other owner-scoped
  // action on the workbench gives them), nobody else.
  const maySign = store.role === opp.owner || isAdminRole(store.role)
  const [notes, setNotes] = useState({})
  const [reopening, setReopening] = useState({})

  const isSigned = id => signed[id]?.state === 'Signed'
  const open = B_STEPS.filter(s => !isSigned(s.id))
  const done = B_STEPS.length - open.length
  // Sequential: each step feeds the next, so B-0n waits on B-0(n-1).
  const nextUp = open[0]?.id

  const sign = id => {
    store.signBStep(opp.id, id, (notes[id] || '').trim())
    setNotes({ ...notes, [id]: '' })
  }
  const reopen = id => {
    const reason = (reopening[id] || '').trim()
    if (!reason) return
    store.unsignBStep(opp.id, id, reason)
    setReopening({ ...reopening, [id]: undefined })
  }

  return (
    <div className="ana-grid">
      <div className="ana-card c-12">
        <div className="ana-title">
          Brownfield workflow — B-01 to B-05 <Chip tone={done === B_STEPS.length ? 'state-Accepted' : 'grey'}>{done} of {B_STEPS.length} signed</Chip>
        </div>
        <p className="hint">
          Every activity is signed off by the assigned salesperson ({opp.owner}) before the proposal
          can go for approval. A revision routes the rework back to the step that owns it and reopens it.
        </p>
        {!maySign && (
          <div className="warnbox">
            Read-only — these activities are signed off by the assigned salesperson ({opp.owner}) only.
          </div>
        )}
      </div>

      {B_STEPS.map(step => {
        const rec = signed[step.id]
        const ok = rec?.state === 'Signed'
        const isNext = step.id === nextUp
        const waiting = !ok && !isNext
        return (
          <div key={step.id} className="ana-card c-6">
            <div className="ana-title">
              {step.id} · {step.label}
              {ok
                ? <Chip tone="state-Accepted">Signed</Chip>
                : isNext ? <Chip tone="state-Review">Next</Chip> : <Chip tone="grey">Waiting</Chip>}
            </div>
            {step.points.map(pt => (
              <div key={pt} className="check-row">
                <Icon name={ok ? 'checkCircle' : 'list'} size={13} />
                <span>{pt}</span>
              </div>
            ))}

            {ok ? (
              <>
                <div className="okbox">
                  Signed by {rec.by} · {(rec.at || '').slice(0, 10)}
                  {rec.note ? <div className="hint">{rec.note}</div> : null}
                </div>
                {maySign && (reopening[step.id] === undefined ? (
                  <button onClick={() => setReopening({ ...reopening, [step.id]: '' })}>Reopen step</button>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input placeholder="Reason for reopening (logged)" style={{ flex: 1 }}
                      value={reopening[step.id]}
                      onChange={e => setReopening({ ...reopening, [step.id]: e.target.value })} />
                    <button className="primary" disabled={!reopening[step.id].trim()}
                      onClick={() => reopen(step.id)}>Reopen</button>
                  </div>
                ))}
              </>
            ) : waiting ? (
              <p className="hint">Waiting on {nextUp} — the activities are signed in order.</p>
            ) : maySign ? (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input placeholder="Sign-off note (optional)" style={{ flex: 1 }}
                  value={notes[step.id] || ''}
                  onChange={e => setNotes({ ...notes, [step.id]: e.target.value })} />
                <button className="primary" onClick={() => sign(step.id)}>
                  <Icon name="check" size={13} /> Sign off {step.id}
                </button>
              </div>
            ) : (
              <p className="hint">Awaiting sign-off from {opp.owner}.</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
