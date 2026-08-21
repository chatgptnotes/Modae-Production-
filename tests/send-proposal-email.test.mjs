import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/send-proposal-email.js'

const response = () => {
  const out = {}
  return {
    out,
    status(code) { out.status = code; return this },
    json(body) { out.body = body; return this },
  }
}

test('mail endpoint rejects non-POST requests', async () => {
  const res = response()
  await handler({ method: 'GET' }, res)
  assert.equal(res.out.status, 405)
})

test('mail endpoint fails safely when server mail secrets are absent', async () => {
  const old = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GMAIL_ACCOUNT']
    .map(key => [key, process.env[key]])
  for (const [key] of old) delete process.env[key]
  try {
    const res = response()
    await handler({ method: 'POST', body: {} }, res)
    assert.equal(res.out.status, 503)
    assert.equal(res.out.body.ok, false)
  } finally {
    for (const [key, value] of old) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
