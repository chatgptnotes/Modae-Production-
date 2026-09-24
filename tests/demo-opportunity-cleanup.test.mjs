import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const store = fs.readFileSync(new URL('../src/store.jsx', import.meta.url), 'utf8')
const files = fs.readFileSync(new URL('../src/userFiles.js', import.meta.url), 'utf8')

test('the app no longer runs the unsafe date-based opportunity cleanup', () => {
  assert.doesNotMatch(store, /ONE_TIME_OPP_CLEANUP_CUTOFF/)
  assert.doesNotMatch(store, /opportunities created before/)
})

test('real-data mode hides marked demo files', () => {
  assert.match(files, /if \(!isDemoMode\(\)\) query = query\.eq\('is_demo', false\)/)
})
