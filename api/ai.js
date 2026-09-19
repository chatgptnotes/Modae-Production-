// Vercel Gemini proxy for the browser AI contract.
// GEMINI_API_KEY is read only on the server. Never expose it through VITE_.

const API = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_MODEL = 'gemini-3.6-flash'
const MODEL_ALIASES = {
  'gemini-pro': DEFAULT_MODEL,
  'gemini-pro-latest': DEFAULT_MODEL,
}

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
    greeting: { type: 'STRING' },
    purpose: { type: 'STRING' },
    attachments: { type: 'STRING' },
    validityAndNextStep: { type: 'STRING' },
    clarification: { type: 'STRING' },
    signoff: { type: 'STRING' },
  },
  required: ['greeting', 'purpose', 'attachments', 'validityAndNextStep', 'clarification', 'signoff'],
}

const emailProofreadSchema = {
  type: 'OBJECT',
  properties: {
    text: { type: 'STRING' },
  },
  required: ['text'],
}

const clarificationSuggestSchema = {
  type: 'OBJECT',
  properties: {
    rows: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      category: { type: 'STRING' }, gap: { type: 'STRING' }, q: { type: 'STRING' }, evidence: { type: 'STRING' },
    }, required: ['category', 'gap', 'q', 'evidence'] } },
  },
  required: ['rows'],
}

const sparesMatchSchema = {
  type: 'OBJECT',
  properties: {
    matches: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      partNumber: { type: 'STRING' }, confidence: { type: 'INTEGER' }, reason: { type: 'STRING' },
    }, required: ['partNumber', 'confidence', 'reason'] } },
  },
  required: ['matches'],
}

const clarificationAnswerSchema = {
  type: 'OBJECT',
  properties: {
    rows: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      id: { type: 'STRING' }, status: { type: 'STRING' }, response: { type: 'STRING' }, missing: { type: 'STRING' }, confidence: { type: 'INTEGER' }, evidence: { type: 'STRING' },
      fieldKey: { type: 'STRING' }, fieldValue: { type: 'STRING' }, fieldEvidence: { type: 'STRING' },
      lineItems: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
        partNumber: { type: 'STRING' }, description: { type: 'STRING' }, qty: { type: 'NUMBER' }, uom: { type: 'STRING' }, evidence: { type: 'STRING' },
      }, required: ['partNumber', 'description', 'qty', 'uom', 'evidence'] } },
    }, required: ['id', 'status', 'response', 'missing', 'confidence', 'evidence', 'fieldKey', 'fieldValue', 'fieldEvidence'] } },
  },
  required: ['rows'],
}

const conditionEvidenceSchema = {
  type: 'OBJECT',
  properties: {
    assessment: { type: 'STRING', enum: ['Supports', 'Does not support', 'Inconclusive'] },
    confidence: { type: 'INTEGER' },
    evidence: { type: 'STRING' },
    concerns: { type: 'STRING' },
  },
  required: ['assessment', 'confidence', 'evidence', 'concerns'],
}

const approvalCommentSchema = {
  type: 'OBJECT',
  properties: {
    classification: { type: 'STRING', enum: ['clear', 'conditional', 'unclear'] },
    summary: { type: 'STRING' },
    requiredActions: { type: 'ARRAY', items: { type: 'STRING' } },
    confidence: { type: 'INTEGER' },
  },
  required: ['classification', 'summary', 'requiredActions', 'confidence'],
}

