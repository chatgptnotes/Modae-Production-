import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('document workflows render a persistent scan progress surface', () => {
  const progress = read('src/ScanProgress.jsx')
  const tender = read('src/pages/TenderIntake.jsx')
  const inbox = read('src/pages/Inbox.jsx')
  assert.match(progress, /aria-live="polite"/)
  assert.match(progress, /scan-progress-stages/)
  assert.match(tender, /<ScanProgress title="Scanning tender"/)
  assert.match(inbox, /<ScanProgress title=\{`Scanning \$\{item\}`\}/)
})

test('Supabase persistence failures retain operation diagnostics and the active contract migration', () => {
  const supabase = read('src/supabase.js')
  const files = read('src/userFiles.js')
  const datastore = read('src/datastore.js')
  const migration = read('supabase/010_workspace_contract_verification.sql')
  assert.match(supabase, /export const describeSupabaseError/)
  assert.match(files, /user_files\.\$\{operation\}/)
  assert.match(datastore, /save_rows\.\$\{entity\}/)
  assert.match(migration, /to_regclass\('public\.user_files'\)/)
  assert.match(migration, /to_regprocedure\('public\.save_rows\(text,jsonb\)'\)/)
})
