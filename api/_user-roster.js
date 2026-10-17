import { randomUUID } from 'node:crypto'
import { isActiveUser, isAccountAdmin, accountProfileFor } from '../src/userManagement.js'

export async function readRoster(client) {
  const { data, error } = await client.from('records').select('data,rev').eq('entity', 'state').eq('id', 'users').is('deleted_at', null).maybeSingle()
  if (error) throw error
  return { users: Array.isArray(data?.data) ? data.data.map(({ pw, ...profile }) => profile) : [], rev: Number(data?.rev) || 0 }
}
export async function activeProfile(client, auth) {
  const { users } = await readRoster(client)
  const profile = accountProfileFor(users, auth)
  return isActiveUser(profile) ? profile : null
}
export async function saveRoster(client, roster, users, actor, action, targetId) {
  const now = new Date().toISOString()
  const { error } = await client.rpc('save_user_roster', { p_users: users, p_rev: roster.rev,
    p_audit: { id: `USER-${randomUUID()}`, ts: now, action, entity: targetId, actor: actor.id, by: actor.role, detail: action } })
  if (error) {
    const conflict = error.code === '40001'
    throw Object.assign(new Error(conflict ? 'Accounts changed in another session. Refresh and retry.' : 'Could not save the account change. Check the user-management migration and retry.'), { status: conflict ? 409 : 503 })
  }
  return users
}
export async function requireRosterAdmin(client, auth) {
  const profile = await activeProfile(client, auth)
  return profile && isAccountAdmin(profile) ? profile : null
}
