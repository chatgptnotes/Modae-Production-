const GRAPH = 'https://graph.microsoft.com/v1.0'
const LOGIN = 'https://login.microsoftonline.com'

export function microsoftConfig(env = process.env) {
  const tenantId = env.MS_TENANT_ID || env.VITE_MICROSOFT_TENANT_ID || ''
  const clientId = env.MS_CLIENT_ID || env.VITE_MICROSOFT_CLIENT_ID || ''
  const clientSecret = env.MS_CLIENT_SECRET || env.AZURE_CLIENT_SECRET || ''
  return { tenantId, clientId, clientSecret,
    siteId: env.MS_SHAREPOINT_SITE_ID || '', driveId: env.MS_SHAREPOINT_DRIVE_ID || '', rootId: env.MS_SHAREPOINT_ROOT_ITEM_ID || '',
    mailbox: env.MS_SHARED_MAILBOX_UPN || '', redirectUri: env.MS_REDIRECT_URI || '',
    mailWebhookUrl: env.MS_MAIL_WEBHOOK_URL || '', mailWebhookSecret: env.MS_MAIL_WEBHOOK_SECRET || '' }
}

export function configuredMicrosoft(config = microsoftConfig()) {
  return Boolean(config.tenantId && config.clientId && config.clientSecret)
}

export function createMicrosoftGraph(config = microsoftConfig(), fetcher = fetch) {
  let cachedToken = null
  const token = async () => {
    if (!configuredMicrosoft(config)) throw Object.assign(new Error('Microsoft Graph credentials are not configured.'), { status: 503 })
    const key = `${config.tenantId}:${config.clientId}`
    if (cachedToken?.key === key && cachedToken.expires > Date.now() + 60_000) return cachedToken.value
    const response = await fetcher(`${LOGIN}/${config.tenantId}/oauth2/v2.0/token`, { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' }),
      signal: AbortSignal.timeout(15_000) })
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}))
      const invalidSecret = failure.error === 'invalid_client' && /AADSTS7000215/.test(failure.error_description || '')
      throw Object.assign(new Error(invalidSecret
        ? 'Microsoft rejected the app secret. Set AZURE_CLIENT_SECRET to the secret VALUE from Microsoft Entra, then restart the server.'
        : 'Microsoft Graph sign-in failed. Check the Microsoft app credentials and permissions.'), { status: 502 })
    }
    const body = await response.json()
    cachedToken = { key, value: body.access_token, expires: Date.now() + Number(body.expires_in || 3600) * 1000 }
    return body.access_token
  }
  const request = async (path, { method = 'GET', body, headers = {}, raw = false } = {}) => {
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid Microsoft Graph path.')
    const access = await token()
    const jsonBody = body != null && typeof body === 'object' && !Buffer.isBuffer(body)
    const response = await fetcher(GRAPH + path, { method, headers: { Authorization: `Bearer ${access}`, Prefer: 'IdType="ImmutableId"', ...(jsonBody ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(body == null ? {} : { body: typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000) })
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}))
      const code = typeof failure.error?.code === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(failure.error.code) ? failure.error.code : ''
      throw Object.assign(new Error(`Microsoft Graph returned HTTP ${response.status}.`), { status: response.status === 403 ? 503 : 502, graphStatus: response.status, graphCode: code })
    }
    if (raw) return response
    if (response.status === 204 || response.status === 202) return null
    return response.json()
  }
  const pages = async (path, max = 5) => {
    const rows = []; let next = path
    for (let i = 0; next && i < max; i += 1) {
      const data = await request(next)
      rows.push(...(data.value || []))
      const url = data['@odata.nextLink'] ? new URL(data['@odata.nextLink']) : null
      if (url && (url.origin !== new URL(GRAPH).origin || !url.pathname.startsWith('/v1.0/'))) throw new Error('Unexpected Microsoft Graph page URL.')
      next = url ? `${url.pathname.slice('/v1.0'.length)}${url.search}` : ''
    }
    return rows
  }
  return { config, request, pages }
}
