// Tender/RFQ PDF → structured extraction → proposal draft.
// Deterministic, fully client-side. The UI presents this as AI extraction with
// confidence badges; every field stays human-editable before commit.
import { PRODUCTS, newProposal } from './seed.js'

// ---------------------------------------------------------------- extraction

// Rebuild a page's reading order from pdfjs text items. PDF origin is
// bottom-left, so lines sort by y DESCENDING; items within ±2.5 units share a
// line, sorted by x, joined with a space only across a real horizontal gap.
// Exported so the Node test harness exercises the exact same reconstruction.
export function reconstructPage(rawItems) {
  const lines = []
  for (const it of rawItems) {
    if (!it.str || !it.str.trim()) continue
    const y = it.transform[5], x = it.transform[4]
    let line = lines.find(l => Math.abs(l.y - y) <= 2.5)
    if (!line) { line = { y, items: [] }; lines.push(line) }
    line.items.push({ x, w: it.width || 0, str: it.str })
  }
  lines.sort((a, b) => b.y - a.y)
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x)
    let out = '', prevEnd = null
    for (const it of l.items) {
      if (prevEnd !== null && it.x - prevEnd > 1) out += ' '
      out += it.str
      prevEnd = it.x + it.w
    }
    l.text = out
  }
  return lines
}

// pdfjs is heavy (~350 KB + 1 MB worker) — loaded lazily so no existing route
// pays for it. Legacy build keeps Safari ≥ 16.4 (iPad demo) working.
export async function extractPdfText(file) {
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    throw { code: 'NOT_PDF', message: 'Not a PDF file' }
  }
  let pdfjs, workerUrl
  try {
    ;[pdfjs, workerUrl] = await Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ])
  } catch (e) {
    throw { code: 'PDF_ERROR', message: 'PDF engine failed to load: ' + e.message }
  }
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default
  let doc
  try {
    doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  } catch (e) {
    if (/password/i.test(e?.message || '')) throw { code: 'ENCRYPTED', message: 'PDF is password-protected' }
    throw { code: 'PDF_ERROR', message: e?.message || 'Could not read PDF' }
  }

  const struct = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    struct.push(reconstructPage(content.items))
  }
  const fullText = struct.map(p => p.map(l => l.text).join('\n')).join('\n')
  return { struct, fullText, charCount: fullText.replace(/\s/g, '').length }
}

// ------------------------------------------------------------------ helpers

