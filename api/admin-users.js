import { isActiveUser, isDeletedUser, isAccountAdmin, matchesAccount } from '../src/userManagement.js'
import { readRoster, saveRoster } from './_user-roster.js'
import { changeAccount, targetAuth } from './_user-lifecycle.js'
import { applicationRolePatch, newUserRole } from '../src/userApplicationRole.js'
import { getAdminSupabaseClient } from './_supabase-client.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ADMIN_ROLES = new Set(['SUPER', 'ADMIN', 'LJS'])
const STANDARD_ROLES = new Set(['STANDARD_USER', 'MANAGEMENT', 'ADMIN'])
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
  const profile = profiles.find(user => matchesAccount(user, authData.user))
  return isActiveUser(profile) && isAccountAdmin(profile) ? { auth: authData.user, profile } : null
}

function validateCredentials(email, password) {
  if (!EMAIL_RE.test(email)) return 'Enter a valid email address.'
  return validatePassword(password)
}

function validatePassword(password) {
  if (password.length < 8) return 'Password must be at least 8 characters.'
  return ''
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
      const users = profiles.filter(profile => !isDeletedUser(profile)).map(profile => {
        const auth = byEmail.get(String(profile.email || '').toLowerCase())
        return {
          id: profile.id,
          email: profile.email,
          authId: auth?.id || null,
          authStatus: !auth ? 'Missing' : Date.parse(auth.banned_until) > Date.now() ? 'Blocked' : 'Created',
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
      for (const profile of profiles.filter(isActiveUser)) {
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
          results.push({ ...base, authId: existing.id, authStatus: Date.parse(existing.banned_until) > Date.now() ? 'Blocked' : 'Created' })
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
        const latest = await readRoster(client)
        if (!latest.users.some(user => user.id === profile.id && isActiveUser(user))) {
          const { error: cleanupError } = await client.auth.admin.deleteUser(authUser.id)
          if (cleanupError) throw cleanupError
          results.push({ ...base, authStatus: 'Skipped', error: 'Account access changed during provisioning.' })
          continue
        }
        byEmail.set(email, authUser)
        results.push({ ...base, authId: authUser.id, authStatus: 'Created' })
      }
      return res.status(200).json({ ok: true, action, results })
    } catch (error) {
      console.error('Bulk Supabase Auth provisioning failed:', error?.message || error)
      return res.status(502).json({ ok: false, error: 'Could not provision the Supabase Auth accounts.' })
    }
  }

  if (['delete', 'access', 'update'].includes(action)) {
    try {
      const { users } = await readRoster(client)
      const target = users.find(user => user.id === body.profileId)
      if (!target) return res.status(404).json({ ok: false, error: 'Account not found.' })
      let patch = {}
      if (action !== 'delete') {
        const status = body.status || target.pendingAccountPatch?.status || target.status
        if (!['Active', 'Pending', 'Suspended'].includes(status)) throw new Error('Select a valid status.')
        patch = { status }
        if (action === 'update') {
          const name = clean(body.name)
          const email = clean(body.nextEmail).toLowerCase()
          if (!name || !EMAIL_RE.test(email)) throw new Error('Name and a valid email are required.')
          if (users.some(user => user.id !== target.id && user.email?.toLowerCase() === email)) throw new Error('That email is already registered.')
          patch = { ...patch, name, email, ...applicationRolePatch(target, body.applicationRole) }
        }
      }
      const result = await changeAccount(client, admin.auth, body, patch)
      return res.status(200).json({ ok: true, action, ...result })
    } catch (error) {
      return res.status(error.status || 400).json({ ok: false, error: error.message || 'Account change failed.' })
    }
  }

  const email = clean(body.email).toLowerCase()
  const password = String(body.password || '')

  if (action === 'create') {
    const credentialError = validateCredentials(email, password)
    if (credentialError) return res.status(400).json({ ok: false, error: credentialError })
    const name = clean(body.name)
    let selectedRole
    try { selectedRole = newUserRole(body.applicationRole || 'STANDARD_USER') }
    catch (error) { return res.status(400).json({ ok: false, error: error.message }) }
    const { role, roles } = selectedRole
    if (!name) return res.status(400).json({ ok: false, error: 'Name is required.' })
    if (!roles.length) return res.status(400).json({ ok: false, error: 'Select at least one valid role.' })
    const roster = await readRoster(client)
    if (roster.users.some(user => user.email?.toLowerCase() === email)) return res.status(409).json({ ok: false, error: 'That email is already registered.' })
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
    const profile = { id: `U-${data.user.id}`, authId: data.user.id, name, email, role, roles, status: 'Active', created: new Date().toISOString().slice(0, 10), accountRevision: 1 }
    try {
      const users = await saveRoster(client, roster, [...roster.users, profile], admin.profile, 'User created', profile.id)
      return res.status(201).json({ ok: true, action, user: { id: data.user.id, email }, users, profile })
    } catch (error) {
      const cleanup = await client.auth.admin.deleteUser(data.user.id)
      return res.status(error.status || 502).json({ ok: false, error: error.message + (cleanup.error ? ' Login cleanup failed; contact the administrator before retrying.' : '') })
    }
  }

  if (action === 'reset') {
    const credentialError = validateCredentials(email, password)
    if (credentialError) return res.status(400).json({ ok: false, error: credentialError })
    const { users } = await readRoster(client)
    const profile = users.find(user => user.id === body.profileId && !isDeletedUser(user) && !user.deletionPendingAt)
    if (!profile) return res.status(404).json({ ok: false, error: 'Account not found.' })
    const target = await targetAuth(client, profile)
    if (!target) return res.status(404).json({ ok: false, error: 'No Supabase account was found for this user.' })
    const { data, error } = await client.auth.admin.updateUserById(target.id, { password })
    if (error) return res.status(502).json({ ok: false, error: 'Could not reset the Supabase password.' })
    return res.status(200).json({ ok: true, action, user: { id: data.user.id, email: data.user.email } })
  }

  return res.status(400).json({ ok: false, error: 'Unknown user-management action.' })
}
