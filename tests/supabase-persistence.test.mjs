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
