import { displayOpportunityId } from './seed.js'

export function matchOpportunityFolder(name, opportunities) {
  const exact = opportunities.find(row => row.id === name)
  if (exact) return exact
  const numeric = displayOpportunityId(name)
  const matches = opportunities.filter(row => displayOpportunityId(row.id) === numeric)
  return matches.length === 1 ? matches[0] : null
}
