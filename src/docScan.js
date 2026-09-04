// Deterministic-parse-into-AI-fields bridge for Lead Inbox flows. parseTender()
// is a mature, tested, regex/positional extractor already trusted by Tender
// Intake; here it runs against lead attachments too so RFQ number/date/buyer/
// line items don't depend on the AI re-deriving structure it can get wrong.
import { parseTender } from './tenderParse.js'

const clean = value => String(value ?? '').trim()
const norm = value => clean(value).toLowerCase()
const fieldKey = (group, k) => `${norm(group)}|${norm(k)}`

// These are the facts parseTender() reads reliably from a positional table —
// deterministic wins over the AI's guess for these specific keys once its own
// confidence clears the threshold, rather than being averaged or flattened.
const PRECEDENCE_KEYS = new Set([
  fieldKey('RFQ', 'Buyer'), fieldKey('RFQ', 'Station'), fieldKey('RFQ', 'RFQ number'),
  fieldKey('RFQ', 'RFQ date'), fieldKey('RFQ', 'Signatory'),
])
const HEADER_CONF_THRESHOLD = 0.6
const ITEM_CONF_THRESHOLD = 0.7

// Run parseTender() against one attachment's transient page structure. Returns
// null for anything that isn't a text-layer PDF (structPages absent) or that
// the parser cannot make sense of — the AI-only path still applies then.
export function scanAttachment(attachment) {
  if (!attachment?.text || !Array.isArray(attachment.structPages)) return null
  try {
    return parseTender(attachment.text, attachment.structPages)
  } catch {
    return null
  }
}

// parseTender()'s output → the ai.fields[] / ai.lineItems[] shape lead records
// already use, tagged so the merge step can tell a mechanical read from a
// model's guess.
export function parsedToLeadFields(parsed, attachmentName) {
  if (!parsed) return { fields: [], lineItems: [] }
  const ev = `Deterministic parse: ${attachmentName}`
  const headerConf = Math.round((parsed.confidence?.header || 0) * 100)
  const fields = []
  const addHeaderField = (k, v) => {
    if (!clean(v)) return
    fields.push({ group: 'RFQ', k, v: clean(v), conf: headerConf, ev, source: 'deterministic' })
  }
  addHeaderField('Buyer', parsed.header?.buyer)
  addHeaderField('Station', parsed.header?.station)
  addHeaderField('Subject', parsed.header?.subject)
  addHeaderField('RFQ number', parsed.header?.sectionRef)
  addHeaderField('RFQ date', parsed.header?.rfqDate)
  addHeaderField('Signatory', parsed.header?.signatory)
  for (const c of parsed.compliance || []) {
    fields.push({
      group: 'Compliance', k: c.label, v: c.customerAsk, conf: 70, ev,
      note: c.ourResponse, source: 'deterministic',
    })
  }
  const lineItems = (parsed.items || []).map(item => ({
    description: item.description || '', partNumber: item.pn || '', customerRef: item.sapCode || '',
    qty: Number(item.qty) || 1, uom: item.uom || 'EA',
    confidence: Math.round((item.confidence || 0) * 100),
    evidence: ev, source: 'deterministic',
  }))
  return { fields, lineItems }
}

// A short cross-check block handed to the AI prompt alongside the mechanical
// read, so the model spends its reasoning budget on summary/route/urgency/
// missing-info reasoning rather than re-deriving header facts.
export function deterministicPromptContext(scanned) {
  return scanned
    .map(({ name, parsed }) => {
      const h = parsed.header || {}
      const parts = [
        h.buyer && `buyer=${h.buyer}`, h.station && `station=${h.station}`,
        h.sectionRef && `rfqNumber=${h.sectionRef}`, h.rfqDate && `rfqDate=${h.rfqDate}`,
        h.signatory && `signatory=${h.signatory}`, `items=${(parsed.items || []).length}`,
      ].filter(Boolean)
      return parts.length ? `${name}: ${parts.join('; ')}` : ''
    })
    .filter(Boolean)
    .join('\n')
}

// Merge deterministic fields/line items into an AI-merged lead result.
// Precedence: for the header keys above, the deterministic value replaces the
// AI's outright once confidence clears the threshold — the AI's value is kept
// as `alt`, not discarded. Everywhere else, the higher-confidence value wins
// and the other is kept as `alt`, matching mergeLeadResults()'s structural
// conflict shape rather than flattening into a semicolon string.
export function mergeDeterministicIntoAi(ai, deterministicFields = [], deterministicLineItems = []) {
  if (!ai) return ai
  if (!deterministicFields.length && !deterministicLineItems.length) return ai

  const fields = (ai.fields || []).map(f => ({ ...f }))
  const index = new Map(fields.map((f, i) => [fieldKey(f.group, f.k), i]))
  for (const det of deterministicFields) {
    const id = fieldKey(det.group, det.k)
    const at = index.get(id)
    if (at == null) {
      fields.push({ ...det })
      index.set(id, fields.length - 1)
      continue
    }
    const existing = fields[at]
    if (norm(existing.v) === norm(det.v)) {
      fields[at] = { ...existing, conf: Math.max(Number(existing.conf) || 0, det.conf), source: existing.source || 'deterministic' }
      continue
    }
    const detWins = PRECEDENCE_KEYS.has(id)
      ? det.conf >= HEADER_CONF_THRESHOLD * 100
      : det.conf > (Number(existing.conf) || 0)
    const winner = detWins ? det : existing
    const loser = detWins ? existing : det
    fields[at] = {
      ...winner,
      alt: [...(existing.alt || []), { v: loser.v, conf: loser.conf, ev: loser.ev, source: loser.source || 'ai' }],
      note: [winner.note, 'Conflicting values across sources — see alternatives.'].filter(Boolean).join(' '),
    }
  }

  const lineItems = (ai.lineItems || []).map(x => ({ ...x }))
  const lineKey = x => norm(x.partNumber || x.customerRef || x.description)
  const lineIndex = new Map(lineItems.map((x, i) => [lineKey(x), i]).filter(([k]) => k))
  for (const det of deterministicLineItems) {
    const id = lineKey(det)
    if (!id) continue
    const at = lineIndex.get(id)
    if (at == null) {
      if (det.confidence >= ITEM_CONF_THRESHOLD * 100) {
        lineItems.push({ ...det })
        lineIndex.set(id, lineItems.length - 1)
      }
      continue
    }
    const existing = lineItems[at]
    lineItems[at] = {
      ...existing,
      partNumber: det.partNumber || existing.partNumber,
      customerRef: det.customerRef || existing.customerRef,
      description: (existing.description || '').length >= (det.description || '').length ? existing.description : det.description,
      qty: Math.max(Number(existing.qty) || 0, Number(det.qty) || 0) || existing.qty,
      confidence: Math.max(Number(existing.confidence) || 0, det.confidence),
      evidence: [det.evidence, existing.evidence].filter(Boolean).join('; '),
    }
  }

  return { ...ai, fields, lineItems }
}
