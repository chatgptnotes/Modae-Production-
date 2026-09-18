import { kycIdentityKey } from './kycValidation.js'

const GST_PATTERN = /\b(\d{2}[A-Z0-9]{13})\b/i
const PAN_PATTERN = /\b([A-Z]{5}\d{4}[A-Z])\b/i
const CIN_PATTERN = /\b([A-Z0-9]{21})\b/i

const patternFor = key => key === 'GST' ? GST_PATTERN : key === 'PAN' ? PAN_PATTERN : key === 'CIN' ? CIN_PATTERN : null

export const normalizeKycCandidate = value => String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase()

export function extractKycIdentityCandidate(item, text = '') {
  const key = kycIdentityKey(item)
  const pattern = patternFor(key)
  if (!key || !pattern) return null
  const source = String(text || '')
  const match = source.match(pattern)
  if (!match) return null
  const value = normalizeKycCandidate(match[1])
  const index = match.index || 0
  return {
    key,
    value,
    confidence: 96,
    evidence: source.slice(Math.max(0, index - 80), Math.min(source.length, index + value.length + 80)).replace(/\s+/g, ' ').trim(),
    source: 'document-text',
  }
}
