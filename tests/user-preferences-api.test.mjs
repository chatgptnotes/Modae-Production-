import test from 'node:test'
import assert from 'node:assert/strict'
import { createUserPreferencesHandler } from '../api/user-preferences.js'
import { createWorkspaceDataHandler } from '../api/workspace-data.js'

const response = () => ({ statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value }, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } })
const defaultLayout = { sidebarCompact: false, leadDetailsCollapsed: false }
function fixture() {
  const id = '18a1eae5-442c-437e-8934-9874442abe67'
  const profile = { id: 'legacy-sales', authId: id, email: 'sales@example.com', status: 'Active', roles: ['STANDARD_USER'] }
  const records = [{ entity: 'state', id: 'users', data: [profile], rev: 1 }, { entity: 'user_preferences', id: 'other-user', data: { font: 'system' }, rev: 9 }]
  const calls = []
  const client = {
    auth: { async getUser(token) { return token === 'valid' ? { data: { user: { id, email: profile.email } } } : { error: new Error('invalid') } } },
    from(table) {
      assert.equal(table, 'records')
      let selected = records
      const q = { select() { return q }, eq(key, value) { selected = selected.filter(row => row[key] === value); return q },
        is(key, value) { selected = selected.filter(row => (row[key] ?? null) === value); return q },
        maybeSingle: async () => ({ data: selected[0] || null }), then(resolve, reject) { return Promise.resolve({ data: selected }).then(resolve, reject) } }
      return q
    },
    async rpc(name, args) {
      calls.push({ name, args })
      if (client.rpcError) return { error: client.rpcError }
      if (client.race) return { data: { accepted: [], conflicts: [{ id, data: { font: 'system' }, rev: 2 }] } }
      const row = args.p_rows[0]
      const previous = records.find(item => item.entity === args.p_entity && item.id === row.id)
      if (previous && previous.rev !== row.rev) return { data: { accepted: [], conflicts: [previous] } }
      const saved = { entity: args.p_entity, id: row.id, data: row.data, rev: row.rev + 1 }
      if (previous) Object.assign(previous, saved); else records.push(saved)
      return { data: { accepted: [row.id], conflicts: [] } }
    },
  }
  const handler = createUserPreferencesHandler({ getClient: () => client })
  const request = (method = 'GET', body, token = 'valid') => ({ method, body, headers: { authorization: token ? `Bearer ${token}` : '' }, query: { id: 'other-user' } })
  const run = async (...args) => { const res = response(); await handler(request(...args), res); return res }
  return { id, profile, records, calls, client, request, run }
}

test('active standard users read defaults and save only their authenticated UUID', async () => {
  const f = fixture()
  const initial = await f.run()
  assert.deepEqual(initial.body, { font: 'candara', ...defaultLayout, rev: 0 })
  assert.equal(initial.headers['Cache-Control'], 'private, no-store')
  for (const [rev, font] of ['inter', 'system', 'candara', 'roboto', 'open-sans', 'merriweather', 'lora'].entries()) {
    const saved = await f.run('PUT', { font, rev })
    assert.equal(saved.statusCode, 200)
    assert.deepEqual(saved.body, { font, ...defaultLayout, rev: rev + 1 })
    assert.deepEqual((await f.run()).body, saved.body)
  }
  assert.deepEqual(f.calls[0], { name: 'save_rows', args: { p_entity: 'user_preferences', p_rows: [{ id: f.id, rev: 0, data: { font: 'inter', ...defaultLayout }, by: f.id }] } })
  assert.equal(f.records.find(row => row.id === 'other-user').rev, 9)
})

test('missing or expired authentication and inactive accounts cannot read or write preferences', async () => {
  const f = fixture()
  for (const method of ['GET', 'PUT']) {
    for (const token of ['', 'expired']) assert.equal((await f.run(method, { font: 'inter', rev: 0 }, token)).statusCode, 401)
    for (const patch of [{ status: 'Suspended' }, { status: 'Deleted' }, { deletionPendingAt: 'now' }, { accessPending: true }]) {
      Object.assign(f.profile, { status: 'Active', deletionPendingAt: null, accessPending: false }, patch)
      const denied = await f.run(method, { font: 'inter', rev: 0 })
      assert.equal(denied.statusCode, 403)
      assert.equal(denied.headers['Cache-Control'], 'private, no-store')
    }
    Object.assign(f.profile, { status: 'Active', deletionPendingAt: null, accessPending: false })
  }
  assert.equal(f.calls.length, 0)
})

