import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeLocalBackupState } from '../src/localBackupState.js'
import { accountProfileFor } from '../src/userManagement.js'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { effectiveAccess } from '../src/accessPolicy.js'
import { isActiveUser } from '../src/userManagement.js'
import { isEmptyBackupWorkspace, localBackupState } from '../src/workspaceBackup.js'

test('restore retains current credentials, lifecycle and attribution while reviving imported IDs', () => {
  const current = { users: [{ id: 'u', pw: 'retained', status: 'Suspended' }], auth: { user: { id: 'admin' } }, role: 'ADMIN', roles: ['ADMIN'], oneTimeCleanups: { localPreviewAdmin: 'receipt' }, deletedOpportunityIds: ['O', 'other'], deletedLeadIds: ['L'], audit: [{ id: 'old', action: 'Keep' }], config: {} }
  const imported = { users: [{ id: 'u', pw: 'forged', status: 'Active' }], opportunities: [{ id: 'O', booking: { amount: 100 } }], leads: [{ id: 'L' }], audit: [{ id: 'history' }], auth: { user: { id: 'attacker' } } }
  const next = mergeLocalBackupState(current, imported)
  assert.equal(next.users, current.users)
  assert.equal(next.auth, current.auth)
  assert.equal(next.oneTimeCleanups, current.oneTimeCleanups)
  assert.deepEqual(next.deletedOpportunityIds, ['other'])
  assert.deepEqual(next.deletedLeadIds, [])
  assert.equal(next.opportunities[0].booking.amount, 100)
  assert.deepEqual(next.audit.map(row => row.id), ['old', 'history'])
  assert.throws(() => mergeLocalBackupState(current, { audit: [{ id: 'old', action: 'Changed' }] }), /audit history/)
})

test('identity prefers exact auth bindings and fails closed on ambiguous roster matches', () => {
  const exact = { id: 'actual', authId: 'auth-id', email: 'new@example.com', status: 'Suspended' }
  const stale = { id: 'stale', email: 'old@example.com', status: 'Active' }
  const auth = { id: 'auth-id', email: 'old@example.com' }
  assert.equal(accountProfileFor([stale, exact], auth), exact)
  assert.equal(accountProfileFor([exact, { ...exact, id: 'duplicate' }], auth), null)
  assert.equal(accountProfileFor([stale, { ...stale, id: 'duplicate' }], auth), null)
  assert.equal(accountProfileFor([stale], auth), stale)
  assert.equal(accountProfileFor([{ ...stale, authId: 'another' }], auth), null)
})

function restoreHarness({ quota = false, busy = false, connected = false } = {}) {
  const source = readFileSync('src/store.jsx', 'utf8')
  const start = source.indexOf('    async restoreLocalBackup(')
  const method = source.slice(start, source.indexOf('\n    // Drop the saved state', start)).trim().replace(/,$/, '').replace("await import('./workspaceBackup.js')", 'backupHelpers')
  const before = { users: [{ id: 'a', pw: 'retained', role: 'ADMIN', roles: ['ADMIN'], status: 'Active' }], auth: { source: 'local', user: { id: 'a' } }, opportunities: busy ? [{ id: 'existing' }] : [], leads: [], audit: [], config: {}, role: 'ADMIN', roles: ['ADMIN'] }
  const stateRef = { current: before }, saved = new Map([['workspace', 'original']])
  const context = vm.createContext({ stateRef, backupHelpers: { isEmptyBackupWorkspace, localBackupState }, accountProfileFor, effectiveAccess, isActiveUser, mergeLocalBackupState,
    KEY: 'workspace', supabase: null, isLocalDemoSession: () => false, migrate: value => value, syncedOf: value => value, localSnapshot: value => value,
    withAudit: value => ({ ...value, audit: [...value.audit, { id: 'restore' }] }),
    datastore: { dbEnabled: () => connected, resetWorkspaceViewRecords() {}, invalidateLoadCache() {} },
    localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => { if (quota) throw new Error('Quota exceeded'); saved.set(key, value) }, removeItem: key => saved.delete(key) },
    clearTimeout() {}, saveTimerRef: {}, localCacheTimerRef: {}, workspaceDrafts: { reset() {} }, approvalCommandsRef: { current: new Map() }, viewRequestsRef: { current: new Map() }, lastSavedRef: {}, setOverview() {}, setActiveDataView() {}, setState: next => { stateRef.current = next },
  })
  vm.runInContext(`const api = {${method}}; globalThis.restore = api.restoreLocalBackup`, context)
  return { restore: context.restore, stateRef, before, saved }
}

test('store local restore installs sanitized business data and supplies exact state rollback', async () => {
  const h = restoreHarness()
  const rollback = await h.restore({ opportunities: [{ id: 'restored' }], users: [{ id: 'a', pw: 'forged' }] })
  assert.equal(h.stateRef.current.opportunities[0].id, 'restored')
  assert.equal(h.stateRef.current.users[0].pw, 'retained')
  rollback()
  assert.equal(h.stateRef.current, h.before)
  assert.equal(h.saved.get('workspace'), 'original')
})

test('quota failure, nonempty workspace and connected mode cannot install restored state', async () => {
  for (const options of [{ quota: true }, { busy: true }, { connected: true }]) {
    const h = restoreHarness(options)
    await assert.rejects(h.restore({ opportunities: [{ id: 'restored' }] }))
    assert.equal(h.stateRef.current, h.before)
    assert.equal(h.saved.get('workspace'), 'original')
  }
})
