import React from 'react'
import { useStore } from '../store.jsx'
import { Chip } from '../ui.jsx'
import { canPriceProposal } from '../utils.js'
import { serviceCost, actualQuantities, engineerDaysFrom, serviceMoney, normalizeSheet, hasActuals } from '../serviceRates.js'
import { Icon } from '../icons.jsx'

export default function ServiceInvoicePanel({ opp }) {
  const store = useStore()
  const est = store.svcEstimates.find(e => e.oppId === opp.id) || { oppId: opp.id }
  const update = patch => store.updateServiceFlow(opp.id, {
    ...patch,
    ...(patch.invoiceStatus === 'Invoiced' ? { servicePhase: 10, invoiceOn: new Date().toISOString().slice(0, 10) } : {}),
  })
  const ready = !!est.serviceReport
  const comm = canPriceProposal(store.role)
  const sheet = normalizeSheet(est.sheet)
  const basis = est.invoiceBasis || (est.offerMode === 'Standard Rate Sheet' ? 'Actual engineer days' : 'Approved scope / BOQ / lump sum')
  const money = v => serviceMoney(sheet, v)

  // Standard rate-sheet work is billed on what the engineer actually spent, at
  // the same rates the customer accepted pre-visit. Customised work is billed on
  // the approved scope, so the build-up is shown for reference only.
  const q = actualQuantities(est)
  const { rows, subtotal, gst, total } = serviceCost(store.rateSheets, sheet, q)
  const onActuals = basis === 'Actual engineer days'

  return <div className="ana-grid"><div className="ana-card c-12">
    <div className="ana-title">Invoice {est.invoiceStatus === 'Invoiced' && <Chip tone="state-Accepted">Invoiced</Chip>}</div>
    {!ready && <div className="warnbox">Submit the Service Report before preparing the invoice.</div>}
    <label style={{ display: 'block', fontSize: 12 }}>Billing basis
      <select disabled={!ready} value={basis} onChange={e => update({ invoiceBasis: e.target.value })} style={{ width: '100%', maxWidth: 380 }}>
        <option>Actual engineer days</option><option>Approved scope / BOQ / lump sum</option>
      </select>
    </label>

    {onActuals && (
      <>
        <div className="section-title" style={{ marginTop: 12 }}>
          Billed on actuals — {engineerDaysFrom(q)} engineer day{engineerDaysFrom(q) === 1 ? '' : 's'}
          {!hasActuals(est) && <Chip tone="state-Review">Quoted quantities</Chip>}
        </div>
        {comm ? (
          <table className="cost-table" style={{ width: '100%', maxWidth: 520 }}>
            <tbody>
              {rows.map(([label, v]) => (
                <tr key={label}><td>{label}</td><td className="num">{money(v)}</td></tr>
              ))}
              <tr><td><b>Subtotal</b></td><td className="num"><b>{money(subtotal)}</b></td></tr>
              <tr><td>GST {sheet === 'India' ? '(18%)' : '(0% — export of services)'}</td><td className="num">{money(gst)}</td></tr>
              <tr className="total"><td>Invoice total</td><td className="num">{money(total)}</td></tr>
            </tbody>
          </table>
        ) : (
          <div className="restricted"><Icon name="lock" size={12} /> Invoice build-up restricted — sales owners, approvers and admin only</div>
        )}
        {!hasActuals(est) && <p className="hint">No field actuals recorded yet, so this prices the quoted quantities. Log the engineer's real days on Execute Service.</p>}
      </>
    )}

    <label style={{ display: 'block', fontSize: 12, marginTop: 12 }}>Invoice status
      <select disabled={!ready} value={est.invoiceStatus || 'Not ready'} onChange={e => update({ invoiceStatus: e.target.value })} style={{ width: '100%', maxWidth: 380 }}><option>Not ready</option><option>Ready for invoice</option><option>Invoiced</option></select>
    </label>
    <p className="hint">Standard Rate Sheet services bill on actual engineer days, with weekend and overtime premiums applied from the rate sheet. Customised work bills on the approved scope, BOQ, lump sum, or agreed rate structure.</p>
  </div></div>
}
