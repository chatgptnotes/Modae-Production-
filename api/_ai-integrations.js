import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { AI_PROVIDERS, ProviderError } from './_ai-providers.js'
export const INTEGRATION_ID = 'workspace-ai-integrations'
function encryptionKey() {
  const value = String(process.env.INTEGRATIONS_ENCRYPTION_KEY || '')
  const key = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64')
  if (key.length !== 32) throw new ProviderError('Configure INTEGRATIONS_ENCRYPTION_KEY with a 32-byte base64 or hexadecimal key.', 503, 'AI_ENCRYPTION_UNAVAILABLE')
  return key
}
export function encryptIntegrations(value) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  cipher.setAAD(Buffer.from(INTEGRATION_ID))
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final(), cipher.getAuthTag()])
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64') }
}
export function decryptIntegrations(row) {
  const bytes = Buffer.from(row.ciphertext, 'base64'), decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(row.iv, 'base64'))
  decipher.setAAD(Buffer.from(INTEGRATION_ID)); decipher.setAuthTag(bytes.subarray(-16))
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]).toString('utf8'))
}
export async function readIntegrations(client) {
  if (!client) return { rev: 0, providers: {}, text: null, document: null }
  const result = await client.from('ai_secrets').select('ciphertext,iv,rev').eq('id', INTEGRATION_ID).maybeSingle()
  if (result.error) throw new ProviderError('Could not read AI configuration. Check the integration migration.', 503, 'AI_CONFIG_UNAVAILABLE')
  if (!result.data) return { rev: 0, providers: {}, text: null, document: null }
  try { return { ...decryptIntegrations(result.data), rev: Number(result.data.rev) } }
  catch { throw new ProviderError('AI configuration cannot be decrypted. Restore the configured encryption key.', 503, 'AI_CONFIG_UNAVAILABLE') }
}
export function publicIntegrations(config) {
  return { rev: config.rev, text: config.text, document: config.document,
    providers: Object.fromEntries(Object.entries(AI_PROVIDERS).map(([id, spec]) => [id, {
      name: spec.name, enabled: config.providers[id]?.enabled === true,
      configured: Boolean(config.providers[id]?.key), credential: config.providers[id]?.key ? '••••••••' : '',
    }])) }
}
export async function activeAiConnection(client, hasFiles = false) {
  const config = await readIntegrations(client)
  const selection = hasFiles ? config.document : config.text
  if (!selection) {
    return { provider: 'gemini', model: 'gemini-3.6-flash', key: String(process.env.GEMINI_API_KEY || '').trim() }
  }
  const connection = config.providers[selection.provider]
  if (!connection?.enabled || !connection.key) throw new ProviderError('The selected AI connection is disabled or missing credentials.', 503, 'AI_KEY_MISSING')
  return { ...selection, key: connection.key }
}
