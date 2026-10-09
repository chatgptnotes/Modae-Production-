import React, { useEffect, useId, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../icons.jsx'
import { displayRoleLabel } from '../utils.js'

export default function PhoneAccountMenu({ store }) {
  const location = useLocation()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const menuId = useId()
  const user = store.auth?.user
  const name = user?.name || store.role || 'ModAE'
  const initials = String(name).split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase()
  const role = displayRoleLabel(store.role, store.config)

  function close(restoreFocus = true) {
    setOpen(false)
    if (restoreFocus) buttonRef.current?.focus()
  }

  useEffect(() => { setOpen(false) }, [location.key])
  useEffect(() => {
    if (!open) return
    menuRef.current?.focus()
    const outside = event => {
      if (!rootRef.current?.contains(event.target)) close()
    }
    const escape = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape, true)
    }
  }, [open])

  function fullSite() {
    close(false)
    store.setViewMode('full')
    nav(location.pathname === '/more' ? '/my-dashboard' : {
      pathname: location.pathname, search: location.search, hash: location.hash,
    }, { replace: true })
  }

  return <div className="phone-account" ref={rootRef} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) close(false)
  }}>
    <button type="button" className="phone-account-trigger" ref={buttonRef}
      aria-label={`Signed in as ${name}, open account menu`} aria-haspopup="dialog"
      aria-expanded={open} aria-controls={menuId} onClick={() => open ? close() : setOpen(true)}>
      <span className="mobile-avatar" aria-hidden="true">{initials}</span>
    </button>
    {open && <div className="phone-account-menu" id={menuId} ref={menuRef}
      role="dialog" aria-label="Account menu" tabIndex={-1}>
      <div className="phone-account-details">
        <strong>{name}</strong>
        {user?.email && <span>{user.email}</span>}
        {role && <small>{role}</small>}
      </div>
      {typeof store.setViewMode === 'function' && <button type="button" onClick={fullSite}><Icon name="monitor" size={18} />Full site</button>}
      {user && typeof store.logout === 'function' && <button type="button" onClick={() => { close(false); store.logout() }}><Icon name="logout" size={18} />Log out</button>}
    </div>}
  </div>
}