const kycExtractSchema = {
  type: 'OBJECT',
  properties: {
    documentType: { type: 'STRING' },
    key: { type: 'STRING', enum: ['GST', 'PAN', 'CIN', 'NONE'] },
    value: { type: 'STRING' },
    confidence: { type: 'INTEGER' },
    evidence: { type: 'STRING' },
    warnings: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['documentType', 'key', 'value', 'confidence', 'evidence', 'warnings'],
}

const templateLocationSchema = {
  type: 'OBJECT',
  properties: { sheet: { type: 'STRING' }, row: { type: 'INTEGER' }, column: { type: 'INTEGER' }, label: { type: 'STRING' } },
  required: ['sheet', 'row', 'column', 'label'],
}

const templateMappingSchema = {
  type: 'OBJECT',
  properties: {
    version: { type: 'INTEGER' }, method: { type: 'STRING' }, coverSheet: { type: 'STRING' }, commercialSheet: { type: 'STRING' },
    fields: { type: 'OBJECT', properties: {
      customerName: templateLocationSchema, customerAddress: templateLocationSchema, location: templateLocationSchema,
      contactPerson: templateLocationSchema, subject: templateLocationSchema, rfqNumber: templateLocationSchema,
      project: templateLocationSchema, terms: templateLocationSchema,
    } },
    lineTable: { type: 'OBJECT', properties: {
      sheet: { type: 'STRING' }, headerRow: { type: 'INTEGER' },
      columns: { type: 'OBJECT', properties: {
        partNumber: { type: 'INTEGER' }, description: { type: 'INTEGER' }, quantity: { type: 'INTEGER' },
        unitPrice: { type: 'INTEGER' }, totalPrice: { type: 'INTEGER' },
      } },
    }, required: ['sheet', 'headerRow', 'columns'] },
    warnings: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['version', 'method', 'coverSheet', 'commercialSheet', 'fields', 'warnings'],
}

const proposalReviewSchema = {
  type: 'OBJECT',
  properties: {
    findings: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      severity: { type: 'STRING', enum: ['block', 'warning', 'info'] },
      code: { type: 'STRING' }, text: { type: 'STRING' }, evidence: { type: 'STRING' },
    }, required: ['severity', 'code', 'text', 'evidence'] } },
  },
  required: ['findings'],
}

