import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchWorkspace, saveWorkspace } from '../src/workspaceApi.js'

test('workspace bootstrap sends the signed-in token to the server', async () => {
  let request: { url?: string, init?: RequestInit } = {}
  const data = await fetchWorkspace('access-token', async (url, init) => {
    request = { url: String(url), init }
    return new Response(JSON.stringify({ ok: true, data: { leads: [] } }), { status: 200 })
  })
  assert.equal(request.url, '/api/workspace/bootstrap')
  assert.equal(request.init?.headers && (request.init.headers as Record<string, string>).Authorization, 'Bearer access-token')
  assert.deepEqual(data, { leads: [] })
})

test('collaborative saves go to the server instead of the browser Supabase client', async () => {
  let request: { url?: string, init?: RequestInit } = {}
  await saveWorkspace('access-token', { approvals: [{ id: 'AP-2' }] }, async (url, init) => {
    request = { url: String(url), init }
    return new Response(null, { status: 204 })
  })
  assert.equal(request.url, '/api/workspace/save')
  assert.equal(request.init?.method, 'POST')
  assert.equal((request.init?.headers as Record<string, string>).Authorization, 'Bearer access-token')
  assert.equal(request.init?.body, JSON.stringify({ dirty: { approvals: [{ id: 'AP-2' }] } }))
})
