import React from 'react'
import { useStore } from '../store.jsx'
import { Chip } from '../ui.jsx'
import { engineerDaysFrom, actualQuantities } from '../serviceRates.js'

// The workflow bills on the engineer's *actual* deployment, split by weekday,
// weekend and overtime, because each carries a different rate. `actualEngineerDays`
// stays on the record as the weekday + weekend total: the workbench blockers and
// the seeded rows are written against it.
// [field, label, the quoted field it falls back to when left blank]
const ACTUALS = [
  ['actualWeekdayDays', 'Actual weekday days', 'workDays'],
  ['actualWeekendDays', 'Actual weekend days', 'weekendDays'],
  ['actualOtHours', 'Actual overtime hours', 'otHours'],
  ['actualTravelDays', 'Actual travel days', 'travelDays'],
]

export default function ServiceExecutionPanel({ opp }) {
  const store = useStore()
  const est = store.svcEstimates.find(e => e.oppId === opp.id) || { oppId: opp.id }
  const upd = patch => {
    const next = { ...est, ...patch }
    store.updateServiceFlow(opp.id, { ...patch, actualEngineerDays: engineerDaysFrom(actualQuantities(next)) })
  }
  const accepted = est.customerDecision === 'Accepted'
  const complete = !!est.executionDate && !!est.engineer && Number(est.actualEngineerDays) > 0
  const engineerSuggestions = [...(store.users || [])]
    .filter(user => /engineer|technical|service/i.test(`${user.role || ''} ${user.title || ''} ${user.name || ''}`))
    .map(user => user.name || user.email)
    .filter(Boolean)
    .filter((name, index, names) => names.indexOf(name) === index)
  return <div className="ana-grid">
    <div className="ana-card c-12">
      <div className="ana-title">Execute service {complete && <Chip tone="state-Accepted">Complete</Chip>}</div>
      {!accepted && <div className="warnbox">Record customer acceptance before scheduling execution.</div>}
      <div className="service-form-grid service-form-grid-two">
        <label className="service-form-field">Assigned service engineer
          <input className="service-form-control" list={`service-engineers-${opp.id}`} value={est.engineer || ''} onChange={e => upd({ engineer: e.target.value })} placeholder="Type or select engineer" />
          <datalist id={`service-engineers-${opp.id}`}>{engineerSuggestions.map(name => <option key={name} value={name} />)}</datalist>
          <span className="hint">Assign the engineer responsible for site execution. You can type a name or select a suggestion.</span>
        </label>
        <label className="service-form-field">Service date<input className="service-form-control" type="date" value={est.executionDate || ''} onChange={e => upd({ executionDate: e.target.value })} /></label>
      </div>
      <div className="section-title" style={{ marginTop: 10 }}>Time actually deployed</div>
      <div className="service-form-grid service-form-grid-four">
        {ACTUALS.map(([key, label, quoted]) => (
          <label key={key} className="service-form-field">{label}
            <input className="service-form-control service-number-input" type="number" min="0" value={est[key] ?? ''} placeholder={`quoted ${est[quoted] ?? 0}`}
              onChange={e => upd({ [key]: e.target.value === '' ? '' : Math.max(0, Number(e.target.value) || 0) })} />
          </label>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 6 }}>
        Billable engineer days: <b>{Number(est.actualEngineerDays) || 0}</b> (weekday + weekend).
        Anything left blank bills at the quoted quantity. Weekend and overtime pick up the rate-sheet premiums on the invoice.
      </p>
      <div className="hint" style={{ marginTop: 8 }}>Execution completion requires customer acceptance, engineer assignment, service date, and recorded engineer days.</div>
    </div>
  </div>
}
