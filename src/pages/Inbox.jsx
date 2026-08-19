import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ddMmmYY, ageDays } from '../utils.js'
import { Icon } from '../icons.jsx'
import { useDrawer } from '../drawer.jsx'
import { Chip, ConfChip, WarnBox, ErrBox, Modal } from '../ui.jsx'
import { ROLES, OWNERS, OPP_TYPES, BUS, SEGMENTS, PRODUCTS, CUSTOMER_STATUSES, ownerForOppType, routeForType } from '../seed.js'
import { isAdminRole, isApprover } from '../utils.js'
import { aiEnabled, runJson } from '../ai.js'
import { extractDocText } from '../docText.js'
import { fmtSize } from '../filestore.js'
import { hold, add as holdMore } from '../leadFiles.js'
import AttachmentViewer from '../AttachmentViewer.jsx'
import { findDuplicates } from '../insights.js'
import { leadWorkflow } from '../leadWorkflow.js'
import { isFastTrackLead, routeOwner } from '../leadRules.js'
import { BLUE_KYC_ITEMS, leadVerificationComplete, verificationDeadline, verificationItem } from '../leadVerification.js'
import { SIMULATED_CUSTOMER_SCENARIOS, simulatedLead } from '../simulatedLeads.js'

// Common-mailbox lead inbox: AI parses each inquiry, a human decides whether it
// becomes an opportunity (Qualify → registration / intake form) or is dropped.
const PILL = { New: 'Blue', Qualified: 'Amber', Dropped: 'Red', Converted: 'Green' }
const STATUS_OPTIONS = ['New', 'Qualified', 'Converted', 'Dropped']
const ROUTE_OPTIONS = ['Project', 'Spares', 'Service']
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
export async function extractLead({ from, subject, body, attachments = [] }, store) {
  const ai = await runJson('lead.extract', {
    from, subject, body, attachments,
    customers: (store.customers || []).map(c => c.name),
    ownershipRules: store.config?.ownershipRules || [],
  }, { fallback: store.config?.aiModel?.provider === 'Built-in fallback' })
  // The proxy is optional in demo/staging builds. Keep the intake usable when
  // it is absent or temporarily unavailable: preserve only facts present in
  // the pasted mail and leave the lead visibly pending human structure.
  if (!ai?.fields?.length) {
    const text = `${subject || ''}\n${body || ''}`
    const lower = text.toLowerCase()
    const route = /spare|sensor|probe|cable|replacement|part number/.test(lower)
      ? 'Spares'
      : /service|repair|maintenance|amc|troubleshoot/.test(lower)
        ? 'Service'
        : 'Project'
    const fields = []
    if (from?.trim()) fields.push({ group: 'Customer', k: 'Sender', v: from.trim(), conf: 45, ev: 'From address', note: 'Confirm the customer and contact person.' })
    if (subject?.trim()) fields.push({ group: 'RFQ', k: 'Subject', v: subject.trim(), conf: 55, ev: 'Email subject', note: 'Confirm the opportunity name and route.' })
    if (body?.trim()) fields.push({ group: 'RFQ', k: 'Email body', v: body.trim().slice(0, 500), conf: 35, ev: 'Email body', note: 'Structure the requested scope and quantities.' })
    return {
      route,
      urgency: 'Normal',
      completeness: fields.length ? 20 : 0,
      suggestedOwner: ownerForOppType(route === 'Spares' ? 'Spares' : route === 'Service' ? 'Service' : 'Project'),
      ai: {
        summary: 'AI extraction was unavailable. The original enquiry was saved for manual structuring.',
        fields: fields.map(f => ({ ...f, state: 'pending' })),
        missing: ['Customer name', 'Opportunity scope', 'Required quantities and specifications'],
        duplicates: [],
        next: ['Confirm the customer and opportunity route', 'Structure the requested scope', 'Add missing quantities and specifications'],
      },
    }
  }
  const inferredOwner = ownerForOppType(ai.route === 'Spares' ? 'Spares' : ai.route === 'Service' ? 'Service' : 'Project')
  const owner = ROLES[ai.suggestedOwner]?.sales
    ? ai.suggestedOwner
    : inferredOwner
  return {
    route: ai.route || 'Spares',
    urgency: ai.urgency || 'Normal',
    completeness: Math.max(0, Math.min(100, Math.round(ai.completeness ?? 0))),
    suggestedOwner: owner,
    ai: {
      summary: ai.summary || '',
      fields: ai.fields.map(f => ({ ...f, conf: Math.max(0, Math.min(100, Math.round(f.conf ?? 0))), state: 'pending' })),
      missing: ai.missing || [],
      duplicates: [],
      next: ai.next || [],
    },
  }
}

