import { convertCurrency } from '../currency.js'
import { isAdminRole } from '../utils.js'

export const projectDraftStorageKey = (userId, oppId, category) => `wintrack-modae-phone-project-${encodeURIComponent(userId)}-${encodeURIComponent(oppId)}-${encodeURIComponent(category)}`
export const projectSourcingEditable = (opp, role, readOnly) => !readOnly && opp.route === 'Project' && opp.status !== 'Closed' && !['Won', 'Lost', 'Closed'].includes(opp.stage) && opp.milestone === 'Sourcing' && (opp.owner === role || isAdminRole(role))

export function reviewProjectBoqEdits(proposal, field, drafts) {
  const allowed = ['qtyPerUnit', 'common', 'spares', 'quoted']
  const errors = [], changes = []
  const bom = (proposal.bom || []).map(line => ({ ...line }))
  for (const [index, draft] of Object.entries(drafts)) {
    const line = bom[Number(index)]
    const numeric = String(draft).trim() === '' ? NaN : Number(draft)
    if (!allowed.includes(field) || !/^\d+$/.test(index) || !line || (field === 'quoted' ? draft !== '' && (!Number.isFinite(numeric) || numeric <= 0) : !Number.isFinite(numeric) || numeric < 0 || !Number.isInteger(numeric))) {
      errors.push({ index, label: line?.pn || `Line ${Number(index) + 1}`, reason: field === 'quoted' ? 'Enter a positive customer price or leave blank for calculated pricing.' : 'Enter a whole quantity of zero or more.' })
      continue
    }
    const value = field === 'quoted' ? draft === '' ? '' : String(convertCurrency(numeric, proposal.sourceCurrency || 'INR', 'INR', proposal.costing?.currencyRates)) : numeric
    if (String(line[field] ?? '') === String(value)) continue
    changes.push({ index: Number(index), label: line.pn || line.desc, before: line[field], after: value })
    line[field] = value
  }
  return { errors, changes, proposal: { ...proposal, bom } }
}

export function projectProposalAfterEdit(proposal) {
  const reviewed = ['Validated', 'Override accepted'].includes(proposal.reviewStatus)
  return { ...proposal, pricedOnce: proposal.pricedOnce || !!proposal.bom?.length, reviewStatus: reviewed ? 'Needs review' : proposal.reviewStatus, reviewIssues: reviewed ? [] : proposal.reviewIssues, reviewNeedsRevision: reviewed || proposal.reviewNeedsRevision }
}
