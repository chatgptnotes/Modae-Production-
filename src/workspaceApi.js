import { supabaseAuth } from './supabase.js'

async function responseError(response, fallback) {
  const body = await response.json().catch(() => ({}))
  const error = new Error(body?.error || `${fallback} (${response.status})`)
  error.status = response.status
  error.code = body?.errorCode || ''
  error.details = body?.details || ''
  error.hint = body?.hint || ''
  return error
}

export async function fetchWorkspace(token, fetcher = fetch) {
  const response = await fetcher('/api/workspace/bootstrap', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw await responseError(response, 'Workspace bootstrap failed')
  const body = await response.json()
  return body.data || {}
}

export async function saveWorkspace(token, dirty, fetcher = fetch) {
  const response = await fetcher('/api/workspace/save', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ dirty }),
  })
  if (!response.ok) throw await responseError(response, 'Workspace save failed')
}

export async function loadWorkspaceFromServer() {
  const { data } = await supabaseAuth?.getSession?.() || {}
  const token = data?.session?.access_token
  if (!token) return null
  return fetchWorkspace(token)
}

export async function saveWorkspaceToServer(dirty) {
  const { data } = await supabaseAuth?.getSession?.() || {}
  const token = data?.session?.access_token
  if (!token) return false
  await saveWorkspace(token, dirty)
  return true
}
