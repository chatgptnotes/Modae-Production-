import { createClient } from '@supabase/supabase-js'

let cachedAdminClient
let cachedConfigKey = ''

const clean = value => String(value || '').trim()

export function getAdminSupabaseClient() {
  const url = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!/^https?:\/\/.+/i.test(url) || !serviceKey) return null

  const configKey = `${url}\n${serviceKey}`
  if (cachedAdminClient && cachedConfigKey === configKey) return cachedAdminClient

  cachedConfigKey = configKey
  cachedAdminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cachedAdminClient
}
