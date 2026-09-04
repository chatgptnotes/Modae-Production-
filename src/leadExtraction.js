// Complete-text extraction helpers. Chunks stay below the server request limit.
export const EXTRACTION_CHUNK_CHARS = 12000

const clean = value => String(value ?? '').trim()
const key = value => clean(value).toLowerCase().replace(/\s+/g, ' ')

// A purchasing specification can mention service/support in its commercial
// clauses. Physical procurement evidence must win over those incidental words.
export function deterministicLeadRoute(body, attachments = []) {
  const text = `${body || ''}\n${(attachments || []).map(a => `${a.name || ''}\n${a.text || ''}`).join('\n')}`.toLowerCase()
  const spares = [
    /\bpart\s*(?:no|number|code)\b/, /\bquantity\b|\bqty\b|\bnos?\b/, /\bspares?\b/, /\bsupply\b/, /\bsensor\b|\bprobe\b|\bcable\b/, /\boem\s+packing\b/, /\bauthorized\s+(?:dealer|distributor)\b/,
  ].reduce((score, pattern) => score + (pattern.test(text) ? 1 : 0), 0)
  const service = [
    /\bfield\s+(?:service|balancing|engineer(?:ing)?)\b/, /\bmaintenance\b/, /\bcommissioning\b/, /\bcalibration\b/, /\brepair\b/, /\b(?:amc|man[- ]?days?)\b/, /\bsite\s+visit\b/,
  ].reduce((score, pattern) => score + (pattern.test(text) ? 1 : 0), 0)
  if (spares >= 3 && spares > service) return 'Spares'
  if (service >= 2 && service > spares) return 'Service'
  return ''
}

export function textChunks(text, { source = 'Email body', size = EXTRACTION_CHUNK_CHARS } = {}) {
  const value = String(text ?? '')
  if (!value.trim()) return []
  const out = []
  for (let start = 0; start < value.length; start += size) {
    const end = Math.min(value.length, start + size)
    out.push({ source, index: out.length, start, end, text: value.slice(start, end) })
  }
  return out
}

// Page-aware alternative to textChunks() for PDFs whose positional page
// structure (extractPdfText()'s `struct`) is still available. Whole pages are
// packed into a chunk up to `size` chars so a table row is never split across
// two AI calls; a single page bigger than `size` still falls back to a plain
// character slice for that one page only.
export function pageAwareChunks(structPages, { source = 'Email body', size = EXTRACTION_CHUNK_CHARS } = {}) {
  if (!Array.isArray(structPages) || !structPages.length) return []
  const pages = structPages.map(page => (page || []).map(l => l.text).join('\n'))
  const groups = []
  let buf = '', bufStart = 1
  for (let i = 0; i < pages.length; i++) {
    const pageNum = i + 1
    const pageText = pages[i]
    if (pageText.length > size) {
      if (buf) { groups.push({ pageStart: bufStart, pageEnd: pageNum - 1, text: buf }); buf = '' }
      for (const slice of textChunks(pageText, { source, size })) {
        groups.push({ pageStart: pageNum, pageEnd: pageNum, text: slice.text })
      }
      bufStart = pageNum + 1
      continue
    }
    const next = buf ? `${buf}\n${pageText}` : pageText
    if (buf && next.length > size) {
      groups.push({ pageStart: bufStart, pageEnd: pageNum - 1, text: buf })
      buf = pageText
      bufStart = pageNum
    } else {
      buf = next
    }
  }
  if (buf) groups.push({ pageStart: bufStart, pageEnd: pages.length, text: buf })

  let offset = 0
  const out = groups.map(g => {
    const chunk = { source, start: offset, end: offset + g.text.length, text: g.text, pageStart: g.pageStart, pageEnd: g.pageEnd }
    offset += g.text.length
    return chunk
  })
  return out.map((chunk, index, all) => ({ ...chunk, index, total: all.length }))
}

export function leadTextChunks(body, attachments = []) {
  const chunks = textChunks(body)
  for (const attachment of attachments || []) {
    const source = `Attachment: ${attachment.name}`
    if (Array.isArray(attachment.structPages) && attachment.structPages.length) {
      chunks.push(...pageAwareChunks(attachment.structPages, { source }))
    } else {
      chunks.push(...textChunks(attachment.text, { source }))
    }
  }
  return chunks.map((chunk, index, all) => ({ ...chunk, index, total: all.length }))
}

const unique = values => [...new Set((values || []).map(clean).filter(Boolean))]

export function mergeLeadResults(results = []) {
  const usable = results.filter(Boolean)
  if (!usable.length) return null
  const fields = []
  const fieldMap = new Map()
  for (const result of usable) for (const field of result.fields || []) {
    const id = `${key(field.group)}|${key(field.k)}`
    const existing = fieldMap.get(id)
    if (!existing) { const next = { ...field }; fieldMap.set(id, next); fields.push(next); continue }
    const valuesDiffer = clean(field.v) && key(field.v) !== key(existing.v)
    existing.conf = valuesDiffer ? Math.min(74, Math.max(Number(existing.conf) || 0, Number(field.conf) || 0)) : Math.max(Number(existing.conf) || 0, Number(field.conf) || 0)
    existing.ev = unique([existing.ev, field.ev]).join('; ')
    if (valuesDiffer) {
      // Two chunks/sources disagree on a genuinely distinct fact (e.g. two
      // different contacts). Keep both values addressable — existing.v/.conf/.ev
      // stay the winning (higher-confidence-seen-so-far) value for anything that
      // only reads those, while alt[] carries every other value seen so a UI can
      // show "conflicting values found" without losing the alternatives.
      existing.alt = [...(existing.alt || []), { v: field.v, conf: field.conf, ev: field.ev, source: field.source }]
      existing.note = [existing.note, 'Conflicting values found across document sections.'].filter(Boolean).join(' ')
    }
  }
  const lineItems = []
  const lineMap = new Map()
  for (const result of usable) for (const line of result.lineItems || []) {
    const id = key(line.partNumber || line.customerRef || line.description)
    if (!id) continue
    const existing = lineMap.get(id)
    if (!existing) { const next = { ...line }; lineMap.set(id, next); lineItems.push(next); continue }
    existing.qty = Math.max(Number(existing.qty) || 0, Number(line.qty) || 0) || 1
    existing.confidence = Math.max(Number(existing.confidence) || 0, Number(line.confidence) || 0)
    existing.evidence = unique([existing.evidence, line.evidence]).join('; ')
  }
  return {
    summary: unique(usable.map(x => x.summary)).join(' '),
    route: usable.find(x => x.route && x.route !== 'Mixed')?.route || usable[0].route || 'Spares',
    urgency: usable.some(x => x.urgency === 'Urgent') ? 'Urgent' : usable.find(x => x.urgency)?.urgency || 'Normal',
    completeness: Math.max(0, Math.min(100, Math.round(usable.reduce((n, x) => n + (Number(x.completeness) || 0), 0) / usable.length))),
    suggestedOwner: usable.find(x => x.suggestedOwner)?.suggestedOwner || '',
    fields, lineItems,
    missing: unique(usable.flatMap(x => x.missing || [])),
    next: unique(usable.flatMap(x => x.next || [])),
  }
}
