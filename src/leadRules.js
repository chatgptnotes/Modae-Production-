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

// Supply a piece of information the AI could not find, by hand. Returns the
// lead patch, or null when there is nothing usable to record.
//
// `ai.missing` is not cosmetic: it holds the L-07 AI validation step open
// (leadWorkflow.aiComplete) and keeps a clarification deadline running
// (deadlineForLead above). Answering an item is therefore what actually moves
// the lead on — waiting for the customer to reply was previously the only way.
//
// The answer lands as an accepted field at full confidence because a human
// typed it, and completeness rises by the share the answered item represented,
// so clearing the last outstanding item closes the lead at 100 rather than at
// some arbitrary remainder.
export function supplyMissing(lead, label, value, key = null) {
  const k = String(label ?? '').trim()
  const v = String(value ?? '').trim()
  if (!k || !v) return null
  const ai = lead?.ai || {}
  const outstanding = ai.missing || []
  const remaining = key == null ? outstanding : outstanding.filter(m => m !== key)
  const answered = outstanding.length - remaining.length
  const current = lead?.completeness ?? 0
  return {
    completeness: answered && outstanding.length
      ? Math.min(100, current + Math.round((100 - current) / outstanding.length))
      : current,
    ai: {
      ...ai,
      missing: remaining,
      fields: [...(ai.fields || []), {
        k, v, conf: 100, state: 'accepted', group: 'Added manually',
        note: 'Supplied by user', manual: true,
      }],
    },
  }
}

export function expiredLeadDeadline(lead, config = {}, now = new Date()) {
  const nowMs = new Date(now).getTime()
  return deadlineForLead(lead, config, now).find(row => new Date(row.dueAt).getTime() <= nowMs) || null
}

export function aiAuditDetail({ provider = '', model = '', action = '', result = {} } = {}) {
  return JSON.stringify({ provider, model, action, result })
}
