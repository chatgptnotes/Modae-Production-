import React, { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ddMmmYY, ageDays } from '../utils.js'
import { Icon } from '../icons.jsx'
import { useDrawer } from '../drawer.jsx'
import { Chip, ConfChip, WarnBox, ErrBox, Modal } from '../ui.jsx'
import { ROLES } from '../seed.js'
import { isAdminRole, isApprover } from '../utils.js'
import { aiEnabled, runJson } from '../ai.js'
import { extractPdfText } from '../tenderParse.js'
import { fmtSize } from '../filestore.js'
import { hold } from '../leadFiles.js'

// Common-mailbox lead inbox: AI parses each inquiry, a human decides whether it
// becomes an opportunity (Qualify → registration / intake form) or is dropped.
const PILL = { New: 'Blue', Qualified: 'Amber', Dropped: 'Red', Converted: 'Green' }
const STATUS_OPTIONS = ['New', 'Qualified', 'Converted', 'Dropped']
const ROUTE_OPTIONS = ['Project', 'Spares', 'Service']
const DROP_REASONS = ['Outside business scope', 'Window shopping / budgetary only',
  'Duplicate inquiry', 'No response from customer', 'Other']

const confClass = c => (c >= 0.9 ? 'hi' : c >= 0.6 ? 'med' : 'lo')
const confLabel = c => (c >= 0.9 ? 'High' : c >= 0.6 ? 'Medium' : 'Low')
const ConfBadge = ({ c }) => (
  <span className={`conf-badge ${confClass(c || 0)}`}>AI · {confLabel(c || 0)}</span>
)

const simulatedLead = () => ({
  id: 'LD-' + Date.now(), ts: new Date().toISOString(), channel: 'Email',
  from: 'stores.korba@balco.example.in',
  subject: 'Quotation required — vibration sensor spares for TG-3',
  body: 'Dear ModAE team,\n\nFor our TG-3 condition monitoring system we require:\n1) 4 nos velocity sensors P/N 9200-01-05-10-00\n2) 2 nos signal cables, 9 m\n\nPlease send your best quotation with delivery to Korba, Chhattisgarh. Material required within 6 weeks.\n\nThanks & regards,\nStores Dept, BALCO Korba',
  status: 'New',
  parse: {
    sellTo: 'BALCO Korba', category: 'EUC', location: 'Korba',
    eucName: 'BALCO Korba', eucLocation: 'Korba',
    oppName: 'Vibration sensor spares — TG-3',
    oppType: 'Spares', bu: 'Energy', segment: 'Industrial', product: 'ModAE',
    contactPerson: 'Stores Dept', contactPhone: '',
    items: [
      { desc: 'Velocity sensor', pn: '9200-01-05-10-00', qty: 4 },
      { desc: 'Signal cable, 9 m', pn: '', qty: 2 },
    ],
    confidence: 0.8,
    note: 'Part numbers matched sensor family; verify cable length variant before quoting.',
  },
})

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
  })
  if (!ai?.fields?.length) return null
  const owner = ROLES[ai.suggestedOwner]
    ? ai.suggestedOwner
    : (store.config?.ownershipRules || [])[0]?.owner || 'RS'
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