const collapse = s => s
  .replace(/-\n(?=[A-Za-z0-9])/g, '-')   // keep hyphen, drop the wrap ("Model-\nXPR04")
  .replace(/\n/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const firstSentence = (s, max = 160) => {
  const t = collapse(s)
  const dot = t.search(/\.\s/)
  const cut = dot > 20 ? t.slice(0, dot + 1) : t
  return cut.length > max ? cut.slice(0, max - 1) + '…' : cut
}

const allPcts = t => [...t.matchAll(/(?:(\d+(?:\.\d+)?)|½)\s*%/g)]
  .map(m => (m[1] ? parseFloat(m[1]) : 0.5))
const maxPct = t => { const p = allPcts(t); return p.length ? Math.max(...p) : 0 }
const firstPct = t => { const p = allPcts(t); return p.length ? p[0] : 0 }
const allDays = t => [...t.matchAll(/(\d{1,3})\s*days/gi)].map(m => parseInt(m[1], 10))
const firstDays = t => { const d = allDays(t); return d.length ? d[0] : 0 }
const minDays = t => { const d = allDays(t); return d.length ? Math.min(...d) : 0 }
const maxMonths = t => {
  const m = [...t.matchAll(/(\d{1,2})\s*months/gi)].map(x => parseInt(x[1], 10))
  return m.length ? Math.max(...m) : 0
}

const comply = ourResponse => ({ status: 'Comply', ourResponse })
const deviate = ourResponse => ({ status: 'Deviation', ourResponse })

// ModAE's standard positions — a clause matching `match` is judged against
// them; the judge returns the response committed to the compliance table.
export const MODAE_STANDARD_TERMS = [
  { key: 'sample', label: 'Sample Approval', match: /\bsample\b/i,
    standard: 'Sample before bulk supply is acceptable',
    judge: () => comply('Sample will be submitted for approval before bulk supply') },
  { key: 'sd', label: 'Security Deposit / BG', match: /security deposit|bank guarantee/i,
    standard: 'BG up to 10%, validity ≤ 12 months, acceptable',
    judge: t => firstPct(t) <= 10
      ? comply('BG of 10% from a nationalized bank will be furnished')
      : deviate('BG above 10% needs management approval') },
  { key: 'payment', label: 'Payment Terms', match: /terms of payment|payment/i,
    standard: 'Advance / 30 days from invoice preferred; post-installation payment is a deviation',
    judge: t => (/after|receipt of material|installation|commissioning/i.test(t) || firstDays(t) > 30)
      ? deviate('ModAE standard: 30 days from invoice / advance preferred. 100% post receipt + installation is a deviation — needs approval')
      : comply('Acceptable') },
  // Placed after `payment` so it cannot steal the payment-terms clause. On a
  // tender where we raise deviations this is the clause that decides whether
  // the bid survives, so it earns a row of its own rather than sitting silently
  // in "other clauses".
  { key: 'devreject', label: 'Deviation / Rejection Risk',
    match: /deviation in your offer|liable for rejection/i,
    standard: 'Deviations are declared up front and cleared with the buyer before bid submission',
    judge: () => ({ status: 'Comply', needsReview: true,
      ourResponse: 'All deviations are declared in the Deviations section of this offer; we request that they be '
        + 'considered as standard for imported instrumentation, and are open to discussion prior to award' }) },
  { key: 'delivery', label: 'Delivery Period', match: /delivery period|delivery/i,
    standard: '10–12 weeks ex-works for imported sensor items',
    judge: t => (minDays(t) > 0 && minDays(t) < 56)
      ? deviate('30 days sample + 30 days bulk is shorter than the standard 10–12 week import lead time — confirm stock with supplier')
      : comply('Acceptable') },
  // "(?<!bank )" — clause 2's "Bank Guarantee" must not read as a warranty.
  { key: 'warranty', label: 'Guarantee / Warranty', match: /(?<!bank\s)guarantee|warranty|defects in material/i,
    standard: '18 months from supply / 12 months from installation',
    judge: t => maxMonths(t) <= 18
      ? comply('12 months from installation / 18 months from receipt — matches ModAE standard')
      : deviate('Warranty beyond 18 months needs approval') },
  { key: 'ld', label: 'Liquidated Damages', match: /liquidated damages|penalty/i,
    standard: '0.5%/week acceptable, total cap ≤ 5%',
    judge: t => maxPct(t) > 5
      ? deviate(`LD cap of ${maxPct(t)}% exceeds ModAE standard cap of 5% — needs approval`)
      : comply('Within standard LD cap') },
  { key: 'insurance', label: 'Transit Insurance', match: /transit insurance|insurance/i,
    standard: 'Supplier-arranged transit insurance, cost built into prices',
    judge: () => comply('Transit insurance in supplier scope — included in quoted prices') },
  // "consignee:" with colon — the payment clause mentions a consignee in passing.
  { key: 'freight', label: 'Freight & Consignee', match: /consignee\s*:|freight/i,
    standard: 'Freight-paid delivery acceptable, cost built into prices',
    judge: () => comply('Freight-paid delivery to the named consignee — included in prices') },
  { key: 'compat', label: 'System Compatibility', match: /compatib|existing (installed )?system|meggit/i,
    prefer: /existing (installed )?system|meggit/i,
    standard: 'Offer models compatible with the installed OEM system',
    judge: t => ({ status: 'Comply', needsReview: true,
      ourResponse: (/meggit/i.test(t) ? 'Existing system is Meggitt — ' : '')
        + 'offered parts to be confirmed compatible by engineering before submission' }) },
  { key: 'qtyvar', label: 'Quantity Variation', match: /variation in quantities/i,
    standard: '± variation at same rates acceptable',
    judge: () => comply('Accepted — same rates apply for quantity variation') },
  { key: 'juris', label: 'Jurisdiction / Arbitration', match: /jurisdiction|arbitrat/i,
    standard: 'Customer jurisdiction acceptable',
    judge: () => comply('Customer jurisdiction and arbitration terms noted and accepted') },
  { key: 'gst', label: 'GST / E-way Bill', match: /e-?way bill|\bgst\b/i,
    standard: 'E-way bill + delivery challan per GST rules',
    judge: () => comply('E-way bill with delivery challan will be provided') },
]

const UOMS = 'EA|NO|NOS|SET|SETS|MTR|MTRS|KG|LOT|PC|PCS|PAIR'
const SAP_RE = /^[A-Z]\d{12,18}$/

// Sequence-aware numbered-clause split: a "N)" line start is a new clause only
// when N is the next expected number — clause 4's inline "2) Bulk quantity…"
// sub-item must fold back into clause 4, not become a bogus clause 2.
function splitNumbered(text) {
  const out = []
  const re = /^\s*(\d{1,2})[).]\s+/gm
  let expected = 1, m, current = null
  while ((m = re.exec(text))) {
    const n = parseInt(m[1], 10)
    if (n !== expected) continue
    if (current) current.text = text.slice(current.start, m.index)
    current = { n, start: re.lastIndex }
    out.push(current)
    expected++
  }
  if (current) current.text = text.slice(current.start)
  return out.map(c => ({ n: c.n, text: collapse(c.text) }))
}

