import { displayOpportunityId } from '../../seed.js'

const stageKey = value => String(value || '').toLowerCase()
export const isQualified = opp => opp.qualified === true
  || /qualified/.test(stageKey(opp.qualificationStatus || opp.qualification))
  || !['lead', 'rfi'].includes(stageKey(opp.stage))
export const isProposal = opp => Boolean(opp.proposalDate) || /proposal|sent|quote/.test(stageKey(opp.stage))

// The shared model applies scope, period and value ranking. Search/filter before
// truncation so a matching opportunity beyond the initial five remains findable.
export function phoneTopOpportunities(model, { query = '', filter = 'all' } = {}) {
  const blockedIds = new Set(model.blocked.map(row => row.opp?.id))
  const terms = query.trim().toLowerCase()
  return (model.topOpportunityCandidates || model.topOpportunities).filter(opp => {
    const matchesFilter = filter === 'all' || (filter === 'qualified' && isQualified(opp))
      || (filter === 'proposal' && isProposal(opp)) || (filter === 'blocked' && blockedIds.has(opp.id))
    return matchesFilter && (!terms || [opp.sellTo, opp.oppName, opp.id, displayOpportunityId(opp.id)]
      .some(value => String(value || '').toLowerCase().includes(terms)))
  }).slice(0, 5)
}
