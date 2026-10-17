import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { canPreviewAsUser, installLocalPreviewAdmin } from '../src/localPreviewAdmin.js'
import { seedState, migrate } from '../src/appState.js'
import { isActiveUser } from '../src/userManagement.js'
import { ROLES, userRoles, seedUsers } from '../src/seed.js'
import { changeLocalPassword } from '../src/passwordChange.js'

const copy = value => JSON.parse(JSON.stringify(value))
test('legacy setup repairs an inactive local Admin once without changing other records', () => {
  for (const receipt of [undefined, { accountId: 'old-admin' }]) {
    const other = { id: 'other', name: 'Other user', status: 'Active', pw: 'unchanged' }
    const opportunity = { id: 'OP-1', owner: 'RS' }
    const broken = { id: 'old-admin', email: 'admin@modae.com', name: 'WinTrack Admin', role: 'ADMIN', roles: ['ADMIN'], status: 'Deleted', deletedAt: '2026-10-17', deletedBy: 'LOCAL-DIRECTORY', deletionPendingAt: '2026-10-17', accessPending: true }
    const before = { users: [other, broken], opportunities: [opportunity], oneTimeCleanups: receipt ? { localPreviewAdmin: receipt } : {}, auth: { source: 'local' } }
    const after = installLocalPreviewAdmin(before)
    const admin = after.users.find(row => row.id === broken.id)
    assert.equal(isActiveUser(admin), true)
    assert.equal(admin.pw, 'admink1')
    assert.equal(admin.deletedAt, undefined)
    assert.equal(admin.deletedBy, undefined)
    assert.equal(admin.deletionPendingAt, undefined)
    assert.equal(admin.accessPending, undefined)
    assert.equal(after.users[0], other)
    assert.equal(after.opportunities, before.opportunities)
    assert.equal(installLocalPreviewAdmin(after), after)
    const suspended = { ...after, users: after.users.map(row => row.id === admin.id ? { ...row, status: 'Suspended' } : row) }
    assert.equal(installLocalPreviewAdmin(suspended), suspended)
  }
})

test('upgrading an active legacy Admin preserves its edited password and name', () => {
  const admin = { id: 'a', email: 'admin@modae.com', name: 'Edited', pw: 'Edited-password-2', role: 'ADMIN', roles: ['ADMIN'], status: 'Active' }
  const before = { users: [admin], oneTimeCleanups: { localPreviewAdmin: { accountId: 'a' } } }
  const after = installLocalPreviewAdmin(before)
  assert.equal(after.users[0], admin)
  assert.equal(after.users[0].pw, admin.pw)
})

function signedInAdmin() {
  const state = copy(seedState())
  const admin = state.users.find(user => user.id === state.oneTimeCleanups.localPreviewAdmin.accountId)
  state.auth = { source: 'local-demo', user: { id: admin.id, email: admin.email, role: admin.role } }
  state.role = admin.role; state.roles = admin.roles
  return state
}

test('local setup adds one dedicated Admin alongside the twelve supplied accounts', () => {
  const state = signedInAdmin()
  const admin = state.users.find(user => user.id === state.oneTimeCleanups.localPreviewAdmin.accountId)
  assert.equal(state.users.filter(isActiveUser).length, seedUsers.filter(isActiveUser).length + 1)
  assert.equal(admin.name, 'WinTrack Admin')
  assert.equal(admin.email, 'admin@modae.com')
  assert.deepEqual(admin.roles, ['ADMIN'])
  assert.equal(admin.pw.length, 7)
  assert.equal(installLocalPreviewAdmin(state), state)
  assert.equal(canPreviewAsUser(state), true)
})

test('stable identity preserves preview access after name/email edits without restoring the initial password', () => {
  let state = signedInAdmin()
  const id = state.oneTimeCleanups.localPreviewAdmin.accountId
  const admin = state.users.find(user => user.id === id)
  state = changeLocalPassword(state, admin.pw, 'Changed-password-2', 'Changed-password-2')
  const changed = state.users.find(user => user.id === id)
  changed.name = 'Renamed administrator'; changed.email = 'renamed@example.com'
  state.auth.user.email = changed.email
  const reloaded = migrate(copy(state))
  assert.equal(reloaded.users.find(user => user.id === id).pw, 'Changed-password-2')
  assert.equal(reloaded.users.find(user => user.id === id).name, changed.name)
  assert.equal(canPreviewAsUser(reloaded), true)
})

