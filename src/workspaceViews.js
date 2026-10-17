// View responses are read models. Summary rows never enter persistence baselines.
export const DETAIL_ARRAYS = ['sparesLines', 'clarifications', 'audit']
export const DEFERRED_SLICES = ['proposals', ...DETAIL_ARRAYS]
export function workspaceViewForPath(path) {
  if (path === '/' || path === '/my-dashboard') return { kind: 'overview' }
  if (path === '/opportunities' || path === '/tracker') return { kind: 'list' }
  const match = path.match(/^\/opp\/([^/]+)/)
  if (match) return { kind: 'detail', id: decodeURIComponent(match[1]) }
  return { kind: 'full' }
}
export function opportunitySummary(row) {
  // Scalar register/KPI fields plus the immutable booking are enough for the
  // dashboard. Nested editor inputs and histories load with the register.
  return Object.fromEntries(Object.entries(row).filter(([key, value]) => key === 'booking' || value === null || typeof value !== 'object'))
}
const related = (row, id) => row.oppId === id || row.opportunityId === id || row.ref === id
export function workspaceView(state, view, signals = {}) {
  if (!['overview', 'list', 'detail', 'full'].includes(view?.kind) || view.kind === 'detail' && (!view.id || typeof view.id !== 'string')) throw new Error('Invalid workspace view.')
  const summary = { opportunities: (state.opportunities || []).map(opportunitySummary), signals }
  const slices = { ...state }
  delete slices._revisions
  delete slices.workspaceGeneration
  if (view.kind !== 'full') for (const key of DEFERRED_SLICES) delete slices[key]
  if (view.kind === 'overview') delete slices.opportunities
  if (view.kind === 'detail') {
    slices.opportunities = (state.opportunities || []).filter(row => row.id === view.id)
    slices.proposals = state.proposals?.[view.id] ? { [view.id]: state.proposals[view.id] } : {}
    for (const key of DETAIL_ARRAYS) slices[key] = (state[key] || []).filter(row => related(row, view.id))
  }
  return { view, slices, summary }
}
export function mergeWorkspaceView(current, result) {
  const slices = { ...result.slices }
  if (result.view.kind !== 'detail') return slices
  const id = result.view.id
  slices.opportunities = [...(current.opportunities || []).filter(row => row.id !== id), ...slices.opportunities]
  const proposals = { ...current.proposals }
  delete proposals[id]
  slices.proposals = { ...proposals, ...slices.proposals }
  for (const key of DETAIL_ARRAYS) {
    const incoming = new Map((slices[key] || []).map(row => [row.id, row]))
    const next = (current[key] || []).flatMap(row => {
      if (!related(row, id)) return [row]
      const replacement = incoming.get(row.id)
      incoming.delete(row.id)
      return replacement ? [replacement] : []
    })
    slices[key] = [...next, ...incoming.values()]
  }
  return slices
}
