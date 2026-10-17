import test from 'node:test'
import assert from 'node:assert/strict'
import { encryptIntegrations, decryptIntegrations, publicIntegrations, activeAiConnection } from '../api/_ai-integrations.js'
import { AI_PROVIDERS, normalizeModel, providerRequest, providerText, listProviderModels, generateProvider } from '../api/_ai-providers.js'
import { createAdminIntegrationsHandler } from '../api/admin-integrations.js'
import { useLocalAiFallback } from '../src/ai.js'
import { assertNoApprovalCommandWrite } from '../src/approvalWriteGuard.js'

process.env.NODE_ENV = 'test'
const key = 'private-provider-test-key'
const geminiBody = { contents: [{ parts: [{ text: 'Extract evidence' }, { inlineData: { mimeType: 'application/pdf', data: 'JVBERg==' } }, { inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } }] }], generationConfig: { maxOutputTokens: 2048, responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' } } } } }
const capabilities = { text: true, image: true, pdf: true }
const res = () => ({ statusCode: 0, body: null, setHeader() {}, status(n) { this.statusCode = n; return this }, json(body) { this.body = body; return this } })
function client({ admin = true, row = null, conflict = false } = {}) {
  const calls = []
  return { calls, auth: { getUser: async () => ({ data: { user: { id: 'actor', email: 'admin@example.com' } } }) },
    from(table) { const chain = { select() { return chain }, eq() { return chain }, is() { return chain },
      maybeSingle: async () => ({ data: table === 'records' ? { data: [{ id: 'actor', email: 'admin@example.com', status: 'Active', role: admin ? 'ADMIN' : 'RS' }] } : row }) }; return chain },
    rpc: async (name, args) => { calls.push({ name, args }); return conflict ? { error: { code: '40001' } } : { data: args.p_rev + 1 } },
  }
}
const req = body => ({ method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer token' }, body })
const catalogue = [{ name: 'models/gemini-dynamic-test', supportedGenerationMethods: ['generateContent'] }]
const fetcher = async url => ({ ok: true, status: 200, json: async () => url.endsWith(':generateContent') ? { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] } : { models: catalogue } })

test('integration credentials are authenticated encryption and public metadata never contains keys', () => {
  const before = process.env.INTEGRATIONS_ENCRYPTION_KEY
  process.env.INTEGRATIONS_ENCRYPTION_KEY = 'ab'.repeat(32)
  try {
    const config = { rev: 1, providers: { gemini: { key, enabled: true } }, text: null, document: null }
    const encrypted = encryptIntegrations(config)
    assert.deepEqual(decryptIntegrations(encrypted), config)
    assert.ok(!JSON.stringify(encrypted).includes(key))
    assert.ok(!JSON.stringify(publicIntegrations(config)).includes(key))
    assert.throws(() => decryptIntegrations({ ...encrypted, ciphertext: 'AAAA' }))
    process.env.INTEGRATIONS_ENCRYPTION_KEY = 'cd'.repeat(32)
    assert.throws(() => decryptIntegrations(encrypted))
  } finally { if (before === undefined) delete process.env.INTEGRATIONS_ENCRYPTION_KEY; else process.env.INTEGRATIONS_ENCRYPTION_KEY = before }
})
test('all provider adapters use fixed endpoints and normalize their output', () => {
  for (const provider of Object.keys(AI_PROVIDERS)) {
    const request = providerRequest(provider, 'dynamic-model', key, { ...geminiBody, contents: [{ parts: [{ text: 'Hello' }] }] }, capabilities)
    assert.ok(request.url.startsWith(AI_PROVIDERS[provider].base))
    assert.ok(!request.url.includes(key))
    const output = provider === 'gemini' ? { candidates: [{ content: { parts: [{ text: 'hello' }] } }] }
      : provider === 'anthropic' ? { content: [{ type: 'thinking', thinking: 'private' }, { type: 'text', text: 'hello' }] }
        : { choices: [{ message: { content: 'hello' } }] }
    assert.equal(providerText(provider, output), 'hello')
  }
})
test('PDF and image bytes survive Gemini, Claude, OpenAI and OpenRouter transport', () => {
  for (const provider of ['gemini', 'anthropic', 'openai', 'openrouter']) {
    const request = providerRequest(provider, 'dynamic-model', key, geminiBody, capabilities)
    assert.ok(JSON.stringify(request.body).includes('JVBERg=='))
    assert.ok(JSON.stringify(request.body).includes('aW1hZ2U='))
  }
  for (const provider of ['deepseek', 'mistral', 'xai']) assert.throws(() => providerRequest(provider, 'text-model', key, geminiBody, { text: true, image: false, pdf: false }), /does not support/)
})
test('model catalogue filtering excludes unsuitable models and respects explicit capabilities', async () => {
  assert.equal(normalizeModel('openai', { id: 'text-embedding-3-large' }).text, false)
  assert.equal(normalizeModel('openai', { id: 'gpt-image-1' }).text, false)
  assert.equal(normalizeModel('openrouter', { id: 'vendor/model', architecture: { input_modalities: ['text'], output_modalities: ['image'] } }).text, false)
  assert.equal(normalizeModel('mistral', { id: 'dynamic', capabilities: { completion_chat: true, vision: true } }).image, true)
  assert.equal(normalizeModel('mistral', { id: 'dynamic', capabilities: { completion_chat: true, vision: true } }).pdf, false)
  const models = await listProviderModels('gemini', key, fetcher)
  assert.equal(models[0].id, 'gemini-dynamic-test')
})
test('failed provider requests expose only sanitized errors', async () => {
  await assert.rejects(() => generateProvider({ provider: 'openai', model: 'gpt-dynamic', key, requestBody: { contents: [{ parts: [{ text: 'test' }] }] }, fetcher: async () => ({ ok: false, status: 401, json: () => { throw new Error(key) } }) }), error => error.code === 'AI_KEY_REJECTED' && !error.message.includes(key))
})
test('integration endpoint requires a connected active administrator', async () => {
  const local = res(); await createAdminIntegrationsHandler(() => null)(req(), local); assert.equal(local.statusCode, 503)
  const denied = res(); await createAdminIntegrationsHandler(() => client({ admin: false }))(req(), denied); assert.equal(denied.statusCode, 403)
  const noToken = res(); await createAdminIntegrationsHandler(() => client())({ method: 'GET', headers: {} }, noToken); assert.equal(noToken.statusCode, 401)
})
test('successful saves encrypt keys and use revision checked atomic RPC; failures do not save', async () => {
  const before = process.env.INTEGRATIONS_ENCRYPTION_KEY; process.env.INTEGRATIONS_ENCRYPTION_KEY = 'ab'.repeat(32)
  try {
    const db = client(), response = res(), selection = { provider: 'gemini', model: 'gemini-dynamic-test' }
    await createAdminIntegrationsHandler(() => db, fetcher)(req({ operation: 'save', provider: 'gemini', key, rev: 0, text: selection, document: selection }), response)
    assert.equal(response.statusCode, 200)
    assert.equal(db.calls[0].name, 'save_ai_integrations')
    assert.ok(!JSON.stringify(response.body).includes(key)); assert.ok(!JSON.stringify(db.calls).includes(key))
    assert.equal(decryptIntegrations({ ciphertext: db.calls[0].args.p_ciphertext, iv: db.calls[0].args.p_iv }).providers.gemini.key, key)
    const conflictResponse = res(), conflictDb = client({ conflict: true })
    await createAdminIntegrationsHandler(() => conflictDb, fetcher)(req({ operation: 'save', provider: 'gemini', key, rev: 0 }), conflictResponse)
    assert.equal(conflictResponse.statusCode, 409)
    const failed = res(), failedDb = client()
    await createAdminIntegrationsHandler(() => failedDb, async () => ({ ok: false, status: 401 }))(req({ operation: 'save', provider: 'gemini', key, rev: 0 }), failed)
    assert.equal(failedDb.calls.length, 0)
    assert.equal(failed.statusCode, 502)
  } finally { if (before === undefined) delete process.env.INTEGRATIONS_ENCRYPTION_KEY; else process.env.INTEGRATIONS_ENCRYPTION_KEY = before }
})
test('active configuration never falls back after provider disable and retains env only before activation', async () => {
  const before = process.env.INTEGRATIONS_ENCRYPTION_KEY; process.env.INTEGRATIONS_ENCRYPTION_KEY = 'ab'.repeat(32)
  try {
    assert.equal((await activeAiConnection(null)).provider, 'gemini')
    const row = { ...encryptIntegrations({ providers: { gemini: { key, enabled: false } }, text: { provider: 'gemini', model: 'selected' } }), rev: 1 }
    await assert.rejects(() => activeAiConnection(client({ row })), /disabled/)
    const active = { ...encryptIntegrations({ providers: { openai: { key, enabled: true } }, text: { provider: 'openai', model: 'selected', capabilities } }), rev: 2 }
    assert.equal((await activeAiConnection(client({ row: active }))).model, 'selected')
  } finally { if (before === undefined) delete process.env.INTEGRATIONS_ENCRYPTION_KEY; else process.env.INTEGRATIONS_ENCRYPTION_KEY = before }
})
test('explicitly disabling the active provider retains its selections and stops tasks without fallback', async () => {
  const before = process.env.INTEGRATIONS_ENCRYPTION_KEY; process.env.INTEGRATIONS_ENCRYPTION_KEY = 'ab'.repeat(32)
  try {
    const selection = { provider: 'gemini', model: 'gemini-dynamic-test', capabilities }
    const document = { provider: 'openai', model: 'gpt-selected', capabilities }
    const row = { ...encryptIntegrations({ providers: { gemini: { key, enabled: true }, openai: { key: 'unavailable-other-provider', enabled: true } }, text: selection, document }), rev: 3 }
    const db = client({ row }), response = res()
    await createAdminIntegrationsHandler(() => db, () => { throw new Error('Disabling must not require an upstream request, including unchanged other providers') })(req({ operation: 'save', provider: 'gemini', enabled: false, rev: 3, text: selection, document }), response)
    assert.equal(response.statusCode, 200)
    assert.equal(response.body.providers.gemini.enabled, false)
    const encrypted = db.calls[0].args
    await assert.rejects(() => activeAiConnection(client({ row: { ciphertext: encrypted.p_ciphertext, iv: encrypted.p_iv, rev: 4 } })), /disabled/)
  } finally { if (before === undefined) delete process.env.INTEGRATIONS_ENCRYPTION_KEY; else process.env.INTEGRATIONS_ENCRYPTION_KEY = before }
})
test('connected AI sessions always consult server configuration despite a legacy fallback preference', () => {
  assert.equal(useLocalAiFallback(true, 'authenticated-session-token'), false)
  assert.equal(useLocalAiFallback(true, undefined), true)
  assert.equal(useLocalAiFallback(false, undefined), false)
})
test('generic writes cannot create, alter or rename AI integration and backup receipts', () => {
  for (const [prefix, kind] of [['AI-INTEGRATIONS:', 'ai_integration_command'], ['BACKUP-RESTORE:', 'backup_restore_command']]) {
    assert.throws(() => assertNoApprovalCommandWrite('audit', null, { id: `${prefix}forged` }), /server-owned/)
    assert.throws(() => assertNoApprovalCommandWrite('audit', { id: `${prefix}original` }, { id: 'ordinary' }), /server-owned/)
    assert.throws(() => assertNoApprovalCommandWrite('audit', null, { id: 'ordinary', kind }), /server-owned/)
    assert.throws(() => assertNoApprovalCommandWrite('audit', { id: 'ordinary', kind }, { id: 'ordinary' }), /server-owned/)
  }
  assert.doesNotThrow(() => assertNoApprovalCommandWrite('audit', null, { id: 'ordinary', action: 'normal edit' }))
})
