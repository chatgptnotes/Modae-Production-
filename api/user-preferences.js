import { getAdminSupabaseClient } from './_supabase-client.js'
import { activeProfile } from './_user-roster.js'
import { FONT_CHOICES } from '../src/fontChoices.js'

const fonts = new Set(FONT_CHOICES.map(font => font.id))
const fail = (message, status) => { throw Object.assign(new Error(message), { status }) }

export function createUserPreferencesHandler({ getClient = getAdminSupabaseClient } = {}) {
  return async (req, res) => {
    res.setHeader?.('Cache-Control', 'private, no-store')
    if (!['GET', 'PUT'].includes(req.method)) {
      res.setHeader?.('Allow', 'GET, PUT')
      return res.status(405).json({ error: 'GET or PUT only.' })
    }
    try {
      const token = /^Bearer\s+(.+)$/i.exec(String(req.headers?.authorization || '').trim())?.[1]?.trim()
      if (!token) fail('Sign in to access your preferences.', 401)
      const client = getClient()
      if (!client) fail('User preferences are not configured.', 503)
      const auth = await client.auth.getUser(token)
      if (auth.error || !auth.data?.user?.id) fail('Your session has expired.', 401)
      if (!await activeProfile(client, auth.data.user)) fail('This account no longer has workspace access.', 403)
      const id = auth.data.user.id
      const input = req.body
      if (req.method === 'PUT' && (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).length !== 2 || !Object.hasOwn(input, 'font') || !Object.hasOwn(input, 'rev')
        || !fonts.has(input.font) || !Number.isSafeInteger(input.rev) || input.rev < 0 || input.rev >= Number.MAX_SAFE_INTEGER)) {
        fail('Choose a supported font and a valid preference revision.', 400)
      }
      const current = await client.from('records').select('data,rev,deleted_at').eq('entity', 'user_preferences').eq('id', id).maybeSingle()
      if (current.error) throw current.error
      const rev = current.data?.rev ?? 0
      if (req.method === 'GET') {
        const font = !current.data?.deleted_at && fonts.has(current.data?.data?.font) ? current.data.data.font : 'candara'
        return res.status(200).json({ font, rev })
      }
      // save_rows checks concurrent updates; checking here also rejects a stale
      // nonzero revision when the row has never existed.
      if (input.rev !== rev) fail('Your preferences changed in another session. Reload and try again.', 409)
      const result = await client.rpc('save_rows', { p_entity: 'user_preferences', p_rows: [{ id, rev: input.rev, data: { font: input.font }, by: id }] })
      if (result.error) throw result.error
      if (result.data?.conflicts?.length || !result.data?.accepted?.includes(id)) fail('Your preferences changed in another session. Reload and try again.', 409)
      return res.status(200).json({ font: input.font, rev: input.rev + 1 })
    } catch (error) {
      const status = error.code === '40001' ? 409 : error.status || 503
      return res.status(status).json({ error: status === 503 ? 'User preferences are temporarily unavailable. Try again.' : status === 409 ? 'Your preferences changed in another session. Reload and try again.' : error.message })
    }
  }
}

export default createUserPreferencesHandler()
