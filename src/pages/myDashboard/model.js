import { opportunityProbabilityWeight } from '../../opportunityProbability.js'
import { funnelRows, salesPerformance, winLossAnalysis } from '../../kpi.js'
import { readiness, isBlocked, nextActionWith, actionableClarifications, isClarificationResolved, isClarificationCoveredByAnswer } from '../../gates.js'
import { ageDays, ddMMyyyy, isTodayIST, isHiddenDashboardOpportunity, canPriceProposal } from '../../utils.js'
import { fieldBase } from '../../workbookGovernance.js'
import { bookingRegister } from '../../orderBookings.js'
import { currentFiscalQuarter } from '../../ui/workspacePeriods.js'
import { scopedOpportunityRows } from '../../opportunityFilters.js'

export const PAGE_SIZE = 6

export function dashboardTiming(due, fallback = '—', now = new Date()) {
  const date = String(due || '').slice(0, 10)
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return { label: fallback, tone: 'neutral', title: '' }
  const days = ageDays(date, now)
  const today = isTodayIST(date, now)
  return { label: today ? 'Today' : days > 0 ? `${days} day${days === 1 ? '' : 's'} overdue` : ddMMyyyy(date),
    tone: days > 0 ? 'danger' : today ? 'warning' : 'neutral', title: `Due: ${ddMMyyyy(date)}` }
}

export function paginationNumbers(page, pages) {
  if (pages <= 5) return Array.from({ length: pages }, (_, i) => i + 1)
  return [...new Set([1, page - 1, page, page + 1, pages].filter(value => value >= 1 && value <= pages))]
    .sort((a, b) => a - b).flatMap((value, index, values) => index && value - values[index - 1] > 1 ? ['gap-' + value, value] : [value])
}

export function dashboardPeriod(period, fy, now = new Date()) {
  if (period === 'all') return null
  const year = Number(String(fy || '').match(/20\d{2}/)?.[0]) || (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1)
  const start = new Date(year, 3, 1)
  const end = new Date(year + 1, 3, 1)
  if (/^q[1-4]$/.test(period)) {
    start.setMonth(3 + (Number(period[1]) - 1) * 3)
    end.setTime(start.getTime())
    end.setMonth(start.getMonth() + 3)
  }
  const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return { start: iso(start), end: iso(end) }
}

export function dateInPeriod(value, period) {
  if (!period) return true
  const date = expectedOrderDate(value)
  return Boolean(date) && date >= period.start && date < period.end
}

