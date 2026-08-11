import React from 'react'
import { MILESTONES } from './seed.js'
import { Icon } from './icons.jsx'

// Shared chips/badges/steppers for the BT-prototype port. All styling lives in
// styles.css — these are the only markup shapes the pages should use.

export const Chip = ({ tone = '', children, title }) => (
  <span className={`chip ${tone}`} title={title}>{children}</span>
)

// AI-confidence chip; thresholds come from Admin config (high ≥90, med ≥75).
export function ConfChip({ conf, thresholds = { high: 90, med: 75 } }) {
  const pct = conf > 1 ? conf : Math.round(conf * 100)
  const tone = pct >= thresholds.high ? 'conf-hi' : pct >= thresholds.med ? 'conf-med' : 'conf-lo'
  return <span className={`chip ${tone}`} title={`AI confidence ${pct}%`}>{pct}%</span>
}

// Customer classification chip (Green / Blue / Amber / Red).
export const ClassChip = ({ cls }) => <span className={`pill ${cls}`}>{cls}</span>

export const Phase2Badge = () => (
  <span className="chip phase2" title="Phase 2 — direction preview, simulated only">Phase 2</span>
)

export const AiBadge = ({ label = 'AI' }) => (
  <span className="chip ai-badge"><Icon name="sparkles" size={11} /> {label}</span>
)

// 13-milestone lifecycle stepper.
export function Stepper({ current }) {
  const at = MILESTONES.indexOf(current)
  return (
    <div className="stepper">
      {MILESTONES.map((m, i) => (
        <div key={m} className={`step ${i < at ? 'done' : i === at ? 'now' : ''}`} title={m}>
          <span className="step-dot">{i < at ? <Icon name="check" size={9} /> : null}</span>
          <span className="step-label">{m}</span>
        </div>
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

export function Modal({ title, onClose, children, wide }) {
  return (
    <>
      <div className="filter-overlay" onClick={onClose} />
      <div className={`modal form-card ${wide ? 'wide' : ''}`}>
        {title && <div className="section-title">{title}</div>}
        {children}
      </div>
    </>
  )
}
