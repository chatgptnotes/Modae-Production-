export const DEFAULT_LEAD_DEADLINES = {
  kycDays: 7,
  amberFeeDays: 7,
  clarificationDays: 7,
}

export const DEFAULT_FAST_TRACK = {
  enabled: true,
  customerStatus: 'Green',
}

export function leadConfig(config = {}) {
  return {
    ownershipRules: Array.isArray(config.ownershipRules) ? config.ownershipRules : [],
    leadDeadlines: { ...DEFAULT_LEAD_DEADLINES, ...(config.leadDeadlines || {}) },
    fastTrack: { ...DEFAULT_FAST_TRACK, ...(config.fastTrack || {}) },
    kycItems: Array.isArray(config.kycItems) ? config.kycItems : [],
  }
}

export function routeOwner(region, config = {}, fallback = '') {
  const value = String(region || '').toLowerCase()
  const rules = leadConfig(config).ownershipRules
  // L-05-AI ends with "Unclassified Leads - LJS (approval needed)". A region
  // that was entered but matches no rule *is* unclassified, so it resolves to
  // that row rather than to whatever the caller passed in. A region that has
  // not been entered yet is a different thing — the AI's own suggestion still
  // stands, so a blank keeps the caller's fallback.
  const catchAll = rules.find(item => item.unclassified)
  if (!value) return fallback
  const rule = rules.find(item => {
    if (item.unclassified) return false
    const label = String(item.region || '').toLowerCase()
    return label && (value.includes(label) || label.split(/[,/&]/).some(part => part.trim() && value.includes(part.trim())))
  })
  return rule?.owner || catchAll?.owner || fallback
}

export function isFastTrackLead(lead, config = {}, customer = null) {
  const cfg = leadConfig(config).fastTrack
  if (!cfg.enabled) return false
  return lead?.fastTrack === true || customer?.status === cfg.customerStatus || lead?.customerStatus === cfg.customerStatus
}

export function deadlineForLead(lead, config = {}, now = new Date()) {
  const cfg = leadConfig(config)
  const base = new Date(lead?.verification?.requestedAt || lead?.customerClassifiedAt || lead?.deadlineStartedAt || lead?.ts || now).getTime()
  const add = (days, type, reason) => ({
    type, reason,
    dueAt: new Date(base + Number(days || 0) * 86400000).toISOString(),
  })
  const rows = []
  if (lead?.customerStatus === 'Blue' && !lead?.kycCompletedAt) {
    rows.push(add(cfg.leadDeadlines.kycDays, 'kyc', 'KYC documents not received'))
  }
  if (lead?.customerStatus === 'Amber' && lead?.amberFeePaid !== true) {
    rows.push(add(cfg.leadDeadlines.amberFeeDays, 'amberFee', 'Amber processing fee not received'))
  }
  if ((lead?.ai?.missing || []).length && !lead?.clarificationCompletedAt) {
    rows.push(add(cfg.leadDeadlines.clarificationDays, 'clarification', 'Required clarification not received'))
  }
  return rows
}

export function expiredLeadDeadline(lead, config = {}, now = new Date()) {
  const nowMs = new Date(now).getTime()
  return deadlineForLead(lead, config, now).find(row => new Date(row.dueAt).getTime() <= nowMs) || null
}

export function aiAuditDetail({ provider = '', model = '', action = '', result = {} } = {}) {
  return JSON.stringify({ provider, model, action, result })
}
