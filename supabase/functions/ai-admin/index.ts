// Temporary demo AI credential setup for the Admin page. Real work auth will
// replace the role header; the provider key is written to Vault and is never
// returned to the browser.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encryptAiSecret } from '../_shared/aiSecret.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wintrack-role',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS, 'Content-Type': 'application/json' },
})

const url = Deno.env.get('SUPABASE_URL') ?? ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const db = url && serviceKey ? createClient(url, serviceKey) : null

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405)
  if (!db) return json({ ok: false, error: 'AI setup is not configured on the server' }, 503)

  let body: { apiKey?: string }
  try { body = await req.json() } catch { return json({ ok: false, error: 'Malformed request body' }, 400) }
  const role = req.headers.get('x-wintrack-role')
  if (role !== 'SUPER' && role !== 'ADMIN') return json({ ok: false, error: 'Only Super Admin or Admin may configure AI' }, 403)
  const key = String(body.apiKey ?? '').trim()
  if (key.length < 20 || key.length > 500) return json({ ok: false, error: 'Invalid API key' }, 400)

  const encrypted = await encryptAiSecret(key, serviceKey)
  const { error } = await db.from('ai_secrets').upsert({
    name: 'gemini_api_key', ...encrypted, updated_at: new Date().toISOString(), updated_by: role,
  })
  if (error) {
    console.error('Encrypted AI setup failed', error.message)
    return json({ ok: false, error: 'Could not save the AI key securely' }, 500)
  }
  return json({ ok: true, configured: true, message: 'AI key saved securely' })
})
