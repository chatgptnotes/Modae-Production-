import React, { useEffect, useId, useRef, useState } from 'react'
import { Icon } from '../icons.jsx'
import { INBOX_VIEWS } from './inboxViews.js'

function ToolbarMenu({ label, className = '', trigger, items, disabled = false }) {
  const [open, setOpen] = useState(false)
  const root = useRef(null)
  const button = useRef(null)
  const menu = useRef(null)
  const id = useId()
  useEffect(() => {
    if (!open) return undefined
    const frame = requestAnimationFrame(() => menu.current?.querySelector('button:not(:disabled)')?.focus())
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false) }
    const escape = event => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); button.current?.focus() }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  const close = () => { setOpen(false); button.current?.focus() }
  const navigateMenu = event => {
    const buttons = [...menu.current.querySelectorAll('button:not(:disabled)')]
    const current = buttons.indexOf(document.activeElement)
    const next = event.key === 'ArrowDown' ? (current + 1) % buttons.length
      : event.key === 'ArrowUp' ? (current - 1 + buttons.length) % buttons.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : null
    if (next != null) { event.preventDefault(); buttons[next]?.focus() }
  }
  return <div className="inbox-toolbar-menu" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <button type="button" className={className} ref={button} aria-label={label} title={label} disabled={disabled}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true) } }}>{trigger}</button>
    {open && <div id={id} className="inbox-toolbar-popover" role="menu" aria-label={label} ref={menu} onKeyDown={navigateMenu}>
      {items.map(item => <button key={item.key || item.label} type="button" role={item.checked == null ? 'menuitem' : 'menuitemradio'}
        aria-checked={item.checked} disabled={item.disabled} data-inbox-view={item.view} onClick={() => { close(); item.onClick() }}>
        <span>{item.label}</span>{item.count != null && <small>{item.count}</small>}{item.checked && <Icon name="check" size={13} />}
      </button>)}
    </div>}
  </div>
}

export default function InboxToolbar({ query, onQuery, filterCount, onFilters, view, counts, onView, archive, onArchive, archiveCount, onRefresh, onNew, actions, selectionCount }) {
  return <div className="inbox-toolbar" role="group" aria-label="Inbox search and actions">
    <div className="inbox-toolbar-search"><Icon name="search" size={19} /><input type="search" aria-label="Search mail" placeholder="Search leads…" value={query} onChange={event => onQuery(event.target.value)} />
      <button type="button" className="inbox-toolbar-icon" aria-label="Filter leads" title={filterCount ? `${filterCount} active filters` : 'Filter leads'} aria-haspopup="dialog" onClick={onFilters}><Icon name="sliders" size={19} />{filterCount > 0 && <span className="inbox-filter-count">{filterCount}</span>}</button>
    </div>
    <ToolbarMenu label="Inbox view" className="inbox-view-trigger" disabled={archive}
      trigger={<><span>{archive ? 'Archive' : INBOX_VIEWS.find(item => item.key === view)?.label || 'All leads'}</span><Icon name="chevronDown" size={15} /></>}
      items={INBOX_VIEWS.map(item => ({ key: item.key, view: item.key, label: item.label, count: counts[item.key], checked: view === item.key, onClick: () => onView(item.key) }))} />
    <button type="button" className="inbox-toolbar-icon" aria-label="Refresh inbox" title="Refresh inbox" onClick={onRefresh}><Icon name="refresh" size={20} /></button>
    <ToolbarMenu label="More inbox actions" className="inbox-toolbar-icon" trigger={<><Icon name="moreHorizontal" size={20} />{selectionCount > 0 && <span className="inbox-filter-count">{selectionCount}</span>}</>}
      items={[{ label: archive ? 'Back to inbox' : `Archive (${archiveCount})`, onClick: onArchive }, ...actions]} />
    <button type="button" className="inbox-toolbar-new" aria-label="New enquiry" aria-haspopup="dialog" onClick={onNew}><Icon name="plus" size={18} /><span>New enquiry</span></button>
  </div>
}
