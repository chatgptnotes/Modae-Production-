import test from 'node:test'
import assert from 'node:assert/strict'

import { LEVEL3_ROLE_IDS, LEVEL3_ROLES, userRoles } from '../src/seed.js'
import { canSeePage, isAdminRole, isApprover } from '../src/utils.js'

test('Level 3 defines the four standard application roles', () => {
  assert.deepEqual(LEVEL3_ROLE_IDS, ['STANDARD_USER', 'TEAM_LEAD', 'MANAGEMENT', 'ADMIN'])
  assert.equal(LEVEL3_ROLES.STANDARD_USER.name, 'Standard User')
  assert.equal(LEVEL3_ROLES.TEAM_LEAD.name, 'Team Lead')
  assert.equal(LEVEL3_ROLES.MANAGEMENT.name, 'Management')
  assert.equal(LEVEL3_ROLES.ADMIN.name, 'Admin')
})

test('legacy profiles receive a compatible multi-role assignment', () => {
  assert.deepEqual(userRoles({ role: 'RS' }), ['RS'])
  assert.deepEqual(userRoles({ role: 'RS', roles: ['STANDARD_USER', 'TEAM_LEAD'] }), ['STANDARD_USER', 'TEAM_LEAD'])
})

test('multiple roles combine page access and approval authority', () => {
  assert.equal(canSeePage(['STANDARD_USER', 'MANAGEMENT'], 'analytics'), true)
  assert.equal(canSeePage(['STANDARD_USER'], 'users'), false)
  assert.equal(isApprover(['STANDARD_USER', 'TEAM_LEAD']), true)
  assert.equal(isAdminRole(['STANDARD_USER', 'ADMIN']), true)
})