test('Management, other administrators and persona overrides cannot acquire preview access', () => {
  const state = signedInAdmin()
  const adminId = state.oneTimeCleanups.localPreviewAdmin.accountId
  for (const actor of state.users.filter(user => user.id !== adminId)) {
    state.auth.user = { id: actor.id, email: actor.email, role: 'ADMIN', roles: ['ADMIN'] }
    state.role = 'ADMIN'; state.roles = ['ADMIN']
    assert.equal(canPreviewAsUser(state), false, actor.email)
  }
  state.auth.user = { id: 'forged-id', email: 'admin@modae.com' }
  assert.equal(canPreviewAsUser(state), false)
})

test('shared mode and inactive/pending/demoted Admin profiles are denied', () => {
  assert.equal(canPreviewAsUser(signedInAdmin(), true), false)
  const shared = signedInAdmin(); shared.auth.source = 'supabase'
  assert.equal(canPreviewAsUser(shared), false)
  for (const patch of [{ status: 'Deleted', deletedAt: '2026-10-17' }, { status: 'Suspended' },
    { accessPending: true }, { deletionPendingAt: '2026-10-17' }, { roles: ['MANAGEMENT', 'ADMIN'] }, { roles: ['STANDARD_USER'] }]) {
    const state = signedInAdmin()
    Object.assign(state.users.find(user => user.id === state.auth.user.id), patch)
    assert.equal(canPreviewAsUser(state), false)
    if (patch.status === 'Deleted') {
      const reloaded = migrate(copy(state))
      assert.equal(reloaded.users.filter(user => user.email === 'admin@modae.com').length, 1)
      assert.equal(reloaded.users.find(user => user.email === 'admin@modae.com').status, 'Deleted')
    }
  }
})

test('connected roster migration never installs the local Admin or its credential', () => {
  const state = copy(seedState())
  state.users = state.users.filter(user => user.email !== 'admin@modae.com')
  delete state.oneTimeCleanups.localPreviewAdmin
  state.auth = { source: 'supabase', user: null }
  const result = migrate(state)
  assert.equal(result.users.some(user => user.email === 'admin@modae.com'), false)
  assert.equal(result.oneTimeCleanups.localPreviewAdmin, undefined)
  assert.equal(installLocalPreviewAdmin(state), state)
})

function previewHarness(state, shared = false) {
  const source = fs.readFileSync(new URL('../src/store.jsx', import.meta.url), 'utf8')
  const start = source.indexOf('    signInAs(userId) {')
  const method = source.slice(start, source.indexOf('\n\n    // Drop the saved state', start)).trim().replace(/,$/, '')
  const stateRef = { current: state }
  const context = vm.createContext({ stateRef, datastore: { dbEnabled: () => shared }, canPreviewAsUser, isActiveUser,
    authEpochRef: { current: 0 }, ROLES, userRoles, seedUsers, withAudit: value => value,
    setState: update => { stateRef.current = update(stateRef.current) },
  })
  vm.runInContext(`const api = {${method}}; globalThis.preview = api.signInAs`, context)
  return { preview: context.preview, stateRef }
}

test('underlying preview command rejects direct non-Admin calls and inactive targets', () => {
  const admin = signedInAdmin()
  const target = admin.users.find(user => user.role === 'RS')
  const nonAdmin = copy(admin); nonAdmin.auth.user = { id: target.id, email: target.email }
  const denied = previewHarness(nonAdmin)
  assert.throws(() => denied.preview(admin.auth.user.id), /dedicated Admin/)
  assert.equal(denied.stateRef.current.auth.user.id, target.id)
  assert.throws(() => previewHarness(admin, true).preview(target.id), /dedicated Admin/)
  const blocked = copy(admin); blocked.users.find(user => user.id === target.id).accessPending = true
  assert.throws(() => previewHarness(blocked).preview(target.id), /active account/)
})

test('authorized preview switches to the target permissions and removes further preview access', () => {
  const harness = previewHarness(signedInAdmin())
  const target = harness.stateRef.current.users.find(user => user.role === 'RS')
  const opportunities = harness.stateRef.current.opportunities
  assert.equal(harness.preview(target.id), true)
  assert.equal(harness.stateRef.current.auth.user.id, target.id)
  assert.deepEqual([...harness.stateRef.current.roles], [...userRoles(target)])
  assert.equal(harness.stateRef.current.opportunities, opportunities)
  assert.equal(canPreviewAsUser(harness.stateRef.current), false)
  assert.throws(() => harness.preview('U-002'), /dedicated Admin/)
})
