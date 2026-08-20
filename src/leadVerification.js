// Verification required before a qualified lead can become an opportunity.
// The record lives on the lead so the opportunity can carry a read-only
// snapshot without asking the salesperson to verify the same thing twice.
export const BLUE_KYC_ITEMS = [
  'GST certificate',
  'PAN certificate',
  'Cancelled cheque',
  'EFT / bank mandate',
]

// Red is the one class whose evidence is *not* on the lead. Its clearance is a
// joint LJS + AH approval record, so the caller resolves it and passes the
// answer in. This module must stay importable by `node --test`, which means no
// reaching into the store from here.
export const RED_CLEARANCE = 'Red customer clearance'
export const RED_BLOCKER = 'Red continuation approval (joint LJS + AH) not granted'
const APPROVED = ['Approved', 'Approved with conditions']

// A Returned clearance can be re-requested, so a lead may carry more than one.
// A granted decision always wins; otherwise take the most recent request.
export function redClearanceFor(approvals, leadId) {
  const mine = (approvals || []).filter(a => a.leadId === leadId && a.type === RED_CLEARANCE)
  if (!mine.length) return null
  return mine.find(a => APPROVED.includes(a.status))
    || [...mine].sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')))[0]
}
export const isRedCleared = approval => !!approval && APPROVED.includes(approval.status)

export function verificationDeadline(lead, customerStatus, config = {}, now = new Date()) {
  if (!['Blue', 'Amber'].includes(customerStatus)) return null
  const requestedAt = lead?.verification?.requestedAt || lead?.customerClassifiedAt || lead?.ts || now.toISOString()
  const days = customerStatus === 'Amber'
    ? Number(config.leadDeadlines?.amberFeeDays ?? 7)
    : Number(config.leadDeadlines?.kycDays ?? 7)
  const dueAt = new Date(new Date(requestedAt).getTime() + days * 86400000)
  const remaining = Math.ceil((dueAt.getTime() - new Date(now).getTime()) / 86400000)
  return { requestedAt, dueAt: dueAt.toISOString(), days, remaining, expired: remaining < 0 }
}

export const verificationItem = (verification, item) =>
  verification?.kyc?.[item] || { state: 'Missing', mode: '', file: '', verifiedAt: '' }

export function blueKycComplete(verification) {
  return BLUE_KYC_ITEMS.every(item => verificationItem(verification, item).state === 'Verified')
}

export function amberPaymentComplete(verification) {
  return verification?.payment?.state === 'Confirmed'
}

export function leadVerificationComplete(lead, customerStatus = lead?.customerStatus || '', { redCleared = false } = {}) {
  if (customerStatus === 'Green') return true
  if (customerStatus === 'Blue') return blueKycComplete(lead?.verification)
  if (customerStatus === 'Amber') return amberPaymentComplete(lead?.verification)
  // Red used to return false here unconditionally, with no way to pass the
  // clearance in — so an approved Red lead could never be registered.
  if (customerStatus === 'Red') return !!redCleared
  return false
}

export function leadVerificationBlockers(lead, customerStatus = lead?.customerStatus || '', { redCleared = false } = {}) {
  if (customerStatus === 'Green') return []
  if (customerStatus === 'Blue') {
    return BLUE_KYC_ITEMS
      .filter(item => verificationItem(lead?.verification, item).state !== 'Verified')
      .map(item => `${item} verification is required`)
  }
  if (customerStatus === 'Amber' && !amberPaymentComplete(lead?.verification)) {
    return ['Amber processing-fee payment confirmation is required']
  }
  if (customerStatus === 'Red') return redCleared ? [] : [RED_BLOCKER]
  if (customerStatus === 'Amber') return []
  return ['Customer classification is required']
}

export function verificationSnapshot(lead, customerStatus = lead?.customerStatus || '', { approval = null } = {}) {
  if (customerStatus === 'Blue') {
    return {
      status: 'Verified', type: 'KYC', customerStatus,
      items: Object.fromEntries(BLUE_KYC_ITEMS.map(item => [item, verificationItem(lead?.verification, item)])),
      verifiedAt: lead?.verification?.kycVerifiedAt || '',
    }
  }
  if (customerStatus === 'Amber') {
    return {
      status: 'Confirmed', type: 'Payment', customerStatus,
      payment: lead?.verification?.payment || {},
      confirmedAt: lead?.verification?.payment?.confirmedAt || '',
    }
  }
  // A Red opportunity used to record "Not required", losing the only trace of
  // the joint clearance that authorised it. Keep the decision on the record.
  if (customerStatus === 'Red') {
    return {
      status: isRedCleared(approval) ? 'Cleared' : 'Not cleared',
      type: 'Red continuation', customerStatus,
      approvalId: approval?.id || '',
      decidedBy: Object.keys(approval?.decisions || {}),
      conditions: (approval?.conditions || []).map(c => c.text),
      verifiedAt: approval?.decisionTs || '',
    }
  }
  return { status: 'Not required', type: 'None', customerStatus, verifiedAt: '' }
}
