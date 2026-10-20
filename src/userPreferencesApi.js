import { supabaseAuth } from './supabase.js'

export function createUserPreferencesRequest(userId, auth = supabaseAuth, fetcher = fetch) {
  return async (method, payload) => {
    const { data } = await auth?.getSession?.() || {}
    const session = data?.session
    if (!session?.access_token || session.user?.id !== userId) throw new Error('Sign in again to manage your preferences.')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)
    try {
      const response = await fetcher('/api/user-preferences', {
        method, signal: controller.signal, cache: 'no-store',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      })
      const body = await response.json()
      if (!response.ok) throw Object.assign(new Error(body.error || 'Could not save preferences. Please retry.'), { status: response.status })
      return body
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Preferences did not respond. Reload settings before retrying.')
      throw error
    } finally { clearTimeout(timeout) }
  }
}
