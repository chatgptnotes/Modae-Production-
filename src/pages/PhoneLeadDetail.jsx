import React, { useEffect, useId, useRef, useState } from 'react'
import { Icon } from '../icons.jsx'
import { Modal } from '../ui.jsx'
import { ageDays, ddMmmYY } from '../utils.js'
import './phoneLeadDetail.css'

const tabs = [['overview', 'Overview'], ['details', 'Details'], ['email', 'Email']]
export default function PhoneLeadDetail({ lead, summary = {}, issues = [], items = [], details, email, action, actions = [], onBack }) {
  const [tab, setTab] = useState('overview')
  const [more, setMore] = useState(false)
  const [target, setTarget] = useState(null)
  const detailRef = useRef(null)
  const tabRef = useRef(null)
  const id = useId()
  useEffect(() => {
    if (!target || tab !== 'details') return undefined
    const frame = requestAnimationFrame(() => {
      const labels = [...(detailRef.current?.querySelectorAll('label, [data-phone-field]') || [])]
      const label = labels.find(el => el.dataset.phoneField === target)
        || labels.find(el => el.textContent.trim().toLowerCase().startsWith(target.toLowerCase()))
      if (label) {
        for (let node = label; node && node !== detailRef.current; node = node.parentElement) {
          if (node.tagName === 'DETAILS') node.open = true
        }
      }
      const input = label?.querySelector('input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)')
      const node = input || label || detailRef.current
      if (node?.isConnected) { node.scrollIntoView({ block:'center' }); input?.focus({ preventScroll:true }) }
      setTarget(null)
    })
    return () => cancelAnimationFrame(frame)
  }, [target, tab])
  function openDetails(field) { setTab('details'); setTarget(field || 'Lead decisions') }
  function switchTab(next) { setTab(next); tabRef.current?.scrollIntoView({block:'start'}) }
  function navigateTabs(event) {
    const index = tabs.findIndex(([key]) => key === tab)
    const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : null
    if (next == null) return
    event.preventDefault(); switchTab(tabs[next][0]); tabRef.current?.querySelectorAll('[role="tab"]')[next]?.focus()
  }
  const age = ageDays(lead.ts)
  return <article className="phone-lead-detail">
    <header className="phone-lead-header">
      <div className="phone-lead-top"><button type="button" aria-label="Back to inbox" onClick={onBack}><Icon name="chevronLeft" size={22} /></button>
        {actions.length > 0 && <button type="button" aria-label="More lead actions" aria-haspopup="dialog" onClick={() => setMore(true)}><Icon name="moreHorizontal" size={22} /></button>}</div>
      <h1>{lead.subject || 'Untitled enquiry'}</h1>
      <p>{lead.sender || lead.from || 'Sender unavailable'}</p>
      <p>{lead.ts ? ddMmmYY(String(lead.ts).slice(0,10)) : 'Date unavailable'}{age != null && ` · ${age} day${age === 1 ? '' : 's'} old`}</p>
      <div className="phone-lead-meta"><span data-status={lead.status}>{lead.status || 'New'}</span>{summary.owner && <span>Assigned to {summary.owner}</span>}</div>
    </header>
    <div className="phone-lead-tabs" role="tablist" aria-label="Lead sections" ref={tabRef} onKeyDown={navigateTabs}>
      {tabs.map(([key, label]) => <button type="button" role="tab" key={key} id={`${id}-${key}-tab`} aria-controls={`${id}-${key}`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} onClick={() => switchTab(key)}>{label}</button>)}
    </div>
    <section className="phone-lead-panel" id={`${id}-overview`} role="tabpanel" aria-labelledby={`${id}-overview-tab`} hidden={tab !== 'overview'}>
      {issues.length > 0 && <section className="phone-lead-attention" aria-label="Needs attention"><h2>Needs attention</h2>{issues.map((issue,index) => <button type="button" key={`${issue.label}-${index}`} onClick={() => openDetails(issue.field || issue.label)}><Icon name="alert" size={18} /><span><b>{issue.label}</b><small>{issue.note || 'Review in Details'}</small></span><Icon name="chevronRight" size={18} /></button>)}</section>}
      {lead.status === 'Converted' && <section className="phone-lead-converted"><Icon name="checkCircle" size={20} /><div><b>Converted to opportunity{lead.oppId ? ` ${lead.oppId}` : ''}</b><p>This lead is read-only.{lead.oppId ? ' Continue in the linked opportunity.' : 'No linked opportunity is available.'}</p></div></section>}
      {lead.status === 'Dropped' && <p className="phone-lead-notice">Dropped — {lead.droppedReason || 'No reason recorded'}.</p>}
      <section className="phone-lead-summary"><h2>Enquiry summary</h2><p>{summary.scope || 'Review the original email for the enquiry scope.'}</p>
        <dl>{[['Customer',summary.customer],['Contact',summary.contact],['Delivery',summary.delivery]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not provided'}</dd></div>)}</dl>
      </section>
      <section className="phone-lead-items"><div><h2>Requested items</h2><span>{items.length} item{items.length === 1 ? '' : 's'}</span></div>
        {items.slice(0,3).map((item,index) => <div className="phone-lead-item" key={index}><span>{item.description || item.desc || item.partNumber || 'Description unavailable'}</span><span>Qty {item.qty ?? item.quantity ?? '—'}</span></div>)}
        {!items.length && <p>No requested items extracted.</p>}
        <button type="button" className="phone-lead-text-action" onClick={() => openDetails('Requested items')}>View {items.length > 3 ? `all ${items.length} items` : 'details'} <Icon name="arrowRight" size={14} /></button>
      </section>
      <p className="phone-lead-record">Lead {lead.id}</p>
    </section>
    <section className="phone-lead-panel phone-lead-details" id={`${id}-details`} role="tabpanel" aria-labelledby={`${id}-details-tab`} hidden={tab !== 'details'} ref={detailRef}>{details}</section>
    <section className="phone-lead-panel phone-lead-email" id={`${id}-email`} role="tabpanel" aria-labelledby={`${id}-email-tab`} hidden={tab !== 'email'}>{email}</section>
    {action && <footer className="phone-lead-action"><button type="button" className="phone-lead-primary" disabled={action.disabled} onClick={action.onClick}><Icon name={lead.status === 'Converted' ? 'arrowRight' : 'check'} size={18} />{action.label}</button>{action.note && <p role="status">{action.note}</p>}</footer>}
    {more && <Modal title="Lead actions" className="phone-lead-more" onClose={() => setMore(false)}><div>{actions.map(item => <button type="button" key={item.label} disabled={item.disabled} onClick={() => { setMore(false); if (item.panel) setTab(item.panel); item.onClick?.() }}>{item.label}</button>)}</div></Modal>}
  </article>
}
