import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { B_STEPS as ALL_B_STEPS, canSignBStep } from '../seed.js'
import { displayRole } from '../utils.js'
import { Chip } from '../ui.jsx'
import { Icon } from '../icons.jsx'

// Brownfield B-01..B-05 are sequential sign-offs owned by the opportunity's
// assigned salesperson. LJS is the explicit strategic exception.
export default function BSteps({ opp, steps = ALL_B_STEPS, title = 'Brownfield workflow - B-01 to B-05' }) {
  const store = useStore()
  const signed = (store.bSteps || {})[opp.id] || {}
  const [notes, setNotes] = useState({})
  const [reopening, setReopening] = useState({})

  const isSigned = id => signed[id]?.state === 'Signed'
  const open = steps.filter(step => !isSigned(step.id))
  const done = steps.length - open.length
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
          {title} <Chip tone={done === steps.length ? 'state-Accepted' : 'grey'}>{done} of {steps.length} signed</Chip>
        </div>
        <p className="hint">
          The Opportunity Owner, or LJS, must sign each activity in order before the proposal can go
          for approval. Revisions reopen the step that owns the change.
        </p>
      </div>

      {steps.map(step => {
        const rec = signed[step.id]
        const ok = rec?.state === 'Signed'
        const isNext = step.id === nextUp
        const waiting = !ok && !isNext
        const mayAct = canSignBStep(store.role, opp)
        return (
          <div key={step.id} className={'ana-card c-6' + (isNext ? ' b-step-current' : '')}>
            <div className="ana-title">
              {step.id} - {step.label}
              <span className="hint">Opportunity Owner: {displayRole(opp.owner)}</span>
              {ok
                ? <Chip tone="state-Accepted">Signed</Chip>
                : isNext ? <Chip tone="state-Review">Next</Chip> : <Chip tone="grey">Waiting</Chip>}
            </div>
            {step.points.map(point => (
              <div key={point} className="check-row">
                <Icon name={ok ? 'checkCircle' : 'list'} size={13} />
                <span>{point}</span>
              </div>
            ))}

            {ok ? (
              <>
                <div className="okbox">
                  Signed by {rec.by} - {(rec.at || '').slice(0, 10)}
                  {rec.note ? <div className="hint">{rec.note}</div> : null}
                </div>
                {mayAct && (reopening[step.id] === undefined ? (
                  <button onClick={() => setReopening({ ...reopening, [step.id]: '' })}>Reopen step</button>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input placeholder="Reason for reopening (logged)" style={{ flex: 1 }}
                      value={reopening[step.id]}
                      onChange={event => setReopening({ ...reopening, [step.id]: event.target.value })} />
                    <button className="primary" disabled={!reopening[step.id].trim()}
                      onClick={() => reopen(step.id)}>Reopen</button>
                  </div>
                ))}
              </>
            ) : waiting ? (
              <p className="hint">Waiting on {nextUp} - the activities are signed in order.</p>
            ) : mayAct ? (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input placeholder="Sign-off note (optional)" style={{ flex: 1 }}
                  value={notes[step.id] || ''}
                  onChange={event => setNotes({ ...notes, [step.id]: event.target.value })} />
                <button className="primary" onClick={() => sign(step.id)}>
                  <Icon name="check" size={13} /> Sign off {step.id}
                </button>
              </div>
            ) : (
              <p className="hint">Awaiting sign-off from {displayRole(opp.owner)} or LJS.</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
