import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyRuleRows } from '../src/rules.js'
import { MAX_FILE_BYTES, assertFileSize } from '../src/userFiles.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

test('Supabase rule rows override runtime config by rule family', () => {
  const config = applyRuleRows({ approvalThresholds: { valueBreak: 1 }, ownershipRules: [] }, {
    approval: [{ rule_key: 'approval-thresholds', enabled: true, definition: { thresholds: { valueBreak: 999 }, gates: [{ key: 'release', type: 'Final quote release' }] } }],
    lead: [{ rule_key: 'lead-routing-and-deadlines', enabled: true, definition: { ownershipRules: [{ region: 'North', owner: 'RS' }], leadDeadlines: { kycDays: 4 } } }],
    workflow: [{ rule_key: 'workflow-and-gates', enabled: true, definition: { requiredFields: [{ field: 'sellTo', text: 'Customer required' }] } }],
  })
  assert.equal(config.approvalThresholds.valueBreak, 999)
  assert.deepEqual(config.approvalRules, [{ key: 'release', type: 'Final quote release' }])
  assert.deepEqual(config.ownershipRules, [{ region: 'North', owner: 'RS' }])
  assert.equal(config.leadDeadlines.kycDays, 4)
  assert.deepEqual(config.workflowRequiredFields, [{ field: 'sellTo', text: 'Customer required' }])
})

test('file persistence enforces the 10 MiB client limit', () => {
  assert.doesNotThrow(() => assertFileSize({ name: 'ok.pdf', size: MAX_FILE_BYTES }))
  assert.throws(() => assertFileSize({ name: 'large.pdf', size: MAX_FILE_BYTES + 1 }), /10 MB limit/)
})

test('manual SQL migration declares BYTEA, rule tables, and owner RLS', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase/004_rules_and_user_files.sql'), 'utf8')
  assert.match(sql, /create table if not exists public\.user_files/)
  assert.match(sql, /file_data bytea not null/)
  assert.match(sql, /create table if not exists public\.workflow_rules/)
  assert.match(sql, /user_id = \(select auth\.uid\(\)\)/)
})

test('normalized business hydration uses canonical rows and consolidated state', () => {
  const datastore = fs.readFileSync(path.join(root, 'src/datastore.js'), 'utf8')
  assert.match(datastore, /from\('leads'\)\.select\('id, data, rev'\)\.is\('deleted_at', null\)/)
  assert.match(datastore, /from\('opportunities'\)\.select\('id, data, rev'\)\.is\('deleted_at', null\)/)
  assert.match(datastore, /from\('records'\)\.select\('entity, id, data, rev'\)\.is\('deleted_at', null\)/)
  assert.match(datastore, /CONSOLIDATED_STATE_ENTITY = 'state'/)
  assert.match(datastore, /LOAD_CACHE_MS = 15000/)
  assert.match(datastore, /if \(loadInFlight\) \{[\s\S]*return force \? pending\.then/)
})

test('consolidated configuration uses the records JSONB path', () => {
  const datastore = fs.readFileSync(path.join(root, 'src/datastore.js'), 'utf8')
  assert.match(datastore, /CONSOLIDATED_SETTINGS_ENTITY = 'settings'/)
  assert.match(datastore, /eq\('entity', CONSOLIDATED_SETTINGS_ENTITY\)/)
  assert.match(datastore, /saveConsolidatedConfig\(dirty\.config\)/)
  assert.match(datastore, /slices\.config = consolidatedConfig/)
  const migration = fs.readFileSync(path.join(root, 'supabase/009_consolidated_config.sql'), 'utf8')
  assert.match(migration, /insert into public\.records \(entity, id, data\)/)
  assert.match(migration, /where not exists \([\s\S]*entity = 'settings' and id = 'config'/)
})

test('price lists use one metadata record per list and one JSONB record per version', () => {
  const datastore = fs.readFileSync(path.join(root, 'src/datastore.js'), 'utf8')
  assert.match(datastore, /CONSOLIDATED_PRICE_LIST_ENTITY = 'price_lists'/)
  assert.match(datastore, /CONSOLIDATED_PRICE_VERSION_ENTITY = 'price_list_versions'/)
  assert.match(datastore, /loadConsolidatedPriceLists\(\)/)
  assert.match(datastore, /saveNormalizedRowsNow\(CONSOLIDATED_PRICE_VERSION_ENTITY, versionRows\)/)
  const migration = fs.readFileSync(path.join(root, 'supabase/010_consolidated_price_lists.sql'), 'utf8')
  assert.match(migration, /insert into public\.records \(entity, id, data\)/)
  assert.match(migration, /'price_list_versions'/)
  assert.match(migration, /'adders'/)
})

test('remaining app state moves to records without duplicating normalized slices', () => {
  const datastore = fs.readFileSync(path.join(root, 'src/datastore.js'), 'utf8')
  assert.match(datastore, /CONSOLIDATED_STATE_ENTITY = 'state'/)
  assert.match(datastore, /loadConsolidatedState\(\)/)
  assert.match(datastore, /saveConsolidatedState\(normalizedDirty\)/)
  const migration = fs.readFileSync(path.join(root, 'supabase/011_consolidate_remaining_state.sql'), 'utf8')
  assert.match(migration, /select 'state', key, value/)
  assert.match(migration, /'leads', 'opportunities', 'approvals'/)
  const edge = fs.readFileSync(path.join(root, 'supabase/functions/lead-deadlines/index.ts'), 'utf8')
  assert.match(edge, /from\('records'\)/)
  assert.doesNotMatch(edge, /from\('app_state'\)/)
})
