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

test('file persistence uses the canonical user_files table', () => {
  const userFiles = fs.readFileSync(path.join(root, 'src/userFiles.js'), 'utf8')
  assert.match(userFiles, /\.from\('user_files'\)/)
  assert.doesNotMatch(userFiles, /app_state|app_settings|workflow_rules|approval_rules|lead_rules/)
})

test('active Supabase requests use only the production table allowlist', () => {
  const allowed = new Set(['ai_secrets', 'approvals', 'leads', 'opportunities', 'records', 'user_files', 'proposals', 'spares_lines', 'clarifications', 'audit', 'settings', 'price_lists', 'price_list_versions'])
  const roots = ['src', 'api', 'supabase/functions'].map(directory => path.join(root, directory))
  const files = []
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(filename)
      else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) files.push(filename)
    }
  }
  roots.forEach(walk)
  const violations = []
  for (const filename of files) {
    const source = fs.readFileSync(filename, 'utf8')
    for (const match of source.matchAll(/\.from\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (!allowed.has(match[1])) violations.push(`${path.relative(root, filename)}: ${match[1]}`)
    }
  }
  assert.deepEqual(violations, [])
})

test('normalized business hydration uses canonical rows and consolidated state', () => {
  const datastore = fs.readFileSync(path.join(root, 'src/datastore.js'), 'utf8')
  assert.match(datastore, /from\('leads'\)\.select\('id, data, rev'\)\.is\('deleted_at', null\)/)
  assert.match(datastore, /from\('opportunities'\)\.select\('id, data, rev'\)\.is\('deleted_at', null\)/)
  assert.match(datastore, /from\('records'\)\.select\('entity, id, data, rev'\)\.is\('deleted_at', null\)/)
  assert.match(datastore, /CONSOLIDATED_STATE_ENTITY = 'state'/)
  assert.match(datastore, /LOAD_CACHE_MS = 15000/)
  assert.match(datastore, /const records = baseTables\[3\]\.data \|\| \[\]/)
  assert.doesNotMatch(datastore, /const records = tables\[3\]/)
  assert.match(datastore, /if \(loadInFlight\) \{[\s\S]*return loadInFlight/)
})

test('consolidated configuration uses the records JSONB path', () => {
  const datastore = fs.readFileSync(path.join(root, 'src/datastore.js'), 'utf8')
  assert.match(datastore, /CONSOLIDATED_SETTINGS_ENTITY = 'settings'/)
  assert.match(datastore, /dedicatedTableFor\(entity\)/)
  assert.match(datastore, /legacy records rows remain readable/)
  assert.match(datastore, /saveConsolidatedConfig\(dirty\.config\)/)
  assert.match(datastore, /slices\.config = consolidatedConfig/)
})

test('price lists use one metadata record per list and one JSONB record per version', () => {
  const datastore = fs.readFileSync(path.join(root, 'src/datastore.js'), 'utf8')
  assert.match(datastore, /CONSOLIDATED_PRICE_LIST_ENTITY = 'price_lists'/)
  assert.match(datastore, /CONSOLIDATED_PRICE_VERSION_ENTITY = 'price_list_versions'/)
  assert.match(datastore, /loadConsolidatedPriceLists\(\)/)
  assert.match(datastore, /saveNormalizedRowsNow\(CONSOLIDATED_PRICE_VERSION_ENTITY, versionRows\)/)
})

test('remaining application state uses records without duplicating normalized slices', () => {
  const datastore = fs.readFileSync(path.join(root, 'src/datastore.js'), 'utf8')
  assert.match(datastore, /CONSOLIDATED_STATE_ENTITY = 'state'/)
  assert.match(datastore, /loadConsolidatedState\(\)/)
  assert.match(datastore, /saveConsolidatedState\(normalizedDirty\)/)
  const edge = fs.readFileSync(path.join(root, 'supabase/functions/lead-deadlines/index.ts'), 'utf8')
  assert.match(edge, /from\('records'\)/)
  assert.doesNotMatch(edge, /from\('app_state'\)/)
})

test('admin user management reads profiles from records state', () => {
  const adminUsers = fs.readFileSync(path.join(root, 'api/admin-users.js'), 'utf8')
  assert.match(adminUsers, /\.from\('records'\)/)
  assert.match(adminUsers, /\.eq\('entity', 'state'\)/)
  assert.match(adminUsers, /\.eq\('id', 'users'\)/)
  assert.doesNotMatch(adminUsers, /from\('app_state'\)/)
})

test('relational workspace migration defines typed business tables and indexes', () => {
  const migration = fs.readFileSync(path.join(root, 'supabase/009_relational_workspace_data.sql'), 'utf8')
  for (const table of ['customers', 'customer_contacts', 'lead_items', 'opportunity_items', 'proposal_items', 'catalogue_versions', 'catalogue_parts', 'communications', 'audit_events', 'workspace_settings']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`))
  }
  assert.match(migration, /references public\.customers\(id\)/)
  assert.match(migration, /references public\.opportunities\(id\)/)
  assert.match(migration, /proposal_items_proposal_idx/)
  assert.match(migration, /catalogue_parts_version_part_idx/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /create policy app_select_%1\$s/)
  assert.match(migration, /alter publication supabase_realtime add table/)
  assert.match(migration, /Legacy JSONB rows remain available|legacy JSONB rows remain available/i)
})
