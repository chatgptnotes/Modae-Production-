import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { validatePasswordChange, changeLocalPassword, changeRemotePassword } from '../src/passwordChange.js'
import { isActiveUser, matchesAccount, accountProfileFor } from '../src/userManagement.js'

const oldPassword = 'Current-pass-1'
const newPassword = 'New-password-2'
const profile = { id: 'self', email: 'person@mod-ae.com', name: 'Person', role: 'NON_SALES', roles: ['NON_SALES'], status: 'Active', pw: oldPassword }
const localState = () => ({ users: [{ ...profile }, { ...profile, id: 'other', email: 'other@mod-ae.com' }], auth: { source: 'local-demo', user: { id: profile.id, email: profile.email } }, opportunities: [{ id: 'draft' }], audit: [], role: 'NON_SALES' })

test('password validation rejects missing, short, mismatched and unchanged values', () => {
  assert.throws(() => validatePasswordChange('', newPassword, newPassword), /current password/)
  assert.throws(() => validatePasswordChange(oldPassword, 'short', 'short'), /8 characters/)
  assert.throws(() => validatePasswordChange(oldPassword, newPassword, 'different'), /do not match/)
  assert.throws(() => validatePasswordChange(oldPassword, oldPassword, oldPassword), /different/)
})

test('non-sales local self-service updates only its own credential and preserves workspace drafts', () => {
  const before = localState()
  const after = changeLocalPassword(before, oldPassword, newPassword, newPassword)
  assert.equal(after.users[0].pw, newPassword)
  assert.equal(after.users[1], before.users[1])
  assert.equal(before.users[0].pw, oldPassword)
  assert.equal(after.auth, before.auth)
  assert.equal(after.opportunities, before.opportunities)
  assert.equal(after.users.find(user => matchesAccount(user, after.auth.user)).pw === oldPassword, false)
})

test('local changes reject wrong passwords, inactive accounts, missing sessions and connected mode', () => {
  assert.throws(() => changeLocalPassword(localState(), 'incorrect', newPassword, newPassword), /Current password is incorrect/)
  for (const patch of [{ status: 'Suspended' }, { status: 'Deleted' }, { accessPending: true }]) {
    const state = localState(); Object.assign(state.users[0], patch)
    assert.throws(() => changeLocalPassword(state, oldPassword, newPassword, newPassword), /active account/)
  }
  const unsigned = localState(); unsigned.auth.user = null
  assert.throws(() => changeLocalPassword(unsigned, oldPassword, newPassword, newPassword), /active account/)
  const shared = localState(); shared.auth.source = 'supabase'
  assert.throws(() => changeLocalPassword(shared, oldPassword, newPassword, newPassword), /login provider/)
})

test('store self-service allows non-admin accounts and records no password in audit', async () => {
  const source = fs.readFileSync(new URL('../src/store.jsx', import.meta.url), 'utf8')
  const start = source.indexOf('    async changeOwnPassword(')
  const method = source.slice(start, source.indexOf('\n    // ---- Auth', start)).trim().replace(/,$/, '')
  const audit = source.slice(source.indexOf('function withAudit('), source.indexOf('\n}', source.indexOf('function withAudit(')) + 2)
  const stateRef = { current: localState() }
  const context = vm.createContext({ stateRef, authEpochRef: { current: 0 }, supabase: null,
    isActiveUser, matchesAccount, accountProfileFor, validatePasswordChange, changeLocalPassword, nowIST: () => '2026-10-17T00:00:00Z',
    setState: update => { stateRef.current = update(stateRef.current) },
  })
  vm.runInContext(`${audit}; const api = {${method}}; globalThis.change = api.changeOwnPassword`, context)
  await context.change(oldPassword, newPassword, newPassword)
  assert.equal(stateRef.current.users[0].pw, newPassword)
  assert.equal(stateRef.current.audit[0].action, 'Password changed')
  const evidence = JSON.stringify(stateRef.current.audit)
  assert.ok(!evidence.includes(oldPassword) && !evidence.includes(newPassword))
})

const session = { access_token: 'main-session-token', user: { id: 'auth-self', email: profile.email } }
const response = (ok, body) => ({ ok, json: async () => body })
const remote = options => changeRemotePassword({ authUrl: 'https://example.invalid/auth/v1', apiKey: 'public-key', session,
  accountId: 'auth-self', currentPassword: oldPassword, password: newPassword, confirmation: newPassword, isCurrent: () => true, ...options })

test('connected change verifies old credentials and uses the captured main session for the update', async () => {
  const calls = []
  await remote({ request: async (url, options) => {
    calls.push({ url, ...options })
    return url.includes('/token') ? response(true, { access_token: 'verification-token', user: { id: 'auth-self' } }) : response(true, {})
  } })
  assert.equal(calls.length, 3)
  assert.deepEqual(JSON.parse(calls[0].body), { email: profile.email, password: oldPassword })
  assert.equal(calls[1].headers.Authorization, 'Bearer main-session-token')
  assert.deepEqual(JSON.parse(calls[1].body), { password: newPassword, current_password: oldPassword })
  assert.match(calls[2].url, /logout\?scope=local$/)
  assert.equal(calls[2].headers.Authorization, 'Bearer verification-token')
})

test('wrong connected password never triggers an update', async () => {
  let calls = 0
  await assert.rejects(remote({ request: async () => { calls++; return response(false, { error_code: 'invalid_credentials' }) } }), /Current password is incorrect/)
  assert.equal(calls, 1)
})

test('switching accounts during verification cancels the update and cleans up its temporary token', async () => {
  const calls = []; let current = true
  await assert.rejects(remote({ isCurrent: () => current, request: async url => {
    calls.push(url); current = false
    return response(true, { access_token: 'verification-token', user: { id: 'auth-self' } })
  } }), /session changed/)
  assert.equal(calls.some(url => url.endsWith('/user')), false)
  assert.equal(calls.length, 2)
})

test('provider verification requirements and network failures return useful errors', async () => {
  await assert.rejects(remote({ request: async url => url.includes('/token')
    ? response(true, { access_token: 'verification-token', user: { id: 'auth-self' } })
    : response(false, { code: 'reauthentication_needed' }) }), /additional verification/)
  await assert.rejects(remote({ request: async () => { throw new TypeError('fetch failed') } }), /Check your connection/)
})
