import { supabaseAuth } from './supabase.js'

async function request(method, payload) {
  const { data } = await supabaseAuth?.getSession?.() || {}
  if (!data?.session?.access_token) throw new Error('Sign in to manage access rules.')
  const response = await fetch('/api/admin-policy', { method,
    headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
    ...(payload ? { body: JSON.stringify(payload) } : {}) })
  const body = await response.json()
  if (!response.ok) throw Object.assign(new Error(body.error || 'Access rule request failed.'), { status: response.status })
  return body
}
export const readAdminPolicy = () => request('GET')
export const saveAdminPolicy = payload => request('POST', payload)
