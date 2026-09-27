import { MILESTONES } from './seed.js'

const milestoneIndex = milestone => MILESTONES.indexOf(milestone)

const isAllowedTransition = (current, incoming) => {
  const intent = incoming?.workflowTransition
  const currentIndex = milestoneIndex(current.milestone)
  const incomingIndex = milestoneIndex(incoming.milestone)
  return Boolean(
    intent?.id
    && typeof intent.reason === 'string'
    && intent.from === current.milestone
    && intent.to === incoming.milestone
    && current.workflowTransitionAppliedId !== intent.id
    && (incomingIndex >= currentIndex || intent.reason.trim()),
  )
}

// Complete opportunity rows arrive from browsers as snapshots. Preserve the
// server's lifecycle position when a stale snapshot is rebased after a save
// conflict. A user may still make a deliberate correction, but it must name
// the current server milestone and include its recorded reason.
export function mergeOpportunityRow(current, incoming) {
  if (!current) return incoming
  if (!incoming) return current
  const currentIndex = milestoneIndex(current.milestone)
  const incomingIndex = milestoneIndex(incoming.milestone)
  if (currentIndex < 0 || incomingIndex < 0 || incomingIndex === currentIndex) {
    return incoming
  }
  if (isAllowedTransition(current, incoming)) {
    return { ...incoming, workflowTransitionAppliedId: incoming.workflowTransition.id }
  }
  return {
    ...incoming,
    milestone: current.milestone,
    stage: current.stage,
    status: current.status,
    lastUpdated: current.lastUpdated,
    workflowTransition: current.workflowTransition,
    workflowTransitionAppliedId: current.workflowTransitionAppliedId,
  }
}

export function mergeConcurrentOpportunityRows(currentRows = [], desiredRows = []) {
  const currentById = new Map(currentRows.filter(row => row?.id).map(row => [String(row.id), row]))
  const desiredById = new Map(desiredRows.filter(row => row?.id).map(row => [String(row.id), row]))
  const ids = new Set([...currentById.keys(), ...desiredById.keys()])
  return [...ids].map(id => mergeOpportunityRow(currentById.get(id), desiredById.get(id))).filter(Boolean)
}
