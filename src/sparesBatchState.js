import { canPriceProposal } from './utils.js'
import { applySparesBatch } from './workbench/mobileSpares.js'

export const sparesCostingSnapshot = (state, oppId) => JSON.stringify({
  costing: state.proposals?.[oppId]?.costing || {},
  defaults: state.config?.costingDefaults || {},
  rates: state.config?.currencyRates || {},
  // Every displayed total belongs to the review, including unselected rows.
  lines: state.sparesLines?.filter(line => line.oppId === oppId) || [],
})

export function applySparesBatchToState(state, oppId, changes, expectedCosting) {
  const opp = state.opportunities.find(item => item.id === oppId)
  if (!opp || opp.route !== 'Spares' || opp.status === 'Closed' || ['Won', 'Lost', 'Closed'].includes(opp.stage) || opp.milestone !== 'Sourcing' || !canPriceProposal(state.role)) return { ok: false, error: 'Sourcing is now read-only. Return to its current stage for corrections with an authorized pricing role.' }
  if (expectedCosting != null && expectedCosting !== sparesCostingSnapshot(state, oppId)) return { ok: false, error: 'The costing basis changed. Review the recalculated prices before applying.' }
  return applySparesBatch(state.sparesLines, oppId, changes)
}
