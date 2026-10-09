export const INBOX_VIEWS = [
  { key: 'all', label: 'All leads' },
  { key: 'review', label: 'Needs review' },
  { key: 'converted', label: 'Converted' },
  { key: 'starred', label: 'Starred' },
]

export function matchesInboxView(lead, view) {
  if (view === 'review') return lead.status === 'New' || lead.status === 'Qualified'
  if (view === 'converted') return lead.status === 'Converted'
  if (view === 'starred') return !!lead.starred
  return true
}

export function inboxViewCounts(rows) {
  return Object.fromEntries(INBOX_VIEWS.map(({ key }) => [key, rows.filter(lead => matchesInboxView(lead, key)).length]))
}
