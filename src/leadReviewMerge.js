// Blank intake inputs are not overrides of document facts.
const intakeKeys = ['sellTo','contactPerson','contactPhone','contactEmail','sellToCustomerLocation','location','subject','source','rfqNumber','rfqDate']
export function mergeLeadIntake(extracted, manual) {
  const merged = { ...extracted, ...manual }
  for (const key of intakeKeys) {
    if (!String(manual[key] || '').trim() || (key === 'subject' && manual[key] === '(no subject)')) merged[key] = extracted[key] || manual[key] || ''
  }
  return merged
}

export const reviewFieldLabels = {
  sellTo: /^(?:sell[- ]?to(?: customer)?|buyer|customer name)$/i,
  contactPerson: /^(?:contact person|signatory)$/i,
  contactEmail: /^contact email$/i, contactPhone: /^contact phone$/i,
  sellToCustomerLocation: /^(?:sell[- ]?to customer location|customer (?:location|address))$/i,
  scope: /^(?:opportunity )?scope$/i, eucName: /^(?:euc|end user)(?: name)?$/i,
  eucLocation: /^(?:euc|end user) location$/i, source: /^Lead source$/i,
  rfqNumber: /^RFQ number$/i, rfqDate: /^RFQ date$/i, oppType: /^(?:opp|opportunity) type$/i,
}

export const hasHumanLeadEdit = (key, draft, baseline, previousSuggestions = {}) =>
  draft[key] !== baseline[key] && (!Object.hasOwn(previousSuggestions, key) || draft[key] !== previousSuggestions[key])

export function mergeLeadReviewSuggestions(draft, baseline, suggestions, fields = [], touched = new Set(), previousSuggestions = {}) {
  const next = { ...draft }
  for (const [key, value] of Object.entries(suggestions)) {
    if (!String(value ?? '').trim() || touched.has(key) || hasHumanLeadEdit(key, draft, baseline, previousSuggestions)) continue
    const decided = fields.some(field => reviewFieldLabels[key]?.test(field.k) && ['accepted','rejected'].includes(field.state))
    if (!decided) next[key] = value
  }
  return next
}