function itemCategory(desc) {
  if (/armou?red cable|extension cable/i.test(desc)) return 'Cable'
  if (/driver|signal conditioner/i.test(desc)) return 'Driver / Signal Conditioner'
  if (/key ?phasor|proximity probe|phasor sensor/i.test(desc)) return 'Proximity Probe'
  if (/acceleromet/i.test(desc)) return 'Accelerometer'
  if (/cable/i.test(desc)) return 'Cable'
  return 'Item'
}

// Column-aware material-schedule rows. A row's SAP-code line is its anchor;
// the description column (left of the SAP x) wraps over lines above AND below
// the anchor, so rows are grouped as vertical blocks split on the larger
// between-row gap. Header/notes/terms blocks contain no SAP code and drop out.
function rowsFromStruct(struct) {
  const rows = []
  for (const page of struct) {
    const blocks = []
    let cur = null, prevY = null
    for (const line of page) {
      if (cur && prevY !== null && prevY - line.y > 18) cur = null
      if (!cur) { cur = []; blocks.push(cur) }
      cur.push(line)
      prevY = line.y
    }
    for (const block of blocks) {
      const anchors = block.filter(l => l.items.some(i => SAP_RE.test(i.str.trim())))
      if (!anchors.length) continue
      for (const anchor of anchors) {
        const sapItem = anchor.items.find(i => SAP_RE.test(i.str.trim()))
        const sapX = sapItem.x
        const tail = anchor.items.filter(i => i.x > sapX).map(i => i.str.trim())
        const uom = tail.find(t => new RegExp(`^(${UOMS})$`, 'i').test(t)) || ''
        const qty = parseInt(tail.find(t => /^\d{1,5}$/.test(t)) ?? '', 10)
        if (!isFinite(qty)) continue
        // Tightly-packed tables can land two anchors in one block — assign
        // each description line to its nearest anchor.
        const mine = anchors.length === 1 ? block
          : block.filter(l => anchors.every(a =>
              a === anchor || Math.abs(l.y - anchor.y) <= Math.abs(l.y - a.y)))
        let sn = NaN
        const descLines = mine.map(l => {
          let parts = l.items.filter(i => i.x < sapX - 10 && !SAP_RE.test(i.str.trim()))
          // Leading bare 1–2 digit number well clear of the text = the S/N column.
          if (parts.length && /^\d{1,2}$/.test(parts[0].str.trim())
              && (parts.length === 1 || parts[1].x - parts[0].x > 15)) {
            if (l === anchor) sn = parseInt(parts[0].str.trim(), 10)
            parts = parts.slice(1)
          }
          let out = '', prevEnd = null
          for (const i of parts) {
            if (prevEnd !== null && i.x - prevEnd > 1) out += ' '
            out += i.str
            prevEnd = i.x + i.w
          }
          return out.trim()
        }).filter(Boolean)
        rows.push({
          sn: isFinite(sn) ? sn : rows.length + 1,
          descRaw: descLines.join('\n'),
          sapCode: sapItem.str.trim().toUpperCase(),
          uom: uom.toUpperCase(), qty,
          fromStruct: true,
        })
      }
    }
  }
  return rows
}

