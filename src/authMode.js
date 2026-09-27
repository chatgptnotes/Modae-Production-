const LOCALHOST_NAMES = new Set(['localhost', '127.0.0.1', '[::1]'])

export const isLocalhost = hostname => LOCALHOST_NAMES.has(String(hostname || '').trim().toLowerCase())

export const isLocalDemoAuthError = error => {
  const code = String(error?.code || '').toLowerCase()
  const message = String(error?.message || '').toLowerCase()
  const status = Number(error?.status || error?.statusCode)
  return code === 'invalid_credentials'
    || (status === 400 && /invalid login credentials|invalid credentials/.test(message))
}

export const canUseLocalDemoAuth = (hostname, supabaseConfigured, error) => (
  Boolean(supabaseConfigured) && isLocalhost(hostname) && isLocalDemoAuthError(error)
)

export const isLocalDemoSession = state => (
  state?.auth?.source === 'local-demo' && isLocalhost(
    typeof window === 'undefined' ? '' : window.location.hostname,
  )
)
