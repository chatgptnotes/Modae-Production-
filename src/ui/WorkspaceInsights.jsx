import React, { useState } from 'react'
import { Icon } from '../icons.jsx'

export default function WorkspaceInsights({ signals = [], onRefresh, className = '' }) {
  const [refreshing, setRefreshing] = useState(false)
  const visible = signals.filter(signal => Number(signal.count) > 0).slice(0, 3)
  const refresh = async () => {
    if (!onRefresh || refreshing) return
    setRefreshing(true)
    try { await onRefresh() }
    finally { setRefreshing(false) }
  }
  return <section className={`workspace-insights ${className}`} aria-label="Workspace signals">
    <div className="workspace-insights-items">
      {visible.length ? visible.map((signal, index) => <div className={`workspace-insight ${signal.tone || 'neutral'}`} key={`${signal.label}-${index}`}>
        <i aria-hidden="true" /><span>{signal.count != null && <b>{signal.count} </b>}{signal.label}</span>
      </div>) : <p className="workspace-insights-clear"><Icon name="checkCircle" size={14} /> No signals — all items within SLA</p>}
    </div>
    {onRefresh && <div className="workspace-insights-meta"><button type="button" onClick={refresh} disabled={refreshing}><Icon name="refresh" size={13} />{refreshing ? 'Refreshing…' : 'Refresh'}</button></div>}
  </section>
}
