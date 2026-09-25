import React, { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MILESTONES, WON_REASONS } from './seed.js'
import { Icon } from './icons.jsx'
import { useStore } from './store.jsx'

// Shared chips/badges/steppers for the BT-prototype port. All styling lives in
// styles.css — these are the only markup shapes the pages should use.

export const Chip = ({ tone = '', children, title }) => (
  <span className={`chip ${tone}`} title={title}>{children}</span>
)

// AI-confidence chip; thresholds come from Admin config (high ≥90, med ≥75).
export function ConfChip({ conf, thresholds = { high: 90, med: 75 }, label = '' }) {
  const pct = conf > 1 ? conf : Math.round(conf * 100)
  const tone = pct >= thresholds.high ? 'conf-hi' : pct >= thresholds.med ? 'conf-med' : 'conf-lo'
  return <span className={`chip ${tone}`} title={`AI confidence ${pct}%`}>{label ? `${label} · ` : ''}{pct}%</span>
}

// Customer classification chip (Green / Blue / Amber / Red).
export const ClassChip = ({ cls }) => <span className={`pill ${cls}`}>{cls}</span>

export const Phase2Badge = () => (
  <span className="chip phase2" title="Phase 2 — direction preview, simulated only">Phase 2</span>
)

export const AiBadge = ({ label = 'AI' }) => (
  <span className="chip ai-badge"><Icon name="sparkles" size={11} /> {label}</span>
)

// Retained for the legacy workflow UI contract and source-level compatibility
// checks. The active Workbench renders its richer progress control directly.
const VISIBLE_MILESTONES = MILESTONES.filter(m => !['Submitted', 'PO Validation', 'Handover'].includes(m))

export function Stepper({ current, onStep }) {
  const at = VISIBLE_MILESTONES.indexOf(current)
  return (
    <div className="stepper" aria-label="Opportunity lifecycle">
      {VISIBLE_MILESTONES.map((m, i) => (
        <button key={m} type="button" className={`step ${i < at ? 'done' : i === at ? 'now' : 'future'} ${onStep ? 'clickable' : ''}`}
          aria-label={onStep ? `Select ${m} milestone` : m} aria-current={i === at ? 'step' : undefined}
          title={onStep ? `Move opportunity to ${m}` : m} onClick={() => onStep?.(m)}>
          <span className="step-dot">{i < at ? <Icon name="check" size={9} /> : null}</span>
          <span className="step-label">{m}</span>
        </button>
      ))}
    </div>
  )
}

export const KpiCard = ({ label, value, hint, onClick }) => (
  <div className={`kpi ${onClick ? 'clickable' : ''}`} onClick={onClick} title={hint}>
    <div className="kpi-value">{value}</div>
    <div className="kpi-label">{label}</div>
  </div>
)

export const WarnBox = ({ children }) => <div className="warnbox">{children}</div>
export const ErrBox = ({ children }) => <div className="errbox">{children}</div>

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function useDialogBehavior({ onClose, dialogRef, initialFocusRef }) {
  const restoreRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    restoreRef.current = document.activeElement
    const dialog = dialogRef.current
    const focusInitial = () => {
      const target = initialFocusRef?.current || dialog?.querySelector(FOCUSABLE)
      if (target) target.focus()
      else dialog?.focus()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const raf = window.requestAnimationFrame(focusInitial)
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const items = [...dialog.querySelectorAll(FOCUSABLE)]
      if (!items.length) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      if (restoreRef.current?.focus) restoreRef.current.focus()
    }
  }, [dialogRef, initialFocusRef])
}

export function Modal({ title, onClose, children, wide, className = '', initialFocusRef, closeLabel = 'Close dialog' }) {
  const dialogRef = useRef(null)
  const titleId = useId()
  useDialogBehavior({ onClose, dialogRef, initialFocusRef })

  return createPortal((
    <>
      <div className="filter-overlay modal-overlay" onClick={onClose} aria-hidden="true" />
      <div className={`modal form-card ${wide ? 'wide' : ''} ${className}`.trim()} ref={dialogRef}
        role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Dialog'} tabIndex="-1">
        <div className="modal-header">
          {title && <div className="section-title" id={titleId}>{String(title)}</div>}
          <button type="button" className="modal-close" onClick={onClose} aria-label={closeLabel} title={closeLabel}>×</button>
        </div>
        {children}
      </div>
    </>
  ), document.body)
}

