import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/ai.js'
import { textFromTaskResult } from '../src/ai.js'

const response = () => {
  const out = {}
  return {
    out,
    setHeader() {},
    status(code) { out.status = code; return this },
    json(body) { out.body = body; return this },
  }
}

const withEnv = async (value, fn) => {
  const before = process.env.GEMINI_API_KEY
  if (value === undefined) delete process.env.GEMINI_API_KEY
  else process.env.GEMINI_API_KEY = value
  try { await fn() } finally {
    if (before === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = before
  }
}

test('AI route identifies a missing Vercel Gemini key safely', async () => {
  await withEnv(undefined, async () => {
    const res = response()
    await handler({ method: 'POST', body: { task: 'health' } }, res)
    assert.equal(res.out.status, 503)
    assert.equal(res.out.body.errorCode, 'AI_KEY_MISSING')
    assert.doesNotMatch(res.out.body.error, /key=/i)
  })
})

test('AI route identifies a rejected server credential without exposing it', async () => {
  const oldFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: false, status: 403 })
  try {
    await withEnv('server-side-only', async () => {
      const res = response()
      await handler({ method: 'POST', body: { task: 'health' } }, res)
      assert.equal(res.out.status, 502)
      assert.equal(res.out.body.errorCode, 'AI_KEY_REJECTED')
      assert.doesNotMatch(JSON.stringify(res.out.body), /server-side-only/)
    })
  } finally { globalThis.fetch = oldFetch }
})

test('AI route health check returns the configured model on success', async () => {
  const oldFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) })
  try {
    await withEnv('server-side-only', async () => {
      const res = response()
      await handler({ method: 'POST', body: { task: 'health', model: 'gemini-2.5-flash' } }, res)
      assert.equal(res.out.status, 200)
      assert.equal(res.out.body.ok, true)
      assert.equal(res.out.body.model, 'gemini-2.5-flash')
    })
  } finally { globalThis.fetch = oldFetch }
})

test('text helper accepts proposal text returned inside task data', () => {
  assert.equal(textFromTaskResult({ data: { text: 'Dear Sir/Madam,' } }), 'Dear Sir/Madam,')
  assert.equal(textFromTaskResult({ text: 'top-level text' }), 'top-level text')
  assert.equal(textFromTaskResult({ data: {} }), null)
})
