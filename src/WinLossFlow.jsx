import { fmtLakh } from './utils.js'

function FlowNode({ label, count, value, tone = '' }) {
  return (
    <div className={`win-loss-flow-node${tone ? ` ${tone}` : ''}`}>
      <span className="win-loss-flow-node-label">{label}</span>
      <strong>{count}</strong>
      <span className="win-loss-flow-node-value">{value}</span>
    </div>
  )
}

export default function WinLossFlow({ openCount = 0, closedCount = 0, wonCount = 0, lostCount = 0, commercial = false, wonValueK = 0, lostValueK = 0 }) {
  const value = (count, valueK) => commercial ? fmtLakh(valueK) : `${count} opportunities`
  const hasClosed = closedCount > 0

  return (
    <div className={`win-loss-flow${hasClosed ? '' : ' is-empty'}`} aria-label="Opportunity outcome flow">
      <div className="win-loss-flow-main">
        <FlowNode label="Open opportunities" count={openCount} value="Active pipeline" />
        <span className="win-loss-flow-arrow" aria-hidden="true">→</span>
        <FlowNode label="Closed" count={closedCount} value={hasClosed ? 'Recorded outcomes' : 'Awaiting first outcome'} />
      </div>
      <div className="win-loss-flow-branches" aria-label="Closed opportunity outcomes">
        <span className="win-loss-flow-branch-line" aria-hidden="true" />
        <FlowNode label="Won" count={wonCount} value={value(wonCount, wonValueK)} tone="won" />
        <FlowNode label="Lost" count={lostCount} value={value(lostCount, lostValueK)} tone="lost" />
      </div>
      {!hasClosed && <p className="win-loss-flow-empty-note">No closed data yet — mark an opportunity Won or Lost with a reason to populate this flow.</p>}
    </div>
  )
}
