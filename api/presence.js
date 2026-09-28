import { getAdminSupabaseClient } from './_supabase-client.js'

const ADMIN_ROLES = new Set(['SUPER', 'ADMIN', 'LJS'])
const ONLINE_WINDOW_MS = 2 * 60 * 1000

const clean = value => String(value || '').trim()

function adminClient() {
  return getAdminSupabaseClient()
}

async function currentProfile(client, token) {
  const { data: authData, error: authError } = await client.auth.getUser(token)
  if (authError || !authData?.user?.email) return null
  const { data, error } = await client.from('records')
    .select('data')
    .eq('entity', 'state')
    .eq('id', 'users')
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  const profile = (Array.isArray(data?.data) ? data.data : [])
    .find(user => String(user.email || '').toLowerCase() === authData.user.email.toLowerCase())
  return profile ? { auth: authData.user, isAdmin: ADMIN_ROLES.has(profile.role) } : null
}

async function onlineUserCount(client) {
  const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString()
  const { count, error } = await client.from('user_presence')
    .select('*', { count: 'exact', head: true })
    .gte('last_seen_at', cutoff)
  if (error) throw error
  return count || 0
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })
  const client = adminClient()
  if (!client) return res.status(503).json({ ok: false, error: 'Presence tracking is not configured.' })

  const token = clean(req.headers?.authorization).replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ ok: false, error: 'A signed-in session is required.' })

  let profile
  try { profile = await currentProfile(client, token) }
  catch (error) {
    console.error('Presence authentication failed:', error?.message || error)
    return res.status(502).json({ ok: false, error: 'Could not verify the signed-in user.' })
  }
  if (!profile) return res.status(403).json({ ok: false, error: 'The signed-in account is not available in this workspace.' })

  const action = req.body?.action || 'heartbeat'
  try {
    if (action === 'heartbeat') {
      const { error } = await client.from('user_presence').upsert({
        user_id: profile.auth.id,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      if (error) throw error
      return res.status(200).json({ ok: true, ...(profile.isAdmin ? { onlineCount: await onlineUserCount(client) } : {}) })
    }
    if (action === 'status') {
      if (!profile.isAdmin) return res.status(403).json({ ok: false, error: 'Only application administrators can view user presence.' })
      return res.status(200).json({ ok: true, onlineCount: await onlineUserCount(client) })
    }
    return res.status(400).json({ ok: false, error: 'Unknown presence action.' })
  } catch (error) {
    console.error('Presence request failed:', error?.message || error)
    return res.status(502).json({ ok: false, error: 'Presence tracking is temporarily unavailable.' })
  }
}
