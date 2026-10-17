import { useStore } from './store.jsx'
import { fieldValues, fieldLabel } from './workbookGovernance.js'
import { isActiveUser } from './userManagement.js'
import { displayRole } from './utils.js'

export const FIELD_BINDINGS = { CATEGORIES: 'category', OWNERS: 'owner', OPP_TYPES: 'oppType', BUS: 'bu', SEGMENTS: 'segment', SOLUTIONS: 'solution', PRODUCTS: 'product', PROB_LEVELS: 'prob', STAGES: 'stage', CLOSE_REASONS: 'closedReason', WON_REASONS: 'closedReason', CUSTOMER_STATUSES: 'customerStatus' }
export function useFieldLists(current = {}) {
  const store = useStore()
  const records = Array.isArray(current) ? current : [current]
  return {
    ...Object.fromEntries(Object.entries(FIELD_BINDINGS).map(([name, key]) => [name, fieldValues(store.config, key, records.flatMap(row => row?.[key] || [])).filter(value => {
      if (key !== 'owner' || records.some(row => row?.owner === value)) return true
      const accounts = (store.users || []).filter(user => user.role === value)
      return accounts.some(isActiveUser)
    })])),
    labelFor: (key, value) => {
      // Owner labels are user-facing account names. Always resolve them from
      // the current role/user directory so stale workbook field labels cannot
      // bring back legacy abbreviations such as "R. Satish" or "P. J. Sales".
      if (key === 'owner') return displayRole(value, store.config)
      return fieldLabel(store.config, key, value)
    },
  }
}
