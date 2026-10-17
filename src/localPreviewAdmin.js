import { isActiveUser, isAccountAdmin } from './userManagement.js'
import { applicationRoleFor } from './userApplicationRole.js'

// Local demo bootstrap only. This account is never provisioned or saved to a
// connected roster. Its setup receipt stores identity, never the credential.
export function installLocalPreviewAdmin(state) {
  if (state.auth?.source === 'supabase') return state
  const receipt = state.oneTimeCleanups?.localPreviewAdmin
  if (receipt?.version >= 2) return state
  // The original installer could designate a retired account without activating
  // it. Repair that legacy setup once, never undo later deliberate account edits.
  if (receipt) {
    const target = state.users.find(user => user.id === receipt.accountId)
    const repair = target && String(target.email || '').trim().toLowerCase() === 'admin@modae.com' && !isActiveUser(target)
    return { ...state,
      users: repair ? state.users.map(user => user === target ? recoveredAdmin(user) : user) : state.users,
      oneTimeCleanups: { ...state.oneTimeCleanups, localPreviewAdmin: { ...receipt, version: 2 } },
    }
  }
  const matching = state.users.filter(user => String(user.email || '').toLowerCase() === 'admin@modae.com')
  const existing = matching.find(isActiveUser) || matching[0]
  let id = existing?.id || 'LOCAL-PREVIEW-ADMIN'
  if (!existing) {
    let suffix = 0
    while (state.users.some(user => user.id === id)) id = `LOCAL-PREVIEW-ADMIN-${++suffix}`
  }
  const account = existing ? (isActiveUser(existing) ? { ...existing, role: 'ADMIN', roles: ['ADMIN'] } : recoveredAdmin(existing)) : {
    id, name: 'WinTrack Admin', email: 'admin@modae.com', role: 'ADMIN', roles: ['ADMIN'],
    status: 'Active', created: '2026-10-17', pw: 'admink1',
  }
  return { ...state, users: existing ? state.users.map(user => user.id === id ? account : user) : [...state.users, account],
    oneTimeCleanups: { ...state.oneTimeCleanups, localPreviewAdmin: { accountId: id, version: 2 } } }
}

function recoveredAdmin(user) {
  const { deletedAt, deletedBy, deletionPendingAt, accessPending, ...profile } = user
  return { ...profile, status: 'Active', role: 'ADMIN', roles: ['ADMIN'], pw: 'admink1' }
}

export function canPreviewAsUser(state, shared = false) {
  if (shared || state.auth?.source === 'supabase') return false
  const id = state.oneTimeCleanups?.localPreviewAdmin?.accountId
  if (!id || !state.auth?.user?.id) return false
  const account = state.users?.find(user => user.id === id)
  return Boolean(isActiveUser(account) && isAccountAdmin(account) && applicationRoleFor(account) === 'ADMIN'
    && (state.auth.user.id === account.id || account.authId && state.auth.user.id === account.authId))
}
