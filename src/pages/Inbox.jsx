import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore, nextOppId } from '../store.jsx'
import { ddMmmYY, ageDays, gmailComposeHref } from '../utils.js'
import { Icon } from '../icons.jsx'
import { useDrawer } from '../drawer.jsx'
import { Chip, ConfChip, WarnBox, ErrBox, Modal } from '../ui.jsx'
import { ROLES, OWNERS, OPP_TYPES, BUS, SEGMENTS, PRODUCTS, CUSTOMER_STATUSES, LEAD_SOURCES, ownerForOppType, routeForType, newProposal } from '../seed.js'
import { isAdminRole, isApprover } from '../utils.js'
import { aiEnabled, runTaskResult, runText } from '../ai.js'
import { extractDocText } from '../docText.js'
import { fmtSize } from '../filestore.js'
import { hold, add as holdMore } from '../leadFiles.js'
import { listFiles } from '../leadBlobs.js'
import AttachmentViewer from '../AttachmentViewer.jsx'
import { findDuplicates } from '../insights.js'
import { leadWorkflow } from '../leadWorkflow.js'
import { parseLeadLineItems } from '../tenderParse.js'
import { deterministicLeadRoute, leadTextChunks, mergeLeadResults } from '../leadExtraction.js'
import { buildLeadProposalData } from '../leadBoq.js'
import { isFastTrackLead, routeOwner, supplyMissing } from '../leadRules.js'
import { INDIA_LOCATION_GROUPS, indiaLocation, indiaRegionForLocation } from '../indiaLocations.js'
import { PROJECT_TYPES, oppTypesForProjectType, templatesForSelection, simulatedLead, simulatedCount, SIMULATED_CUSTOMER_SCENARIOS } from '../simulatedLeads.js'
import {
  QUOTE_FEE_DOCUMENTS, answeredPatch, clarificationItems, clarificationKindFor,
  clarificationSender, draftClarification, draftPatch, senderLabel, sentPatch,
} from '../leadClarification.js'
import { BLUE_KYC_ITEMS, leadVerificationComplete, verificationDeadline, verificationItem, redClearanceFor, isRedCleared } from '../leadVerification.js'
// Common-mailbox lead inbox: AI parses each inquiry, a human decides whether it
// becomes an opportunity (Qualify → registration / intake form) or is dropped.
const PILL = { New: 'Blue', Qualified: 'Amber', Dropped: 'Red', Converted: 'Green' }
const STATUS_OPTIONS = ['New', 'Qualified', 'Converted', 'Dropped']
const ROUTE_OPTIONS = ['Project', 'Spares', 'Service']
const CUSTOMER_CATEGORY_OPTIONS = ['OEM', 'EUC', 'EUC/OEM', 'ACP', 'SI', 'RE/TR', 'EPC', 'Trader']
const DROP_REASONS = ['Outside business scope', 'Window shopping / budgetary only',
  'Duplicate inquiry', 'No response from customer', 'Other']

const receivedTime = ts => {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
}

// Disqualifying and reverting both need a written reason. Biji, 13 Aug: "there
// has to be a place for me to write the reason why you're trying to disqualify."
// The category alone was pre-selected, so Confirm always succeeded and the
// record never said why. Both lead panels use this one component, so the rule
// cannot drift between them.
function ReasonBox({ title, categories, confirmLabel, tone = '', onConfirm, onCancel }) {
  const [category, setCategory] = React.useState(categories ? categories[0] : '')
  const [note, setNote] = React.useState('')
  const ready = note.trim().length > 0
  return (
    <div className="reason-box">
      <div className="q-label">{title}</div>
      {categories && (
        <select value={category} onChange={e => setCategory(e.target.value)}>
          {categories.map(r => <option key={r}>{r}</option>)}
        </select>
      )}
      <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
        placeholder="Why? This is recorded against the lead and shown in the audit trail." />
      <div className="toolbar" style={{ margin: 0 }}>
        <button className={tone} disabled={!ready} title={ready ? undefined : 'A written reason is required'}
          onClick={() => onConfirm(category, note.trim())}>{confirmLabel}</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

const confClass = c => (c >= 0.9 ? 'hi' : c >= 0.6 ? 'med' : 'lo')
const confLabel = c => (c >= 0.9 ? 'High' : c >= 0.6 ? 'Medium' : 'Low')
const ConfBadge = ({ c }) => (
  <span className={`conf-badge ${confClass(c || 0)}`}>AI · {confLabel(c || 0)}</span>
)

// ---------------------------------------------------------------------------
// Gemini extraction (task 'lead.extract', see supabase/functions/ai/index.ts).
// The model returns the lead.ai shape the three-panel view already renders; we
// only stamp state:'pending' on each field, because "AI proposes, humans decide"
// is enforced by that state — nothing is accepted until someone accepts it.
export async function extractLead({ from, subject, body, attachments = [], aiAttachments = [] }, store) {
  const attachmentText = (attachments || [])
    .filter(a => a.text?.trim())
    .map(a => `Attachment: ${a.name}\n${a.text}`)
    .join('\n\n')
  const attachmentHasSpecs = /specification|part\s*code|short\s*description|parameters|make\s*:/i.test(attachmentText)
  const attachmentHasQuantity = /\b(?:quantity|qty|quantities)\b|\b\d+\s*(?:nos?|pcs?|pieces?|sets?|ea)\b/i.test(attachmentText)

  const chunks = leadTextChunks(body, attachments)
  const common = {
    from, subject,
    customers: (store.customers || []).map(c => c.name),
    ownershipRules: store.config?.ownershipRules || [],
  }
  const fallback = store.config?.aiModel?.provider === 'Built-in fallback'
  const results = []
  let aiResult = { error: '' }
  if (chunks.length) {
    for (const chunk of chunks) {
      aiResult = await runTaskResult('lead.extract', {
        ...common,
        body: chunk.source === 'Email body' ? chunk.text : '',
        attachments: chunk.source === 'Email body' ? [] : [{ name: chunk.source.replace(/^Attachment: /, ''), text: chunk.text }],
        aiAttachments: chunk.index === 0 ? aiAttachments : [],
        chunk: { source: chunk.source, index: chunk.index, total: chunk.total },
      }, { fallback })
      if (aiResult.data?.data) results.push(aiResult.data.data)
    }
  } else {
    aiResult = await runTaskResult('lead.extract', { ...common, body, attachments, aiAttachments }, { fallback })
    if (aiResult.data?.data) results.push(aiResult.data.data)
  }
  const ai = mergeLeadResults(results)
  // The proxy is optional in demo/staging builds. Keep the intake usable when
  // it is absent or temporarily unavailable: preserve only facts present in
  // the pasted mail and leave the lead visibly pending human structure.
  if (!ai?.fields?.length) {
    const text = `${subject || ''}\n${body || ''}\n${attachmentText}`
    const lower = text.toLowerCase()
    const route = /spare|sensor|probe|cable|replacement|part number/.test(lower)
      ? 'Spares'
      : /service|repair|maintenance|amc|troubleshoot/.test(lower)
        ? 'Service'
        : 'Project'
    const fields = []
    if (from?.trim()) fields.push({ group: 'Customer', k: 'Sender', v: from.trim(), conf: 45, ev: 'From address', note: 'Confirm the customer and contact person.' })
    if (subject?.trim()) fields.push({ group: 'RFQ', k: 'Subject', v: subject.trim(), conf: 55, ev: 'Email subject', note: 'Confirm the opportunity name and route.' })
    if (body?.trim()) fields.push({ group: 'RFQ', k: 'Email body', v: body.trim().slice(0, 2000), conf: 35, ev: 'Email body', note: 'Fallback preview; the complete source is retained separately. Structure the requested scope and quantities.' })
    if (attachmentText) fields.push({ group: 'RFQ', k: 'Attachment content', v: attachmentText.slice(0, 4000), conf: 45, ev: 'Attached document content', note: 'Fallback preview; the complete source is retained separately. Confirm the scope, quantities and specifications.' })
    const missing = ['Customer name', 'Opportunity scope', 'Required quantities and specifications']
    const lineItems = parseLeadLineItems(`${body || ''}\n${attachmentText}`)
    if (attachmentText) missing.splice(missing.indexOf('Opportunity scope'), 1)
    if (attachmentHasSpecs) {
      const i = missing.indexOf('Required quantities and specifications')
      if (i >= 0) missing.splice(i, 1)
      if (!attachmentHasQuantity) missing.push('Required quantities')
    }
    return {
      route,
      urgency: 'Normal',
      completeness: fields.length ? 20 : 0,
      suggestedOwner: ownerForOppType(route === 'Spares' ? 'Spares' : route === 'Service' ? 'Service' : 'Project'),
      ai: {
        summary: `AI extraction was unavailable${aiResult.error ? `: ${aiResult.error}` : ''}. The original enquiry was saved for manual structuring.`,
        fields: fields.map(f => ({ ...f, state: 'pending' })),
        lineItems,
        missing,
        duplicates: [],
        next: ['Confirm the customer and opportunity route', 'Structure the requested scope', 'Add missing quantities and specifications'],
        scan: { chunks: chunks.length || 1, completed: 0, complete: false },
      },
    }
  }
  const sourceRoute = deterministicLeadRoute(body, attachments)
  const resolvedRoute = sourceRoute || ai.route || 'Spares'
  const owner = ROLES[ai.suggestedOwner]?.sales
    ? ai.suggestedOwner
    : ownerForOppType(resolvedRoute === 'Spares' ? 'Spares' : resolvedRoute === 'Service' ? 'Service' : 'Project')
  const resolvedFields = ai.fields.map(f => {
    if (!/^(opp type|opportunity type)$/i.test(f.k) || !sourceRoute) return f
    return {
      ...f, v: sourceRoute, conf: Math.max(Number(f.conf) || 0, 98),
      ev: `${f.ev || 'Email or attachment'}; deterministic physical-scope check`,
      note: [f.note, `Resolved as ${sourceRoute} from the source scope.`].filter(Boolean).join(' '),
    }
  })
  return {
    route: resolvedRoute,
    urgency: ai.urgency || 'Normal',
    completeness: Math.max(0, Math.min(100, Math.round(ai.completeness ?? 0))),
    suggestedOwner: owner,
    ai: {
      summary: ai.summary || '',
      fields: resolvedFields.map(f => ({ ...f, conf: Math.max(0, Math.min(100, Math.round(f.conf ?? 0))), state: 'pending' })),
      lineItems: (Array.isArray(ai.lineItems) && ai.lineItems.length
        ? ai.lineItems
        : parseLeadLineItems(`${body || ''}\n${attachmentText}`)).map(x => ({
          description: x.description || x.desc || x.partNumber || '',
          partNumber: x.partNumber || x.pn || '',
          customerRef: x.customerRef || x.partNumber || x.pn || '',
          qty: Number(x.qty) || 1, uom: x.uom || 'EA',
          confidence: Math.max(0, Math.min(100, Math.round(x.confidence ?? x.conf ?? 0))),
          evidence: x.evidence || 'Inbound email or attachment',
        })),
      missing: ai.missing || [],
      duplicates: [],
      next: ai.next || [],
      scan: { chunks: chunks.length || 1, completed: results.length, complete: results.length === (chunks.length || 1) },
    },
  }
}

// Attachment text kept on the lead — the store persists to localStorage, so the
// whole document is not carried; this is enough for the AI and for evidence.
const TEXT_PER_FILE = 12000
const TEXT_TOTAL = 60000
const AI_FILE_BYTES = 4 * 1024 * 1024
const AI_TOTAL_BYTES = 8 * 1024 * 1024

function LeadVerification({ lead, customerStatus, store }) {
  const [busy, setBusy] = useState('')
  const [pendingUpload, setPendingUpload] = useState(null)
  const verification = lead.verification || {}
  const editable = !['Converted', 'Dropped'].includes(lead.status)
  const deadline = verificationDeadline(lead, customerStatus, store.config)
  const dateLabel = value => value
    ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—'
  const deadlineLabel = deadline
    ? deadline.expired ? 'Overdue' : `${deadline.remaining} day${deadline.remaining === 1 ? '' : 's'} remaining`
    : ''

  const saveKyc = async (item, file, mode) => {
    setBusy(item)
    let fileMeta = {}
    if (file) {
      const rec = await readAttachment(file)
      fileMeta = { file: rec.name, size: rec.size, pages: rec.pages || 0 }
      holdMore(lead.id, [file])
      store.updateLead(lead.id, {
        attachments: [...(lead.attachments || []), fileMeta],
      }, `KYC document attached: ${item}`)
    }
    const itemRecord = {
      state: 'Verified', mode, verifiedAt: new Date().toISOString(), ...fileMeta,
    }
    const nextKyc = { ...(verification.kyc || {}), [item]: itemRecord }
    const complete = BLUE_KYC_ITEMS.every(name => nextKyc[name]?.state === 'Verified')
    store.updateLead(lead.id, {
      verification: {
        ...verification,
        kyc: nextKyc,
        kycVerifiedAt: complete ? (verification.kycVerifiedAt || new Date().toISOString()) : '',
      },
      ...(complete ? { kycCompletedAt: verification.kycVerifiedAt || new Date().toISOString() } : {}),
    }, `${item} ${mode === 'simulated' ? 'marked verified (simulated)' : 'verified'}`)
    setBusy('')
  }

  const confirmPayment = mode => {
    const now = new Date().toISOString()
    store.updateLead(lead.id, {
      verification: { ...verification, payment: { state: 'Confirmed', mode, confirmedAt: now } },
      amberFeePaid: true,
    }, `Amber processing fee ${mode === 'simulated' ? 'marked paid (simulated)' : 'confirmed'}`)
  }

  if (customerStatus === 'Green') return (
    <div className="okbox" style={{ marginTop: 10 }}>
      Green customer — KYC and payment verification are not required.
    </div>
  )

  if (customerStatus === 'Amber') {
    const confirmed = verification.payment?.state === 'Confirmed'
    return (
      <div className="lead-decision-card" style={{ marginTop: 12 }}>
        <div className="lead-decision-head"><div><b>Amber customer — fee request</b><span>Customer pays the processing fee within 1 week</span></div>
          <span className={confirmed ? 'lead-decision-saved' : 'lead-decision-note'}>{confirmed ? 'Confirmed' : 'Pending'}</span></div>
        <div className="verification-deadline">
          <span><b>Request sent:</b> {dateLabel(deadline?.requestedAt)}</span>
          <span><b>Due:</b> {dateLabel(deadline?.dueAt)}</span>
          <span className={deadline?.expired ? 'deadline-overdue' : ''}><b>{deadlineLabel}</b></span>
        </div>
        {confirmed
          ? <div className="okbox">Customer paid the fee — confirmed at Lead stage ({verification.payment.mode === 'simulated' ? 'simulated' : 'recorded'}).</div>
          : editable && <div className="lead-decision-actions">
            <button className="primary" onClick={() => confirmPayment('simulated')}>Already paid — simulate confirmation</button>
            <button onClick={() => confirmPayment('recorded')}>Record payment received</button>
          </div>}
        {!confirmed && <p className="lead-decision-note">Registration is blocked until payment is confirmed.</p>}
      </div>
    )
  }

  if (customerStatus === 'Blue') return (
    <div className="lead-decision-card" style={{ marginTop: 12 }}>
      <div className="lead-decision-head"><div><b>Blue customer — KYC request</b><span>Customer shares KYC documents within 1 week</span></div>
        <span className={leadVerificationComplete(lead, customerStatus) ? 'lead-decision-saved' : 'lead-decision-note'}>
          {leadVerificationComplete(lead, customerStatus) ? 'Verified' : 'Pending'}
        </span></div>
      <div className="verification-deadline">
        <span><b>Request sent:</b> {dateLabel(deadline?.requestedAt)}</span>
        <span><b>Due:</b> {dateLabel(deadline?.dueAt)}</span>
        <span className={deadline?.expired ? 'deadline-overdue' : ''}><b>{deadlineLabel}</b></span>
      </div>
      <div style={{ display: 'grid', gap: 7 }}>
        {BLUE_KYC_ITEMS.map(item => {
          const row = verificationItem(verification, item)
          const pending = pendingUpload?.item === item
          return <div key={item} className="check-row">
            <Icon name={row.state === 'Verified' ? 'check' : 'fileText'} size={14} />
            <span style={{ flex: 1 }}>{item} — <b>{row.state === 'Verified' ? `Verified (${row.mode === 'simulated' ? 'simulated' : 'uploaded'})` : 'Missing'}</b></span>
            {editable && row.state !== 'Verified' && <>
              {pending
                ? <>
                  <span className="hint" title={pendingUpload.file.name}>{pendingUpload.file.name}</span>
                  <button className="primary" disabled={busy === item} onClick={async () => {
                    const file = pendingUpload.file
                    setPendingUpload(null)
                    await saveKyc(item, file, 'uploaded')
                  }}>Confirm upload</button>
                  <button disabled={busy === item} onClick={() => setPendingUpload(null)}>Cancel upload</button>
                </>
                : <>
                  <label className="button" style={{ cursor: busy === item ? 'wait' : 'pointer' }}>
                    Upload
                    <input type="file" disabled={busy === item} style={{ display: 'none' }}
                      onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) setPendingUpload({ item, file }) }} />
                  </label>
                  <button disabled={busy === item} onClick={() => saveKyc(item, null, 'simulated')}>Already uploaded — simulate verification</button>
                </>}
            </>}
          </div>
        })}
      </div>
      {!leadVerificationComplete(lead, customerStatus) && <p className="lead-decision-note">Customer KYC is not complete — Opportunity creation is blocked.</p>}
    </div>
  )

  return null
}

