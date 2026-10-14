import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
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

  useLayoutEffect(() => {
    if (!open) return
    const root = rootRef.current
    const menu = menuRef.current
    const header = root?.closest('.mobile-dashboard-header')
    if (!root || !menu || !header) return
    const place = () => {
      const anchor = root.getBoundingClientRect()
      const bounds = header.getBoundingClientRect()
      const viewport = window.visualViewport
      const viewportLeft = viewport?.offsetLeft || 0
      const viewportTop = viewport?.offsetTop || 0
      const right = Math.min(bounds.right, viewportLeft + (viewport?.width || innerWidth)) - 8
      const left = Math.max(bounds.left, viewportLeft) + 8
      const scaleX = anchor.width / root.offsetWidth || 1
      const scaleY = anchor.height / root.offsetHeight || 1
      const width = Math.max(0, Math.min(260 * scaleX, right - left))
      const x = Math.max(left, Math.min(anchor.right - width, right - width))
      const y = anchor.bottom + 8
      menu.style.width = `${width / scaleX}px`
      menu.style.left = `${(x - anchor.left) / scaleX - root.clientLeft}px`
      menu.style.right = 'auto'
      menu.style.top = `${(y - anchor.top) / scaleY - root.clientTop}px`
      menu.style.maxHeight = `${Math.max(0, viewportTop + (viewport?.height || innerHeight) - 8 - y) / scaleY}px`
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(header)
    observer.observe(root)
    const scroll = event => { if (!menu.contains(event.target)) place() }
    window.addEventListener('resize', place)
    document.addEventListener('scroll', scroll, true)
    window.visualViewport?.addEventListener('resize', place)
    window.visualViewport?.addEventListener('scroll', place)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
      document.removeEventListener('scroll', scroll, true)
      window.visualViewport?.removeEventListener('resize', place)
      window.visualViewport?.removeEventListener('scroll', place)
    }
  }, [open])

  useEffect(() => { setOpen(false) }, [location.key])
  useEffect(() => {
    if (!open) return
    menuRef.current?.focus({ preventScroll: true })
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
      <button type="button" onClick={() => { close(false); nav('/personal-settings') }}><Icon name="gear" size={18} />Personal settings</button>
      {typeof store.setViewMode === 'function' && <button type="button" onClick={fullSite}><Icon name="monitor" size={18} />Full site</button>}
      {user && typeof store.logout === 'function' && <button type="button" onClick={() => { close(false); store.logout() }}><Icon name="logout" size={18} />Log out</button>}
    </div>}
  </div>
}
