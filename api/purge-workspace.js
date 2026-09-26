import { createClient } from '@supabase/supabase-js'

const PURGE_CONFIRMATION = 'DELETE ALL LEADS AND OPPORTUNITIES'
const PURGE_ROLES = new Set(['SUPER', 'ADMIN', 'LJS'])

const clean = value => String(value || '').trim()
const jsonBody = req => {
  try { return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}) }
  catch { return null }
}

function adminClient() {
  const url = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!/^https?:\/\/.+/i.test(url) || !serviceKey) return null
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function currentPurgeAdmin(client, token) {
  const { data: authData, error: authError } = await client.auth.getUser(token)
  if (authError || !authData?.user?.email) return null
  const { data, error } = await client.from('records')
    .select('data')
    .eq('entity', 'state')
    .eq('id', 'users')
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  const profiles = Array.isArray(data?.data) ? data.data : []
  const profile = profiles.find(user => String(user.email || '').toLowerCase() === authData.user.email.toLowerCase())
  return profile && PURGE_ROLES.has(profile.role) ? profile : null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })
  const client = adminClient()
  if (!client) return res.status(503).json({ ok: false, error: 'Server-side Supabase administration is not configured.' })

  const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ ok: false, error: 'A Supabase administrator session is required.' })

  let admin
  try { admin = await currentPurgeAdmin(client, token) }
  catch (error) {
    console.error('Workspace purge authorization failed:', error?.message || error)
    return res.status(502).json({ ok: false, error: 'Could not verify the administrator account.' })
  }
  if (!admin) return res.status(403).json({ ok: false, error: 'Only SUPER, ADMIN, or LJS users can permanently purge the workspace.' })

  const body = jsonBody(req)
  if (!body || body.confirmation !== PURGE_CONFIRMATION) {
    return res.status(400).json({ ok: false, error: `Type ${PURGE_CONFIRMATION} exactly to continue.` })
  }

  try {
    const { data, error } = await client.rpc('purge_workspace_data')
    if (error) throw error
    return res.status(200).json({ ok: true, counts: data || {} })
  } catch (error) {
    console.error('Workspace purge failed:', error?.message || error)
    return res.status(502).json({ ok: false, error: 'The workspace purge did not complete. No browser data was cleared.' })
  }
}
