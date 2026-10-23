import test from 'node:test'
import assert from 'node:assert/strict'
import { createMicrosoftMail } from '../api/_microsoft-mail.js'
import { createMicrosoftGraph } from '../api/_microsoft-graph.js'
import { createMicrosoftHandlers } from '../api/microsoft.js'

const config = { tenantId: 'tenant', clientId: 'client', clientSecret: 'secret', mailbox: 'sales@example.com' }

test('mail service reads only the configured mailbox and uses an application token', async () => {
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), options })
    if (String(url).includes('/token')) return Response.json({ access_token: 'token', expires_in: 3600 })
    return Response.json({ value: [{ id: 'one', subject: 'Hello' }] })
  }
  const mail = createMicrosoftMail(config, fetcher)
  const result = await mail.list('inbox')
  assert.equal(result.messages[0].id, 'one')
  assert.match(calls[0].url, /tenant\/oauth2\/v2\.0\/token/)
  assert.match(calls[1].url, /users\/sales%40example\.com\/mailFolders\/inbox\/messages/)
  assert.equal(calls[1].options.headers.Authorization, 'Bearer token')
  await assert.rejects(() => mail.list('other'), /Unsupported mail folder/)
})

test('mail service sends and replies through the configured mailbox', async () => {
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), options })
    if (String(url).includes('/token')) return Response.json({ access_token: 'token', expires_in: 3600 })
    return new Response(null, { status: 202 })
  }
  const mail = createMicrosoftMail(config, fetcher)
  await mail.send({ to: 'buyer@example.com', cc: 'copy@example.com', bcc: 'blind-copy@example.com', subject: 'Quote', body: 'Attached' })
  await mail.reply('message-id', 'Thanks for your enquiry')
  assert.match(calls[1].url, /users\/sales%40example\.com\/sendMail$/)
  assert.deepEqual(JSON.parse(calls[1].options.body).message.toRecipients, [{ emailAddress: { address: 'buyer@example.com' } }])
  assert.deepEqual(JSON.parse(calls[1].options.body).message.ccRecipients, [{ emailAddress: { address: 'copy@example.com' } }])
  assert.deepEqual(JSON.parse(calls[1].options.body).message.bccRecipients, [{ emailAddress: { address: 'blind-copy@example.com' } }])
  assert.match(calls[2].url, /messages\/message-id\/reply$/)
  await assert.rejects(() => mail.send({ to: 'bad', subject: 'x', body: 'x' }), /recipient/)
})

test('mail service pages Outlook folders for the selected shared or personal account', async () => {
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), options })
    if (String(url).includes('/token')) return Response.json({ access_token: 'app-token', expires_in: 3600 })
    return Response.json({ value: [{ id: 'draft-1', subject: 'Saved' }] })
  }
  const mail = createMicrosoftMail(config, fetcher)
  const shared = await mail.listFolder('drafts')
  assert.equal(shared.messages[0].id, 'draft-1')
  assert.match(calls[1].url, /users\/sales%40example\.com\/mailFolders\/drafts\/messages/)
  const personal = await mail.listFolder('sent', '', '', 'personal-token')
  assert.equal(personal.messages[0].id, 'draft-1')
  assert.match(calls.at(-1).url, /\/me\/mailFolders\/sentitems\/messages/)
  assert.equal(calls.at(-1).options.headers.Authorization, 'Bearer personal-token')
  await assert.rejects(() => mail.listFolder('not-a-folder'), /Unsupported mail folder/)
})

test('draft save safely stores message text and attachments, then sends and trashes via Graph', async () => {
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), options })
    if (String(url).includes('/token')) return Response.json({ access_token: 'token', expires_in: 3600 })
    if (options.method === 'POST' && String(url).endsWith('/messages')) return Response.json({ id: 'draft-1' })
    if (String(url).endsWith('/attachments')) return Response.json({ value: [] })
    return new Response(null, { status: 202 })
  }
  const mail = createMicrosoftMail(config, fetcher)
  const saved = await mail.saveDraft({ to: 'buyer@example.com', cc: 'copy@example.com', bcc: 'blind@example.com',
    subject: 'Quote', body: '<img src=x onerror=alert(1)>\nThanks', attachments: [{ name: 'quote.pdf', contentType: 'application/pdf', contentBytes: 'cGRm' }] })
  assert.equal(saved.id, 'draft-1')
  const draftCall = calls.find(call => call.options.method === 'POST' && call.url.endsWith('/messages'))
  assert.equal(draftCall.options.headers['Content-Type'], 'application/json')
  const draftBody = JSON.parse(draftCall.options.body)
  assert.equal(draftBody.body.contentType, 'HTML')
  assert.match(draftBody.body.content, /&lt;img/)
  assert.deepEqual(draftBody.bccRecipients, [{ emailAddress: { address: 'blind@example.com' } }])
  assert.ok(calls.some(call => call.url.endsWith('/attachments') && call.options.method === 'POST' && call.options.headers['Content-Type'] === 'application/json'))
  await mail.saveDraft({ id: 'draft-1', to: 'buyer@example.com', subject: 'Updated', body: 'Updated text' })
  assert.equal(calls.find(call => call.options.method === 'PATCH' && call.url.endsWith('/messages/draft-1')).options.headers['Content-Type'], 'application/json')
  await mail.saveDraft({ to: 'buyer@example.com', subject: 'Personal', body: 'Personal text' }, 'personal-token')
  assert.equal(calls.find(call => call.url.endsWith('/me/messages') && call.options.method === 'POST').options.headers['Content-Type'], 'application/json')
  await mail.sendDraft('draft-1')
  assert.ok(calls.some(call => call.url.endsWith('/messages/draft-1/send')))
  await mail.setAction('draft-1', 'trash')
  assert.ok(calls.some(call => call.url.endsWith('/messages/draft-1/move') && JSON.parse(call.options.body).destinationId === 'deleteditems'))
})

