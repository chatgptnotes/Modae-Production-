import test from 'node:test'
import assert from 'node:assert/strict'
import { applicationRoleFor, applicationRolePatch, newUserRole } from '../src/userApplicationRole.js'
import { canSeePage, isApprover, isAdminRole } from '../src/utils.js'
import { ROLES, seedUsers, userRoles } from '../src/seed.js'

test('existing role assignments resolve before operational owner codes', () => {
  assert.equal(applicationRoleFor({ role: 'RS', roles: ['TEAM_LEAD'] }), 'TEAM_LEAD')
  assert.equal(applicationRoleFor({ role: 'LJS', roles: ['STANDARD_USER'] }), 'STANDARD_USER')
  assert.equal(applicationRoleFor({ role: 'AH', roles: ['MANAGEMENT', 'ADMIN'] }), 'MANAGEMENT')
  assert.equal(applicationRoleFor({ role: 'PP' }), 'STANDARD_USER')
  assert.equal(applicationRoleFor({ role: 'LJS' }), 'ADMIN')
  assert.equal(applicationRoleFor({ role: 'SUPER' }), 'ADMIN')
})

test('changing an application role preserves operational ownership and replaces permissions', () => {
  const user = { role: 'RS', roles: ['STANDARD_USER'] }
  const patch = applicationRolePatch(user, 'MANAGEMENT')
  assert.deepEqual(patch, { role: 'RS', roles: ['MANAGEMENT', 'ADMIN'] })
  assert.equal(isApprover(patch.roles), true)
  assert.equal(isAdminRole(patch.roles), true)
  assert.equal(canSeePage(patch.roles, 'users'), true)
  assert.deepEqual(applicationRolePatch({ role: 'LJS', roles: ['ADMIN'] }, 'STANDARD_USER'), { role: 'LJS', roles: ['STANDARD_USER'] })
  assert.equal(isAdminRole(applicationRolePatch(user, 'ADMIN').roles), true)
})

test('unchanged role selection preserves legacy, multiple, and protected assignments', () => {
  assert.deepEqual(applicationRolePatch({ role: 'RS', roles: ['RS'] }, 'STANDARD_USER'), { role: 'RS', roles: ['RS'] })
  assert.deepEqual(applicationRolePatch({ role: 'RS', roles: ['TEAM_LEAD', 'MANAGEMENT'] }, 'MANAGEMENT'), { role: 'RS', roles: ['TEAM_LEAD', 'MANAGEMENT', 'ADMIN'] })
  assert.deepEqual(applicationRolePatch({ role: 'SUPER', roles: ['SUPER'] }, 'ADMIN'), { role: 'SUPER', roles: ['SUPER'] })
  assert.throws(() => applicationRolePatch({ role: 'SUPER', roles: ['SUPER'] }, 'STANDARD_USER'))
  assert.throws(() => applicationRolePatch({ role: 'RS' }, 'LJS'))
})

test('new accounts select a canonical role with a compatible operational owner', () => {
  assert.deepEqual(newUserRole('ADMIN'), { role: 'ADMIN', roles: ['ADMIN'] })
  assert.throws(() => newUserRole('TEAM_LEAD'))
  assert.throws(() => applicationRolePatch({ role: 'RS', roles: ['STANDARD_USER'] }, 'TEAM_LEAD'))
  assert.deepEqual(newUserRole('MANAGEMENT'), { role: 'RS', roles: ['MANAGEMENT', 'ADMIN'] })
  assert.throws(() => newUserRole('INVALID'))
})

test('Mod-AE directory uses the supplied names and account categories', () => {
  const byEmail = Object.fromEntries(seedUsers.map(user => [user.email.toLowerCase(), user]))
  assert.equal(ROLES.LJS.name, 'LJ Swaminathan')
  assert.equal(ROLES.RS.name, 'Ruthvik Satish')
  assert.equal(ROLES.PP.name, 'Pragna Praveen')
  assert.equal(ROLES.SS.name, 'Sheetal.R')
  assert.equal(seedUsers.length, 12)
  assert.equal(new Set(seedUsers.map(user => user.email.toLowerCase())).size, 12)
  assert.ok(seedUsers.every(user => user.email.toLowerCase().endsWith('@mod-ae.com')))
  assert.deepEqual(userRoles(byEmail['lj.swaminathan@mod-ae.com']), ['LJS', 'STANDARD_USER', 'MANAGEMENT', 'ADMIN'])
  assert.deepEqual(userRoles(byEmail['aishwarya.paul@mod-ae.com']), ['NON_SALES'])
  assert.deepEqual(userRoles(byEmail['lokesh.bhardwaj@mod-ae.com']), ['MANAGEMENT', 'ADMIN'])
})
