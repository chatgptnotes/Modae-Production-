import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { ROLES, userRoles } from '../src/seed.js'
import { accountProfileFor, isActiveUser } from '../src/userManagement.js'

const source = fs.readFileSync(new URL('../src/store.jsx', import.meta.url), 'utf8')
const profileSource = source.slice(source.indexOf('function applyAuthoritativeProfile('), source.indexOf('\nconst workflowTransition'))
const context = vm.createContext({ ROLES, userRoles, accountProfileFor, isActiveUser })
vm.runInContext(`${profileSource}; globalThis.apply = applyAuthoritativeProfile`, context)
const profile = { id: 'LJ', authId: 'auth-lj', email: 'lj@example.com', name: 'LJ Swaminathan', role: 'LJS', roles: ['ADMIN'], status: 'Active' }
const state = () => ({ users: [], role: 'RS', roles: ['RS'], auth: { source: 'supabase', user: { id: 'auth-lj', email: profile.email, name: profile.email, role: 'RS' } }, opportunities: [{ id: 'draft', subject: 'Unsaved input' }] })

test('authoritative profile corrects the fallback identity together and preserves drafts and auth UUID', () => {
  const before = state()
  before.auth.user.email = 'old-address@example.com'
  const after = context.apply(before, [profile])
  assert.equal(after.role, 'LJS')
  assert.equal(after.auth.user.role, 'LJS')
  assert.equal(after.auth.user.name, profile.name)
  assert.equal(after.auth.user.email, profile.email)
  assert.equal(after.auth.user.id, 'auth-lj')
  assert.equal(after.roles[0], 'ADMIN')
  assert.equal(after.opportunities, before.opportunities)
})

function loginHarness({ fastTimeout = false } = {}) {
  let resolveRead, rejectRead, reads = 0, ready = true, error = ''
  const stateRef = { current: state() }
  const refs = Object.fromEntries(['authEpochRef','externalLoginRef','pendingAuthUserRef','initialHydrationRef','sharedPullInFlightRef','lastSavedRef','bootRef','saveTimerRef'].map(k => [k, { current: k === 'authEpochRef' ? 0 : null }]))
  const ctx = vm.createContext({ ...refs, stateRef, ROLES, userRoles, accountProfileFor, isActiveUser,
    authInvalidRef: { current: false }, hydratedRef: { current: true },
    datastore: { resetWorkspaceViewRecords() {}, setLocalDemoMode() {}, invalidateLoadCache() {}, settleWorkspaceReads: async () => {} },
    supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'auth-lj' }, access_token: 'token' } } }) } },
    fetchWorkspace: () => { reads++; return new Promise((resolve, reject) => { resolveRead = resolve; rejectRead = reject }) },
    setOverview() {}, setActiveDataView() {},
    setAuthReady: value => { ready = value }, setAuthProfileError: value => { error = value },
    setState: fn => { stateRef.current = typeof fn === 'function' ? fn(stateRef.current) : fn },
    withAudit: s => s, clearTimeout, setTimeout: (fn, ms) => setTimeout(fn, fastTimeout ? 5 : ms), Promise,
    workspaceDrafts: { reset() {} }, syncedOf: s => s, emptyState: s => ({ ...s, opportunities: [] }),
  })
  const login = source.slice(source.indexOf('    loginExternal(user,'), source.indexOf('\n    logout()', source.indexOf('    loginExternal(user,'))).trim().replace(/,$/, '')
  vm.runInContext(`${profileSource}; const api={${login}}; globalThis.login=api.loginExternal`, ctx)
  return { ctx, stateRef, login: ctx.login, get ready() { return ready }, get error() { return error }, get reads() { return reads },
    captureRead: () => resolveRead, resolve: value => resolveRead(value), reject: e => rejectRead(e), tick: () => new Promise(r => setImmediate(r)) }
}
const authUser = { id: 'auth-lj', email: profile.email, user_metadata: { role: 'SUPER' } }

test('connected login waits for server identity, ignores metadata and coalesces duplicate auth events', async () => {
  const h = loginHarness()
  const pending = h.login(authUser)
  const duplicate = h.login(authUser)
  assert.equal(h.ready, false)
  await h.tick()
  assert.equal(h.reads, 1)
  h.resolve({ users: [profile] })
  assert.equal((await pending).ok, true)
  assert.equal((await duplicate).ok, true)
  assert.equal(h.ready, true)
  assert.equal(h.stateRef.current.role, 'LJS')
})

test('failed profile lookup stays gated and can be retried', async () => {
  const h = loginHarness(), pending = h.login(authUser)
  await h.tick(); h.reject(new Error('Connection unavailable'))
  assert.equal((await pending).ok, false)
  assert.equal(h.ready, false)
  assert.match(h.error, /Connection unavailable/)
  const retry = h.login(authUser)
  await h.tick(); h.resolve({ users: [profile] }); await retry
  assert.equal(h.ready, true)
  assert.equal(h.error, '')
})

