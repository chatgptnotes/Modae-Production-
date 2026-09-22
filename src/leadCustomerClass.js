import { leadFieldValue as mappedLeadFieldValue } from './leadFieldMapping.js'

// Best-effort customer match against the master. Prefer normalized lead-level
// identity because it is the stable value used by the decision form, then fall
// back to extracted fields and legacy parse data.
export function matchCustomer(customers, lead) {
  const sellTo = lead?.sellTo || mappedLeadFieldValue(lead?.ai?.fields || [], 'sellTo') || lead?.parse?.sellTo || ''
  const s = String(sellTo).trim().toLowerCase()
  return (customers || []).find(c => {
    const n = String(c?.name || '').trim().toLowerCase()
    return s && n && (s.includes(n) || n.includes(s))
  }) || null
}

export const customerStatusForLead = (lead, customers) => {
  // An explicit decision is the only lead-level value that may override the
  // Customer Master. Older/AI-created leads can carry a default Blue status
  // before the exact customer match is resolved, so that value must not mask a
  // known Red account such as Vedanta (Lanjigarh).
  if (lead?.customerStatusOverride) return lead.customerStatusOverride
  return matchCustomer(customers, lead)?.status || lead?.customerStatus || (lead?.redFlag ? 'Red' : 'Blue')
}
