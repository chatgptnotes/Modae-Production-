import React, { useEffect } from 'react'
import { MILESTONES } from './seed.js'
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

// Compact lifecycle stepper. Post-submission terminal states remain in the
// domain model, but the visible workflow stays focused on the ten user-facing
// phases used by the Workbench.
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

export function Modal({ title, onClose, children, wide, className = '' }) {
  useEffect(() => {
    const onKeyDown = event => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <>
      <div className="filter-overlay modal-overlay" onClick={onClose} />
      <div className={`modal form-card ${wide ? 'wide' : ''} ${className}`.trim()} role="dialog" aria-modal="true" aria-label={title}>
        {title && <div className="section-title">{String(title)}</div>}
        {children}
      </div>
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
const RESTORE_MSG = 'Restore the demo dataset?\n\n'
  + 'Anything you entered since removing it is discarded.'

export function DemoDataControls({ className = '', size = 13, label = x => x }) {
  const store = useStore()
  const demo = store.demoData !== false
  const ask = (msg, run) => () => { if (window.confirm(msg)) run() }
  return (
    <>
      {demo && (
        <button className={className} title="Discard local changes and reload the seed dataset"
          onClick={ask(RESET_MSG, store.restoreDemo)}>
          <Icon name="refresh" size={size} /> {label('Reset all demo data')}
        </button>
      )}
      {demo ? (
        <button className={className} title="Empty the app — logins and configuration stay"
          onClick={ask(REMOVE_MSG, store.clearDemo)}>
          <Icon name="x" size={size} /> {label('Remove demo data')}
        </button>
      ) : (
        <button className={className} title="Bring the seeded demo dataset back"
          onClick={ask(RESTORE_MSG, store.restoreDemo)}>
          <Icon name="refresh" size={size} /> {label('Restore demo data')}
        </button>
      )}
    </>
  )
}