test('logout invalidates a late profile response', async () => {
  const h = loginHarness(), pending = h.login(authUser)
  await h.tick()
  h.ctx.authEpochRef.current++
  h.stateRef.current = { ...state(), auth: { user: null } }
  h.resolve({ users: [profile] })
  assert.equal((await pending).ok, false)
  assert.equal(h.stateRef.current.auth.user, null)
})

for (const users of [[], [{ ...profile, status: 'Suspended' }], [{ ...profile, authId: 'someone-else' }]]) {
  test(`connected login rejects missing, disabled or mismatched profiles: ${JSON.stringify(users)}`, async () => {
    const h = loginHarness(), pending = h.login(authUser)
    await h.tick(); h.resolve({ users })
    assert.equal((await pending).ok, false)
    assert.equal(h.ready, false)
  })
}

test('verified login installs server access policy before exposing the workspace', async () => {
  const h = loginHarness(), pending = h.login(authUser)
  await h.tick()
  h.resolve({ users: [profile], config: { accessPolicy: { revision: 7 } } })
  await pending
  assert.equal(h.stateRef.current.config.accessPolicy.revision, 7)
})


test('a stalled profile request offers retry and cannot install its late result', async () => {
  const h = loginHarness({ fastTimeout: true })
  const pending = h.login(authUser)
  await new Promise(r => setTimeout(r, 20))
  assert.match(h.error, /timed out/i)
  assert.equal((await pending).ok, false)
  h.resolve({ users: [profile] })
  await h.tick()
  assert.equal(h.ready, false)
  assert.equal(h.stateRef.current.role, 'RS')
})


function restoreHarness(h, request) {
  let cleanup
  Object.assign(h.ctx, {
    console, isLocalDemoSession: () => false, setSyncDiagnostics() {},
    api: { loginExternal: h.login },
    supabase: { auth: { getSession: () => request, onAuthStateChange: () => ({ data: { listener: null } }) } },
    useEffect: fn => { cleanup = fn() },
  })
  h.ctx.setAuthReady(false)
  const start = source.indexOf('  // Supabase persists its browser session')
  const end = source.indexOf('  // Deadline processing', start)
  vm.runInContext(source.slice(start, end), h.ctx)
  return () => cleanup?.()
}

test('restoring the same cached email still verifies and corrects its stale RS identity', async () => {
  const h = loginHarness()
  const cleanup = restoreHarness(h, Promise.resolve({ data: { session: { user: authUser, access_token: 'token' } } }))
  await h.tick()
  assert.equal(h.ready, false)
  assert.equal(h.reads, 1)
  h.resolve({ users: [profile] })
  await h.tick()
  assert.equal(h.ready, true)
  assert.equal(h.stateRef.current.role, 'LJS')
  cleanup()
})

test('session restore timeout offers retry without exposing cached identity', async () => {
  const h = loginHarness({ fastTimeout: true })
  const cleanup = restoreHarness(h, new Promise(() => {}))
  await new Promise(r => setTimeout(r, 20))
  assert.equal(h.ready, false)
  assert.match(h.error, /timed out/i)
  cleanup()
})

test('late session restoration cannot start a login after logout', async () => {
  const h = loginHarness()
  let finish
  const cleanup = restoreHarness(h, new Promise(resolve => { finish = resolve }))
  h.ctx.authEpochRef.current++
  finish({ data: { session: { user: authUser, access_token: 'token' } } })
  await h.tick()
  assert.equal(h.reads, 0)
  cleanup()
})


test('switching accounts rejects the old login result and removes its business snapshot', async () => {
  const h = loginHarness()
  const oldLogin = h.login(authUser)
  await h.tick()
  const finishOld = h.captureRead()
  const nextUser = { id: 'auth-next', email: 'next@example.com' }
  const nextLogin = h.login(nextUser, { user: nextUser, access_token: 'next-token' })
  await h.tick()
  h.resolve({ users: [{ ...profile, id: 'NEXT', authId: nextUser.id, email: nextUser.email, name: 'Next user', role: 'PP' }] })
  assert.equal((await nextLogin).ok, true)
  finishOld({ users: [profile] })
  assert.equal((await oldLogin).ok, false)
  assert.equal(h.stateRef.current.auth.user.id, 'auth-next')
  assert.equal(h.stateRef.current.role, 'PP')
  assert.equal(h.stateRef.current.opportunities.length, 0)
})

test('same-account verification preserves business drafts', async () => {
  const h = loginHarness(), drafts = h.stateRef.current.opportunities
  const pending = h.login(authUser)
  await h.tick(); h.resolve({ users: [profile] }); await pending
  assert.equal(h.stateRef.current.opportunities, drafts)
  assert.equal(drafts[0].subject, 'Unsaved input')
})
