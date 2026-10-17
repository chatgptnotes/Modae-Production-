import { seedUsers } from './seed.js'
import { deletedProfile, isDeletedUser } from './userManagement.js'

// A one-time local directory replacement. Connected rosters must use the
// server-owned lifecycle; never pass a shared profile list through this helper.
export function replaceLocalUserRoster(users, actorId = 'LOCAL-DIRECTORY', now = new Date().toISOString()) {
  const claimed = new Set()
  const usedIds = new Set(users.map(user => user.id))
  let sequence = Math.max(0, ...users.map(user => Number(String(user.id).replace(/\D/g, '')) || 0))
  const nextId = () => {
    let id
    do { id = `U-${String(++sequence).padStart(3, '0')}` } while (usedIds.has(id))
    usedIds.add(id)
    return id
  }
  const directory = seedUsers.map(expected => {
    const matches = users.filter(user => !claimed.has(user) && String(user.email || '').trim().toLowerCase() === expected.email.toLowerCase())
    const existing = matches.find(user => !isDeletedUser(user)) || matches[0]
      || users.find(user => !claimed.has(user) && user.id === expected.id && user.role === expected.role
        && !user.authId && /@modae\.demo$/i.test(user.email || ''))
    if (existing) {
      claimed.add(existing)
      // Keep passwords, lifecycle status and attribution IDs. Only directory
      // details and the explicitly supplied role assignments are replaced.
      return { ...existing, name: expected.name, email: expected.email, role: expected.role, roles: [...expected.roles] }
    }
    const id = usedIds.has(expected.id) ? nextId() : expected.id
    usedIds.add(id)
    return { ...expected, id, roles: [...expected.roles] }
  })
  const retired = users.filter(user => !claimed.has(user)).map(user => isDeletedUser(user) ? user : deletedProfile(user, actorId, now))
  return [...directory, ...retired]
}
