import { accountChangeError, deletedProfile, isDeletedUser, matchesAccount } from '../src/userManagement.js'
import { readRoster, saveRoster } from './_user-roster.js'

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }) }
async function targetAuth(client, profile) {
  if (profile.authId) {
    const { data, error } = await client.auth.admin.getUserById(profile.authId)
    if (error && error.status !== 404 && error.code !== 'user_not_found') throw error
    return data?.user || null
  }
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const found = data.users.find(user => user.email?.toLowerCase() === profile.email?.toLowerCase())
    if (found) return found
    if (data.users.length < 1000) return null
  }
}
export async function changeAccount(client, auth, body, patch = {}) {
  let roster = await readRoster(client)
  let target = roster.users.find(user => user.id === body.profileId)
  const actor = roster.users.find(user => matchesAccount(user, auth))
  const deleting = body.action === 'delete'
  const problem = accountChangeError(roster.users, actor, target, patch, deleting)
  if (problem) fail(problem, 403)
  if (deleting && isDeletedUser(target)) return { users: roster.users, profile: target }
  if (body.expectedRevision !== (target.accountRevision || 0)) fail('This account changed. Refresh and retry.', 409)
  const remote = await targetAuth(client, target)
  const now = new Date().toISOString()
  // Persist a non-active intent before touching Auth. Retries resume this intent.
  const pending = { ...target, ...(remote ? { authId: remote.id } : {}),
    ...(deleting ? { status: 'Suspended', deletionPendingAt: target.deletionPendingAt || now }
      : { accessPending: target.id !== actor.id, pendingAccountPatch: patch }), accountRevision: (target.accountRevision || 0) + 1 }
  await saveRoster(client, roster, roster.users.map(user => user.id === target.id ? pending : user), actor,
    deleting ? 'User deletion requested' : 'User update requested', target.id)
  try {
    if (remote) {
      if (deleting) {
        const { error: banError } = await client.auth.admin.updateUserById(remote.id, { ban_duration: '876000h' })
        if (banError) throw banError
        const { error } = await client.auth.admin.deleteUser(remote.id)
        if (error) throw error
      } else {
        const { error } = await client.auth.admin.updateUserById(remote.id, {
          email: patch.email || target.email, email_confirm: true,
          ban_duration: (patch.status || target.status) === 'Active' ? 'none' : '876000h',
          user_metadata: { ...(remote.user_metadata || {}), name: patch.name || target.name },
        })
        if (error) throw error
      }
    }
    roster = await readRoster(client)
    target = roster.users.find(user => user.id === target.id)
    if (isDeletedUser(target) && deleting) return { users: roster.users, profile: target }
    if (target.accountRevision !== pending.accountRevision) fail('Account changed while processing. Refresh and retry.', 409)
    const profile = deleting ? deletedProfile(target, actor.id) : {
      ...target, ...patch, accessPending: false, pendingAccountPatch: undefined,
      accountRevision: target.accountRevision + 1,
    }
    const users = await saveRoster(client, roster, roster.users.map(user => user.id === target.id ? profile : user), actor,
      deleting ? 'User deleted; business history retained' : 'User updated', target.id)
    return { users, profile }
  } catch (error) {
    throw Object.assign(new Error(`${deleting ? 'Deletion' : 'Update'} is pending${pending.accessPending || deleting ? '; access is blocked' : ''}. ${error.message || 'The login provider failed.'} Refresh and retry.`), { status: error.status || 502 })
  }
}
export { targetAuth }
