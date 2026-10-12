import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as state from '../src/appState.js'
import { isSupabaseAuthError } from '../src/supabase.js'

test('switching layouts preserves the session and creates no shared-data changes', () => {
  const initial = { viewMode: 'full', auth: { user: { id: 'user-1' } }, audit: [{ id: 'audit-1' }], opportunities: [{ id: 'opp-1' }], role: 'LJS' }
  let current = initial
  for (const mode of ['tablet', 'full', 'tablet', 'full']) {
    current = state.selectViewMode(current, mode, 'full')
    assert.equal(current.viewMode, mode)
    assert.equal(current.viewModePinned, true)
    assert.equal(current.auth, initial.auth)
    assert.deepEqual(state.syncedOf(current), state.syncedOf(initial))
  }
  assert.equal(state.selectViewMode(current, 'invalid'), current)
})

test('permission and temporary request failures do not invalidate a signed-in session', () => {
  for (const error of [{ status: 403 }, { code: '403' }, { status: 403, code: '42501' }, { status: 403, code: 'ACCESS_DENIED' }, { status: 503 }, new Error('Failed to fetch')]) {
    assert.equal(isSupabaseAuthError(error), false, JSON.stringify(error))
  }
})

test('expired sessions and explicitly revoked workspace access still invalidate login', () => {
  for (const error of [{ status: 401 }, { code: '401' }, { code: 'JWT_EXPIRED' }, { code: 'PGRST301' }, { code: 'bad_jwt' }, { status: 403, code: 'WORKSPACE_ACCESS_REVOKED' }]) {
    assert.equal(isSupabaseAuthError(error), true, JSON.stringify(error))
  }
})

test('Phone mode remains in the topbar but is absent from the sidebar footer', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const footer = app.slice(app.indexOf('<div className="side-foot">'), app.indexOf('</aside>'))
  assert.doesNotMatch(footer, /Phone mode|setViewMode/)
  assert.match(app, /aria-label="Switch to Phone mode"/)
})
