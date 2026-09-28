import test from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/ai.js'
import { formatEmailBody, textFromTaskResult } from '../src/ai.js'

process.env.NODE_ENV = 'test'

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

test('AI route rejects requests without an application session', async () => {
  await withEnv('server-side-only', async () => {
    const res = response()
    await handler({ method: 'POST', body: { task: 'health' } }, res)
    assert.equal(res.out.status, 401)
    assert.equal(res.out.body.errorCode, 'AI_AUTH_REQUIRED')
  })
})

test('AI route rejects oversized payloads before calling Gemini', async () => {
  await withEnv('server-side-only', async () => {
    const res = response()
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer test-token' },
      body: { task: 'health', payload: { text: 'x'.repeat(350001) } },
    }, res)
    assert.equal(res.out.status, 413)
    assert.equal(res.out.body.errorCode, 'AI_PAYLOAD_TOO_LARGE')
  })
})

test('AI route identifies a missing Vercel Gemini key safely', async () => {
  await withEnv(undefined, async () => {
    const res = response()
    await handler({ method: 'POST', headers: { authorization: 'Bearer test-token' }, body: { task: 'health' } }, res)
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
      await handler({ method: 'POST', headers: { authorization: 'Bearer test-token' }, body: { task: 'health' } }, res)
      assert.equal(res.out.status, 502)
      assert.equal(res.out.body.errorCode, 'AI_KEY_REJECTED')
      assert.doesNotMatch(JSON.stringify(res.out.body), /server-side-only/)
    })
  } finally { globalThis.fetch = oldFetch }
})

test('AI route explains when the configured Gemini model is unavailable', async () => {
  const oldFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: false, status: 404 })
  try {
    await withEnv('server-side-only', async () => {
      const res = response()
      await handler({ method: 'POST', headers: { authorization: 'Bearer test-token' }, body: { task: 'health', model: 'gemini-3.5-flash-lite' } }, res)
      assert.equal(res.out.status, 502)
      assert.equal(res.out.body.errorCode, 'AI_MODEL_UNAVAILABLE')
      assert.match(res.out.body.error, /model.*unavailable/i)
    })
  } finally { globalThis.fetch = oldFetch }
})

test('AI route health check returns the configured model on success', async () => {
  const oldFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) })
  try {
    await withEnv('server-side-only', async () => {
      const res = response()
      await handler({ method: 'POST', headers: { authorization: 'Bearer test-token' }, body: { task: 'health', model: 'gemini-2.5-flash' } }, res)
      assert.equal(res.out.status, 200)
      assert.equal(res.out.body.ok, true)
      assert.equal(res.out.body.model, 'gemini-2.5-flash')
    })
  } finally { globalThis.fetch = oldFetch }
})

test('AI route retries a temporary Gemini rate limit before succeeding', async () => {
  const oldFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    if (calls < 3) return { ok: false, status: 429 }
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) }
  }
  try {
    await withEnv('server-side-only', async () => {
      const res = response()
      await handler({ method: 'POST', headers: { authorization: 'Bearer test-token' }, body: { task: 'health' } }, res)
      assert.equal(res.out.status, 200)
      assert.equal(calls, 3)
    })
  } finally { globalThis.fetch = oldFetch }
})

test('AI route uses Gemini 3.6 Flash for routine work', async () => {
  const oldFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ text: 'ok' }) }] } }] }) })
  try {
    await withEnv('server-side-only', async () => {
      const res = response()
      await handler({ method: 'POST', headers: { authorization: 'Bearer test-token' }, body: { task: 'email.proofread', model: 'gemini-2.5-flash', payload: { body: 'Review this.' } } }, res)
      assert.equal(res.out.status, 200)
      assert.equal(res.out.body.model, 'gemini-3.6-flash')
    })
  } finally { globalThis.fetch = oldFetch }
})

test('AI route uses Gemini 3.6 Flash for complex document reasoning', async () => {
  const oldFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ issues: [], summary: 'ok', confidence: 90 }) }] } }] }) })
  try {
    await withEnv('server-side-only', async () => {
      const res = response()
      await handler({ method: 'POST', headers: { authorization: 'Bearer test-token' }, body: { task: 'proposal.review', model: 'gemini-3.1-flash-lite', payload: { workbook: [] } } }, res)
      assert.equal(res.out.status, 200)
      assert.equal(res.out.body.model, 'gemini-3.6-flash')
    })
  } finally { globalThis.fetch = oldFetch }
})

test('lead extraction prompt enforces complete chunk-aware document scanning', async () => {
  const oldFetch = globalThis.fetch
  let request
  let requestedUrl = ''
  globalThis.fetch = async (url, options) => {
    requestedUrl = String(url)
    request = JSON.parse(options.body)
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      summary: 'Scanned enquiry.', route: 'Spares', urgency: 'Normal', completeness: 50,
      suggestedOwner: '', fields: [], lineItems: [], missing: [], next: [],
    }) }] } }] }) }
  }
  try {
    await withEnv('server-side-only', async () => {
      const res = response()
      await handler({ method: 'POST', headers: { authorization: 'Bearer test-token' }, body: {
        task: 'lead.extract',
        payload: {
          from: 'buyer@example.com', subject: 'RFQ', body: 'Please scan the attached schedule.',
          attachments: [{ name: 'rfq.pdf', pages: 4, text: 'Plant Name: Salal\nQty 2' }],
          chunk: { source: 'Attachment: rfq.pdf', index: 1, total: 2, pageStart: 3, pageEnd: 4, phase: 'final-segment' },
        },
      } }, res)
      assert.equal(res.out.status, 200)
      assert.match(requestedUrl, /gemini-3\.6-flash:generateContent/)
      const prompt = request.contents[0].parts[0].text
      assert.match(prompt, /Read every supplied page,\s+section and table row/i)
      assert.match(prompt, /not readable\/scan-only/i)
      assert.match(prompt, /preserve every distinct customer, EUC\/EUN/i)
      assert.match(prompt, /all related location\/address\/city\/state\/\s*country facts/i)
      assert.match(prompt, /preserve every distinct customer,[\s\S]*delivery\s+location/i)
      assert.match(prompt, /"phase":"final-segment"/)
      assert.match(prompt, /one row per item, preserving description/i)
    })
  } finally { globalThis.fetch = oldFetch }
})

test('AI route maps the retired Gemini Pro alias to Gemini 3.6 Flash', async () => {
  const oldFetch = globalThis.fetch
  let requestedUrl = ''
  globalThis.fetch = async url => {
    requestedUrl = String(url)
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) }
  }
  try {
    await withEnv('server-side-only', async () => {
      const res = response()
      await handler({ method: 'POST', headers: { authorization: 'Bearer test-token' }, body: { task: 'health', model: 'gemini-pro-latest' } }, res)
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
      await handler({ method: 'POST', headers: { authorization: 'Bearer test-token' }, body: { task: 'template.map', model: 'gemini-2.5-flash', payload: { workbook: [], deterministic: {} } } }, res)
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
      await handler({ method: 'POST', headers: { authorization: 'Bearer test-token' }, body: { task: 'email.proofread', payload: { body: 'Dear Team, plese review.', oppId: '2609011PJS', revision: '00' } } }, res)
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
      await handler({ method: 'POST', headers: { authorization: 'Bearer test-token' }, body: { task: 'email.proposal', payload: { oppId: '2609011PJS', attachments: ['proposal.xlsx', 'terms.pdf'] } } }, res)
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
      await handler({ method: 'POST', headers: { authorization: 'Bearer test-token' }, body: {
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
