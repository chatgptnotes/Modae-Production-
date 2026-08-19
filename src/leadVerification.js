// Verification required before a qualified lead can become an opportunity.
// The record lives on the lead so the opportunity can carry a read-only
// snapshot without asking the salesperson to verify the same thing twice.
export const BLUE_KYC_ITEMS = [
  'GST certificate',
  'PAN certificate',
  'Cancelled cheque',
  'EFT / bank mandate',
]

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

export function leadVerificationComplete(lead, customerStatus = lead?.customerStatus || '') {
  if (customerStatus === 'Green') return true
  if (customerStatus === 'Blue') return blueKycComplete(lead?.verification)
  if (customerStatus === 'Amber') return amberPaymentComplete(lead?.verification)
  return false
}

export function leadVerificationBlockers(lead, customerStatus = lead?.customerStatus || '') {
  if (customerStatus === 'Green') return []
  if (customerStatus === 'Blue') {
    return BLUE_KYC_ITEMS
      .filter(item => verificationItem(lead?.verification, item).state !== 'Verified')
      .map(item => `${item} verification is required`)
  }
  if (customerStatus === 'Amber' && !amberPaymentComplete(lead?.verification)) {
    return ['Amber processing-fee payment confirmation is required']
  }
  if (customerStatus === 'Red') return ['Red customer continuation approval is required']
  return ['Customer classification is required']
}

export function verificationSnapshot(lead, customerStatus = lead?.customerStatus || '') {
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
  return { status: 'Not required', type: 'None', customerStatus, verifiedAt: '' }
}
