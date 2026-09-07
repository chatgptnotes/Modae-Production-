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

test('mail endpoint rejects executable attachments', async () => {
  const old = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GMAIL_ACCOUNT']
    .map(key => [key, process.env[key]])
  process.env.GOOGLE_CLIENT_ID = 'client'
  process.env.GOOGLE_CLIENT_SECRET = 'secret'
  process.env.GOOGLE_REFRESH_TOKEN = 'refresh'
  process.env.GMAIL_ACCOUNT = 'sales@example.com'
  try {
    const res = response()
    await handler({ method: 'POST', body: { to: 'customer@example.com', subject: 'Proposal', body: 'Attached', attachments: [{ filename: 'setup.exe', mimeType: 'application/x-msdownload', contentBase64: 'YQ==' }] } }, res)
    assert.equal(res.out.status, 400)
    assert.match(res.out.body.error, /executables are rejected/)
  } finally {
    for (const [key, value] of old) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('mail endpoint accepts everyday business files picked by the salesperson', async () => {
  const old = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GMAIL_ACCOUNT']
    .map(key => [key, process.env[key]])
  const oldFetch = globalThis.fetch
  const requests = []
  process.env.GOOGLE_CLIENT_ID = 'client'
  process.env.GOOGLE_CLIENT_SECRET = 'secret'
  process.env.GOOGLE_REFRESH_TOKEN = 'refresh'
  process.env.GMAIL_ACCOUNT = 'sales@example.com'
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    if (url.includes('oauth2')) return { ok: true, json: async () => ({ access_token: 'token' }) }
    return { ok: true, json: async () => ({ id: 'msg-1', threadId: 'thread-1' }) }
  }
  try {
    const res = response()
    await handler({ method: 'POST', body: {
      from: 'projects@example.com', to: 'buyer@example.com, purchasing@example.com', subject: 'Proposal', body: 'Attached',
      attachments: [
        { filename: 'proposal.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', contentBase64: 'eA==' },
        { filename: 'compliance.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', contentBase64: 'ZA==' },
        { filename: 'notes.txt', mimeType: 'text/plain', contentBase64: 'bg==' },
      ],
    } }, res)
    assert.equal(res.out.status, 200)
    const gmailRequest = requests.find(r => r.url.includes('gmail.googleapis.com'))
    const raw = JSON.parse(gmailRequest.options.body).raw
    const message = Buffer.from(raw, 'base64url').toString()
    assert.match(message, /From: projects@example\.com/)
    assert.match(message, /To: buyer@example\.com, purchasing@example\.com/,
      'comma-separated recipients must all land in the To header')
    assert.match(message, /filename="compliance\.docx"/)
    assert.match(message, /filename="notes\.txt"/)
  } finally {
    globalThis.fetch = oldFetch
    for (const [key, value] of old) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('mail endpoint rejects a malformed From address', async () => {
  const old = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GMAIL_ACCOUNT']
    .map(key => [key, process.env[key]])
  process.env.GOOGLE_CLIENT_ID = 'client'
  process.env.GOOGLE_CLIENT_SECRET = 'secret'
  process.env.GOOGLE_REFRESH_TOKEN = 'refresh'
  process.env.GMAIL_ACCOUNT = 'sales@example.com'
  try {
    const res = response()
    await handler({ method: 'POST', body: {
      from: 'not-an-email', to: 'customer@example.com', subject: 'Proposal', body: 'Attached',
      attachments: [{ filename: 'proposal.pdf', mimeType: 'application/pdf', contentBase64: 'cA==' }],
    } }, res)
    assert.equal(res.out.status, 400)
    assert.equal(res.out.body.error, 'From address is not valid')
  } finally {
    for (const [key, value] of old) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('mail endpoint puts every attachment in one MIME message', async () => {
  const old = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GMAIL_ACCOUNT']
    .map(key => [key, process.env[key]])
  const oldFetch = globalThis.fetch
  const requests = []
  process.env.GOOGLE_CLIENT_ID = 'client'
  process.env.GOOGLE_CLIENT_SECRET = 'secret'
  process.env.GOOGLE_REFRESH_TOKEN = 'refresh'
  process.env.GMAIL_ACCOUNT = 'sales@example.com'
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    if (url.includes('oauth2')) return { ok: true, json: async () => ({ access_token: 'token' }) }
    return { ok: true, json: async () => ({ id: 'msg-1', threadId: 'thread-1' }) }
  }
  try {
    const res = response()
    await handler({ method: 'POST', body: {
      to: 'customer@example.com', subject: 'Proposal', body: 'Attached',
      attachments: [
        { filename: 'proposal.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', contentBase64: 'eA==' },
        { filename: 'proposal.pdf', mimeType: 'application/pdf', contentBase64: 'cA==' },
        { filename: 'ModAE Standard Terms-Sales.pdf', mimeType: 'application/pdf', contentBase64: 'dA==' },
      ],
    } }, res)
    assert.equal(res.out.status, 200)
    const gmailRequest = requests.find(r => r.url.includes('gmail.googleapis.com'))
    const raw = JSON.parse(gmailRequest.options.body).raw
    const message = Buffer.from(raw, 'base64url').toString()
    assert.match(message, /filename="proposal\.xlsx"/)
    assert.match(message, /filename="proposal\.pdf"/)
    assert.match(message, /filename="ModAE Standard Terms-Sales\.pdf"/)
  } finally {
    globalThis.fetch = oldFetch
    for (const [key, value] of old) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
