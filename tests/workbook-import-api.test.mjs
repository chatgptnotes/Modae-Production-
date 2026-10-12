import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkbookImportHandler } from '../api/workbook-import.js'

function clientFixture(role = 'ADMIN') {
  const tables = { records: [{ entity: 'state', id: 'users', rev: 1, data: [{ email: 'admin@example.com', role, status: 'Active' }] }, { entity: 'state', id: 'customers', rev: 2, data: [{ name: 'Acme', status: 'Red' }] }], opportunities: [{ id: 'existing', rev: 3, data: { id: 'existing', oppName: 'Edited' }, deleted_at: null }, { id: 'deleted', rev: 2, data: { id: 'deleted' }, deleted_at: '2026-01-01' }], settings: [] }
  const writes = []
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'actor', email: 'admin@example.com' } } }) }, from(table) { return { select: async () => ({ data: tables[table], error: null }) } }, rpc: async (name, args) => { writes.push({ name, ...args }); return { data: { conflicts: [] }, error: null } } }
  return { client, writes, tables }
}
const payload = { opportunities: [{ id: 'existing', oppName: 'Excel' }, { id: 'new', status: 'Closed', stage: 'Won' }, { id: 'deleted' }], customers: [{ name: 'Acme', status: 'Green' }, { name: 'Beta', status: 'Blue' }] }
async function request(handler, body, token = 'token') {
  let status; let result
  const res = { status(code) { status = code; return this }, json(value) { result = value; return this } }
  await handler({ method: 'POST', headers: { authorization: token ? `Bearer ${token}` : '' }, body }, res)
  return { status, result }
}
test('import requires a real admin and preview does not write', async () => {
  const f = clientFixture('STANDARD_USER'); const handler = createWorkbookImportHandler(() => f.client)
  assert.equal((await request(handler, { action: 'preview', importData: payload }, '')).status, 401)
  assert.equal((await request(handler, { action: 'preview', importData: payload })).status, 403)
  assert.equal(f.writes.length, 0)
})
test('reviewed import preserves edits and tombstones using revision-aware RPCs', async () => {
  const f = clientFixture(); const handler = createWorkbookImportHandler(() => f.client)
  const preview = await request(handler, { action: 'preview', importData: payload })
  assert.equal(preview.status, 200); assert.equal(f.writes.length, 0)
  const saved = await request(handler, { action: 'commit', importData: payload, reviewToken: preview.result.reviewToken })
  assert.equal(saved.status, 200)
  assert.equal(f.writes.length, 1)
  assert.equal(f.writes[0].name, 'import_workbook_rows')
  const rows = f.writes[0].p_batches.find(w => w.entity === 'opportunities').rows
  assert.ok(!rows.some(r => r.id === 'deleted'))
  assert.ok(!rows.some(r => r.id === 'existing'))
  assert.equal(rows.find(r => r.id === 'new').rev, 0)
  assert.equal(f.writes[0].p_batches.find(w => w.entity === 'state').rows[0].rev, 2)
})
test('a deletion during commit fails atomically and asks for a new preview', async () => {
  const f = clientFixture(); const handler = createWorkbookImportHandler(() => f.client)
  const preview = await request(handler, { action: 'preview', importData: payload })
  f.client.rpc = async () => ({ error: { code: '40001', message: 'workspace changed' } })
  const result = await request(handler, { action: 'commit', importData: payload, reviewToken: preview.result.reviewToken })
  assert.equal(result.status, 409)
  assert.match(result.result.error, /Nothing was imported/)
})
test('changed workspace invalidates the review before any write', async () => {
  const f = clientFixture(); const handler = createWorkbookImportHandler(() => f.client)
  const preview = await request(handler, { action: 'preview', importData: payload })
  f.tables.opportunities[0].rev++
  assert.equal((await request(handler, { action: 'commit', importData: payload, reviewToken: preview.result.reviewToken })).status, 409)
  assert.equal(f.writes.length, 0)
})
