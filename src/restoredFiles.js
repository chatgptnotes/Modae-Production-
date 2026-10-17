import { supabase } from './supabase.js'

async function request(operation, scope) {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (!data?.session?.access_token) return null
  const response = await fetch('/api/restored-files', { method:'POST',headers:{ Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json' },body:JSON.stringify({operation,...scope}) })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || 'Could not access restored documents.')
  return body
}
export const listRestoredFiles = async scope => (await request('list',scope))?.files || []
export const retireRestoredFiles = async scope => (await request('retire',scope))?.retired || 0
export async function getRestoredFile(scope) {
  const file = (await request('get',scope))?.file
  if (!file) return null
  const { base64, ...meta } = file
  return { ...meta, blob:new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],{type:meta.type || 'application/octet-stream'}) }
}
