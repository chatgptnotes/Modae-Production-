import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('permanent workspace purge is server-authorized and confirmation-gated', () => {
  const api = read('api/purge-workspace.js')
  assert.match(api, /PURGE_CONFIRMATION = 'DELETE ALL LEADS AND OPPORTUNITIES'/)
  assert.match(api, /PURGE_ROLES = new Set\(\['SUPER', 'ADMIN', 'LJS'\]\)/)
  assert.match(api, /client\.auth\.getUser\(token\)/)
  assert.match(api, /client\.rpc\('purge_workspace_data'\)/)
  assert.match(api, /body\.confirmation !== PURGE_CONFIRMATION/)
  assert.doesNotMatch(api, /VITE_SUPABASE_SERVICE_ROLE_KEY/)
})

test('the purge procedure retains only price lists and required user profiles', () => {
  const migration = read('supabase/012_permanent_workspace_purge.sql')
  for (const table of ['leads', 'opportunities', 'approvals', 'proposals', 'spares_lines', 'clarifications', 'audit', 'settings', 'user_files']) {
    assert.match(migration, new RegExp(`delete from public\\.${table}`))
  }
  assert.match(migration, /entity = 'state' and id = 'users'/)
  assert.match(migration, /entity not in \('price_lists', 'price_list_versions'\)/)
  assert.match(migration, /grant execute on function public\.purge_workspace_data\(\) to service_role/)
})

test('Admin exposes a typed permanent purge and blocks further browser saves', () => {
  const admin = read('src/pages/Admin.jsx')
  const store = read('src/store.jsx')
  assert.match(admin, /Permanently delete workspace/)
  assert.match(admin, /PURGE_CONFIRMATION/)
  assert.match(admin, /Delete permanently/)
  assert.match(store, /permanentPurgeRef\.current = true/)
  assert.match(store, /if \(permanentPurgeRef\.current\) return Promise\.resolve\(\)/)
  assert.match(store, /persistLocalSnapshot\(next\)/)
})
