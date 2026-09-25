import { createClient } from '@supabase/supabase-js'

// Null when the env vars are absent OR malformed — the Folders page then falls
// back to the original mock (prompt-a-filename) behavior, so the prototype
// still runs without a Supabase project. createClient throws on a bad URL at
// module load, which would blank the whole app (seen on Vercel when the env
// var held a placeholder) — so validate and try/catch instead of trusting it.
// `import.meta.env` is injected by Vite and simply absent under plain Node, so
// importing this module from a test used to throw before the guard below ever
// ran. Treat "no env at all" the same as "not configured".
const env = import.meta.env || {}
const url = (env.VITE_SUPABASE_URL || '').trim()
const anonKey = (env.VITE_SUPABASE_ANON_KEY || '').trim()
const projectRefFromUrl = url.match(/^https?:\/\/([^.]+)\.supabase\.co(?:\/|$)/i)?.[1] || ''
export const supabaseProjectRef = projectRefFromUrl

function keyProjectRef(token) {
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')))
    return payload.ref || (/^[a-z0-9]{10,}$/i.test(payload.iss || '') ? payload.iss : '')
  } catch {
    return ''
  }
}

export const supabaseConfigError = (() => {
  if (!url || !anonKey || !projectRefFromUrl) return ''
  const keyRef = keyProjectRef(anonKey)
  return keyRef && keyRef !== projectRefFromUrl
    ? `Supabase URL and anon key reference different projects (${projectRefFromUrl} vs ${keyRef}).`
    : ''
})()

function makeClient() {
  if (!/^https?:\/\/.+/i.test(url) || !anonKey) return null
  if (supabaseConfigError) {
    console.warn(`Supabase disabled — ${supabaseConfigError}`)
    return null
  }
  try {
    // This app has its own role/login layer and uses Supabase only as a
    // shared-data and storage backend. Do not persist or reuse a browser
    // Supabase session: a stale token can override the valid anon key and make
    // every hydration request fail with "Invalid API key".
    return createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  } catch (e) {
    console.warn('Supabase disabled — invalid configuration:', e?.message)
    return null
  }
}
export const supabase = makeClient()

export const supabaseAuth = supabase?.auth || null

export const SUPABASE_AUTH_TIMEOUT_MS = 15000

export const isSupabaseAuthError = error => {
  const status = Number(error?.status || error?.statusCode)
  const code = String(error?.code || '').toUpperCase()
  return [401, 403].includes(status)
    || ['401', '403', 'INVALID_JWT', 'JWT_EXPIRED', 'INVALID_TOKEN', 'PGRST301'].includes(code)
}

export const describeSupabaseError = (error, operation = '') => ({
  message: error?.message || 'Supabase request failed',
  code: error?.code || '',
  details: error?.details || '',
  hint: error?.hint || '',
  status: error?.status || error?.statusCode || null,
  operation,
})

export async function clearSupabaseSession() {
  if (!supabase?.auth) return
  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    // A rejected auth request must not keep the app stuck behind the same
    // invalid token. The SDK normally removes this key; the fallback handles
    // a broken/expired session when signOut itself cannot reach Supabase.
    try { localStorage.removeItem(`sb-${supabaseProjectRef}-auth-token`) } catch { /* storage is optional */ }
  }
}

function withTimeout(request, label, timeoutMs = SUPABASE_AUTH_TIMEOUT_MS) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out. Check your connection and try again.`)), timeoutMs)
  })
  return Promise.race([request, timeout]).finally(() => clearTimeout(timer))
}

export async function signInWithPassword(email, password) {
  if (!supabase) return { data: null, error: new Error('Supabase is not configured.') }
  try {
    const result = await withTimeout(supabase.auth.signInWithPassword({ email, password }), 'Sign-in')
    if (result.error && isSupabaseAuthError(result.error)) await clearSupabaseSession()
    return result
  } catch (error) {
    if (isSupabaseAuthError(error)) await clearSupabaseSession()
    return { data: null, error }
  }
}

export async function signUpWithPassword(email, password, metadata = {}) {
  if (!supabase) return { data: null, error: new Error('Supabase is not configured.') }
  return supabase.auth.signUp({ email, password, options: { data: metadata } })
}
