import React from 'react'
import { useStore } from '../store.jsx'
import { Chip } from '../ui.jsx'

export default function ServiceExecutionPanel({ opp }) {
  const store = useStore()
  const est = store.svcEstimates.find(e => e.oppId === opp.id) || { oppId: opp.id }
  const upd = patch => store.updateServiceFlow(opp.id, patch)
  const accepted = est.customerDecision === 'Accepted'
  const complete = !!est.executionDate && !!est.engineer && Number(est.actualEngineerDays) > 0
  return <div className="ana-grid">
    <div className="ana-card c-12">
      <div className="ana-title">Execute service & invoice {complete && <Chip tone="state-Accepted">Complete</Chip>}</div>
      {!accepted && <div className="warnbox">Record customer acceptance before scheduling execution.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label style={{ fontSize: 12 }}>Assigned engineer<input value={est.engineer || ''} onChange={e => upd({ engineer: e.target.value })} placeholder="Engineer name" style={{ width: '100%' }} /></label>
        <label style={{ fontSize: 12 }}>Service date<input type="date" value={est.executionDate || ''} onChange={e => upd({ executionDate: e.target.value })} style={{ width: '100%' }} /></label>
        <label style={{ fontSize: 12 }}>Actual engineer days<input type="number" min="0" value={est.actualEngineerDays ?? ''} onChange={e => upd({ actualEngineerDays: Math.max(0, +e.target.value || 0) })} style={{ width: '100%' }} /></label>
        <div className="hint">Next: submit the Service Report, then prepare the Invoice.</div>
      </div>
      <div className="hint" style={{ marginTop: 8 }}>Execution completion requires customer acceptance, engineer assignment, service date, and actual engineer days.</div>
    </div>
  </div>
}
