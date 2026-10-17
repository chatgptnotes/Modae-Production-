import { probabilityWeight } from './workbookGovernance.js'

export function parseProbabilityPct(value) {
  if (value == null || typeof value === 'string' && !value.trim()) return null
  if (typeof value !== 'number' && typeof value !== 'string') throw new Error('Enter a probability between 0 and 100, or leave it blank.')
  const percentage = Number(value)
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) throw new Error('Enter a probability between 0 and 100, or leave it blank.')
  return percentage
}

// Stored invalid legacy values stay untouched and use the configured band.
export function opportunityProbabilityWeight(config, opportunity = {}) {
  const percentage = opportunity.probabilityPct
  if (typeof percentage === 'number' && Number.isFinite(percentage) && percentage >= 0 && percentage <= 100) return percentage / 100
  return probabilityWeight(config, opportunity.prob)
}
