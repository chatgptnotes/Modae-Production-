import { getAdminSupabaseClient } from './_supabase-client.js'
import { activeProfile } from './_user-roster.js'
import { isAccountAdmin } from '../src/userManagement.js'
import { validateAccessPolicy } from '../src/accessPolicy.js'
import { validateOpportunityNumbering } from '../src/opportunityNumbering.js'

export function createAdminPolicyHandler(getClient = getAdminSupabaseClient) {
  return async (req, res) => {
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'GET or POST only' })
    const client = getClient()
    if (!client) return res.status(503).json({ error: 'Shared settings are not configured.' })
    try {
      const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim()
      if (!token) return res.status(401).json({ error: 'Sign in to manage access rules.' })
      const { data, error } = await client.auth.getUser(token)
      if (error || !data?.user) return res.status(401).json({ error: 'Your session has expired.' })
      const actor = await activeProfile(client, data.user)
      if (!actor || !isAccountAdmin(actor)) return res.status(403).json({ error: 'Only active administrators can manage access rules.' })
      if (req.method === 'POST') {
        const { accessPolicy, opportunityNumbering, rev, reason } = req.body || {}
        const policy = validateAccessPolicy(accessPolicy)
        let numbering
        const errors = [...policy.errors]
        try { numbering = validateOpportunityNumbering(opportunityNumbering) } catch (error) { errors.push(error.message) }
        if (!Number.isSafeInteger(rev) || rev < 0) errors.push('Reload the current settings before saving.')
        if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000) errors.push('Enter a reason of 1–1000 characters.')
        if (errors.length) return res.status(400).json({ error: errors.join(' ') })
        const saved = await client.rpc('save_access_policy', { p_policy: policy.policy, p_numbering: numbering,
          p_rev: rev, p_reason: reason.trim(), p_actor_id: data.user.id })
        if (saved.error) throw saved.error
      }
      const current = await client.from('settings').select('data,rev').eq('id', 'config').is('deleted_at', null).maybeSingle()
      if (current.error) throw current.error
      return res.status(200).json({ config: current.data?.data || {}, rev: Number(current.data?.rev) || 0 })
    } catch (error) {
      const status = error.code === '40001' ? 409 : error.code === '42501' ? 403 : 503
      return res.status(status).json({ error: status === 409 ? 'Settings changed in another session. Reload before saving.' : 'Could not save access rules. Check the database migrations and retry.' })
    }
  }
}
export default createAdminPolicyHandler()
