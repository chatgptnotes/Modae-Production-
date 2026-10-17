import { workspaceDeploymentHeaders } from './workspaceDeployment.js'
import { supabaseAuth } from './supabase.js'

let workspaceGeneration = ''
export const getWorkspaceGeneration = () => workspaceGeneration

const rememberWorkspaceGeneration = response => {
  const generation = response.headers.get('x-workspace-generation')
  if (generation) workspaceGeneration = generation
}

async function responseError(response, fallback) {
  const body = await response.json().catch(() => ({}))
  const error = new Error(body?.error || `${fallback} (${response.status})`)
  error.status = response.status
  error.code = body?.errorCode || body?.code || ''
  error.details = body?.details || ''
  error.hint = body?.hint || ''
  return error
}

export async function fetchWorkspace(token, fetcher = fetch, { isCurrent = () => true, identityOnly = false } = {}) {
  const response = await fetcher(`/api/workspace/bootstrap${identityOnly ? '?scope=identity' : ''}`, {
    headers: { ...workspaceDeploymentHeaders(), Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw await responseError(response, 'Workspace bootstrap failed')
  const body = await response.json()
  if (!isCurrent()) throw new Error('Session changed.')
  rememberWorkspaceGeneration(response)
  return body.data || {}
}

export async function saveWorkspace(token, dirty, fetcher = fetch) {
  const headers = { ...workspaceDeploymentHeaders(),
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(workspaceGeneration ? { 'x-workspace-generation': workspaceGeneration } : {}),
  }
  const response = await fetcher('/api/workspace/save', {
    method: 'POST',
    headers,
    body: JSON.stringify({ dirty }),
  })
  rememberWorkspaceGeneration(response)
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

export async function importWorkspaceWorkbook(importData, { action = 'preview', reviewToken = '' } = {}, fetcher = fetch) {
  const { data } = await supabaseAuth?.getSession?.() || {}
  const token = data?.session?.access_token
  if (!token) throw new Error('A signed-in admin session is required.')
  const response = await fetcher('/api/workspace/import', {
    method: 'POST', headers: { ...workspaceDeploymentHeaders(), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, importData, reviewToken }),
  })
  if (!response.ok) throw await responseError(response, 'Workbook import failed')
  return response.json()
}

export async function convertLeadOnServer(leadId, leadRev, opportunity, fetcher = fetch) {
  const { data } = await supabaseAuth?.getSession?.() || {}
  const token = data?.session?.access_token
  if (!token) throw new Error('Sign in before converting a lead.')
  const response = await fetcher('/api/workspace/data', {
    method:'POST', headers:{...workspaceDeploymentHeaders(),Authorization:`Bearer ${token}`,'Content-Type':'application/json','x-workspace-generation':getWorkspaceGeneration()},
    body:JSON.stringify({operation:'lead_conversion',leadId,leadRev,opportunity}),
  })
  if (!response.ok) throw await responseError(response,'Lead conversion failed')
  return (await response.json()).data
}

export async function fetchWorkspaceView(view, { isCurrent = () => true } = {}, fetcher = fetch) {
  const { data } = await supabaseAuth?.getSession?.() || {}
  const token = data?.session?.access_token
  if (!token) throw new Error('Sign in before loading workspace data.')
  const response = await fetcher('/api/workspace/data', {
    method: 'POST', headers: { ...workspaceDeploymentHeaders(), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation: 'view', view }),
  })
  if (!response.ok) throw await responseError(response, 'Workspace view failed')
  const result = await response.json()
  if (!isCurrent()) throw new Error('Session changed.')
  if (workspaceGeneration && result.generation !== workspaceGeneration) throw Object.assign(new Error('The workspace changed. Reload before continuing.'), { code: 'WORKSPACE_PURGED', status: 409 })
  return result
}
