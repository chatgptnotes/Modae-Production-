#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'
import { parseBetserWorkbook } from '../src/pipelineImport.js'
import { customersFromOpportunities } from '../src/excelLogic.js'

const root = process.cwd()
const defaultWorkbook = '/Users/ruby/Downloads/Modae production/Betser Sales Pipeline Usage.xlsx'
const workbookArg = process.argv.slice(2).find(argument => !argument.startsWith('--'))
const workbookPath = path.resolve(workbookArg || process.env.WINTRACK_PIPELINE_XLSX || defaultWorkbook)
const migrations = [
  '000_fresh_project.sql',
  '007_live_workspace_sync.sql',
  '008_dedicated_workspace_tables.sql',
  '009_relational_workspace_data.sql',
  '010_workspace_contract_verification.sql',
  '011_save_rows_lock_order.sql',
  '012_permanent_workspace_purge.sql',
  '013_railway_free_tier_security.sql',
  '014_user_presence.sql',
  '015_atomic_opportunity_sequences.sql',
  '016_workspace_generation.sql',
  '017_complete_bnk_catalogue.sql',
  '018_customer_state_repair.sql',
  '019_atomic_workbook_import.sql',
  '020_user_account_lifecycle.sql',
]
const localDir = path.join(root, '.local')
const generatedSqlPath = path.join(localDir, 'local-excel-seed.sql')
const localEnvPath = path.join(localDir, 'local-supabase.env')

const run = (command, args, options = {}) => {
  const result = execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.capture === false ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' },
  })
  return result
}

const cli = (...args) => run('supabase', args)