// One picked file → the attachment record. PDF, Word and plain-text contents
// are read client-side (see docText.js); anything else attaches by name only.
async function readAttachment(file) {
  const rec = { file, name: file.name, size: fmtSize(file.size) }
  const { text, pages, err } = await extractDocText(file)
  if (pages) rec.pages = pages
  if (err) rec.err = err
  if (text) rec.text = text
  return rec
}

// Trim to the shape the lead stores (no File blob) and respect the total cap.
function attachmentMeta(files) {
  let budget = TEXT_TOTAL
  return files.map(f => {
    const rec = { name: f.name, size: f.size }
    if (f.pages) rec.pages = f.pages
    if (f.text && budget > 0) {
      rec.text = f.text.slice(0, budget)
      budget -= rec.text.length
    }
    return rec
  })
}

// Metadata in the lead is intentionally compact. Rehydrate the original blobs
// before a re-run so a reload never turns a complete document into an excerpt.
async function fullLeadAttachments(lead, attachments) {
  const stored = await listFiles(lead.id)
  if (!stored.length) return attachments || []
  const byName = new Map(stored.map(file => [file.name, file]))
  const out = []
  for (const attachment of attachments || []) {
    const file = byName.get(attachment.name)
    if (!file) { out.push(attachment); continue }
    const fresh = await readAttachment(file)
    out.push({ ...attachment, ...fresh })
  }
  return out
}

// Scanned PDFs and images have no text layer. Send their bytes only for the
// transient AI request; the lead stores metadata/text, never this payload.
async function attachmentAiPayload(files) {
  let total = 0
  const out = []
  for (const f of files) {
    const file = f.file || f
    const type = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : '')
    if (!/^application\/(pdf|image\/)/i.test(type) && !/^image\//i.test(type)) continue
    if (file.size > AI_FILE_BYTES || total + file.size > AI_TOTAL_BYTES) continue
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    out.push({ name: file.name, mimeType: type, dataBase64: btoa(binary) })
    total += file.size
  }
  return out
}