// Fallback when no positional data is available (or no SAP-coded rows found):
// rows terminated by "SAP-code UOM qty" in the flat text. Wrapped description
// cells interleave in flat text, so this path is lower-confidence.
function rowsFromText(schedBlock) {
  const rows = []
  const rowRe = new RegExp(String.raw`([A-Z]\d{12,18})\s+(${UOMS})\s+(\d{1,5})\b`, 'gi')
  let prevEnd = 0, m
  while ((m = rowRe.exec(schedBlock))) {
    let desc = schedBlock.slice(prevEnd, m.index)
    desc = desc.replace(/^[\s\S]*?\bUOM\b[\s\S]*?Quantity/i, '')
    desc = collapse(desc)
    const snM = desc.match(/^(\d{1,2})\s+/)
    if (snM) desc = desc.slice(snM[0].length)
    rows.push({
      sn: snM ? parseInt(snM[1], 10) : rows.length + 1,
      descRaw: desc, sapCode: m[1].toUpperCase(), uom: m[2].toUpperCase(),
      qty: parseInt(m[3], 10), fromStruct: false,
    })
    prevEnd = rowRe.lastIndex
  }
  if (rows.length) return rows
  // Last resort: serial-anchored lines with a trailing "UOM qty".
  const fb = new RegExp(String.raw`^\s*(\d{1,2})[).]?\s+([\s\S]*?)\s+(${UOMS})\s+(\d{1,5})\s*$`, 'gim')
  let fm
  while ((fm = fb.exec(schedBlock))) {
    rows.push({
      sn: parseInt(fm[1], 10), descRaw: collapse(fm[2]), sapCode: '',
      uom: fm[3].toUpperCase(), qty: parseInt(fm[4], 10), fromStruct: false,
    })
  }
  return rows
}

// -------------------------------------------------------------------- parse

