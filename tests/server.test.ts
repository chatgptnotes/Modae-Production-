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
