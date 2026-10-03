import { getAdminSupabaseClient } from './_supabase-client.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ADMIN_ROLES = new Set(['SUPER', 'ADMIN', 'LJS', 'MANAGEMENT'])
const STANDARD_ROLES = new Set(['STANDARD_USER', 'TEAM_LEAD', 'MANAGEMENT', 'ADMIN'])
const ASSIGNABLE_ROLES = new Set(['ADMIN', 'LJS', 'AH', 'RS', 'PP', 'SS', 'PJS', 'RJS', 'SR', 'AN', 'TECH', ...STANDARD_ROLES])
const PROVISIONABLE_ROLES = new Set([...ASSIGNABLE_ROLES, 'SUPER', 'CUST'])

const clean = value => String(value || '').trim()
const rolesOf = profile => [...new Set((Array.isArray(profile?.roles) ? profile.roles : [profile?.role])
  .map(role => clean(role).toUpperCase())
  .filter(role => ASSIGNABLE_ROLES.has(role) || role === 'SUPER' || role === 'CUST'))]
const jsonBody = req => {
  try { return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}) }
  catch { return null }
}

function adminClient() {
  return getAdminSupabaseClient()
}

async function loadUserProfiles(client) {
  const { data, error } = await client
    .from('records')
    .select('data')
    .eq('entity', 'state')
    .eq('id', 'users')
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  return Array.isArray(data?.data) ? data.data : []
}

async function currentAdmin(client, token) {
  const { data: authData, error: authError } = await client.auth.getUser(token)
  if (authError || !authData?.user?.email) return null
  const profiles = await loadUserProfiles(client)
  const profile = profiles.find(user => String(user.email || '').toLowerCase() === authData.user.email.toLowerCase())
  return profile && rolesOf(profile).some(role => ADMIN_ROLES.has(role)) ? { auth: authData.user, profile } : null
}

function validateCredentials(email, password) {
  if (!EMAIL_RE.test(email)) return 'Enter a valid email address.'
  return validatePassword(password)
}

function validatePassword(password) {
  if (password.length < 8) return 'Password must be at least 8 characters.'
  return ''
}

async function findAuthUser(client, { authId, email }) {
  if (authId) {
    const { data, error } = await client.auth.admin.getUserById(authId)
    if (!error && data?.user) return data.user
  }
  let page = 1
  while (page <= 10) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const found = (data?.users || []).find(user => user.email?.toLowerCase() === email.toLowerCase())
    if (found) return found
    if (!data?.users?.length || data.users.length < 1000) break
    page += 1
  }
  return null
}

