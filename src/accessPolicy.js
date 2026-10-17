// Application grants are deliberately independent of operational owner IDs.
export const ACCESS_PAGES = Object.freeze(Object.entries({
  mydashboard: 'My Dashboard', inbox: 'Lead inbox', tracker: 'Opportunities', my: 'My pipeline',
  new: 'New opportunity', tender: 'Tender', approvals: 'Approvals', folders: 'Documents',
  proposal: 'Proposals', proposalSent: 'Sent proposals', pricelists: 'Price lists', analytics: 'Analytics',
  customers: 'Customers', audit: 'Audit', po: 'Purchase orders', aimap: 'AI map', launcher: 'Launcher', voice: 'Voice',
}).map(([id, label]) => Object.freeze({ id, label })))
export const ACCESS_ACTIONS = Object.freeze(Object.entries({
  'leads.create': 'Create leads', 'leads.edit': 'Edit leads', 'opportunities.create': 'Create opportunities',
  'opportunities.edit': 'Edit opportunities', 'records.delete': 'Delete records', 'commercial.view': 'View commercial costs and margins',
  'proposals.price': 'Price proposals', 'priceLists.manage': 'Manage price lists', 'approvals.request': 'Request approvals',
  'approvals.decide': 'Decide assigned approvals', 'proposals.send': 'Send approved proposals',
}).map(([id, label]) => Object.freeze({ id, label })))
const pageIds = ACCESS_PAGES.map(x => x.id)
const actionIds = ACCESS_ACTIONS.map(x => x.id)
const basicActions = ['leads.create', 'leads.edit', 'opportunities.create', 'opportunities.edit', 'proposals.price', 'approvals.request', 'proposals.send', 'records.delete']
export function defaultAccessPolicy() {
  return { version: 1, roles: {
    STANDARD_USER: { pages: pageIds.filter(id => id !== 'audit'), actions: [...basicActions] },
    MANAGEMENT: { pages: ['mydashboard', 'tracker', 'my', 'approvals', 'analytics', 'customers', 'audit', 'folders', 'po', 'launcher'], actions: [...basicActions, 'commercial.view', 'approvals.decide'] },
  } }
}
const mapLegacy = role => ['ADMIN', 'SUPER', 'LJS'].includes(role) ? 'ADMIN' : role === 'AH' ? 'MANAGEMENT' :
  ['STANDARD_USER', 'TEAM_LEAD', 'RS', 'PP', 'SS', 'PJS', 'RJS', 'SR', 'AN', 'TECH'].includes(role) ? 'STANDARD_USER' : role === 'MANAGEMENT' ? 'MANAGEMENT' : role === 'NON_SALES' ? 'NON_SALES' : null