function proposalReviewPrompt(p) {
  return `${HOUSE}

Review a manually reviewed proposal workbook against the opportunity and the
proposal data. Find semantic inconsistencies only; arithmetic and required
field checks are already supplied as LOCAL FINDINGS. Do not invent facts or
change values. Use block only for a clear identity or scope contradiction,
warning for a concern requiring human review, and info for a useful observation.
Return concise findings with evidence from a sheet name and row when possible.

OPPORTUNITY:
${cap(JSON.stringify(p.opportunity || {}), 5000)}
PROPOSAL:
${cap(JSON.stringify(p.proposal || {}), 20000)}
LOCAL FINDINGS:
${cap(JSON.stringify(p.localIssues || []), 12000)}
WORKBOOK:
${cap(JSON.stringify(p.workbook || []), 60000)}`
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
SCAN PROTOCOL:
- Inventory every supplied source before extracting. Read every supplied page,
  section and table row; never summarize a table into one representative row.
- Cite the exact attachment name plus page, section or table context in every
  field and line-item evidence. Generic evidence such as "the document" is not
  acceptable.
- Distinguish not mentioned, not readable/scan-only, and unclear/conflicting.
  Never repair an unreadable value or invent a missing quantity, location,
  part number, date or company.
- Preserve every distinct customer, EUC/EUN, plant, station, site, delivery
  location, project, part, quantity and specification reference. Select a
  primary registration value only after retaining supporting facts.
- This may be one chunk of a larger scan. The chunk metadata below identifies
  whether this is a segment or the final segment. For non-final segments,
  return facts found here but do not claim the overall enquiry is missing a
  fact merely because it is absent from this chunk.
SCAN CONTEXT:
${cap(JSON.stringify(p.chunk || { phase: 'single-source' }), 1000)}
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
person, Contact email, Contact phone, EUC/EUN/end-user identity, plant/station/
site/project/installation identity and all related location/address/city/state/
country facts (Customer); RFQ or tender reference, RFQ date, submission
mode/platform, Opp type, Opportunity scope (RFQ); delivery schedule and other
schedule dates (Schedule); payment terms, warranty, price basis, EMD/security
deposit, freight, tax and validity (Commercial); certification asks,
documentation/compliance asks (Compliance); BU and Segment (Customer); any
installed-base or known-project reference (Known Project). Return every
requested material as lineItems with one row per item, preserving description,
part number, customer reference, quantity, UOM and specifications separately.
Ask only for information absent from the complete enquiry, not absent from one
non-final chunk. For Opp type, classify procurement of physical items with part
numbers, quantities, sensors, probes, cables or spare materials as Spares, even
if the document mentions service/support in a commercial clause. Use Service
only when the requested work is labour such as maintenance, repair, calibration
or field engineering.`
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

function clarificationSuggestPrompt(p) {
  return `${HOUSE}

Propose only the clarification questions this opportunity still needs answered
before a firm proposal can be issued. Return 0-6 distinct questions. Use the
known opportunity, scope and BOQ; never ask for information already present.
Commercial deviations are handled by Sales decision, internal Approval, and a
separate Commercial Confirmation workflow. Never generate a customer
clarification for payment, delivery, warranty, freight, validity, or any other
commercial deviation.

Opportunity: ${cap(p.oppName, 300)}
Customer: ${cap(p.sellTo, 200)} · route: ${cap(p.route, 40)} · segment: ${cap(p.segment, 80)}
End user: ${cap(p.eucName, 200)} · location: ${cap(p.location, 200)}
Scope / remarks:
${cap(p.remarks, 4000)}
BoQ lines:
${cap((p.lines || []).map(l => `${l.pn || ''} ${l.desc || ''} × ${l.qty ?? ''}`).join('\n'), 6000) || '(none)'}
Commercial deviations:
${cap((p.deviations || []).map(d => `${d.term || 'Term'} — customer asks: ${d.customerAsk || 'not recorded'}; ModAE offers: ${d.ourResponse || 'not recorded'}`).join('\n'), 5000) || '(none)'}
Questions already raised (do not repeat):
${cap((p.existing || []).join('\n'), 3000) || '(none)'}
CURRENT OPPORTUNITY FIELDS (already known; do not ask for these again):
${cap(JSON.stringify(p.currentFields || {}), 6000)}

Return category as one of Technical, Commercial, Site data, or Logistics.
Each row must state the specific gap, its evidence source, and one precise
customer-facing question. Do not invent prices, dates, quantities, terms, or
technical specifications.`
}

function sparesMatchPrompt(p) {
  return `${HOUSE}

Rank the approved price-list candidates for this sourcing line. Return only candidates
from the supplied list; never invent, complete, or alter a part number. A candidate
must be technically plausible from the line description, customer reference and
part-number evidence. Use confidence below 75 when the description is generic or
the match is uncertain. Return at most 6 candidates, best first, with a concise
reason that names the matching evidence. An AI suggestion is not a confirmation.

CURRENT SOURCING LINE:
${cap(JSON.stringify(p.line || {}), 3000)}

APPROVED PRICE-LIST CANDIDATES:
${cap((p.candidates || []).map(c => `${c.partNumber} | ${c.description} | ${c.list} ${c.version || ''}`).join('\\n'), 30000) || '(none)'}

Return an empty matches array when no candidate is reasonably supported.`
}

function clarificationAnswerPrompt(p) {
  return `${HOUSE}

Check the customer's reply against EVERY open clarification question for this
opportunity. Preserve each question ID exactly. Do not infer, combine, or invent
information. Return one row for every open question, even when it is unanswered.
Use status exactly as follows: Answered means the reply and/or an attached file
fully answers the question; Needs review means it provides only part of the
answer or refers to an attachment that is missing/unreadable; Unanswered means
there is no useful answer. Put the useful customer text in response, list the
specific missing details in missing, and cite the email body or attachment name
in evidence. A partial BOQ without part numbers or without all requested lines
must be Needs review, not Answered. A system-configuration question is not fully
answered by only giving the application or RPM. “See attached BOM” answers a
part-number question only when the BOM is actually present and readable.

When an answered question contains requested spares or BOQ details, also return
lineItems with one object per customer-requested part: exact partNumber, concise
description, numeric qty, uom (normally EA), and evidence. Do not put prices in
lineItems. Return an empty lineItems array when no requested parts are supplied.

For a fully answered question, map the answer to at most one Opportunity field
only when the reply explicitly supplies that field. Use only one of the allowed
field keys supplied below. Return empty fieldKey, fieldValue and fieldEvidence
when no safe mapping exists. Never map a technical part number or price into a
general Opportunity field. Use additionalCustomerInformation only for explicit
customer-provided context that does not fit a structured field; never use it for
part numbers, quantities, prices, or commercial terms. fieldValue must be the
exact supported value. The salesperson will review and confirm the mapping.

Opportunity: ${cap(p.oppName, 300)} · customer: ${cap(p.customer, 200)}
From: ${cap(p.from, 300)}
Subject: ${cap(p.subject, 300)}
Received: ${cap(p.receivedAt, 40)}
EMAIL BODY:
${cap(p.body, 30000)}

ATTACHMENTS:
${cap((p.attachments || []).map(a => `--- ${a.name} ---\n${a.text || '(no text extracted)'}`).join('\n\n'), 60000) || '(none)'}

OPEN QUESTIONS:
${cap((p.questions || []).map(q => `${q.id}: ${q.question} [${q.category || ''}]`).join('\n'), 12000) || '(none)'}

ALLOWED OPPORTUNITY FIELDS:
${cap((p.fieldOptions || []).map(f => `${f.key}: ${f.label}`).join('\n'), 4000) || '(none)'}
CURRENT OPPORTUNITY VALUES:
${cap(JSON.stringify(p.currentFields || {}), 6000)}`
}

function proposalEmailPrompt(p) {
  return `${HOUSE}

Draft a professional medium-length customer email for sending an approved
Techno-Commercial Proposal. Use a polite Indian industrial B2B tone. Return
structured fields only; the application will assemble the final email.

Return exactly these fields:
- greeting: "Dear [customer] Team," or "Dear Sir/Madam,"
- purpose: one sentence identifying the approved proposal, opportunity reference,
  and revision.
- attachments: one sentence naming only the supplied attachment filenames or
  accurately describing the supplied proposal and ModAE standard terms.
- validityAndNextStep: one or two sentences stating the supplied validity and
  asking the customer to review and confirm whether the offer meets requirements.
- clarification: one polite sentence offering clarification on the proposal,
  scope, or commercial terms.
- signoff: "Best regards,\\n[sender name]"

The final assembled email must be 100–150 words, use blank lines between
sections, and contain no Markdown, HTML, headings, bullets, filler, repetition,
or unsupported claims. Do not invent prices, delivery dates, quantities,
commitments, technical claims, or attachment names. Use only supplied facts.

OPPORTUNITY: ${cap(p.oppName, 300)} (${cap(p.oppId, 100)})
CUSTOMER: ${cap(p.customer, 300)}
ROUTE: ${cap(p.route, 100)}
REVISION: ${cap(p.revision, 50)}
VALIDITY: ${cap(p.validity, 200)}
SENDER: ${cap(p.senderName, 200)}
ATTACHMENTS:
${cap((p.attachments || []).join('\n'), 4000) || '(none supplied)'}
TERMS:
${cap((p.terms || []).map(t => `${t.term || 'Term'}: ${t.ourResponse || t.customerAsk || t.status || ''}`).join('\n'), 6000) || 'No special terms supplied.'}`
}

function emailProofreadPrompt(p) {
  return `${HOUSE}

Proofread the manually written customer email below. Correct grammar, spelling,
punctuation, spacing, and professional tone for an Indian industrial B2B email.
Do not rewrite the meaning. Preserve every proposal ID, revision, date, price,
quantity, validity period, attachment reference, recipient reference, and
commercial term exactly. Do not add, remove, or invent facts. Return only the
corrected plain-text email body, including its existing greeting and sign-off.

PROPOSAL ID: ${cap(p.oppId, 100)}
REVISION: ${cap(p.revision, 50)}
CUSTOMER: ${cap(p.customer, 300)}
VALIDITY: ${cap(p.validity, 200)}
SENDER: ${cap(p.senderName, 200)}

EMAIL TO PROOFREAD:
${cap(p.body, 30000)}`
}

function inlineParts(payload) {
  return Array.isArray(payload?.aiAttachments)
    ? payload.aiAttachments
      .filter(a => a && typeof a.dataBase64 === 'string' && typeof a.mimeType === 'string')
      .slice(0, 8)
      .map(a => ({ inlineData: { mimeType: String(a.mimeType).slice(0, 100), data: a.dataBase64 } }))
    : []
}

function conditionEvidencePrompt(p) {
  return `${HOUSE}

Inspect the supplied file as evidence for a human approval-condition review.
Compare only what is visibly supported by the file with the condition and the
person's incorporation note. Do not decide whether the condition is approved,
do not invent unreadable details, and state when the image is unclear. Return
Supports only when the image materially supports the note; otherwise use Does
not support or Inconclusive. Keep evidence and concerns concise.

CONDITION: ${cap(p.conditionText, 2000)}
INCORPORATION NOTE: ${cap(p.incorporationNote, 2000)}`
}

function approvalCommentPrompt(p) {
  return `${HOUSE}

Review an approver's decision comment for an internal approval request.
Classify the comment only; do not make the approval decision.

Use "conditional" when the comment says approval depends on a correction,
document, value, confirmation, or other future action. Use "clear" when the
comment is a normal unconditional approval or rejection note. Use "unclear"
when the meaning cannot be determined safely.

For a conditional or rejection comment, extract short, actionable correction
items. Do not invent work that is not stated. If there are no separate actions,
use the original meaning as one action. Return concise plain language.

DECISION: ${cap(p.decision, 30)}
COMMENT:
${cap(p.comment, 5000)}`
}

function kycExtractPrompt(p) {
  return `${HOUSE}

Inspect the supplied KYC document for the requested document item. Extract only
the identity value visibly supported by the document. Never invent or repair a
partially readable value. Return key NONE and an empty value when the document
does not contain the requested identity value. A scan is evidence for human
review, not proof of authenticity or automatic approval.

REQUESTED ITEM: ${cap(p.item, 200)}
EXPECTED KEY: ${cap(p.key, 20)}
EXTRACTED TEXT (may be empty for an image or scanned PDF):
${cap(p.text, 30000) || '(none — inspect the supplied document image/PDF)'}

Return the exact value, concise evidence, confidence from 0 to 100, and warnings
for unreadable text, mismatch, multiple values, or a document that appears to
be the wrong type.`
}

function templateMappingPrompt(p) {
  return `${HOUSE}

You are mapping a customer-facing Excel proposal template to WinTrack fields.
Use only the supplied workbook rows. Sheet, row and column indexes are zero-based.
Detect meaning from labels even when sheet names and visual layout are different.
For cover fields, return the semantic label cell; WinTrack writes the live value
into the adjacent value cell. For line tables, return the header row and columns.
Do not change the workbook design, logo, formatting, formulas or values.
Return only mapping JSON. Do not invent sheets or fields. Add concise warnings
for fields or tables that cannot be identified.

WORKBOOK SUMMARY:
${cap(JSON.stringify(p.workbook || []), 50000)}

DETERMINISTIC STARTING MAPPING:
${cap(JSON.stringify(p.deterministic || {}), 12000)}

${cap(p.instructions, 1000)}`
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
  const requestedModel = String(input.model || '')
  const model = /^gemini-[\w.-]+$/.test(requestedModel)
    ? (MODEL_ALIASES[requestedModel] || requestedModel)
    : DEFAULT_MODEL
  if (!['health', 'lead.extract', 'lead.fill', 'vendor.quote', 'email.proposal', 'email.proofread', 'clarification.suggest', 'spares.match', 'clarification.answer', 'approval.condition-evidence', 'approval.comment-review', 'kyc.extract', 'template.map', 'proposal.review'].includes(task)) {
    return fail(res, 400, 'AI_BAD_REQUEST', `Unsupported task: ${task}`)
  }

  const prompt = task === 'health' ? 'Reply with the single word: ok'
    : task === 'lead.fill' ? fillPrompt(payload)
      : task === 'vendor.quote' ? vendorQuotePrompt(payload)
          : task === 'email.proposal' ? proposalEmailPrompt(payload)
            : task === 'email.proofread' ? emailProofreadPrompt(payload)
              : task === 'clarification.suggest' ? clarificationSuggestPrompt(payload)
              : task === 'spares.match' ? sparesMatchPrompt(payload)
              : task === 'clarification.answer' ? clarificationAnswerPrompt(payload)
                    : task === 'approval.condition-evidence' ? conditionEvidencePrompt(payload)
                      : task === 'approval.comment-review' ? approvalCommentPrompt(payload)
                    : task === 'kyc.extract' ? kycExtractPrompt(payload)
                      : task === 'template.map' ? templateMappingPrompt(payload)
                    : task === 'proposal.review' ? proposalReviewPrompt(payload)
                  : leadPrompt(payload)
  const requestBody = {
    contents: [{ parts: [{ text: prompt }, ...(['lead.extract', 'approval.condition-evidence', 'kyc.extract'].includes(task) ? inlineParts(payload) : [])] }],
    generationConfig: ['lead.extract', 'lead.fill', 'vendor.quote', 'email.proposal', 'email.proofread', 'clarification.suggest', 'spares.match', 'clarification.answer', 'approval.condition-evidence', 'approval.comment-review', 'kyc.extract', 'template.map', 'proposal.review'].includes(task)
      ? {
          responseMimeType: 'application/json',
          responseSchema: task === 'lead.fill' ? fillSchema
            : task === 'vendor.quote' ? vendorQuoteSchema
              : task === 'email.proposal' ? emailProposalSchema
                : task === 'email.proofread' ? emailProofreadSchema
                  : task === 'clarification.suggest' ? clarificationSuggestSchema
                  : task === 'spares.match' ? sparesMatchSchema
                  : task === 'clarification.answer' ? clarificationAnswerSchema
                  : task === 'approval.condition-evidence' ? conditionEvidenceSchema
                    : task === 'approval.comment-review' ? approvalCommentSchema
                    : task === 'kyc.extract' ? kycExtractSchema
                      : task === 'template.map' ? templateMappingSchema
                      : task === 'proposal.review' ? proposalReviewSchema
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
