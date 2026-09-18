import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/ai.js'
import { formatEmailBody, textFromTaskResult } from '../src/ai.js'

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

test('AI route maps the retired Gemini Pro alias to the supported Flash model', async () => {
  const oldFetch = globalThis.fetch
  let requestedUrl = ''
  globalThis.fetch = async url => {
    requestedUrl = String(url)
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) }
  }
  try {
    await withEnv('server-side-only', async () => {
      const res = response()
      await handler({ method: 'POST', body: { task: 'health', model: 'gemini-pro-latest' } }, res)
      assert.equal(res.out.status, 200)
      assert.equal(res.out.body.model, 'gemini-3.6-flash')
      assert.match(requestedUrl, /gemini-3\.6-flash:generateContent/)
    })
  } finally { globalThis.fetch = oldFetch }
})

test('AI route reuses the Vercel proxy for template mapping', async () => {
  const oldFetch = globalThis.fetch
  let request
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body)
    return { ok: true, json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        version: 1, method: 'gemini', coverSheet: 'Cover', commercialSheet: 'Quote', fields: {}, warnings: [],
      }) }] } }],
    }) }
  }
  try {
    await withEnv('server-side-only', async () => {
      const res = response()
      await handler({ method: 'POST', body: { task: 'template.map', model: 'gemini-2.5-flash', payload: { workbook: [], deterministic: {} } } }, res)
      assert.equal(res.out.status, 200)
      assert.equal(res.out.body.ok, true)
      assert.equal(request.generationConfig.responseMimeType, 'application/json')
      assert.equal(request.generationConfig.responseSchema.properties.coverSheet.type, 'STRING')
    })
  } finally { globalThis.fetch = oldFetch }
})

test('text helper accepts proposal text returned inside task data', () => {
  assert.equal(textFromTaskResult({ data: { text: 'Dear Sir/Madam,' } }), 'Dear Sir/Madam,')
  assert.equal(textFromTaskResult({ text: 'top-level text' }), 'top-level text')
  assert.equal(textFromTaskResult({ data: {} }), null)
})

test('proposal email formatter restores professional paragraph spacing', () => {
  assert.equal(
    formatEmailBody('Dear NMCL Team,We are pleased to share the proposal.This proposal is valid for 30 days.Best regards,ModAE India Pvt Ltd'),
    'Dear NMCL Team,\n\nWe are pleased to share the proposal.\n\nThis proposal is valid for 30 days.\n\nBest regards,\nModAE India Pvt Ltd',
  )
  assert.equal(formatEmailBody('```text\nDear Team,\n\nPlease review.\n\nBest regards,\nModAE\n```'), 'Dear Team,\n\nPlease review.\n\nBest regards,\nModAE')
})

test('AI route accepts the protected email proofreading task', async () => {
  const oldFetch = globalThis.fetch
  let request
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body)
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ text: 'Dear Team,\\n\\nPlease review.\\n\\nRegards,\\nModAE' }) }] } }] }) }
  }
  try {
    await withEnv('server-side-only', async () => {
      const res = response()
      await handler({ method: 'POST', body: { task: 'email.proofread', payload: { body: 'Dear Team, plese review.', oppId: '2609011PJS', revision: '00' } } }, res)
      assert.equal(res.out.status, 200)
      assert.equal(res.out.body.data.text, 'Dear Team,\\n\\nPlease review.\\n\\nRegards,\\nModAE')
      assert.match(request.contents[0].parts[0].text, /Preserve every proposal ID, revision, date, price,[\s\S]*quantity, validity period/)
    })
  } finally { globalThis.fetch = oldFetch }
})

test('AI route requests structured proposal email sections', async () => {
  const oldFetch = globalThis.fetch
  let request
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body)
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ greeting: 'Dear Team,', purpose: 'Approved proposal 2609011PJS, Revision 00.', attachments: 'The proposal and ModAE standard terms are attached.', validityAndNextStep: 'Valid for 30 days. Please review and confirm.', clarification: 'Please contact us with any questions.', signoff: 'Best regards,\\nModAE India Pvt Ltd' }) }] } }] }) }
  }
  try {
    await withEnv('server-side-only', async () => {
      const res = response()
      await handler({ method: 'POST', body: { task: 'email.proposal', payload: { oppId: '2609011PJS', attachments: ['proposal.xlsx', 'terms.pdf'] } } }, res)
      assert.equal(res.out.status, 200)
      assert.equal(res.out.body.data.greeting, 'Dear Team,')
      assert.match(request.contents[0].parts[0].text, /Return exactly these fields:/)
      assert.match(request.contents[0].parts[0].text, /ATTACHMENTS:\nproposal\.xlsx\nterms\.pdf/)
    })
  } finally { globalThis.fetch = oldFetch }
})

test('AI route reviews approval comments without making the approval decision', async () => {
  const oldFetch = globalThis.fetch
  let request
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body)
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      classification: 'conditional',
      summary: 'Approval depends on receiving the signed customer form.',
      requiredActions: ['Upload the signed customer form.'],
      confidence: 96,
    }) }] } }] }) }
  }
  try {
    await withEnv('server-side-only', async () => {
      const res = response()
      await handler({ method: 'POST', body: {
        task: 'approval.comment-review',
        payload: { decision: 'Approved', comment: 'Approved subject to signed customer form.' },
      } }, res)
      assert.equal(res.out.status, 200)
      assert.equal(res.out.body.data.classification, 'conditional')
      assert.equal(res.out.body.data.requiredActions[0], 'Upload the signed customer form.')
      assert.match(request.contents[0].parts[0].text, /do not make the approval decision/i)
      assert.equal(request.generationConfig.responseMimeType, 'application/json')
    })
  } finally { globalThis.fetch = oldFetch }
})