function expectedOrderDate(value) {
  const date = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return ''
  const parsed = new Date(`${date}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : ''
}

export function approvalNeedsRole(approval, role) {
  return approval.status === 'Pending'
    && (approval.needed?.length ? approval.needed : [approval.approver]).includes(role)
    && !approval.decisions?.[role]
}

export const probabilityKey = value => ['high', 'medium', 'low'].includes(String(value || '').toLowerCase())
  ? String(value).toLowerCase()
  : 'low'

export function segmentedFunnel(opportunities, config) {
  const bands = new Map(['high', 'medium', 'low'].map(key => [key,
    funnelRows(opportunities.filter(opp => probabilityKey(opp.prob) === key), { config })]))
  return funnelRows(opportunities, { config }).map((row, index) => {
    const segments = ['high', 'medium', 'low'].map(key => {
      const band = bands.get(key)[index]
      return { key, count: band.count, valueK: band.valueK }
    })
    return {
      ...row,
      segments,
      count: segments.reduce((sum, segment) => sum + segment.count, 0),
      valueK: segments.reduce((sum, segment) => sum + segment.valueK, 0),
    }
  })
}

const periodLabel = (period, fy) => period === 'all' ? 'All history' : period === 'fy' ? fy || 'This FY' : `Q${period.slice(1)} · ${fy || 'This FY'}`

// Page-local read model: no persistence, permission changes, or shared KPI changes.
// Pipeline ownership and personal decision responsibility are intentionally distinct.
export function dashboardModel(store, { scope = 'global', owner = 'all', period = 'all', now = new Date(), topPeriod = currentFiscalQuarter(now) } = {}) {
  const role = store.role
  const range = dashboardPeriod(period, store.sales?.fy, now)
  const visible = scopedOpportunityRows(store.opportunities || [], 'global', role, 'Opportunities')
    .filter(o => !isHiddenDashboardOpportunity(o))
  // Performance and Top 5 have their own periods. Operational work and the
  // funnel/outcomes always use the complete eligible opportunity history.
  const opportunities = visible
  const selectedOwner = scope === 'my' ? role : owner === 'all' ? null : owner
  const pipeline = opportunities.filter(o => !selectedOwner || o.owner === selectedOwner)
  const open = pipeline.filter(o => o.status === 'Open')
  const opportunityCounts = { total: pipeline.length, open: open.length,
    closed: pipeline.filter(o => o.status === 'Closed').length }
  const opportunitySummary = `${opportunityCounts.total} total · ${opportunityCounts.open} open · ${opportunityCounts.closed} closed`
  const lookup = new Map(visible.map(o => [o.id, o]))
  const pending = (store.approvals || []).filter(a => {
    if (a.status !== 'Pending') return false
    const opp = lookup.get(a.oppId)
    if (a.oppId && !opp) return false
    if (scope === 'my') return approvalNeedsRole(a, role) || a.requestedBy === role
    return !selectedOwner || (opp ? opp.owner === selectedOwner : a.requestedBy === selectedOwner)
  })
  const pendingIds = new Set(pending.map(a => a.oppId).filter(Boolean))
  const getProposal = id => store.getProposal?.(id) || store.proposals?.[id]
  const work = opportunities.filter(o => o.status === 'Open').map(opp => {
    const summary = store.overviewSignals?.[opp.id]
    const blockers = summary?.blockers || readiness(opp, getProposal(opp.id), store)
    const action = summary?.action || nextActionWith(opp, getProposal(opp.id), store)
    const clarificationDue = summary ? summary.clarificationDue : actionableClarifications(opp, store)
      .filter(row => !isClarificationResolved(row) && !isClarificationCoveredByAnswer(opp, row, store.clarifications || []))
      .map(row => row.due).filter(Boolean).sort()[0]
    const mine = opp.owner === role || action.owner === role || pendingIds.has(opp.id)
    return { opp, blockers, action, mine, clarificationDue }
  }).filter(row => scope === 'my' ? row.mine : !selectedOwner || row.opp.owner === selectedOwner)
  const blocked = work.filter(row => isBlocked(row.blockers))
  const followups = work.filter(({ opp }) => opp.proposalDate
    && !(store.approvals || []).some(a => a.oppId === opp.id && a.status === 'Pending')
    && (ageDays(opp.proposalDate, now) || 0) >= 14)
  const stale = work.filter(({ opp }) => (ageDays(opp.lastUpdated, now) || 0) > 30)
  const queue = pending.map(a => ({
    id: `approval-${a.id}`, opp: lookup.get(a.oppId), text: a.type || 'Pending approval',
    owner: (a.needed?.length ? a.needed : [a.approver]).filter(r => !a.decisions?.[r]).join(', '),
    timing: approvalNeedsRole(a, role) ? 'Needs your decision' : 'Awaiting decision', due: a.due || '',
    tone: 'warning', path: '/approvals', cta: approvalNeedsRole(a, role) ? 'Review' : 'View', rank: 1,
  }))
  for (const row of work) {
    if (pendingIds.has(row.opp.id)) continue
    const blocker = row.blockers.find(b => b.severity === 'block' || b.severity === 'wait')
    if (blocker) queue.push({ id: `block-${row.opp.id}`, opp: row.opp, text: blocker.text,
      owner: row.action.owner || row.opp.owner, timing: blocker.severity === 'wait' ? 'Waiting' : 'Blocked',
      due: blocker.key === 'clarifications' ? row.clarificationDue : '',
      tone: blocker.severity === 'wait' ? 'warning' : 'danger', path: `/opp/${row.opp.id}`, cta: 'Open', rank: 2 })
    else if (followups.some(item => item.opp.id === row.opp.id)) queue.push({ id: `follow-${row.opp.id}`, opp: row.opp,
      text: 'Customer follow-up due', owner: row.opp.owner, timing: '14+ days since proposal',
      tone: 'warning', path: `/opp/${row.opp.id}/followup`, cta: 'Open', rank: 3 })
    else if (stale.some(item => item.opp.id === row.opp.id)) queue.push({ id: `stale-${row.opp.id}`, opp: row.opp,
      text: 'Update the next step', owner: row.opp.owner, timing: 'No update in 30+ days',
      tone: 'warning', path: `/opp/${row.opp.id}`, cta: 'Open', rank: 4 })
    else if (row.opp.nextActionOwner) queue.push({ id: `action-${row.opp.id}`, opp: row.opp,
      text: row.action.text, owner: row.action.owner, timing: 'Next action assigned',
      tone: 'info', path: `/opp/${row.opp.id}`, cta: 'Open', rank: 5 })
  }
  queue.sort((a, b) => a.rank - b.rank || (a.opp?.lastUpdated || '').localeCompare(b.opp?.lastUpdated || ''))
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const fiscalRange = dashboardPeriod('fy', store.sales?.fy, now)
  const fiscalMonth = (Number(today.slice(0, 4)) - Number(fiscalRange.start.slice(0, 4))) * 12
    + Number(today.slice(5, 7)) - 4
  const elapsedQuarter = Math.max(0, Math.min(4, Math.floor(fiscalMonth / 3) + 1))
  const currentQuarter = Math.max(1, elapsedQuarter)
  const bookingRange = range || fiscalRange
  const booking = bookingRegister(store, { now })
  const orders = booking.orders.filter(o => dateInPeriod(o.booked, bookingRange)
    && String(o.booked || '').slice(0, 10) <= today)
  const confirmedByOpportunity = new Map(booking.orders
    .map(order => [order.oppId || order.id, order]))
  const wonRows = pipeline.filter(o => o.status === 'Closed' && fieldBase(store.config, 'stage', o.stage) === 'Won')
    .map(opp => {
      const booking = confirmedByOpportunity.get(opp.id)
      return { opp, valueK: booking ? booking.valueK : Number(opp.valueK) || 0,
        date: booking?.booked || opp.orderDate, estimated: !booking }
    })
    .filter(row => period === 'all' || (dateInPeriod(row.date, range) && row.date <= today))
  const wonPerformance = { valueK: wonRows.reduce((sum, row) => sum + row.valueK, 0),
    wonCount: wonRows.length, estimatedCount: wonRows.filter(row => row.estimated).length }
  const performanceStore = { ...store, sales: { ...store.sales, currentQ: currentQuarter } }
  const perf = salesPerformance(performanceStore, selectedOwner, { orders, now })
  if (period === 'fy') {
    perf.annual = elapsedQuarter ? perf.quarterTarget.reduce((sum, value) => sum + value, 0) : 0
    perf.gap = Math.max(0, perf.annual - perf.achieved)
    perf.attainPct = perf.annual ? perf.achieved / perf.annual * 100 : 0
  } else if (/^q[1-4]$/.test(period)) {
    const quarter = Number(period[1]) - 1
    perf.quarterTarget = perf.quarterTarget.map((value, i) => i === quarter ? value : 0)
    perf.annual = perf.quarterTarget.reduce((sum, value) => sum + value, 0)
    perf.gap = Math.max(0, perf.annual - perf.achieved)
    perf.attainPct = perf.annual ? perf.achieved / perf.annual * 100 : 0
  }
  const owners = [...new Set([...pipeline.map(o => o.owner), ...Object.keys(store.sales?.targets || {})])].filter(Boolean).sort()
  const team = owners.filter(key => !selectedOwner || key === selectedOwner).map(key => ({ owner: key,
    ...salesPerformance(performanceStore, key, { orders, now }), open: open.filter(o => o.owner === key).length }))
  if (period === 'fy') for (const row of team) {
    row.annual = elapsedQuarter ? row.quarterTarget.reduce((sum, value) => sum + value, 0) : 0
    row.gap = Math.max(0, row.annual - row.achieved)
    row.attainPct = row.annual ? row.achieved / row.annual * 100 : 0
  }
  if (/^q[1-4]$/.test(period)) for (const row of team) {
    row.annual = row.quarterTarget[Number(period[1]) - 1] || 0
    row.gap = Math.max(0, row.annual - row.achieved)
    row.attainPct = row.annual ? row.achieved / row.annual * 100 : 0
  }
  const funnel = segmentedFunnel(pipeline, store.config)
  const topRange = dashboardPeriod(topPeriod, store.sales?.fy, now)
  const topOpportunityCandidates = visible.filter(o => o.status === 'Open'
    && (!selectedOwner || o.owner === selectedOwner)
    && dateInPeriod(o.orderDate, topRange)).sort((a, b) => (expectedOrderDate(a.orderDate) || '9999-12-31').localeCompare(expectedOrderDate(b.orderDate) || '9999-12-31')
    || (+b.valueK || 0) - (+a.valueK || 0)
    || String(a.id).localeCompare(String(b.id)))
  const topOpportunities = topOpportunityCandidates.slice(0, 5)
  const topPeriodLabel = topPeriod === 'all' ? 'All dates' : periodLabel(topPeriod, store.sales?.fy)
  const topOpportunitiesEmptyMessage = !open.length
    ? 'No open opportunities in this view.'
    : `No open opportunities with an expected order date in ${topPeriodLabel}. ${open.length} open ${open.length === 1 ? 'opportunity is outside this period or has' : 'opportunities are outside this period or have'} no expected order date. Choose All dates to see them.`
  const headlineOpenCount = open.length
  const headlinePipelineK = open.reduce((sum, o) => sum + (+o.valueK || 0), 0)
  const outcomes = winLossAnalysis(pipeline.filter(o => o.status === 'Closed')
    .map(o => ({ ...o, stage: fieldBase(store.config, 'stage', o.stage) })), store.competitors, { commercial: canPriceProposal(role) })
  return { pipeline, open, pending, visible, performanceRows: wonRows, decisions: pending.filter(a => approvalNeedsRole(a, role)), work, blocked, followups, stale, queue,
    funnel, topOpportunities, topOpportunityCandidates, topOpportunitiesEmptyMessage,
    opportunityCounts, opportunitySummary, headlineOpenCount, headlinePipelineK, perf, wonPerformance, team,
    workbookOnly: String(store.importedWorkbook || '').startsWith('betser-sales-pipeline-usage-'),
    pipelineK: open.reduce((sum, o) => sum + (+o.valueK || 0), 0),
    weightedK: open.reduce((sum, o) => sum + (+o.valueK || 0) * opportunityProbabilityWeight(store.config, o), 0),
    outcomes,
    otherClosedRows: pipeline.filter(o => o.status === 'Closed')
      .map(o => ({ ...o, stage: fieldBase(store.config, 'stage', o.stage) }))
      .filter(o => o.stage !== 'Won' && o.stage !== 'Lost'),
    periodLabel: topPeriodLabel,
    currentQuarter,
    reportStore: { ...store, opportunities: scope === 'my' ? opportunities.filter(o => o.owner === role || work.some(row => row.opp.id === o.id)) : pipeline,
      approvals: (store.approvals || []).filter(a => pending.includes(a) || pipeline.some(o => o.id === a.oppId) || work.some(row => row.opp.id === a.oppId)),
      sales: { ...store.sales, orders } },
  }
}

export function registerRows(model, { query = '', stage = 'all', workFilter = 'all', tab = 'opportunities' } = {}) {
  const source = workFilter === 'blocked' ? model.blocked.map(row => row.opp) : tab === 'followups' ? model.followups.map(row => row.opp) : model.pipeline
  const blockedIds = new Set(model.blocked.map(row => row.opp.id))
  const terms = query.toLowerCase().trim()
  return source.filter(o => (stage === 'all' || stage.split(',').includes(o.stage))
    && (workFilter !== 'open' || o.status === 'Open')
    && (workFilter !== 'blocked' || blockedIds.has(o.id))
    && (!terms || [o.id, o.oppName, o.sellTo, o.owner].some(value => String(value || '').toLowerCase().includes(terms))))
    .slice().sort((a, b) => (b.lastUpdated || '').localeCompare(a.lastUpdated || '') || String(a.id).localeCompare(String(b.id)))
}