export function parseTender(fullText, struct = null) {
  const missing = []
  const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean)

  // Header — scan the top of the document.
  const head = lines.slice(0, 15)
  const buyer = collapse(head.find(l => /\b(COMPANY|CORPORATION|LIMITED|LTD)\b/i.test(l)) || '')
  const station = collapse(head.find(l => /(POWER STATION|POWER PLANT|WORKS)\b/i.test(l)) || '')
  const subject = collapse((fullText.match(/Subject\s*:\s*(.+)/i) || [])[1] || '')
  const sectionM = fullText.match(/SECTION[\s-]*([IVX0-9]+)/i)
  // The captured ref must contain a digit — "Tender Notice / Destruction"
  // must not yield a bogus "tice".
  const rfqM = fullText.match(/(?:Tender|RFQ|Enquiry)\s*(?:No\.?\b|Number|Ref\.?\b|#)\s*[:\-]?\s*([A-Z0-9\/\-.]*\d[A-Z0-9\/\-.]*)/i)
  const rfqDateM = fullText.match(/(?:RFQ|Tender|Enquiry)[^\n]{0,80}?(?:dated?|date)\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})/i)
  const sectionRef = rfqM ? rfqM[1] : sectionM ? `Section-${sectionM[1].replace(/\s/g, '')}` : ''
  if (!rfqM) missing.push('RFQ number')
  const signM = fullText.match(/^\s*((?:Chief|Executive|Superintend\w*|Dy\.?)[^\n]{0,60}Engineer[^\n]*)/im)
  const signatory = signM ? collapse(signM[1]) : ''
  const location = station.includes(',') ? station.slice(station.lastIndexOf(',') + 1).trim() : ''
  const rfqDate = rfqDateM ? rfqDateM[1] : ''
  const header = { buyer, station, subject, sectionRef, rfqDate, signatory }
  if (!buyer) missing.push('Buyer / customer name')
  if (!subject) missing.push('Subject')
  if (!rfqDate) missing.push('RFQ date')
  missing.push('Contact person', 'Contact phone')

  // Material schedule — positional parsing when we have it, flat-text otherwise.
  const schedStart = fullText.search(/MATERIAL\s+SCHEDULE/i)
  const termsHead = fullText.search(/SPECIAL\s+TERMS\s*&?\s*CONDITIONS/i)
  const schedBlock = fullText.slice(
    schedStart >= 0 ? schedStart : 0,
    termsHead >= 0 ? termsHead : fullText.length,
  )
  let rows = struct ? rowsFromStruct(struct) : []
  if (!rows.length) rows = rowsFromText(schedBlock)
  const items = rows.map(r => {
    const desc = collapse(r.descRaw)
    const pnM = desc.match(/P\/N\s*[.:]?\s*([A-Z0-9][A-Z0-9.\-\/]*[A-Z0-9])/i)
    const modelM = desc.match(/Model[-\s]*([A-Z]{2,6}\d{1,4})/i)
    const pn = pnM ? pnM[1] : ''
    const flags = []
    if (!pn) flags.push('no-part-number')
    if (!r.sapCode) flags.push('no-sap-code')
    return {
      sn: r.sn, description: desc, sapCode: r.sapCode, pn,
      model: modelM ? modelM[1] : '',
      uom: r.uom, qty: r.qty,
      confidence: !r.sapCode ? 0.5 : r.fromStruct ? (pn ? 0.95 : 0.8) : (pn ? 0.8 : 0.6),
      flags,
    }
  })
  if (!items.length) missing.push('Line items')

  // Notes between the schedule and the special-terms heading (note 5 carries
  // the installed-system compatibility requirement).
  const lastSap = items.length && items[items.length - 1].sapCode
    ? schedBlock.lastIndexOf(items[items.length - 1].sapCode) : -1
  const notesBlock = termsHead >= 0 && lastSap >= 0 ? schedBlock.slice(lastSap) : ''
  const preNotes = splitNumbered(notesBlock).map(c => c.text)

  // Special terms — numbering restarts at 1 after the heading.
  let termsBlock = termsHead >= 0 ? fullText.slice(termsHead) : ''
  const signCut = termsBlock.search(/^\s*(?:Chief|Executive)[^\n]{0,60}Engineer/im)
  if (signCut > 0) termsBlock = termsBlock.slice(0, signCut)
  const clauses = splitNumbered(termsBlock)
  const terms = clauses.map(c => {
    const std = MODAE_STANDARD_TERMS.find(s => s.match.test(c.text))
    return { n: c.n, text: c.text, summary: firstSentence(c.text), categoryKey: std?.key || '', category: std?.label || '' }
  })

  // Compliance verdicts — one row per standard-terms entry that any clause or
  // pre-note triggers.
  const compliance = []
  for (const std of MODAE_STANDARD_TERMS) {
    // `prefer` picks the most specific source when several match (e.g. the
    // installed-system note over a generic "compatible" note).
    const clause = (std.prefer && clauses.find(c => std.prefer.test(c.text)))
      || clauses.find(c => std.match.test(c.text))
    const note = clause ? null
      : (std.prefer && preNotes.find(t => std.prefer.test(t))) || preNotes.find(t => std.match.test(t))
    const src = clause?.text ?? note
    if (!src) continue
    const verdict = std.judge(src)
    compliance.push({
      key: std.key, label: std.label,
      customerAsk: firstSentence(src),
      ourResponse: verdict.ourResponse,
      status: verdict.status,
      needsReview: !!verdict.needsReview,
      clauseRef: clause ? `Clause ${clause.n}` : 'Tender notes',
    })
  }

  // Product names get a lenient match (tenders misspell — "MEGGIT"): names of
  // 6+ chars match on their stem.
  const productHit = PRODUCTS.find(p => {
    const base = p.length >= 6 ? p.slice(0, -1) : p
    const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return p.length > 2 && new RegExp(esc, 'i').test(fullText)
  })
  const guesses = {
    segment: /thermal/i.test(station) ? 'Thermal' : /hydro/i.test(station) ? 'Hydro' : 'Others',
    oppType: /procurement|spares|supply of/i.test(subject) ? 'Spares' : 'Project',
    bu: 'Energy',
    category: 'EUC',
    product: productHit || 'Various',
    location,
  }

  const headerFound = [buyer, station, subject, sectionRef, rfqDate, signatory].filter(Boolean).length
  const confidence = {
    header: headerFound / 5,
    items: items.length ? items.reduce((s, i) => s + i.confidence, 0) / items.length : 0,
    terms: clauses.length >= 10 ? 0.9 : clauses.length ? 0.6 : 0,
  }

  return { header, items, preNotes, terms, compliance, guesses, confidence, missing }
}

