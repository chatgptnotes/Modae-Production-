import React from 'react'
import { Icon } from '../icons.jsx'
import { sparesMobileStatus } from './mobileSpares.js'

export default function PhoneSourcingOverview({ lines, canPrice, canContinue, reason, onOpen, pricingApproval, rates }) {
  const active = lines.filter(line => !line.removedFromSourcing)
  const attention = active.filter(line => sparesMobileStatus(line).key === 'attention').length
  const confirmed = active.filter(line => sparesMobileStatus(line).key === 'confirmed').length
  const ready = active.length - attention - confirmed
  return <section className="phone-sourcing-overview" aria-label="Sourcing checklist">
    <h2>Finish sourcing</h2><p>{attention ? `${attention} parts need attention before quotation.` : ready ? `${ready} parts are ready to confirm together.` : canContinue ? 'All active parts confirmed. Review totals before quotation.' : reason || 'Add the requested parts to begin.'}</p>
    <div className="phone-sourcing-counts"><div><b>{active.length}</b><span>Parts</span></div><div><b>{ready}</b><span>Ready</span></div><div><b>{confirmed}</b><span>Confirmed</span></div></div>
    <h3>Sourcing checklist</h3>
    <button type="button" onClick={() => onOpen('parts')}><Icon name={active.length ? 'check' : 'plus'} size={20} /><div><strong>Requested parts & quantities</strong><span>{active.length ? `${active.length} separate requested lines` : 'Add or import customer-requested parts'}</span></div><Icon name="chevronRight" size={18} /></button>
    {canPrice && <button type="button" onClick={() => onOpen('costing')}><Icon name="gear" size={20} /><div><strong>Review costing basis</strong><span>EUR ₹{rates?.EUR} · USD ₹{rates?.USD}</span></div><Icon name="chevronRight" size={18} /></button>}
    <button type="button" onClick={() => onOpen(attention ? 'issues' : 'parts')}><Icon name={attention ? 'alert' : 'check'} size={20} /><div><strong>Review parts & pricing</strong><span>{attention ? `${attention} parts need a correction` : 'Quantities, sources and prices ready for review'}</span></div><Icon name="chevronRight" size={18} /></button>
    <button type="button" onClick={() => onOpen('confirm')}><Icon name={confirmed === active.length && active.length ? 'check' : 'list'} size={20} /><div><strong>Confirm & review totals</strong><span>{ready ? `Confirm ${ready} eligible parts together` : `${confirmed} confirmed parts`}{pricingApproval?.status === 'Pending' ? ' · Pricing approval pending' : ''}</span></div><Icon name="chevronRight" size={18} /></button>
    <button type="button" className="primary" onClick={() => onOpen(attention ? 'issues' : ready ? 'confirm' : 'parts')}>Open parts workspace<Icon name="arrowRight" size={18} /></button>
  </section>
}
