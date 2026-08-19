import { supabase } from './supabase.js'

// Gemini access for the app, via the `ai` Supabase Edge Function (see
// supabase/functions/ai/index.ts). The key never reaches the browser: we post a
// task name and a payload, the function owns the prompt and the schema.
//
// Mirrors the filestore/datastore facade — every call returns null when the AI
// is unavailable (no Supabase, no key, timeout, bad JSON) so each call site can
// fall back to the deterministic path the app has always had:
//
//   const ai = await runTask('lead.extract', payload)
//   const result = ai ?? deterministicParse(...)

// Local development: point at a function served outside Supabase, e.g.
//   deno run --allow-net --allow-env supabase/functions/ai/index.ts
//   VITE_AI_FUNCTION_URL=http://localhost:8000 npm run dev
// Unset in every deployed build — then calls go through Supabase as normal.
// Guarded the same way as supabase.js — `import.meta.env` is Vite-only.
const DEV_URL = ((import.meta.env || {}).VITE_AI_FUNCTION_URL || '').trim()
const DEV_ADMIN_URL = ((import.meta.env || {}).VITE_AI_ADMIN_FUNCTION_URL || '').trim()

export const aiEnabled = () => !!supabase || !!DEV_URL

const DEFAULT_TIMEOUT = 45000

// → { data } | { text } from the function, or null. Never throws.
export async function runTask(task, payload = {}, { timeoutMs = DEFAULT_TIMEOUT, model, fallback = false } = {}) {
  if (fallback) return null
  if (!supabase && !DEV_URL) return null
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const body = { task, payload, model }
    const { data, error } = DEV_URL
      ? await fetch(DEV_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: ctl.signal,
        }).then(async r => ({ data: await r.json(), error: null }))
      : await supabase.functions.invoke('ai', { body, signal: ctl.signal })
    if (error) throw error
    if (!data?.ok) throw new Error(data?.error || 'AI task failed')
    return data
  } catch (e) {
    // Same posture as datastore.js: warn, and let the caller carry on without.
    console.warn(`AI task "${task}" unavailable — using the built-in fallback:`, e?.message || e)
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Convenience wrappers so call sites read as intent, not transport.
export const runJson = async (task, payload, opts) => (await runTask(task, payload, opts))?.data ?? null
export const runText = async (task, payload, opts) => (await runTask(task, payload, opts))?.text ?? null

// Admin "Test connection" — resolves to { ok, model, ms } either way.
export async function testConnection(model) {
  const t0 = Date.now()
  const res = await runTask('health', {}, { timeoutMs: 20000, model })
  return { ok: !!res, model: res?.model || model || '', ms: Date.now() - t0 }
}

// Sends a new provider credential only to the server-side setup function. It
// is deliberately not persisted in app state or localStorage.
export async function saveAiKey(apiKey, role = '') {
  if (!apiKey) throw new Error('API key is required')
  const body = { apiKey }
  const adminUrl = DEV_ADMIN_URL || (DEV_URL ? DEV_URL.replace(/\/ai\/?$/, '/ai-admin') : '')
  if (adminUrl) {
    const res = await fetch(adminUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-wintrack-role': role },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.ok) throw new Error(data?.error || 'AI credential setup failed')
    return data
  }
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.functions.invoke('ai-admin', {
    body, headers: { 'x-wintrack-role': role },
  })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.error || 'AI credential setup failed')
  return data
}
