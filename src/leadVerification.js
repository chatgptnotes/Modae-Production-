// Verification required before a qualified lead can become an opportunity.
// The record lives on the lead so the opportunity can carry a read-only
// snapshot without asking the salesperson to verify the same thing twice.
//
// What each class must verify is configuration, not code — see
// customerClasses.js. Callers pass `config` through the trailing options bag;
// when they don't, the seeded defaults apply, which is the behaviour that used
// to be hardcoded here.
import {
  DEFAULT_CUSTOMER_CLASSES, classRule, classDeadlineDays, checklistFor,
} from './customerClasses.js'

// Derived rather than authored, but still exported: the lead KYC document list
// is consumed as a value by the Inbox UI and by tests.
export const BLUE_KYC_ITEMS = checklistFor(null, 'Blue')

// Red is the one class whose evidence is *not* on the lead. Its clearance is a
// joint LJS + AH approval record, so the caller resolves it and passes the
// answer in. This module must stay importable by `node --test`, which means no
// reaching into the store from here.
export const RED_CLEARANCE = DEFAULT_CUSTOMER_CLASSES.Red.verification.approvalType
export const RED_BLOCKER = DEFAULT_CUSTOMER_CLASSES.Red.verification.blockerText
const APPROVED = DEFAULT_CUSTOMER_CLASSES.Red.verification.approvedStatuses

const approvedStatuses = config =>
  classRule(config, 'Red')?.verification?.approvedStatuses || APPROVED

// A Returned clearance can be re-requested, so a lead may carry more than one.
// A granted decision always wins; otherwise take the most recent request.
export function redClearanceFor(approvals, leadId, config = null) {
  const type = classRule(config, 'Red')?.verification?.approvalType || RED_CLEARANCE
  const ok = approvedStatuses(config)
  const mine = (approvals || []).filter(a => a.leadId === leadId && a.type === type)
  if (!mine.length) return null
  return mine.find(a => ok.includes(a.status))
    || [...mine].sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')))[0]
}
export const isRedCleared = (approval, config = null) =>
  !!approval && approvedStatuses(config).includes(approval.status)

export function verificationDeadline(lead, customerStatus, config = {}, now = new Date()) {
  const rule = classRule(config, customerStatus)
  const days = classDeadlineDays(config, customerStatus)
  // Green needs nothing, and Red's clearance is an approval rather than a
  // countdown the salesperson is chasing — both resolve to no deadline.
  if (!rule?.verification?.required || !days) return null
  const requestedAt = lead?.verification?.requestedAt || lead?.customerClassifiedAt || lead?.ts || now.toISOString()
  const dueAt = new Date(new Date(requestedAt).getTime() + days * 86400000)
  const remaining = Math.ceil((dueAt.getTime() - new Date(now).getTime()) / 86400000)
  return { requestedAt, dueAt: dueAt.toISOString(), days, remaining, expired: remaining < 0 }
}

export const verificationItem = (verification, item) =>
  verification?.kyc?.[item] || { state: 'Missing', mode: '', file: '', verifiedAt: '' }

export function blueKycComplete(verification, config = null) {
  if (verification?.kycRequestStatus === 'cancelled') return false
  const items = checklistFor(config, 'Blue')
  return items.every(item => verificationItem(verification, item).state === 'Verified')
}

export function amberPaymentComplete(verification) {
  return verification?.payment?.state === 'Confirmed'
}

// Dispatch on what the class *requires*, not on its name, so a renamed or
// reconfigured class needs no code change here.
export function leadVerificationComplete(lead, customerStatus = lead?.customerStatus || '', { redCleared = false, config = null } = {}) {
  const v = classRule(config, customerStatus)?.verification
  if (!v) return false
  switch (v.requires) {
    case 'none': return true
    case 'documents': return checklistFor(config, customerStatus)
      .every(item => verificationItem(lead?.verification, item).state === 'Verified')
      && lead?.verification?.kycRequestStatus !== 'cancelled'
    case 'fee': return amberPaymentComplete(lead?.verification)
    // Red used to return false here unconditionally, with no way to pass the
    // clearance in — so an approved Red lead could never be registered.
    case 'jointApproval': return !!redCleared
    default: return false
  }
}

export function leadVerificationBlockers(lead, customerStatus = lead?.customerStatus || '', { redCleared = false, config = null } = {}) {
  const v = classRule(config, customerStatus)?.verification
  if (!v) return ['Customer classification is required']
  if (v.requires === 'documents') {
    const template = v.itemBlockerText || '{item} verification is required'
    return checklistFor(config, customerStatus)
      .filter(item => verificationItem(lead?.verification, item).state !== 'Verified')
      .map(item => template.replace('{item}', item))
  }
  if (v.requires === 'fee') {
    return amberPaymentComplete(lead?.verification) ? []
      : [v.blockerText || 'Amber processing-fee payment confirmation is required']
  }
  if (v.requires === 'jointApproval') return redCleared ? [] : [v.blockerText || RED_BLOCKER]
  return []
}

export function verificationSnapshot(lead, customerStatus = lead?.customerStatus || '', { approval = null, config = null } = {}) {
  const v = classRule(config, customerStatus)?.verification
  const snap = v?.snapshot
  if (v?.requires === 'documents') {
    return {
      status: snap?.status || 'Verified', type: snap?.type || 'KYC', customerStatus,
      items: Object.fromEntries(checklistFor(config, customerStatus)
        .map(item => [item, verificationItem(lead?.verification, item)])),
      verifiedAt: lead?.verification?.kycVerifiedAt || '',
    }
  }
  if (v?.requires === 'fee') {
    return {
      status: snap?.status || 'Confirmed', type: snap?.type || 'Payment', customerStatus,
      payment: lead?.verification?.payment || {},
      confirmedAt: lead?.verification?.payment?.confirmedAt || '',
    }
  }
  // A Red opportunity used to record "Not required", losing the only trace of
  // the joint clearance that authorised it. Keep the decision on the record.
  if (v?.requires === 'jointApproval') {
    return {
      status: isRedCleared(approval, config) ? (snap?.status || 'Cleared') : (snap?.failStatus || 'Not cleared'),
      type: snap?.type || 'Red continuation', customerStatus,
      approvalId: approval?.id || '',
      decidedBy: Object.keys(approval?.decisions || {}),
      conditions: (approval?.conditions || []).map(c => c.text),
      verifiedAt: approval?.decisionTs || '',
    }
  }
  return { status: 'Not required', type: 'None', customerStatus, verifiedAt: '' }
}
