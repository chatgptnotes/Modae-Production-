export const CLAUSE_SCOPES = ['domestic', 'international']

export const DEFAULT_CLAUSES = [
  { id: 'validity', label: 'Proposal Validity', category: 'commercial', routes: ['Project', 'Spares', 'Services'], scopes: CLAUSE_SCOPES, required: true, text: 'This proposal remains valid for the validity period stated from the date of issue.' },
  { id: 'payment', label: 'Payment Terms', category: 'commercial', routes: ['Project', 'Spares', 'Services'], scopes: CLAUSE_SCOPES, required: true, text: 'Payment shall be made in accordance with the agreed commercial terms.' },
  { id: 'delivery', label: 'Delivery and Incoterms', category: 'commercial', routes: ['Project', 'Spares', 'Services'], scopes: CLAUSE_SCOPES, required: true, text: 'Delivery shall follow the schedule and Incoterms stated in this proposal.' },
  { id: 'warranty', label: 'Warranty', category: 'legal', routes: ['Project', 'Spares', 'Services'], scopes: CLAUSE_SCOPES, required: true, text: 'The supplied goods or services carry the warranty stated in the proposal.' },
  { id: 'project-pbg', label: 'Performance Bank Guarantee', category: 'project', routes: ['Project'], scopes: ['domestic', 'international'], required: false, text: 'Performance security shall be provided where required by the project contract.' },
  { id: 'spares-origin', label: 'Country of Origin', category: 'spares', routes: ['Spares'], scopes: CLAUSE_SCOPES, required: false, text: 'Country of origin documentation will be supplied with the spares where applicable.' },
  { id: 'service-safety', label: 'Health & Safety', category: 'services', routes: ['Services'], scopes: CLAUSE_SCOPES, required: true, text: 'All service personnel shall comply with the customer site health and safety requirements.' },
  { id: 'standard-terms', label: 'Other Terms & Conditions', category: 'legal', routes: ['Project', 'Spares', 'Services'], scopes: CLAUSE_SCOPES, required: true, text: 'All other terms are as per ModAE India standard terms and conditions of sale.' },
]

export const clausesFor = (library, route, scope = 'domestic') => (library || DEFAULT_CLAUSES)
  .filter(clause => (!clause.routes || clause.routes.includes(route)) && (!clause.scopes || clause.scopes.includes(scope)))

export const clauseWarnings = (proposal, library, route, scope = 'domestic') => {
  const available = clausesFor(library, route, scope)
  const selected = proposal?.clauseIds || []
  const missing = available.filter(clause => clause.required && !selected.includes(clause.id))
  const changed = (proposal?.clauses || []).filter(saved => {
    const current = (library || DEFAULT_CLAUSES).find(clause => clause.id === saved.id)
    return current && current.text !== saved.text
  })
  return { missing, changed }
}
