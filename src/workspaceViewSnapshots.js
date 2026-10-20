import { leadIndex } from './workspaceViewPlan.js'
import { opportunitySummary } from './workspaceViews.js'

// Apply confirmed rows to display models only. Never synthesize revisions or
// install these compact rows as editor baselines.
export function patchWorkspaceViewSnapshot(result, records) {
  const summary = result.summary || {}
  const upsert = (rows, record, transform = row => row) => {
    const next = (rows || []).filter(row => row.id !== record.id)
    if (record.available !== false && record.data) next.push(transform(record.data))
    return next
  }
  for (const row of records) {
    if (row.entity === 'leads') {
      if (summary.leads) summary.leads = upsert(summary.leads, row, leadIndex)
      if (summary.navigation) summary.navigation.leads = upsert(summary.navigation.leads, row, leadIndex)
      if (summary.leadRevisions) {
        if (row.available === false) delete summary.leadRevisions[row.id]
        else summary.leadRevisions[row.id] = row.rev
      }
      if (row.available === false && summary.leadArchive) summary.leadArchive = upsert(summary.leadArchive, row, leadIndex)
    }
    if (row.entity === 'state' && row.id === 'leadArchive' && summary.leadArchive) summary.leadArchive = (row.data || []).map(leadIndex)
    if (row.entity === 'opportunities') {
      if (summary.opportunities) summary.opportunities = upsert(summary.opportunities, row, opportunitySummary)
      if (summary.navigation) summary.navigation.opportunities = upsert(summary.navigation.opportunities, row, opportunitySummary)
    }
    if (row.entity === 'approvals' && summary.navigation) summary.navigation.approvals = upsert(summary.navigation.approvals, row)
    if (row.entity === 'proposals' && summary.proposalRevisions) {
      if (row.available === false) delete summary.proposalRevisions[row.id]
      else summary.proposalRevisions[row.id] = { revision: row.data?.revision || '00' }
    }
  }
}
