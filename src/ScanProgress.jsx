import React from 'react'
import { Icon } from './icons.jsx'

// Keep long-running document work visible instead of leaving the user on the
// previous screen while PDF parsing or the AI request is in flight.
export default function ScanProgress({ title = 'Scanning document', fileName = '', stages = [], active = 0, error = '' }) {
  const safeStages = stages.length ? stages : ['Reading document…']
  const current = Math.min(Math.max(Number(active) || 0, 0), safeStages.length - 1)
  return (
    <section className="scan-progress form-card" aria-live="polite" aria-busy={!error}>
      <div className="scan-progress-heading">
        <span className="scan-progress-spinner" aria-hidden="true"><Icon name={error ? 'alert' : 'refresh'} size={18} /></span>
        <div>
          <div className="section-title">{error ? 'Scan needs attention' : title}</div>
          {fileName && <div className="hint scan-progress-file">{fileName}</div>}
        </div>
      </div>
      <div className="scan-progress-stages">
        {safeStages.map((stage, index) => (
          <div key={stage} className={`scan-progress-stage ${index < current ? 'complete' : index === current && !error ? 'active' : ''}`}>
            <span className="scan-progress-stage-icon" aria-hidden="true">
              {index < current ? <Icon name="check" size={12} /> : index === current && !error ? <Icon name="clock" size={12} /> : '·'}
            </span>
            <span>{stage}</span>
          </div>
        ))}
      </div>
      {!error && <div className="mb-track scan-progress-track"><span className="mb-fill class-Green" style={{ width: `${((current + 1) / safeStages.length) * 100}%` }} /></div>}
      {error && <div className="errorbox scan-progress-error" role="alert">{error}</div>}
    </section>
  )
}
