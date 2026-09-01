import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { B_STEPS as ALL_B_STEPS, ROLES, defaultBStepOwners } from '../seed.js'
import { isAdminRole } from '../utils.js'
import { Chip } from '../ui.jsx'
import { Icon } from '../icons.jsx'

// Brownfield B-01..B-05 are sequential approvals with configurable ownership.
// LJS/AH/admin assign the responsible internal user; only that user (or an
// admin acting for them) can sign or reopen the step.
export default function BSteps({ opp, steps = ALL_B_STEPS, title = 'Brownfield workflow - B-01 to B-05' }) {
  const store = useStore()
  const signed = (store.bSteps || {})[opp.id] || {}
  const assignments = { ...defaultBStepOwners(opp), ...((store.bStepOwners || {})[opp.id] || {}) }
  const canAssign = store.role === 'LJS' || store.role === 'AH' || isAdminRole(store.role)
  const assignableRoles = Object.entries(ROLES).filter(([, role]) => !role.external)
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
          Each activity is assigned to a responsible person and must be signed in order before the proposal
          can go for approval. Revisions reopen the step that owns the change.
        </p>
        {!canAssign && (
          <div className="warnbox">
            Read-only assignments - LJS, AH, or an administrator must assign the responsible person.
          </div>
        )}
      </div>

      {steps.map(step => {
        const rec = signed[step.id]
        const ok = rec?.state === 'Signed'
        const isNext = step.id === nextUp
        const waiting = !ok && !isNext
        const assignedTo = assignments[step.id]
        const mayAct = store.role === assignedTo || isAdminRole(store.role)
        return (
          <div key={step.id} className="ana-card c-6">
            <div className="ana-title">
              {step.id} - {step.label}
              <span className="hint">Owner: {assignedTo}</span>
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
              <p className="hint">Awaiting sign-off from {assignedTo}.</p>
            )}

            {canAssign && (
              <label className="hint" style={{ display: 'block', marginTop: 8 }}>
                Responsible person{' '}
                <select value={assignedTo} onChange={event => store.assignBStep(opp.id, step.id, event.target.value)}>
                  {assignableRoles.map(([id, role]) => <option key={id} value={id}>{id} - {role.name}</option>)}
                </select>
              </label>
            )}
          </div>
        )
      })}
    </div>
  )
}
