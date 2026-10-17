import { parseProbabilityPct } from './opportunityProbability.js'

// Compare editable drafts without sending unrelated or remotely changed fields.
export const sameEditValue = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '')
export function changedOpportunityFields(base, draft, latest) {
  const patch = {}
  for (const key of Object.keys(draft)) {
    if (sameEditValue(base[key], draft[key])) continue
    if (!sameEditValue(base[key], latest[key]) && !sameEditValue(draft[key], latest[key])) {
      throw new Error(`${key} was changed elsewhere. Cancel to reload the latest details before editing again.`)
    }
    patch[key] = draft[key]
  }
  return patch
}
export function validateOpportunityEdit(field, value) {
  if (field === 'probabilityPct') return parseProbabilityPct(value)
  if (['valueK', 'cogsK'].includes(field) && value !== '' && value != null && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
    throw new Error('Value and COGS must be valid, non-negative numbers.')
  }
  if (field === 'contactEmail' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('Enter a valid contact email address.')
  return value
}

// An invalid historical percentage may be retained while independent fields
// change. Browser badInput still needs attention even when its value is ''.
export function shouldValidateOpportunityInput(field, base, draft, validity = {}) {
  return field !== 'probabilityPct' || validity.badInput || !sameEditValue(base[field], draft[field])
}
