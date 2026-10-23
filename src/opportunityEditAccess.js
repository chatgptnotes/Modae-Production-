import { isAdminRole } from './utils.js'

export const canEditOpportunityDetails = (opp, role, canPerform) =>
  opp?.status !== 'Closed' && canPerform?.('opportunities.edit') !== false &&
  (opp?.owner === role || isAdminRole(role))
