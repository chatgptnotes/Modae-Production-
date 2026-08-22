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
      group: { type: 'STRING', enum: ['Customer', 'RFQ', 'Known Project'] },
      k: { type: 'STRING' }, v: { type: 'STRING' }, conf: { type: 'INTEGER' },
      ev: { type: 'STRING' }, note: { type: 'STRING' },
    }, required: ['group', 'k', 'v', 'conf', 'ev'] } },
    missing: { type: 'ARRAY', items: { type: 'STRING' } },
    next: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['summary', 'route', 'urgency', 'completeness', 'fields', 'lineItems', 'missing', 'next'],
}

function leadPrompt(p) {
  return `${HOUSE}

Read the complete inbound sales enquiry for human review. Use BOTH the email
and every attached document. If an attachment is an image or scanned PDF, read
its visible content from the supplied document part.

FROM: ${cap(p.from, 200)}
SUBJECT: ${cap(p.subject, 300)}
BODY:
${cap(p.body, 20000)}

ATTACHMENTS AND EXTRACTED TEXT:
${cap((p.attachments || []).map(a => `--- ${a.name} ---\n${a.text || '(visual document part supplied; read it directly)'}`).join('\n\n'), 40000) || 'none'}

Customers already in our master:
${cap((p.customers || []).join(', '), 3000)}

Ownership rules:
${cap((p.ownershipRules || []).map(r => `${r.region} -> ${r.owner}`).join('\n'), 1000)}

Always attempt Sell-to customer, Category, Contact, Opp type, Opportunity
scope, line items, quantities, BU and Segment. Return every requested material
as lineItems with one row per item. Cite the email or attachment
name in evidence. Ask only for information absent from both sources.`
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
  if (!key) return send(res, 503, { ok: false, error: 'GEMINI_API_KEY is not configured on Vercel' })

  let input
  try { input = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}) }
  catch { return send(res, 400, { ok: false, error: 'Malformed request body' }) }
  const task = String(input.task || '')
  const payload = input.payload || {}
  const model = /^gemini-[\w.-]+$/.test(String(input.model || '')) ? String(input.model) : DEFAULT_MODEL
  if (!['health', 'lead.extract'].includes(task)) {
    return send(res, 400, { ok: false, error: `Unsupported task: ${task}` })
  }

  const prompt = task === 'health' ? 'Reply with the single word: ok' : leadPrompt(payload)
  const requestBody = {
    contents: [{ parts: [{ text: prompt }, ...(task === 'lead.extract' ? inlineParts(payload) : [])] }],
    generationConfig: task === 'lead.extract'
      ? { responseMimeType: 'application/json', responseSchema: leadSchema }
      : {},
  }

  try {
    const upstream = await fetch(`${API}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(requestBody),
    })
    if (!upstream.ok) return send(res, 502, { ok: false, error: `Model returned ${upstream.status}` })
    const out = await upstream.json()
    const text = out?.candidates?.[0]?.content?.parts?.map(p => p?.text || '').join('') || ''
    if (!text) return send(res, 502, { ok: false, error: 'The model returned no output' })
    if (task === 'health') return send(res, 200, { ok: true, model, text })
    return send(res, 200, { ok: true, model, data: JSON.parse(text) })
  } catch (error) {
    console.error('Vercel Gemini proxy failed', error?.message || error)
    return send(res, 502, { ok: false, error: 'Gemini request failed' })
  }
}
