// Credentials and account lifecycle belong to the current workspace, even when
// restoring business records created by the same people in an older backup.
export function mergeLocalBackupState(current, imported) {
  if (!imported || typeof imported !== 'object' || Array.isArray(imported)) throw new Error('Invalid backup state.')
  const audit = new Map((current.audit || []).map(row => [row.id, row]))
  for (const row of imported.audit || []) {
    if (!row?.id) throw new Error('The backup contains an audit entry without an identity.')
    if (audit.has(row.id) && JSON.stringify(audit.get(row.id)) !== JSON.stringify(row)) throw new Error('The backup conflicts with retained audit history.')
    audit.set(row.id, row)
  }
  const next = { ...current, ...imported, audit: [...audit.values()] }
  for (const key of ['users', 'auth', 'role', 'roles', 'oneTimeCleanups', 'viewMode', 'viewModePinned', 'viewModePinnedAt', 'viewModePreferenceRev', 'inboxShowAll']) next[key] = current[key]
  // Restored IDs are deliberately live again; unrelated tombstones stay intact.
  next.deletedOpportunityIds = (current.deletedOpportunityIds || []).filter(id => !(imported.opportunities || []).some(row => row.id === id))
  next.deletedLeadIds = (current.deletedLeadIds || []).filter(id => !(imported.leads || []).some(row => row.id === id))
  next.pendingOpportunitySyncIds = []
  return next
}
