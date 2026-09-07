// Vercel Gemini proxy for the browser AI contract.
// GEMINI_API_KEY is read only on the server. Never expose it through VITE_.

const API = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_MODEL = 'gemini-2.5-flash'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const send = (res, status, body) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', CORS['Access-Control-Allow-Headers'])
  res.setHeader('Access-Control-Allow-Methods', CORS['Access-Control-Allow-Methods'])
  return res.status(status).json(body)
}

const fail = (res, status, errorCode, error) =>
  send(res, status, { ok: false, errorCode, error })

const cap = (value, max) => String(value ?? '').slice(0, max)

const HOUSE = `
You are the extraction and drafting engine inside WinTrack, the sales system of
ModAE India Pvt Ltd, a supplier of vibration and condition-monitoring systems
and related engineering services.

Opportunity routes are exactly: Spares, Service, Project.
Customer categories are: OEM, EUC, EUC/OEM, ACP, SI, RE/TR, EPC.

Extract only what the email or attached documents support. Never invent a part
number, price, quantity, date or company name. Confidence is an honest integer
from 0 to 100. Evidence must identify the exact email or attachment source.
Write in plain, direct Indian industrial B2B language.
`.trim()

const leadSchema = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    route: { type: 'STRING', enum: ['Spares', 'Service', 'Project', 'Mixed'] },
    urgency: { type: 'STRING', enum: ['Low', 'Normal', 'Urgent'] },
    completeness: { type: 'INTEGER' },
    suggestedOwner: { type: 'STRING' },
    lineItems: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      description: { type: 'STRING' }, partNumber: { type: 'STRING' }, customerRef: { type: 'STRING' },
      qty: { type: 'NUMBER' }, uom: { type: 'STRING' }, confidence: { type: 'INTEGER' }, evidence: { type: 'STRING' },
    }, required: ['description', 'qty', 'confidence', 'evidence'] } },
    fields: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      group: { type: 'STRING', enum: ['Customer', 'RFQ', 'Schedule', 'Commercial', 'Compliance', 'Known Project'] },
      k: { type: 'STRING' }, v: { type: 'STRING' }, conf: { type: 'INTEGER' },
      ev: { type: 'STRING' }, note: { type: 'STRING' },
    }, required: ['group', 'k', 'v', 'conf', 'ev'] } },
    missing: { type: 'ARRAY', items: { type: 'STRING' } },
    next: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['summary', 'route', 'urgency', 'completeness', 'fields', 'lineItems', 'missing', 'next'],
}

const fillSchema = {
  type: 'OBJECT',
  properties: { value: { type: 'STRING' }, rationale: { type: 'STRING' } },
  required: ['value', 'rationale'],
}

const vendorQuoteSchema = {
  type: 'OBJECT',
  properties: {
    manufacturer: { type: 'STRING' },
    quoteRef: { type: 'STRING' },
    leadTime: { type: 'STRING' },
    notes: { type: 'STRING' },
    prices: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      lineId: { type: 'STRING' }, unitPrice: { type: 'NUMBER' }, currency: { type: 'STRING' },
      leadTime: { type: 'STRING' }, notes: { type: 'STRING' },
    }, required: ['lineId', 'unitPrice', 'currency', 'leadTime', 'notes'] } },
  },
  required: ['manufacturer', 'quoteRef', 'leadTime', 'notes', 'prices'],
}

const emailProposalSchema = {
  type: 'OBJECT',
  properties: {
    text: { type: 'STRING' },
  },
  required: ['text'],
}

