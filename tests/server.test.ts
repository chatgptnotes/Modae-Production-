import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import request from 'supertest'
import { createApp } from '../src/server/app.ts'

const app = createApp({ staticDir: '' })

test('health endpoint reports that the Railway service is ready', async () => {
  const response = await request(app).get('/healthz')
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { ok: true })
})

test('API errors are JSON and unknown API routes do not reach the SPA fallback', async () => {
  const response = await request(app).get('/api/not-a-route')
  assert.equal(response.status, 404)
  assert.deepEqual(response.body, { ok: false, error: 'API route not found' })
})

test('CORS allows localhost development origins but rejects unknown origins', async () => {
  const local = await request(app).options('/api/locations')
    .set('Origin', 'http://localhost:5173')
    .set('Access-Control-Request-Method', 'GET')
  assert.equal(local.status, 204)
  assert.equal(local.headers['access-control-allow-origin'], 'http://localhost:5173')

  const unknown = await request(app).get('/healthz').set('Origin', 'https://untrusted.example')
  assert.equal(unknown.headers['access-control-allow-origin'], undefined)
})

test('Express serves static files and falls back to the SPA shell for deep links', async () => {
  const staticDir = await mkdtemp(path.join(tmpdir(), 'wintrack-static-'))
  try {
    await writeFile(path.join(staticDir, 'index.html'), '<main>WinTrack</main>')
    await writeFile(path.join(staticDir, 'asset.txt'), 'asset')
    const staticApp = createApp({ staticDir })
    assert.equal((await request(staticApp).get('/asset.txt')).text, 'asset')
    assert.match((await request(staticApp).get('/opportunities/123')).text, /WinTrack/)
  } finally {
    await rm(staticDir, { recursive: true, force: true })
  }
})

test('approval API requires a session and returns only approval rows', async () => {
  const app = createApp({
    staticDir: '',
    approvalAuth: async token => token === 'valid-token' ? { id: 'user-1' } : null,
    approvalReader: async (token, userId) => token === 'valid-token' && userId === 'user-1'
      ? [{ id: 'AP-1', status: 'Pending' }] : [],
  })

  const unauthenticated = await request(app).get('/api/approvals')
  assert.equal(unauthenticated.status, 401)

  const authenticated = await request(app).get('/api/approvals').set('Authorization', 'Bearer valid-token')
  assert.deepEqual(authenticated.body, { ok: true, approvals: [{ id: 'AP-1', status: 'Pending' }] })
})

test('approval publish requires a session and notifies the Railway event hub', async () => {
  let publications = 0
  const app = createApp({
    staticDir: '',
    approvalAuth: async token => token === 'valid-token' ? { id: 'user-1' } : null,
    approvalPublisher: () => { publications += 1 },
  })

  assert.equal((await request(app).post('/api/approval-events/publish')).status, 401)
  assert.equal((await request(app).post('/api/approval-events/publish').set('Authorization', 'Bearer valid-token')).status, 204)
  assert.equal(publications, 1)
})

test('live event publish accepts only the supported changed entities', async () => {
  const publications: string[][] = []
  const app = createApp({
    staticDir: '',
    approvalAuth: async token => token === 'valid-token' ? { id: 'user-1' } : null,
    approvalPublisher: entities => { publications.push(entities || []) },
  })

  const response = await request(app)
    .post('/api/live-events/publish')
    .set('Authorization', 'Bearer valid-token')
    .send({ entities: ['leads', 'opportunities'] })
  assert.equal(response.status, 204)
  assert.deepEqual(publications, [['leads', 'opportunities']])

  const invalid = await request(app)
    .post('/api/live-events/publish')
    .set('Authorization', 'Bearer valid-token')
    .send({ entities: ['users'] })
  assert.equal(invalid.status, 400)
})

test('live data API returns only requested approval, lead, and opportunity rows', async () => {
  const reads: string[][] = []
  const app = createApp({
    staticDir: '',
    approvalAuth: async token => token === 'valid-token' ? { id: 'user-1' } : null,
    liveReader: async (_token, _userId, entities) => {
      reads.push(entities)
      return { leads: [{ id: 'L-1' }], opportunities: [{ id: 'O-1' }] }
    },
  })

  const response = await request(app)
    .get('/api/live-data?entities=leads,opportunities')
    .set('Authorization', 'Bearer valid-token')
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { ok: true, data: { leads: [{ id: 'L-1' }], opportunities: [{ id: 'O-1' }] } })
  assert.deepEqual(reads, [['leads', 'opportunities']])
})

test('workspace bootstrap is cached once in Railway for multiple signed-in browsers', async () => {
  let reads = 0
  const app = createApp({
    staticDir: '',
    approvalAuth: async token => token === 'valid-token' ? { id: 'user-1' } : null,
    workspaceReader: async () => {
      reads += 1
      return { leads: [{ id: 'L-1' }], opportunities: [], approvals: [] }
    },
  })

  const first = await request(app).get('/api/workspace/bootstrap').set('Authorization', 'Bearer valid-token')
  const second = await request(app).get('/api/workspace/bootstrap').set('Authorization', 'Bearer valid-token')
  assert.equal(first.status, 200)
  assert.deepEqual(first.body.data.leads, [{ id: 'L-1' }])
  assert.deepEqual(second.body, first.body)
  assert.equal(reads, 1)
})

test('workspace save authenticates and sends only changed collaborative slices to Railway', async () => {
  const writes: unknown[] = []
  const app = createApp({
    staticDir: '',
    approvalAuth: async token => token === 'valid-token' ? { id: 'user-1' } : null,
    workspaceWriter: async dirty => { writes.push(dirty) },
  })
  assert.equal((await request(app).post('/api/workspace/save').send({ dirty: { leads: [] } })).status, 401)
  const response = await request(app).post('/api/workspace/save')
    .set('Authorization', 'Bearer valid-token')
    .send({ dirty: { leads: [{ id: 'L-2' }] } })
  assert.equal(response.status, 204)
  assert.deepEqual(writes, [{ leads: [{ id: 'L-2' }] }])
})
