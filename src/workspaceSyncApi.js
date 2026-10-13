import { workspaceDeploymentHeaders } from './workspaceDeployment.js'
import { supabaseAuth } from './supabase.js'
import { getWorkspaceGeneration } from './workspaceApi.js'
export async function workspaceSyncRequest(payload,signal) {
  const {data}=await supabaseAuth?.getSession?.()||{}
  if(!data?.session?.access_token)throw Object.assign(new Error('Sign in again.'),{status:401})
  const response=await fetch('/api/workspace/data',{method:'POST',signal,headers:{...workspaceDeploymentHeaders(),Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({generation:getWorkspaceGeneration(),...payload})})
  const body=await response.json()
  if(!response.ok)throw Object.assign(new Error(body.error||'Could not check for updates.'),{status:response.status,code:body.code,retryAfterMs:Number(response.headers.get('retry-after')||0)*1000})
  return body
}