// Attachment text kept on the lead — the store persists to localStorage, so the
// whole document is not carried; this is enough for the AI and for evidence.
const TEXT_PER_FILE = 8000
const TEXT_TOTAL = 40000

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
  if (text) rec.text = text.slice(0, TEXT_PER_FILE)
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

// Paste a real inbound enquiry and let Gemini structure it.
function PasteLeadModal({ onClose }) {
  const store = useStore()
  const nav = useNavigate()
  const fileInput = useRef(null)
  const [from, setFrom] = useState('')
  const [subject, setSubject] = useState('')
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
    id, ts: new Date().toISOString(), channel: 'Email', source: 'Common mailbox',
    from: from || 'unknown@sender', sender: from || 'Unknown sender',
    subject: subject || '(no subject)', body, attachments: attachmentMeta(files),
    status: 'New',
  })

  const add = async () => {
    if (!body.trim() && !files.length) { setErr('Paste the email body, or attach the enquiry document.'); return }
    setBusy(true); setErr('')
    const extracted = await extractLead({ from, subject, body, attachments: attachmentMeta(files) }, store)
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
        <label>From</label>
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

const customerStatusForLead = (lead, customers) =>
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

function LeadWorkflowBar({ lead }) {
  const store = useStore()
  const customer = matchCustomer(store.customers, lead)
  const progress = leadWorkflow(lead, {
    customerStatus: lead.customerStatus || customer?.status || '',
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
  const [reExtracting, setReExtracting] = useState(false)
  const [reErr, setReErr] = useState('')
  const [reNote, setReNote] = useState('')
  const [viewing, setViewing] = useState(null)   // attachment record open in the viewer
  const [addingDocs, setAddingDocs] = useState(false)
  const [docDrag, setDocDrag] = useState(false)
  const [docErr, setDocErr] = useState('')
  const docInput = useRef(null)
  const [dropping, setDropping] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [decisionErr, setDecisionErr] = useState('')
  const [reassignTo, setReassignTo] = useState(lead.suggestedOwner || OWNERS[0])
  const initialDecisions = () => ({
    region: lead.region || lead.location || leadFieldValue(ai.fields, /location|region/i),
    owner: lead.assignedOwner || lead.suggestedOwner || routeOwner(lead.region || lead.location || leadFieldValue(ai.fields, /location|region/i), store.config, OWNERS[0]),
    oppType: leadFieldValue(ai.fields, /opp type/i) || (lead.route === 'Service' ? 'Service' : lead.route === 'Project' ? 'Project' : 'Spares'),
    customerStatus: lead.customerStatus || customerStatusForLead(lead, store.customers),
    bu: leadFieldValue(ai.fields, /^bu$/i) || 'Energy',
    segment: leadFieldValue(ai.fields, /segment/i) || 'Others',
    product: leadFieldValue(ai.fields, /^product$/i) || 'Various',
  })
  const [decisionDraft, setDecisionDraft] = useState(initialDecisions)
  const [decisionSaved, setDecisionSaved] = useState(false)

  // Re-read the mail (plus whatever documents are now on the lead).
  // `keepDecisions` is the automatic path taken after a document is added: the
  // human did not ask to throw their decisions away, they asked the AI to read
  // one more file. The manual button still replaces everything, confirmed first.
  const runExtraction = async ({ source, keepDecisions, detail }) => {
    setReExtracting(true); setReErr(''); setReNote('')
    const extracted = await extractLead(source, store)
    setReExtracting(false)
    if (!extracted) {
      setReErr('Extraction unavailable — the previous result is unchanged.')
      return false
    }
    const next = keepDecisions && extracted.ai
      ? { ...extracted, ai: { ...extracted.ai, fields: mergeDecidedFields(source.ai?.fields, extracted.ai.fields) } }
      : extracted
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
      source: { ...lead, attachments: nextAttachments },
      keepDecisions: true,
      detail: `AI re-read the lead with ${names}`,
    })
  }

  const customer = matchCustomer(store.customers, lead)
  const isRed = lead.redFlag || lead.customerStatus === 'Red' || customer?.status === 'Red'
  const redApproval = store.approvals.find(a => a.leadId === lead.id && a.type === 'Red customer clearance')
  const redCleared = redApproval && ['Approved', 'Approved with conditions'].includes(redApproval.status)

  const groups = [...new Set(ai.fields.map(f => f.group))]
  const pendingLow = ai.fields.filter(f => f.state === 'pending' && f.conf < med)

  const patchField = (idx, patch) => {
    const field = ai.fields[idx]
    store.updateLead(lead.id, {
      ai: { ...ai, fields: ai.fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)) },
    }, `AI field "${field?.k || 'unknown'}" updated`)
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
  const canAct = !['Converted', 'Dropped'].includes(lead.status)
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
      'Location', decisionDraft.region, 'Customer'), 'Opp Type', decisionDraft.oppType),
      'BU / Segment', `${decisionDraft.bu} / ${decisionDraft.segment}`), 'Product', decisionDraft.product)
    const changed = Object.keys(decisionDraft)
      .filter(key => previous[key] !== decisionDraft[key])
      .map(key => `${key}: ${previous[key] || '—'} → ${decisionDraft[key] || '—'}`)
    if (!changed.length) { setDecisionSaved(true); return }
    store.updateLead(lead.id, {
      region: decisionDraft.region,
      location: decisionDraft.region,
      suggestedOwner: decisionDraft.owner,
      assignedOwner: decisionDraft.owner,
      ownerOverrideReason: isOverride ? lead.ownerOverrideReason.trim() : '',
      fastTrack: isFastTrackLead({ ...lead, customerStatus: decisionDraft.customerStatus }, store.config, customer),
      fastTrackStartedAt: isFastTrackLead({ ...lead, customerStatus: decisionDraft.customerStatus }, store.config, customer) ? (lead.fastTrackStartedAt || new Date().toISOString()) : lead.fastTrackStartedAt,
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

  return (
    <div className="ws-grid">
      {/* ---- Column 1 — original email ---- */}
      <section className="ws-col">
        <header className="ws-head">
          <span className="ws-head-icon blue"><Icon name="mail" size={13} /></span>
          <span className="ws-head-title">Original email</span>
          <span className="ws-head-meta">{lead.source || lead.channel || 'Common mailbox'}</span>
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
          {reErr && <ErrBox>{reErr}</ErrBox>}
          {reNote && !reErr && <p className="hint"><Icon name="checkCircle" size={12} /> {reNote}</p>}

          {ai.missing?.length > 0 && (
            <WarnBox>
              <b>Missing information</b>
              <ul>{ai.missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </WarnBox>
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
              <label>Region / location
                <input value={decisionDraft.region} disabled={lead.status === 'Dropped'}
                  onChange={e => setDecisionDraft({ ...decisionDraft, region: e.target.value })} placeholder="Enter region or location" />
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
                  onChange={e => setDecisionDraft({ ...decisionDraft, customerStatus: e.target.value })}>
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
            {isFastTrackLead(lead, store.config, customer) && <div className="okbox" style={{ marginTop: 8 }}>Fast-track enabled for this Green customer.</div>}
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
              {redApproval
                ? <>Approval <b>{redApproval.id}</b> is <b>{redApproval.status}</b>.{' '}
                    <button onClick={() => nav('/approvals')}>Open approvals</button></>
                : <button onClick={() => store.requestApproval({
                    leadId: lead.id, oppId: '', type: 'Red customer clearance',
                    detail: `${customer?.name || lead.sender || lead.from} (Red) — ${lead.subject}. Continuation needs joint LJS + AH clearance before any opportunity ID is generated.`,
                    approver: 'LJS', needed: ['LJS', 'AH'],
                  })}>Request joint approval</button>}
            </ErrBox>
          )}
          {isRed && redCleared && (
            <div className="okbox">
              Red gate cleared — {redApproval.id} <b>{redApproval.status}</b>.
              {redApproval.status === 'Approved with conditions' && ' Proceed on prepayment-only conditions.'}
            </div>
          )}

          <LeadVerification lead={lead} customerStatus={lead.customerStatus || customer?.status || 'Blue'} store={store} />

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
        </div>

        <footer className="ws-foot">
          {canAct && lead.status !== 'Qualified' && (
            <>
              {isFastTrackLead(lead, store.config, customer) && (
                <button className="primary ws-action" disabled={qualifyBlocked}
                  title={qualifyBlocked ? 'Blocked: Red continuation approval required first' : undefined}
                  onClick={() => {
                    store.updateLead(lead.id, { status: 'Qualified', fastTrack: true, fastTrackStartedAt: lead.fastTrackStartedAt || new Date().toISOString() }, 'Green customer fast-track started')
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
              <button className="primary ws-action" disabled={pendingLow.length > 0}
                title={pendingLow.length ? 'Resolve the low-confidence fields first' : undefined}
                onClick={() => nav('/register/' + lead.id)}>
                Continue to registration <Icon name="arrowRight" size={14} />
              </button>
              {pendingLow.length > 0 && (
                <p className="ws-foot-note">
                  Blocked — {pendingLow.length} field{pendingLow.length > 1 ? 's' : ''} below the {med}% confidence threshold.
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
      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', background: '#f8fafc', border: '1px solid var(--grid-line)', padding: '10px 12px', fontSize: 12.5 }}>
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
  // Sales owners see only their assigned leads by default; a "Show all" toggle
  // reveals the team's. Managers (LJS/AH) and admins always see everything.
  const [showAll, setShowAll] = useState(false)
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
        <LeadWorkflowBar lead={sel} />
        {sel.ai
          ? <AiLeadDetail lead={sel} />
          : <div className="ws-grid single"><section className="ws-col"><div className="ws-body">
              <LegacyLeadDetail lead={sel} />
            </div></section></div>}
      </div>
    )
  }

  const listSource = showArchive ? (store.leadArchive || []) : store.leads
  const rows = listSource.filter(l => {
    // Sales owners: only their assigned leads unless "Show all" is ticked.
    if (!seesAll && !showAll && l.suggestedOwner !== store.role) return false
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
  })

  const mailboxRows = rows.filter(l => {
    if (mailTab === 'unread') return l.status === 'New' && !l.readAt
    if (mailTab === 'qualified') return l.status === 'Qualified'
    return true
  })
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
  const createSimulatedLead = status => {
    const lead = simulatedLead(status)
    store.addLead(lead)
    setSimulationOpen(false)
    nav('/inbox/' + lead.id)
  }
  const tabCount = tab => rows.filter(l => tab === 'unread'
    ? l.status === 'New' && !l.readAt
    : tab === 'qualified' ? l.status === 'Qualified' : true).length
  const sourceOptions = [...new Set(listSource.map(l => l.source || l.channel).filter(Boolean))].sort()
  const ownerOptions = [...new Set(listSource.map(l => l.suggestedOwner || 'Unassigned'))].sort()
  const filterSelect = (value, onChange, label, options) => (
    <select className={`mail-head-filter ${value ? 'active' : ''}`} value={value} onChange={e => onChange(e.target.value)} aria-label={`Filter by ${label}`}>
      <option value="">{label}</option>{options.map(o => Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o}>{o}</option>)}
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
        <Modal title="Simulate incoming inquiry" onClose={() => setSimulationOpen(false)}>
          <p className="hint">Choose a customer class to test its complete Lead workflow.</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {SIMULATED_CUSTOMER_SCENARIOS.map(scenario => (
              <button key={scenario.status} className="form-card" style={{ textAlign: 'left', cursor: 'pointer' }}
                onClick={() => createSimulatedLead(scenario.status)}>
                <b>{scenario.label}</b>
                <span className="hint" style={{ display: 'block', marginTop: 3 }}>{scenario.hint}</span>
              </button>
            ))}
          </div>
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
          </>}
          <span className="mail-list-count">{mailboxRows.length ? `1–${mailboxRows.length} of ${mailboxRows.length}` : '0 messages'}</span>
        </div>
        <div className="mail-column-head">
          <span></span><span></span><span><select className={`mail-head-filter ${receivedF ? 'active' : ''}`} value={receivedF} onChange={e => setReceivedF(e.target.value)} aria-label="Filter by received date"><option value="">Received</option><option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></span>
          <span>{filterSelect(sourceF, setSourceF, 'Source / sender', sourceOptions)}</span><span>Subject / preview</span>
          <span>{filterSelect(routeF, setRouteF, 'AI route', ROUTE_OPTIONS)}</span>
          <span>{filterSelect(urgencyF, setUrgencyF, 'Urgency', ['Normal', 'Urgent'])}</span>
          <span>{filterSelect(duplicateF, setDuplicateF, 'Dup. risk', ['Low', 'Medium', 'High'])}</span>
          <span>{filterSelect(completenessF, setCompletenessF, 'Completeness', [['high', 'High ≥90%'], ['medium', 'Medium 60–89%'], ['low', 'Low <60%']])}</span>
          <span>{filterSelect(ownerF, setOwnerF, 'Sugg. owner', ownerOptions)}</span>
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
              <div className="mail-sender"><b>{l.source || l.channel || 'Common mailbox'}</b><small>{l.sender || l.from}</small></div>
              <div className="mail-content"><b>{l.subject}</b>{l.ref && <span className="mail-ref"> · {l.ref}</span>}<small>{l.ai?.summary || l.body?.replace(/\s+/g, ' ').slice(0, 130) || 'No preview available'}</small></div>
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
        {!mailboxRows.length && <div className="mail-empty"><Icon name="mail" size={28} /><b>No messages here</b><span>Try another mailbox tab or change your filters.</span></div>}
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        Dropped leads are kept as a minimal record — reason and source only — for future demand analytics.
      </p>
    </div>
  )
}
