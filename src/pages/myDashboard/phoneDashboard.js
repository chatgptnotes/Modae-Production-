import { displayOpportunityId } from '../../seed.js'

const stageKey = value => String(value || '').toLowerCase()
export const isProposal = opp => Boolean(opp.proposalDate) || /proposal|sent|quote/.test(stageKey(opp.stage))

// The shared model applies scope, period and value ranking. Search before
// truncation so a matching opportunity beyond the initial five remains findable.
export function phoneTopOpportunities(model, { query = '' } = {}) {
  const terms = query.trim().toLowerCase()
  return (model.topOpportunityCandidates || model.topOpportunities).filter(opp => {
    return !terms || [opp.sellTo, opp.oppName, opp.id, displayOpportunityId(opp.id)]
      .some(value => String(value || '').toLowerCase().includes(terms))
  }).slice(0, 5)
}
