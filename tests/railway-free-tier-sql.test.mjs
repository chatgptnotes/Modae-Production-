import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('Railway free-tier migration removes anonymous business-data access and indexes active rows', () => {
  const sql = readFileSync(new URL('../supabase/013_railway_free_tier_security.sql', import.meta.url), 'utf8')
  for (const table of ['leads', 'opportunities', 'approvals']) {
    assert.match(sql, new RegExp(`'${table}'`))
    assert.match(sql, new RegExp(`${table}_active_updated_idx`))
  }
  assert.match(sql, /drop policy if exists app_select_%1\$s/)
  assert.match(sql, /create policy app_select_%1\$s[\s\S]*to authenticated/)
  assert.match(sql, /revoke all on function public\.save_rows\(text, jsonb\) from anon/)
  assert.match(sql, /revoke all on function public\.save_rows\(text, jsonb\) from public/)
  assert.match(sql, /grant execute on function public\.save_rows\(text, jsonb\) to authenticated, service_role/)
})