async function listAuthUsers(client) {
  const users = []
  let page = 1
  while (page <= 10) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    users.push(...(data?.users || []))
    if (!data?.users?.length || data.users.length < 1000) break
    page += 1
  }
  return users
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })
  const client = adminClient()
  if (!client) return res.status(503).json({ ok: false, error: 'Supabase admin provisioning is not configured on the server.' })

  const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ ok: false, error: 'A Supabase admin session is required.' })

  let admin
  try { admin = await currentAdmin(client, token) }
  catch (error) {
    console.error('Admin user lookup failed:', error?.message || error)
    return res.status(502).json({ ok: false, error: 'Could not verify the administrator account.' })
  }
  if (!admin) return res.status(403).json({ ok: false, error: 'Only application administrators can manage user accounts.' })

  const body = jsonBody(req)
  if (!body) return res.status(400).json({ ok: false, error: 'Malformed request body.' })
  const action = body.action || 'create'

  if (action === 'status') {
    try {
      const [profiles, authUsers] = await Promise.all([loadUserProfiles(client), listAuthUsers(client)])
      const byEmail = new Map(authUsers.filter(user => user.email).map(user => [user.email.toLowerCase(), user]))
      const users = profiles.map(profile => {
        const auth = byEmail.get(String(profile.email || '').toLowerCase())
        return {
          id: profile.id,
          email: profile.email,
          authId: auth?.id || null,
          authStatus: !auth ? 'Missing' : auth.banned_until ? 'Blocked' : 'Created',
        }
      })
      return res.status(200).json({ ok: true, action, users })
    } catch (error) {
      console.error('Supabase Auth status lookup failed:', error?.message || error)
      return res.status(502).json({ ok: false, error: 'Could not check Supabase Auth accounts.' })
    }
  }

  if (action === 'provision') {
    const passwordError = validatePassword(String(body.password || ''))
    if (passwordError) return res.status(400).json({ ok: false, error: passwordError })
    try {
      const [profiles, authUsers] = await Promise.all([loadUserProfiles(client), listAuthUsers(client)])
      const byEmail = new Map(authUsers.filter(user => user.email).map(user => [user.email.toLowerCase(), user]))
      const results = []
      for (const profile of profiles) {
        const email = clean(profile.email).toLowerCase()
        const base = { id: profile.id, email: profile.email, name: profile.name, role: profile.role, roles: rolesOf(profile) }
        if (!EMAIL_RE.test(email)) {
          results.push({ ...base, authStatus: 'Failed', error: 'Invalid email address.' })
          continue
        }
        if (!rolesOf(profile).some(role => PROVISIONABLE_ROLES.has(role))) {
          results.push({ ...base, authStatus: 'Failed', error: 'This role cannot be provisioned.' })
          continue
        }
        const existing = byEmail.get(email)
        if (existing) {
          results.push({ ...base, authId: existing.id, authStatus: existing.banned_until ? 'Blocked' : 'Created' })
          continue
        }
        const { data: created, error: createError } = await client.auth.admin.createUser({
          email,
          password: String(body.password),
          email_confirm: true,
          user_metadata: { name: profile.name, role: profile.role, roles: rolesOf(profile) },
        })
        if (createError) {
          results.push({ ...base, authStatus: 'Failed', error: createError.message || 'Could not create the account.' })
          continue
        }
        const authUser = created.user
        byEmail.set(email, authUser)
        results.push({ ...base, authId: authUser.id, authStatus: 'Created' })
      }
      return res.status(200).json({ ok: true, action, results })
    } catch (error) {
      console.error('Bulk Supabase Auth provisioning failed:', error?.message || error)
      return res.status(502).json({ ok: false, error: 'Could not provision the Supabase Auth accounts.' })
    }
  }

  const email = clean(body.email).toLowerCase()
  const password = String(body.password || '')

  if (action === 'create') {
    const credentialError = validateCredentials(email, password)
    if (credentialError) return res.status(400).json({ ok: false, error: credentialError })
    const name = clean(body.name)
    const role = clean(body.role)
    const roles = rolesOf({ role, roles: body.roles })
    if (!name) return res.status(400).json({ ok: false, error: 'Name is required.' })
    if (!roles.length) return res.status(400).json({ ok: false, error: 'Select at least one valid role.' })
    const { data, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role, roles },
    })
    if (error) {
      const duplicate = /already|exists|registered/i.test(error.message || '')
      return res.status(duplicate ? 409 : 502).json({ ok: false, error: duplicate ? 'That email is already registered.' : 'Could not create the Supabase account.' })
    }
    return res.status(201).json({ ok: true, action, user: { id: data.user.id, email: data.user.email } })
  }

  if (action === 'reset') {
    const credentialError = validateCredentials(email, password)
    if (credentialError) return res.status(400).json({ ok: false, error: credentialError })
    const target = await findAuthUser(client, { authId: clean(body.authId), email })
    if (!target) return res.status(404).json({ ok: false, error: 'No Supabase account was found for this user.' })
    const { data, error } = await client.auth.admin.updateUserById(target.id, { password })
    if (error) return res.status(502).json({ ok: false, error: 'Could not reset the Supabase password.' })
    return res.status(200).json({ ok: true, action, user: { id: data.user.id, email: data.user.email } })
  }

  if (action === 'update') {
    const nextEmail = clean(body.nextEmail).toLowerCase()
    const name = clean(body.name)
    const role = clean(body.role)
    const roles = rolesOf({ role, roles: body.roles })
    if (!EMAIL_RE.test(nextEmail)) return res.status(400).json({ ok: false, error: 'Enter a valid email address.' })
    if (!name) return res.status(400).json({ ok: false, error: 'Name is required.' })
    if (!roles.length && role !== 'SUPER') return res.status(400).json({ ok: false, error: 'Select at least one valid role.' })
    const target = await findAuthUser(client, { authId: clean(body.authId), email })
    if (!target) return res.status(404).json({ ok: false, error: 'No Supabase account was found for this user.' })
    const { data, error } = await client.auth.admin.updateUserById(target.id, {
      email: nextEmail,
      email_confirm: true,
      user_metadata: { ...(target.user_metadata || {}), name, role, roles },
    })
    if (error) return res.status(502).json({ ok: false, error: 'Could not update the Supabase account.' })
    return res.status(200).json({ ok: true, action, user: { id: data.user.id, email: data.user.email } })
  }

  return res.status(400).json({ ok: false, error: 'Unknown user-management action.' })
}
