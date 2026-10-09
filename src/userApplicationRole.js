import { LEVEL3_ROLE_IDS, userRoles } from './seed.js'

const ROLE_PRIORITY = ['ADMIN', 'MANAGEMENT', 'TEAM_LEAD', 'STANDARD_USER']

// Operational owner IDs stay intact because historical workflow gates use them.
export function applicationRoleFor(user) {
  const assigned = userRoles(user)
  const applicationRole = ROLE_PRIORITY.find(role => assigned.includes(role))
  if (applicationRole) return applicationRole
  if (['SUPER', 'ADMIN', 'LJS'].includes(user?.role)) return 'ADMIN'
  if (user?.role === 'AH') return 'MANAGEMENT'
  return 'STANDARD_USER'
}

export function applicationRolePatch(user, selectedRole) {
  if (!LEVEL3_ROLE_IDS.includes(selectedRole)) throw new Error('Select a valid application role.')
  if (user.role === 'SUPER' && selectedRole !== 'ADMIN') throw new Error('The System Owner role cannot be changed.')
  return {
    role: user.role,
    roles: selectedRole === applicationRoleFor(user) ? userRoles(user) : [selectedRole],
  }
}

export function newUserRole(selectedRole) {
  if (!LEVEL3_ROLE_IDS.includes(selectedRole)) throw new Error('Select a valid application role.')
  return { role: selectedRole === 'ADMIN' ? 'ADMIN' : 'RS', roles: [selectedRole] }
}
