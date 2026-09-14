// Admin-controlled identity validation for KYC values.
// The defaults are India's common document formats; Admin can disable a rule,
// make it optional, or replace the pattern/message for a customer workflow.

export const DEFAULT_KYC_VALIDATION = {
  GST: { enabled: true, required: true, pattern: '^[0-9]{2}[A-Z0-9]{13}$', label: 'GST number', message: 'Enter a valid 15-character GST number.' },
  PAN: { enabled: true, required: true, pattern: '^[A-Z]{5}[0-9]{4}[A-Z]$', label: 'PAN number', message: 'Enter a valid 10-character PAN number.' },
  CIN: { enabled: true, required: false, pattern: '^[A-Z0-9]{21}$', label: 'CIN number', message: 'Enter a valid 21-character CIN.' },
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
