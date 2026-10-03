import React from 'react'
import { fmtLakh } from './utils.js'

export default function WinLossPie({ wonCount = 0, lostCount = 0, wonValueK = 0, lostValueK = 0, commercial = false, compact = false }) {
  const wonMetric = commercial ? Number(wonValueK) || 0 : Number(wonCount) || 0
  const lostMetric = commercial ? Number(lostValueK) || 0 : Number(lostCount) || 0
  const total = wonMetric + lostMetric
  const wonPct = total ? (wonMetric / total) * 100 : 0
  const chartStyle = total
    ? { background: `conic-gradient(var(--status-success) 0 ${wonPct}%, var(--status-danger) ${wonPct}% 100%)` }
    : undefined
  const display = (count, valueK) => commercial ? fmtLakh(valueK) : `${count} ${count === 1 ? 'opportunity' : 'opportunities'}`
  const description = total
    ? `Won ${Math.round(wonPct)}%, Lost ${Math.round(100 - wonPct)}% by ${commercial ? 'commercial value' : 'opportunity count'}`
    : 'No won or lost opportunities in this selection'

  return (
    <div className={`win-loss-pie${compact ? ' is-compact' : ''}${total ? '' : ' is-empty'}`}>
      <div className="win-loss-pie-chart" style={chartStyle} role="img" aria-label={description}>
        <span aria-hidden="true">{total ? `${Math.round(wonPct)}%` : '—'}</span>
      </div>
      <div className="win-loss-pie-legend" role="group" aria-label={`Win and loss breakdown by ${commercial ? 'commercial value' : 'opportunity count'}`}>
        <div><i className="won" aria-hidden="true" /><span><b>Won</b><small>{display(wonCount, wonValueK)}</small></span></div>
        <div><i className="lost" aria-hidden="true" /><span><b>Lost</b><small>{display(lostCount, lostValueK)}</small></span></div>
      </div>
    </div>
  )
}
