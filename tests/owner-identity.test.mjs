import test from 'node:test'
import assert from 'node:assert/strict'
import { displayOpportunityId, ownerIdFor } from '../src/seed.js'
import { displayRole, setRoleNameConfig } from '../src/utils.js'

test('account renames override stale owner labels without changing ownership keys', () => {
  const config = { roleNames: { RS: 'Old owner label' } }
  const account = { id: 'U-004', authId: 'auth-rs', role: 'RS', name: 'Ruthvik Satish', status: 'Active' }
  try {
    setRoleNameConfig(config, [account])
    assert.equal(displayRole('RS', config), account.name)
    assert.equal(displayRole(account.id), account.name)
    assert.equal(displayRole(account.authId), account.name)
    setRoleNameConfig(config, [{ ...account, name: 'Updated full name' }])
    assert.equal(displayRole('RS'), 'Updated full name')
    setRoleNameConfig(config, [
      { ...account, name: 'Renamed original account' },
      { id: 'seed-copy', role: 'RS', name: 'Old seeded copy', status: 'Active' },
    ])
    assert.equal(displayRole('RS'), 'Renamed original account')
    assert.equal(ownerIdFor('RS'), 'RS')
    setRoleNameConfig(config, [])
    assert.equal(displayRole('RS'), 'Old owner label')
  } finally { setRoleNameConfig(null) }
})

test('shared access roles are not mistaken for individual owners and deleted attribution remains readable', () => {
  try {
    setRoleNameConfig({}, [
      { id: 'one', role: 'NON_SALES', name: 'First person' },
      { id: 'two', role: 'NON_SALES', name: 'Second person' },
      { id: 'deleted', role: 'PP', name: 'Former owner', status: 'Deleted', deletedAt: '2026-10-17' },
      { id: 'old', role: 'RS', name: 'Old account', status: 'Deleted' },
      { id: 'new', role: 'RS', name: 'Current account', status: 'Active' },
    ])
    assert.equal(displayRole('NON_SALES'), 'Non-sales')
    assert.equal(displayRole('one'), 'First person')
    assert.equal(displayRole('PP'), 'Former owner')
    assert.equal(displayRole('RS'), 'Current account')
    assert.equal(displayRole('unknown-id'), 'unknown-id')
  } finally { setRoleNameConfig(null) }
})

test('ownerIdFor keeps canonical role ids stable', () => {
  assert.equal(ownerIdFor('RS'), 'RS')
  assert.equal(ownerIdFor('PJS'), 'PJS')
})

test('ownerIdFor resolves default and admin-customized display names', () => {
  assert.equal(ownerIdFor('Ruthvik Satish'), 'RS')
  assert.equal(ownerIdFor('Parts Team', { PJS: 'Parts Team' }), 'PJS')
})

test('ownerIdFor preserves unknown values for auditability', () => {
  assert.equal(ownerIdFor('Unassigned'), 'Unassigned')
  assert.equal(ownerIdFor(''), '')
})

test('legacy opportunity IDs display only the numeric ID', () => {
  assert.equal(displayOpportunityId('2609002R. Sundaram'), '2609002')
  assert.equal(displayOpportunityId('2609002RS'), '2609002')
  assert.equal(displayOpportunityId('2609002'), '2609002')
  assert.equal(displayOpportunityId('OP-1'), 'OP-1')
})
