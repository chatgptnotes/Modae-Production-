import { canViewCommercial, isAdminRole, ageDays, canSeePage } from './utils.js'

// One tile registry shared by the desktop Home and the tablet task launcher —
// they must never drift. Shape:
//   { key, icon, label, hint, to, color, page, badge?, badgeHint? }
// `color` picks a .c-* class on the tablet tiles; `page` is the PERMS key.

export const roleGroup = role =>
  isAdminRole(role) ? 'admin' : role === 'LJS' || role === 'AH' ? 'approver' : 'sales'

export function buildTiles(store) {
  const role = store.role
  const comm = canViewCommercial(role)
  const admin = isAdminRole(role)
  const approver = role === 'LJS' || role === 'AH' || admin

  const openOpps = store.opportunities.filter(o => o.status === 'Open')
  const stale = openOpps.filter(o => (ageDays(o.lastUpdated) ?? 0) > 30)
  const myStale = stale.filter(o => o.owner === role).length
  const newLeads = (store.leads || []).filter(l => l.status === 'New').length
  const pending = (store.approvals || []).filter(a => a.status === 'Pending')
  const myPending = pending.filter(a => a.requestedBy === role).length
  const openConditions = (store.approvals || []).filter(a => a.status === 'Approved with conditions'
    && (a.conditions || []).some(c => !c.incorporated)).length
  const poReview = Object.values(store.poCompare || {}).filter(p => p.status === 'In review').length

  return [
    { key: 'new', page: 'new', icon: 'plus', label: 'New Intake Form', hint: 'Register a sales opportunity', to: '/new', color: 'teal' },
    { key: 'my', page: 'my', icon: 'cards', label: 'My Opportunities', hint: 'Your pipeline as cards', to: '/my', color: 'navy', badge: approver ? 0 : stale.filter(o => o.owner === role).length && 0 },
    { key: 'inbox', page: 'inbox', icon: 'inbox', label: 'Lead Inbox', hint: 'AI-parsed incoming inquiries', to: '/inbox', color: 'sky', badge: newLeads, badgeHint: 'new leads to qualify' },
    { key: 'status', page: 'my', icon: 'clock', label: 'Update Status', hint: 'Opportunities not updated in 30+ days', to: '/my', color: 'amber', badge: approver ? stale.length : myStale, badgeHint: 'stale opportunities' },
    { key: 'voice', page: 'voice', icon: 'mic', label: 'Voice Update', hint: 'Speak a lead or status update', to: '/voice', color: 'wine' },
    { key: 'notes', page: 'notes', icon: 'note', label: 'Marketing Notes', hint: 'Shared board — everyone can post', to: '/notes', color: 'rust', badge: (store.notes || []).length ? 0 : 0 },
    { key: 'approvals', page: 'approvals', icon: 'checkCircle', label: approver ? 'Approvals' : 'My Approvals', hint: 'Gates, clearances, conditions', to: '/approvals', color: 'green', badge: approver ? pending.length + openConditions : myPending, badgeHint: 'pending decisions + unconfirmed conditions' },
    { key: 'tender', page: 'tender', icon: 'bot', label: 'Tender → Proposal', hint: 'Upload an RFQ PDF, AI extracts it', to: '/tender', color: 'purple' },
    { key: 'tracker', page: 'tracker', icon: 'sheet', label: 'All Opportunities', hint: 'The pipeline sheet', to: '/', color: 'slate' },
    { key: 'folders', page: 'folders', icon: 'folder', label: 'Files & Folders', hint: 'SharePoint-backed opportunity folders', to: '/folders', color: 'teal' },
    { key: 'po', page: 'po', icon: 'clipboardCheck', label: 'Purchase Orders', hint: 'PO validation & booked orders', to: '/po', color: 'navy', badge: approver ? poReview : 0, badgeHint: 'POs in validation' },
    { key: 'aimap', page: 'aimap', icon: 'sparkles', label: 'AI & Automation', hint: '28 AI interventions, live demos', to: '/aimap', color: 'purple' },
    { key: 'dashboard', page: 'dashboard', icon: 'chartBar', label: 'Pivot / Forecast', hint: 'Order intake by month', to: '/dashboard', color: 'green', show: comm },
    { key: 'analytics', page: 'analytics', icon: 'chartLine', label: 'Analytics', hint: 'Funnel, targets, win/loss', to: '/analytics', color: 'sky' },
    { key: 'pricelists', page: 'pricelists', icon: 'tag', label: 'Price Lists', hint: 'B&K · Metrix · ad-hoc quotes', to: '/pricelists', color: 'amber', show: comm },
    { key: 'customers', page: 'customers', icon: 'users', label: 'Customers', hint: 'Master + Green/Blue/Amber/Red', to: '/customers', color: 'rust' },
    { key: 'launcher', page: 'launcher', icon: 'play', label: 'Demo Launcher', hint: 'Guided demo scenarios', to: '/launcher', color: 'slate' },
    { key: 'admin', page: 'admin', icon: 'gear', label: 'Admin', hint: 'Rules, AI model, SharePoint, uploads', to: '/admin', color: 'wine', show: admin || role === 'LJS' },
    { key: 'audit', page: 'audit', icon: 'list', label: 'Audit Trail', hint: 'Who changed what, when', to: '/audit', color: 'slate', show: admin },
    { key: 'users', page: 'users', icon: 'shield', label: 'Users & Roles', hint: 'Accounts, registrations, permissions', to: '/users', color: 'navy', show: admin },
  ].filter(t => t.show !== false && canSeePage(role, t.page))
}

// Task ordering on the tablet landing, per role group — the tasks the user
// actually has to do come first, big and colorful.
export const TABLET_TASKS = {
  sales: ['new', 'my', 'inbox', 'status', 'voice', 'notes', 'approvals', 'tender'],
  approver: ['approvals', 'inbox', 'po', 'tracker', 'my', 'status', 'notes', 'dashboard'],
  admin: ['approvals', 'inbox', 'users', 'admin', 'audit', 'notes', 'po', 'launcher'],
}
