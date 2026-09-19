// The runtime rule snapshot is deliberately plain data. Rule modules remain
// deterministic and synchronous; Supabase is queried once during hydration,
// not from every gate calculation.

const asObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}

export function applyRuleRows(config = {}, { approval = [], workflow = [], lead = [] } = {}) {
  const next = { ...config }
  const approvalRow = approval.find(row => row.enabled !== false && row.rule_key === 'approval-thresholds') || approval[0]
  const leadRow = lead.find(row => row.enabled !== false && row.rule_key === 'lead-routing-and-deadlines') || lead[0]
  const workflowRow = workflow.find(row => row.enabled !== false && row.rule_key === 'workflow-and-gates') || workflow[0]
  const approvalDef = asObject(approvalRow?.definition)
  const leadDef = asObject(leadRow?.definition)
  const workflowDef = asObject(workflowRow?.definition)
  if (Object.keys(approvalDef).length) {
    next.approvalThresholds = approvalDef.thresholds || approvalDef
    if (Array.isArray(approvalDef.gates)) next.approvalRules = approvalDef.gates
  }
  for (const key of ['ownershipRules', 'ownerRules', 'stateRegions', 'leadDeadlines', 'fastTrack']) {
    if (workflowDef[key] !== undefined) continue
    if (leadDef[key] !== undefined) next[key] = leadDef[key]
  }
  for (const key of ['workflow', 'customerClasses', 'documentChecklists', 'kycItems', 'kycValidation', 'classRules', 'amberFee']) {
    if (workflowDef[key] !== undefined) next[key] = workflowDef[key]
  }
  if (workflowDef.requiredFields !== undefined) next.workflowRequiredFields = workflowDef.requiredFields
  if (workflowDef.routeRules !== undefined) next.workflowRouteRules = workflowDef.routeRules
  return next
}

export function ruleCacheKey() {
  return 'wintrack-modae-runtime-rules-v1'
}

export function readCachedRules() {
  try {
    const value = JSON.parse(localStorage.getItem(ruleCacheKey()) || 'null')
    return value && typeof value === 'object' ? value : null
  } catch { return null }
}

export function writeCachedRules(config) {
  try { localStorage.setItem(ruleCacheKey(), JSON.stringify(config)) } catch { /* cache is optional */ }
}
