import { probabilityKey } from './model.js'
import { ddMMyyyy } from '../../utils.js'

export const drilldownMoney = value => `₹${((Number(value) || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`

// Selections describe a live view, never a snapshot of IDs captured on click.
export function dashboardDrilldown(model, selection, { showMoney = false, period = 'fy' } = {}) {
  const { kind } = selection
  const result = { title: '', description: '', rows: [], totalValueK: null, type: 'opportunities' }
  const row = (opp, detail = '', valueK = opp?.valueK) => ({ key: opp.id, opp, detail, owner: opp.owner, valueK: showMoney ? Number(valueK) || 0 : null })
  if (kind === 'pipeline') {
    const status = selection.status || 'Open'
    result.title = status === 'all' ? 'All pipeline opportunities' : `${status} pipeline opportunities`
    result.rows = model.pipeline.filter(opp => status === 'all' || opp.status === status).map(opp => row(opp))
  } else if (kind === 'pending') {
    result.title = 'Pending approvals'
    result.type = 'approvals'
    const lookup = new Map(model.visible.map(opp => [opp.id, opp]))
    result.rows = model.pending.map(approval => ({ key: approval.id, opp: lookup.get(approval.oppId) || null,
      owner: approval.requestedBy, valueK: null, detail: approval.type || 'Approval request', approval }))
    result.description = 'One row per pending request. An opportunity may have more than one request.'
  } else if (kind === 'followups' || kind === 'blocked') {
    result.title = kind === 'followups' ? 'Follow-ups due' : 'Blocked work'
    result.rows = model[kind].map(item => row(item.opp, kind === 'followups'
      ? `Proposal sent ${ddMMyyyy(item.opp.proposalDate)} · 14+ days without a pending approval`
      : item.blockers.filter(blocker => ['block', 'wait'].includes(blocker.severity)).map(blocker => blocker.text).join(' · ')))
  } else if (kind === 'actual') {
    result.title = 'Actual performance · Won opportunities'
    result.description = 'Contributions for the selected performance period. Confirmed PO values take precedence over opportunity estimates.'
    result.rows = model.performanceRows.map(item => row(item.opp,
      `${item.estimated ? 'Estimated' : 'Confirmed PO'} · ${item.date ? ddMMyyyy(item.date) : 'Date not set'}`, item.valueK))
  } else if (kind === 'target' || kind === 'gap') {
    result.type = 'calculation'
    result.title = kind === 'target' ? 'Target breakdown' : 'Remaining to target'
    if (!showMoney) {
      result.description = 'Sales values and targets are restricted for your role.'
      return result
    }
    const { perf, wonPerformance: won } = model
    const unavailable = period === 'all' ? 'Targets are shown in YTD or QTD.'
      : perf.targetNeedsConfirmation ? 'Targets require confirmation before a performance gap can be shown.'
      : !perf.targetConfigured ? 'No target configured for this financial year.'
      : won.estimatedCount ? `${won.estimatedCount} Won values require verification before a performance gap can be shown.`
      : perf.annual <= 0 ? 'A positive confirmed target is required to show a performance gap.' : ''
    result.description = kind === 'gap' ? unavailable || `Target ${drilldownMoney(perf.annual)} − Actual ${drilldownMoney(won.valueK)} = ${drilldownMoney(Math.max(0, perf.annual - won.valueK))} remaining (minimum zero).`
      : period === 'all' ? unavailable : 'Owner and quarter contributions to the selected target. Targets requiring confirmation are marked below.'
    if (period !== 'all') {
      result.rows = model.team.map(item => ({ key: item.owner, owner: item.owner,
        quarters: item.quarterTarget.map((value, index) => /^q[1-4]$/.test(period) ? (index === Number(period[1]) - 1 ? value : 0) : item.annual === 0 ? 0 : value),
        valueK: item.annual, detail: item.targetNeedsConfirmation ? 'Needs confirmation' : item.targetConfigured ? 'Confirmed' : 'Not configured' }))
      result.totalValueK = perf.annual
    }
    return result
  } else if (kind === 'funnel') {
    const stage = model.funnel.find(item => item.key === selection.stageKey)
    result.title = `${stage?.label || 'Stage'}${selection.probability ? ` · ${selection.probability} probability` : ''}`
    result.rows = !stage ? [] : model.pipeline.filter(opp => stage.stages.includes(opp.stage)
      && opp.status === (stage.key === 'won' ? 'Closed' : 'Open')
      && (!selection.probability || probabilityKey(opp.prob) === selection.probability)).map(opp => row(opp))
  } else if (kind === 'outcomes') {
    const outcome = selection.outcome || 'all'
    result.title = `${outcome === 'all' ? 'Won / Lost' : outcome === 'won' ? 'Won' : 'Lost'}${selection.reason ? ` · ${selection.reason}` : ''}`
    result.rows = model.outcomes.rows.filter(opp => (outcome === 'all' || opp.result.toLowerCase() === outcome)
      && (!selection.reason || opp.reason === selection.reason)).map(opp => row(opp, opp.reason))
    if (outcome === 'all' && !selection.reason) {
      const { summary } = model.outcomes
      result.description = summary.total ? `Win rate: ${summary.won} won ÷ ${summary.total} Won/Lost decisions = ${summary.winRate}%. Other closed outcomes are excluded.` : 'No Won/Lost decisions yet.'
    }
  } else if (kind === 'otherClosed') {
    const decided = new Set(model.outcomes.rows.map(opp => opp.id))
    result.title = selection.stage || 'Other closed outcomes'
    result.rows = model.otherClosedRows.filter(opp => !decided.has(opp.id)
      && (!selection.stage || (String(opp.stage || '').trim() || 'Unspecified') === selection.stage)).map(opp => row(opp))
  }
  if (showMoney && result.type === 'opportunities') result.totalValueK = result.rows.reduce((sum, item) => sum + item.valueK, 0)
  return result
}