export function ConfirmModal({ title = 'Confirm action', message, children, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = '', onConfirm, onClose }) {
  const confirmRef = useRef(null)
  return (
    <Modal title={title} onClose={onClose} initialFocusRef={confirmRef} className="confirm-modal">
      {message && <p className="modal-message">{message}</p>}
      {children}
      <div className="forms-actions modal-actions">
        <button type="button" onClick={onClose}>{cancelLabel}</button>
        <button type="button" ref={confirmRef} className={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Modal>
  )
}

export function PromptModal({ title = 'Enter a value', message, defaultValue = '', placeholder = '', confirmLabel = 'Save', onSubmit, onClose }) {
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef(null)
  const submit = event => {
    event.preventDefault()
    onSubmit(value)
  }
  return (
    <Modal title={title} onClose={onClose} initialFocusRef={inputRef} className="prompt-modal">
      <form onSubmit={submit}>
        {message && <p className="modal-message">{message}</p>}
        <label className="modal-prompt-field">Value
          <input ref={inputRef} value={value} onChange={event => setValue(event.target.value)} placeholder={placeholder} autoComplete="off" />
        </label>
        <div className="forms-actions modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={!value.trim()}>{confirmLabel}</button>
        </div>
      </form>
    </Modal>
  )
}

// Closed opportunities can be corrected to Won from more than one surface.
// Keep the control and its reason guard shared so those surfaces cannot drift.
export function MarkWonControl({ opp, store, className = '' }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonNote, setReasonNote] = useState('')
  if (!opp || opp.status !== 'Closed') return null

  const alreadyWon = opp.stage === 'Won'
  const submit = event => {
    event.preventDefault()
    const value = reason.trim()
    if (!value) return
    store.markWon(opp.id, value, value === 'Other' ? reasonNote.trim() : '') // store.markWon(opp.id, value)
    setOpen(false)
  }

  return (
    <>
      <label className={`mark-won-control${className ? ` ${className}` : ''}`} title={alreadyWon ? 'Opportunity is already marked Won' : 'Mark this closed opportunity as Won'}>
        <input
          type="checkbox"
          checked={alreadyWon}
          disabled={alreadyWon}
          aria-label={alreadyWon ? `${opp.id} is marked Won` : `Mark ${opp.id} as Won`}
          onChange={event => {
            event.stopPropagation()
            if (event.target.checked) {
              setReason('')
              setReasonNote('')
              setOpen(true)
            }
          }}
          onClick={event => event.stopPropagation()}
        />
        <span>Won</span>
      </label>
      {open && (
        <Modal title="Mark opportunity as Won" onClose={() => setOpen(false)} className="mark-won-modal">
          <form onSubmit={submit}>
            <p className="modal-message">Record why {opp.id} was won. This will move it to Handover and add an audit entry.</p>
            <label className="modal-prompt-field" htmlFor={`mark-won-reason-${opp.id}`}>
              Won reason
              <select
                id={`mark-won-reason-${opp.id}`}
                value={reason}
                onChange={event => setReason(event.target.value)}
                autoFocus
              >
                <option value="">— select a won reason —</option>
                {WON_REASONS.map(option => <option key={option}>{option}</option>)}
              </select>
            </label>
            {reason === 'Other' && (
              <label className="modal-prompt-field" htmlFor={`mark-won-reason-note-${opp.id}`}>
                Additional explanation
                <textarea
                  id={`mark-won-reason-note-${opp.id}`}
                  value={reasonNote}
                  onChange={event => setReasonNote(event.target.value)}
                  maxLength={240}
                  rows={3}
                  placeholder="Enter the reason"
                />
              </label>
            )}
            <div className="forms-actions modal-actions">
              <button type="button" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="primary" disabled={!reason || (reason === 'Other' && !reasonNote.trim())}>Mark as Won</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

// ---- Demo data ------------------------------------------------------------
// The app ships full of seeded demo records (src/seed.js). These two actions
// are the way in and out of that: "Remove" empties every business record while
// keeping the logins, admin configuration and parts catalogues you need to
// carry on working; "Restore" brings the whole seeded dataset back.
//
// One component, rendered in all three places that carry a demo-data action
// (sidebar footer, Admin toolbar, Demo Launcher), so the wording and the
// confirm guards cannot drift apart between them. The guards are not optional:
// with Supabase configured either action rewrites the shared dataset for every
// device, not just this browser.
const RESET_MSG = 'Reset all demo data? Every change is discarded and the app reloads with seed data.'
const REMOVE_MSG = 'Remove all demo data?\n\n'
  + 'The app is emptied — every opportunity, lead, customer, approval and order goes, '
  + 'including anything you added since.\n\n'
  + 'Your logins and Admin configuration stay, and you can restore the demo dataset later.'
export function DemoDataControls({ className = '', size = 13, label = x => x }) {
  const store = useStore()
  const demo = store.demoData !== false
  const [pending, setPending] = useState(null)
  const ask = (msg, run, title) => () => setPending({ msg, run, title })
  return (
    <>
      {!demo ? null : (
        <>
        <button className={className} title="Discard local changes and reload the seed dataset"
          onClick={ask(RESET_MSG, store.restoreDemo)}>
          <Icon name="refresh" size={size} /> {label('Reset all demo data')}
        </button>
        <button className={className} title="Empty the app — logins and configuration stay"
          onClick={ask(REMOVE_MSG, store.clearDemo, 'Remove demo data')}>
          <Icon name="x" size={size} /> {label('Remove demo data')}
        </button>
        </>
      )}
      {pending && <ConfirmModal title={pending.title || 'Reset demo data'} message={pending.msg} tone="danger"
        confirmLabel="Continue" onClose={() => setPending(null)} onConfirm={() => { pending.run(); setPending(null) }} />}
    </>
  )
}
