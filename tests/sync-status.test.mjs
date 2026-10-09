import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
test('parts workspace recognizes the browser-only sync status', () => {
  const source = fs.readFileSync(new URL('../src/workbench/WbSpares.jsx', import.meta.url), 'utf8')
  assert.match(source, /localOnly=\{store\.auth\?\.source === 'local-demo' \|\| store\.liveSyncStatus === 'local-only'\}/)
})
test('local demo login cannot inherit a failed shared database status', async () => {
  const { workspaceSyncStatus } = await import('../src/syncStatus.js')
  assert.equal(workspaceSyncStatus({ status: 'error', enabled: false, localDemo: true }), 'local-only')
  assert.equal(workspaceSyncStatus({ status: 'auth-error', enabled: false, localDemo: true }), 'local-only')
  assert.equal(workspaceSyncStatus({ status: 'error', enabled: true }), 'error')
  assert.equal(workspaceSyncStatus({ status: 'live', enabled: false, configError: 'mismatch' }), 'config-error')
  assert.equal(workspaceSyncStatus({ status: 'connecting', enabled: false }), 'local-only')
})
