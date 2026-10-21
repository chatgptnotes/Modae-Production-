import { validCustomerName, validContactName, enquiryEmailFacts } from './leadEmailFacts.js'
import { registrationFields } from './businessRules.js'
import { classRule, classDeadlineDays } from './customerClasses.js'
import { LEAD_LABELS, EUC_LOCATION_LABELS, cleanExtractedValue, extractLabeledValue } from './leadLabels.js'
import { indiaRegionForLocation } from './indiaLocations.js'

export const DEFAULT_LEAD_DEADLINES = {
  kycDays: 7,
  amberFeeDays: 7,
  clarificationDays: 7,
}

export const DEFAULT_FAST_TRACK = {
  enabled: true,
  customerStatus: 'Green',
}

// Only identity fields are required to mint an opportunity. Technical,
// commercial and sourcing fields remain follow-up work after registration.
export const isRegistrationCriticalField = (key, config) => {
  const label = String(key || '').trim()
  const aliases = { sellTo: /^(sell[-\s]?to customer|customer name)$/i,
    sellToCustomerLocation: /^sell[-\s]?to customer location$/i,
    eucName: /^(euc(?: name)?|end user(?: name)?)$/i,
    eucLocation: /^(euc|end user) location$/i,
    contactPerson: /^contact person$/i, contactPhone: /^(contact phone|phone)$/i }
  return registrationFields(config).some(([id]) => aliases[id].test(label))
}

const emailAddress = value => String(value || '').trim().toLowerCase()
const emailDomain = value => emailAddress(value).split('@')[1] || ''

// The common mailbox and ModAE work addresses describe the internal sender,
// not the customer representative. Keep this rule here so AI, fallback and
// legacy lead paths all make the same distinction.
export const isInternalSender = (email, config = {}) => {
  const address = emailAddress(email)
  if (!address) return false
  const configured = [config.commonMailbox, config.gmailAccount, ...(config.internalEmails || [])]
    .map(emailAddress).filter(Boolean)
  if (configured.includes(address)) return true
  const domains = new Set(['modae.demo', 'mod-ae.com', ...(config.internalDomains || []).map(x => String(x || '').trim().toLowerCase()).filter(Boolean)])
  return domains.has(emailDomain(address))
}

// Only an explicit customer-contact label is strong enough to recover a named
// person from an internal forward. Do not use a closing "Regards" signature:
// on an outbound ModAE mail that signature belongs to ModAE.
export const customerContactFromText = text => {
  return extractLabeledValue(text, LEAD_LABELS.contactPerson)
}

export const customerPhoneFromText = text => {
  const value = extractLabeledValue(text, LEAD_LABELS.contactPhone)
  return placeholderPhone(value) ? '' : value
}

const placeholderPhone = value => {
  const text = String(value || '')
  const digits = text.replace(/\D/g, '')
  return /\b(?:placeholder|dummy|test number)\b/i.test(text)
    || /^0+$/.test(digits) || /^(?:91|0091)0{10}$/.test(digits)
}

const SOURCE_FIELD_SPECS = [
  ['Sell-to customer', 'Customer', LEAD_LABELS.sellTo],
  ['Contact person', 'Customer', LEAD_LABELS.contactPerson],
  ['Contact email', 'Customer', LEAD_LABELS.contactEmail],
  ['Contact phone', 'Customer', LEAD_LABELS.contactPhone],
  ['EUC Name', 'Customer', LEAD_LABELS.eucName],
  ['EUC Location', 'Customer', LEAD_LABELS.eucLocation],
  ['Opportunity name', 'RFQ', LEAD_LABELS.oppName],
  ['Opportunity type', 'RFQ', LEAD_LABELS.oppType],
  ['Opportunity scope', 'RFQ', LEAD_LABELS.opportunityScope],
  ['Customer category', 'Customer', LEAD_LABELS.category],
  ['Business unit', 'Customer', LEAD_LABELS.businessUnit],
  ['Segment', 'Customer', LEAD_LABELS.segment],
  ['Equipment / Product Family', 'Customer', LEAD_LABELS.product],
  ['RFQ number', 'RFQ', LEAD_LABELS.rfqNumber],
  ['RFQ date', 'RFQ', LEAD_LABELS.rfqDate],
]

