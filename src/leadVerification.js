// Verification required before a qualified lead can become an opportunity.
// The record lives on the lead so the opportunity can carry a read-only
// snapshot without asking the salesperson to verify the same thing twice.
//
// What each class must verify is configuration, not code — see
// customerClasses.js. Callers pass `config` through the trailing options bag;
// when they don't, the seeded defaults apply, which is the behaviour that used
// to be hardcoded here.
import {
  LEGACY_CUSTOMER_CLASSES, classRule, classDeadlineDays, checklistFor,
} from './customerClasses.js'

// Derived rather than authored, but still exported: the lead KYC document list
// is consumed as a value by the Inbox UI and by tests.
export const BLUE_KYC_ITEMS = checklistFor(null, 'Blue')

// Red is the one class whose evidence is *not* on the lead. Its clearance is a
// joint LJS + AH approval record, so the caller resolves it and passes the
// answer in. This module must stay importable by `node --test`, which means no
// reaching into the store from here.
export const RED_CLEARANCE = LEGACY_CUSTOMER_CLASSES.Red.verification.approvalType
export const RED_BLOCKER = LEGACY_CUSTOMER_CLASSES.Red.verification.blockerText
const APPROVED = LEGACY_CUSTOMER_CLASSES.Red.verification.approvedStatuses

const approvedStatuses = (config, customerStatus = 'Red') =>
  classRule(config, customerStatus)?.verification?.approvedStatuses || APPROVED

// A Returned clearance can be re-requested, so a lead may carry more than one.
// A granted decision always wins; otherwise take the most recent request.
export function redClearanceFor(approvals, leadId, config = null, customerStatus = 'Red') {
  const type = classRule(config, customerStatus)?.verification?.approvalType || RED_CLEARANCE
  const ok = approvedStatuses(config, customerStatus)
  const mine = (approvals || []).filter(a => !a.supersededBy).filter(a => a.leadId === leadId && a.type === type)
  if (!mine.length) return null
  return mine.find(a => ok.includes(a.status))
    || [...mine].sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')))[0]
}
export const isRedCleared = (approval, config = null, customerStatus = 'Red') =>
  !!approval && approvedStatuses(config, customerStatus).includes(approval.status)

export function verificationDeadline(lead, customerStatus, config = {}, now = new Date()) {
  const rule = classRule(config, customerStatus, lead)
  const days = classDeadlineDays(config, customerStatus)
  // Green needs nothing, and Red's clearance is an approval rather than a
  // countdown the salesperson is chasing — both resolve to no deadline.
  if (!rule?.verification?.required || !days) return null
  const requestedAt = lead?.verification?.requestedAt || lead?.customerClassifiedAt || lead?.ts || toISTISOString(now)
  const dueAt = new Date(new Date(requestedAt).getTime() + days * 86400000)
  const remaining = Math.ceil((dueAt.getTime() - new Date(now).getTime()) / 86400000)
  return { requestedAt, dueAt: toISTISOString(dueAt), days, remaining, expired: remaining < 0 }
}

export const verificationItem = (verification, item) =>
  verification?.kyc?.[item] || { state: 'Missing', mode: '', file: '', verifiedAt: '' }

// `Verified` is retained as a read-compatible legacy value for seeded and
// already-approved records. New human decisions use the clearer `Approved`
// label so the UI can distinguish approval from extraction/format validation.
export const kycItemApproved = item => ['Approved', 'Verified'].includes(item?.state)

export function amberPaymentComplete(verification) {
  return verification?.payment?.state === 'Confirmed'
}

// Dispatch on what the class *requires*, not on its name, so a renamed or
// reconfigured class needs no code change here.
// Evidence validation is deliberately separate from permission to register.
export function kycVerificationComplete(lead, config = null) {
  const items = checklistFor(config, lead?.customerStatus || 'Unclassified')
  return items.length > 0 && lead?.verification?.kycRequestStatus !== 'cancelled'
    && items.every(item => kycItemApproved(verificationItem(lead?.verification, item)))
}
export function leadVerificationComplete() { return true }

export function leadVerificationBlockers() { return [] }

export function verificationSnapshot(lead, customerStatus = lead?.customerStatus || '', { approval = null, config = null } = {}) {
  if (lead?.existingCustomerKyc === true) return { status: 'Verified', type: 'KYC', customerStatus, items: {}, verifiedAt: lead?.kycCompletedAt || '' }
  const v = classRule(config, customerStatus, lead)?.verification
  const snap = v?.snapshot
  if (v?.requires === 'documents' || ((!v || v.requires === 'none') && (Object.keys(lead?.verification?.kyc || {}).length > 0 || lead?.verification?.kycRequestStatus))) {
    return {
      status: lead?.verification?.kycRequestStatus === 'deferred' ? 'Deferred'
        : kycVerificationComplete(lead, config) ? (snap?.status || 'Verified') : 'Pending',
      type: snap?.type || 'KYC', customerStatus,
      items: Object.fromEntries(checklistFor(config, customerStatus)
        .map(item => [item, verificationItem(lead?.verification, item)])),
      verifiedAt: lead?.verification?.kycVerifiedAt || '',
      deferredAt: lead?.verification?.kycRequestStatus === 'deferred' ? (lead?.lastUpdated || '') : '',
    }
  }
  if (v?.requires === 'fee') {
    return {
      status: amberPaymentComplete(lead?.verification) ? (snap?.status || 'Confirmed') : 'Pending', type: snap?.type || 'Payment', customerStatus,
      payment: lead?.verification?.payment || {},
      confirmedAt: lead?.verification?.payment?.confirmedAt || '',
    }
  }
  // A Red opportunity used to record "Not required", losing the only trace of
  // the joint clearance that authorised it. Keep the decision on the record.
  if (v?.requires === 'jointApproval') {
    return {
      status: isRedCleared(approval, config, customerStatus) ? (snap?.status || 'Cleared') : (snap?.failStatus || 'Not cleared'),
      type: snap?.type || 'Red continuation', customerStatus,
      approvalId: approval?.id || '',
      decidedBy: Object.keys(approval?.decisions || {}),
      conditions: (approval?.conditions || []).map(c => c.text),
      verifiedAt: approval?.decisionTs || '',
    }
  }
  return { status: 'Not required', type: 'None', customerStatus, verifiedAt: '' }
}
import { toISTISOString } from './utils.js'
