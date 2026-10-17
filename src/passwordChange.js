import { isActiveUser, matchesAccount } from './userManagement.js'

export function validatePasswordChange(currentPassword, password, confirmation) {
  if (typeof currentPassword !== 'string' || !currentPassword) throw new Error('Enter your current password.')
  if (typeof password !== 'string' || password.length < 8) throw new Error('New password must be at least 8 characters.')
  if (password !== confirmation) throw new Error('New passwords do not match.')
  if (password === currentPassword) throw new Error('Choose a different new password.')
}

export function changeLocalPassword(state, currentPassword, password, confirmation) {
  validatePasswordChange(currentPassword, password, confirmation)
  if (state.auth?.source === 'supabase') throw new Error('Connected passwords must be changed through the login provider.')
  const account = state.users.find(user => matchesAccount(user, state.auth?.user))
  if (!isActiveUser(account)) throw new Error('Sign in with an active account to change your password.')
  if (account.pw !== currentPassword) throw new Error('Current password is incorrect.')
  return { ...state, users: state.users.map(user => user.id === account.id ? { ...user, pw: password } : user) }
}

const providerError = (body, verifying) => {
  const code = body?.code || body?.error_code || body?.error
  if (['invalid_credentials', 'invalid_grant'].includes(code)) return 'Current password is incorrect.'
  if (code === 'same_password') return 'Choose a different new password.'
  if (code === 'weak_password') return 'Choose a stronger new password that meets your account password policy.'
  if (['reauthentication_needed', 'reauthentication_not_valid', 'insufficient_aal'].includes(code)) return 'Your account requires additional verification. Contact your administrator to reset your password.'
  if (['over_request_rate_limit', 'over_email_send_rate_limit'].includes(code)) return 'Too many attempts. Wait a moment and try again.'
  return verifying ? 'Could not verify your current password. Check your connection or contact your administrator.'
    : 'Could not change your password. Sign in again or contact your administrator.'
}

// Verification creates an isolated provider session: it never replaces the app's
// session or writes tokens to storage. The update uses the captured app JWT so a
// concurrent account switch cannot cause another person's password to change.
export async function changeRemotePassword({ authUrl, apiKey, session, accountId, currentPassword, password, confirmation, isCurrent, request = fetch }) {
  validatePasswordChange(currentPassword, password, confirmation)
  if (!session?.access_token || session.user?.id !== accountId || !session.user?.email || !isCurrent()) throw new Error('Your session changed. Sign in again.')
  let verificationToken
  const send = (path, method, token, body) => request(`${authUrl}${path}`, {
    method, headers: { apikey: apiKey, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
  })
  try {
    const verification = await send('/token?grant_type=password', 'POST', null, { email: session.user.email, password: currentPassword })
    const verified = await verification.json()
    if (!verification.ok) throw new Error(providerError(verified, true))
    verificationToken = verified.access_token
    if (!verificationToken || verified.user?.id !== accountId || !isCurrent()) throw new Error('Your session changed. Sign in again.')
    const update = await send('/user', 'PUT', session.access_token, { password, current_password: currentPassword })
    if (!update.ok) throw new Error(providerError(await update.json(), false))
  } catch (error) {
    if (error?.name === 'TypeError' || ['TimeoutError', 'AbortError', 'SyntaxError'].includes(error?.name)) throw new Error('Could not reach the login provider. Check your connection and try again.')
    throw error
  } finally {
    if (verificationToken) {
      // Only revoke the temporary verification session, never the app session.
      try { await send('/logout?scope=local', 'POST', verificationToken) } catch { /* Provider expiry also invalidates this temporary session. */ }
    }
  }
}
