import { classRule, classDeadlineDays } from './customerClasses.js'

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
export const isRegistrationCriticalField = key => /^(sell[-\s]?to customer|customer name|euc(?: name| location)?|end user(?: name| location)?|contact person|contact phone|phone)$/i.test(String(key || '').trim())

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
  const match = String(text || '').match(/(?:customer\s+)?(?:contact\s+person|contact|attn\.?|kind\s+attention)\s*[:\-]\s*([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3})/i)
  return match ? match[1].trim() : ''
}

export const normalizeLeadContactFields = (fields, { from = '', text = '', config = {} } = {}) => {
  const rows = Array.isArray(fields) ? fields : []
  if (!isInternalSender(from, config)) return rows
  const explicit = customerContactFromText(text)
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
  const fields = normalizeLeadContactFields(ai.fields, { from, text, config })
    .map(field => {
      const value = String(field?.v ?? '').trim()
      const evidence = String(field?.ev ?? '').trim()
      const missingEvidence = !evidence
      return {
        ...field,
        v: value,
        ev: evidence || 'Evidence not supplied — verify against the original enquiry',
        conf: missingEvidence ? Math.min(50, boundedConfidence(field?.conf)) : boundedConfidence(field?.conf),
        note: missingEvidence
          ? [field?.note, 'Human review required because the extraction has no evidence.'].filter(Boolean).join(' ')
          : field?.note,
      }
    })
    .filter(field => field.v)
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
  const missing = [...new Set([
    ...(Array.isArray(ai.missing) ? ai.missing : []).map(item => String(item || '').trim()).filter(Boolean),
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

export function isFastTrackLead(lead, config = {}, customer = null) {
  const cfg = leadConfig(config).fastTrack
  if (!cfg.enabled) return false
  return lead?.fastTrack === true || customer?.status === cfg.customerStatus || lead?.customerStatus === cfg.customerStatus
}

export function deadlineForLead(lead, config = {}, now = new Date()) {
  const cfg = leadConfig(config)
  const base = new Date(lead?.verification?.requestedAt || lead?.customerClassifiedAt || lead?.deadlineStartedAt || lead?.ts || now).getTime()
  const add = (days, type, reason) => ({
    type, reason,
    dueAt: new Date(base + Number(days || 0) * 86400000).toISOString(),
  })
  const rows = []
  // The class's own deadline, in the class's own terms. This used to read
  // config.leadDeadlines directly, which meant the Amber timer edited on the
  // Admin page (written to amberFee.days) was never actually applied.
  const verification = classRule(config, lead?.customerStatus)?.verification
  const days = classDeadlineDays(config, lead?.customerStatus)
  if (verification?.required && days) {
    const done = verification.requires === 'documents' ? lead?.kycCompletedAt
      : verification.requires === 'fee' ? lead?.amberFeePaid === true
      : true
    if (!done) {
      rows.push(add(days, verification.deadlineType || 'verification',
        verification.requires === 'fee' ? 'Amber processing fee not received' : 'KYC documents not received'))
    }
  }
  // AI missing items are optional follow-up after opportunity creation. They
  // must not create a deadline that looks like a registration prerequisite.
  return rows
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
