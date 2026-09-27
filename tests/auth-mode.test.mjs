import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isLocalhost,
  canUseLocalDemoAuth,
  isLocalDemoAuthError,
} from '../src/authMode.js'

test('local demo auth is allowed only on localhost hosts', () => {
  assert.equal(isLocalhost('localhost'), true)
  assert.equal(isLocalhost('127.0.0.1'), true)
  assert.equal(isLocalhost('[::1]'), true)
  assert.equal(isLocalhost('modae.example.com'), false)
  assert.equal(isLocalhost('localhost.example.com'), false)
})

test('local demo fallback requires localhost and a Supabase invalid-credentials error', () => {
  assert.equal(canUseLocalDemoAuth('localhost', true, { code: 'invalid_credentials' }), true)
  assert.equal(canUseLocalDemoAuth('localhost', true, { status: 400, message: 'Invalid login credentials' }), true)
  assert.equal(canUseLocalDemoAuth('localhost', true, { status: 500 }), false)
  assert.equal(canUseLocalDemoAuth('app.example.com', true, { code: 'invalid_credentials' }), false)
  assert.equal(canUseLocalDemoAuth('localhost', false, { code: 'invalid_credentials' }), false)
})

test('local demo auth errors are recognized without weakening other errors', () => {
  assert.equal(isLocalDemoAuthError({ code: 'invalid_credentials' }), true)
  assert.equal(isLocalDemoAuthError({ status: 400, message: 'Invalid login credentials' }), true)
  assert.equal(isLocalDemoAuthError({ code: 'email_not_confirmed' }), false)
  assert.equal(isLocalDemoAuthError({ status: 500 }), false)
})
