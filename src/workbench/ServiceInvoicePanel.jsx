import React from 'react'
import { useStore } from '../store.jsx'
import { Chip } from '../ui.jsx'

export default function ServiceInvoicePanel({ opp }) {
  const store = useStore()
  const est = store.svcEstimates.find(e => e.oppId === opp.id) || { oppId: opp.id }
  const update = patch => store.updateServiceFlow(opp.id, {
    ...patch,
    ...(patch.invoiceStatus === 'Invoiced' ? { servicePhase: 10, invoiceOn: new Date().toISOString().slice(0, 10) } : {}),
  })
  const ready = !!est.serviceReport
  return <div className="ana-grid"><div className="ana-card c-12">
    <div className="ana-title">Invoice {est.invoiceStatus === 'Invoiced' && <Chip tone="state-Accepted">Invoiced</Chip>}</div>
    {!ready && <div className="warnbox">Submit the Service Report before preparing the invoice.</div>}
    <label style={{ display: 'block', fontSize: 12 }}>Billing basis
      <select disabled={!ready} value={est.invoiceBasis || (est.offerMode === 'Standard Rate Sheet' ? 'Actual engineer days' : 'Approved scope / BOQ / lump sum')} onChange={e => update({ invoiceBasis: e.target.value })} style={{ width: '100%' }}>
        <option>Actual engineer days</option><option>Approved scope / BOQ / lump sum</option>
      </select>
    </label>
    <label style={{ display: 'block', fontSize: 12, marginTop: 10 }}>Invoice status
      <select disabled={!ready} value={est.invoiceStatus || 'Not ready'} onChange={e => update({ invoiceStatus: e.target.value })} style={{ width: '100%' }}><option>Not ready</option><option>Ready for invoice</option><option>Invoiced</option></select>
    </label>
    <p className="hint">Standard Rate Sheet services use actual engineer days. Customized work uses the approved scope, BOQ, lump sum, or agreed rate structure.</p>
  </div></div>
}
