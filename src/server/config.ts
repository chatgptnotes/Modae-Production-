const requiredInProduction = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const

export function assertRuntimeConfig(env = process.env) {
  const port = Number(env.PORT || 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.')
  if (env.NODE_ENV === 'production') {
    const missing = requiredInProduction.filter(key => !env[key]?.trim())
    if (missing.length) throw new Error(`Missing required production environment variables: ${missing.join(', ')}`)
  }
  return { port }
}
