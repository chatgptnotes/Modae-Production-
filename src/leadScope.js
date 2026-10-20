const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim()
const MAX_SCOPE_LENGTH = 220
const serviceRequest = /\b(?:calibration (?:services?|of|for)|calibrat(?:e|ing)|repair|maintenance|servic(?:e|es|ing)|installation|install|commission(?:ing)?|inspection|assessment|consultancy|training|design|project|upgrade|retrofit)\b/i
const administrative = /^(?:(?:please|kindly)\s+)?(?:include\b|submit\b|send (?:your|the) (?:quote|quotation)|quot(?:ation|e) (?:deadline|due)|(?:preferred|required|expected) delivery|delivery (?:date|deadline|charges)|payment\b|GST\b|freight\b|warranty\b|regards\b|thanks?\b|dear\b|hello\b|hi\b|(?:subject|from|to|date|customer(?: location)?|contact (?:person|phone))\s*:|this is (?:a |an )?(?:fictional|fabricated|test|demo))/i

function concise(value) {
  const text = clean(value).replace(/[.;,:\s]+$/, '')
  if (!text) return ''
  if (text.length < MAX_SCOPE_LENGTH) return `${text}.`
  const shortened = text.slice(0, MAX_SCOPE_LENGTH - 1).replace(/\s+\S*$/, '').replace(/[.;,:\s]+$/, '')
  return `${shortened}…`
}

function stripCommercialDetails(value) {
  return clean(value)
    .replace(/(?:[,;]\s*(?:and\s+)?|\s+(?:including|with)\s+)(?:GST|freight|payment terms|warranty|delivery (?:charges|by|date))\b.*$/i, '')
    .replace(/\s+(?:by|before|on)\s+(?:(?:\d{1,2}[ /-])|(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b).*$/i, '')
    .replace(/\s+for\s+(?:noise assessments|condition monitoring|use\b|our\b).*$/i, '')
    .replace(/[.;,:\s]+$/, '')
}

function fromEnquiry(fallback) {
  const source = String(fallback ?? '')
  // Numbered RFQ lists carry the deliverables; their quotation introduction does not.
  const listedItems = source.split(/\n+/).flatMap(line => {
    const match = line.match(/^\s*(?:\d+[.)]|[-•])\s+(.+)$/)
    if (!match || administrative.test(match[1])) return []
    const description = clean(match[1].split(/\s+[—–]\s+/)[0])
      .split(/,\s*/).slice(0, 2).join(', ')
    return description ? [{ description }] : []
  })
  if (listedItems.length) return deriveOpportunityScope(listedItems)
  const sentences = String(fallback ?? '').split(/\n+|(?<=[.!?])\s+/).map(clean).filter(Boolean)
  const requested = /^(?:we\s+(?:require|need|are looking for)|(?:please|kindly)\s+(?:provide|quote(?:\s+(?:us|for))?|supply)|request(?:\s+for)?\s+(?:quotation|quote)\s*[:—-]?)\s+/i
  const candidates = sentences.filter(sentence => !administrative.test(sentence) && !/\b(?:quotation|quote)\s+(?:for\s+)?(?:the\s+)?following\b|^your (?:quotation|quote)\b/i.test(sentence))
  const request = candidates.find(sentence => requested.test(sentence)) || candidates[0]
  if (!request) return ''
  const hadRequestPrefix = requested.test(request)
  let scope = stripCommercialDetails(request.replace(requested, '')
    .replace(/^(?:your\s+)?(?:(?:best\s+)?offer|quotation|quote)\s+for\s+/i, '')
    .replace(/\s+as per\s+(?:the\s+)?attached\s+(?:list|specifications?|details)\b.*$/i, ''))
  if (!scope) return ''
  // Accessories are part of the requested deliverable; quotation conditions are not.
  const accessories = sentences.find(sentence => /^(?:please|kindly) quote suitable models with\b/i.test(sentence))
  if (hadRequestPrefix && !serviceRequest.test(scope) && !/^supply\b/i.test(scope)) scope = `Supply of ${scope}`
  if (accessories && !/\bwith\b/i.test(scope)) {
    const deliverables = stripCommercialDetails(accessories.replace(/^(?:please|kindly) quote suitable models with\s+/i, ''))
      .replace(/[,;]\s*(?:and\s+)?(?:carrying cases|calibration certificates|product datasheets)\b.*$/i, '')
    if (deliverables) scope += ` with ${deliverables}`
  }
  return concise(scope.charAt(0).toUpperCase() + scope.slice(1))
}

