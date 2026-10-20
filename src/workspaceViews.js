// View responses are read models. Summary rows never enter persistence baselines.
import { validateWorkspaceView, leadIndex } from './workspaceViewPlan.js'
export const DETAIL_ARRAYS = ['sparesLines', 'clarifications', 'audit']
export const DEFERRED_SLICES = ['proposals', ...DETAIL_ARRAYS]
export function workspaceNeedsCatalogue(path, view = workspaceViewForPath(path)) {
  return !!view.pricing || path === '/pricelists' || /^\/opp\/[^/]+\/(spares|sourcing|proposal)$/.test(path)
}
export function workspaceViewForPath(path) {
  if (path === '/my-dashboard' || path === '/dashboard') return { kind: 'overview' }
  if (['/', '/opportunities', '/tracker', '/my', '/home'].includes(path)) return { kind: 'list' }
  if (path === '/inbox') return { kind: 'inbox' }
  const lead = path.match(/^\/(inbox|register)\/([^/]+)/)
  if (lead) return { kind: 'lead', id: decodeURIComponent(lead[2]), ...(lead[1] === 'register' ? { pricing: true } : {}) }
  if (path === '/approvals') return { kind: 'approvals' }
  if (path === '/proposal-sent') return { kind: 'sent' }
  if (['/order', '/po'].includes(path)) return { kind: 'orders' }
  if (['/personal-settings', '/more'].includes(path)) return { kind: 'identity' }
  const proposal = path.match(/^\/proposal\/([^/]+)/)
  if (proposal) return { kind: 'detail', id: decodeURIComponent(proposal[1]), pricing: true }
  const match = path.match(/^\/opp\/([^/]+)/)
  if (match) return { kind: 'detail', id: decodeURIComponent(match[1]) }
  return { kind: 'full' }
}
export function opportunitySummary(row) {
  // Scalar register/KPI fields plus the immutable booking are enough for the
  // dashboard. Nested editor inputs and histories load with the register.
  return Object.fromEntries(Object.entries(row).filter(([key, value]) => key === 'booking' || value === null || typeof value !== 'object'))
}
const related = (row, id) => row.oppId === id || row.opportunityId === id || row.ref === id || row.objectId === id
export function workspaceView(state, view, signals = {}) {
  validateWorkspaceView(view)
  const summary = { opportunities: (state.opportunities || []).map(opportunitySummary), signals }
  const slices = { ...state }
  delete slices._revisions
  delete slices.workspaceGeneration
  delete slices._loaded
  delete slices._coverage
  const loaded = state._loaded ? new Set(state._loaded) : null
  if (loaded) for (const key of Object.keys(slices)) if (!loaded.has(key)) delete slices[key]
  if (['overview','list','inbox','lead','sent','orders','identity'].includes(view.kind)) for (const key of DEFERRED_SLICES) delete slices[key]
  if (view.kind === 'overview') delete slices.opportunities
  if (view.kind === 'inbox') {
    summary.leads = (state.leads || []).map(leadIndex)
    summary.leadArchive = (state.leadArchive || []).map(leadIndex)
    const visible = new Set(summary.leads.map(row => row.id))
    summary.leadRevisions = Object.fromEntries((state._revisions?.leadIndex || state._revisions?.leads || []).filter(row => visible.has(row.id)).map(row => [row.id, row.rev]))
    delete slices.leads; delete slices.leadArchive
  }
  if (view.kind === 'sent') {
    summary.proposalRevisions = Object.fromEntries(Object.entries(state.proposals || {}).map(([id, row]) => [id, { revision: row.revision || '00' }]))
    delete slices.proposals; delete slices.opportunities
  }
  if (view.kind === 'orders') delete slices.opportunities
  if (view.kind === 'lead') slices.leads = (state.leads || []).filter(row => row.id === view.id)
  if (view.kind === 'detail') {
    slices.opportunities = (state.opportunities || []).filter(row => row.id === view.id)
    slices.proposals = state.proposals?.[view.id] ? { [view.id]: state.proposals[view.id] } : {}
    for (const key of DETAIL_ARRAYS) slices[key] = (state[key] || []).filter(row => related(row, view.id))
  }
  const navigation = state._navigation || state
  summary.navigation = { opportunities: (navigation.opportunities || []).map(opportunitySummary), leads: (navigation.leads || []).map(leadIndex), approvals: navigation.approvals || [], customers: navigation.customers || [] }
  delete slices._navigation
  return { view, slices, summary, ...(state._coverage ? { coverage: state._coverage } : {}) }
}
export function mergeWorkspaceView(current, result) {
  const slices = { ...result.slices }
  if (result.coverage && result.view.kind !== 'detail') {
    for (const [collection, ids] of Object.entries(result.coverage.records || {})) {
      if (!Object.hasOwn(slices, collection)) continue
      const keys = new Set(ids)
      slices[collection] = Array.isArray(slices[collection])
        ? [...(current[collection] || []).filter(row => !keys.has(row.id)), ...slices[collection]]
        : { ...Object.fromEntries(Object.entries(current[collection] || {}).filter(([id]) => !keys.has(id))), ...slices[collection] }
    }
    return slices
  }
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

// Reconcile records independently even when event-driven sync is disabled.
// Dirty or form-owned records keep BOTH their value and original baseline.
export function reconcileWorkspaceCollection(current, baseline, remote, pinned = () => false) {
  const array = Array.isArray(remote)
  const entries = value => array ? (value || []).map(row => [row.id, row]) : Object.entries(value || {})
  const local = new Map(entries(current)), base = new Map(entries(baseline)), server = new Map(entries(remote))
  const next = new Map(), saved = new Map()
  for (const id of new Set([...local.keys(), ...base.keys(), ...server.keys()])) {
    const dirty = pinned(id) || JSON.stringify(local.get(id)) !== JSON.stringify(base.get(id))
    const value = dirty ? local.get(id) : server.get(id)
    const old = dirty ? base.get(id) : server.get(id)
    if (value !== undefined) next.set(id, value)
    if (old !== undefined) saved.set(id, old)
  }
  return { value: array ? [...next.values()] : Object.fromEntries(next), baseline: array ? [...saved.values()] : Object.fromEntries(saved) }
}