const json = value => JSON.stringify(value).replace(/'/g, "''")
const sqlString = value => value == null || value === '' ? 'null' : `'${String(value).replace(/'/g, "''")}'`
const sqlJson = value => `'${json(value)}'::jsonb`

export async function loadWorkbook(filename = workbookPath) {
  if (!existsSync(filename)) throw new Error(`Workbook not found: ${filename}`)
  const result = parseBetserWorkbook(await readFile(filename))
  if (result.error) throw new Error(result.error)
  return result
}

export function seedSql(opportunities, customerRows = customersFromOpportunities(opportunities), guidance = []) {
  const users = [
    { id: 'U-LOCAL-001', name: 'LJ Swaminathan', email: 'LJ.Swaminathan@mod-ae.com', role: 'LJS', roles: ['ADMIN'] },
    { id: 'U-LOCAL-002', name: 'Ashwath Hegde', email: 'Ashwath.Hegde@mod-ae.com', role: 'AH', roles: ['MANAGEMENT'] },
    { id: 'U-LOCAL-003', name: 'Ruthvik Satish', email: 'ruthvik.satish@mod-ae.com', role: 'TEAM_LEAD', roles: ['TEAM_LEAD'] },
    { id: 'U-LOCAL-004', name: 'Pragna Praveen', email: 'pragna.praveen@mod-ae.com', role: 'STANDARD_USER', roles: ['STANDARD_USER'] },
    { id: 'U-LOCAL-005', name: 'Sheetal R', email: 'sheetal.r@mod-ae.com', role: 'STANDARD_USER', roles: ['STANDARD_USER'] },
  ].map(user => ({ ...user, status: 'Active', created: new Date().toISOString().slice(0, 10) }))
  const opportunityValues = opportunities.map(row => `(${sqlString(row.id)}, ${sqlJson(row)})`).join(',\n')
  return `begin;
lock table public.opportunities, public.records, public.settings, public.audit in share row exclusive mode;

-- Existing edits win. Tombstones are never resurrected. All writes use save_rows.
select public.save_rows('opportunities', coalesce(jsonb_agg(jsonb_build_object(
  'id', incoming.id, 'data', incoming.data || coalesce((select jsonb_object_agg(key, value)
    from jsonb_each(existing.data) where value not in ('null'::jsonb, '\"\"'::jsonb, '\"—\"'::jsonb)), '{}'::jsonb),
  'rev', coalesce(existing.rev, 0), 'by', 'local-excel-bootstrap')), '[]'::jsonb))
from (values
${opportunityValues}
) as incoming(id, data)
left join public.opportunities existing on existing.id = incoming.id
where existing.deleted_at is null;

select public.save_rows('state', jsonb_build_array(jsonb_build_object(
  'id', 'customers', 'rev', coalesce((select rev from public.records where entity = 'state' and id = 'customers'), 0),
  'data', (select coalesce(jsonb_agg(data order by lower(data->>'name')), '[]'::jsonb) from (
    select distinct on (lower(trim(data->>'name'))) data from (
      select data, 0 priority from jsonb_array_elements(coalesce((select data from public.records where entity = 'state' and id = 'customers' and deleted_at is null), '[]'::jsonb)) data
      union all select data, 1 priority from jsonb_array_elements(${sqlJson(customerRows)}) data
    ) candidates order by lower(trim(data->>'name')), priority
  ) merged), 'by', 'local-excel-bootstrap')));

select public.save_rows('state', jsonb_build_array(jsonb_build_object('id', 'users', 'data', ${sqlJson(users)}, 'rev', 0, 'by', 'local-excel-bootstrap')))
where not exists (select 1 from public.records where entity = 'state' and id = 'users');

select public.save_rows('settings', jsonb_build_array(jsonb_build_object('id', 'config',
  'data', jsonb_build_object('customerClassificationGuidance', ${sqlJson(guidance)}) || coalesce((select data from public.settings where id = 'config'), '{}'::jsonb),
  'rev', coalesce((select rev from public.settings where id = 'config'), 0), 'by', 'local-excel-bootstrap')));

commit;
`
}

function parseEnv(output) {
  return Object.fromEntries(output.split(/\r?\n/).map(line => line.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(([, key, value]) => [key, value.replace(/^['"]|['"]$/g, '')]))
}

async function main() {
  const imported = await loadWorkbook()
  const { opportunities, customers, customerClassificationGuidance } = imported
  if (process.argv.includes('--dry-run')) {
    console.log(`Workbook validated: ${opportunities.filter(row => row.status === 'Open').length} open, ${opportunities.filter(row => row.status === 'Closed').length} closed, ${customers.length} customers`)
    return
  }
  await mkdir(localDir, { recursive: true })
  if (process.argv.includes('--generate-only')) {
    await writeFile(generatedSqlPath, seedSql(opportunities, customers, customerClassificationGuidance), 'utf8')
    console.log(`Generated ${path.relative(root, generatedSqlPath)} from ${opportunities.length} workbook opportunities`)
    return
  }
  if (!process.argv.includes('--skip-start')) run('supabase', ['start'], { capture: false })
  for (const migration of migrations) cli('db', 'query', '--local', '--file', path.join(root, 'supabase', migration))
  await writeFile(generatedSqlPath, seedSql(opportunities, customers, customerClassificationGuidance), 'utf8')
  cli('db', 'query', '--local', '--file', generatedSqlPath)
  const env = parseEnv(cli('status', '-o', 'env'))
  const localEnv = [
    'NODE_ENV=development', 'CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173',
    `VITE_SUPABASE_URL=${env.API_URL || 'http://127.0.0.1:54321'}`,
    `VITE_SUPABASE_ANON_KEY=${env.ANON_KEY || ''}`,
    `SUPABASE_URL=${env.API_URL || 'http://127.0.0.1:54321'}`,
    `SUPABASE_ANON_KEY=${env.ANON_KEY || ''}`,
    `SUPABASE_SERVICE_ROLE_KEY=${env.SERVICE_ROLE_KEY || ''}`,
  ].join('\n') + '\n'
  await writeFile(localEnvPath, localEnv, 'utf8')
  console.log(`Local Supabase bootstrap complete: ${opportunities.length} opportunities, ${new Set(opportunities.map(row => row.sellTo).filter(Boolean)).size} customers`)
  console.log(`Load environment: set -a; source ${path.relative(root, localEnvPath)}; set +a`)
  console.log('Then run: npm run dev')
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    console.error(`Local Supabase bootstrap failed: ${error.stack || error.message}`)
    process.exitCode = 1
  })
}
