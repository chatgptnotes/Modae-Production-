import React from 'react'

// Dependency-free SVG chart primitives for the tablet command deck. Every
// colour comes from a --dash-* token or currentColor so the widgets flip with
// the theme instead of carrying baked-in light-mode hexes.

// Scaled line + soft area fill + end dot.
export function Sparkline({ points = [], height = 46, className = '' }) {
  const vals = points.map(p => p.value)
  if (vals.length < 2) return <div className={`spark-empty ${className}`}>Not enough history yet</div>
  const W = 100, H = height
  const min = Math.min(...vals), max = Math.max(...vals)
  const span = max - min || 1
  const x = i => (i / (vals.length - 1)) * W
  const y = v => H - 4 - ((v - min) / span) * (H - 10)
  const line = vals.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ')
  const last = { x: x(vals.length - 1), y: y(vals[vals.length - 1]) }

  return (
    <svg className={`spark ${className}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="sparkFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity=".28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${line} ${W},${H}`} fill="url(#sparkFade)" />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last.x} cy={last.y} r="2.5" fill="currentColor" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// Ring gauge. pathLength="100" makes stroke-dasharray literally "<pct> 100".
export function DonutGauge({ pct = 0, size = 74, caption }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)))
  return (
    <div className="gauge" style={{ width: size }}>
      <svg viewBox="0 0 40 40" width={size} height={size} className="gauge-svg">
        <circle className="gauge-track" cx="20" cy="20" r="16" pathLength="100" />
        <circle className="gauge-value" cx="20" cy="20" r="16" pathLength="100"
          strokeDasharray={`${p} 100`} transform="rotate(-90 20 20)" />
        <text className="gauge-text" x="20" y="21.5" textAnchor="middle">{p}%</text>
      </svg>
      {caption && <div className="gauge-caption">{caption}</div>}
    </div>
  )
}

// Half-circle gauge, same pathLength trick on an arc path.
export function ArcGauge({ pct = 0, size = 116, caption, value, fluid = false }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)))
  const arc = 'M 6 34 A 28 28 0 0 1 62 34'
  return (
    <div className={`gauge arc${fluid ? ' gauge-fluid' : ''}`} style={fluid ? undefined : { width: size }}>
      <svg viewBox="0 0 68 40" width={fluid ? '100%' : size} height={fluid ? '100%' : size * 0.6}
        className="gauge-svg" preserveAspectRatio="xMidYMid meet">
        <path className="gauge-track" d={arc} pathLength="100" />
        <path className="gauge-value" d={arc} pathLength="100" strokeDasharray={`${p} 100`} />
        <text className="gauge-text arc-text" x="34" y="32" textAnchor="middle">{value ?? `${p}%`}</text>
      </svg>
      {caption && <div className="gauge-caption">{caption}</div>}
    </div>
  )
}

// Period-over-period delta.
export function TrendPill({ delta }) {
  if (delta == null) return null
  const up = delta >= 0
  return (
    <span className={`trend-pill ${up ? 'up' : 'down'}`}>
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
        strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {up ? <><path d="M5 15l7-7 7 7" /></> : <><path d="M5 9l7 7 7-7" /></>}
      </svg>
      {Math.abs(delta)}%
    </span>
  )
}
