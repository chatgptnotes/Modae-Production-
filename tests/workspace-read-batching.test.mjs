import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspaceDataClient } from '../src/workspaceDataClient.js'

function setup(fetcher) {
  let sessions = 0
  const client = createWorkspaceDataClient({ auth: { getSession: async () => {
    sessions++
    return { data: { session: { access_token: 'test-token' } } }
  } } }, () => '7', fetcher)
  return { client, sessions: () => sessions }
}
test('nine simultaneous reads make one authenticated request and retain their individual results', async () => {
  const calls = []
  const f = setup(async (_url, options) => {
    calls.push(options)
    const body = JSON.parse(options.body)
    return { ok: true, json: async () => ({ results: body.queries.map(query => ({ data: [{ id: query.filters[0][2] }], error: null })) }) }
  })
  const results = await Promise.all(Array.from({ length: 9 }, (_, i) => f.client.from('records').select('*').eq('id', String(i))))
  assert.equal(calls.length, 1)
  assert.equal(f.sessions(), 1)
  assert.equal(calls[0].headers['x-workspace-generation'], '7')
  assert.deepEqual(results.map(result => result.data[0].id), Array.from({ length: 9 }, (_, i) => String(i)))
})
test('read batches are bounded and do not cache results across later reads', async () => {
  const sizes = []
  const f = setup(async (_url, options) => {
    const body = JSON.parse(options.body)
    const queries = body.queries || [body]
    sizes.push(queries.length)
    const results = queries.map(() => ({ data: [], error: null }))
    return { ok: true, json: async () => body.queries ? { results } : results[0] }
  })
  await Promise.all(Array.from({ length: 25 }, () => f.client.from('leads').select('*')))
  assert.deepEqual(sizes, [20, 5])
  await f.client.from('leads').select('*')
  assert.deepEqual(sizes, [20, 5, 1])
})
test('failed batches settle every read and a later retry makes a fresh request', async () => {
  let calls = 0
  const f = setup(async () => {
    calls++
    if (calls === 1) throw new Error('Offline')
    return { ok: false, status: 403, json: async () => ({ error: 'Access revoked', code: '403' }) }
  })
  const results = await Promise.allSettled([f.client.from('leads').select('*'), f.client.from('opportunities').select('*')])
  assert.ok(results.every(result => result.status === 'rejected' && result.reason.message === 'Offline'))
  const denied = await f.client.from('leads').select('*')
  assert.equal(denied.error.code, '403')
  assert.equal(calls, 2)
})
test('writes stay outside read batches and keep their original arguments', async () => {
  const calls = []
  const f = setup(async (_url, options) => {
    const body = JSON.parse(options.body); calls.push(body)
    return { ok: true, json: async () => ({ data: { accepted: ['x'] }, error: null }) }
  })
  await f.client.rpc('save_rows', { p_entity: 'leads', p_rows: [{ id: 'x', rev: 3 }] })
  assert.deepEqual(calls, [{ operation: 'rpc', name: 'save_rows', args: { p_entity: 'leads', p_rows: [{ id: 'x', rev: 3 }] } }])
})
