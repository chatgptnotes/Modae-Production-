import React, { useId, useLayoutEffect, useRef, useState } from 'react'
import { Portal } from '../ui.jsx'
import { Icon } from '../icons.jsx'
import './leadFieldControls.css'

export default function LeadEvidence({ field, label = '' }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const trigger = useRef(null)
  const panel = useRef(null)
  const restoreFocus = useRef(false)
  const focused = useRef(false)
  const [position, setPosition] = useState(null)

  useLayoutEffect(() => {
    if (!open) { setPosition(null); focused.current = false; return }
    const close = (restore = false) => { restoreFocus.current = restore; setOpen(false) }
    const place = () => {
      if (!trigger.current?.isConnected || !trigger.current.getClientRects().length) { close(); return }
      const rect = trigger.current.getBoundingClientRect()
      const margin = 12
      const width = Math.min(360, window.innerWidth - margin * 2)
      const maxHeight = Math.min(300, window.innerHeight - margin * 2)
      const height = Math.min(panel.current?.scrollHeight || maxHeight, maxHeight)
      const below = rect.bottom + 8
      const top = below + height <= window.innerHeight - margin ? below : rect.top - height - 8
      setPosition({ width, maxHeight, left: Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin)), top: Math.max(margin, Math.min(top, window.innerHeight - height - margin)) })
    }
    const outside = event => {
      if (!panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) close()
    }
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true) } }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    document.addEventListener('keydown', escape, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', outside)
      document.removeEventListener('keydown', escape, true)
      if (restoreFocus.current && trigger.current?.isConnected) trigger.current.focus()
    }
  }, [open])

  useLayoutEffect(() => {
    if (open && position && !focused.current) {
      panel.current?.querySelector('button')?.focus()
      focused.current = true
    }
  }, [open, position])

  return <>
    <button ref={trigger} type="button" className={label ? 'af-ev' : 'decision-ai-evidence'}
      aria-label={`View evidence for ${field.k}`} aria-haspopup="dialog" aria-expanded={open}
      aria-controls={open ? id : undefined} title="View evidence"
      onClick={event => { event.preventDefault(); event.stopPropagation(); restoreFocus.current = true; setOpen(!open) }}>
      <Icon name="eye" size={13} />{label}
    </button>
    {open && <Portal><section ref={panel} id={id} className="lead-evidence-popup" role="dialog"
      aria-label={`Evidence for ${field.k}`} style={position || {visibility:'hidden'}}
      onClick={event => event.stopPropagation()}>
      <header><strong>{field.k} — Evidence</strong><button type="button" aria-label="Close evidence" onClick={() => { restoreFocus.current = true; setOpen(false) }}><Icon name="x" size={16} /></button></header>
      <p>{field.ev || 'Evidence not supplied — verify against the original enquiry.'}</p>
      {field.note && <p>{field.note}</p>}
    </section></Portal>}
  </>
}
