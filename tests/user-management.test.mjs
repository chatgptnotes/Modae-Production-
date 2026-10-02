import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

test('user management exposes account creation and password reset controls', () => {
  const page = read('src/pages/Users.jsx')
  assert.match(page, /Create account/)
  assert.match(page, /User ID \/ email/)
  assert.match(page, /Confirm password/)
  assert.match(page, /Reset password/)
  assert.match(page, /Provision missing accounts/)
  assert.match(page, /Demo@1234/)
  assert.match(page, /Supabase Auth/)
  assert.match(page, /authStatus/)
  assert.match(page, /\/api\/admin-users/)
  assert.match(page, /store\.addUser\(/)
  assert.match(read('src/store.jsx'), /safePatch/)
  assert.match(read('src/store.jsx'), /key === 'pw' \? '\[redacted\]'/)
})

test('admin user API provisions through server-only Supabase credentials', () => {
  const api = read('api/admin-users.js')
  assert.match(read('api/_supabase-client.js'), /SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(api, /VITE_SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(api, /auth\.admin\.createUser/)
  assert.match(api, /auth\.admin\.updateUserById/)
  assert.match(api, /action === 'update'/)
  assert.match(api, /action === 'status'/)
  assert.match(api, /action === 'provision'/)
  assert.match(api, /PROVISIONABLE_ROLES/)
  assert.match(api, /Bulk Supabase Auth provisioning failed/)
  assert.match(api, /Could not check Supabase Auth accounts/)
  assert.match(api, /Only application administrators can manage user accounts/)
  assert.doesNotMatch(api, /return res\.status\([^)]*\)\.json\(\{[^}]*password\s*:/s)
})

test('server deployment documentation keeps the service key server-side', () => {
  const env = read('.env.example')
  const deploy = read('DEPLOYMENT.md')
  assert.match(env, /VITE_SUPABASE_URL=/)
  assert.match(env, /VITE_SUPABASE_ANON_KEY=/)
  assert.match(env, /SUPABASE_SERVICE_ROLE_KEY=/)
  assert.match(deploy, /Railway staging service variables/)
  assert.match(deploy, /SUPABASE_SERVICE_ROLE_KEY=/)
  assert.match(env, /Never put real secrets in this file or prefix them with VITE_/)
})
