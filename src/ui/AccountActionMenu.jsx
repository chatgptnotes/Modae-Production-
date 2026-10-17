import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export function accountMenuPosition(anchor, height, viewportWidth, viewportHeight) {
  const margin = 8
  const width = Math.min(220, Math.max(0, viewportWidth - margin * 2))
  const maxHeight = Math.max(0, viewportHeight - margin * 2)
  const visibleHeight = Math.min(height, maxHeight)
  const below = anchor.bottom + 4
  const top = below + visibleHeight <= viewportHeight - margin
    ? below : Math.max(margin, Math.min(anchor.top - visibleHeight - 4, viewportHeight - margin - visibleHeight))
  return { left: Math.max(margin, Math.min(anchor.right - width, viewportWidth - width - margin)), top, width, maxHeight }
}

export default function AccountActionMenu({ name, open, onOpenChange, children }) {
  const id = useId()
  const trigger = useRef(null)
  const menu = useRef(null)
  const [position, setPosition] = useState(null)
  const lastItem = useRef(false)
  const items = () => [...(menu.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [])]
  const close = (restoreFocus = false) => {
    onOpenChange(false)
    if (restoreFocus) trigger.current?.focus()
  }

  useLayoutEffect(() => {
    if (!open) { setPosition(null); return }
    const place = () => {
      if (!trigger.current || !menu.current) return
      setPosition(accountMenuPosition(trigger.current.getBoundingClientRect(), menu.current.scrollHeight, window.innerWidth, window.innerHeight))
    }
    place()
    const options = items()
    ;(lastItem.current ? options.at(-1) : options[0])?.focus()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const dismiss = event => {
      if (!menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) onOpenChange(false)
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('focusin', dismiss)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('focusin', dismiss)
    }
  }, [open, onOpenChange])

  const navigate = event => {
    if (event.key === 'Escape') { event.preventDefault(); close(true); return }
    if (event.key === 'Tab') { close(true); return }
    const options = items()
    if (!options.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const current = options.indexOf(document.activeElement)
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
    options[index].focus()
  }

  return <>
    <button type="button" ref={trigger} className="users-action-trigger" aria-label={`Actions for ${name}`}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { lastItem.current = false; onOpenChange(!open) }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); lastItem.current = event.key === 'ArrowUp'; onOpenChange(true)
        } else if (event.key === 'Escape') close(true)
      }}>Actions <span aria-hidden="true">▾</span></button>
    {open && createPortal(<div id={id} ref={menu} className="users-action-dropdown" role="menu" aria-label={`Actions for ${name}`}
      style={position || { visibility: 'hidden', width: 220 }} onKeyDown={navigate}
      onClick={event => { if (event.target.closest('[role="menuitem"]:not(:disabled)')) close(true) }}>
      {children}
    </div>, document.body)}
  </>
}
