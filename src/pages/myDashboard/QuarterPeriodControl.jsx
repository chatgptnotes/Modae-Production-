import React, { useEffect, useId, useRef, useState } from 'react'
import { FY_QUARTERS } from '../../kpi.js'

export default function QuarterPeriodControl({ period, setPeriod, currentQuarter, fy }) {
  const [open, setOpen] = useState(false)
  const root = useRef(null)
  const trigger = useRef(null)
  const menuId = useId()
  const active = /^q[1-4]$/.test(period)
  const selected = active ? period : `q${currentQuarter}`

  useEffect(() => {
    if (!open) return
    root.current?.querySelector('[aria-checked="true"]')?.focus()
    const dismissOutside = event => { if (!root.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', dismissOutside)
    document.addEventListener('focusin', dismissOutside)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      document.removeEventListener('focusin', dismissOutside)
    }
  }, [open])
  useEffect(() => { setOpen(false) }, [period])

  const choose = value => {
    setPeriod(value)
    setOpen(false)
    trigger.current?.focus()
  }
  const close = () => { setOpen(false); trigger.current?.focus() }
  const onMenuKeyDown = event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const options = [...root.current.querySelectorAll('[role="menuitemradio"]')]
    const index = options.indexOf(document.activeElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
    options[next]?.focus()
  }

  return <div className="quarter-period-control" ref={root}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <button type="button" ref={trigger} className={active ? 'active' : ''}
      aria-pressed={active} aria-haspopup="menu" aria-expanded={open} aria-controls={menuId}
      title="Quarter to date. Tap again or double-click to choose a quarter."
      onClick={() => { if (active) setOpen(true); else setPeriod(`q${currentQuarter}`) }}
      onDoubleClick={() => setOpen(true)}
      onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true) } }}>
      QTD{active && ` · Q${period.slice(1)}`} <span aria-hidden="true">▾</span>
    </button>
    {open && <div className="quarter-period-menu" id={menuId} role="menu" aria-label={`Performance quarter${fy ? ` · ${fy}` : ''}`} onKeyDown={onMenuKeyDown}>
      {fy && <span className="quarter-period-fy">{fy}</span>}
      {FY_QUARTERS.map((label, index) => <button type="button" key={label} role="menuitemradio"
        aria-checked={selected === `q${index + 1}`} onClick={() => choose(`q${index + 1}`)}>
        {label}<span aria-hidden="true">{selected === `q${index + 1}` ? '✓' : ''}</span>
      </button>)}
    </div>}
  </div>
}
