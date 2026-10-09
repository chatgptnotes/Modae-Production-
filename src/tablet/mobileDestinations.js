import { canSeePage } from '../utils.js'

export const MOBILE_DESTINATIONS = [
  ['Dashboard', '/my-dashboard', 'mydashboard', 'chartBar'],
  ['Lead inbox', '/inbox', 'inbox', 'inbox'],
  ['Opportunities', '/opportunities', 'tracker', 'cards'],
  ['Approvals', '/approvals', 'approvals', 'checkCircle'],
  ['Proposal Sent', '/proposal-sent', 'proposalSent', 'send'],
  ['Purchase Orders', '/order', 'po', 'clipboardCheck'],
  ['Update opportunity status', '/my', 'my', 'clock'],
  ['New opportunity', '/new', 'new', 'plus'],
  ['Tender intake', '/tender', 'tender', 'folder'],
  ['Documents', '/folders', 'folders', 'folder'],
  ['Customers', '/customers', 'customers', 'users'],
  ['Price Lists', '/pricelists', 'pricelists', 'tag'],
  ['Analytics', '/analytics', 'analytics', 'chartBar'],
  ['Voice update', '/voice', 'voice', 'mic'],
  ['AI and automation map', '/aimap', 'aimap', 'sparkles'],
  ['Admin configuration', '/admin', 'admin', 'gear'],
  ['Workflow configuration', '/admin/workflow', 'admin', 'gear'],
  ['Audit Trail', '/audit', 'audit', 'list'],
  ['Users and roles', '/users', 'users', 'shield'],
  ['Demo launcher', '/launcher', 'launcher', 'play'],
  ['Workspace home', '/home', 'tracker', 'cards'],
]


export function mobileDestinations(store, query = '') {
  const search = query.trim().toLowerCase()
  return MOBILE_DESTINATIONS.filter(([label, to, page]) =>
    canSeePage(store.roles || store.role, page)
    && (to !== '/launcher' || store.demoData !== false)
    && label.toLowerCase().includes(search))
}