// One picked file → the attachment record. PDFs are read client-side with the
// same pdfjs path Tender → Proposal uses; anything else attaches by name only.
async function readAttachment(file) {
  const rec = { file, name: file.name, size: fmtSize(file.size) }
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return rec
  try {
    const { struct, fullText, charCount } = await extractPdfText(file)
    if (!charCount) return { ...rec, pages: struct.length, err: 'Scanned — no text layer; the name is attached, not the contents.' }
    return { ...rec, pages: struct.length, text: fullText.slice(0, TEXT_PER_FILE) }
  } catch (e) {
    return { ...rec, err: 'Could not read this PDF (' + (e?.message || e?.code || 'unknown') + ') — the name is attached, not the contents.' }
  }
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
        {!aiEnabled() && (
          <WarnBox>AI is not configured — the mail can be added, but nothing will be extracted.</WarnBox>
        )}
        {err && <ErrBox>{err}</ErrBox>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
          <button onClick={onClose}>Cancel</button>
          {err && <button onClick={addRaw}>Add unextracted</button>}
          <button className="primary" onClick={add} disabled={busy || reading || !aiEnabled()}>
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

const fieldChip = (f, med) => {
  if (f.state === 'accepted') return <Chip tone="state-Accepted">Accepted</Chip>
  if (f.state === 'rejected') return <Chip tone="state-Rejected">Rejected</Chip>
  return f.conf >= med
    ? <Chip tone="state-Review">Review required</Chip>
    : <Chip tone="state-Blocks">Blocks stage</Chip>
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

  // Re-read the original mail. Human decisions are discarded with it, so this
  // is confirmed first — the point of the field states is that they're earned.
  const reExtract = async () => {
    if (decided > 0 && !window.confirm(
      `Re-run extraction? ${decided} field decision(s) on this lead will be replaced.`)) return
    setReExtracting(true); setReErr('')
    const extracted = await extractLead(lead, store)
    setReExtracting(false)
    if (!extracted) { setReErr('Extraction unavailable — the previous result is unchanged.'); return }
    store.updateLead(lead.id, extracted)
  }

  const customer = matchCustomer(store.customers, lead)
  const isRed = lead.redFlag || customer?.status === 'Red'
  const redApproval = store.approvals.find(a => a.leadId === lead.id && a.type === 'Red customer clearance')
  const redCleared = redApproval && ['Approved', 'Approved with conditions'].includes(redApproval.status)

  const groups = [...new Set(ai.fields.map(f => f.group))]
  const pendingLow = ai.fields.filter(f => f.state === 'pending' && f.conf < med)

  const patchField = (idx, patch) => {
    store.updateLead(lead.id, {
      ai: { ...ai, fields: ai.fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)) },
    })
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
          {attachments.length > 0 && (
            <>
              <div className="ws-group">Attachments</div>
              {attachments.map((a, i) => (
                <div key={i} className="attach-row">
                  <span className="attach-icon"><Icon name="fileText" size={13} /></span>
                  <span className="attach-name">{a.name}</span>
                  <span className="attach-meta">{a.pages ? a.pages + ' p.' : a.size || ''}</span>
                </div>
              ))}
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

          {ai.missing?.length > 0 && (
            <WarnBox>
              <b>Missing information</b>
              <ul>{ai.missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </WarnBox>
          )}

          {ai.duplicates?.length > 0 && (
            <WarnBox>
              <b>Duplicate candidates</b>
              {ai.duplicates.map((d, i) => (
                <div key={i} className="ws-dup">
                  <span>{d.leadId} — {d.note}</span>
                  <div className="ws-dup-actions">
                    <button onClick={() => store.updateLead(lead.id, {
                      ai: { ...ai, duplicates: ai.duplicates.filter((_, j) => j !== i) },
                    })}>Not a duplicate</button>
                    <button onClick={() => store.updateLead(lead.id, { status: 'Dropped', droppedReason: 'Duplicate' })}>
                      Mark duplicate
                    </button>
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
              <button className="primary ws-action" disabled={qualifyBlocked}
                title={qualifyBlocked ? 'Blocked: Red continuation approval required first' : undefined}
                onClick={() => store.updateLead(lead.id, { status: 'Qualified' })}>
                <Icon name="check" size={14} /> Qualify lead
              </button>
              {qualifyBlocked && <p className="ws-foot-note">Blocked — Red continuation approval required first.</p>}
            </>
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
  const [dropReason, setDropReason] = useState(DROP_REASONS[0])
  const p = lead.parse || {}

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

      {lead.status === 'New' && (
        <div className="toolbar" style={{ marginTop: 14, marginBottom: 0 }}>
          <button className="primary" onClick={qualify}>
            <Icon name="check" size={13} /> Qualify → intake form
          </button>
          {!dropping
            ? <button onClick={() => { setDropping(true); setDropReason(DROP_REASONS[0]) }}>
                <Icon name="x" size={13} /> Disqualify lead
              </button>
            : <>
                <select value={dropReason} onChange={e => setDropReason(e.target.value)}>
                  {DROP_REASONS.map(r => <option key={r}>{r}</option>)}
                </select>
                <button onClick={() => { store.updateLead(lead.id, { status: 'Dropped', droppedReason: dropReason }); setDropping(false) }}>
                  Confirm disqualify
                </button>
                <button onClick={() => setDropping(false)}>Cancel</button>
              </>}
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
  const [pasteOpen, setPasteOpen] = useState(false)
  // Sales owners see only their assigned leads by default; a "Show all" toggle
  // reveals the team's. Managers (LJS/AH) and admins always see everything.
  const [showAll, setShowAll] = useState(false)
  const seesAll = isAdminRole(store.role) || isApprover(store.role)

  const sel = leadId ? store.leads.find(l => l.id === leadId) : null
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
          : <div className="ws-grid single"><section className="ws-col"><div className="ws-body">
              <LegacyLeadDetail lead={sel} />
            </div></section></div>}
      </div>
    )
  }

  const rows = store.leads.filter(l => {
    // Sales owners: only their assigned leads unless "Show all" is ticked.
    if (!seesAll && !showAll && l.suggestedOwner !== store.role) return false
    if (q) {
      const hay = `${l.subject} ${l.sender || ''} ${l.from} ${l.ref || ''}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    if (statusF && l.status !== statusF) return false
    if (routeF && (l.route || l.parse?.oppType || '') !== routeF) return false
    return true
  })

  return (
    <div className="page">
      <h2><Icon name="inbox" size={18} /> Lead Inbox</h2>
      <p className="hint">
        Common sales mailbox is the intake source of truth — AI structures, humans decide.
      </p>
      <div className="toolbar">
        <input placeholder="Search subject, sender, ref…" value={q} onChange={e => setQ(e.target.value)}
          style={{ minWidth: 220 }} />
        <select value={statusF} onChange={e => setStatusF(e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={routeF} onChange={e => setRouteF(e.target.value)}>
          <option value="">All routes</option>
          {ROUTE_OPTIONS.map(r => <option key={r}>{r}</option>)}
        </select>
        {!seesAll && (
          <label className="cb-inline" title="Show every team member's leads, not just yours">
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Show all
          </label>
        )}
        <span className="spacer" />
        <button onClick={() => store.addLead(simulatedLead())}>
          <Icon name="mail" size={13} /> Simulate incoming inquiry
        </button>
        <button className="primary" onClick={() => setPasteOpen(true)}>
          <Icon name="bot" size={13} /> New enquiry — extract with AI
        </button>
      </div>
      {pasteOpen && <PasteLeadModal onClose={() => setPasteOpen(false)} />}

      <div className="sheet-wrap">
        <table className="sheet">
          <thead>
            <tr>
              <th>Received</th><th>Source</th><th>Sender</th><th>Subject / ref</th>
              <th>AI route</th><th>Urgency</th><th>Dup. risk</th><th>Completeness</th>
              <th>Sugg. owner</th><th>Status</th><th>Age</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(l => {
              const completeness = l.completeness ?? (l.parse?.confidence != null ? Math.round(l.parse.confidence * 100) : null)
              const route = l.route || l.parse?.oppType || '—'
              return (
                <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => nav('/inbox/' + l.id)}>
                  <td>{ddMmmYY((l.ts || '').slice(0, 10))}</td>
                  <td>{l.source || l.channel}</td>
                  <td>
                    <b>{l.sender || l.from}</b>
                    {l.sender && <><br /><span className="hint">{l.from}</span></>}
                  </td>
                  <td>
                    <b>{l.subject}</b>
                    {l.ref && <><br /><span className="hint">{l.ref}</span></>}
                  </td>
                  <td><Chip tone="grey">{route}</Chip></td>
                  <td>{l.urgency === 'Urgent'
                    ? <Chip tone="state-Rejected">Urgent</Chip>
                    : <Chip tone="grey">Normal</Chip>}</td>
                  <td>{l.duplicateRisk === 'Medium'
                    ? <Chip tone="conf-med">Medium</Chip>
                    : <Chip tone="grey">Low</Chip>}</td>
                  <td>{completeness != null
                    ? <ConfChip conf={completeness} thresholds={store.config.aiThresholds} />
                    : '—'}</td>
                  <td>{l.suggestedOwner || '—'}</td>
                  <td><span className={`pill ${PILL[l.status] || 'Blue'}`}>{l.status}</span></td>
                  <td>{ageDays((l.ts || '').slice(0, 10))} d</td>
                </tr>
              )
            })}
            {!rows.length && (
              <tr><td colSpan={11}>No leads match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        Dropped leads are kept as a minimal record — reason and source only — for future demand analytics.
      </p>
    </div>
  )
}
