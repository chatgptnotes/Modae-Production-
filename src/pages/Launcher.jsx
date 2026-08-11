import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ROLES } from '../seed.js'
import { Icon } from '../icons.jsx'

// Guided demo launcher — each scenario switches to the right persona and jumps
// straight to the screen where that story starts.

const SCENARIOS = [
  { n: 1, icon: 'checkCircle', label: 'Green spares fast-track', hint: 'Green customer post-visit — quote within 24h', persona: 'RS', to: '/inbox/LD-203' },
  { n: 2, icon: 'alert', label: 'Missing info & clarification', hint: 'Low-confidence GeM bid, clarification loop', persona: 'PP', to: '/inbox/LD-205' },
  { n: 3, icon: 'refresh', label: 'Obsolete product → equivalent', hint: 'Vibrotest 60 → VST-100 suggestion', persona: 'PP', to: '/inbox/LD-204' },
  { n: 4, icon: 'layers', label: 'Project workbench deep-dive', hint: 'BOQ, signals, compliance, commercial gate', persona: 'RS', to: '/opp/2608222RS/proposal' },
  { n: 5, icon: 'flag', label: 'Red-class continuation (AP-1)', hint: 'Joint LJS+AH clearance, prepay-only terms', persona: 'RS', to: '/inbox/LD-206' },
  { n: 6, icon: 'clipboardCheck', label: 'PO validation & handover', hint: 'Proposal-vs-PO compare, joint acceptance, handover pack', persona: 'LJS', to: '/opp/2601122LJS/po' },
]

export default function Launcher() {
  const store = useStore()
  const nav = useNavigate()

  const start = s => {
    store.setRole(s.persona)
    nav(s.to)
  }

  return (
    <div className="page">
      <h2>Demo Launcher</h2>
      <div className="hint" style={{ marginBottom: 14, maxWidth: 640 }}>
        Guided demo scenarios — each starts at the right screen with the right persona.
        Every value on screen is fictional demo content.
      </div>

      <div className="tile-grid primary">
        {SCENARIOS.map(s => (
          <div key={s.n} className="tile big" onClick={() => start(s)}>
            <span className="tile-icon"><Icon name={s.icon} size={26} /></span>
            <span className="tile-label">{s.n}. {s.label}</span>
            <span className="tile-hint">{s.hint}</span>
            <span className="tile-hint">Persona: <b>{s.persona}</b> — {ROLES[s.persona]?.name}</span>
            <div style={{ marginTop: 'auto', paddingTop: 6 }}>
              <button onClick={e => { e.stopPropagation(); start(s) }}>Start scenario</button>
            </div>
          </div>
        ))}
      </div>

      <div className="tile-section">Housekeeping</div>
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <button onClick={() => {
          if (window.confirm('Reset all demo data? This clears every change and reloads the seed dataset.')) store.resetDemo()
        }}>
          <Icon name="refresh" size={13} /> Reset all demo data
        </button>
        <span className="hint">Clears local changes and restores the seeded pipeline, leads, approvals and orders.</span>
      </div>
    </div>
  )
}
