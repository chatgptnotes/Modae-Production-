import { isApprover, displayRole } from '../utils.js'

export const topbarTitleFor = (pathname, role) => {
  const titles = {
    '/': ['Opportunities', 'cards'],
    '/my-dashboard': ['Dashboard', 'chartBar'],
    '/inbox': ['Lead inbox', 'inbox'],
    '/opportunities': ['Opportunities', 'cards'],
    '/proposal-sent': ['Proposal Sent', 'send'],
    '/folders': ['Documents', 'folder'],
    '/customers': ['Customer Master', 'users'],
    '/pricelists': ['Price Lists', 'tag'],
    '/admin': ['Admin configuration', 'gear'],
    '/audit': ['Audit Trail', 'list'],
    '/users': ['User management', 'shield'],
  }
  if (pathname === '/approvals') return { label: isApprover(role) ? `Approvals — ${displayRole(role)}` : 'My approval requests', icon: 'checkCircle' }
  const title = titles[pathname]
  return title ? { label: title[0], icon: title[1] } : null
}
