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
  // The Customer Master is authoritative for a matched account. Older/AI-
  // created leads can carry a default Blue status (or a stale override) before
  // the exact customer match is resolved, so those values must not mask a
  // known Red account such as Vedanta (Lanjigarh).
  const masterStatus = matchCustomer(customers, lead)?.status
  if (masterStatus) return masterStatus
  return lead?.customerStatus || (lead?.redFlag ? 'Red' : 'Blue')
}
