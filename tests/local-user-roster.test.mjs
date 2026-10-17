import test from 'node:test'
import assert from 'node:assert/strict'
import { replaceLocalUserRoster } from '../src/localUserRoster.js'
import { seedUsers } from '../src/seed.js'
import { migrate, seedState } from '../src/appState.js'
import { isDeletedUser } from '../src/userManagement.js'

const copy = value => JSON.parse(JSON.stringify(value))

test('replacement leaves only the twelve requested accounts and retires duplicate/old logins', () => {
  const old = { id: 'old-rs', name: 'Ruthvik. Satish', email: 'rahul@modae.demo', role: 'RS', status: 'Active', pw: 'old-secret' }
  const admin = { id: 'U-001', name: 'System Owner', email: 'admin@modae.demo', role: 'SUPER', status: 'Active', pw: 'old-secret' }
  const duplicate = { ...seedUsers[0], id: 'duplicate' }
  const result = replaceLocalUserRoster([...copy(seedUsers), old, admin, duplicate], 'U-002', '2026-10-17T00:00:00.000Z')
  const active = result.filter(user => !isDeletedUser(user))
  assert.equal(active.length, 12)
  assert.deepEqual(active.map(user => user.email).sort(), seedUsers.map(user => user.email).sort())
  for (const id of ['old-rs', 'U-001', 'duplicate']) {
    const retired = result.find(user => user.id === id)
    assert.equal(retired.status, 'Deleted')
    assert.equal(retired.pw, undefined)
    assert.equal(retired.deletedBy, 'U-002')
  }
})

test('existing identities, local passwords and lifecycle fields survive directory correction', () => {
  const original = { id: 'U-004', email: 'rahul@modae.demo', name: 'Old name', role: 'RS', pw: 'keep-password', status: 'Suspended', accountRevision: 7, accessPending: true }
  const result = replaceLocalUserRoster([original])
  const account = result.find(user => user.email === 'ruthvik.satish@mod-ae.com')
  assert.equal(account.id, original.id)
  assert.equal(account.name, 'Ruthvik Satish')
  assert.equal(account.pw, original.pw)
  assert.equal(account.status, 'Suspended')
  assert.equal(account.accountRevision, 7)
  assert.equal(account.accessPending, true)
})

test('local cleanup preserves business records and does not recreate renamed or deleted accounts on reload', () => {
  const state = copy(seedState())
  delete state.oneTimeCleanups.modaeRosterOnly
  const previewAdminId = state.oneTimeCleanups.localPreviewAdmin.accountId
  delete state.oneTimeCleanups.localPreviewAdmin
  state.users = state.users.filter(user => user.id !== previewAdminId)
  state.users.push({ id: 'old', email: 'old@modae.demo', name: 'Old', role: 'PJS', status: 'Active', pw: 'secret' })
  const originalOpportunities = copy(state.opportunities)
  const migrated = migrate(state)
  assert.deepEqual(migrated.opportunities, originalOpportunities)
  assert.equal(migrated.users.filter(user => !isDeletedUser(user)).length, 13)
  const user = migrated.users.find(user => user.role === 'RS')
  user.name = 'Updated after cleanup'
  user.email = 'updated@mod-ae.com'
  const deleted = migrated.users.find(user => user.role === 'PP')
  deleted.status = 'Deleted'
  deleted.deletedAt = '2026-10-18'
  delete deleted.pw
  const reloaded = migrate(copy(migrated))
  assert.equal(reloaded.users.find(row => row.id === user.id).name, user.name)
  assert.equal(reloaded.users.some(row => row.email === 'ruthvik.satish@mod-ae.com'), false)
  assert.equal(reloaded.users.find(row => row.id === deleted.id).status, 'Deleted')
})

test('retired local sessions are signed out; connected rosters are not rewritten or seeded', () => {
  const state = copy(seedState())
  delete state.oneTimeCleanups.modaeRosterOnly
  const old = { id: 'U-001', role: 'SUPER', email: 'admin@modae.demo', name: 'System Owner', status: 'Active', pw: 'secret' }
  state.users.push(old)
  state.auth = { user: { ...old } }
  assert.equal(migrate(state).auth.user, null)
  const shared = copy(seedState())
  delete shared.oneTimeCleanups.modaeRosterOnly
  const profile = { id: 'shared', authId: 'remote', role: 'RS', roles: ['STANDARD_USER'], name: 'Shared name', email: 'shared@example.com', status: 'Active', accountRevision: 4 }
  shared.users = [profile]
  shared.auth = { source: 'supabase', user: { id: 'remote', email: profile.email } }
  const result = migrate(shared)
  assert.deepEqual(result.users, [profile])
  assert.equal(result.oneTimeCleanups.modaeRosterOnly, undefined)
  assert.equal(result.users[0].pw, undefined)
})
