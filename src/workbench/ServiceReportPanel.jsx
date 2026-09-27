import React from 'react'
import { useStore } from '../store.jsx'
import { Chip } from '../ui.jsx'

export default function ServiceReportPanel({ opp }) {
  const store = useStore()
  const est = store.svcEstimates.find(e => e.oppId === opp.id) || { oppId: opp.id }
  const save = e => store.updateServiceFlow(opp.id, { serviceReport: e.target.value, reportSubmittedOn: e.target.value.trim() ? new Date().toISOString().slice(0, 10) : '' })
  const executionReady = !!est.engineer && !!est.executionDate && Number(est.actualEngineerDays) > 0
  return <div className="ana-grid"><div className="ana-card c-12">
    <div className="ana-title">Service Report {est.serviceReport && <Chip tone="state-Accepted">Submitted</Chip>}</div>
    {!executionReady && <div className="warnbox">Complete Execute Service first: engineer, service date, and actual engineer days are required.</div>}
    <label style={{ display: 'block', fontSize: 12 }}>Completed work, findings, and deliverables
      <textarea rows={7} disabled={!executionReady} value={est.serviceReport || ''} onChange={save} placeholder="Record the service performed and attach or describe deliverables" style={{ width: '100%' }} />
    </label>

    <p className="hint" style={{ marginTop: 12 }}>Record the completed standard service work and findings here. The invoice uses the actual engineer deployment against the accepted rate sheet.</p>
    <p className="hint" style={{ marginTop: 8 }}>The Invoice stage opens after this report is submitted.</p>
  </div></div>
}
