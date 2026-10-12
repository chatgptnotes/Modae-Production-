import test from 'node:test'
import assert from 'node:assert/strict'
import { accountChangeError, deletedProfile, isActiveUser, matchesAccount } from '../src/userManagement.js'
import { changeAccount } from '../api/_user-lifecycle.js'
const admin = { id: 'admin', authId: 'auth-admin', name: 'Admin', email: 'admin@test.com', role: 'ADMIN', roles: ['ADMIN'], status: 'Active' }
const user = { id: 'user', authId: 'auth-user', name: 'User', email: 'user@test.com', role: 'PP', roles: ['STANDARD_USER'], status: 'Active', pw: 'secret' }
const auth = { id: admin.authId, email: admin.email }
function fakeClient(initial = [admin, user]) {
  let users = structuredClone(initial), rev = 1, remote = { id: user.authId, email: user.email }
  const events = []
  const client = {
    from() { const q = { select(){ return q }, eq(){return q}, is(){return q}, async maybeSingle(){ return { data: { data: structuredClone(users), rev } } } }; return q },
    async rpc(name, args) {
      assert.equal(name, 'save_user_roster')
      if (client.conflict || args.p_rev !== rev) return { error: { code: '40001' } }
      users = structuredClone(args.p_users); rev++; events.push(args.p_audit.action)
      return { error: null }
    },
    auth: { admin: {
      async getUserById(id) { assert.equal(id, user.authId); return { data: { user: remote }, error: remote ? null : { status: 404 } } },
      async updateUserById(id, patch) { events.push(`auth update:${patch.ban_duration}`); return { data: { user: remote }, error: null } },
      async deleteUser(id) { events.push('auth delete'); if (client.failDelete) return { error: { message: 'Provider unavailable' } }; remote = null; return { error: null } },
    } },
    users: () => users, events,
  }
  return client
}
test('account safeguards protect self, System Owner and inactive actors', () => {
  assert.match(accountChangeError([admin,user], admin, admin, {}, true), /own account/)
  assert.match(accountChangeError([admin,user], admin, { ...user, role: 'SUPER' }, {}, true), /System Owner/)
  assert.match(accountChangeError([admin,user], { ...admin, status: 'Suspended' }, user, {}, true), /active administrators/)
  assert.match(accountChangeError([admin,user], admin, admin, { roles: ['STANDARD_USER'] }), /own account/)
  assert.equal(matchesAccount(user, { id: 'other', email: user.email }), false)
})
test('deletion persists intent before Auth removal and keeps a credential-free attribution record', async () => {
  const client = fakeClient()
  const result = await changeAccount(client, auth, { action: 'delete', profileId: user.id, expectedRevision: 0, authId: 'forged' })
  assert.deepEqual(client.events, ['User deletion requested','auth update:876000h','auth delete','User deleted; business history retained'])
  assert.equal(result.profile.status, 'Deleted')
  assert.equal(result.profile.role, 'PP')
  assert.equal(result.profile.pw, undefined)
  assert.equal(result.users.length, 2)
  assert.equal(isActiveUser(result.profile), false)
  const again = await changeAccount(client, auth, { action: 'delete', profileId: user.id, expectedRevision: 0 })
  assert.equal(again.profile.status, 'Deleted')
  assert.equal(client.events.length, 4)
})
test('provider failure keeps non-active deletion intent and retry completes', async () => {
  const client = fakeClient(); client.failDelete = true
  await assert.rejects(changeAccount(client, auth, { action: 'delete', profileId: user.id, expectedRevision: 0 }), /pending; access is blocked/)
  const pending = client.users()[1]
  assert.equal(isActiveUser(pending), false)
  assert.ok(pending.deletionPendingAt)
  client.failDelete = false
  const result = await changeAccount(client, auth, { action: 'delete', profileId: user.id, expectedRevision: pending.accountRevision })
  assert.equal(result.profile.status, 'Deleted')
})
test('stale revisions or roster conflicts perform no Auth mutation', async () => {
  const client = fakeClient()
  await assert.rejects(changeAccount(client, auth, { action: 'delete', profileId: user.id, expectedRevision: 7 }), /changed/)
  client.conflict = true
  await assert.rejects(changeAccount(client, auth, { action: 'delete', profileId: user.id, expectedRevision: 0 }), /another session/)
  assert.deepEqual(client.events, [])
})
test('suspension updates Auth ban and reactivation clears it', async () => {
  const client = fakeClient()
  let result = await changeAccount(client, auth, { action: 'access', profileId: user.id, expectedRevision: 0 }, { status: 'Suspended' })
  assert.equal(isActiveUser(result.profile), false)
  assert.ok(client.events.includes('auth update:876000h'))
  result = await changeAccount(client, auth, { action: 'access', profileId: user.id, expectedRevision: result.profile.accountRevision }, { status: 'Active' })
  assert.equal(isActiveUser(result.profile), true)
  assert.ok(client.events.includes('auth update:none'))
})
test('minimal tombstone retains identity without restoring a local password', () => {
  assert.deepEqual(Object.keys(deletedProfile(user, admin.id)).sort(), ['accountRevision','authId','created','deletedAt','deletedBy','email','id','name','role','roles','status'].sort())
})
