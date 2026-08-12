import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../icons.jsx'
import { AiBadge, Phase2Badge, KpiCard } from '../ui.jsx'
import { AI_MAP } from '../aimapData.js'

export default function AiMap() {
  const nav = useNavigate()
  const all = AI_MAP.flatMap(g => g.items)
  const p1 = all.filter(i => i.phase === 1).length
  const p2 = all.filter(i => i.phase === 2).length
  const live = all.filter(i => i.live).length

  return (
    <div className="page">
      <h2>AI & Automation Map</h2>
      <div className="hint" style={{ marginBottom: 12 }}>
        Every intervention is demonstrated in the app. <b>Live</b> items call the configured
        Gemini model for real; the rest are deterministic or seeded. Phase 2 items are direction previews.
      </div>

      <div className="kpi-row">
        <KpiCard label="AI interventions" value={all.length} hint="across the whole workflow" />
        <KpiCard label="Live on Gemini" value={live} hint="real model calls" />
        <KpiCard label="Phase 1" value={p1} hint="interactive in this build" />
        <KpiCard label="Phase 2" value={p2} hint="proposed direction" />
      </div>

      {AI_MAP.map(g => (
        <div key={g.group} className="aimap-group">
          <div className="aimap-group-head">
            <Icon name="sparkles" size={15} />
            <span>{g.group}</span>
            <span className="chip grey">{g.items.length}</span>
          </div>
          {g.items.map(i => (
            <div key={i.t} className="aimap-row">
              <AiBadge label={i.live ? 'Live' : i.phase === 2 ? 'AI' : 'Simulated'} />
              <div>
                <div className="ai-t">
                  {i.t}
                  {i.phase === 2 && <> <Phase2Badge /></>}
                </div>
                <div className="ai-d">{i.d}</div>
              </div>
              <button className="aimap-open" onClick={() => nav(i.to)}>
                Open in demo <Icon name="arrowRight" size={12} />
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
