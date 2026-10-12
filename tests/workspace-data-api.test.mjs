import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspaceDataHandler } from '../api/workspace-data.js'
import { createAdminPolicyHandler } from '../api/admin-policy.js'
import { defaultAccessPolicy } from '../src/accessPolicy.js'
import { DEFAULT_OPPORTUNITY_NUMBERING } from '../src/opportunityNumbering.js'

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } })
function fixture(role = 'STANDARD_USER') {
  const profile = { id: 'u', authId: 'u', email: 'test@example.com', status: 'Active', role: 'RS', roles: [role] }
  const config = { accessPolicy: defaultAccessPolicy(), opportunityNumbering: { ...DEFAULT_OPPORTUNITY_NUMBERING } }
  const state = { config, workspaceGeneration: 0, users: [profile], opportunities: [{ id: 'O1', owner: 'AH', value: 999, oppName: 'Shared opportunity' }], leads: [], approvals: [] }
  const database = { records: [{ entity: 'state', id: 'users', data: [profile], rev: 1 }],
    settings: [{ id: 'config', data: config, rev: 3 }], opportunities: state.opportunities.map(data => ({ id: data.id, data, rev: 1 })) }
  const calls = []
  const reads = { auth: 0, workspace: 0 }
  const client = {
    auth: { getUser: async token => { reads.auth++; return token === 'valid' ? { data: { user: { id: 'u', email: profile.email } } } : { error: new Error('expired') } } },
    from(table) {
      let selected = database[table] || []
      const query = { select() { return query }, eq(key, value) { selected = selected.filter(row => row[key] === value); return query },
        is(key, value) { selected = selected.filter(row => (row[key] ?? null) === value); return query },
        in(key, values) { selected = selected.filter(row => values.includes(row[key])); return query },
        maybeSingle() { return Promise.resolve({ data: selected[0] || null }) },
        then(resolve, reject) { return Promise.resolve({ data: selected }).then(resolve, reject) } }
      return query
    },
    async rpc(name, args) { calls.push({ name, args }); return { data: { accepted: args.p_rows?.map(row => row.id) || [], conflicts: [] } } },
  }
  const request = body => ({ method: 'POST', headers: { authorization: 'Bearer valid', 'x-workspace-generation': '0' }, body })
  return { profile, config, state, client, database, calls, reads, request, handler: createWorkspaceDataHandler({ getClient: () => client, getReader: () => async () => { reads.workspace++; return state } }) }
}
test('parallel reads share one authorization and workspace read without exposing protected fields', async () => {
  const f = fixture(), res = response()
  await f.handler(f.request({ operation: 'select_many', queries: Array.from({ length: 9 }, () => ({ operation: 'select', table: 'opportunities', filters: [] })) }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.results.length, 9)
  assert.deepEqual(f.reads, { auth: 1, workspace: 1 })
  for (const result of res.body.results) {
    assert.equal(result.data[0].data.value, undefined)
    assert.equal(result.data[0].data.oppName, 'Shared opportunity')
  }
  f.profile.status = 'Disabled'
  const denied = response()
  await f.handler(f.request({ operation: 'select_many', queries: [{ operation: 'select', table: 'opportunities', filters: [] }] }), denied)
  assert.equal(denied.statusCode, 403)
})
test('read batches reject writes, forbidden tables and oversized batches before executing any query', async () => {
  const f = fixture('ADMIN')
  for (const queries of [[], Array(21).fill({ operation: 'select', table: 'records', filters: [] }),
    [{ operation: 'rpc', name: 'save_rows' }], [{ operation: 'select', table: 'ai_secrets', filters: [] }]]) {
    const res = response()
    await f.handler(f.request({ operation: 'select_many', queries }), res)
    assert.equal(res.statusCode, 400)
  }
  assert.deepEqual(f.calls, [])
})
test('data endpoint authenticates and projects raw row reads before returning JSON', async () => {
  const f = fixture(), res = response()
  await f.handler(f.request({ operation: 'select', table: 'opportunities', filters: [] }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.data[0].data.value, undefined)
  assert.equal(res.body.data[0].data.oppName, 'Shared opportunity')
  const unauthorized = response()
  await f.handler({ method: 'POST', body: {}, headers: {} }, unauthorized)
  assert.equal(unauthorized.statusCode, 401)
})
test('data endpoint refuses arbitrary tables and RPCs', async () => {
  const f = fixture('ADMIN')
  for (const body of [{ operation: 'select', table: 'ai_secrets', filters: [] }, { operation: 'rpc', name: 'purge_workspace_data', args: {} }]) {
    const res = response(); await f.handler(f.request(body), res); assert.equal(res.statusCode, 400)
  }
  assert.equal(f.calls.length, 0)
})
test('a stale browser cannot write after a permission is revoked', async () => {
  const f = fixture(), res = response()
  f.config.accessPolicy.roles.STANDARD_USER.actions = []
  await f.handler(f.request({ operation: 'rpc', name: 'save_rows', args: { p_entity: 'opportunities', p_rows: [{ id: 'O2', rev: 0, data: { id: 'O2', owner: 'RS' } }] } }), res)
  assert.equal(res.statusCode, 403)
  assert.equal(f.calls.length, 0)
})
test('generation mismatch aborts before any revision-aware save', async () => {
  const f = fixture('ADMIN'), res = response()
  f.state.workspaceGeneration = 2
  await f.handler(f.request({ operation: 'rpc', name: 'save_rows', args: { p_entity: 'opportunities', p_rows: [{ id: 'O2', rev: 0, data: { id: 'O2' } }] } }), res)
  assert.equal(res.statusCode, 409); assert.equal(f.calls.length, 0)
})
test('admin settings endpoint rejects non-admin and validates saved numbering', async () => {
  const f = fixture(), handler = createAdminPolicyHandler(() => f.client), denied = response()
  await handler({ ...f.request({}), method: 'GET' }, denied)
  assert.equal(denied.statusCode, 403)
  f.profile.roles = ['ADMIN']
  const invalid = response()
  await handler(f.request({ accessPolicy: f.config.accessPolicy, opportunityNumbering: { ...DEFAULT_OPPORTUNITY_NUMBERING, dateFormat: 'none' }, rev: 3, reason: 'Review' }), invalid)
  assert.equal(invalid.statusCode, 400); assert.equal(f.calls.length, 0)
  const saved = response()
  await handler(f.request({ ...f.config, rev: 3, reason: 'Reviewed with sales' }), saved)
  assert.equal(saved.statusCode, 200); assert.equal(f.calls[0].name, 'save_access_policy')
  assert.equal(f.calls[0].args.p_actor_id, 'u')
})
test('editing a redacted lead preserves hidden evidence and rejects injected changes', async () => {
  const f = fixture()
  const lead = { id: 'L1', assignedOwner: 'AH', subject: 'Original', body: 'Original confidential evidence', attachments: ['file'] }
  f.state.leads = [lead]
  f.database.leads = [{ id: 'L1', data: lead, rev: 1 }]
  const save = data => f.request({ operation: 'rpc', name: 'save_rows', args: { p_entity: 'leads', p_rows: [{ id: 'L1', rev: 1, data }] } })
  const res = response()
  await f.handler(save({ id: 'L1', assignedOwner: 'AH', subject: 'Corrected subject' }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(f.calls[0].args.p_rows[0].data.body, lead.body)
  assert.deepEqual(f.calls[0].args.p_rows[0].data.attachments, ['file'])
  const denied = response()
  await f.handler(save({ ...lead, body: 'Altered hidden evidence' }), denied)
  assert.equal(denied.statusCode, 403)
  assert.equal(f.calls.length, 1)
})
test('generic opportunity creation requires the signed-in actor’s reservation', async () => {
  const f = fixture('ADMIN'), res = response()
  const input = f.request({ operation: 'rpc', name: 'save_rows', args: { p_entity: 'opportunities', p_rows: [{ id: 'O2', rev: 0, data: { id: 'O2', owner: 'RS' } }] } })
  await f.handler(input, res)
  assert.equal(res.statusCode, 403); assert.equal(f.calls.length, 0)
  f.database.settings.push({ id: 'opportunity_reserved_O2', data: { id: 'O2', actor: 'u' }, rev: 1 })
  const saved = response()
  await f.handler(input, saved)
  assert.equal(saved.statusCode, 200); assert.equal(f.calls.length, 1)
})
test('an explicit Standard assignment overrides legacy administrator identity', async () => {
  const f = fixture()
  f.profile.role = 'LJS'; f.profile.roles = ['LJS', 'STANDARD_USER']
  const denied = response()
  await createAdminPolicyHandler(() => f.client)({ ...f.request({}), method: 'GET' }, denied)
  assert.equal(denied.statusCode, 403)
})
test('reserved wrapper IDs cannot conceal an arbitrary logical opportunity ID', async () => {
  const f = fixture('ADMIN'), res = response()
  f.database.settings.push({ id: 'opportunity_reserved_O2', data: { id: 'O2', actor: 'u' }, rev: 1 })
  await f.handler(f.request({ operation: 'rpc', name: 'save_rows', args: { p_entity: 'opportunities', p_rows: [{ id: 'O2', rev: 0, data: { id: 'arbitrary-id', owner: 'RS' } }] } }), res)
  assert.equal(res.statusCode, 400)
  assert.equal(f.calls.length, 0)
})
