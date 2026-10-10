import test from 'node:test'
import assert from 'node:assert/strict'
import { seedSql } from '../scripts/bootstrap-local-supabase.mjs'

test('local Supabase seed writes customers into the consolidated state slice', () => {
  const sql = seedSql([
    { id: 'OPP-1', sellTo: 'Acme Power', category: 'EUC', customerStatus: 'Blue', status: 'Open' },
    { id: 'OPP-2', sellTo: 'Beta Pumps', category: 'OEM', customerStatus: null, status: 'Closed' },
  ])

  assert.match(sql, /values \('state', 'customers',/)
  assert.doesNotMatch(sql, /select 'customers', 'customer:' \|\| md5/) 
  assert.match(sql, /insert into public\.customers/)
})
