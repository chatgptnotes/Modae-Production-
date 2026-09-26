import { supabase } from './supabase.js'

export const PURGE_CONFIRMATION = 'DELETE ALL LEADS AND OPPORTUNITIES'

export async function purgeWorkspace(confirmation) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data?.session?.access_token) throw new Error('Your Supabase administrator session has expired. Sign in again.')
  const response = await fetch('/api/purge-workspace', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ confirmation }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const reference = result.requestId || response.headers.get('x-purge-request-id')
    throw new Error([result.error || 'Workspace purge failed.', reference && `Reference: ${reference}`].filter(Boolean).join(' '))
  }
  return result
}