function leadPrompt(p) {
  return `${HOUSE}

Read the complete inbound sales enquiry for human review. Treat the email body
and every attachment as one single enquiry — do not report a fact as missing if
any attachment supports it. If an attachment is an image or scanned PDF, read
its visible content from the supplied document part.

FROM: ${cap(p.from, 200)}
SUBJECT: ${cap(p.subject, 300)}
BODY:
${cap(p.body, 20000)}

ATTACHMENTS AND EXTRACTED TEXT:
${cap((p.attachments || []).map(a => `--- ${a.name} ---\n${a.text || '(visual document part supplied; read it directly)'}`).join('\n\n'), 100000) || 'none'}
${p.deterministicContext ? `
DETERMINISTIC PARSE (already extracted mechanically from an attachment — cross-check
and correct only if it looks wrong; do not restate these as new facts, add what
it does not cover):
${cap(p.deterministicContext, 4000)}
` : ''}
Customers already in our master:
${cap((p.customers || []).join(', '), 3000)}

Ownership rules:
${cap((p.ownershipRules || []).map(r => `${r.region} -> ${r.owner}`).join('\n'), 1000)}

Always attempt to extract, grouped as shown: Sell-to customer, Category, Contact
person, Contact email, Contact phone, Plant/station/location (Customer); RFQ or
tender reference, RFQ date, submission mode/platform, Opp type, Opportunity
scope (RFQ); delivery schedule, other schedule dates (Schedule); payment terms,
warranty, price basis, EMD/security deposit (Commercial); certification asks,
documentation/compliance asks (Compliance); BU and Segment (Customer); any
installed-base or known-project reference (Known Project). Return every
requested material as lineItems with one row per item. Cite the email or
attachment name in evidence. For Opp type, classify procurement of physical
items with part numbers, quantities, sensors, probes, cables or spare materials
as Spares, even if the document mentions service/support in a commercial
clause. Use Service only when the requested work is labour such as
maintenance, repair, calibration, commissioning or field engineering. Ask only
for information absent from both sources.`
}

function fillPrompt(p) {
  return `${HOUSE}

This is a controlled QA simulation. Generate one realistic business value for
the missing information below, using the enquiry context. Do not invent a part
number, price, contractual commitment or precise date. If the source cannot
support precision, use a clear planning value such as "As per attached buyer specification"
or "Before the commissioning window". Do not include the words "simulated",
"demo" or "placeholder" in the value.

MISSING INFORMATION: ${cap(p.missing, 300)}
FROM: ${cap(p.from, 200)}
SUBJECT: ${cap(p.subject, 300)}
BODY:
${cap(p.body, 12000)}

EXTRACTED FIELDS:
${cap((p.fields || []).map(f => `${f.k}: ${f.v}`).join('\n'), 10000)}

ATTACHMENTS:
${cap((p.attachments || []).map(a => `${a.name}: ${a.text || ''}`).join('\n\n'), 20000) || 'none'}`
}

function vendorQuotePrompt(p) {
  return `${HOUSE}

This is a controlled QA simulation of a manufacturer response to a sourcing
request. Generate a plausible, clearly non-binding vendor quote using the
opportunity and requested lines. Do not claim that the quote was actually sent
or received. Use INR unless the opportunity clearly requires another currency.
Use realistic indicative prices and lead times; do not use zero prices. Return
one price row for each supplied line and preserve each lineId exactly.

OPPORTUNITY: ${cap(p.oppName, 300)} (${cap(p.oppId, 100)})
CUSTOMER: ${cap(p.customer, 300)}
PRODUCT / ROUTE: ${cap(p.product, 200)} / ${cap(p.route, 100)}
REQUESTED LINES:
${cap((p.lines || []).map(l => `${l.id}: ${l.pn || l.custRef || 'No part number'} - ${l.desc || 'Item'} - Qty ${l.qty || 1}`).join('\n'), 12000) || 'No priced lines are available yet; return an overall indicative response with an empty prices list.'}`
}

function proposalEmailPrompt(p) {
  return `${HOUSE}

Draft a concise customer email for sending an approved Techno-Commercial
Proposal. Use a polite Indian industrial B2B tone. Do not invent commercial
terms, prices, delivery dates, attachments or commitments. Mention the proposal
revision, opportunity reference and validity only if supplied. Return only the
message body text, including greeting and sign-off.

OPPORTUNITY: ${cap(p.oppName, 300)} (${cap(p.oppId, 100)})
CUSTOMER: ${cap(p.customer, 300)}
ROUTE: ${cap(p.route, 100)}
REVISION: ${cap(p.revision, 50)}
VALIDITY: ${cap(p.validity, 200)}
SENDER: ${cap(p.senderName, 200)}
TERMS:
${cap((p.terms || []).map(t => `${t.term || 'Term'}: ${t.ourResponse || t.customerAsk || t.status || ''}`).join('\n'), 6000) || 'No special terms supplied.'}`
}

