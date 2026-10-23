import { randomBytes } from 'node:crypto'
import { microsoftConfig } from './_microsoft-graph.js'

const states = new Map()
const tokens = new Map()
const LOGIN = 'https://login.microsoftonline.com'
const GRAPH = 'https://graph.microsoft.com/v1.0'
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }) }
const claims = token => {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) }
  catch { return {} }
}
export function createPersonalMicrosoft(config = microsoftConfig(), fetcher = fetch) {
  const ready = () => {
    if (!config.tenantId || !config.clientId || !config.clientSecret || !config.redirectUri) fail('Personal Outlook is not configured.', 503)
  }
  const tokenRequest = async params => {
    const response = await fetcher(`${LOGIN}/${config.tenantId}/oauth2/v2.0/token`, { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.clientId,
        client_secret: config.clientSecret, redirect_uri: config.redirectUri, ...params }), signal: AbortSignal.timeout(15_000) })
    if (!response.ok) fail('Microsoft did not connect your personal mailbox.', 502)
    return response.json()
  }
  const start = (authId, email) => {
    ready()
    const state = randomBytes(32).toString('base64url')
    states.set(state, { authId, email: String(email).toLowerCase(), expires: Date.now() + 5 * 60_000 })
    const url = new URL(`${LOGIN}/${config.tenantId}/oauth2/v2.0/authorize`)
    for (const [key, value] of Object.entries({ client_id: config.clientId, response_type: 'code', redirect_uri: config.redirectUri,
      response_mode: 'query', scope: 'openid profile email offline_access User.Read Mail.Send Mail.ReadWrite', state, prompt: 'select_account' })) url.searchParams.set(key, value)
    return url.toString()
  }
  const complete = async (state, code) => {
    ready()
    const pending = states.get(state)
    states.delete(state)
    if (!pending || pending.expires < Date.now() || !code) fail('This Outlook connection has expired. Start again.')
    const result = await tokenRequest({ grant_type: 'authorization_code', code })
    const id = claims(result.id_token)
    if (id.tid !== config.tenantId) fail('Microsoft returned a different organization.', 403)
    const profile = await fetcher(`${GRAPH}/me?$select=id,mail,userPrincipalName`, { headers: { Authorization: `Bearer ${result.access_token}` }, signal: AbortSignal.timeout(15_000) })
    if (!profile.ok) fail('Could not verify the personal mailbox.', 502)
    const me = await profile.json()
    const addresses = [me.mail, me.userPrincipalName].map(value => String(value || '').toLowerCase())
    if (!addresses.includes(pending.email) || id.oid && id.oid !== me.id) fail('This Microsoft mailbox does not match your WinTrack account.', 403)
    tokens.set(pending.authId, { access: result.access_token, refresh: result.refresh_token, expires: Date.now() + Number(result.expires_in || 3600) * 1000, email: pending.email })
    return pending.authId
  }
  const access = async authId => {
    ready()
    const row = tokens.get(authId)
    if (!row) fail('Connect your personal Outlook mailbox first.', 409)
    if (row.expires > Date.now() + 60_000) return row.access
    if (!row.refresh) { tokens.delete(authId); fail('Reconnect your personal Outlook mailbox.', 409) }
    try {
      const result = await tokenRequest({ grant_type: 'refresh_token', refresh_token: row.refresh, scope: 'openid profile email offline_access User.Read Mail.Send Mail.ReadWrite' })
      row.access = result.access_token; row.refresh = result.refresh_token || row.refresh; row.expires = Date.now() + Number(result.expires_in || 3600) * 1000
      return row.access
    } catch { tokens.delete(authId); fail('Reconnect your personal Outlook mailbox.', 409) }
  }
  return { start, complete, access, identity: authId => tokens.get(authId)?.email || '', connected: authId => tokens.has(authId), disconnect: authId => tokens.delete(authId) }
}
