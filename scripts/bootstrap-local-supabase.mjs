#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'
import ExcelJS from 'exceljs'

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

const valueOf = value => {
  if (value && typeof value === 'object' && 'result' in value) return value.result
  if (value && typeof value === 'object' && 'text' in value) return value.text
  return value
}

const textOf = value => {
  const resolved = valueOf(value)
  if (resolved instanceof Date) return resolved.toISOString().slice(0, 10)
  return resolved == null ? null : String(resolved).trim()
}

const numberOf = value => {
  const raw = valueOf(value)
  if (raw == null || raw === '') return null
  const number = Number(raw)
  return Number.isFinite(number) ? number : null
}

const booleanOf = value => {
  const raw = textOf(value)
  if (!raw) return false
  return ['true', 'yes', 'y', '1'].includes(raw.toLowerCase())
}

const rowValues = row => Array.from(row.values.slice(1), valueOf)
const headers = worksheet => rowValues(worksheet.getRow(1)).map(value => textOf(value) || '')
const records = worksheet => {
  const names = headers(worksheet)
  return Array.from({ length: Math.max(0, worksheet.rowCount - 1) }, (_, index) => {
    const values = rowValues(worksheet.getRow(index + 2))
    return Object.fromEntries(names.map((name, column) => [name, values[column]]))
  })
}
const pick = (row, ...names) => {
  const wanted = new Set(names.map(name => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()))
  const entry = Object.entries(row).find(([key]) => wanted.has(key.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()))
  return entry?.[1]
}
const clean = value => textOf(value)?.replace(/\s+/g, ' ').trim() || null
const json = value => JSON.stringify(value).replace(/'/g, "''")
const sqlString = value => value == null || value === '' ? 'null' : `'${String(value).replace(/'/g, "''")}'`
const sqlJson = value => `'${json(value)}'::jsonb`
const sqlNumber = value => value == null ? 'null' : String(value)
const routeFor = type => type === 'Spares' ? 'Spares' : type === 'Service' ? 'Service' : 'Project'
const milestoneFor = (status, stage) => {
  if (status === 'Closed') return stage === 'Lost' ? 'Follow-up' : 'Screening'
  if (stage === 'RFQ') return 'Sourcing'
  if (stage === 'RFI') return 'Clarification'
  return 'Proposal'
}

function currentOpportunity(row, sourceSheet) {
  const id = clean(pick(row, 'Opp ID'))
  if (!id || clean(pick(row, 'Status*', 'Status')) !== 'Open') return null
  const oppType = clean(pick(row, 'Opp Type*', 'Opp Type')) || 'Project'
  const status = clean(pick(row, 'Status*', 'Status')) || 'Open'
  const stage = clean(pick(row, 'Stage*', 'Stage')) || 'Lead'
  const remarks = clean(pick(row, 'Update/Remarks', 'Remarks'))
  return {
    id, sl: numberOf(pick(row, 'Sl.')), oppName: clean(pick(row, 'Oppurtunity Name/Description*', 'Opportunity Name/Description')) || clean(pick(row, 'Sell To Customer*', 'Sell To Customer')) || id,
    sellTo: clean(pick(row, 'Sell To Customer*', 'Sell To Customer')), category: clean(pick(row, 'Category*', 'Category')),
    location: clean(pick(row, 'Location')), customerStatus: clean(pick(row, 'Customer Status')),
    eucName: clean(pick(row, 'EUC Name*', 'End User Customer')), eucLocation: clean(pick(row, 'EUC Location', 'EU Location')),
    owner: clean(pick(row, 'LJS', 'Owner')), oppType, bu: clean(pick(row, 'BU*', 'BU')), segment: clean(pick(row, 'Segment')),
    product: clean(pick(row, 'Product*', 'Product')), prob: clean(pick(row, 'Prob (%)*', 'Prob (%)')),
    valueK: numberOf(pick(row, 'Value (K₹)*', 'Value (K₹)')), cogsK: numberOf(pick(row, 'COGS (K₹)*', 'COGS (K₹)')),
    gmK: numberOf(pick(row, 'GM (K₹)')), gmPct: numberOf(pick(row, 'GM%')),
    createDate: textOf(pick(row, 'Create Date*', 'Offer Date')), proposalDate: textOf(pick(row, 'Proposal Date')),
    orderDate: textOf(pick(row, 'Order Date*', 'EDD/ADD')), fqFy: clean(pick(row, 'FQ-FY')),
    invoiceDate: textOf(pick(row, 'Invoice Date*', 'Invoice Date')), status, stage,
    closedReason: clean(pick(row, 'Closed Reason*', 'Closed Reason')), contactPerson: clean(pick(row, 'Contact Person*', 'Contact Person')),
    contactPhone: clean(pick(row, 'Contact Phone #*', 'Contact Phone #')), lastUpdated: textOf(pick(row, 'Last Updated', 'Updated On')),
    forecast: booleanOf(pick(row, 'Forecast')), remarks, updateRemarks: remarks, route: routeFor(oppType), context: routeFor(oppType) === 'Spares' ? 'Brownfield' : 'Greenfield',
    milestone: milestoneFor(status, stage), importedFrom: `Betser Sales Pipeline Usage.xlsx / ${sourceSheet}`, legacyOppRefId: null, sourceSheet,
  }
}

function oldOpportunity(row, sourceSheet) {
  const id = clean(pick(row, 'New Opp ID'))
  if (!id) return null
  const oppType = clean(pick(row, 'Opp Type')) || 'Project'
  const status = 'Closed'
  const stage = clean(pick(row, 'Stage')) || 'Lost'
  const remarks = clean(pick(row, 'Update/Remarks'))
  return {
    id, oppName: clean(pick(row, 'Oppurtunity/Project Name & Description')) || clean(pick(row, 'Sell To Customer')) || id,
    sellTo: clean(pick(row, 'Sell To Customer')), category: clean(pick(row, 'Category')), location: clean(pick(row, 'Location')),
    customerStatus: null, eucName: clean(pick(row, 'End User Customer')), eucLocation: clean(pick(row, 'EU Location')),
    owner: clean(pick(row, 'Owner')), oppType, bu: null, segment: null, product: clean(pick(row, 'Product')),
    prob: clean(pick(row, 'Prob (%)')), valueK: numberOf(pick(row, 'Value (K₹)')), cogsK: numberOf(pick(row, 'COGS (K₹)')),
    gmK: numberOf(pick(row, 'GM (K₹)')), gmPct: numberOf(pick(row, 'GM%')), createDate: textOf(pick(row, 'Offer Date')),
    proposalDate: null, orderDate: null, fqFy: null, invoiceDate: null, status, stage, closedReason: clean(pick(row, 'Closed Reason')),
    contactPerson: clean(pick(row, 'Contact Person')), contactPhone: clean(pick(row, 'Contact Phone #')), lastUpdated: textOf(pick(row, 'Updated On')),
    forecast: booleanOf(pick(row, 'Forecast')), remarks, updateRemarks: remarks, route: routeFor(oppType), context: routeFor(oppType) === 'Spares' ? 'Brownfield' : 'Greenfield',
    milestone: milestoneFor(status, stage), importedFrom: `Betser Sales Pipeline Usage.xlsx / ${sourceSheet}`, legacyOppRefId: clean(pick(row, 'Opp. Ref. ID')), sourceSheet,
  }
}

async function loadWorkbook() {
  if (!existsSync(workbookPath)) throw new Error(`Workbook not found: ${workbookPath}`)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(workbookPath)
  const current = records(workbook.getWorksheet('Current Opps')).map(row => currentOpportunity(row, 'Current Opps')).filter(Boolean)
  const old = records(workbook.getWorksheet('Old Closed Opps')).map(row => oldOpportunity(row, 'Old Closed Opps')).filter(Boolean)
  const rows = [...current, ...old]
  const ids = new Set()
  if (rows.some(row => ids.has(row.id))) throw new Error('Workbook contains duplicate opportunity IDs')
  rows.forEach(row => ids.add(row.id))
  if (current.length !== 9 || old.length !== 33) throw new Error(`Unexpected workbook counts: ${current.length} open, ${old.length} old closed`)
  return rows
}

export function seedSql(opportunities) {
  const customers = new Map()
  for (const opportunity of opportunities) {
    const name = clean(opportunity.sellTo)
    if (!name || customers.has(name.toLowerCase())) continue
    customers.set(name.toLowerCase(), {
      id: `CUST-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.replace(/-+/g, '-').replace(/^-|-$/g, ''),
      name,
      category: opportunity.category,
      status: opportunity.customerStatus || 'Blue',
    })
  }
  const users = [
    { id: 'U-LOCAL-001', name: 'LJ Swaminathan', email: 'LJ.Swaminathan@mod-ae.com', role: 'LJS', roles: ['ADMIN'] },
    { id: 'U-LOCAL-002', name: 'Ashwath Hegde', email: 'Ashwath.Hegde@mod-ae.com', role: 'AH', roles: ['MANAGEMENT'] },
    { id: 'U-LOCAL-003', name: 'Ruthvik Satish', email: 'ruthvik.satish@mod-ae.com', role: 'TEAM_LEAD', roles: ['TEAM_LEAD'] },
    { id: 'U-LOCAL-004', name: 'Pragna Praveen', email: 'pragna.praveen@mod-ae.com', role: 'STANDARD_USER', roles: ['STANDARD_USER'] },
    { id: 'U-LOCAL-005', name: 'Sheetal R', email: 'sheetal.r@mod-ae.com', role: 'STANDARD_USER', roles: ['STANDARD_USER'] },
  ].map(user => ({ ...user, status: 'Active', created: new Date().toISOString().slice(0, 10) }))
  const opportunityValues = opportunities.map(row => `(${sqlString(row.id)}, ${sqlJson(row)})`).join(',\n')
  const customerValues = [...customers.values()].map(customer => {
    const data = { ...customer, kyc: 'Pending', payment: '—', email: `purchase@${customer.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}.example.in`, source: 'Betser Sales Pipeline Usage.xlsx' }
    return `(${sqlString(customer.id)}, ${sqlJson(data)}, ${sqlString(customer.name)}, ${sqlString(customer.category)}, ${sqlString(customer.status)})`
  }).join(',\n')
  return `begin;

insert into public.opportunities (id, data, rev, updated_at, updated_by, deleted_at)
values
${opportunityValues}
on conflict (id) do update set data = excluded.data, rev = public.opportunities.rev + 1, updated_at = now(), updated_by = excluded.updated_by, deleted_at = null;

insert into public.records (entity, id, data, rev, updated_at, updated_by, deleted_at)
values ('state', 'users', ${sqlJson(users)}, 1, now(), 'local-excel-bootstrap', null)
on conflict (entity, id) do update set data = excluded.data, rev = public.records.rev + 1, updated_at = now(), updated_by = excluded.updated_by, deleted_at = null;

insert into public.records (entity, id, data, rev, updated_at, updated_by, deleted_at)
values ('state', 'customers', (select jsonb_agg(data order by lower(data->>'name')) from (values
${customerValues}
) as imported(id, data, name, category, status)), 1, now(), 'local-excel-bootstrap', null)
on conflict (entity, id) do update set data = excluded.data, rev = public.records.rev + 1, updated_at = now(), updated_by = excluded.updated_by, deleted_at = null;

insert into public.customers (id, name, customer_class, kyc_status, metadata, rev, updated_at, updated_by, deleted_at)
select 'customer:' || md5(lower(name)), name, category, status, jsonb_build_object('source', 'Betser Sales Pipeline Usage.xlsx'), 1, now(), 'local-excel-bootstrap', null
from (values
${customerValues}
) as imported(id, data, name, category, status)
on conflict (id) do update set name = excluded.name, customer_class = excluded.customer_class, kyc_status = excluded.kyc_status, metadata = excluded.metadata, rev = public.customers.rev + 1, updated_at = now(), updated_by = excluded.updated_by, deleted_at = null;

commit;
`
}

function parseEnv(output) {
  return Object.fromEntries(output.split(/\r?\n/).map(line => line.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(([, key, value]) => [key, value.replace(/^['"]|['"]$/g, '')]))
}

async function main() {
  const opportunities = await loadWorkbook()
  if (process.argv.includes('--dry-run')) {
    console.log(`Workbook validated: ${opportunities.filter(row => row.status === 'Open').length} open, ${opportunities.filter(row => row.status === 'Closed').length} old closed, ${new Set(opportunities.map(row => row.sellTo).filter(Boolean)).size} customers`)
    return
  }
  await mkdir(localDir, { recursive: true })
  if (process.argv.includes('--generate-only')) {
    await writeFile(generatedSqlPath, seedSql(opportunities), 'utf8')
    console.log(`Generated ${path.relative(root, generatedSqlPath)} from ${opportunities.length} workbook opportunities`)
    return
  }
  if (!process.argv.includes('--skip-start')) run('supabase', ['start'], { capture: false })
  for (const migration of migrations) cli('db', 'query', '--local', '--file', path.join(root, 'supabase', migration))
  await writeFile(generatedSqlPath, seedSql(opportunities), 'utf8')
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