function inlineParts(payload) {
  return Array.isArray(payload?.aiAttachments)
    ? payload.aiAttachments
      .filter(a => a && typeof a.dataBase64 === 'string' && typeof a.mimeType === 'string')
      .slice(0, 8)
      .map(a => ({ inlineData: { mimeType: String(a.mimeType).slice(0, 100), data: a.dataBase64 } }))
    : []
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', CORS['Access-Control-Allow-Headers'])
    res.setHeader('Access-Control-Allow-Methods', CORS['Access-Control-Allow-Methods'])
    return res.status(204).end()
  }
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'POST only' })

  const key = String(process.env.GEMINI_API_KEY || '').trim()
  if (!key) return fail(res, 503, 'AI_KEY_MISSING', 'Gemini is not configured for this Vercel environment')

  let input
  try { input = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}) }
  catch { return fail(res, 400, 'AI_BAD_REQUEST', 'Malformed request body') }
  const task = String(input.task || '')
  const payload = input.payload || {}
  const model = /^gemini-[\w.-]+$/.test(String(input.model || '')) ? String(input.model) : DEFAULT_MODEL
  if (!['health', 'lead.extract', 'lead.fill', 'vendor.quote', 'email.proposal'].includes(task)) {
    return fail(res, 400, 'AI_BAD_REQUEST', `Unsupported task: ${task}`)
  }

  const prompt = task === 'health' ? 'Reply with the single word: ok'
    : task === 'lead.fill' ? fillPrompt(payload)
      : task === 'vendor.quote' ? vendorQuotePrompt(payload)
        : task === 'email.proposal' ? proposalEmailPrompt(payload)
          : leadPrompt(payload)
  const requestBody = {
    contents: [{ parts: [{ text: prompt }, ...(task === 'lead.extract' ? inlineParts(payload) : [])] }],
    generationConfig: ['lead.extract', 'lead.fill', 'vendor.quote', 'email.proposal'].includes(task)
      ? {
          responseMimeType: 'application/json',
          responseSchema: task === 'lead.fill' ? fillSchema
            : task === 'vendor.quote' ? vendorQuoteSchema
              : task === 'email.proposal' ? emailProposalSchema
                : leadSchema,
        }
      : {},
  }

  try {
    const upstream = await fetch(`${API}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(requestBody),
    })
    if (!upstream.ok) {
      const errorCode = [401, 403].includes(upstream.status)
        ? 'AI_KEY_REJECTED'
        : upstream.status === 429
          ? 'AI_RATE_LIMITED'
          : 'AI_UPSTREAM_FAILED'
      const error = errorCode === 'AI_KEY_REJECTED'
        ? 'Gemini rejected the configured server credential'
        : errorCode === 'AI_RATE_LIMITED'
          ? 'Gemini is temporarily rate limited; try again shortly'
          : `Gemini service returned HTTP ${upstream.status}`
      return fail(res, 502, errorCode, error)
    }
    const out = await upstream.json()
    const text = out?.candidates?.[0]?.content?.parts?.map(p => p?.text || '').join('') || ''
    if (!text) return fail(res, 502, 'AI_EMPTY_RESPONSE', 'Gemini returned no usable output')
    if (task === 'health') return send(res, 200, { ok: true, model, text })
    return send(res, 200, { ok: true, model, data: JSON.parse(text) })
  } catch (error) {
    console.error('Vercel Gemini proxy failed', error?.message || error)
    return fail(res, 502, 'AI_NETWORK_ERROR', 'Gemini could not be reached; try again shortly')
  }
}
