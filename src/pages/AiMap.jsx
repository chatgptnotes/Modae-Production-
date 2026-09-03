import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../icons.jsx'
import { AiBadge, Phase2Badge, KpiCard } from '../ui.jsx'
import { AI_MAP } from '../aimapData.js'

// What each kind means, in one place — the badge, the tooltip and the counters
// all read from here, so the page can never overstate what is behind a row.
const KIND = {
  ai: { label: 'Live AI', title: 'Calls the configured Gemini model for real.' },
  rule: { label: 'Rule-based', title: 'Real behaviour computed from your data — deterministic, no model call.' },
  preview: { label: 'Preview', title: 'Illustrative only — the behaviour is not built yet.' },
}

export default function AiMap() {
  const nav = useNavigate()
  const all = AI_MAP.flatMap(g => g.items)
  const p1 = all.filter(i => i.phase === 1).length
  const p2 = all.filter(i => i.phase === 2).length
  const byKind = k => all.filter(i => i.kind === k).length

  return (
    <div className="page">
      <h2>AI and automation map</h2>
      <div className="hint" style={{ marginBottom: 12 }}>
        Every intervention opens where it actually runs. <b>Live AI</b> calls the configured Gemini
        model; <b>Rule-based</b> is real behaviour computed from your own data without a model;
        <b> Preview</b> shows the intended direction and is not built yet. Phase 2 items are the
        next stage of the roadmap.
      </div>

      <div className="kpi-row">
        <KpiCard label="AI interventions" value={all.length} hint="across the whole workflow" />
        <KpiCard label="Live on Gemini" value={byKind('ai')} hint="real model calls" />
        <KpiCard label="Rule-based" value={byKind('rule')} hint="computed from your data" />
        <KpiCard label="Preview" value={byKind('preview')} hint="direction, not yet built" />
        <KpiCard label="Phase 1 / 2" value={`${p1} / ${p2}`} hint="in this build / roadmap" />
      </div>

      {AI_MAP.map(g => (
        <div key={g.group} className="aimap-group">
          <div className="aimap-group-head">
            <Icon name="sparkles" size={15} />
            <span>{g.group}</span>
            <span className="chip grey">{g.items.length}</span>
          </div>
          {g.items.map(i => (
            <div key={i.t} className="aimap-row" title={KIND[i.kind]?.title}>
              <AiBadge label={KIND[i.kind]?.label || 'Preview'} />
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
