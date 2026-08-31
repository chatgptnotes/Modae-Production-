// WinTrack AI proxy — the only place a Gemini credential exists.
//
// The browser posts { task, payload } and never a prompt: prompts and response
// schemas live here, so they can be tuned with a function redeploy instead of
// an app rebuild, and the endpoint can't be used as a general-purpose LLM proxy.
//
//   supabase secrets set GEMINI_API_KEY=...
//   supabase functions deploy ai --no-verify-jwt
//
// --no-verify-jwt matches the anon-key posture the prototype already documents
// in supabase-setup.sql — there is no per-user Supabase auth in this app.

const API = 'https://generativelanguage.googleapis.com/v1beta/models'
const FLASH = 'gemini-2.5-flash'   // fast path: drafting, suggestions
const PRO = 'gemini-pro-latest'    // hard extraction: leads, tender specs

const ENV_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
import { decryptAiSecret } from '../_shared/aiSecret.ts'
const admin = SUPABASE_URL && SERVICE_ROLE_KEY
  ? (await import('https://esm.sh/@supabase/supabase-js@2')).createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  : null

const getKey = async () => {
  if (admin) {
    const { data, error } = await admin.from('ai_secrets').select('ciphertext,iv').eq('name', 'gemini_api_key').maybeSingle()
    if (!error && data?.ciphertext && data?.iv) {
      try { return await decryptAiSecret(data.ciphertext, data.iv, SERVICE_ROLE_KEY) } catch (e) { console.error('AI secret decrypt failed', e) }
    }
  }
  return ENV_KEY
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

// ---------------------------------------------------------------------------
// Shared prompt context. ModAE sells vibration / condition-monitoring hardware
// and services (Meggitt VM600, VibroSight, Brüel & Kjær), so the model needs
// enough domain framing to read a part-number list as a part-number list.
const HOUSE = `
You are the extraction and drafting engine inside WinTrack, the sales system of
ModAE India Pvt Ltd — a supplier of vibration and condition-monitoring systems
(Meggitt VM600 racks, MPC4/CPU modules, VibroSight software, proximity probes,
accelerometers, velocity sensors, Brüel & Kjær instrumentation) plus related
engineering services.

Opportunity routes are exactly: Spares, Service, Project.
Customer categories are: OEM, EUC, EUC/OEM, ACP, SI, RE/TR, EPC.

Rules you must follow:
- Extract only what the source supports. Never invent a part number, a price, a
  quantity, a date or a company name.
- Confidence is an honest 0-100 integer. Use a value below 75 whenever the
  source is ambiguous, conflicting or silent — a human reviews everything below
  that threshold, so under-confidence is cheap and over-confidence is not.
- Evidence must quote or name the exact place in the source the value came from.
- Write in the plain, direct register of Indian industrial B2B correspondence.
  No marketing language, no emoji.
`.trim()

const cap = (s: unknown, n: number) => String(s ?? '').slice(0, n)

// Gemini's schema dialect is the OpenAPI subset: uppercase type names.
const STR = { type: 'STRING' }
const INT = { type: 'INTEGER' }
const arrOf = (items: unknown) => ({ type: 'ARRAY', items })

// ---------------------------------------------------------------------------
type Task = {
  model: string
  schema?: unknown
  build: (p: Record<string, any>) => string
}

const TASKS: Record<string, Task> = {
  // Health check for the Admin page's "Test connection" button.
  health: {
    model: FLASH,
    build: () => 'Reply with the single word: ok',
  },

  // ---- Inbox: raw inbound mail → the lead.ai structure the UI already renders
  'lead.extract': {
    model: PRO,
    schema: {
      type: 'OBJECT',
      properties: {
        summary: STR,
        route: { type: 'STRING', enum: ['Spares', 'Service', 'Project', 'Mixed'] },
        urgency: { type: 'STRING', enum: ['Low', 'Normal', 'Urgent'] },
        completeness: INT,
        suggestedOwner: STR,
        lineItems: arrOf({
          type: 'OBJECT',
          properties: { description: STR, partNumber: STR, customerRef: STR, qty: { type: 'NUMBER' }, uom: STR, confidence: INT, evidence: STR },
          required: ['description', 'qty', 'confidence', 'evidence'],
        }),
        fields: arrOf({
          type: 'OBJECT',
          properties: {
            group: { type: 'STRING', enum: ['Customer', 'RFQ', 'Known Project'] },
            k: STR, v: STR, conf: INT, ev: STR, note: STR,
          },
          required: ['group', 'k', 'v', 'conf', 'ev'],
        }),
        missing: arrOf(STR),
        next: arrOf(STR),
      },
      required: ['summary', 'route', 'urgency', 'completeness', 'fields', 'lineItems', 'missing', 'next'],
    },
    build: p => `${HOUSE}

Read this inbound sales enquiry and extract it for human review.

FROM: ${cap(p.from, 200)}
SUBJECT: ${cap(p.subject, 300)}
ATTACHMENTS: ${cap((p.attachments || []).map((a: any) => `${a.name} (${a.pages ?? '?'}p)`).join(', '), 500) || 'none'}
BODY:
${cap(p.body, 20000)}

ATTACHMENT CONTENTS (read these as part of the enquiry — the line items usually
live here, not in the covering mail; cite the file name in ev for any fact taken
from one):
${cap((p.attachments || []).map((a: any) =>
  `--- ${a.name} ---\n${a.text || '(no text extracted — do not infer its contents)'}`).join('\n\n'), 40000) || 'none'}

Customers already in our master (match against these before proposing a new name):
${cap((p.customers || []).join(', '), 3000)}

Ownership routing rules (pick suggestedOwner from these):
${cap((p.ownershipRules || []).map((r: any) => `${r.region} → ${r.owner}`).join('\n'), 1000)}

Produce:
- summary: 2-3 sentences a salesperson can act on, naming what is being asked for
  and what blocks pricing it.
- fields: the extractable facts, grouped. Always attempt Sell-to customer,
  Category, Contact, Opp type, Line items, BU / Segment. Add a "Known Project"
  entry for any installed base named in the mail. If the source contradicts
  itself, add a field naming the conflict with a confidence below 75 and a note.
- completeness: 0-100, how much of what we need to quote is actually present.
- lineItems: one row for every requested material or spare, with description,
  partNumber/customerRef when present, quantity, UOM, confidence and evidence.
- missing: the specific information we must ask the customer for.
- next: 2-4 concrete next actions for the salesperson.`,
  },

  // ---- Inbox: the lead-stage clarification / pre-quote-fee mail body.
  //
  // Drafting only. The model never sends: the browser puts this text in an
  // editable field and a human opens the compose window and submits it. That
  // is the 20 Aug decision — an automated send risks putting wrong information
  // in front of a customer. Keep it that way; do not add a dispatch task here.
  //
  // Distinct from 'email.clarification', which writes against a registered
  // opportunity with a priced BoQ behind it. This one has only the raw enquiry.
  'lead.clarify': {
    model: FLASH,
    build: p => `${HOUSE}

Write the body of an email to a prospective customer at the lead stage.
Plain text, no subject line, no markdown, no placeholders in square brackets.
Open with "${cap(p.salutation, 80) || 'Dear Sir,'}" and close with the sender
block given below, exactly as given.

${p.kind === 'quote-fee'
  ? `PURPOSE: this is an Amber-class customer. Thank them for the enquiry, note
that ModAE India is the authorized distributor for B&K Vibro, ask for the
compliance documents listed below, and state that a pre-quote processing and
administrative fee of ${cap(p.feeText, 40)} applies before the quotation is
prepared and is fully adjustable against the final order value if a Purchase
Order is placed within the quotation's validity. Ask them to confirm so a
Proforma Invoice can be issued.

Documents to ask for:`
  : `PURPOSE: the enquiry is missing information we need before we can quote.
Thank them for the RFQ, say the offer and the signed technical compliance sheet
are being prepared, and ask for the details listed below so the proposed
solution suits their application. Close by saying we will submit the offer as
soon as the details arrive.

Details to ask for:`}
${cap((p.items || []).map((q: string, i: number) => `${i + 1}. ${q}`).join('\n'), 6000)}

Enquiry subject: ${cap(p.subject, 300)}
Customer: ${cap(p.sellTo, 200)} · contact: ${cap(p.contactPerson, 200)}
Enquiry body (for context only — do not quote it back):
${cap(p.body, 6000)}

Ask for every listed item and nothing else. Do not invent a part number, a
price, a delivery date or a specification. Keep it under 220 words.

Sender block:
${cap(p.senderBlock, 600)}`,
  },

  // ---- Workbench: gap-specific clarification questions
  'clarification.suggest': {
    model: FLASH,
    schema: {
      type: 'OBJECT',
      properties: {
        rows: arrOf({
          type: 'OBJECT',
          properties: { category: STR, gap: STR, q: STR, evidence: STR },
          required: ['category', 'gap', 'q', 'evidence'],
        }),
      },
      required: ['rows'],
    },
    build: p => `${HOUSE}

Propose the clarification questions this opportunity still needs answered before
a firm proposal can be issued. 3-6 questions, each addressing a distinct gap.

Opportunity: ${cap(p.oppName, 300)}
Customer: ${cap(p.sellTo, 200)} · route: ${cap(p.route, 40)} · segment: ${cap(p.segment, 80)}
End user: ${cap(p.eucName, 200)} · location: ${cap(p.location, 200)}
Scope / remarks:
${cap(p.remarks, 4000)}
BoQ lines so far:
${cap((p.lines || []).map((l: any) => `${l.pn || ''} ${l.desc || ''} × ${l.qty ?? ''}`).join('\n'), 6000) || '(none priced yet)'}
Questions already raised (do not repeat these):
${cap((p.existing || []).join('\n'), 3000) || '(none)'}

category is one of: Technical, Commercial, Site data, Logistics.
gap names what is missing; evidence names where that gap shows up; q is the
question as it would be written to the customer.`,
  },

  // ---- Workbench: clarification email body
  'email.clarification': {
    model: FLASH,
    build: p => `${HOUSE}

Write the body of an email to the customer asking for the outstanding
clarifications on this enquiry. Plain text, no subject line, no markdown.
Open with "Dear Sir," and close with the sender block given below.
Number the questions. Do not ask for anything already answered.

Opportunity: ${cap(p.oppName, 300)}
Customer: ${cap(p.sellTo, 200)} · contact: ${cap(p.contactPerson, 200)}
Route: ${cap(p.route, 40)}
Open questions to cover:
${cap((p.questions || []).map((q: string, i: number) => `${i + 1}. ${q}`).join('\n'), 6000)}

Sender block:
${cap(p.senderName, 120)}
ModAE India Pvt Ltd`,
  },

  // ---- Workbench: follow-up on an ageing quote
  'email.followup': {
    model: FLASH,
    build: p => `${HOUSE}

Write the body of a polite follow-up email on a quotation that has had no
response. Plain text, no subject line, no markdown. Open with "Dear Sir," and
close with the sender block. Keep it under 150 words. Reference the quote and
its validity, offer to revise or clarify, and propose one concrete next step.
Do not discount, do not invent commercial terms.

Opportunity: ${cap(p.oppName, 300)}
Customer: ${cap(p.sellTo, 200)} · contact: ${cap(p.contactPerson, 200)}
Quote: ${cap(p.quoteRef, 120)} · sent ${cap(p.sentOn, 40)} · ${cap(p.ageDays, 10)} days ago
Validity: ${cap(p.validity, 80)}
Previous contact:
${cap((p.history || []).join('\n'), 3000) || '(no logged replies)'}

Sender block:
${cap(p.senderName, 120)}
ModAE India Pvt Ltd`,
  },

  // ---- TenderIntake: spec text → the fields the rule-based parser missed.
  // Shaped to merge over parseTender()'s output, so the deterministic read
  // stays authoritative wherever it succeeded.
  'tender.extract': {
    model: PRO,
    schema: {
      type: 'OBJECT',
      properties: {
        header: {
          type: 'OBJECT',
          properties: {
            buyer: STR, station: STR, subject: STR, sectionRef: STR, signatory: STR,
            location: STR, contactPerson: STR, contactPhone: STR,
            deliveryPeriod: STR, validity: STR, paymentTerms: STR,
            // The proposal's covering letter quotes the RFQ number and its date
            // back to the buyer, and the proposal is emailed to whoever sent the
            // enquiry. Without these the regex parser was the only source, and
            // the AI could not fill the gap when it missed.
            rfqDate: STR, senderEmail: STR,
          },
        },
        // Enumerated because the review screen renders these as dropdowns; the
        // client re-checks them against the app's own lists regardless.
        guesses: {
          type: 'OBJECT',
          properties: {
            segment: {
              type: 'STRING',
              enum: ['Thermal', 'Nuclear', 'Hydro', 'Industrial', 'O&G-US', 'O&G-MS',
                'O&G-DS', 'Petrochem', 'Test Bed', 'Others'],
            },
            oppType: {
              type: 'STRING',
              enum: ['Project', 'Spares', 'Service', 'Upgrade', 'AMC', 'Training'],
            },
            bu: { type: 'STRING', enum: ['Aero', 'Energy', 'Service'] },
            category: { type: 'STRING', enum: ['EUC', 'OEM', 'EPC', 'MAC', 'SI', 'ACP', 'RE/TR'] },
            product: STR,
          },
        },
        risks: arrOf({
          type: 'OBJECT',
          properties: { clause: STR, why: STR },
          required: ['clause', 'why'],
        }),
        missing: arrOf(STR),
        notes: arrOf(STR),
      },
      required: ['header', 'guesses', 'risks', 'missing'],
    },
    build: p => `${HOUSE}

Read this tender / purchasing specification and report what it actually states.

Document: ${cap(p.filename, 200)} (${cap(p.pages, 10)} pages)

Our rule-based parser already read the following. Treat these as correct and do
NOT contradict them — your job is the fields it left blank, plus commercial risk:
${cap(JSON.stringify(p.parsed || {}), 4000)}

Document text (may be truncated):
${cap(p.text, 120000)}

Produce:
- header: leave a field as an empty string unless the document states it.
  sectionRef is the buyer's own enquiry/tender/RFQ reference. rfqDate is the
  date that enquiry carries, as YYYY-MM-DD; if the document shows only a letter
  or email date, use that. senderEmail is the address the enquiry came from, if
  the document shows one.
- guesses: pick only from the enumerated values. product must be one of
  ${cap((p.products || []).join(', '), 600) || 'the product names we sell'} —
  use "Various" when the tender spans several.
- risks: clauses that materially move price or acceptance — liquidated damages,
  warranty beyond 24 months, unusual inspection/testing, back-to-back guarantees,
  bank guarantees, penalty-linked delivery. Quote the clause, then say why it
  matters commercially in one sentence.
- missing: what we must ask the buyer before we can quote firm.
- notes: anything about the line items an estimator would want flagged.`,
  },
}

// ---------------------------------------------------------------------------
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405)
  const key = await getKey()
  if (!key) return json({ ok: false, error: 'AI is not configured on the server' }, 503)

  let body: { task?: string; payload?: Record<string, any>; model?: string }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Malformed request body' }, 400)
  }

  const task = TASKS[String(body.task ?? '')]
  if (!task) return json({ ok: false, error: `Unknown task: ${body.task}` }, 400)

  // The Admin page can pin a model; anything unrecognised falls back to the
  // task's own default rather than trusting client input into the URL.
  const model = /^gemini-[\w.-]+$/.test(String(body.model ?? '')) ? String(body.model) : task.model

  const payload = body.payload ?? {}
  const inlineParts = Array.isArray(payload.aiAttachments)
    ? payload.aiAttachments
      .filter((a: any) => a && typeof a.dataBase64 === 'string' && typeof a.mimeType === 'string')
      .slice(0, 8)
      .map((a: any) => ({ inlineData: { mimeType: String(a.mimeType).slice(0, 100), data: a.dataBase64 } }))
    : []
  const req_ = {
    contents: [{ parts: [{ text: task.build(payload) }, ...inlineParts] }],
    generationConfig: task.schema
      ? { responseMimeType: 'application/json', responseSchema: task.schema }
      : {},
  }

  let res: Response
  try {
    res = await fetch(`${API}/${model}:generateContent`, {
      method: 'POST',
      headers: {
        ...(key.startsWith('ya29.') ? { Authorization: `Bearer ${key}` } : { 'x-goog-api-key': key }),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req_),
    })
  } catch (e) {
    console.error('gemini fetch failed', e)
    return json({ ok: false, error: 'Could not reach the model' }, 502)
  }

  // Never echo the upstream body — it can contain the credential.
  if (!res.ok) {
    console.error('gemini error', res.status, (await res.text()).slice(0, 500))
    return json({ ok: false, error: `Model returned ${res.status}` }, 502)
  }

  const out = await res.json()
  const text = out?.candidates?.[0]?.content?.parts
    ?.map((x: any) => x?.text ?? '').join('') ?? ''
  if (!text) {
    const reason = out?.candidates?.[0]?.finishReason ?? 'empty response'
    return json({ ok: false, error: `No output from the model (${reason})` }, 502)
  }

  if (!task.schema) return json({ ok: true, model, text })

  try {
    return json({ ok: true, model, data: JSON.parse(text) })
  } catch {
    return json({ ok: false, error: 'Model returned malformed JSON' }, 502)
  }
})
