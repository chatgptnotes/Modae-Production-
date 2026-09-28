import assert from 'node:assert/strict'
import test from 'node:test'
import { assertRuntimeConfig } from '../src/server/config.ts'

const production = (overrides: Record<string, string | undefined> = {}) => ({
  NODE_ENV: 'production',
  PORT: '3000',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  SUPABASE_ANON_KEY: 'anon-key',
  CORS_ORIGINS: 'https://app.superbees.example',
  ...overrides,
})

test('runtime config parses the port and deployment settings', () => {
  const config = assertRuntimeConfig(production({
    GMAIL_ACCOUNT: 'sales@example.com',
    GMAIL_APP_PASSWORD: 'app-password',
  }))
  assert.equal(config.port, 3000)
  assert.deepEqual(config.corsOrigins, ['https://app.superbees.example'])
  assert.equal(config.gmailAccount, 'sales@example.com')
})

test('production config fails when Supabase anonymous key is missing', () => {
  assert.throws(
    () => assertRuntimeConfig(production({ SUPABASE_ANON_KEY: '' })),
    /SUPABASE_ANON_KEY/,
  )
})

test('production config rejects partial Gmail configuration', () => {
  assert.throws(
    () => assertRuntimeConfig(production({ GMAIL_ACCOUNT: 'sales@example.com' })),
    /GMAIL_ACCOUNT.*GMAIL_APP_PASSWORD|GMAIL_APP_PASSWORD.*GMAIL_ACCOUNT/,
  )
})

test('development config can omit optional integrations', () => {
  const config = assertRuntimeConfig({ NODE_ENV: 'development', PORT: '3001' })
  assert.equal(config.port, 3001)
  assert.deepEqual(config.corsOrigins, [])
})
