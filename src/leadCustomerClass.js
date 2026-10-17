import { normalizeCustomerClass } from './customerClasses.js'
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

// Lead Decisions owns classification. Customer matching and extraction never
// make a classification decision on behalf of the salesperson.
export const customerStatusForLead = lead => normalizeCustomerClass(lead?.customerStatus)