test('preference writes reject invalid fonts, revisions and extra properties', async () => {
  const f = fixture()
  for (const body of [null, [], {}, { font: 'Inter', rev: 0 }, { font: 'inter', rev: -1 }, { font: 'inter', rev: 1.5 }, { font: 'inter', rev: '0' }, { font: 'inter', rev: Number.MAX_SAFE_INTEGER }, { font: 'inter', rev: 0, id: 'other-user' }, { font: 'inter', rev: 0, data: {} }]) {
    assert.equal((await f.run('PUT', body)).statusCode, 400)
  }
  assert.equal(f.calls.length, 0)
  assert.equal((await f.run('POST', { font: 'inter', rev: 0 })).statusCode, 405)
})

test('stale drafts and racing writes return conflicts without overwriting the winning choice', async () => {
  const f = fixture()
  assert.equal((await f.run('PUT', { font: 'inter', rev: 5 })).statusCode, 409)
  assert.equal(f.calls.length, 0)
  await f.run('PUT', { font: 'inter', rev: 0 })
  assert.equal((await f.run('PUT', { font: 'system', rev: 0 })).statusCode, 409)
  assert.deepEqual((await f.run()).body, { font: 'inter', ...defaultLayout, rev: 1 })
  f.client.race = true
  assert.equal((await f.run('PUT', { font: 'candara', rev: 1 })).statusCode, 409)
})

test('database failures are reported without leaking server details', async () => {
  const f = fixture()
  f.client.rpcError = { message: 'secret service connection details' }
  const result = await f.run('PUT', { font: 'inter', rev: 0 })
  assert.equal(result.statusCode, 503)
  assert.doesNotMatch(JSON.stringify(result.body), /secret/)
})

test('sidebar preferences save independently and font-only clients preserve both choices', async () => {
  const f = fixture()
  assert.equal((await f.run('PUT', { sidebarCompact: true, rev: 0 })).statusCode, 200)
  assert.equal((await f.run('PUT', { leadDetailsCollapsed: true, rev: 1 })).statusCode, 200)
  await f.run('PUT', { font: 'inter', rev: 2 })
  assert.deepEqual((await f.run()).body, { font: 'inter', sidebarCompact: true, leadDetailsCollapsed: true, rev: 3 })
  await f.run('PUT', { sidebarCompact: false, rev: 3 })
  assert.deepEqual((await f.run()).body, { font: 'inter', sidebarCompact: false, leadDetailsCollapsed: true, rev: 4 })
  assert.equal(f.records.find(row => row.id === 'other-user').rev, 9)
})

test('sidebar writes reject non-booleans and stale revisions', async () => {
  const f = fixture()
  for (const body of [{ sidebarCompact: 'true', rev: 0 }, { leadDetailsCollapsed: 1, rev: 0 }, { rev: 0 }]) {
    assert.equal((await f.run('PUT', body)).statusCode, 400)
  }
  await f.run('PUT', { leadDetailsCollapsed: true, rev: 0 })
  assert.equal((await f.run('PUT', { sidebarCompact: true, rev: 0 })).statusCode, 409)
  assert.equal((await f.run()).body.leadDetailsCollapsed, true)
})

test('generic workspace reads and writes cannot expose or alter personal preferences, including for admins', async () => {
  const f = fixture()
  f.profile.roles = ['ADMIN']
  const handler = createWorkspaceDataHandler({ getClient: () => f.client, getReader: () => async () => ({ users: [f.profile], config: {}, workspaceGeneration: 0 }) })
  for (const filters of [[], [['eq', 'entity', 'user_preferences']]]) {
    const res = response()
    await handler(f.request('POST', { operation: 'select', table: 'records', filters }), res)
    assert.equal(res.statusCode, 200)
    assert.ok(res.body.data.every(row => row.entity !== 'user_preferences'))
  }
  const denied = response()
  await handler(f.request('POST', { operation: 'rpc', name: 'save_rows', args: { p_entity: 'user_preferences', p_rows: [{ id: 'other-user', rev: 9, data: { font: 'inter' } }] } }), denied)
  assert.equal(denied.statusCode, 400)
  assert.equal(f.calls.length, 0)
})