const sourceFieldMatches = (field, canonical) => {
  const label = String(field?.k || '').toLowerCase().replace(/[：:;/|_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  const aliases = {
    'Sell-to customer': /^(?:sell to customer|sell to|customer name|customer|buyer|company)$/,
    'Contact person': /^(?:contact person|contact|signatory|attn|kind attention)$/,
    'Contact email': /^(?:contact email|email|e mail)$/,
    'Sell-to customer location': /^(?:sell to customer location|customer location|customer address|buyer location)$/,
    Subject: /^subject$/,
    'Lead source': /^lead source$/,
    'Contact phone': /^(?:contact phone|contact number|phone|mobile|telephone)$/,
    'EUC Name': /^(?:euc|euc name|eun|eun name|end user|end user name|ultimate customer|beneficiary)$/,
    'EUC Location': /^(?:euc|eun|end user)(?: site)? (?:location|address)$/,
    'Opportunity name': /^(?:opportunity name|opp name)$/,
    'Opportunity type': /^(?:opportunity type|opp type)$/,
    'Opportunity scope': /^(?:opportunity scope|scope|requested scope|requirement)$/,
    'Customer category': /^(?:customer category|category)$/,
    'Business unit': /^(?:business unit|bu)$/,
    Segment: /^segment$/,
    'Equipment / Product Family': /^(?:equipment product family|product|product family)$/,
    'RFQ number': /^(?:rfq number|rfq no|rfq reference|tender number|tender reference|enquiry number|enquiry reference|inquiry number|inquiry reference)$/,
    'RFQ date': /^(?:rfq date|tender date|enquiry date|inquiry date)$/,
  }
  return aliases[canonical]?.test(label)
}

// Explicit labels are stronger than a model omission or a model guess. This
// resolver is intentionally source-only; it never invents a value for a
// field that the enquiry does not state.
export const sourceFieldFacts = (text = '') => {
  const source = String(text || '').replace(/^\s*Attachment:[^\n]*$/gim, '')
  return SOURCE_FIELD_SPECS.flatMap(([k, group, labels]) => {
    const locationLabel = k === 'EUC Location' && EUC_LOCATION_LABELS.find(pattern => extractLabeledValue(source, pattern))
    let value = k === 'EUC Location'
      ? locationLabel && extractLabeledValue(source, locationLabel)
      : extractLabeledValue(source, labels)
    if (k === 'RFQ date' && !value) {
      const header = source.split(/\r?\n/).find(line => extractLabeledValue(line, LEAD_LABELS.rfqNumber))
      if (header) value = extractLabeledValue(header, String.raw`\bdate`)
    }
    const deliveryOnly = locationLabel === EUC_LOCATION_LABELS[2]
    const valid = k === 'Sell-to customer' ? validCustomerName(value) : k === 'Contact person' ? validContactName(value) : k === 'Contact phone' ? Boolean(value) && !placeholderPhone(value) : Boolean(value)
    return valid ? [{ group, k, v: value, conf: deliveryOnly ? 70 : 98,
      ev: `Explicit ${deliveryOnly ? 'delivery address' : k.toLowerCase()} label in enquiry`, source: 'deterministic',
      ...(deliveryOnly ? { note: 'Delivery address — confirm end-user location' } : {}),
    }] : []
  })
}

export const mergeSourceFieldFacts = (fields = [], text = '', additionalFacts = []) => {
  const existing = Array.isArray(fields) ? [...fields] : []
  const explicit = sourceFieldFacts(text)
  for (const sourceField of [...additionalFacts.filter(f => !explicit.some(e => e.k === f.k)), ...explicit]) {
    const index = existing.findIndex(field => sourceFieldMatches(field, sourceField.k))
    if (index < 0) existing.push(sourceField)
    else existing[index] = { ...existing[index], ...sourceField, state: existing[index].state || 'pending', alt: [...(existing[index].alt || []), ...(existing[index].v !== sourceField.v ? [{v:existing[index].v,conf:existing[index].conf,ev:existing[index].ev}] : [])] }
  }
  return existing
}

export const customerCompanyFromText = text => {
  const value = extractLabeledValue(String(text || '').replace(/^\s*Attachment:[^\n]*$/gim, ''), LEAD_LABELS.sellTo).replace(/[,]+$/, '')
  return validCustomerName(value) ? value : ''
}

export const normalizeLeadContactFields = (fields, { from = '', text = '', config = {} } = {}) => {
  const rows = Array.isArray(fields) ? fields : []
  if (!isInternalSender(from, config)) return rows
  const explicit = customerContactFromText(text) || enquiryEmailFacts(text, {from, isInternal:email => isInternalSender(email,config)}).find(f => f.k === 'Contact person')?.v
  if (!explicit) return rows.filter(field => !/contact\s+person/i.test(String(field?.k || '')))
  const replacement = { group: 'Customer', k: 'Contact person', v: explicit, conf: 95, ev: 'Explicit customer contact in email body' }
  const first = rows.findIndex(field => /contact\s+person/i.test(String(field?.k || '')))
  if (first < 0) return [...rows, replacement]
  return rows.map((field, index) => index === first ? { ...field, ...replacement } : field)
}

const boundedConfidence = (value, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback
}

// Final client-side contract for model output. The model may be wrong or may
// omit evidence; neither case should silently become trusted lead data.
export const hardenLeadExtraction = (ai, { from = '', text = '', config = {} } = {}) => {
  if (!ai) return ai
  const sourceCompany = customerCompanyFromText(text)
  const normalized = mergeSourceFieldFacts(normalizeLeadContactFields(ai.fields, { from, text, config }), text, enquiryEmailFacts(text, { from, isInternal: email => isInternalSender(email, config) }))
  const hasCompany = normalized.some(field => /sell[-\s]?to\s+customer|customer name/i.test(String(field?.k || '')))
  const fields = (sourceCompany && !hasCompany
    ? [...normalized, { group: 'Customer', k: 'Sell-to customer', v: sourceCompany, conf: 98, ev: 'Explicit Customer label in email body' }]
    : normalized)
    .map(field => {
      const value = String(field?.v ?? '').trim()
      const evidence = String(field?.ev ?? '').trim()
      const missingEvidence = !evidence
      const customerRequest = /^requested by customer$/i.test(value)
      return {
        ...field,
        v: cleanExtractedValue(value),
        factType: customerRequest ? 'customer_request' : (field?.factType || 'fact'),
        ev: evidence || 'Evidence not supplied — verify against the original enquiry',
        conf: customerRequest || missingEvidence
          ? Math.min(50, boundedConfidence(field?.conf))
          : boundedConfidence(field?.conf),
        note: missingEvidence
          ? [field?.note, 'Human review required because the extraction has no evidence.'].filter(Boolean).join(' ')
          : customerRequest
            ? [field?.note, 'This records a customer request; the actual value is still missing.'].filter(Boolean).join(' ')
            : field?.note,
      }
    })
    .filter(field => field.v && (!sourceFieldMatches(field, 'Contact phone') || (!placeholderPhone(field.v) && !placeholderPhone(extractLabeledValue(text, LEAD_LABELS.contactPhone)))) && (!/^(?:sell[- ]?to(?: customer)?|buyer|customer name)$/i.test(field.k) || validCustomerName(field.v)) && (!/^(?:contact person|signatory)$/i.test(field.k) || validContactName(field.v)))
  const lineItems = (Array.isArray(ai.lineItems) ? ai.lineItems : []).map(item => {
    const rawQty = Number(item?.qty)
    const qty = Number.isFinite(rawQty) && rawQty > 0 ? rawQty : 0
    const evidence = String(item?.evidence ?? '').trim()
    return {
      ...item,
      description: String(item?.description || item?.desc || '').trim(),
      partNumber: String(item?.partNumber || item?.pn || '').trim(),
      customerRef: String(item?.customerRef || '').trim(),
      qty,
      uom: String(item?.uom || 'EA').trim() || 'EA',
      confidence: evidence ? boundedConfidence(item?.confidence ?? item?.conf) : Math.min(50, boundedConfidence(item?.confidence ?? item?.conf)),
      evidence: evidence || 'Evidence not supplied — verify against the original enquiry',
    }
  })
  const requestMissing = fields.flatMap(field => {
    if (field.factType !== 'customer_request') return []
    const key = String(field.k || '').toLowerCase()
    if (key.includes('tax')) return ['Tax rate or tax treatment']
    if (key.includes('freight')) return ['Freight amount or delivery terms']
    if (key.includes('delivery') || key.includes('schedule')) return ['Delivery lead time or date']
    if (key.includes('price')) return ['Price basis']
    return []
  })
  const missing = [...new Set([
    ...(Array.isArray(ai.missing) ? ai.missing : []).map(item => String(item || '').trim()).filter(Boolean),
    ...requestMissing,
    ...lineItems.flatMap((item, index) => [
      !item.description && `Line ${index + 1}: description`,
      item.qty <= 0 && `Line ${index + 1}: quantity`,
    ].filter(Boolean)),
  ])]
  return { ...ai, fields, lineItems, missing }
}

export function leadConfig(config = {}) {
  return {
    ownershipRules: Array.isArray(config.ownershipRules) ? config.ownershipRules : [],
    leadDeadlines: { ...DEFAULT_LEAD_DEADLINES, ...(config.leadDeadlines || {}) },
    fastTrack: { ...DEFAULT_FAST_TRACK, ...(config.fastTrack || {}) },
  }
}

export function routeOwner(region, config = {}, fallback = '') {
  const value = String(region || '').toLowerCase()
  const rules = leadConfig(config).ownershipRules
  // L-05-AI ends with "Unclassified Leads - LJS (approval needed)". A region
  // that was entered but matches no rule *is* unclassified, so it resolves to
  // that row rather than to whatever the caller passed in. A region that has
  // not been entered yet is a different thing — the AI's own suggestion still
  // stands, so a blank keeps the caller's fallback.
  const catchAll = rules.find(item => item.unclassified)
  if (!value) return fallback
  const rule = rules.find(item => {
    if (item.unclassified) return false
    const label = String(item.region || '').toLowerCase()
    return label && (value.includes(label) || label.split(/[,/&]/).some(part => part.trim() && value.includes(part.trim())))
  })
  return rule?.owner || catchAll?.owner || fallback
}

// Normalize city/state input before applying the configured ownership rules.
// Callers may also pass an already-normalized region such as "North & West
// India", which falls through to routeOwner unchanged.
export function routeOwnerForLocation(location, config = {}, fallback = '') {
  const value = String(location || '').trim()
  const region = indiaRegionForLocation(value, config) || value
  return routeOwner(region, config, fallback)
}

// Opportunity rows must always have an owner. Lead previews may legitimately
// keep ownership blank while location is still being collected, but that is
// not valid once a lead becomes an opportunity. Resolve a known location or
// region first, then use the configured unclassified rule and finally the
// canonical LJS fallback when no routing data exists at all.
export function opportunityOwnerFor({ location = '', region = '', config = {}, fallback = 'LJS' } = {}) {
  const routed = routeOwnerForLocation(location, config, '') || routeOwner(region, config, '')
  if (routed) return routed
  const catchAll = leadConfig(config).ownershipRules.find(item => item.unclassified)
  return catchAll?.owner || fallback
}

export function isFastTrackLead(lead, config = {}, customer = null) {
  const cfg = leadConfig(config).fastTrack
  if (!cfg.enabled) return false
  return lead?.fastTrack === true || customer?.status === cfg.customerStatus || lead?.customerStatus === cfg.customerStatus
}

// Intake has no timed KYC, fee or AI clarification prerequisite.
export function deadlineForLead() {
  return []
}

// Supply a piece of information the AI could not find, by hand. Returns the
// lead patch, or null when there is nothing usable to record.
//
// `ai.missing` is optional follow-up. Answering an item still records a human
// decision and improves completeness, but waiting for it must not block the
// lead from becoming an opportunity.
//
// The answer lands as an accepted field at full confidence because a human
// typed it, and completeness rises by the share the answered item represented,
// so clearing the last outstanding item closes the lead at 100 rather than at
// some arbitrary remainder.
export function supplyMissing(lead, label, value, key = null) {
  const k = String(label ?? '').trim()
  const v = String(value ?? '').trim()
  if (!k || !v) return null
  const ai = lead?.ai || {}
  const outstanding = ai.missing || []
  const remaining = key == null ? outstanding : outstanding.filter(m => m !== key)
  const answered = outstanding.length - remaining.length
  const current = lead?.completeness ?? 0
  return {
    completeness: answered && outstanding.length
      ? Math.min(100, current + Math.round((100 - current) / outstanding.length))
      : current,
    ai: {
      ...ai,
      missing: remaining,
      fields: [...(ai.fields || []), {
        k, v, conf: 100, state: 'accepted', group: 'Added manually',
        note: 'Supplied by user', manual: true,
      }],
    },
  }
}

export function expiredLeadDeadline(lead, config = {}, now = new Date()) {
  const nowMs = new Date(now).getTime()
  return deadlineForLead(lead, config, now).find(row => new Date(row.dueAt).getTime() <= nowMs) || null
}

export function aiAuditDetail({ provider = '', model = '', action = '', result = {} } = {}) {
  return JSON.stringify({ provider, model, action, result })
}
import { toISTISOString } from './utils.js'