test('Graph preserves the caller content type for binary uploads', async () => {
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), options })
    return String(url).includes('/token') ? Response.json({ access_token: 'token', expires_in: 3600 }) : new Response(null, { status: 204 })
  }
  const bytes = Buffer.from('file')
  await createMicrosoftGraph(config, fetcher).request('/drives/example/content', { method: 'PUT', body: bytes,
    headers: { 'Content-Type': 'application/octet-stream' } })
  assert.equal(calls[1].options.headers['Content-Type'], 'application/octet-stream')
  assert.equal(calls[1].options.body, bytes)
})

test('draft Graph failures retain a safe error code and distinguish save from send', async () => {
  const makeMail = failingOperation => {
    let draftCreated = false
    const fetcher = async (url, options) => {
      if (String(url).includes('/token')) return Response.json({ access_token: 'token', expires_in: 3600 })
      const path = String(url)
      if (failingOperation === 'save' && path.endsWith('/messages')) return Response.json({ error: { code: 'ErrorAccessDenied', message: 'private recipient or content detail' } }, { status: 403 })
      if (path.endsWith('/messages') && options.method === 'POST') { draftCreated = true; return Response.json({ id: 'draft-1' }) }
      if (failingOperation === 'send' && draftCreated && path.endsWith('/messages/draft-1/send')) return Response.json({ error: { code: 'ErrorAccessDenied', message: 'private recipient or content detail' } }, { status: 403 })
      return Response.json({})
    }
    return createMicrosoftMail(config, fetcher)
  }
  const draft = { to: 'buyer@example.com', subject: 'Quote', body: 'Details' }
  await assert.rejects(() => makeMail('save').saveDraft(draft), error => {
    assert.equal(error.graphStatus, 403)
    assert.equal(error.graphCode, 'ErrorAccessDenied')
    assert.doesNotMatch(error.message, /private recipient/)
    return true
  })
  const mail = makeMail('send')
  const saved = await mail.saveDraft(draft)
  await assert.rejects(() => mail.sendDraft(saved.id), error => {
    assert.equal(error.graphStatus, 403)
    assert.equal(error.graphCode, 'ErrorAccessDenied')
    assert.doesNotMatch(error.message, /private recipient/)
    return true
  })
})

test('mail delta follows a Graph page and returns the final delta link', async () => {
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), options })
    if (String(url).includes('/token')) return Response.json({ access_token: 'token', expires_in: 3600 })
    if (String(url).includes('$top=50')) return Response.json({ value: [{ id: 'one' }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users/sales%40example.com/mailFolders/inbox/messages/delta?$skiptoken=next' })
    return Response.json({ value: [{ id: 'two' }], '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/users/sales%40example.com/mailFolders/inbox/messages/delta?$deltatoken=done' })
  }
  const mail = createMicrosoftMail(config, fetcher)
  const first = await mail.delta()
  assert.equal(first.messages[0].id, 'one')
  const final = await mail.delta(first.next)
  assert.equal(final.messages[0].id, 'two')
  assert.match(final.delta, /\$deltatoken=done/)
  await assert.rejects(() => mail.delta('/users/elsewhere/messages/delta?token=x'), /Invalid mail delta token/)
})

test('mail subscriptions use the configured webhook and can be renewed', async () => {
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), options })
    if (String(url).includes('/token')) return Response.json({ access_token: 'token', expires_in: 3600 })
    return Response.json({ id: 'sub-1', expirationDateTime: '2026-10-23T01:00:00Z' })
  }
  const mail = createMicrosoftMail({ ...config, mailWebhookUrl: 'https://app.example.com/api/microsoft-notifications', mailWebhookSecret: 'x'.repeat(32) }, fetcher)
  await mail.createSubscription()
  await mail.renewSubscription('sub-1', '2026-10-23T01:30:00Z')
  assert.equal(calls[1].options.method, 'POST')
  const body = JSON.parse(calls[1].options.body)
  assert.equal(body.notificationUrl, 'https://app.example.com/api/microsoft-notifications')
  assert.equal(body.clientState, 'x'.repeat(32))
  assert.match(body.resource, /mailFolders\('inbox'\)\/messages$/)
  assert.match(calls[2].url, /subscriptions\/sub-1$/)
  assert.equal(calls[2].options.method, 'PATCH')
})

test('notification handshake echoes validation token and rejects a wrong client state', async () => {
  const secret = 'hook-secret-0123456789-0123456789'
  const { notificationHandler } = createMicrosoftHandlers({ config: { ...config, mailWebhookSecret: secret }, getClient: () => null })
  const response = () => ({ statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this }, type(value) { this.contentType = value; return this }, send(value) { this.body = value; return this }, end() { this.ended = true; return this } })
  const handshake = response()
  await notificationHandler({ method: 'GET', query: { validationToken: 'challenge' } }, handshake)
  assert.equal(handshake.statusCode, 200)
  assert.equal(handshake.body, 'challenge')
  const accepted = response()
  await notificationHandler({ method: 'POST', body: { value: [{ clientState: secret }] } }, accepted)
  assert.equal(accepted.statusCode, 202)
  const rejected = response()
  await notificationHandler({ method: 'POST', body: { value: [{ clientState: 'wrong' }] } }, rejected)
  assert.equal(rejected.statusCode, 401)
})
