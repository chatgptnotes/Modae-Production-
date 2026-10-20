// Shared read contract. These dependencies are chosen before database reads.
export const WORKSPACE_VIEW_KINDS = ['overview', 'list', 'detail', 'inbox', 'lead', 'approvals', 'sent', 'orders', 'identity', 'full']
const workflowRecords = ['sales', 'kyc', 'surveys', 'svcEstimates', 'poCompare', 'leadArchive', 'leadDeadlines']
const workflowTables = ['leads', 'opportunities', 'approvals', 'proposals', 'spares_lines', 'clarifications']
export function validateWorkspaceView(view) {
  if (!WORKSPACE_VIEW_KINDS.includes(view?.kind)) throw Object.assign(new Error('Invalid workspace view.'), { status: 400 })
  if (['detail', 'lead'].includes(view.kind) && (typeof view.id !== 'string' || !view.id || view.id.length > 200)) throw Object.assign(new Error('Invalid record identifier.'), { status: 400 })
  return view
}
export function workspaceViewPlan(view) {
  validateWorkspaceView(view)
  const base = { records: ['users', 'workspace_generation', 'customers'], tables: [], signals: false, catalogue: false }
  switch (view.kind) {
    case 'identity': return base
    case 'inbox': return { ...base, records: [...base.records, 'leadArchive'], tables: [], leadIndex: true }
    case 'lead': return { ...base, records: [...base.records, 'kyc', 'leadArchive', 'adhocParts', 'files'], tables: ['leads', 'approvals'], catalogue: view.pricing === true }
    case 'sent': return { ...base, records: [...base.records, 'communications'], tables: ['opportunities'], proposalIndex: true }
    case 'orders': return { ...base, records: [...base.records, 'sales', 'poCompare'], tables: ['opportunities'] }
    case 'approvals': return { ...base, records: [...base.records, ...workflowRecords], tables: workflowTables }
    case 'overview': case 'list': return { ...base, records: [...base.records, ...workflowRecords], tables: workflowTables, signals: true }
    case 'detail': return { ...base, records: [...base.records, ...workflowRecords, 'files', 'communications', 'handover', 'bSteps', 'bStepOwners', 'rateSheets', 'adhocParts', 'vendorQuotes', 'competitors'], tables: [...workflowTables, 'audit'] }
    default: return { ...base, records: null, tables: [...workflowTables, 'audit'], signals: true }
  }
}

export const LEAD_INDEX_FIELDS = ['id','rfqNumber','subject','from','sender','company','customer','customerName','sellTo','status','assignedOwner','suggestedOwner','oppId','ts','source','channel','receivedAt','customerStatus','legacyCustomerClass','customerClassificationVersion','ref','route','urgency','completeness','readAt','starred','simulated','region','location','category','duplicateRisk']
export function leadIndex(row) {
  return { ...Object.fromEntries(LEAD_INDEX_FIELDS.filter(key => key in row).map(key => [key, row[key]])),
    body: String(row.body || '').replace(/\s+/g, ' ').slice(0, 160),
    ai: { summary: row.ai?.summary || '', fields: (row.ai?.fields || []).map(({ state }) => ({ state })) }, parse: { oppType: row.parse?.oppType, confidence: row.parse?.confidence } }
}
