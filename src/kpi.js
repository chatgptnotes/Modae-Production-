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

// ---------------------------------------------------------------- FY targets
// Indian financial year: Q1 is Apr-Jun. Shared so My Dashboard and Analytics
// bucket a booking date the same way.
export const FY_QUARTERS = ['Q1 Apr–Jun', 'Q2 Jul–Sep', 'Q3 Oct–Dec', 'Q4 Jan–Mar']
export const FY_MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']

const fyMonthIndex = dateStr => {
  const m = parseInt((dateStr || '').split('-')[1], 10)
  if (!m) return -1
  return m >= 4 ? m - 4 : m + 8
}
export const fyQuarter = dateStr => {
  const i = fyMonthIndex(dateStr)
  return i < 0 ? -1 : Math.floor(i / 3)
}

// One owner's target-versus-booked picture for the year. `owner` null means the
// whole company (an approver or admin looking at the team). All money is K₹, as
// everywhere else in the app.
export function salesPerformance(store, owner = null) {
  const sales = store.sales || { targets: {}, orders: [] }
  const owners = owner ? [owner] : Object.keys(sales.targets || {})
  const target = owners.reduce((t, o) => {
    const own = sales.targets?.[o] || {}
    return {
      annual: t.annual + (own.annual || 0),
      q: t.q.map((v, i) => v + ((own.q || [])[i] || 0)),
    }
  }, { annual: 0, q: [0, 0, 0, 0] })

  const orders = (sales.orders || []).filter(o => !owner || o.owner === owner)
  const bucket = pick => orders.filter(pick).reduce((s, o) => s + (+o.valueK || 0), 0)
  const quarterActual = [0, 1, 2, 3].map(i => bucket(o => fyQuarter(o.booked) === i))
  const monthly = FY_MONTHS.map((_, i) => bucket(o => fyMonthIndex(o.booked) === i))

  const achieved = quarterActual.reduce((a, b) => a + b, 0)
  const elapsed = sales.monthsElapsed || 0
  return {
    fy: sales.fy || '',
    currentQ: Math.max(0, (sales.currentQ || 1) - 1),
    orders,
    annual: target.annual,
    quarterTarget: target.q,
    quarterActual,
    monthly,
    achieved,
    gap: Math.max(0, target.annual - achieved),
    attainPct: target.annual ? (achieved / target.annual) * 100 : 0,
    // Where the number should be if the year ran evenly, and where this pace lands.
    expected: elapsed ? (target.annual / 12) * elapsed : 0,
    runRate: elapsed ? (achieved / elapsed) * 12 : 0,
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

// Small count-per-month series for the Home stat cards' sparklines.
export function miniSeries(items, dateOf, buckets = 6) {
  const map = new Map()
  for (const it of items || []) {
    const k = monthKey(String(dateOf(it) || '').slice(0, 10))
    if (!k) continue
    map.set(k, (map.get(k) || 0) + 1)
  }
  const keys = [...map.keys()].sort().slice(-buckets)
  // A single bucket can't draw a line — pad with a leading zero so the card
  // still shows a shape on sparse demo data.
  const pts = keys.map(k => ({ key: k, label: monthLabel(k), value: map.get(k) }))
  return pts.length === 1 ? [{ key: 'pad', label: '', value: 0 }, ...pts] : pts
}

// The three headline cards on the desktop Home.
export function homeKpis(store, role) {
  const c = counts(store, role)
  const leads = store.leads || []
  const approvals = store.approvals || []
  return [
    {
      key: 'leads', label: 'New leads', value: c.newLeads, tone: 'good', to: '/inbox',
      hint: 'Leads to qualify in the inbox',
      series: miniSeries(leads, l => l.ts),
    },
    {
      key: 'approvals', label: 'Pending approvals', value: c.pending, tone: 'warn', to: '/approvals',
      hint: 'Decisions waiting on an approver',
      series: miniSeries(approvals, a => a.ts),
    },
    {
      key: 'mine', label: 'My open opportunities', value: c.mine, tone: 'neutral', to: '/my',
      hint: 'Open opportunities you own',
      series: miniSeries(c.openOpps.filter(o => o.owner === role), o => o.createDate),
    },
  ]
}