// Paste a real inbound enquiry and let Gemini structure it.
function PasteLeadModal({ onClose }) {
  const store = useStore()
  const nav = useNavigate()
  const fileInput = useRef(null)
  const [from, setFrom] = useState('')
  const [subject, setSubject] = useState('')
  const [source, setSource] = useState('')
  const [body, setBody] = useState('')
  const [files, setFiles] = useState([])
  const [drag, setDrag] = useState(false)
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const addFiles = async picked => {
    const list = Array.from(picked || [])
    if (!list.length) return
    setReading(true)
    const recs = []
    for (const f of list) recs.push(await readAttachment(f))
    setFiles(prev => [...prev, ...recs])
    setReading(false)
  }

  const onDrop = e => {
    e.preventDefault(); setDrag(false)
    addFiles(e.dataTransfer.files)
  }

  // Both add paths record the same attachments; only the blobs held for the
  // registration upload are keyed by the new lead id.
  const newLead = id => ({
    id, ts: new Date().toISOString(), channel: 'Email', source,
    // Every lead reaches the AI through the common mailbox — the drawing calls
    // it the single source of truth — so L-04 is satisfied by construction here
    // rather than by pattern-matching the source string.
    mailbox: true,
    from: from || 'unknown@sender', sender: from || 'Unknown sender',
    subject: subject || '(no subject)', body, attachments: attachmentMeta(files),
    status: 'New',
  })

  const add = async () => {
    if (!body.trim() && !files.length) { setErr('Paste the email body, or attach the enquiry document.'); return }
    setBusy(true); setErr('')
    const extracted = await extractLead({ from, subject, body, attachments: files, aiAttachments: await attachmentAiPayload(files) }, store)
    setBusy(false)
    if (!extracted) {
      setErr('Extraction is unavailable — check the AI configuration on the Admin page, or add the mail unextracted and structure it by hand.')
      return
    }
    const id = 'LD-' + Date.now()
    store.addLead({ ...newLead(id), duplicateRisk: 'Low', ...extracted })
    store.recordAiAction(id, { provider: store.config?.aiModel?.provider, model: store.config?.aiModel?.model, action: 'lead.extract', result: { completeness: extracted.completeness, missing: extracted.ai?.missing || [], route: extracted.route } })
    hold(id, files.map(f => f.file))
    onClose()
    nav('/inbox/' + id)
  }

  const addRaw = () => {
    const id = 'LD-' + Date.now()
    store.addLead({
      ...newLead(id),
      parse: { confidence: 0, note: 'Not extracted — AI unavailable; complete by hand.' },
    })
    hold(id, files.map(f => f.file))
    onClose()
    nav('/inbox/' + id)
  }

  return (
    <Modal title="New enquiry — paste the email" onClose={onClose} wide>
      <div className="drawer-form">
        {/* Section 1 of the lead workflow. Where the enquiry came from is a
            separate fact from the mailbox it arrived in, and it is the one that
            answers "which channels actually produce work". */}
        <label>Lead source</label>
        <select value={source} onChange={e => setSource(e.target.value)} style={{ width: '100%' }}>
          <option value="">— select the source —</option>
          {LEAD_SOURCES.map(s => <option key={s}>{s}</option>)}
        </select>
        <label style={{ marginTop: 6 }}>From</label>
        <input value={from} onChange={e => setFrom(e.target.value)}
          placeholder="name@customer.com" style={{ width: '100%' }} />
        <label style={{ marginTop: 6 }}>Subject</label>
        <input value={subject} onChange={e => setSubject(e.target.value)}
          placeholder="Request for quotation — …" style={{ width: '100%' }} />
        <label style={{ marginTop: 6 }}>Body</label>
        <textarea rows={12} value={body} onChange={e => setBody(e.target.value)}
          placeholder="Paste the enquiry exactly as received." style={{ width: '100%' }} />
        <label style={{ marginTop: 6 }}>Attachments</label>
        <div className={`tender-drop compact ${drag ? 'drag' : ''}`}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => fileInput.current.click()}>
          <input ref={fileInput} type="file" multiple style={{ display: 'none' }}
            onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
          <div className="tender-drop-icon"><Icon name="fileText" size={22} /></div>
          <b>Drop the RFQ, BOM or spec here</b>
          <div className="hint">
            {reading ? 'Reading…' : 'or tap to choose files — PDF contents are read and sent with the enquiry'}
          </div>
        </div>
        {files.map((f, i) => (
          <div key={i} className="attach-row">
            <Icon name="fileText" size={13} />
            <span className="attach-name" style={{ flex: 1 }}>{f.name}</span>
            <span className="attach-meta hint">{f.pages ? `${f.pages} p. · ` : ''}{f.size}</span>
            <button title="Remove"
              onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button>
            {f.err && <div className="hint" style={{ flexBasis: '100%' }}><Icon name="alert" size={11} /> {f.err}</div>}
          </div>
        ))}
        {store.config?.aiModel?.provider === 'Built-in fallback'
          ? <WarnBox>Built-in fallback is selected — the email will be parsed locally and remain pending human review.</WarnBox>
          : !aiEnabled() && <WarnBox>AI proxy is not configured — extraction will use the built-in email fallback and remain pending human review.</WarnBox>}
        {err && <ErrBox>{err}</ErrBox>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
          <button onClick={onClose}>Cancel</button>
          {err && <button onClick={addRaw}>Add unextracted</button>}
          <button className="primary" onClick={add} disabled={busy || reading}>
            <Icon name="bot" size={13} /> {busy ? 'Extracting…' : 'Extract with AI'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

const PARSE_FIELDS = [
  ['Sell-to', 'sellTo'], ['Category', 'category'], ['Location', 'location'],
  ['EUC name', 'eucName'], ['EUC location', 'eucLocation'], ['Opp name', 'oppName'],
  ['Opp type', 'oppType'], ['BU', 'bu'], ['Segment', 'segment'], ['Product', 'product'],
  ['Contact person', 'contactPerson'], ['Contact phone', 'contactPhone'],
]

// Best-effort customer match against the master, off the AI sell-to field.
export function matchCustomer(customers, lead) {
  const sellTo = (lead.ai?.fields || []).find(f => /sell-to/i.test(f.k))?.v || lead.parse?.sellTo || ''
  const s = sellTo.toLowerCase()
  return customers.find(c => {
    const n = c.name.toLowerCase()
    return s && (s.includes(n) || n.includes(s))
  }) || null
}

export const customerStatusForLead = (lead, customers) =>
  lead.customerStatus || matchCustomer(customers, lead)?.status || (lead.redFlag ? 'Red' : 'Blue')

const leadFieldValue = (fields, pattern) => {
  const field = (fields || []).find(f => pattern.test(f.k) && f.state !== 'rejected')
  return field?.v || ''
}

const updateLeadField = (fields, key, value, group = 'RFQ') => {
  const index = fields.findIndex(f => f.k.toLowerCase() === key.toLowerCase())
  const next = { group, k: key, v: value, conf: 100, state: 'accepted', ev: 'Edited on lead detail', note: 'Confirmed by user' }
  if (index < 0) return [...fields, next]
  return fields.map((field, i) => i === index ? { ...field, ...next } : field)
}

// Re-extraction after a document is added must not silently undo human work:
// a field somebody accepted, edited or rejected is kept as decided, and only
// the still-pending ones take the fresh AI value. Fields the new run discovers
// are appended — that is the whole point of adding the document.
const mergeDecidedFields = (previous, fresh) => {
  const keyOf = f => (f.group || '') + '|' + (f.k || '').toLowerCase()
  const decided = new Map((previous || []).filter(f => f.state && f.state !== 'pending').map(f => [keyOf(f), f]))
  const merged = (fresh || []).map(f => decided.get(keyOf(f)) || f)
  const seen = new Set(merged.map(keyOf))
  // A decision on a field the new run no longer returns still stands.
  for (const [key, field] of decided) if (!seen.has(key)) merged.push(field)
  return merged
}

const fieldChip = (f, med) => {
  if (f.state === 'accepted') return <Chip tone="state-Accepted">Accepted</Chip>
  if (f.state === 'rejected') return <Chip tone="state-Rejected">Rejected</Chip>
  return f.conf >= med
    ? <Chip tone="state-Review">Review required</Chip>
    : <Chip tone="state-Blocks">Blocks stage</Chip>
}

function LeadWorkflowBar({ lead, customerStatus }) {
  const store = useStore()
  const customer = matchCustomer(store.customers, lead)
  const progress = leadWorkflow(lead, {
    customerStatus: customerStatus || lead.customerStatus || customer?.status || '',
    med: store.config.aiThresholds?.med ?? 75,
  })
  const active = progress.steps[progress.activeIndex]
  const percent = progress.steps.filter(step => step.state === 'complete').length / progress.steps.length * 100

  return (
    <section className="lead-flow-card" aria-label="Lead workflow progress">
      <div className="lead-flow-head">
        <div>
          <div className="lead-flow-kicker">Lead workflow</div>
          <b>{progress.terminal === 'dropped' ? 'Lead workflow stopped — discarded' : progress.complete ? 'Lead workflow complete' : `Current step: ${active.label}`}</b>
        </div>
        <span className={`lead-flow-status ${progress.terminal === 'dropped' ? 'blocked' : progress.complete ? 'complete' : progress.blocked ? 'blocked' : 'current'}`}>
          {progress.terminal === 'dropped' ? `Discarded${lead.droppedReason ? ` — ${lead.droppedReason}` : ''}` : progress.complete ? 'Ready for opportunity workflow' : progress.blocked || 'In progress'}
        </span>
      </div>
      <div className="lead-flow-track" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
      <div className="lead-flow-steps">
        {progress.steps.map((step, index) => (
          <div key={step.id} className={`lead-flow-step ${step.state}`}>
            <span className="lead-flow-dot">{step.state === 'complete' ? '✓' : index + 1}</span>
            <span className="lead-flow-step-text"><b>{step.id}</b><span>{step.short}</span></span>
          </div>
        ))}
      </div>
      {progress.terminal === 'dropped' ? (
        <p className="lead-flow-note">No further lead steps are required. Reopen the lead only if the discard decision was incorrect.</p>
      ) : !progress.complete && (
        <p className="lead-flow-note">
          Update the editable fields below and save each decision to advance the lead.
        </p>
      )}
      {progress.complete && lead.oppId && (
        <p className="lead-flow-note">Opportunity {lead.oppId} is linked. Continue in the Opportunity Workflow.</p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Rich three-panel detail for AI-parsed leads (LD-201..LD-206 shape).
// ---------------------------------------------------------------------------
function AiLeadDetail({ lead }) {
  const store = useStore()
  const nav = useNavigate()
  const drawer = useDrawer()
  const ai = lead.ai
  const med = store.config.aiThresholds?.med ?? 75
  const [evOpen, setEvOpen] = useState(null)      // field index with evidence expanded
  const [editFor, setEditFor] = useState(null)    // { idx, val, note }
  const [rejFor, setRejFor] = useState(null)      // { idx, note }
  const [fillFor, setFillFor] = useState(null)    // { item, val } — answering a missing item
  const [addOther, setAddOther] = useState(null)  // { k, v } — information nobody asked for yet
  const [reExtracting, setReExtracting] = useState(false)
  const [simulating, setSimulating] = useState('')
  const [reErr, setReErr] = useState('')
  const [reNote, setReNote] = useState('')
  // The clarification mail the AI drafts and a human sends. `null` while there
  // is no draft on screen; an editable copy of the stored record otherwise.
  const [clarDraft, setClarDraft] = useState(null)
  const [clarBusy, setClarBusy] = useState(false)
  const [clarErr, setClarErr] = useState('')
  const [viewing, setViewing] = useState(null)   // attachment record open in the viewer
  const [addingDocs, setAddingDocs] = useState(false)
  const [docDrag, setDocDrag] = useState(false)
  const [docErr, setDocErr] = useState('')
  const docInput = useRef(null)
  const [responseOpen, setResponseOpen] = useState(false)
  const [responseFrom, setResponseFrom] = useState(lead.from || '')
  const [responseSubject, setResponseSubject] = useState('')
  const [responseBody, setResponseBody] = useState('')
  const [responseFiles, setResponseFiles] = useState([])
  const [responseBusy, setResponseBusy] = useState(false)
  const [responseErr, setResponseErr] = useState('')
  const responseInput = useRef(null)
  const [dropping, setDropping] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [decisionErr, setDecisionErr] = useState('')
  const [reassignTo, setReassignTo] = useState(lead.suggestedOwner || OWNERS[0])
  const initialLocation = lead.location || (lead.region && !indiaRegionForLocation(lead.region) ? lead.region : '') || leadFieldValue(ai.fields, /location|region/i)
  const initialRegion = lead.region || indiaRegionForLocation(initialLocation) || initialLocation
  const initialDecisions = () => ({
    location: initialLocation,
    region: initialRegion,
    owner: lead.assignedOwner || lead.suggestedOwner || routeOwner(initialRegion, store.config, OWNERS[0]),
    oppType: OPP_TYPES.includes(lead.oppType)
      ? lead.oppType
      : leadFieldValue(ai.fields, /opp type/i) || (lead.route === 'Service' ? 'Service' : lead.route === 'Project' ? 'Project' : 'Spares'),
    customerStatus: lead.customerStatus || customerStatusForLead(lead, store.customers),
    bu: leadFieldValue(ai.fields, /^bu$/i) || 'Energy',
    segment: leadFieldValue(ai.fields, /segment/i) || 'Others',
    product: leadFieldValue(ai.fields, /^product$/i) || 'Various',
  })
  const [decisionDraft, setDecisionDraft] = useState(initialDecisions)
  const [decisionSaved, setDecisionSaved] = useState(false)
  const [locationSearch, setLocationSearch] = useState('')
  const locationQuery = locationSearch.trim().toLowerCase()
  const filteredLocationGroups = locationQuery
    ? INDIA_LOCATION_GROUPS.map(group => ({
      ...group,
      locations: group.locations.filter(item => `${item.city} ${item.state}`.toLowerCase().includes(locationQuery)),
    })).filter(group => group.locations.length)
    : INDIA_LOCATION_GROUPS
  const filteredLocations = filteredLocationGroups.flatMap(group => group.locations)
  const visibleLocations = filteredLocations.slice(0, 50)
  const selectedLocation = indiaLocation(decisionDraft.location)

  // Re-read the mail (plus whatever documents are now on the lead).
  // `keepDecisions` is the automatic path taken after a document is added: the
  // human did not ask to throw their decisions away, they asked the AI to read
  // one more file. The manual button still replaces everything, confirmed first.
  const runExtraction = async ({ source, keepDecisions, detail, failureNote = '' }) => {
    setReExtracting(true); setReErr(''); setReNote('')
    const hydrated = { ...source, attachments: await fullLeadAttachments(source, source.attachments) }
    const extracted = await extractLead(hydrated, store)
    setReExtracting(false)
    if (!extracted) {
      setReErr(failureNote || 'AI extraction was unavailable. The attachment was saved, but the previous extracted fields are unchanged. Retry when the AI proxy is available.')
      return false
    }
    const next = keepDecisions && extracted.ai
      ? { ...extracted, ai: { ...extracted.ai, fields: mergeDecidedFields(source.ai?.fields, extracted.ai.fields), lineItems: extracted.ai.lineItems || source.ai?.lineItems || [] } }
      : extracted
    // Re-reading a document must not silently move the lead out of the
    // salesperson's inbox. Human assignment wins over a fresh AI suggestion;
    // an unassigned lead keeps its prior suggested owner until a user changes it.
    next.suggestedOwner = source.assignedOwner || source.suggestedOwner || next.suggestedOwner
    store.updateLead(lead.id, next, detail || '')
    store.recordAiAction(lead.id, { provider: store.config?.aiModel?.provider, model: store.config?.aiModel?.model, action: 'lead.re-extract', result: { completeness: next.completeness, missing: next.ai?.missing || [], route: next.route } })
    setReNote('Extraction updated.')
    return true
  }

  const reExtract = () => {
    if (decided > 0 && !window.confirm(
      `Re-run extraction? ${decided} field decision(s) on this lead will be replaced.`)) return
    runExtraction({ source: lead, keepDecisions: false })
  }

  // Documents added here join the enquiry's own attachments: their text goes to
  // the AI on the spot, and the blobs ride along to Customer Specs at
  // registration. This is the answer to "the AI did not get the full picture".
  const addDocuments = async picked => {
    const list = Array.from(picked || [])
    if (!list.length) return
    setAddingDocs(true); setDocErr(''); setReNote('')
    const recs = []
    try {
      for (const file of list) recs.push(await readAttachment(file))
    } catch (e) {
      setAddingDocs(false)
      setDocErr('Could not read ' + (e?.message || 'the file') + '.')
      return
    }
    const nextAttachments = [...attachments, ...attachmentMeta(recs)]
    const names = recs.map(r => r.name).join(', ')
    store.updateLead(lead.id, { attachments: nextAttachments }, `Document(s) added to lead: ${names}`)
    holdMore(lead.id, recs.map(r => r.file))
    setAddingDocs(false)
    // Nothing readable came out, so there is nothing new for the AI to read.
    if (recs.every(r => !r.text)) {
      setDocErr(recs[0].err || 'No text could be read from this file — it is attached by name only.')
      return
    }
    // Re-read with the new material. `lead` in this closure predates the patch,
    // so the fresh attachment list is passed explicitly.
    await runExtraction({
      source: { ...lead, attachments: nextAttachments, aiAttachments: await attachmentAiPayload(recs) },
      keepDecisions: true,
      detail: `AI re-read the lead with ${names}`,
      failureNote: `${names} was attached successfully, but AI could not re-read the lead. The previous extracted fields are unchanged. Retry when the AI proxy is available.`,
    })
  }

  const customer = matchCustomer(store.customers, lead)
  const leadCustomerStatus = customerStatusForLead(lead, store.customers)
  const previewCustomerStatus = decisionDraft.customerStatus || leadCustomerStatus
  const previewLead = { ...lead, customerStatus: previewCustomerStatus, redFlag: previewCustomerStatus === 'Red' }
  const isRed = previewCustomerStatus === 'Red'
  const redApproval = redClearanceFor(store.approvals, lead.id)
  const redCleared = isRedCleared(redApproval)
  // A Returned clearance is not a decision, it is a request for rework — so the
  // salesperson must be able to raise it again. Without this the ErrBox showed
  // "Returned" with nowhere to go, and the Approvals page had no route back
  // either because every needed role had already decided.
  const redRequestable = !redApproval || redApproval.status === 'Returned'
  const requestRedClearance = () => store.requestApproval({
    leadId: lead.id, oppId: '', type: 'Red customer clearance',
    detail: `${customer?.name || lead.sender || lead.from} (Red) — ${lead.subject}. Continuation needs joint LJS + AH clearance before any opportunity ID is generated.`
      + (redApproval ? ` Re-raised after ${redApproval.id} was returned.` : ''),
    approver: 'LJS', needed: ['LJS', 'AH'],
  })

  const groups = [...new Set(ai.fields.map(f => f.group))]
  const pendingLow = ai.fields.filter(f => f.state === 'pending' && f.conf < med)

  const patchField = (idx, patch) => {
    const field = ai.fields[idx]
    store.updateLead(lead.id, {
      ai: { ...ai, fields: ai.fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)) },
    }, `AI field "${field?.k || 'unknown'}" updated`)
  }

  // Supply a piece of information the AI could not find. The policy — what it
  // does to completeness and to the clarification deadline — is in leadRules.
  const addMissing = (label, value, key = null) => {
    const patch = supplyMissing({ ...lead, ai }, label, value, key)
    if (patch) store.updateLead(lead.id, patch, `Missing information supplied: ${String(label).trim()}`)
  }

  // Temporary QA path: any missing item can be filled with a deterministic
  // demo value. The action is deliberately labelled so it can be removed or
  // permission-gated after testing without changing the manual path.
  const simulateMissing = async label => {
    setSimulating(label)
    setReErr(''); setReNote('')
    const result = await runTaskResult('lead.fill', {
      missing: label,
      from: lead.from || lead.sender || '',
      subject: lead.subject || '',
      body: lead.body || '',
      fields: ai.fields || [],
      attachments: lead.attachments || [],
    }, { model: store.config?.aiModel?.model })
    const value = String(result.data?.data?.value || '').trim()
    if (value) {
      addMissing(label, value, label)
      store.recordAiAction(lead.id, {
        provider: store.config?.aiModel?.provider,
        model: result.data?.model || store.config?.aiModel?.model,
        action: 'lead.fill',
        result: { missing: label, value, rationale: result.data?.data?.rationale || '' },
      })
      setReNote('AI generated and saved the missing information.')
    } else {
      setReErr(result.error || 'AI could not generate this value. Please try again or use Add to enter it manually.')
    }
    setSimulating('')
  }

  const saveEdit = () => {
    patchField(editFor.idx, {
      v: editFor.val, note: editFor.note || 'Edited by user',
      conf: Math.max(ai.fields[editFor.idx].conf, 95), state: 'accepted',
    })
    setEditFor(null)
  }
  const saveReject = () => {
    patchField(rejFor.idx, { state: 'rejected', note: rejFor.note })
    setRejFor(null)
  }

  const rule = (store.config.ownershipRules || []).find(r => r.owner === lead.suggestedOwner)

  const qualifyBlocked = isRed && !redCleared
  const verificationBlocked = !leadVerificationComplete(lead, previewCustomerStatus, { redCleared })
  const registrationBlocked = !!(ai.missing || []).length || pendingLow.length > 0 || verificationBlocked
  const canAct = !['Converted', 'Dropped'].includes(lead.status)

  // ---- Clarification mail: AI drafts, a human sends -----------------------
  // 20 Aug review: the original flow auto-sent these, which risks putting wrong
  // information in front of a customer. So `draftClarificationMail` only ever
  // writes a Draft, and the only thing that marks it Sent is `sendClarification`
  // below — called from a button, after the compose window has been opened.
  // There is deliberately no code path from drafting to sending.
  const clarRecord = lead.clarification || null
  const clarKind = clarificationKindFor(lead, previewCustomerStatus)
  const clarSender = clarificationSender(lead, store.users, store.config)
  const canDraftClar = canAct && !!clarKind

  const draftClarificationMail = async () => {
    setClarErr('')
    setClarBusy(true)
    try {
      const items = clarKind === 'quote-fee' ? QUOTE_FEE_DOCUMENTS : clarificationItems(lead)
      // The model writes the prose; the template writes it when the model is
      // unavailable, refused or times out. runText already returns null rather
      // than throwing, so the fallback is the normal case, not the error case.
      const aiBody = await runText('lead.clarify', {
        kind: clarKind,
        items,
        subject: lead.subject,
        body: lead.body,
        sellTo: customer?.name || leadFieldValue(ai.fields, /sell-to/i),
        contactPerson: customer?.contactPerson || leadFieldValue(ai.fields, /contact/i),
        salutation: customer?.contactPerson ? `Dear ${customer.contactPerson},` : 'Dear Sir,',
        feeText: `₹${Number(store.config?.amberFee?.amount ?? 25000).toLocaleString('en-IN')}`,
        senderBlock: [clarSender.rule === 'assigned-owner' ? clarSender.name : '', 'ModAE India Pvt Ltd']
          .filter(Boolean).join('\n'),
      })
      const draft = draftClarification(lead, {
        kind: clarKind, customer, users: store.users, config: store.config, aiBody: aiBody || '',
      })
      store.updateLead(lead.id, draftPatch(draft),
        `${draft.kind === 'quote-fee' ? 'Pre-quote fee' : 'Clarification'} mail drafted by ${draft.draftedBy} — not sent`)
      setClarDraft(draft)
    } catch (e) {
      setClarErr(e?.message || 'Could not draft the mail')
    } finally {
      setClarBusy(false)
    }
  }

  // The one place a clarification becomes Sent. It opens a compose window; the
  // person still has to review it there and press send in their mail client.
  const sendClarification = () => {
    if (!clarDraft?.to?.trim()) { setClarErr('Add a recipient address before sending'); return }
    const href = gmailComposeHref(clarDraft)
    if (!href) { setClarErr('Add a recipient address before sending'); return }
    window.open(href, '_blank', 'noopener')
    store.updateLead(lead.id, sentPatch({ ...(clarRecord || {}), ...clarDraft }, { sentBy: store.role }),
      `${clarDraft.kind === 'quote-fee' ? 'Pre-quote fee' : 'Clarification'} mail sent to ${clarDraft.to} from ${clarDraft.from}`)
    setClarDraft(null)
  }
  // Read-only progress readout for the fields column footer.
  const decided = ai.fields.filter(f => f.state !== 'pending').length
  const attachments = lead.attachments || []
  // Duplicate candidates, computed live against the rest of the inbox and
  // minus anything already dismissed on this lead.
  const dupes = findDuplicates(lead, store.leads)
    .filter(d => !(lead.dismissedDuplicates || []).includes(d.leadId))

  const reassign = () => {
    const routedOwner = routeOwner(lead.region || lead.location, store.config, reassignTo)
    if (routedOwner && reassignTo !== routedOwner && !['LJS', 'AH'].includes(store.role)) {
      setDecisionErr(`Region routing assigns this lead to ${routedOwner}. Only LJS or AH can override the owner.`)
      return
    }
    if (routedOwner && reassignTo !== routedOwner && !(lead.ownerOverrideReason || '').trim()) {
      setDecisionErr('An owner override reason is required.')
      return
    }
    store.updateLead(lead.id, { suggestedOwner: reassignTo, assignedOwner: reassignTo, reassignedFrom: lead.suggestedOwner || '', reassignedAt: new Date().toISOString() }, `Owner reassigned to ${reassignTo}`)
  }

  const saveDecisions = () => {
    setDecisionErr('')
    const routedOwner = routeOwner(decisionDraft.region, store.config, decisionDraft.owner)
    const isOverride = routedOwner && decisionDraft.owner !== routedOwner
    if (isOverride && !['LJS', 'AH'].includes(store.role)) {
      setDecisionErr(`Region routing assigns this lead to ${routedOwner}. Only LJS or AH can override the owner.`)
      return
    }
    if (isOverride && !(lead.ownerOverrideReason || '').trim()) {
      setDecisionErr('An owner override reason is required.')
      return
    }
    const previous = initialDecisions()
    const nextFields = updateLeadField(updateLeadField(updateLeadField(updateLeadField(ai.fields,
      'Location', decisionDraft.location, 'Customer'), 'Opp Type', decisionDraft.oppType),
      'BU / Segment', `${decisionDraft.bu} / ${decisionDraft.segment}`), 'Product', decisionDraft.product)
    const changed = Object.keys(decisionDraft)
      .filter(key => previous[key] !== decisionDraft[key])
      .map(key => `${key}: ${previous[key] || '—'} → ${decisionDraft[key] || '—'}`)
    if (!changed.length) { setDecisionSaved(true); return }
    store.updateLead(lead.id, {
      region: decisionDraft.region,
      location: decisionDraft.location,
      suggestedOwner: decisionDraft.owner,
      assignedOwner: decisionDraft.owner,
      ownerOverrideReason: isOverride ? lead.ownerOverrideReason.trim() : '',
      fastTrack: isFastTrackLead({ ...lead, customerStatus: decisionDraft.customerStatus }, store.config, customer),
      fastTrackStartedAt: isFastTrackLead({ ...lead, customerStatus: decisionDraft.customerStatus }, store.config, customer) ? (lead.fastTrackStartedAt || new Date().toISOString()) : lead.fastTrackStartedAt,
      oppType: decisionDraft.oppType,
      route: routeForType(decisionDraft.oppType),
      customerStatus: decisionDraft.customerStatus,
      customerClassifiedAt: lead.customerClassifiedAt || new Date().toISOString(),
      verification: ['Blue', 'Amber'].includes(decisionDraft.customerStatus)
        ? { ...(lead.verification || {}), requestedAt: lead.verification?.requestedAt || new Date().toISOString(), requestedFor: decisionDraft.customerStatus }
        : (lead.verification || {}),
      redFlag: decisionDraft.customerStatus === 'Red',
      ai: { ...ai, route: routeForType(decisionDraft.oppType), fields: nextFields },
    }, `Lead decisions saved — ${changed.join('; ')}`)
    setReassignTo(decisionDraft.owner)
    setDecisionSaved(true)
  }

  const addResponseFiles = async picked => {
    const list = Array.from(picked || [])
    if (!list.length) return
    try {
      const recs = []
      for (const file of list) recs.push(await readAttachment(file))
      setResponseFiles(previous => [...previous, ...recs])
    } catch (e) { setResponseErr('Could not read ' + (e?.message || 'the file') + '.') }
  }

  const saveCustomerResponse = async () => {
    if (!responseBody.trim() && !responseFiles.length) {
      setResponseErr('Paste the customer reply or attach a clarification document.')
      return
    }
    setResponseBusy(true); setResponseErr(''); setReNote('')
    try {
      const responseAttachments = attachmentMeta(responseFiles)
      const nextAttachments = [...attachments, ...responseAttachments]
      const names = responseAttachments.map(file => file.name).join(', ')
      const response = {
        id: `CR-${Date.now()}`, receivedAt: new Date().toISOString(),
        from: responseFrom.trim(), subject: responseSubject.trim(), body: responseBody.trim(),
        attachments: responseAttachments,
      }
      store.updateLead(lead.id, {
        attachments: nextAttachments,
        clarificationResponses: [...(lead.clarificationResponses || []), response],
        ...(lead.clarification ? { clarification: { ...lead.clarification, status: 'Answered', answeredAt: response.receivedAt } } : {}),
        clarificationCompletedAt: response.receivedAt,
      }, `Customer clarification received${names ? `: ${names}` : ''}`)
      store.addCommunication(lead.id, {
        dir: 'In', kind: 'clarification-response', from: response.from,
        subject: response.subject || 'Customer clarification received', body: response.body,
        attachmentNames: responseAttachments.map(file => file.name),
      })
      holdMore(lead.id, responseFiles.map(file => file.file))
      const responseText = response.body ? `\n\nCUSTOMER CLARIFICATION RESPONSE:\n${response.body}` : ''
      await runExtraction({
        source: { ...lead, body: `${lead.body || ''}${responseText}`, attachments: nextAttachments, aiAttachments: await attachmentAiPayload(responseFiles) },
        keepDecisions: true,
        detail: 'AI re-read the lead with the customer clarification response',
        failureNote: 'The customer clarification was saved, but AI could not re-read the lead. Retry when the AI proxy is available.',
      })
      setResponseOpen(false); setResponseFrom(lead.from || ''); setResponseSubject(''); setResponseBody(''); setResponseFiles([])
    } catch (e) {
      setResponseErr(e?.message || 'Could not save the customer clarification')
    } finally { setResponseBusy(false) }
  }

  const updateDecisionRegion = (location) => {
    const mappedRegion = indiaRegionForLocation(location) || (location.trim() ? 'Unclassified leads' : '')
    setLocationSearch('')
    setDecisionDraft(previous => ({
      ...previous,
      location,
      region: mappedRegion,
      // A non-empty region is authoritative for routing. Keep the current
      // owner only while the region is blank; once a region is entered, the
      // owner selector follows the configured regional rule immediately.
      owner: mappedRegion
        ? routeOwner(mappedRegion, store.config, previous.owner)
        : previous.owner,
    }))
    setDecisionErr('')
    setDecisionSaved(false)
  }

  return (
    <>
    <LeadWorkflowBar lead={lead} customerStatus={previewCustomerStatus} />
    <div className="ws-grid">
      {/* ---- Column 1 — original email ---- */}
      <section className="ws-col">
        <header className="ws-head">
          <span className="ws-head-icon blue"><Icon name="mail" size={13} /></span>
          <span className="ws-head-title">Original email</span>
          <span className="ws-head-meta">{lead.source || lead.channel || 'Unclassified source'} · via common mailbox</span>
        </header>
        <div className="ws-body">
          <div className="ws-sender">
            <b>{lead.sender || lead.from}</b>
            <span>{lead.from}</span>
          </div>
          <div className="ws-subject">{lead.subject}</div>
          {lead.ref && <div className="ws-tag">Ref {lead.ref}</div>}
          <div className="email-body">{lead.body}</div>
          <div className="ws-group">Attachments</div>
          {attachments.map((a, i) => (
            <button key={i} type="button" className="attach-row attach-row-open"
              onClick={() => setViewing(a)} title={`View ${a.name}`}>
              <span className="attach-icon"><Icon name="fileText" size={13} /></span>
              <span className="attach-name">{a.name}</span>
              <span className="attach-meta">{a.pages ? a.pages + ' p.' : a.size || ''}</span>
              <span className="attach-open"><Icon name="eye" size={13} /></span>
            </button>
          ))}
          {attachments.length === 0 && <p className="hint">No attachments came with this enquiry.</p>}
          {canAct && (
            <>
              <div className={`tender-drop compact attach-add ${docDrag ? 'drag' : ''}`}
                onDragOver={e => { e.preventDefault(); setDocDrag(true) }}
                onDragLeave={() => setDocDrag(false)}
                onDrop={e => { e.preventDefault(); setDocDrag(false); addDocuments(e.dataTransfer.files) }}
                onClick={() => docInput.current.click()}>
                <input ref={docInput} type="file" multiple style={{ display: 'none' }}
                  onChange={e => { addDocuments(e.target.files); e.target.value = '' }} />
                <div className="tender-drop-icon"><Icon name="upload" size={20} /></div>
                <b>{addingDocs ? 'Reading…' : 'Add a document'}</b>
                <div className="hint">
                  {reExtracting
                    ? 'Re-reading the lead with the new document…'
                    : 'Drop the RFQ, BOM or spec here — PDF and Word contents are read and sent to the AI'}
                </div>
              </div>
              {docErr && <p className="hint"><Icon name="alert" size={12} /> {docErr}</p>}
              <div className="clar-response-upload">
                {!responseOpen ? (
                  <button type="button" onClick={() => { setResponseOpen(true); setResponseErr('') }}>
                    <Icon name="mail" size={12} /> Add customer clarification response
                  </button>
                ) : (
                  <div className="drawer-form">
                    <b>Customer clarification received</b>
                    <label style={{ marginTop: 6 }}>From</label>
                    <input value={responseFrom} onChange={e => setResponseFrom(e.target.value)} placeholder="customer@company.com" />
                    <label style={{ marginTop: 6 }}>Subject</label>
                    <input value={responseSubject} onChange={e => setResponseSubject(e.target.value)} placeholder="Re: Clarification request" />
                    <label style={{ marginTop: 6 }}>Reply body</label>
                    <textarea rows={6} value={responseBody} onChange={e => setResponseBody(e.target.value)} placeholder="Paste the customer's clarification reply" />
                    <label style={{ marginTop: 6 }}>Reply attachments</label>
                    <input ref={responseInput} type="file" multiple style={{ display: 'none' }} onChange={e => { addResponseFiles(e.target.files); e.target.value = '' }} />
                    <button type="button" onClick={() => responseInput.current.click()}><Icon name="upload" size={12} /> Add files</button>
                    {responseFiles.map((file, i) => <div className="attach-row" key={`${file.name}-${i}`}><Icon name="fileText" size={13} /><span className="attach-name" style={{ flex: 1 }}>{file.name}</span><button type="button" onClick={() => setResponseFiles(responseFiles.filter((_, j) => j !== i))}>×</button></div>)}
                    {responseErr && <ErrBox>{responseErr}</ErrBox>}
                    <div className="toolbar" style={{ margin: 0 }}>
                      <button className="primary" type="button" disabled={responseBusy} onClick={saveCustomerResponse}>{responseBusy ? 'Saving and re-reading…' : 'Save response & re-read'}</button>
                      <button type="button" disabled={responseBusy} onClick={() => { setResponseOpen(false); setResponseErr('') }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <footer className="ws-foot ws-foot-meta">
          <span><Icon name="clock" size={12} /> {ddMmmYY((lead.ts || '').slice(0, 10))}</span>
          <span>{attachments.length} attachment{attachments.length === 1 ? '' : 's'}</span>
        </footer>
      </section>

      {/* ---- Column 2 — AI-extracted fields ---- */}
      <section className="ws-col">
        <header className="ws-head">
          <span className="ws-head-icon violet"><Icon name="bot" size={13} /></span>
          <span className="ws-head-title">AI-extracted fields</span>
          <span className="ws-head-meta">AI proposes · humans decide</span>
        </header>
        <div className="ws-body">
          {groups.map(g => (
            <div key={g}>
              <div className="ws-group">{g}</div>
              {ai.fields.map((f, idx) => f.group === g && (
                <div key={idx} className={`ai-field state-${f.state}${f.state === 'pending' && f.conf < med ? ' low' : ''}`}>
                  <div className="af-top">
                    <span className="af-key">{f.k}</span>
                    <span className="af-chips">
                      <ConfChip conf={f.conf} thresholds={store.config.aiThresholds} />
                      {fieldChip(f, med)}
                    </span>
                  </div>
                  {editFor?.idx === idx
                    ? <div className="af-edit">
                        <input value={editFor.val} onChange={e => setEditFor({ ...editFor, val: e.target.value })} />
                        <input placeholder="Edit note (why the value changed)" value={editFor.note}
                          onChange={e => setEditFor({ ...editFor, note: e.target.value })} />
                        <div className="af-edit-actions">
                          <button className="primary" onClick={saveEdit}>Save</button>
                          <button onClick={() => setEditFor(null)}>Cancel</button>
                        </div>
                      </div>
                    : <div className="af-val">{f.v}</div>}
                  <button className="af-ev" onClick={() => setEvOpen(evOpen === idx ? null : idx)}>
                    <Icon name="eye" size={11} /> Evidence
                  </button>
                  {evOpen === idx && (
                    <div className="af-evidence">{f.ev}{f.note ? ` — ${f.note}` : ''}</div>
                  )}
                  {rejFor?.idx === idx && (
                    <div className="af-reject">
                      <input placeholder="Rejection note (required)" value={rejFor.note}
                        onChange={e => setRejFor({ ...rejFor, note: e.target.value })} />
                      <button className="primary" disabled={!rejFor.note.trim()} onClick={saveReject}>Reject</button>
                      <button onClick={() => setRejFor(null)}>Cancel</button>
                    </div>
                  )}
                  {f.state === 'pending' && canAct && editFor?.idx !== idx && rejFor?.idx !== idx && (
                    <div className="af-actions">
                      <button className="act-accept" onClick={() => patchField(idx, { state: 'accepted' })}>
                        <Icon name="check" size={11} /> Accept
                      </button>
                      <button onClick={() => { setRejFor(null); setEditFor({ idx, val: f.v, note: '' }) }}>Edit</button>
                      <button className="act-reject" onClick={() => { setEditFor(null); setRejFor({ idx, note: '' }) }}>
                        <Icon name="x" size={11} /> Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
        <footer className="ws-foot ws-foot-meta">
          <span><b>{decided}</b> of {ai.fields.length} fields decided</span>
          <span className="ws-progress">
            <span style={{ width: `${ai.fields.length ? (decided / ai.fields.length) * 100 : 0}%` }} />
          </span>
        </footer>
      </section>

      {/* ---- Column 3 — AI summary, alerts, actions ---- */}
      <section className="ws-col">
        <header className="ws-head">
          <span className="ws-head-icon emerald"><Icon name="sparkles" size={13} /></span>
          <span className="ws-head-title">AI summary &amp; actions</span>
          {aiEnabled() && canAct && (
            <button className="ws-head-meta" onClick={reExtract} disabled={reExtracting}
              title="Re-read the original email with the configured model">
              <Icon name="refresh" size={12} /> {reExtracting ? 'Extracting…' : 'Re-run'}
            </button>
          )}
        </header>
        <div className="ws-body">
          <p className="ws-summary">{ai.summary}</p>
          {ai.scan && (
            <p className="hint" role="status">
              <Icon name={ai.scan.complete ? 'checkCircle' : 'alert'} size={12} />{' '}
              {ai.scan.complete
                ? `Complete document scan: ${ai.scan.completed} section${ai.scan.completed === 1 ? '' : 's'} processed.`
                : `Partial document scan: ${ai.scan.completed || 0} of ${ai.scan.chunks || 1} sections processed.`}
            </p>
          )}
          {reErr && <ErrBox>{reErr}</ErrBox>}
          {reNote && !reErr && <p className="hint"><Icon name="checkCircle" size={12} /> {reNote}</p>}

          {/* Each outstanding item is answerable on the spot. Waiting on the
              customer is one way to close a clarification; typing in what you
              already know is the other, and it was the one with no button. */}
          {ai.missing?.length > 0 && (
            <WarnBox>
              <b>Missing information</b>
              <ul className="ws-missing">
                {(ai.missing || []).map((m, i) => (
                  <li key={i}>
                    <div className="ws-missing-row">
                      <span>{m}</span>
                      {canAct && fillFor?.item !== m && (
                        <button onClick={() => { setAddOther(null); setFillFor({ item: m, val: '' }) }}>
                          <Icon name="plus" size={11} /> Add
                        </button>
                      )}
                      {fillFor?.item !== m && (
                        <button title="Ask AI to generate a realistic test value" disabled={simulating === m}
                          onClick={() => simulateMissing(m)}>
                          <Icon name="sparkles" size={11} /> {simulating === m ? 'Generating…' : 'Simulate'}
                        </button>
                      )}
                    </div>
                    {fillFor?.item === m && (
                      <div className="ws-missing-fill">
                        <input autoFocus value={fillFor.val} placeholder="Type what you know"
                          onChange={e => setFillFor({ ...fillFor, val: e.target.value })}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && fillFor.val.trim()) { addMissing(m, fillFor.val, m); setFillFor(null) }
                            if (e.key === 'Escape') setFillFor(null)
                          }} />
                        <button className="act-accept" disabled={!fillFor.val.trim()}
                          onClick={() => { addMissing(m, fillFor.val, m); setFillFor(null) }}>
                          <Icon name="check" size={11} /> Save
                        </button>
                        <button onClick={() => setFillFor(null)}>Cancel</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </WarnBox>
          )}

          {/* Outside the warning box, so it stays reachable on a lead the AI
              read cleanly — the enquiry can still be short something nobody
              thought to flag. */}
          {canAct && !addOther && (
            <button className="ws-missing-other" onClick={() => { setFillFor(null); setAddOther({ k: '', v: '' }) }}>
              <Icon name="plus" size={11} /> Add other information
            </button>
          )}
          {addOther && (
            <div className="ws-missing-fill ws-missing-other-fill">
              <input autoFocus value={addOther.k} placeholder="What is it (e.g. Delivery address)"
                onChange={e => setAddOther({ ...addOther, k: e.target.value })} />
              <input value={addOther.v} placeholder="Value"
                onChange={e => setAddOther({ ...addOther, v: e.target.value })}
                onKeyDown={e => {
                  if (e.key === 'Enter' && addOther.k.trim() && addOther.v.trim()) { addMissing(addOther.k, addOther.v); setAddOther(null) }
                  if (e.key === 'Escape') setAddOther(null)
                }} />
              <button className="act-accept" disabled={!addOther.k.trim() || !addOther.v.trim()}
                onClick={() => { addMissing(addOther.k, addOther.v); setAddOther(null) }}>
                <Icon name="check" size={11} /> Save
              </button>
              <button onClick={() => setAddOther(null)}>Cancel</button>
            </div>
          )}

          {/* AI drafts, a human sends. Nothing here dispatches on its own —
              "Send" opens a compose window that still has to be submitted by
              hand, and only that click marks the record Sent. */}
          {(canDraftClar || clarRecord) && (
            <div className="clar-mail">
              <div className="clar-mail-head">
                <b>{clarKind === 'quote-fee' ? 'Pre-quote fee request' : 'Clarification request'}</b>
                {clarRecord?.status === 'Sent' && <span className="lead-decision-saved">Sent {ddMmmYY(clarRecord.sentAt)}</span>}
                {clarRecord?.status === 'Draft' && !clarDraft && <span className="lead-decision-note">Drafted, not sent</span>}
              </div>
              <p className="hint">
                From <b>{clarSender.address}</b> — {senderLabel(clarSender)}.
              </p>
              {clarErr && <ErrBox>{clarErr}</ErrBox>}

              {!clarDraft && canDraftClar && (
                <div className="clar-mail-actions">
                  <button className="primary" disabled={clarBusy} onClick={draftClarificationMail}>
                    <Icon name="sparkles" size={12} /> {clarBusy ? 'Drafting…' : clarRecord ? 'Re-draft email' : 'Draft clarification email'}
                  </button>
                  {clarRecord && (
                    <button onClick={() => setClarDraft({ ...clarRecord })}>Review last draft</button>
                  )}
                  {clarRecord?.status === 'Sent' && (
                    <button onClick={() => store.updateLead(lead.id, answeredPatch(clarRecord),
                      'Customer answered the clarification')}>Customer answered</button>
                  )}
                </div>
              )}

              {clarDraft && (
                <div className="clar-mail-form">
                  <label className="afield">To
                    <input value={clarDraft.to} onChange={e => setClarDraft({ ...clarDraft, to: e.target.value })} />
                  </label>
                  <label className="afield">CC
                    <input value={clarDraft.cc} onChange={e => setClarDraft({ ...clarDraft, cc: e.target.value })} />
                  </label>
                  <label className="afield">Subject
                    <input value={clarDraft.subject} onChange={e => setClarDraft({ ...clarDraft, subject: e.target.value })} />
                  </label>
                  <label className="afield">Body
                    <textarea rows={14} value={clarDraft.body}
                      onChange={e => setClarDraft({ ...clarDraft, body: e.target.value })} />
                  </label>
                  <p className="hint">
                    Drafted by {clarDraft.draftedBy === 'AI' ? 'the model' : 'the standard ModAE template'}.
                    Review every line before sending — nothing leaves the app until you press Send.
                  </p>
                  <div className="clar-mail-actions">
                    <button className="primary" onClick={sendClarification}>
                      <Icon name="mail" size={12} /> Send
                    </button>
                    <button onClick={() => {
                      store.updateLead(lead.id, draftPatch({ ...clarDraft }), 'Clarification draft saved')
                      setClarDraft(null)
                    }}>Save draft</button>
                    <button onClick={() => { setClarDraft(null); setClarErr('') }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Computed against the live inbox, not read from a seeded list —
              a lead added today is checked the same way a seeded one is. Any
              candidate the user has dismissed stays dismissed. */}
          {dupes.length > 0 && (
            <WarnBox>
              <b>Duplicate candidates</b>
              {dupes.map(d => (
                <div key={d.leadId} className="ws-dup">
                  <span>
                    <b>{d.leadId}</b> — {d.note}
                    <span className="hint"> · {Math.round(d.confidence * 100)}% confident</span>
                  </span>
                  <div className="ws-dup-actions">
                    <button onClick={() => nav('/inbox/' + d.leadId)}>Open {d.leadId}</button>
                    <button onClick={() => store.updateLead(lead.id, {
                      dismissedDuplicates: [...(lead.dismissedDuplicates || []), d.leadId],
                    })}>Not a duplicate</button>
                    <button onClick={() => store.updateLead(lead.id, {
                      status: 'Dropped',
                      droppedReason: `${DROP_REASONS[2]} — same enquiry as ${d.leadId}`,
                    })}>Mark duplicate</button>
                  </div>
                </div>
              ))}
            </WarnBox>
          )}

          <div className="ws-group">Qualification &amp; ownership</div>
          <div className="ws-kv">
            <span className="ws-kv-k">Customer match</span>
            <span className="ws-kv-v">
              {customer ? customer.name : 'Unmatched (new — Blue)'}
              {customer && <span className={`pill ${customer.status}`}>{customer.status}</span>}
            </span>
          </div>
          <div className="ws-kv">
            <span className="ws-kv-k">Suggested owner</span>
            <span className="ws-kv-v">
              {lead.suggestedOwner}
              <span className="ws-kv-note">{rule ? `${rule.region} rule` : 'regional rule'} · override needs LJS/AH + reason</span>
            </span>
          </div>

          <div className="lead-decision-card">
            <div className="lead-decision-head">
              <div>
                <b>Lead decisions</b>
                <span>Correct routing values before registration</span>
              </div>
              {decisionSaved && <span className="lead-decision-saved">Saved</span>}
            </div>
            <div className="lead-decision-grid">
              <label>City / location
                <input type="search" value={locationSearch} disabled={lead.status === 'Dropped'}
                  onChange={e => setLocationSearch(e.target.value)} placeholder="Search city or state" aria-label="Search city or state" />
                <div className="location-suggestions" role="listbox" aria-label="City suggestions">
                  {locationQuery && visibleLocations.map(item => (
                    <button type="button" key={item.value} className="location-suggestion"
                      disabled={lead.status === 'Dropped'} onClick={() => updateDecisionRegion(item.value)}>
                      <strong>{item.city}</strong><span>{item.state} · {item.region}</span>
                    </button>
                  ))}
                  {locationQuery && filteredLocations.length > 50 && (
                    <span className="location-suggestion-note">Showing 50 of {filteredLocations.length} matches. Refine your search.</span>
                  )}
                  {locationQuery && !filteredLocations.length && (
                    <span className="location-suggestion-note">No cities found</span>
                  )}
                  {!locationQuery && selectedLocation && (
                    <span className="location-selected"><strong>{selectedLocation.city}</strong> · {selectedLocation.state}</span>
                  )}
                  {!locationQuery && !selectedLocation && (
                    <span className="location-suggestion-note">Type above to search for a city or town</span>
                  )}
                  <button type="button" className="location-other" disabled={lead.status === 'Dropped'}
                    onClick={() => updateDecisionRegion('Other / Unclassified')}>Other / Unclassified</button>
                </div>
              </label>
              <label>Assigned owner
                <select value={decisionDraft.owner} disabled={lead.status === 'Dropped'}
                  onChange={e => setDecisionDraft({ ...decisionDraft, owner: e.target.value })}>
                  {OWNERS.map(owner => <option key={owner}>{owner}</option>)}
                </select>
              </label>
              <label>Opportunity type
                <select value={decisionDraft.oppType} disabled={lead.status === 'Dropped'}
                  onChange={e => setDecisionDraft({ ...decisionDraft, oppType: e.target.value })}>
                  {OPP_TYPES.map(type => <option key={type}>{type}</option>)}
                </select>
              </label>
              <label>Customer class
                <select value={decisionDraft.customerStatus} disabled={lead.status === 'Dropped'}
                  onChange={e => {
                    setDecisionDraft({ ...decisionDraft, customerStatus: e.target.value })
                    setDecisionErr('')
                    setDecisionSaved(false)
                  }}>
                  {CUSTOMER_STATUSES.map(status => <option key={status}>{status}</option>)}
                </select>
              </label>
              <label>Business unit
                <select value={decisionDraft.bu} disabled={lead.status === 'Dropped'}
                  onChange={e => setDecisionDraft({ ...decisionDraft, bu: e.target.value })}>
                  {BUS.map(bu => <option key={bu}>{bu}</option>)}
                </select>
              </label>
              <label>Segment
                <select value={decisionDraft.segment} disabled={lead.status === 'Dropped'}
                  onChange={e => setDecisionDraft({ ...decisionDraft, segment: e.target.value })}>
                  {SEGMENTS.map(segment => <option key={segment}>{segment}</option>)}
                </select>
              </label>
              <label>Product
                <select value={decisionDraft.product} disabled={lead.status === 'Dropped'}
                  onChange={e => setDecisionDraft({ ...decisionDraft, product: e.target.value })}>
                  {PRODUCTS.map(product => <option key={product}>{product}</option>)}
                </select>
              </label>
            </div>
            {decisionErr && <div className="errbox" style={{ marginTop: 8 }}>{decisionErr}</div>}
            {decisionDraft.owner !== routeOwner(decisionDraft.region, store.config, decisionDraft.owner) && (
              <label className="afield" style={{ display: 'block', marginTop: 8 }}>Owner override reason
                <textarea rows={2} value={lead.ownerOverrideReason || ''} disabled={!['LJS', 'AH'].includes(store.role)}
                  onChange={e => store.updateLead(lead.id, { ownerOverrideReason: e.target.value }, 'Owner override reason updated')}
                  placeholder="Required for an LJS/AH owner override" />
              </label>
            )}
            {isFastTrackLead(previewLead, store.config, customer) && <div className="okbox" style={{ marginTop: 8 }}>Fast-track enabled for this Green customer.</div>}
            <div className="lead-decision-actions">
              <button className="primary" disabled={lead.status === 'Dropped'} onClick={saveDecisions}>
                <Icon name="check" size={12} /> Save changes
              </button>
              <button disabled={lead.status === 'Dropped'} onClick={() => { setDecisionDraft(initialDecisions()); setDecisionSaved(false) }}>Cancel</button>
            </div>
            {lead.status === 'Converted' && <p className="lead-decision-note">This edits the lead record only. The linked opportunity is unchanged.</p>}
          </div>

          {ai.next?.length > 0 && (
            <>
              <div className="ws-group">Suggested next actions</div>
              <ul className="ws-next">{ai.next.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </>
          )}

          {isRed && !redCleared && (
            <ErrBox>
              <b>Red-class customer</b> — continuation needs joint LJS + AH approval (AP-1).
              No opportunity ID until approved.{' '}
              {redApproval && <>Approval <b>{redApproval.id}</b> is <b>{redApproval.status}</b>.{' '}
                <button onClick={() => nav('/approvals')}>Open approvals</button>{' '}</>}
              {redRequestable && <button onClick={requestRedClearance}>
                {redApproval ? 'Re-request joint approval' : 'Request joint approval'}
              </button>}
            </ErrBox>
          )}
          {isRed && redCleared && (
            <div className="okbox">
              Red gate cleared — {redApproval.id} <b>{redApproval.status}</b>.
              {redApproval.status === 'Approved with conditions' && ' Proceed on prepayment-only conditions.'}
            </div>
          )}

          <LeadVerification lead={lead} customerStatus={previewCustomerStatus} store={store} />

          {lead.status === 'Converted' && (
            <div className="okbox">
              Qualified and converted{lead.oppId && <> — <span className="oppid-link" style={{ cursor: 'pointer' }}
                onClick={() => drawer.open({ type: 'opp', id: lead.oppId })}>{lead.oppId}</span></>}.
            </div>
          )}
          {lead.status === 'Dropped' && (
            <div className="warn-box">
              Dropped — {lead.droppedReason || 'no reason recorded'}. Kept minimally for analytics.
            </div>
          )}

          {lead.status === 'Qualified' && pendingLow.length > 0 && (
            <WarnBox>
              <b>Registration still blocked</b> by {pendingLow.length} low-confidence
              field{pendingLow.length > 1 ? 's' : ''} awaiting a decision:
              <ul>{pendingLow.map((f, i) => <li key={i}>{f.k} ({f.conf}% confidence)</li>)}</ul>
              Each must be accepted, edited or rejected.
            </WarnBox>
          )}
          {lead.status === 'Qualified' && (ai.missing || []).length > 0 && (
            <WarnBox>
              <b>Registration still blocked</b> until the missing information is filled in:
              <ul>{ai.missing.map((item, i) => <li key={i}>{item}</li>)}</ul>
              Use the Add button above to answer each item before continuing.
            </WarnBox>
          )}
        </div>

        <footer className="ws-foot">
          {canAct && lead.status !== 'Qualified' && (
            <>
              {isFastTrackLead(previewLead, store.config, customer) && (
                <button className="primary ws-action" disabled={qualifyBlocked}
                  title={qualifyBlocked ? 'Blocked: Red continuation approval required first' : undefined}
                  onClick={() => {
                    store.updateLead(lead.id, {
                      status: 'Qualified',
                      customerStatus: previewCustomerStatus,
                      redFlag: previewCustomerStatus === 'Red',
                      fastTrack: true,
                      fastTrackStartedAt: lead.fastTrackStartedAt || new Date().toISOString(),
                    }, 'Green customer fast-track started')
                    nav('/register/' + lead.id)
                  }}>
                  <Icon name="arrowRight" size={14} /> Fast-track to registration
                </button>
              )}
              <button className="primary ws-action" disabled={qualifyBlocked}
                title={qualifyBlocked ? 'Blocked: Red continuation approval required first' : undefined}
                onClick={() => store.updateLead(lead.id, { status: 'Qualified' })}>
                <Icon name="check" size={14} /> Qualify lead
              </button>
              {qualifyBlocked && <p className="ws-foot-note">Blocked — Red continuation approval required first.</p>}
            </>
          )}
          {canAct && !dropping && (
            <div className="toolbar" style={{ margin: '8px 0 0' }}>
              <button onClick={() => setDropping(true)}><Icon name="x" size={13} /> Disqualify</button>
              <select value={reassignTo} onChange={e => setReassignTo(e.target.value)} title="Assign lead to another salesperson">
                {OWNERS.map(owner => <option key={owner}>{owner}</option>)}
              </select>
              <button onClick={reassign}>Reassign</button>
            </div>
          )}
          {canAct && dropping && (
            <ReasonBox title="Disqualify this lead" categories={DROP_REASONS} confirmLabel="Confirm disqualify"
              onCancel={() => setDropping(false)}
              onConfirm={(category, note) => {
                store.updateLead(lead.id, { status: 'Dropped', droppedReason: `${category} — ${note}` })
                setDropping(false)
              }} />
          )}
          {/* Revert works after registration too — that is the case it is for. */}
          {(lead.status === 'Qualified' || lead.status === 'Converted') && !reverting && (
            <button style={{ marginTop: 8 }} onClick={() => setReverting(true)}>
              <Icon name="refresh" size={13} /> Revert to Lead
            </button>
          )}
          {reverting && (
            <ReasonBox title={lead.oppId ? `Revert to the lead list — this removes opportunity ${lead.oppId}` : 'Revert to the lead list'}
              confirmLabel="Revert to lead" onCancel={() => setReverting(false)}
              onConfirm={(_c, note) => { store.revertLead(lead.id, note); setReverting(false) }} />
          )}
          {lead.status === 'Qualified' && (
            <>
              <button className="primary ws-action" disabled={registrationBlocked}
                title={registrationBlocked
                  ? verificationBlocked
                    ? `Complete ${previewCustomerStatus} customer verification first`
                    : (ai.missing || []).length > 0
                    ? 'Fill the missing information first'
                    : 'Resolve the low-confidence fields first'
                  : undefined}
                onClick={() => nav('/register/' + lead.id)}>
                Continue to registration <Icon name="arrowRight" size={14} />
              </button>
              {pendingLow.length > 0 && (
                <p className="ws-foot-note">
                  Blocked — {pendingLow.length} field{pendingLow.length > 1 ? 's' : ''} below the {med}% confidence threshold.
                </p>
              )}
              {lead.status === 'Qualified' && (ai.missing || []).length > 0 && (
                <p className="ws-foot-note">
                  Blocked — {ai.missing.length} missing item{ai.missing.length > 1 ? 's' : ''} still need to be filled.
                </p>
              )}
              {verificationBlocked && (
                <p className="ws-foot-note">
                  Blocked — {previewCustomerStatus} customer verification is not complete.
                </p>
              )}
            </>
          )}
          {!canAct && (
            <p className="ws-foot-note">
              Lead {lead.status.toLowerCase()} — no further action required.
            </p>
          )}
        </footer>
      </section>

      {viewing && (
        <AttachmentViewer leadId={lead.id} attachment={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Legacy detail — simple parse table + qualify-via-intake for non-AI leads.
// ---------------------------------------------------------------------------
function LegacyLeadDetail({ lead }) {
  const store = useStore()
  const nav = useNavigate()
  const drawer = useDrawer()
  const [dropping, setDropping] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [reassignTo, setReassignTo] = useState(lead.suggestedOwner || OWNERS[0])
  const p = lead.parse || {}
  const reassign = () => store.updateLead(lead.id, {
    suggestedOwner: reassignTo, assignedOwner: reassignTo,
    reassignedFrom: lead.suggestedOwner || '', reassignedAt: new Date().toISOString(),
  })

  // The lead stays 'New' until the intake form is actually submitted —
  // IntakeForm flips it to Qualified and records the created oppId.
  const qualify = () => {
    const pick = k => p[k] ?? ''
    nav('/new', {
      state: {
        leadId: lead.id,
        prefill: {
          sellTo: pick('sellTo'), category: pick('category'), location: pick('location'),
          eucName: pick('eucName'), eucLocation: pick('eucLocation'), oppName: pick('oppName'),
          owner: '', oppType: pick('oppType'), bu: pick('bu'), segment: pick('segment'),
          product: pick('product'), contactPerson: pick('contactPerson'), contactPhone: pick('contactPhone'),
          // The enquiry's sender becomes the proposal's recipient.
          contactEmail: lead.from || '',
        },
      },
    })
  }

  return (
    <div className="form-card" style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <b>{lead.subject}</b>
        <span className="spacer" style={{ flex: 1 }} />
        <span className={`pill ${PILL[lead.status] || 'Blue'}`}>{lead.status}</span>
      </div>
      <p className="hint" style={{ margin: '4px 0 10px' }}>
        From {lead.from} · {lead.channel} · {ddMmmYY((lead.ts || '').slice(0, 10))}
      </p>
      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', background: 'var(--bg-app)', border: '1px solid var(--grid-line)', padding: '10px 12px', fontSize: 12.5 }}>
        {lead.body}
      </pre>
      {(lead.attachments || []).map((a, i) => (
        <div key={i} className="attach-row">
          <Icon name="fileText" size={13} />
          <span className="attach-name">{a.name}</span>
          <span className="attach-meta hint">{a.pages ? a.pages + ' p.' : a.size || ''}</span>
        </div>
      ))}

      <div className="section-title">
        <Icon name="bot" size={13} /> AI extraction <ConfBadge c={p.confidence} />
      </div>
      <div className="sheet-wrap">
        <table className="sheet">
          <tbody>
            {PARSE_FIELDS.map(([label, key]) => (
              <tr key={key}><th style={{ textAlign: 'left', width: 130 }}>{label}</th><td>{p[key] || '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {(p.items || []).length > 0 && (
        <div className="sheet-wrap" style={{ marginTop: 8 }}>
          <table className="sheet">
            <thead><tr><th>Item</th><th>P/N</th><th>Qty</th></tr></thead>
            <tbody>
              {p.items.map((it, i) => (
                <tr key={i}><td>{it.desc}</td><td>{it.pn || '—'}</td><td>{it.qty}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {p.note && <p className="hint" style={{ marginTop: 8 }}><Icon name="alert" size={12} /> {p.note}</p>}

      {lead.status === 'Qualified' && (
        <p className="hint" style={{ marginTop: 12 }}>
          <Icon name="checkCircle" size={12} /> Qualified — converted to opportunity{' '}
          {lead.oppId
            ? <span className="oppid-link" style={{ cursor: 'pointer' }}
                onClick={() => drawer.open({ type: 'opp', id: lead.oppId })}>{lead.oppId}</span>
            : '(pending intake submit)'}.
        </p>
      )}
      {lead.status === 'Dropped' && (
        <div className="warn-box" style={{ marginTop: 12 }}>
          Dropped — {lead.droppedReason || 'no reason recorded'}. Kept minimally for future analytics.
        </div>
      )}

      {lead.status === 'New' && !dropping && (
        <div className="toolbar" style={{ marginTop: 14, marginBottom: 0 }}>
          <button className="primary" onClick={qualify}>
            <Icon name="check" size={13} /> Qualify → intake form
          </button>
          <button onClick={() => setDropping(true)}>
            <Icon name="x" size={13} /> Disqualify lead
          </button>
        </div>
      )}
      {dropping && (
        <ReasonBox title="Disqualify this lead" categories={DROP_REASONS} confirmLabel="Confirm disqualify"
          onCancel={() => setDropping(false)}
          onConfirm={(category, note) => {
            store.updateLead(lead.id, { status: 'Dropped', droppedReason: `${category} — ${note}` })
            setDropping(false)
          }} />
      )}
      {(lead.status === 'Qualified' || lead.status === 'Converted') && !reverting && (
        <div className="toolbar" style={{ marginTop: 10, marginBottom: 0 }}>
          <button onClick={() => setReverting(true)}><Icon name="refresh" size={13} /> Revert to Lead</button>
        </div>
      )}
      {reverting && (
        <ReasonBox title={lead.oppId ? `Revert to the lead list — this removes opportunity ${lead.oppId}` : 'Revert to the lead list'}
          confirmLabel="Revert to lead" onCancel={() => setReverting(false)}
          onConfirm={(_c, note) => { store.revertLead(lead.id, note); setReverting(false) }} />
      )}
      {lead.status !== 'Dropped' && lead.status !== 'Converted' && (
        <div className="toolbar" style={{ marginTop: 8, marginBottom: 0 }}>
          <select value={reassignTo} onChange={e => setReassignTo(e.target.value)}>
            {OWNERS.map(owner => <option key={owner}>{owner}</option>)}
          </select>
          <button onClick={reassign}>Reassign</button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inbox — table list, or per-lead detail when /inbox/:leadId matches.
// ---------------------------------------------------------------------------
export default function Inbox() {
  const store = useStore()
  const nav = useNavigate()
  const { leadId } = useParams()
  const [q, setQ] = useState('')
  const [statusF, setStatusF] = useState('')
  const [routeF, setRouteF] = useState('')
  const [receivedF, setReceivedF] = useState('')
  const [sourceF, setSourceF] = useState('')
  const [urgencyF, setUrgencyF] = useState('')
  const [duplicateF, setDuplicateF] = useState('')
  const [completenessF, setCompletenessF] = useState('')
  const [ownerF, setOwnerF] = useState('')
  const [ageF, setAgeF] = useState('')
  const [mailTab, setMailTab] = useState('primary')
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [pasteOpen, setPasteOpen] = useState(false)
  const [simulationOpen, setSimulationOpen] = useState(false)
  const [simProjectType, setSimProjectType] = useState(PROJECT_TYPES[0])
  const [simOppType, setSimOppType] = useState(() => oppTypesForProjectType(PROJECT_TYPES[0])[0] || PROJECT_TYPES[0])
  const [simCategory, setSimCategory] = useState('') // temporary test override
  const [simShape, setSimShape] = useState('')      // template key, '' = any shape
  const [simQuality, setSimQuality] = useState('')  // '' = varied | clean | partial | duplicate
  const [simRegister, setSimRegister] = useState(true)
  // Sales owners see only their assigned leads by default; a "Show all" toggle
  // reveals the team's. Managers (LJS/AH) and admins always see everything.
  // The toggle lives in the store, not in component state: as component state a
  // reload reset it, and a lead the simulator routed to another owner then read
  // as "never saved".
  const showAll = !!store.inboxShowAll
  const setShowAll = on => store.setInboxShowAll(on)
  const [showArchive, setShowArchive] = useState(false)
  const seesAll = isAdminRole(store.role) || isApprover(store.role)

  const sel = leadId ? store.leads.find(l => l.id === leadId) : null
  // Opening a New lead marks it read, but does not qualify or otherwise change
  // its workflow status. The notification badge therefore behaves like mail:
  // it clears when the message is opened, while the lead remains New until a
  // salesperson makes a decision.
  useEffect(() => {
    if (sel?.status === 'New' && !sel.readAt) {
      store.updateLead(sel.id, { readAt: new Date().toISOString() })
    }
  }, [sel?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (sel) {
    const age = ageDays((sel.ts || '').slice(0, 10))
    return (
      <div className="lead-workspace">
        <div className="ws-topbar">
          <button className="ws-back" onClick={() => nav('/inbox')}>
            <Icon name="inbox" size={13} /> Back to inbox
          </button>
          <div className="ws-topbar-title">
            <h2>{sel.subject}</h2>
            <div className="ws-topbar-meta">
              {sel.ref && <span className="ws-tag">{sel.ref}</span>}
              <span>{sel.sender || sel.from}</span>
              <span>·</span>
              <span>{ddMmmYY((sel.ts || '').slice(0, 10))}</span>
              {age != null && <><span>·</span><span>{age} d old</span></>}
            </div>
          </div>
          <span className={`pill ${PILL[sel.status] || 'Blue'}`}>{sel.status}</span>
      </div>
        {sel.ai
          ? <AiLeadDetail lead={sel} />
          : <><LeadWorkflowBar lead={sel} /><div className="ws-grid single"><section className="ws-col"><div className="ws-body">
              <LegacyLeadDetail lead={sel} />
            </div></section></div></>}
      </div>
    )
  }

  const listSource = showArchive ? (store.leadArchive || []) : store.leads
  // Sales owners: only their assigned leads unless "Show all" is ticked. Kept
  // apart from the column filters so the list can say how many rows the rule is
  // holding back — silently omitting them is what made a saved lead look lost.
  const ownerVisible = l => seesAll || showAll || l.suggestedOwner === store.role
  const matchesFilters = l => {
    if (q) {
      const hay = `${l.subject} ${l.sender || ''} ${l.from} ${l.ref || ''}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    if (statusF && l.status !== statusF) return false
    const source = l.source || l.channel || ''
    const route = l.route || l.parse?.oppType || ''
    const completeness = l.completeness ?? (l.parse?.confidence != null ? Math.round(l.parse.confidence * 100) : null)
    const age = ageDays((l.ts || '').slice(0, 10))
    if (sourceF && source !== sourceF) return false
    if (routeF && route !== routeF) return false
    if (urgencyF && (l.urgency || 'Normal') !== urgencyF) return false
    if (duplicateF && (l.duplicateRisk || 'Low') !== duplicateF) return false
    if (ownerF && (l.suggestedOwner || 'Unassigned') !== ownerF) return false
    if (completenessF) {
      if (completeness == null) return false
      if (completenessF === 'high' && completeness < 90) return false
      if (completenessF === 'medium' && (completeness < 60 || completeness >= 90)) return false
      if (completenessF === 'low' && completeness >= 60) return false
    }
    if (receivedF) {
      const maxAge = receivedF === 'today' ? 0 : receivedF === '7' ? 6 : 29
      if (age == null || age > maxAge) return false
    }
    if (ageF) {
      if (age == null) return false
      if (ageF === 'today' && age !== 0) return false
      if (ageF === '7' && (age < 7 || age > 29)) return false
      if (ageF === '30' && age < 30) return false
    }
    return true
  }
  const matchesTab = l => {
    if (mailTab === 'unread') return l.status === 'New' && !l.readAt
    if (mailTab === 'qualified') return l.status === 'Qualified'
    return true
  }

  const rows = listSource.filter(l => ownerVisible(l) && matchesFilters(l))
  const mailboxRows = rows.filter(matchesTab)
  // Rows this tab would show if they were yours. Surfaced rather than dropped.
  const hiddenByOwner = listSource.filter(l => !ownerVisible(l) && matchesFilters(l) && matchesTab(l)).length
  const toggleSelected = id => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const selectVisible = () => setSelectedIds(prev => {
    const next = new Set(prev)
    const allSelected = mailboxRows.length > 0 && mailboxRows.every(l => next.has(l.id))
    mailboxRows.forEach(l => allSelected ? next.delete(l.id) : next.add(l.id))
    return next
  })
  const setReadForSelected = read => {
    selectedIds.forEach(id => store.updateLead(id, { readAt: read ? new Date().toISOString() : null }))
    setSelectedIds(new Set())
  }
  const deleteSelected = () => {
    const selected = listSource.filter(l => selectedIds.has(l.id))
    if (!selected.length) return
    const deletable = selected.filter(l => !l.oppId)
    const protectedCount = selected.length - deletable.length
    if (!deletable.length) {
      window.alert('These leads are linked to opportunities and cannot be deleted. Use the opportunity workflow instead.')
      return
    }
    const suffix = protectedCount ? ` ${protectedCount} linked lead${protectedCount === 1 ? '' : 's'} will be kept.` : ''
    if (!window.confirm(`Delete ${deletable.length} selected lead${deletable.length === 1 ? '' : 's'} permanently? Attachments and inbox history will also be removed.${suffix}`)) return
    deletable.forEach(l => store.deleteLead(l.id))
    setSelectedIds(new Set())
  }
  const simOppOptions = oppTypesForProjectType(simProjectType)
  const activeSimOppType = simOppOptions.includes(simOppType) ? simOppType : (simOppOptions[0] || simProjectType)
  // The shape list follows the type selection; a shape left over from another
  // selection silently reads as "Any shape" rather than pinning a wrong type.
  const simShapeOptions = templatesForSelection(simProjectType, activeSimOppType)
  const activeSimShape = simShapeOptions.some(t => t.key === simShape) ? simShape : ''

  const createSimulatedLead = (status, options = {}) => {
    const projectType = options.projectType || simProjectType
    const oppType = options.oppType || activeSimOppType
    const lead = simulatedLead(status, new Date(), {
      existingLeads: store.leads,
      config: store.config,
      projectType,
      oppType,
      customerCategory: options.customerCategory || simCategory || null,
      // A randomised call (Random inquiry) picks its own type, so the pinned
      // shape from the dialog would not fit it.
      template: options.projectType ? null : (activeSimShape || null),
      quality: options.quality !== undefined ? options.quality : (simQuality || null),
    })
    store.addLead(lead)
    // Owner comes from the L-05-AI region rules, so a generated lead can land
    // with someone else. Without this the sales owner's filtered list would
    // silently drop the row they just created.
    if (!seesAll && lead.suggestedOwner !== store.role) setShowAll(true)
    if (!simRegister) {
      // Stop at the inbox: the class gates (KYC / fee / joint approval) are
      // walked manually from the New lead itself.
      setSimulationOpen(false)
      nav('/inbox/' + lead.id)
      return
    }
    const value = pattern => leadFieldValue(lead.ai?.fields, pattern)
    const owner = lead.assignedOwner || lead.suggestedOwner || store.role
    const sellTo = value(/sell-to customer|customer/i) || lead.sellTo || lead.sender || 'Simulated customer'
    const category = value(/category/i) || 'EUC'
    const location = value(/^location$/i) || lead.location || ''
    const resolvedOppType = OPP_TYPES.includes(lead.oppType) ? lead.oppType : (oppType || lead.route || 'Project')
    const product = value(/^product$/i) || 'Various'
    const knownCustomer = store.customers.some(c => c.name.toLowerCase() === sellTo.toLowerCase())
    const oppId = nextOppId(store.opportunities, owner)
    const today = new Date().toISOString().slice(0, 10)
    const maxSl = Math.max(0, ...store.opportunities.map(o => o.sl || 0))
    if (!knownCustomer) store.addCustomer({ name: sellTo, category, status, kyc: status === 'Green' ? 'Verified' : 'Pending', payment: '—' })
    const opp = {
      sl: maxSl + 1, id: oppId, sourceLeadId: lead.id, sellTo, category, location,
      customerStatus: status, eucName: value(/contact person/i) || sellTo, eucLocation: location,
      oppName: lead.subject, owner, oppType: resolvedOppType, bu: value(/^bu/i) || 'Energy',
      segment: value(/segment/i) || 'Others', product: [product], prob: '', valueK: 0, cogsK: 0,
      rfqNumber: lead.ref || '', rfqDate: lead.ts?.slice(0, 10) || '', createDate: today,
      proposalDate: '', orderDate: '', invoiceDate: '', status: 'Open', stage: 'Lead', closedReason: '',
      contactPerson: value(/contact person/i) || lead.sender || '', contactPhone: '', contactEmail: lead.from || '',
      lastUpdated: today, forecast: false, remarks: lead.body || '', nextActionOwner: '', simulated: true,
    }
    store.addOpportunity(opp)
    if (routeForType(resolvedOppType) !== 'Service') {
      const { extracted, workbenchRows, bom } = buildLeadProposalData(lead, store.priceLists)
      store.addSparesLinesFromLead(oppId, workbenchRows)
      const proposal = newProposal(oppId, opp)
      store.saveProposal(oppId, {
        ...proposal,
        rfqNumber: lead.ref || '', subject: lead.subject || proposal.subject,
        project: lead.subject || proposal.project, units: 1, bom, extractedItems: extracted,
        ...(bom.length ? { leadImportId: lead.id } : {}),
      })
    }
    store.updateLead(lead.id, { status: 'Converted', oppId })
    setSimulationOpen(false)
    nav('/inbox')
  }
  const createRandomSimulatedLead = () => {
    const projectType = PROJECT_TYPES[Math.floor(Math.random() * PROJECT_TYPES.length)]
    const oppTypes = oppTypesForProjectType(projectType)
    const oppType = oppTypes[Math.floor(Math.random() * oppTypes.length)] || projectType
    const status = SIMULATED_CUSTOMER_SCENARIOS[Math.floor(Math.random() * SIMULATED_CUSTOMER_SCENARIOS.length)].status
    createSimulatedLead(status, { projectType, oppType, quality: Math.random() < 0.33 ? 'partial' : null })
  }
  const simulatedLeadCount = simulatedCount(store.leads, store.leadArchive)
  const clearSimulated = () => {
    if (!window.confirm(`Clear ${simulatedLeadCount} simulated lead${simulatedLeadCount === 1 ? '' : 's'}?\n\n`
      + 'Only rows generated by this simulator go. Seeded and hand-entered leads stay, '
      + 'and a simulated lead already converted to an opportunity is kept.')) return
    store.clearSimulatedLeads()
    setSimulationOpen(false)
  }
  const tabCount = tab => rows.filter(l => tab === 'unread'
    ? l.status === 'New' && !l.readAt
    : tab === 'qualified' ? l.status === 'Qualified' : true).length
  const sourceOptions = [...new Set(listSource.map(l => l.source || l.channel).filter(Boolean))].sort()
  const ownerOptions = [...new Set(listSource.map(l => l.suggestedOwner || 'Unassigned'))].sort()
  const filterSelect = (value, onChange, label, options, short) => (
    <select className={`mail-head-filter ${value ? 'active' : ''}`} value={value} onChange={e => onChange(e.target.value)}
      aria-label={`Filter by ${label}`} title={`Filter by ${label}`}>
      <option value="">{short || label}</option>{options.map(o => Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o}>{o}</option>)}
    </select>
  )

  return (
    <div className="page mailbox-page">
      <div className="mailbox-head">
        <div>
          <h2><Icon name="inbox" size={18} /> Lead Inbox</h2>
          <p className="hint">{showArchive ? 'Discarded lead archive' : 'Common sales mailbox · AI structures, humans decide'}</p>
        </div>
        <div className="mailbox-head-actions">
          <button onClick={() => setSimulationOpen(true)}><Icon name="mail" size={13} /> Simulate incoming inquiry</button>
          <button className="primary" onClick={() => setPasteOpen(true)}><Icon name="bot" size={13} /> New enquiry</button>
          <button onClick={() => { setShowArchive(v => !v); setMailTab('primary'); setSelectedIds(new Set()) }}>
            <Icon name="folder" size={13} /> {showArchive ? 'Back to inbox' : `Archive (${(store.leadArchive || []).length})`}
          </button>
        </div>
      </div>
      <div className="mail-search-row">
        <div className="mail-search"><Icon name="search" size={16} /><input placeholder="Search mail" value={q} onChange={e => setQ(e.target.value)} /></div>
        <select value={statusF} onChange={e => setStatusF(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>{STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={routeF} onChange={e => setRouteF(e.target.value)} aria-label="Filter by route">
          <option value="">All routes</option>{ROUTE_OPTIONS.map(r => <option key={r}>{r}</option>)}
        </select>
        {!seesAll && <label className="mail-show-all"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Show all</label>}
      </div>
      {pasteOpen && <PasteLeadModal onClose={() => setPasteOpen(false)} />}
      {simulationOpen && (
        <Modal title="Simulate incoming inquiry" className="simulate-modal" onClose={() => setSimulationOpen(false)}>
          <p className="hint">
            Choose the project type first, then the opportunity type. Optionally pin an
            enquiry shape and an extraction quality, and decide whether the inquiry
            registers an opportunity immediately or stops in the inbox as a New lead.
            Clicking a customer class below generates it.
          </p>
          <div className="sim-controls">
            <label className="afield">Project type
              <select value={simProjectType} onChange={e => setSimProjectType(e.target.value)}>
                {PROJECT_TYPES.map(type => <option key={type}>{type}</option>)}
              </select>
            </label>
            <label className="afield">Opportunity type
              <select value={activeSimOppType} onChange={e => setSimOppType(e.target.value)}>
                {simOppOptions.map(type => <option key={type}>{type}</option>)}
              </select>
            </label>
            <label className="afield">Customer category (test)
              <select value={simCategory} onChange={e => setSimCategory(e.target.value)}>
                <option value="">Use scenario category</option>
                {CUSTOMER_CATEGORY_OPTIONS.map(category => <option key={category}>{category}</option>)}
              </select>
            </label>
            <label className="afield wide">Enquiry shape
              <select value={activeSimShape} onChange={e => setSimShape(e.target.value)}>
                <option value="">Any shape (varied)</option>
                {simShapeOptions.map(t => <option key={t.key} value={t.key}>{t.subject}</option>)}
              </select>
            </label>
            <label className="afield">Extraction quality
              <select value={simQuality} onChange={e => setSimQuality(e.target.value)}>
                <option value="">Varied (weighted)</option>
                <option value="clean">Complete extraction</option>
                <option value="partial">Missing info — needs clarification</option>
                <option value="duplicate">Duplicate — chaser on an existing enquiry</option>
              </select>
            </label>
            <label className="afield">After generating
              <select value={simRegister ? 'register' : 'inbox'} onChange={e => setSimRegister(e.target.value === 'register')}>
                <option value="register">Register the opportunity immediately</option>
                <option value="inbox">Stop at the inbox as a New lead</option>
              </select>
            </label>
          </div>
          <div className="sim-cards">
            {SIMULATED_CUSTOMER_SCENARIOS.map(scenario => (
              <button key={scenario.status} className="form-card" onClick={() => createSimulatedLead(scenario.status)}>
                <b>{scenario.label}</b>
                <span className="hint">{scenario.hint}</span>
              </button>
            ))}
            <button className="form-card wide" onClick={createRandomSimulatedLead}>
              <b>Random inquiry</b>
              <span className="hint">
                Any customer class, any scope — fill the inbox with a varied mix
              </span>
            </button>
          </div>
          {simulatedLeadCount > 0 && (
            <div className="lead-decision-actions" style={{ marginTop: 12 }}>
              <button onClick={clearSimulated}>
                <Icon name="x" size={13} /> Clear {simulatedLeadCount} simulated lead{simulatedLeadCount === 1 ? '' : 's'}
              </button>
            </div>
          )}
        </Modal>
      )}

      <div className="mail-tabs" role="tablist" aria-label="Mailbox views">
        {[['primary', 'Primary'], ['unread', 'Unread'], ['qualified', 'Qualified']].map(([key, label]) => (
          <button key={key} role="tab" aria-selected={mailTab === key} className={mailTab === key ? 'active' : ''} onClick={() => setMailTab(key)}>
            <span>{label}</span><b>{tabCount(key)}</b>
          </button>
        ))}
      </div>

      <div className="mailbox-list">
        <div className="mail-list-toolbar">
          <label className="mail-check"><input type="checkbox" checked={mailboxRows.length > 0 && mailboxRows.every(l => selectedIds.has(l.id))} onChange={selectVisible} aria-label="Select visible messages" /></label>
          <button className="mail-icon-btn" title="Refresh" onClick={() => window.location.reload()}><Icon name="refresh" size={15} /></button>
          <button className="mail-icon-btn" title="More actions"><Icon name="list" size={15} /></button>
          {selectedIds.size > 0 && <span className="mail-selection-count">{selectedIds.size} selected</span>}
          {selectedIds.size > 0 && <>
            <button className="mail-icon-btn" title="Mark as read" onClick={() => setReadForSelected(true)}><Icon name="mail" size={15} /></button>
            <button className="mail-icon-btn" title="Mark as unread" onClick={() => setReadForSelected(false)}><Icon name="eye" size={15} /></button>
            <button className="mail-icon-btn mail-delete-btn" title="Delete selected leads" onClick={deleteSelected}><Icon name="trash" size={15} /></button>
          </>}
          {hiddenByOwner > 0 && (
            <button className="mail-hidden-note" onClick={() => setShowAll(true)}
              title="These leads exist — they are assigned to another owner">
              <Icon name="eye" size={12} /> {hiddenByOwner} more assigned to others — show
            </button>
          )}
          <span className="mail-list-count">{mailboxRows.length ? `1–${mailboxRows.length} of ${mailboxRows.length}` : '0 messages'}</span>
        </div>
        <div className="mail-column-head">
          <span></span><span></span><span><select className={`mail-head-filter ${receivedF ? 'active' : ''}`} value={receivedF} onChange={e => setReceivedF(e.target.value)} aria-label="Filter by received date"><option value="">Received</option><option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></span>
          <span>{filterSelect(sourceF, setSourceF, 'Source / sender', sourceOptions)}</span><span title="Subject / preview">Subject / preview</span>
          <span>{filterSelect(routeF, setRouteF, 'AI route', ROUTE_OPTIONS)}</span>
          <span>{filterSelect(urgencyF, setUrgencyF, 'Urgency', ['Normal', 'Urgent'])}</span>
          <span>{filterSelect(duplicateF, setDuplicateF, 'Dup. risk', ['Low', 'Medium', 'High'])}</span>
          <span>{filterSelect(completenessF, setCompletenessF, 'Completeness', [['high', 'High ≥90%'], ['medium', 'Medium 60–89%'], ['low', 'Low <60%']], 'Complete')}</span>
          <span>{filterSelect(ownerF, setOwnerF, 'Sugg. owner', ownerOptions, 'Owner')}</span>
          <span>{filterSelect(statusF, setStatusF, 'Status', STATUS_OPTIONS)}</span>
          <span>{filterSelect(ageF, setAgeF, 'Age', [['today', 'Today'], ['7', '7–29 days'], ['30', '30+ days']])}</span>
        </div>
        {mailboxRows.map(l => {
          const completeness = l.completeness ?? (l.parse?.confidence != null ? Math.round(l.parse.confidence * 100) : null)
          const route = l.route || l.parse?.oppType || '—'
          const unread = l.status === 'New' && !l.readAt
          return (
            <div key={l.id} className={`mail-row ${unread ? 'unread' : ''} ${selectedIds.has(l.id) ? 'selected' : ''}`} onClick={() => nav('/inbox/' + l.id)}>
              <label className="mail-check" onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(l.id)} onChange={() => toggleSelected(l.id)} aria-label={`Select ${l.subject}`} /></label>
              <button className={`mail-star ${l.starred ? 'starred' : ''}`} title={l.starred ? 'Remove star' : 'Star'} onClick={e => { e.stopPropagation(); store.updateLead(l.id, { starred: !l.starred }) }}><Icon name="star" size={15} /></button>
              <div className="mail-date"><b>{ddMmmYY((l.ts || '').slice(0, 10))}</b><small>{receivedTime(l.ts)}</small></div>
              <div className="mail-sender" title={[l.source || l.channel || 'Common mailbox', l.sender || l.from].filter(Boolean).join(' — ')}><b>{l.source || l.channel || 'Common mailbox'}</b><small>{l.sender || l.from}</small></div>
              <div className="mail-content" title={l.subject}><b>{l.subject}</b>{l.ref && <span className="mail-ref"> · {l.ref}</span>}<small>{l.ai?.summary || l.body?.replace(/\s+/g, ' ').slice(0, 130) || 'No preview available'}</small></div>
              <div><Chip tone="grey">{route}</Chip></div>
              <div><Chip tone={l.urgency === 'Urgent' ? 'state-Rejected' : 'grey'}>{l.urgency || 'Normal'}</Chip></div>
              <div><Chip tone={l.duplicateRisk === 'Medium' || l.duplicateRisk === 'High' ? 'conf-med' : 'grey'}>{l.duplicateRisk || 'Low'}</Chip></div>
              <div>{completeness != null ? <ConfChip conf={completeness} thresholds={store.config.aiThresholds} /> : '—'}</div>
              <div className="mail-owner">{l.suggestedOwner || '—'}</div>
              <div><span className={`pill ${PILL[l.status] || 'Blue'}`}>{l.status}</span></div>
              <div className="mail-age">{ageDays((l.ts || '').slice(0, 10))} d</div>
            </div>
          )
        })}
        {!mailboxRows.length && (
          <div className="mail-empty">
            <Icon name="mail" size={28} />
            {hiddenByOwner > 0 ? <>
              <b>{hiddenByOwner} lead{hiddenByOwner === 1 ? '' : 's'} here, none assigned to you</b>
              <span>Leads are routed to an owner by the AI region rules, so a lead you created can belong to someone else.</span>
              <button className="primary" onClick={() => setShowAll(true)}>Show all leads</button>
            </> : <>
              <b>No messages here</b>
              <span>Try another mailbox tab or change your filters.</span>
            </>}
          </div>
        )}
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        Dropped leads are kept as a minimal record — reason and source only — for future demand analytics.
      </p>
    </div>
  )
}
