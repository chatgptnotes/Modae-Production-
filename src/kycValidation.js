// Admin-controlled identity validation for KYC values.
// The defaults are India's common document formats; Admin can disable a rule,
// make it optional, or replace the pattern/message for a customer workflow.

export const GSTIN_PATTERN = '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
export const LEGACY_GSTIN_PATTERN = '^[0-9]{2}[A-Z0-9]{13}$'
export const PAN_PATTERN = '^[A-Z]{3}[ABCFGHLJPT][A-Z][0-9]{4}[A-Z]$'
export const LEGACY_PAN_PATTERN = '^[A-Z]{5}[0-9]{4}[A-Z]$'
export const CIN_PATTERN = '^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$'
export const LEGACY_CIN_PATTERN = '^[A-Z0-9]{21}$'

export const DEFAULT_KYC_VALIDATION = {
  GST: { enabled: true, required: true, pattern: GSTIN_PATTERN, label: 'GST number', message: 'Enter a valid 15-character GST number.' },
  PAN: { enabled: true, required: true, pattern: PAN_PATTERN, label: 'PAN number', message: 'Enter a valid 10-character PAN number.' },
  CIN: { enabled: true, required: false, pattern: CIN_PATTERN, label: 'CIN number', message: 'Enter a valid 21-character CIN.' },
}

export const kycValidationConfig = config => Object.fromEntries(
  Object.entries(DEFAULT_KYC_VALIDATION).map(([key, fallback]) => [
    key, { ...fallback, ...(config?.kycValidation?.[key] || {}) },
  ]),
)

export const kycIdentityKey = item => {
  const text = String(item || '').toLowerCase()
  if (text.includes('gst')) return 'GST'
  if (text.includes('pan')) return 'PAN'
  if (text.includes('cin')) return 'CIN'
  return ''
}

// Values used only by the lead-screen "Simulate verification" action. They
// satisfy the configured Indian formats without pretending to be a customer's
// actual tax identity. Uploaded/recorded verification never uses these.
export const simulatedKycValue = item => {
  switch (kycIdentityKey(item)) {
    case 'GST': return '27ABCDE1234F1Z5'
    case 'PAN': return 'ABCPD1234F'
    case 'CIN': return 'L12345MH2020PLC123456'
    default: return ''
  }
}

export function validateKycValue(item, value, config = {}) {
  const key = kycIdentityKey(item)
  if (!key) return { ok: true, key: '' }
  const rule = kycValidationConfig(config)[key]
  const clean = String(value || '').trim().toUpperCase()
  if (!rule.enabled) return { ok: true, key, value: clean, rule }
  if (!clean) return { ok: !rule.required, key, value: clean, rule, message: rule.required ? `${rule.label} is required.` : '' }
  let valid = false
  try { valid = new RegExp(rule.pattern).test(clean) } catch { valid = false }
  return { ok: valid, key, value: clean, rule, message: valid ? '' : rule.message }
}
