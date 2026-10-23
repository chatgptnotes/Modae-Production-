import { supabaseAuth } from './supabase.js'

export async function microsoftRequest(operation, data = {}, { method = 'GET', raw = false } = {}) {
  const { data: session } = await supabaseAuth?.getSession?.() || {}
  const token = session?.session?.access_token
  if (!token) throw new Error('Sign in to the shared workspace first.')
  const query = method === 'GET' ? `?${new URLSearchParams({ operation, ...data })}` : ''
  const response = await fetch(`/api/microsoft${query}`, { method,
    headers: { Authorization: `Bearer ${token}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
    ...(method === 'POST' ? { body: JSON.stringify({ operation, ...data }) } : {}) })
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    const message = result.error || `Microsoft request failed (HTTP ${response.status}).`
    throw new Error(/unsupported microsoft request/i.test(message)
      ? `${message} Restart the local dev server so it loads the current Microsoft API routes.`
      : message)
  }
  return raw ? response : response.status === 204 ? null : response.json()
}

export async function personalOutlookRequest(operation) {
  const { data: session } = await supabaseAuth?.getSession?.() || {}
  const token = session?.session?.access_token
  if (!token) throw new Error('Sign in to WinTrack first.')
  const response = await fetch('/api/microsoft-auth', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ operation }) })
  const data = response.status === 204 ? null : await response.json()
  if (!response.ok) throw new Error(data?.error || 'Could not connect Outlook.')
  return data
}

export const fileBase64 = file => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
  reader.onerror = () => reject(new Error('Could not read the file.'))
  reader.readAsDataURL(file)
})
