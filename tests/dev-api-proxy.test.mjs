import test from 'node:test'
import assert from 'node:assert/strict'
import config from '../vite.config.js'

test('Vite API and health requests follow the configured local server port', () => {
  const before = process.env.PORT
  try {
    process.env.PORT = '3999'
    const result = config({ mode: 'test' })
    assert.equal(result.server.proxy['/api'], 'http://127.0.0.1:3999')
    assert.equal(result.server.proxy['/healthz'], 'http://127.0.0.1:3999')
  } finally {
    if (before === undefined) delete process.env.PORT
    else process.env.PORT = before
  }
})
