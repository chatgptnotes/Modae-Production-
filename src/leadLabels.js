// Label patterns shared by the deterministic and fallback lead readers.
// Text extracted from PDFs and forwarded emails can remove line breaks, so a
// newline alone is not a safe boundary between one field and the next.
export const LEAD_LABELS = {
  sellTo: String.raw`(?:sell[-\s]?to(?:\s+customer)?|customer(?:\s+name)?|buyer|company)`,
  eucName: String.raw`(?:end\s+user\s*/\s*euc\s+name|(?:euc|eun|end\s+user|ultimate\s+customer|beneficiary)(?:\s+name)?)`,
  eucLocation: String.raw`(?:(?:euc|eun|end\s+user)(?:\s+site)?\s+(?:location|address)|(?:site|plant|station|project\s+site|installation)\s+(?:location|address)|delivery\s+(?:location|address|site)|site\s+address|location|region|city(?:\s+and\s+state)?|state|country)`,
  contactPerson: String.raw`(?:customer\s+)?(?:contact\s+person|contact|attn\.?|kind\s+attention)`,
  contactPhone: String.raw`(?:contact\s+phone|phone|mobile|telephone)(?:\s+(?:number|#))?`,
}

const allLabels = Object.values(LEAD_LABELS).join('|')
const valueBoundary = `(?=\\s*(?:${allLabels})\\s*[:\\-]|[\\n;]|$)`

const clean = value => String(value ?? '')
  .replace(/[ \t]+/g, ' ')
  .trim()
  .replace(/[.,]+$/, '')

export const extractLabeledValue = (text, labels) => {
  const match = String(text || '').match(new RegExp(`(?:${labels})\\s*[:\\-]\\s*(.*?${valueBoundary})`, 'i'))
  return match ? clean(match[1]) : ''
}

export const extractAllLabeledValues = (text, labels) => {
  const pattern = new RegExp(`(?:${labels})\\s*[:\\-]\\s*(.*?${valueBoundary})`, 'ig')
  return [...String(text || '').matchAll(pattern)].map(match => clean(match[1])).filter(Boolean)
}

// AI output can repeat the next field label inside the current field value.
// Trim only the contaminating suffix; do not otherwise reinterpret the value.
export const cleanExtractedValue = value => {
  const source = String(value ?? '')
  const nextLabel = source.search(new RegExp(`(?:${allLabels})\\s*[:\\-]`, 'i'))
  return clean(nextLabel > 0 ? source.slice(0, nextLabel) : source)
}