export function accessRoles(userOrRoles) {
  const raw = typeof userOrRoles === 'object' && userOrRoles !== null && !Array.isArray(userOrRoles)
    ? (Array.isArray(userOrRoles.roles) ? userOrRoles.roles : [userOrRoles.role])
    : Array.isArray(userOrRoles) ? userOrRoles : [userOrRoles]
  // An explicit application assignment wins even when a legacy ID is also present.
  const normalized = raw.map(x => String(x || '').trim().toUpperCase())
  const assigned = normalized.filter(x => ['ADMIN', 'STANDARD_USER', 'MANAGEMENT', 'TEAM_LEAD', 'NON_SALES'].includes(x))
  return [...new Set((assigned.length ? assigned : normalized).map(mapLegacy).filter(Boolean))]
}
// Submit-only is a deliberate restriction even if a stale mixed assignment remains.
export const isNonSalesUser = user => accessRoles(user).includes('NON_SALES')
export function validateAccessPolicy(policy, users) {
  const errors = []
  if (!policy || typeof policy !== 'object' || Array.isArray(policy) || policy.version !== 1) errors.push('Access policy version must be 1.')
  if (policy && Object.keys(policy).some(key => !['version', 'roles', 'users'].includes(key))) errors.push('Unknown access policy field.')
  const roles = policy?.roles
  if (!roles || typeof roles !== 'object' || Array.isArray(roles)) errors.push('Role permissions are required.')
  else {
    if (Object.keys(roles).some(key => !['STANDARD_USER', 'MANAGEMENT'].includes(key))) errors.push('Only Standard User and Management permissions are configurable.')
    for (const role of ['STANDARD_USER', 'MANAGEMENT']) {
      const value = roles[role]
      if (!value || typeof value !== 'object' || Array.isArray(value)) { errors.push(`${role} permissions are required.`); continue }
      if (Object.keys(value).some(key => !['pages', 'actions'].includes(key))) errors.push(`Unknown ${role} permission field.`)
      for (const [kind, ids] of [['pages', pageIds], ['actions', actionIds]]) {
        const grants = value[kind]
        if (!Array.isArray(grants) || grants.some(id => !ids.includes(id)) || new Set(grants).size !== grants.length) errors.push(`Invalid ${role} ${kind}.`)
      }
    }
  }
  if (policy?.users !== undefined) {
    if (!policy.users || typeof policy.users !== 'object' || Array.isArray(policy.users)) errors.push('Individual permissions must be an account map.')
    else for (const [id, override] of Object.entries(policy.users)) {
      if (!id || id.length > 200 || id.trim() !== id || ['__proto__', 'constructor', 'prototype'].includes(id)) errors.push('Invalid permission account ID.')
      if (users && users.filter(user => user.id === id).length !== 1) errors.push(`Unknown or ambiguous permission account: ${id}.`)
      if (!override || typeof override !== 'object' || Array.isArray(override) || Object.keys(override).some(key => !['pages', 'actions'].includes(key))) { errors.push(`Invalid permissions for ${id}.`); continue }
      for (const [kind, ids] of [['pages', pageIds], ['actions', actionIds]]) {
        const grants = override[kind]
        if (grants === undefined) continue
        if (!grants || typeof grants !== 'object' || Array.isArray(grants) || Object.entries(grants).some(([permission, choice]) => !ids.includes(permission) || !['allow', 'deny'].includes(choice))) errors.push(`Invalid ${id} ${kind} overrides.`)
      }
    }
  }
  return { valid: errors.length === 0, errors, policy: errors.length ? null : structuredClone(policy) }
}
export function effectiveAccess(userOrRoles, config) {
  const roles = accessRoles(userOrRoles)
  if (roles.includes('NON_SALES')) return { roles: ['NON_SALES'], isAdmin: false, pages: ['newLead'], actions: ['leads.create'] }
  const isAdmin = roles.includes('ADMIN')
  // Missing policy is backward compatible. A malformed saved policy fails closed.
  const candidate = config?.accessPolicy ?? defaultAccessPolicy()
  const policy = validateAccessPolicy(candidate).policy
  const raw = userOrRoles && typeof userOrRoles === 'object' && !Array.isArray(userOrRoles)
    ? (Array.isArray(userOrRoles.roles) ? userOrRoles.roles : [userOrRoles.role])
    : Array.isArray(userOrRoles) ? userOrRoles : [userOrRoles]
  const explicit = raw.some(role => ['ADMIN', 'STANDARD_USER', 'MANAGEMENT', 'TEAM_LEAD', 'NON_SALES'].includes(String(role || '').toUpperCase()))
  // Existing technical personas keep their baseline until a policy is configured
  // or an application role is explicitly assigned. Configured revocations win.
  if (!config?.accessPolicy && !explicit && policy) {
    if (raw.includes('AH')) policy.roles.MANAGEMENT.pages = ['mydashboard','tracker','my','approvals','folders','proposal','pricelists','proposalSent','analytics','customers','audit','aimap','po','launcher']
    if (raw.length === 1 && ['AN','TECH'].includes(raw[0])) {
      policy.roles.STANDARD_USER.pages = ['mydashboard','inbox','tracker','my','proposal','proposalSent','pricelists','analytics','approvals','aimap','launcher', ...(raw[0] === 'AN' ? ['folders'] : [])]
      policy.roles.STANDARD_USER.actions = policy.roles.STANDARD_USER.actions.filter(id => id !== 'proposals.price')
    }
  }
  const override = typeof userOrRoles?.id === 'string' && Object.hasOwn(policy?.users || {}, userOrRoles.id) ? policy.users[userOrRoles.id] : null
  const grantsFor = kind => {
    const grants = new Set(roles.flatMap(role => policy?.roles[role]?.[kind] || []))
    for (const [permission, choice] of Object.entries(override?.[kind] || {})) if (choice === 'allow') grants.add(permission)
    for (const [permission, choice] of Object.entries(override?.[kind] || {})) if (choice === 'deny') grants.delete(permission)
    return [...grants]
  }
  return {
    roles, isAdmin,
    pages: isAdmin ? [...pageIds, 'admin', 'users', 'portal'] : grantsFor('pages'),
    actions: isAdmin ? [...actionIds] : grantsFor('actions'),
  }
}
export const canAccessPage = (userOrRoles, page, config) => effectiveAccess(userOrRoles, config).pages.includes(page === 'order' ? 'po' : page)
export const canPerform = (userOrRoles, action, config) => effectiveAccess(userOrRoles, config).actions.includes(action)
