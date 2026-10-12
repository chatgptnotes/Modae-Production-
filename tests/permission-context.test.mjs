import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { defaultAccessPolicy } from '../src/accessPolicy.js'
import { setPermissionContext, canSeePage, canPriceProposal, canManagePriceLists, canViewCommercial, isAdminRole, isApprover } from '../src/utils.js'

afterEach(() => setPermissionContext(null))

test('active operational identity cannot regain administrator rights over explicit application roles', () => {
  setPermissionContext({ role: 'LJS', roles: ['STANDARD_USER'] }, {})
  assert.equal(isAdminRole('LJS'), false)
  assert.equal(canSeePage('LJS', 'admin'), false)
  assert.equal(canManagePriceLists('LJS'), false)
})

test('persisted page and action removals take effect in legacy UI helpers', () => {
  const accessPolicy = defaultAccessPolicy()
  accessPolicy.roles.STANDARD_USER.pages = ['tracker']
  accessPolicy.roles.STANDARD_USER.actions = []
  setPermissionContext({ role: 'RS', roles: ['STANDARD_USER'] }, { accessPolicy })
  assert.equal(canSeePage('RS', 'tracker'), true)
  assert.equal(canSeePage('RS', 'new'), false)
  assert.equal(canPriceProposal('RS'), false)
  assert.equal(canViewCommercial('RS'), false)
  assert.equal(isApprover('RS'), false)
})

test('management grants are configurable while administrator access is protected', () => {
  const accessPolicy = defaultAccessPolicy()
  accessPolicy.roles.MANAGEMENT.actions = ['priceLists.manage']
  setPermissionContext({ role: 'AH', roles: ['MANAGEMENT'] }, { accessPolicy })
  assert.equal(canManagePriceLists('AH'), true)
  assert.equal(isApprover('AH'), false)
  setPermissionContext({ role: 'RS', roles: ['ADMIN'] }, { accessPolicy })
  assert.equal(isAdminRole('RS'), true)
  assert.equal(canSeePage('RS', 'admin'), true)
  assert.equal(canManagePriceLists('RS'), true)
})

test('explicit configuration works without active context and legacy utility behavior remains available', () => {
  assert.equal(canPriceProposal('RS'), true)
  assert.equal(isAdminRole('LJS'), true)
  const accessPolicy = defaultAccessPolicy()
  accessPolicy.roles.STANDARD_USER.actions = []
  assert.equal(canPriceProposal('STANDARD_USER', { accessPolicy }), false)
  assert.equal(canSeePage('MANAGEMENT', 'admin', { accessPolicy }), false)
})
