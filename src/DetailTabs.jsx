import React, { useEffect, useMemo, useRef, useState } from 'react'

// Shared tab navigation for detail surfaces. Items are data-driven so each
// view can apply its own role/content rules without duplicating layout.
export default function DetailTabs({ items, activeId, onChange, ariaLabel = 'Detail views' }) {
  const visible = useMemo(() => items.filter(item => item.show !== false), [items])
  const primary = visible.slice(0, 5)
  const overflow = visible.slice(5)
  const activeInOverflow = overflow.some(item => item.id === activeId)
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const close = event => {
      if (!menuRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const select = item => {
    if (item.disabled) return
    onChange(item.id)
    setOpen(false)
  }

  return (
    <nav className="detail-tabs" aria-label={ariaLabel}>
      <div className="detail-tabs-primary" role="tablist">
        {primary.map(item => (
          <button key={item.id} type="button" role="tab" aria-selected={activeId === item.id}
            aria-current={activeId === item.id ? 'page' : undefined}
            aria-disabled={item.disabled || undefined}
            className={activeId === item.id ? 'active' : ''} disabled={item.disabled}
            onClick={() => select(item)}>
            {item.label}{item.count != null && <span className="detail-tab-count">{item.count}</span>}
          </button>
        ))}
        {!!overflow.length && (
          <div className="detail-tabs-more" ref={menuRef}>
            <button type="button" className={'detail-tabs-more-trigger' + (activeInOverflow ? ' active' : '')}
              aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
              More… <span aria-hidden="true">⌄</span>
            </button>
            {open && (
              <div className="detail-tabs-menu" role="menu">
                {overflow.map(item => (
                  <button key={item.id} type="button" role="menuitem" disabled={item.disabled}
                    className={activeId === item.id ? 'active' : ''} onClick={() => select(item)}>
                    {item.label}{item.count != null && <span className="detail-tab-count">{item.count}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}
