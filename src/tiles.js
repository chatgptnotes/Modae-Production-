import { isAdminRole, isSalesOwner, canSeePage } from './utils.js'
import { counts } from './kpi.js'

// Full-site tile registry. Tablet mode has its own registry under src/tablet so
// mobile navigation does not drift when the desktop home changes. Shape:
//   { key, icon, label, hint, to, color, page, badge?, badgeHint? }
// `color` picks a tone class on desktop tiles; `page` is the PERMS key.

export const roleGroup = role =>
  isAdminRole(role) ? 'admin' : role === 'LJS' || role === 'AH' ? 'approver' : 'sales'

export function buildTiles(store) {
  const role = store.role
  const admin = isAdminRole(role)
  const approver = role === 'LJS' || role === 'AH' || admin

  // One source of truth for every badge in the app (src/kpi.js).
  const c = counts(store, role)

  return [
    { key: 'mydashboard', page: 'mydashboard', icon: 'chartBar', label: 'My Dashboard', hint: 'Your targets, blockers and next actions', to: '/my-dashboard', color: 'sky' },
    { key: 'opportunities', page: 'tracker', icon: 'cards', label: 'Opportunities', hint: 'My pipeline and opportunity creation workspace', to: '/opportunities', color: 'navy', badge: approver ? 0 : c.myStale, badgeHint: 'your opportunities needing an update' },
    { key: 'inbox', page: 'inbox', icon: 'inbox', label: 'Lead inbox', hint: 'Review and qualify incoming inquiries', to: '/inbox', color: 'sky', badge: c.newLeads, badgeHint: 'new leads requiring qualification' },
    { key: 'status', page: 'my', icon: 'clock', label: 'Update opportunity status', hint: 'Review opportunities not updated in 30+ days', to: '/my', color: 'amber', badge: approver ? c.stale : c.myStale, badgeHint: 'opportunities requiring an update' },
    { key: 'voice', page: 'voice', icon: 'mic', label: 'Voice update', hint: 'Record a lead or opportunity update', to: '/voice', color: 'wine' },
    { key: 'approvals', page: 'approvals', icon: 'checkCircle', label: approver ? 'Approvals' : 'My approvals', hint: 'Review decisions, clearances, and conditions', to: '/approvals', color: 'green', badge: approver ? c.pending + c.openConditions : c.myPending, badgeHint: 'pending decisions and unconfirmed conditions' },
    { key: 'folders', page: 'folders', icon: 'folder', label: 'SharePoint folders', hint: 'Opportunity documents stored in SharePoint', to: '/folders', color: 'teal' },
    { key: 'po', page: 'po', icon: 'clipboardCheck', label: isSalesOwner(role) ? 'My Purchase Orders' : 'Purchase Orders', hint: 'PO validation & booked orders', to: '/po', color: 'navy', badge: approver ? c.poReview : 0, badgeHint: 'POs in validation' },
    { key: 'aimap', page: 'aimap', icon: 'sparkles', label: 'AI and automation', hint: '28 AI interventions and live demonstrations', to: '/aimap', color: 'purple', show: admin || role === 'AH' || role === 'LJS' },
    { key: 'pricelists', page: 'pricelists', icon: 'tag', label: 'Price lists', hint: 'B&K, Metrix, and ad hoc quotations', to: '/pricelists', color: 'amber', show: comm },
    { key: 'customers', page: 'customers', icon: 'users', label: 'Customers', hint: 'Master + Green/Blue/Amber/Red', to: '/customers', color: 'rust' },
    { key: 'launcher', page: 'launcher', icon: 'play', label: 'Demo launcher', hint: 'Guided demonstration scenarios', to: '/launcher', color: 'slate', show: admin },
    { key: 'admin', page: 'admin', icon: 'gear', label: 'Admin', hint: 'Rules, AI model, SharePoint, uploads', to: '/admin', color: 'wine', show: admin || role === 'LJS' },
    { key: 'audit', page: 'audit', icon: 'list', label: 'Audit Trail', hint: 'Who changed what, when', to: '/audit', color: 'slate', show: admin },
    { key: 'users', page: 'users', icon: 'shield', label: 'Users and roles', hint: 'Accounts, registrations, and permissions', to: '/users', color: 'navy', show: admin },
  ].filter(t => t.show !== false && (!('show' in t) || t.show === true) && canSeePage(role, t.page))
}

// Desktop Home groups the tool wall into labelled columns.
export const HOME_GROUPS = [
  { title: 'Sales & opportunities', keys: ['mydashboard', 'opportunities', 'status', 'voice', 'approvals'] },
  { title: 'Document flow', keys: ['inbox', 'folders', 'po'] },
  { title: 'Insights & AI', keys: ['aimap', 'customers', 'pricelists', 'users', 'admin', 'audit', 'launcher'] },
]
