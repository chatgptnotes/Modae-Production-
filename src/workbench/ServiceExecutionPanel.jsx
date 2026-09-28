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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label style={{ fontSize: 12 }}>Assigned service engineer
          <input list={`service-engineers-${opp.id}`} value={est.engineer || ''} onChange={e => upd({ engineer: e.target.value })} placeholder="Type or select engineer" style={{ width: '100%' }} />
          <datalist id={`service-engineers-${opp.id}`}>{engineerSuggestions.map(name => <option key={name} value={name} />)}</datalist>
          <span className="hint">Assign the engineer responsible for site execution. You can type a name or select a suggestion.</span>
        </label>
        <label style={{ fontSize: 12 }}>Service date<input type="date" value={est.executionDate || ''} onChange={e => upd({ executionDate: e.target.value })} style={{ width: '100%' }} /></label>
      </div>
      <div className="section-title" style={{ marginTop: 10 }}>Time actually deployed</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
        {ACTUALS.map(([key, label, quoted]) => (
          <label key={key} style={{ fontSize: 12 }}>{label}
            <input type="number" min="0" value={est[key] ?? ''} placeholder={`quoted ${est[quoted] ?? 0}`}
              onChange={e => upd({ [key]: Math.max(0, +e.target.value || 0) })} style={{ width: '100%' }} />
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
