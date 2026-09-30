// Gemini access for the app, via the server-side Vercel `/api/ai` function. The
// key never reaches the browser: we post a task name and payload, while the
// function owns the prompt, schema and credential.
//
// Mirrors the filestore/datastore facade — every call returns null when the AI
// is unavailable (no Vercel key, timeout, bad JSON) so each call site can
// fall back to the deterministic path the app has always had:
//
//   const ai = await runTask('lead.extract', payload)
//   const result = ai ?? deterministicParse(...)

import { supabaseAuth } from './supabase.js'

// AI always goes through the same-origin Vercel function. Never add a
// browser-side Gemini key or an alternate Supabase function URL.
const AI_URL = '/api/ai'
export const usesVercelAi = () => true

export const aiEnabled = () => !!AI_URL

const DEFAULT_TIMEOUT = 45000
const inflight = new Map()
const requestKey = (task, payload, model) => {
  try { return `${task}:${model || ''}:${JSON.stringify(payload)}` }
  catch { return `${task}:${model || ''}:${String(payload)}` }
}

// → { data } | { text } from the function, or null. Never throws.
export async function runTaskResult(task, payload = {}, { timeoutMs = DEFAULT_TIMEOUT, model, fallback = false } = {}) {
  if (fallback) return { data: null, errorCode: 'AI_FALLBACK_ENABLED', error: 'Built-in fallback is selected' }
  const key = requestKey(task, payload, model)
  if (inflight.has(key)) return inflight.get(key)
  const request = (async () => {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const body = { task, payload, model }
    const { data: session } = await supabaseAuth?.getSession?.() || { data: null }
    const accessToken = session?.session?.access_token
    const { data, error, errorCode, status } = await fetch(AI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
      signal: ctl.signal,
    }).then(async response => {
      const data = await response.json().catch(() => ({}))
      return response.ok
        ? { data, error: null, status: response.status }
        : { data, error: new Error(data?.error || `AI proxy returned HTTP ${response.status}`), errorCode: data?.errorCode || 'AI_PROXY_ERROR', status: response.status }
    })
    if (error) return { data: null, errorCode: errorCode || 'AI_PROXY_ERROR', error: error.message, status }
    if (!data?.ok) return { data: null, errorCode: data?.errorCode || 'AI_TASK_FAILED', error: data?.error || 'AI task failed', status }
    return { data, errorCode: '', error: '', status }
  } catch (e) {
    // Same posture as datastore.js: warn, and let the caller carry on without.
    console.warn(`AI task "${task}" unavailable — using the built-in fallback:`, e?.message || e)
    return { data: null, errorCode: e?.name === 'AbortError' ? 'AI_TIMEOUT' : 'AI_NETWORK_ERROR', error: e?.name === 'AbortError' ? 'AI request timed out' : 'AI endpoint could not be reached' }
  } finally {
    clearTimeout(timer)
  }
  })()
  inflight.set(key, request)
  request.finally(() => inflight.delete(key)).catch(() => {})
  return request
}

export async function runTask(task, payload = {}, options = {}) {
  return (await runTaskResult(task, payload, options)).data
}

// Convenience wrappers so call sites read as intent, not transport.
export const runJson = async (task, payload, opts) => (await runTask(task, payload, opts))?.data ?? null
export const textFromTaskResult = result => result?.text ?? result?.data?.text ?? null
export const runText = async (task, payload, opts) => textFromTaskResult(await runTask(task, payload, opts))

// Gemini occasionally returns a valid email as one packed line. Keep the
// composer plain-text, but make the draft readable before it reaches the user.
export const formatEmailBody = value => {
  let text = String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/^```(?:text|plain)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  text = text
    .replace(/,(?=[A-Z])/g, ',\n\n')
    .replace(/([.!?])(?=[A-Z])/g, '$1\n\n')
    .replace(/(Best regards,|Kind regards,|Regards,)\n\n/gi, '$1\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
  return text.trim()
}

// Admin "Test connection" — resolves to { ok, model, ms } either way.
export async function testConnection(model) {
  const t0 = Date.now()
  const res = await runTaskResult('health', {}, { timeoutMs: 20000, model })
  return { ok: !!res.data, model: res.data?.model || model || '', ms: Date.now() - t0, errorCode: res.errorCode, error: res.error }
}

// Sends a new provider credential only to the server-side setup function. It
// is deliberately not persisted in app state or localStorage.
export async function saveAiKey(apiKey, role = '') {
  throw new Error('AI credentials are managed in the Vercel environment')
}