export function deriveOpportunityScope(lineItems = [], fallback = '') {
  // Equipment-tagged schedules often repeat the same kit at different sizes.
  // Name every requested family instead of filling the scope with one long spec.
  if (lineItems.length > 3 && lineItems.every(item => item.equipmentRef && item.description?.includes(';'))) {
    const names = [...new Set(lineItems.map(item => clean(item.description.split(';')[0]))) ]
    const list = names.length > 1 ? `${names.slice(0,-1).join(', ')} and ${names.at(-1)}` : names[0]
    const summary = `Supply of ${list} (${lineItems.length} line items)`
    if (summary.length < MAX_SCOPE_LENGTH) return concise(summary)
  }
  const items = (Array.isArray(lineItems) ? lineItems : []).map(item => {
    const description = stripCommercialDetails(item?.description || item?.desc || item?.partNumber || item?.pn || item?.customerRef)
    if (!description) return ''
    const qty = Number(item?.qty)
    const unit = clean(item?.uom || item?.unit)
    const meaningfulUnit = unit && !/^(?:EA|each|nos?\.?)$/i.test(unit) ? ` ${unit}` : ''
    return `${Number.isFinite(qty) && qty > 0 ? `${qty}${meaningfulUnit} ` : ''}${description}`
  }).filter(Boolean)
  if (!items.length) return fromEnquiry(fallback)
  const prefix = items.some(item => serviceRequest.test(item)) ? '' : 'Supply of '
  let shown = items.slice(0, 3)
  const compose = () => `${prefix}${shown.join(' and ')}${items.length > shown.length ? ` and ${items.length - shown.length} additional item${items.length - shown.length === 1 ? '' : 's'}` : ''}`
  while (shown.length > 1 && compose().length >= MAX_SCOPE_LENGTH) shown = shown.slice(0, -1)
  return concise(compose())
}

// Recognize the previous generated value exactly, so custom scope edits survive.
function legacyBomScope(lineItems) {
  const trim = value => String(value ?? '').trim()
  const lines = lineItems.map(item => {
    const description = trim(item?.description || item?.desc)
    const partNumber = trim(item?.partNumber || item?.pn || item?.customerRef)
    if (!description && !partNumber) return ''
    const label = [description, partNumber && `(${partNumber})`].filter(Boolean).join(' ')
    const qty = Number(item?.qty)
    const uom = trim(item?.uom || item?.unit || 'EA') || 'EA'
    return `${label} — Qty ${Number.isFinite(qty) && qty > 0 ? qty : 1} ${uom}`
  }).filter(Boolean)
  return lines.length ? `Supply of ${lines.join('; ')}` : ''
}

export function scopeForReview(lead = {}, extractedScope = '') {
  const lineItems = Array.isArray(lead.ai?.lineItems) ? lead.ai.lineItems : []
  const chosen = clean(lead.opportunityScope) ? String(lead.opportunityScope) : String(extractedScope ?? '')
  const normalized = clean(chosen)
  const intakeBody = [
    lead.sellTo && `Customer: ${lead.sellTo}`,
    lead.contactPerson && `Contact person: ${lead.contactPerson}`,
    lead.contactPhone && `Contact phone: ${lead.contactPhone}`,
    (lead.sellToCustomerLocation || lead.location) && `Customer location: ${lead.sellToCustomerLocation || lead.location}`,
    lead.body,
  ].filter(Boolean).join('\n')
  const copiedBody = normalized && (normalized === clean(lead.body) || normalized === clean(intakeBody))
  const oldAutomaticBom = normalized && normalized === clean(legacyBomScope(lineItems))
  if (!normalized || copiedBody || oldAutomaticBom) return deriveOpportunityScope(lineItems, lead.body)
  return chosen
}
