import { effectiveAccess } from './accessPolicy.js'
// Shared lifecycle rules for local demos and authoritative server operations.
export const isDeletedUser = user => Boolean(user?.deletedAt || user?.status === 'Deleted')
export const isActiveUser = user => user?.status === 'Active' && !isDeletedUser(user) && !user?.deletionPendingAt && !user?.accessPending
export const isAccountAdmin = user => effectiveAccess(user).isAdmin

export const matchesAccount = (profile, auth) => Boolean(profile && auth && (
  (auth.id && (profile.authId === auth.id || profile.id === auth.id)) || (!profile.authId && profile.email && auth.email && profile.email.toLowerCase() === auth.email.toLowerCase())
))
export function accountChangeError(users, actor, target, patch = {}, deleting = false) {
  if (!isActiveUser(actor) || !isAccountAdmin(actor)) return 'Only active administrators can manage accounts.'
  if (!target) return 'Account not found.'
  if (isDeletedUser(target)) return deleting ? '' : 'This account has been deleted.'
  if (target.deletionPendingAt && !deleting) return 'Deletion is pending. Retry Delete to finish removing this login.'
  const next = { ...target, ...patch }
  const losesAccess = deleting || !isActiveUser(next) || (isAccountAdmin(target) && !isAccountAdmin(next))
  if (losesAccess && target.id === actor.id) return 'You cannot delete, suspend or demote your own account.'
  if (losesAccess && target.role === 'SUPER') return 'The System Owner account is protected.'
  if (losesAccess && isAccountAdmin(target) && !users.some(user => user.id !== target.id && isActiveUser(user) && isAccountAdmin(user))) return 'Keep at least one active administrator.'
  return ''
}
export function deletedProfile(user, actorId, now = new Date().toISOString()) {
  // Retain stable attribution and email uniqueness, never credentials.
  return { id: user.id, authId: user.authId || null, name: user.name, email: user.email,
    role: user.role, roles: user.roles, created: user.created, status: 'Deleted',
    deletedAt: now, deletedBy: actorId, accountRevision: (user.accountRevision || 0) + 1 }
}
