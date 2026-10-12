import { classRule } from './customerClasses.js'

// Operational approvers are configured per customer class. Application admins
// may record an exception too; ordinary sales access never implies approval.
export function canOverrideCustomerKyc(actor, opp, config) {
  const gate = classRule(config, opp?.customerStatus)?.gate
  if (gate?.overrideField !== 'kycOverride' || gate.exceptionWaivable === false) return false
  const identities = typeof actor === 'string' ? [actor] : [actor?.role, ...(actor?.roles || [])]
  return identities.some(id => ['ADMIN', 'SUPER', 'LJS', ...(gate.approvers || [])].includes(id))
}

export function createKycOverride(actor, opp, config, reason, now = new Date()) {
  if (!canOverrideCustomerKyc(actor, opp, config) || !String(reason || '').trim()) return null
  const role = typeof actor === 'string' ? actor : actor.role
  return {
    by: role,
    ...(typeof actor === 'object' && actor.roles?.includes('ADMIN') ? { authority: 'ADMIN' } : {}),
    reason: String(reason).trim(), ts: now.toISOString(),
  }
}

export function customerGateOverridden(opp, config) {
  const gate = classRule(config, opp?.customerStatus)?.gate
  if (!gate?.overrideField || gate.exceptionWaivable === false) return false
  const decision = opp[gate.overrideField]
  if (gate.overrideField !== 'kycOverride') return !!decision
  return !!decision && typeof decision === 'object'
    && typeof decision.by === 'string' && !!decision.by.trim()
    && typeof decision.reason === 'string' && !!decision.reason.trim()
    && !!decision.ts && Number.isFinite(Date.parse(decision.ts))
    && canOverrideCustomerKyc({ role: decision.by, roles: decision.authority === 'ADMIN' ? ['ADMIN'] : [] }, opp, config)
}
