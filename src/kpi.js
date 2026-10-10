import { ageDays, monthKey, monthLabel, canViewCommercial, isSalesOwner } from './utils.js'
import { OWNERS, routeForType } from './seed.js'

// One pipeline definition shared by the dashboard, analytics, and tracker.
// The stored stage values remain backward-compatible; these are the customer-
// facing funnel labels and their legacy stage aliases.
export const FUNNEL_STAGES = [
  { key: 'qualified', label: 'Qualified Lead', stages: ['Lead', 'RFI'], note: 'qualified interest' },
  { key: 'budgetary', label: 'Budgetary', stages: ['Budgetary'], note: 'budgetary request' },
  { key: 'rfq', label: 'RFQ', stages: ['RFQ'], note: 'formal enquiry' },
  { key: 'firm-proposal', label: 'Firm Proposal', stages: ['Firm Bid'], note: 'commercial proposal' },
  { key: 'negotiate', label: 'Negotiate', stages: ['Negotiate'], note: 'commercial review' },
  { key: 'won', label: 'Won', stages: ['Won'], note: 'closed won' },
  { key: 'closed-no-win', label: 'Closed / No Win', stages: [], note: 'closed without an explicit Won stage' },
]

export function funnelRows(opportunities = [], { owner = null } = {}) {
  const scoped = opportunities.filter(o => !owner || o.owner === owner)
  return FUNNEL_STAGES.map(group => {
    const rows = scoped.filter(o => {
      if (group.key === 'won') return o.status === 'Closed' && o.stage === 'Won'
      if (group.key === 'closed-no-win') return o.status === 'Closed' && o.stage !== 'Won'
      return group.stages.includes(o.stage) && o.status === 'Open'
    })
    return {
      ...group,
      count: rows.length,
      valueK: rows.reduce((sum, row) => sum + (+row.valueK || 0), 0),
    }
  })
}

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
  const newLeads = (store.leads || []).filter(l => l.status === 'New')
  return {
    openOpps,
    open: openOpps.length,
    mine: openOpps.filter(o => o.owner === role).length,
    stale: stale.length,
    myStale: stale.filter(o => o.owner === role).length,
    // Keep the badge aligned with the inbox: sales owners see their assigned
    // New leads by default, while approvers/admins see the whole mailbox.
    newLeads: (isSalesOwner(role) ? newLeads.filter(l => l.suggestedOwner === role) : newLeads)
      .filter(l => !l.readAt).length,
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
  // The target run rate is the quarter's number spread over its three months,
  // not a flat annual twelfth: the quarterly targets are not equal, so a flat
  // line understates Q1 and overstates Q4. This is the reference prototype's
  // `mTarget = FY_MONTHS.map((m, i) => t.q[Math.floor(i / 3)] / 3)`.
  const monthlyTarget = FY_MONTHS.map((_, i) => (target.q[Math.floor(i / 3)] || 0) / 3)
  return {
    fy: sales.fy || '',
    currentQ: Math.max(0, (sales.currentQ || 1) - 1),
    orders,
    annual: target.annual,
    quarterTarget: target.q,
    quarterActual,
    monthly,
    monthlyTarget,
    // How many months of the year are actually behind us. The actual series
    // stops here — the remaining months are unbooked, not zero-booked.
    monthsElapsed: elapsed,
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

// Compact, permission-aware snapshot for landing pages. Keep this beside the
// detailed KPI formulas so Home and Analytics never tell different stories.
export function analyticsSnapshot(store, role = store.role, { scope = 'role' } = {}) {
  const comm = canViewCommercial(role)
  // LJS is the strategic owner, not a sales-owner scope. Their landing page
  // must start with the complete company picture; individual sales owners
  // remain scoped to their own pipeline.
  const owner = scope === 'my' ? role : (scope === 'role' && isSalesOwner(role) ? role : null)
  const scoped = (store.opportunities || []).filter(o => !owner || o.owner === owner)
  const open = scoped.filter(o => o.status === 'Open')
  const sum = rows => rows.reduce((total, o) => total + (+o.valueK || 0), 0)
  const funnel = funnelRows(scoped, { owner })
  const won = scoped.filter(o => o.stage === 'Won').length
  const lost = scoped.filter(o => o.stage === 'Lost').length
  const decided = won + lost
  const pipelineK = sum(open)
  const weightedK = open.reduce((total, o) => total + (+o.valueK || 0) * (PROB_WEIGHT[o.prob] ?? PROB_WEIGHT.Low), 0)
  const byOwner = [...new Set(open.map(o => o.owner).filter(Boolean))]
    .map(name => {
      const rows = open.filter(o => o.owner === name)
      return { name, count: rows.length, valueK: sum(rows) }
    })
    .sort((a, b) => comm ? b.valueK - a.valueK : b.count - a.count)

  return {
    comm,
    owner,
    openCount: open.length,
    pipelineK,
    weightedK,
    funnel,
    won,
    lost,
    decided,
    winPct: decided ? Math.round((won / decided) * 100) : 0,
    byOwner,
    counts: counts(store, role),
  }
}

export function winRate(store) {
  const won = store.opportunities.filter(o => o.stage === 'Won').length
  const lost = store.opportunities.filter(o => o.stage === 'Lost').length
  const decided = won + lost
  return { won, lost, decided, pct: decided ? Math.round((won / decided) * 100) : 0 }
}

// Closed-opportunity analysis. Keep the aggregation pure so Analytics, exports,
// and future tablet reporting use one definition of a win, loss, and reason.
export function winLossAnalysis(opportunities = [], competitors = [], { commercial = true } = {}) {
  const competitorByOpp = new Map()
  for (const competitor of competitors || []) {
    if (competitor?.oppId && competitor?.name && !competitorByOpp.has(competitor.oppId)) {
      competitorByOpp.set(competitor.oppId, competitor.name)
    }
  }
  const closed = opportunities.filter(o =>
    (o?.status == null || o.status === 'Closed') && (o?.stage === 'Won' || o?.stage === 'Lost'))
  const closedOtherRows = opportunities.filter(o =>
    o?.status === 'Closed' && o?.stage !== 'Won' && o?.stage !== 'Lost')
  const wonRows = closed.filter(o => o.stage === 'Won')
  const lostRows = closed.filter(o => o.stage === 'Lost')
  const valueOf = row => Number(row.valueK) || 0
  const summary = {
    total: closed.length,
    won: wonRows.length,
    lost: lostRows.length,
    winRate: closed.length ? Math.round((wonRows.length / closed.length) * 100) : 0,
    wonValueK: commercial ? wonRows.reduce((sum, row) => sum + valueOf(row), 0) : null,
    lostValueK: commercial ? lostRows.reduce((sum, row) => sum + valueOf(row), 0) : null,
  }
  const grouped = new Map()
  for (const row of closed) {
    const reason = String(row.closedReason || '').trim() || 'Unspecified'
    const current = grouped.get(reason) || {
      reason, won: 0, lost: 0, total: 0, wonValueK: 0, lostValueK: 0,
    }
    current[row.stage === 'Won' ? 'won' : 'lost'] += 1
    current.total += 1
    if (row.stage === 'Won') current.wonValueK += valueOf(row)
    else current.lostValueK += valueOf(row)
    grouped.set(reason, current)
  }
  const byReason = [...grouped.values()]
    .sort((a, b) => (commercial ? b.wonValueK + b.lostValueK - a.wonValueK - a.lostValueK : b.total - a.total)
      || a.reason.localeCompare(b.reason))
    .map(row => ({
      ...row,
      wonValueK: commercial ? row.wonValueK : null,
      lostValueK: commercial ? row.lostValueK : null,
      totalValueK: commercial ? row.wonValueK + row.lostValueK : null,
      winRate: row.total ? Math.round((row.won / row.total) * 100) : 0,
    }))
  const bestReason = (field, valueField) => {
    const candidates = byReason.filter(row => row[field] > 0)
    if (!candidates.length) return null
    return candidates.slice().sort((a, b) => (commercial
      ? (b[valueField] - a[valueField]) || (b[field] - a[field])
      : (b[field] - a[field]) || a.reason.localeCompare(b.reason)))[0]
  }
  const topWinReason = bestReason('won', 'wonValueK')
  const topLossReason = bestReason('lost', 'lostValueK')
  const totalClosedValue = commercial ? summary.wonValueK + summary.lostValueK : 0
  const insights = {
    topWinReason: topWinReason?.reason || '',
    topLossReason: topLossReason?.reason || '',
    topWinReasonValueK: commercial ? (topWinReason?.wonValueK || 0) : null,
    topLossReasonValueK: commercial ? (topLossReason?.lostValueK || 0) : null,
    wonValueShare: commercial && totalClosedValue ? Math.round((summary.wonValueK / totalClosedValue) * 100) : (commercial ? 0 : null),
  }
  const rows = closed.map(row => ({
    ...row,
    result: row.stage,
    reason: String(row.closedReason || '').trim() || 'Unspecified',
    competitor: competitorByOpp.get(row.id) || '',
    valueK: commercial ? valueOf(row) : null,
    closeDate: row.lastUpdated || row.orderDate || row.createDate || '',
  }))
  const closedOtherByStage = new Map()
  for (const row of closedOtherRows) {
    const stage = String(row.stage || '').trim() || 'Unspecified'
    const current = closedOtherByStage.get(stage) || { stage, count: 0, valueK: 0 }
    current.count += 1
    current.valueK += valueOf(row)
    closedOtherByStage.set(stage, current)
  }
  const closedOther = {
    count: closedOtherRows.length,
    byStage: [...closedOtherByStage.values()]
      .sort((a, b) => b.count - a.count || a.stage.localeCompare(b.stage))
      .map(row => ({ ...row, valueK: commercial ? row.valueK : null })),
  }
  return { summary, byReason, insights, rows, closedOther }
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
