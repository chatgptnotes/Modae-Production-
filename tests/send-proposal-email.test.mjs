import test from 'node:test'
import assert from 'node:assert/strict'
import nodemailer from 'nodemailer'
import handler from '../api/send-proposal-email.js'

const response = () => {
  const out = {}
  return {
    out,
    status(code) { out.status = code; return this },
    json(body) { out.body = body; return this },
  }
}

const MAIL_ENV_KEYS = ['GMAIL_ACCOUNT', 'GMAIL_APP_PASSWORD']

const withMailEnv = fn => async () => {
  const old = MAIL_ENV_KEYS.map(key => [key, process.env[key]])
  process.env.GMAIL_ACCOUNT = 'sales@example.com'
  process.env.GMAIL_APP_PASSWORD = 'app-password'
  try { await fn() }
  finally {
    for (const [key, value] of old) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

const mockTransport = sendMail => {
  const original = nodemailer.createTransport
  nodemailer.createTransport = () => ({ sendMail })
  return () => { nodemailer.createTransport = original }
}

test('mail endpoint rejects non-POST requests', async () => {
  const res = response()
  await handler({ method: 'GET' }, res)
  assert.equal(res.out.status, 405)
})

test('mail endpoint fails safely when server mail secrets are absent', async () => {
  const old = MAIL_ENV_KEYS.map(key => [key, process.env[key]])
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

test('mail endpoint rejects executable attachments', withMailEnv(async () => {
  const res = response()
  await handler({ method: 'POST', body: { to: 'customer@example.com', subject: 'Proposal', body: 'Attached', attachments: [{ filename: 'setup.exe', mimeType: 'application/x-msdownload', contentBase64: 'YQ==' }] } }, res)
  assert.equal(res.out.status, 400)
  assert.match(res.out.body.error, /executables are rejected/)
}))

test('mail endpoint accepts everyday business files picked by the salesperson', withMailEnv(async () => {
  const calls = []
  const restore = mockTransport(async options => {
    calls.push(options)
    return { messageId: 'msg-1' }
  })
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
    assert.equal(res.out.body.messageId, 'msg-1')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].from, 'projects@example.com')
    assert.equal(calls[0].to, 'buyer@example.com, purchasing@example.com',
      'comma-separated recipients must all land in the To header')
    assert.deepEqual(calls[0].attachments.map(a => a.filename), ['proposal.xlsx', 'compliance.docx', 'notes.txt'])
  } finally {
    restore()
  }
}))

test('mail endpoint rejects a malformed From address', withMailEnv(async () => {
  const res = response()
  await handler({ method: 'POST', body: {
    from: 'not-an-email', to: 'customer@example.com', subject: 'Proposal', body: 'Attached',
    attachments: [{ filename: 'proposal.pdf', mimeType: 'application/pdf', contentBase64: 'cA==' }],
  } }, res)
  assert.equal(res.out.status, 400)
  assert.equal(res.out.body.error, 'From address is not valid')
}))

test('mail endpoint sends every attachment in one message', withMailEnv(async () => {
  const calls = []
  const restore = mockTransport(async options => {
    calls.push(options)
    return { messageId: 'msg-1' }
  })
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
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].attachments.map(a => a.filename),
      ['proposal.xlsx', 'proposal.pdf', 'ModAE Standard Terms-Sales.pdf'])
  } finally {
    restore()
  }
}))

test('mail endpoint surfaces the real error when Gmail rejects the message', withMailEnv(async () => {
  const restore = mockTransport(async () => { throw new Error('Invalid login') })
  try {
    const res = response()
    await handler({ method: 'POST', body: {
      to: 'customer@example.com', subject: 'Proposal', body: 'Attached',
      attachments: [{ filename: 'proposal.pdf', mimeType: 'application/pdf', contentBase64: 'cA==' }],
    } }, res)
    assert.equal(res.out.status, 502)
    assert.equal(res.out.body.ok, false)
  } finally {
    restore()
  }
}))