// ----------------------------------------------------------------- matching

const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

// Tier 1: exact part number. Tier 2: normalized equality. Tier 3: normalized
// prefix/contains (≥5 chars). null = no price source — ad-hoc entry needed.
export function matchParts(items, allParts) {
  return items.map(item => {
    let match = null
    if (item.pn) {
      const exact = allParts.find(p => p.pn.toUpperCase() === item.pn.toUpperCase())
      if (exact) match = { ...exact, tier: 1 }
      if (!match) {
        const n = norm(item.pn)
        const eq = allParts.find(p => norm(p.pn) === n)
        if (eq) match = { ...eq, tier: 2 }
        if (!match && n.length >= 5) {
          const part = allParts.find(p => {
            const pp = norm(p.pn)
            return pp.length >= 5 && (pp.startsWith(n) || n.startsWith(pp) || pp.includes(n))
          })
          if (part) match = { ...part, tier: 3 }
        }
      }
    }
    // Tier 4: the tender line gives a specification but no part number (common
    // for cables and accessories). Score price-list parts by how many of their
    // `keywords` appear in the description; needs ≥2 hits and a strictly best
    // candidate, and the UI presents it as a suggestion to confirm, not a match.
    if (!match && !item.pn) {
      const d = String(item.description || '').toLowerCase()
      const scored = allParts
        .map(p => ({ p, n: (p.keywords || []).filter(k => d.includes(k)).length }))
        .filter(x => x.n >= 2)
        .sort((a, b) => b.n - a.n)
      if (scored.length && (scored.length === 1 || scored[0].n > scored[1].n)) {
        match = { ...scored[0].p, tier: 4 }
      }
    }
    return { item, match }
  })
}

