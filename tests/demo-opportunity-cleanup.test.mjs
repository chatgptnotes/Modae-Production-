import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const sql = fs.readFileSync(new URL('../supabase/008_remove_demo_opportunities.sql', import.meta.url), 'utf8')
const store = fs.readFileSync(new URL('../src/store.jsx', import.meta.url), 'utf8')
const files = fs.readFileSync(new URL('../src/userFiles.js', import.meta.url), 'utf8')

test('demo opportunity cleanup is marker-based and recoverable', () => {
  assert.match(sql, /do \$\$[\s\S]*demo_ids text\[\]/)
  assert.doesNotMatch(sql, /create temporary table demo_opportunity_cleanup/)
  assert.match(sql, /data->>'simulated' = 'true'/)
  assert.match(sql, /data::text ilike '%demo%'/)
  assert.match(sql, /set deleted_at = coalesce\(o\.deleted_at, now\(\)\)/)
  assert.match(sql, /jsonb_array_elements\(s\.value\)/)
  assert.doesNotMatch(sql, /delete from public\.opportunities/i)
  assert.match(sql, /insert into public\.app_settings[\s\S]*'demoData', 'false'/)
})

test('the app no longer runs the unsafe date-based opportunity cleanup', () => {
  assert.doesNotMatch(store, /ONE_TIME_OPP_CLEANUP_CUTOFF/)
  assert.doesNotMatch(store, /opportunities created before/)
})

test('real-data mode hides marked demo files', () => {
  assert.match(files, /if \(!isDemoMode\(\)\) query = query\.eq\('is_demo', false\)/)
})
