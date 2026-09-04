import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ROLES } from '../seed.js'
import { Icon } from '../icons.jsx'

// Guided demo launcher — each scenario switches to the right persona and jumps
// straight to the screen where that story starts.

const SCENARIOS = [
  // The 20 Aug benchmark: the enquiry and the proposal the client named as the
  // yardstick for the spares flow. Kept first because it is the journey the
  // next review will walk.
  { n: 1, icon: 'clipboardCheck', label: 'Spares benchmark — enquiry 14716', hint: 'GeM five-item B&K enquiry → priced firm offer', persona: 'RS', to: '/inbox/LD-208' },
  { n: 2, icon: 'checkCircle', label: 'Green spares fast-track', hint: 'Green customer post-visit — quote within 24h', persona: 'RS', to: '/inbox/LD-203' },
  { n: 3, icon: 'alert', label: 'Missing info & clarification', hint: 'Low-confidence GeM bid, clarification loop', persona: 'PP', to: '/inbox/LD-205' },
  { n: 4, icon: 'refresh', label: 'Obsolete product → equivalent', hint: 'Vibrotest 60 → VST-100 suggestion', persona: 'PP', to: '/inbox/LD-204' },
  { n: 5, icon: 'layers', label: 'Project workbench deep-dive', hint: 'BOQ, signals, compliance, commercial gate', persona: 'RS', to: '/opp/2608222RS/proposal' },
  { n: 6, icon: 'flag', label: 'Red-class continuation (AP-1)', hint: 'Joint LJS+AH clearance, prepay-only terms', persona: 'RS', to: '/inbox/LD-206' },
]

export default function Launcher() {
  const store = useStore()
  const nav = useNavigate()

  // Every scenario is hardcoded to a seeded record (LD-203, 2608222RS, …), so
  // with the demo data removed they would all land on a blank screen.
  const demo = store.demoData !== false
  const start = s => {
    if (!demo) return
    store.setRole(s.persona)
    nav(s.to)
  }

  return (
    <div className="page">
        <h2>Demo launcher</h2>
      <div className="hint" style={{ marginBottom: 14, maxWidth: 640 }}>
        Guided demo scenarios — each starts at the right screen with the right persona.
        Every value on screen is fictional demo content.
      </div>

      {!demo && (
        <div className="warn-box" style={{ marginBottom: 14 }}>
          Demo data removed — restore it below to run the guided scenarios.
        </div>
      )}

      <div className="tile-grid primary">
        {SCENARIOS.map(s => (
          <div key={s.n} className="tile big" onClick={() => start(s)}
            style={demo ? undefined : { opacity: 0.45, cursor: 'default' }}>
            <span className="tile-icon"><Icon name={s.icon} size={26} /></span>
            <span className="tile-label">{s.n}. {s.label}</span>
            <span className="tile-hint">{s.hint}</span>
            <span className="tile-hint">Persona: <b>{s.persona}</b> — {ROLES[s.persona]?.name}</span>
            <div style={{ marginTop: 'auto', paddingTop: 6 }}>
              <button disabled={!demo} onClick={e => { e.stopPropagation(); start(s) }}>Start scenario</button>
            </div>
          </div>
        ))}
      </div>

    </div>
  )
}
