import { getAdminSupabaseClient } from './_supabase-client.js'
import { activeProfile } from './_user-roster.js'
import { FONT_CHOICES } from '../src/fontChoices.js'
import { normalizeUserPreferences } from '../src/userFontPreferences.js'
import { MIN_INBOX_PREVIEW_WIDTH, MAX_INBOX_PREVIEW_WIDTH } from '../src/userFontPreferences.js'

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
        || Object.keys(input).length < 2 || Object.keys(input).some(key => !['font', 'sidebarCompact', 'leadDetailsCollapsed', 'inboxPreviewWidth', 'rev'].includes(key))
        || (Object.hasOwn(input, 'font') && !fonts.has(input.font))
        || ['sidebarCompact', 'leadDetailsCollapsed'].some(key => Object.hasOwn(input, key) && typeof input[key] !== 'boolean')
        || (Object.hasOwn(input, 'inboxPreviewWidth') && (!Number.isInteger(input.inboxPreviewWidth)
          || input.inboxPreviewWidth < MIN_INBOX_PREVIEW_WIDTH || input.inboxPreviewWidth > MAX_INBOX_PREVIEW_WIDTH))
        || !Number.isSafeInteger(input.rev) || input.rev < 0 || input.rev >= Number.MAX_SAFE_INTEGER)) {
        fail('Choose supported preferences and a valid preference revision.', 400)
      }
      const current = await client.from('records').select('data,rev,deleted_at').eq('entity', 'user_preferences').eq('id', id).maybeSingle()
      if (current.error) throw current.error
      const rev = current.data?.rev ?? 0
      const preferences = normalizeUserPreferences(current.data?.deleted_at ? null : current.data?.data)
      if (req.method === 'GET') {
        return res.status(200).json({ ...preferences, rev })
      }
      // save_rows checks concurrent updates; checking here also rejects a stale
      // nonzero revision when the row has never existed.
      if (input.rev !== rev) fail('Your preferences changed in another session. Reload and try again.', 409)
      const { rev: submittedRev, ...patch } = input
      const saved = { ...preferences, ...patch }
      const result = await client.rpc('save_rows', { p_entity: 'user_preferences', p_rows: [{ id, rev: submittedRev, data: saved, by: id }] })
      if (result.error) throw result.error
      if (result.data?.conflicts?.length || !result.data?.accepted?.includes(id)) fail('Your preferences changed in another session. Reload and try again.', 409)
      return res.status(200).json({ ...saved, rev: input.rev + 1 })
    } catch (error) {
      const status = error.code === '40001' ? 409 : error.status || 503
      return res.status(status).json({ error: status === 503 ? 'User preferences are temporarily unavailable. Try again.' : status === 409 ? 'Your preferences changed in another session. Reload and try again.' : error.message })
    }
  }
}

export default createUserPreferencesHandler()