// Conservative parser for common email/pasted-list line shapes.
export function parseLeadLineItems(text) {
  const source = String(text || '').replace(/\r/g, '')
  const qtyPattern = /(?:qty|quantity|qnty)\s*[:=]?\s*\d+(?:\.\d+)?|(?:x|×)\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*(?:nos?|pcs?|pieces?|sets?|ea)\b/i
  const partPattern = /\b(?=[A-Z0-9./_-]*\d)[A-Z][A-Z0-9]*(?:[./_-][A-Z0-9]+)*\b/i
  const chunks = []
  for (const line of source.split(/\n|;|(?=\b\d+[.)]\s)/).map(s => s.trim()).filter(Boolean)) {
    const commaParts = line.split(',').map(s => s.trim()).filter(Boolean)
    const compact = commaParts.length > 1
      && commaParts.filter(s => qtyPattern.test(s) && partPattern.test(s)).length === commaParts.length
    chunks.push(...(compact ? commaParts : [line]))
  }
  const rows = []
  for (const chunk of chunks) {
    const qtyM = chunk.match(/(?:qty|quantity|qnty)\s*[:=]?\s*(\d+(?:\.\d+)?)|(?:x|×)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:nos?|pcs?|pieces?|sets?|ea)\b/i)
    const pnM = chunk.match(partPattern)
    if (!qtyM && !pnM) continue
    const qty = Number(qtyM?.[1] || qtyM?.[2] || qtyM?.[3] || 1)
    const pn = pnM?.[0] || ''
    const desc = chunk.replace(/^\d+[.)]\s*/, '')
      .replace(/(?:qty|quantity|qnty)\s*[:=]?\s*\d+(?:\.\d+)?/i, '')
      .replace(/(?:x|×)\s*\d+(?:\.\d+)?/i, '')
      .replace(/\d+(?:\.\d+)?\s*(?:nos?|pcs?|pieces?|sets?|ea)\b/i, '')
      .replace(pn, '').replace(/[,:\-–]+\s*$/, '').trim()
    rows.push({ description: desc || pn, partNumber: pn, customerRef: pn, qty, uom: 'EA', confidence: pn ? 80 : 55, evidence: chunk })
  }
  return rows
}

// ----------------------------------------------------------------- builders

export function buildOpportunityDraft(parse) {
  const { header, guesses } = parse
  return {
    sellTo: header.buyer,
    category: guesses.category,
    location: guesses.location,
    eucName: header.station.includes(',') ? header.station.slice(0, header.station.indexOf(',')).trim() : header.station,
    eucLocation: guesses.location,
    oppName: header.subject,
    owner: '',
    oppType: guesses.oppType,
    bu: guesses.bu,
    segment: guesses.segment,
    product: guesses.product,
    contactPerson: header.signatory,
    contactPhone: '',
    valueK: '',
  }
}

export function buildProposal(oppId, opp, parse, matched) {
  const today = new Date().toISOString().slice(0, 10)
  const p = newProposal(oppId, opp)
  return {
    ...p,
    rfqNumber: [parse.header.sectionRef, parse.header.rfqDate || `recd. ${today}`].filter(Boolean).join(' / '),
    subject: `Proposal For ${parse.header.subject || opp.oppName}`,
    project: [parse.header.subject, parse.header.station].filter(Boolean).join(' — '),
    kindAttn: parse.header.signatory || opp.contactPerson,
    // Spares tender: quantities are absolute (Common), not per-unit.
    units: 1,
    signals: p.signals.map(s => ({ ...s, perUnit: 0, units: 0 })),
    bom: matched.map(({ item, match }) => ({
      itemCategory: itemCategory(item.description),
      // The customer's SAP code is their reference, not a part number we offer —
      // it gets its own column rather than the "proposed model" one.
      pn: item.pn || match?.pn || '',
      custRef: item.sapCode,
      // Never truncated: in a tender BoQ the full tendered wording is the
      // evidence that what we offer is what was asked for.
      desc: item.description,
      uom: item.uom || 'EA',
      listPrice: match ? match.price : 0,
      adders: [],
      qtyPerUnit: 0, common: item.qty, spares: 0, quoted: '',
      list: match ? match.list : 'Ad-hoc',
      currency: match ? match.currency : 'INR',
    })),
    terms: parse.compliance.map(c => ({
      key: c.key, clauseRef: c.clauseRef,
      term: c.label, customerAsk: c.customerAsk, ourResponse: c.ourResponse, status: c.status,
    })),
  }
}
