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
  if (['valueK', 'cogsK'].includes(field) && value !== '' && value != null && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
    throw new Error('Value and COGS must be valid, non-negative numbers.')
  }
  if (field === 'contactEmail' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('Enter a valid contact email address.')
  return value
}
