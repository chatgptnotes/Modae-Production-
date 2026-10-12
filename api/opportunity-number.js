import { getAdminSupabaseClient } from './_supabase-client.js'
import { isActiveUser, matchesAccount } from '../src/userManagement.js'
import { canAccessPage, canPerform } from '../src/accessPolicy.js'

export function createOpportunityNumberHandler({ getClient = getAdminSupabaseClient } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
    const token = String(req.headers?.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1]
    if (!token) return res.status(401).json({ error: 'A signed-in session is required.' })
    const client = getClient()
    if (!client) return res.status(503).json({ error: 'Opportunity numbering is not configured.' })
    try {
      const { data: auth, error: authError } = await client.auth.getUser(token)
      if (authError || !auth?.user) return res.status(401).json({ error: 'Your session is no longer valid.' })
      const { data: roster, error: rosterError } = await client.from('records').select('data').eq('entity', 'state').eq('id', 'users').is('deleted_at', null).maybeSingle()
      if (rosterError) throw rosterError
      const profile = (Array.isArray(roster?.data) ? roster.data : []).find(p => matchesAccount(p, auth.user))
      if (!isActiveUser(profile)) return res.status(403).json({ error: 'This workspace account is not active.' })
      const { data: settings, error: settingsError } = await client.from('settings').select('data').eq('id', 'config').is('deleted_at', null).maybeSingle()
      if (settingsError) throw settingsError
      const config = settings?.data || {}
      if (!canPerform(profile, 'opportunities.create', config) || !['new', 'inbox', 'tender'].some(page => canAccessPage(profile, page, config))) return res.status(403).json({ error: 'You do not have permission to create opportunities.' })
      const { data: id, error } = await client.rpc('reserve_opportunity_number', { p_actor_id: auth.user.id })
      if (error) throw error
      if (typeof id !== 'string' || !id) throw new Error('Invalid reservation response')
      return res.status(200).json({ id })
    } catch (error) {
      console.error('Opportunity reservation failed:', error?.message || error)
      return res.status(502).json({ error: 'Could not reserve an opportunity number. Please retry.' })
    }
  }
}
export default createOpportunityNumberHandler()
