import { ageDays, monthKey, monthLabel } from './utils.js'
import { routeForType } from './seed.js'

// Dashboard metrics. Kept as pure functions so the tablet command deck and the
// Analytics page can never disagree — the formulas below are the ones Analytics
// renders, not re-derived approximations.

// Probability weighting for the forecast (shared with Analytics).
export const PROB_WEIGHT = { Low: 0.25, Medium: 0.5, High: 0.75 }

// BT's promise to the customer: a spares/service quote inside 24 h, a project
// proposal inside two weeks. Measured from opportunity creation to proposal date.
export const TURNAROUND_TARGET = { Spares: 1, Service: 1, Project: 14 }

// The workload counts every badge in the app reads from.
export function counts(store, role = store.role) {
  const openOpps = store.opportunities.filter(o => o.status === 'Open')
  const stale = openOpps.filter(o => (ageDays(o.lastUpdated) ?? 0) > 30)
  const approvals = store.approvals || []
  const pending = approvals.filter(a => a.status === 'Pending')
  return {
    openOpps,
    open: openOpps.length,
    mine: openOpps.filter(o => o.owner === role).length,
    stale: stale.length,
    myStale: stale.filter(o => o.owner === role).length,
    newLeads: (store.leads || []).filter(l => l.status === 'New').length,
    pending: pending.length,
    myPending: pending.filter(a => a.requestedBy === role).length,
    // Gates this persona is personally expected to decide.
    forMe: pending.filter(a => (a.needed && a.needed.length ? a.needed : [a.approver])
      .includes(role) && !(a.decisions || {})[role]).length,
    openConditions: approvals.filter(a => a.status === 'Approved with conditions'
      && (a.conditions || []).some(c => !c.incorporated)).length,
    poReview: Object.values(store.poCompare || {}).filter(p => p.status === 'In review').length,
  }
}

// Order intake by month for the sparkline. Non-commercial roles get a count
// series instead of a value series, so the tile works without leaking ₹.
export function pipelineSeries(store, comm, months = 6) {
  const opps = store.opportunities
  const buckets = new Map()
  for (const o of opps) {
    const k = monthKey(o.orderDate || o.createDate)
    if (!k) continue
    buckets.set(k, (buckets.get(k) || 0) + (comm ? (+o.valueK || 0) : 1))
  }
  const points = [...buckets.keys()].sort().slice(-months)
    .map(k => ({ key: k, label: monthLabel(k), value: buckets.get(k) }))

  const open = opps.filter(o => o.status === 'Open')
  const total = open.reduce((s, o) => s + (+o.valueK || 0), 0)
  const weighted = open.reduce((s, o) => s + (+o.valueK || 0) * (PROB_WEIGHT[o.prob] ?? PROB_WEIGHT.Low), 0)

  const [prev, last] = [points[points.length - 2], points[points.length - 1]]
  const deltaPct = prev && prev.value && last ? Math.round(((last.value - prev.value) / prev.value) * 100) : null

  return { points, total, weighted, deltaPct, comm }
}

export function winRate(store) {
  const won = store.opportunities.filter(o => o.stage === 'Won').length
  const lost = store.opportunities.filter(o => o.stage === 'Lost').length
  const decided = won + lost
  return { won, lost, decided, pct: decided ? Math.round((won / decided) * 100) : 0 }
}

// Proposals sent within the route's target window — the metric Swami said he
// would judge the system by.
export function turnaround(store) {
  const quoted = store.opportunities.filter(o => o.createDate && o.proposalDate)
  let onTime = 0
  let daysTotal = 0
  for (const o of quoted) {
    const days = Math.max(0, Math.round(
      (new Date(o.proposalDate + 'T00:00:00') - new Date(o.createDate + 'T00:00:00')) / 86400000))
    daysTotal += days
    if (days <= (TURNAROUND_TARGET[routeForType(o.oppType)] ?? 14)) onTime += 1
  }
  return {
    onTime,
    total: quoted.length,
    pct: quoted.length ? Math.round((onTime / quoted.length) * 100) : 0,
    avgDays: quoted.length ? Math.round(daysTotal / quoted.length) : 0,
  }
}
