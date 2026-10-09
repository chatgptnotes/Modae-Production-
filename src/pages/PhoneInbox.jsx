import React from 'react'
import { Icon } from '../icons.jsx'
import { ddMmmYY } from '../utils.js'
import { INBOX_VIEWS } from './inboxViews.js'
import './phoneInbox.css'

export function phoneSender(lead) {
  const raw = String(lead.senderName || lead.sender || lead.from || lead.source || '').trim()
  const name = raw.replace(/<[^>]*>/g, '').trim().replace(/^"|"$/g, '').trim()
  return (name.includes('@') ? name.split('@')[0] : name) || 'Unknown sender'
}

export function PhoneLeadRow({ lead, archived = false, selecting, selected, onOpen, onStar, onSelect }) {
  const sender = phoneSender(lead)
  const initials = sender.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()
  const subject = lead.subject || 'Untitled enquiry'
  const timestamp = lead.ts || lead.receivedAt || lead.createdAt
  const date = timestamp && Number.isFinite(new Date(timestamp).getTime()) ? ddMmmYY(timestamp.slice(0, 10)).replace(/-\d{2}$/, '').replace('-', ' ') : '—'
  return <article className={`phone-lead-row${lead.status === 'New' && !lead.readAt ? ' is-unread' : ''}${selected ? ' is-selected' : ''}`}>
    {selecting && <label className="phone-select"><input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Select ${subject}`} /></label>}
    <button type="button" className="phone-lead-open" onClick={onOpen} aria-label={`Open ${subject}`}>
      <span className="phone-lead-avatar" aria-hidden="true">{initials}</span>
      <span className="phone-lead-copy">
        <b className="phone-lead-name" title={lead.sender || lead.from || sender}>{sender}</b>
        <strong className="phone-clamp-two">{subject}</strong>
        <span className="phone-clamp-one">{lead.ai?.summary || lead.body?.replace(/\s+/g, ' ') || 'No preview available'}</span>
        <span className="phone-lead-labels"><span className="phone-lead-status" data-status={lead.status}>{lead.status || 'New'}</span>{lead.urgency === 'Urgent' && <span className="phone-lead-urgent">Urgent</span>}</span>
      </span>
    </button>
    <div className="phone-lead-side"><time dateTime={timestamp || undefined} title={timestamp || 'Date unavailable'}>{date}</time><button type="button" className="phone-lead-star" aria-label={lead.starred ? 'Remove star' : 'Star lead'} aria-pressed={!!lead.starred} disabled={archived} onClick={onStar}><Icon name="star" size={21} /></button></div>
  </article>
}

export function PhoneInboxToolbar({ store, query, onQuery, view, onView, archive, onArchive, selecting, onSelecting, onRefresh, onFilters, filterCount, onNew }) {
  return <>
    <h1 className="visually-hidden">{archive ? 'Lead archive' : 'Lead inbox'}</h1>
    <div className="phone-inbox-search"><Icon name="search" size={20} /><input type="search" aria-label="Search leads" placeholder="Search leads" value={query} onChange={event => onQuery(event.target.value)} /><button type="button" onClick={onFilters} aria-label={`Filter leads${filterCount ? ` (${filterCount} active)` : ''}`}><Icon name="filter" size={20} />{filterCount > 0 && <span>{filterCount}</span>}</button><details className="phone-list-more" onClick={event => { if (event.target.closest('button')) event.currentTarget.open = false }}><summary aria-label="Inbox actions"><Icon name="list" size={20} /></summary><div>
        <button type="button" onClick={onArchive}>{archive ? 'Back to inbox' : 'Archive'}</button>
        <button type="button" onClick={onSelecting}>{selecting ? 'Done selecting' : 'Select messages'}</button>
      </div></details></div>
    {!archive && <div className="phone-inbox-views" role="group" aria-label="Inbox views">{INBOX_VIEWS.map(item => <button type="button" key={item.key} aria-label={item.label} aria-pressed={view === item.key} onClick={() => onView(item.key)}>{item.key === 'starred' ? <Icon name="star" size={19} /> : item.label}</button>)}</div>}
    <div className="phone-inbox-list-label"><span>{archive ? 'Archived leads' : INBOX_VIEWS.find(item => item.key === view)?.label}</span><span>Newest first</span></div>
    {!archive && <button type="button" className="phone-inbox-new" onClick={onNew}><Icon name="edit" size={19} />New enquiry</button>}
  </>
}
