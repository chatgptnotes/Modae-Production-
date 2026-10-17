import { LEVEL3_ROLE_IDS, userRoles } from './seed.js'

const ROLE_PRIORITY = ['NON_SALES', 'MANAGEMENT', 'ADMIN', 'TEAM_LEAD', 'STANDARD_USER']

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
    roles: selectedRole === 'MANAGEMENT' ? [...new Set([...(selectedRole === applicationRoleFor(user) ? userRoles(user) : []), 'MANAGEMENT', 'ADMIN'])] : selectedRole === applicationRoleFor(user) ? userRoles(user) : [selectedRole],
  }
}

export function newUserRole(selectedRole) {
  if (!LEVEL3_ROLE_IDS.includes(selectedRole)) throw new Error('Select a valid application role.')
  return { role: selectedRole === 'NON_SALES' ? 'NON_SALES' : selectedRole === 'ADMIN' ? 'ADMIN' : 'RS', roles: selectedRole === 'MANAGEMENT' ? ['MANAGEMENT', 'ADMIN'] : [selectedRole] }
}
