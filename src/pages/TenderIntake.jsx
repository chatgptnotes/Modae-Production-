import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore, nextOppId } from '../store.jsx'
import { CATEGORIES, OWNERS, OPP_TYPES, BUS, SEGMENTS, PRODUCTS } from '../seed.js'
import { extractPdfText, parseTender, matchParts, buildProposal, buildOpportunityDraft } from '../tenderParse.js'
import { uploadOppFile } from '../filestore.js'
import { fmt, sameCustomer } from '../utils.js'
import { Icon } from '../icons.jsx'
import { runJson } from '../ai.js'
import { aiAttachmentPayload, supportsVisualAi } from '../aiAttachments.js'
import ScanProgress from '../ScanProgress.jsx'
import { opportunityOwnerFor } from '../leadRules.js'

const STAGES_MSG = [
  'Reading document…',
  'AI extracting header & BOQ lines…',
  'Matching parts against price lists…',
  'Checking clauses against ModAE standard terms…',
]

const ConfBadge = ({ v }) => {
  const cls = v >= 0.9 ? 'hi' : v >= 0.6 ? 'med' : 'lo'
  const label = v >= 0.9 ? 'High' : v >= 0.6 ? 'Medium' : 'Low'
  return <span className={`conf-badge ${cls}`} title={`AI extraction confidence ${Math.round(v * 100)}%`}>AI · {label}</span>
}

// Fold a Gemini tender read into the rule-based parse, in place. Blanks only:
// wherever the deterministic parser produced a value it wins, so the confidence
// badges keep meaning what they meant. Fields the model supplied are listed in
// parse.aiFilled so the review screen can say which is which.
// What each AI header field answers on the parser's "missing from the document"
// list, so a field the model reads is struck off that list.
const ANSWERS = {
  buyer: 'Buyer / customer name', subject: 'Subject', sectionRef: 'RFQ number',
  contactPerson: 'Contact person', contactPhone: 'Contact phone',
}

function mergeAi(p, ai) {
  p.aiFilled = []
  p.risks = []
  p.aiNotes = []
  if (!ai) return
  const blank = v => !String(v ?? '').trim()

  for (const [k, v] of Object.entries(ai.header || {})) {
    if (blank(v) || !blank(p.header[k])) continue
    p.header[k] = v
    p.aiFilled.push(k)
    const idx = p.missing.indexOf(ANSWERS[k])
    if (idx >= 0) p.missing.splice(idx, 1)
  }
  // buildOpportunityDraft reads the contact from header.signatory and the
  // location from guesses — feed the model's values through the same doors.
  if (blank(p.header.signatory) && !blank(p.header.contactPerson)) p.header.signatory = p.header.contactPerson
  if (blank(p.guesses.location) && !blank(p.header.location)) p.guesses.location = p.header.location

  // The review screen renders these as <select>s, so a value outside the app's
  // own lists would silently show as blank. The lists are the authority, not
  // the prompt — anything off-list keeps the deterministic guess.
  const ALLOWED = { segment: SEGMENTS, oppType: OPP_TYPES, bu: BUS, category: CATEGORIES, product: PRODUCTS }
  for (const [k, v] of Object.entries(ai.guesses || {})) {
    if (blank(v)) continue
    const list = ALLOWED[k]
    const hit = list ? list.find(o => o.toLowerCase() === String(v).trim().toLowerCase()) : v
    if (hit) p.guesses[k] = hit
  }
  p.risks = (ai.risks || []).filter(r => r?.clause)
  for (const m of ai.missing || []) if (!p.missing.includes(m)) p.missing.push(m)
  p.aiNotes = ai.notes || []
}

export default function TenderIntake({ fixedTarget = null, destinationPicker = null }) {
  const store = useStore()
  const nav = useNavigate()

  const [step, setStep] = useState('upload')     // upload | parsing | review | done
  const [error, setError] = useState(null)
  const [stage, setStage] = useState(0)
  const [file, setFile] = useState(null)
  const [target, setTarget] = useState(fixedTarget || 'new')    // 'new' | existing opp id
  const [parse, setParse] = useState(null)
  const [items, setItems] = useState([])         // editable copies of parsed items
  const [include, setInclude] = useState([])
  const [comp, setComp] = useState([])           // editable compliance rows
  const [draft, setDraft] = useState(null)       // editable opportunity fields
  const [rfqNumber, setRfqNumber] = useState('') // tender ref — often absent from the document itself
  const [replaceArmed, setReplaceArmed] = useState(false)
  const [warn, setWarn] = useState('')
  const [doneId, setDoneId] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  // Snapshot at confirm time — afterwards the new ad-hoc entries make the live
  // re-match "find" every part, which would zero this count.
  const [doneStats, setDoneStats] = useState({ lines: 0, adhoc: 0 })
  const fileInput = useRef(null)
  const [drag, setDrag] = useState(false)

  useEffect(() => {
    setTarget(fixedTarget || 'new')
    setReplaceArmed(false)
  }, [fixedTarget])

  const allParts = useMemo(() => [
    ...Object.entries(store.priceLists).flatMap(([list, pl]) =>
      pl.parts.map(part => ({ ...part, list, currency: pl.currency }))),
    ...store.adhocParts.map(a => ({
      pn: a.pn, desc: a.note ? `${a.note} (${a.supplier})` : a.supplier,
      price: a.price, adders: [], list: 'Ad-hoc', currency: a.currency,
    })),
  ], [store.priceLists, store.adhocParts])

  // Live re-match so editing a part number to a known PN immediately shows its
  // price-list evidence.
  const matched = useMemo(() => matchParts(items, allParts), [items, allParts])

  const openOpps = store.opportunities.filter(o => o.status === 'Open')

  const startParse = async f => {
    setError(null); setWarn(''); setFile(f); setUploadOpen(true); setStep('parsing'); setStage(0)
    const timer = setInterval(() => setStage(s => Math.min(s + 1, STAGES_MSG.length - 1)), 650)
    const minDelay = new Promise(r => setTimeout(r, 2400))
    try {
      const ex = /.(png|jpe?g|gif|webp)$/i.test(f.name)
        ? { fullText: '', struct: [], charCount: 0 }
        : await extractPdfText(f)
      if (ex.charCount < 200 && !supportsVisualAi(f)) throw { code: 'NO_TEXT_LAYER' }
      const p = parseTender(ex.fullText, ex.struct)
      // Gemini fills only what the rules could not read, and adds the
      // commercial risk read the rules never attempted. The deterministic
      // parse stays authoritative — see mergeAi below.
      const ai = await runJson('tender.extract', {
        filename: f.name, pages: ex.struct?.length ?? '', text: ex.fullText,
        parsed: p.header, products: PRODUCTS,
        aiAttachments: await aiAttachmentPayload([f]),
      }, { timeoutMs: 90000, fallback: store.config?.aiModel?.provider === 'Built-in fallback' })
      if (!ai) setWarn('AI extraction was unavailable. The local parser results are shown; review every field before confirming.')
      mergeAi(p, ai)
      await minDelay
      clearInterval(timer)
      setParse(p)
      setItems(p.items.map(i => ({ ...i })))
      setInclude(p.items.map(() => true))
      setComp(p.compliance.map(c => ({ ...c })))
      setDraft(buildOpportunityDraft(p))
      setRfqNumber(p.header.sectionRef)
      setReplaceArmed(false)
      setStep('review')
    } catch (e) {
      clearInterval(timer)
      setError(e?.code ? e : { code: 'PDF_ERROR', message: e?.message || String(e) })
      setStep('upload')
    }
  }

  const onPick = e => { const f = e.target.files[0]; e.target.value = ''; if (f) startParse(f) }
  const onDrop = e => {
    e.preventDefault(); setDrag(false)
    const f = e.dataTransfer.files?.[0]
    if (f) startParse(f)
  }

  const setD = k => e => setDraft({ ...draft, [k]: e.target.value })
  const setItem = (i, k, numeric) => e => {
    const v = numeric ? (+e.target.value || 0) : e.target.value
    setItems(items.map((it, j) => (j === i ? { ...it, [k]: v } : it)))
  }
  const setCompRow = (i, k) => e => setComp(comp.map((c, j) => (j === i ? { ...c, [k]: e.target.value } : c)))

  const attachTarget = target !== 'new' ? store.opportunities.find(o => o.id === target) : null
  const attachHasBoq = attachTarget && ((store.proposals?.[target] || {}).bom || []).length > 0
  const includedCount = include.filter(Boolean).length
  const requiredOk = includedCount > 0 && (target !== 'new'
    ? true
    : draft && draft.sellTo.trim() && draft.oppName.trim() && draft.owner)

  const fmtSize = b => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

  const confirm = async () => {
    // Replacing a non-empty BoQ on an existing opportunity needs a second,
    // armed click (no blocking confirm() dialogs, same as folder deletes).
    if (attachHasBoq && !replaceArmed) { setReplaceArmed(true); return }
    const today = new Date().toISOString().slice(0, 10)
    let opp, id
    if (target === 'new') {
      // Resolve the owner before minting the ID so tender intake follows the
      // same Admin city/state routing as inbox conversion.
      const owner = opportunityOwnerFor({
        location: draft.eucLocation || draft.location,
        config: store.config,
        fallback: draft.owner || store.role || 'LJS',
      })
      id = nextOppId(store.opportunities, owner)
      const maxSl = Math.max(0, ...store.opportunities.map(o => o.sl || 0))
      const sellTo = draft.sellTo.trim()
      // Tenders spell the buyer out in full ("MAHARASHTRA STATE POWER GENERATION
      // COMPANY LTD.") where the customer master holds the short name (MSPGCL) —
      // match on the stripped form too, so we attach to the existing (rated)
      // customer instead of silently creating a Blue duplicate.
      const known = store.customers.find(c =>
        c.name.toLowerCase() === sellTo.toLowerCase() || sameCustomer(c.name, sellTo))
      if (!known) store.addCustomer({ name: sellTo, category: draft.category, status: 'Blue', kyc: 'Pending', payment: '—' })
      opp = {
        sl: maxSl + 1, id,
        // Use the master's spelling so the tracker, folders and KYC all key off
        // one customer rather than two spellings of the same one.
        sellTo: known ? known.name : sellTo,
        category: draft.category, location: draft.location,
        customerStatus: known ? known.status : 'Blue',
        eucName: draft.eucName, eucLocation: draft.eucLocation, oppName: draft.oppName,
        owner, oppType: draft.oppType, bu: draft.bu, segment: draft.segment, product: draft.product,
        prob: '', valueK: +draft.valueK || 0, cogsK: 0,
        createDate: today, proposalDate: '', orderDate: '', invoiceDate: '',
        status: 'Open', stage: 'RFQ', closedReason: '',
        contactPerson: draft.contactPerson, contactPhone: draft.contactPhone,
        lastUpdated: today, forecast: false, remarks: 'Created by AI tender intake',
      }
      store.addOpportunity(opp)
    } else {
      opp = attachTarget
      id = opp.id
    }

    // The raw tender lands in Customer Specs, like the manual process. The
    // filestore facade picks the backend (SharePoint → Supabase → mock).
    const meta = { name: file.name, date: today, size: fmtSize(file.size) }
    try {
      const rec = await uploadOppFile(opp, 'Customer Specs', file)
      store.addFile(id, 'Customer Specs', rec)
    } catch (e) {
      store.addFile(id, 'Customer Specs', meta)
      setWarn(`Cloud upload failed (${e.message}) — file recorded locally only.`)
    }

    // Unpriced items become ad-hoc registry entries awaiting a trader quote,
    // BEFORE the proposal saves so its BoQ lookups resolve.
    const inc = matched.filter((_, i) => include[i])
    for (const { item, match } of inc) {
      if (!match) {
        store.addAdhocPart({
          pn: item.pn || item.sapCode, supplier: 'TBD — supplier quote needed',
          price: 0, currency: 'INR', date: today,
          note: `Auto-extracted from tender ${id} — awaiting trader quote`,
        })
      }
    }

    store.saveProposal(id, buildProposal(id, opp, {
      ...parse,
      header: { ...parse.header, sectionRef: rfqNumber.trim() || parse.header.sectionRef },
      compliance: comp,
    }, inc))
    setDoneStats({ lines: inc.length, adhoc: inc.filter(x => !x.match).length })
    setDoneId(id)
    setStep('done')
  }

  // ------------------------------------------------------------------ render

  return (
    <div className="page">
      <h2>Tender → Proposal</h2>
      <div className="tender-steps">
        {['Upload', 'AI extraction', 'Review & confirm', 'Proposal'].map((s, i) => {
          const idx = ['upload', 'parsing', 'review', 'done'].indexOf(step)
          return <span key={s} className={`step ${i === idx ? 'active' : i < idx ? 'done' : ''}`}>{i + 1}. {s}</span>
        })}
      </div>

      {step === 'upload' && (
        <>
          {error && (
            <div className="restricted" style={{ maxWidth: 640, marginBottom: 12 }}>
              {error.code === 'NO_TEXT_LAYER' && <>
                This file has no readable text layer and is not a supported visual document.{' '}
                <Link to="/new">Enter the opportunity manually instead ▸</Link>
              </>}
              {error.code === 'NOT_PDF' && 'That file is not a PDF — upload the tender/RFQ document as PDF.'}
              {error.code === 'ENCRYPTED' && 'This PDF is password-protected — remove the password and try again.'}
              {error.code === 'PDF_ERROR' && <>Could not read this PDF ({error.message}). <Link to="/new">Enter manually ▸</Link></>}
            </div>
          )}
          <button
            type="button"
            className={`upload-section-toggle ${uploadOpen ? 'open' : ''}`}
            aria-expanded={uploadOpen}
            aria-controls="tender-upload-panel"
            onClick={() => setUploadOpen(value => !value)}
          >
            <span>Upload</span>
            <span className="upload-section-toggle-icon" aria-hidden="true">{uploadOpen ? '−' : '+'}</span>
          </button>
          {uploadOpen && <div className="tender-upload-panel" id="tender-upload-panel">
            <div className={`tender-drop ${drag ? 'drag' : ''}`}
              onDragOver={e => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              onClick={() => fileInput.current?.click()}>
              <input ref={fileInput} type="file" accept="application/pdf,.pdf,.png,.jpg,.jpeg,.webp,image/*" style={{ display: 'none' }} onChange={onPick} />
              <div className="tender-drop-icon"><Icon name="fileText" size={40} /></div>
              <b>Drop the tender / RFQ PDF here</b>
              <div className="hint">or tap to choose a file</div>
            </div>
            {destinationPicker}
            {!fixedTarget && <div className="form-card" style={{ marginTop: 12, maxWidth: 560 }}>
            <div className="section-title">Where should the extracted proposal go?</div>
            <label className="radio-row">
              <input type="radio" checked={target === 'new'} onChange={() => setTarget('new')} />
              Create a new opportunity (tracker row + folder, like the intake form)
            </label>
            <label className="radio-row">
              <input type="radio" checked={target !== 'new'} onChange={() => setTarget(openOpps[0]?.id || 'new')} />
              Attach to an existing open opportunity
            </label>
            {target !== 'new' && (
              <select value={target} onChange={e => setTarget(e.target.value)} style={{ marginLeft: 24 }}>
                {openOpps.map(o => <option key={o.id} value={o.id}>{o.id} — {o.oppName.slice(0, 50)}</option>)}
              </select>
            )}
            <div className="costing-note">
              AI reads the document, extracts BOQ lines and commercial terms, checks them against ModAE standards —
              and you confirm every field before anything is created.
            </div>
            </div>}
          </div>}
        </>
      )}

      {step === 'parsing' && (
        <ScanProgress title="Scanning tender" fileName={file?.name} stages={STAGES_MSG} active={stage} />
      )}

      {step === 'review' && parse && (
        <>
          <div className="hint" style={{ marginBottom: 10 }}>
            AI proposes, you confirm — every field below is editable. Amber fields need your input.
            {parse.missing.length > 0 && <> Missing from the document: <b>{parse.missing.join(', ')}</b>.</>}
            {parse.aiFilled?.length > 0 && <> Read by the model (the rules could not): <b>{parse.aiFilled.join(', ')}</b>.</>}
          </div>

          {parse.risks?.length > 0 && (
            <div className="form-card" style={{ maxWidth: 900, marginBottom: 14 }}>
              <div className="section-title">Commercial risk in the tender terms</div>
              {parse.risks.map((r, i) => (
                <div key={i} className="check-row">
                  <Icon name="alert" size={13} />
                  <span><b>{r.clause}</b> — {r.why}</span>
                </div>
              ))}
              <div className="costing-note">
                Model-read, not rule-checked — verify each against the document before you price it in.
              </div>
            </div>
          )}

          {parse.aiNotes?.length > 0 && (
            <div className="form-card" style={{ maxWidth: 900, marginBottom: 14 }}>
              <div className="section-title">Estimator notes</div>
              {parse.aiNotes.map((n, i) => <div key={i} className="check-row"><span>{n}</span></div>)}
            </div>
          )}

          <div className="form-card" style={{ maxWidth: 900, marginBottom: 14 }}>
            <div className="section-title">Tender reference</div>
            <div style={{ maxWidth: 420 }}>
              <label>Tender / RFQ number {!parse.header.sectionRef.match(/\d/) && <span className="hint">(not stated in the document)</span>}</label>
              <input value={rfqNumber} onChange={e => setRfqNumber(e.target.value)}
                placeholder="e.g. BTPS/CHP/2026/0417" />
            </div>
            <div className="costing-note">Printed on the proposal cover as the reference we are bidding against.</div>
          </div>

          {target === 'new' ? (
            <div className="form-card" style={{ maxWidth: 900, marginBottom: 14 }}>
              <div className="section-title">Opportunity <ConfBadge v={parse.confidence.header} /></div>
              <div className="dgrid2" style={{ maxWidth: 860 }}>
                <div><label>Sell To Customer *</label>
                  <input className={draft.sellTo ? '' : 'needs-input'} value={draft.sellTo} onChange={setD('sellTo')} /></div>
                <div><label>Category</label>
                  <select value={draft.category} onChange={setD('category')}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
                <div><label>Location</label><input value={draft.location} onChange={setD('location')} /></div>
                <div><label>EUC Name</label><input value={draft.eucName} onChange={setD('eucName')} /></div>
                <div><label>EUC Location</label><input value={draft.eucLocation} onChange={setD('eucLocation')} /></div>
                <div><label>Owner * <span className="hint">(sets the opportunity ID)</span></label>
                  <select className={draft.owner ? '' : 'needs-input'} value={draft.owner} onChange={setD('owner')}>
                    <option value="">— select —</option>
                    {OWNERS.map(o => <option key={o}>{o}</option>)}
                  </select></div>
                <div style={{ gridColumn: '1 / -1' }}><label>Opportunity Name/Description *</label>
                  <input className={draft.oppName ? '' : 'needs-input'} value={draft.oppName} onChange={setD('oppName')} /></div>
                <div><label>Opp Type</label>
                  <select value={draft.oppType} onChange={setD('oppType')}>{OPP_TYPES.map(c => <option key={c}>{c}</option>)}</select></div>
                <div><label>BU</label>
                  <select value={draft.bu} onChange={setD('bu')}>{BUS.map(c => <option key={c}>{c}</option>)}</select></div>
                <div><label>Segment</label>
                  <select value={draft.segment} onChange={setD('segment')}>{SEGMENTS.map(c => <option key={c}>{c}</option>)}</select></div>
                <div><label>Equipment / Product Family</label>
                  <select value={draft.product} onChange={setD('product')}>{PRODUCTS.map(c => <option key={c} value={c}>{c === 'Various' ? 'Multiple equipment items' : c}</option>)}</select></div>
                <div><label>Contact Person</label><input value={draft.contactPerson} onChange={setD('contactPerson')} /></div>
                <div><label>Contact Phone # <span className="hint">(not in document)</span></label>
                  <input className={draft.contactPhone ? '' : 'needs-input'} value={draft.contactPhone} onChange={setD('contactPhone')} /></div>
              </div>
            </div>
          ) : (
            <div className="form-card" style={{ maxWidth: 900, marginBottom: 14 }}>
              <div className="section-title">Attaching to {target} — {attachTarget?.oppName}</div>
              {attachHasBoq && <div className="warn-box">This opportunity already has a priced BoQ — confirming will replace its BoQ and terms.</div>}
            </div>
          )}

          <div className="section-title">
            BOQ lines ({items.length}) <ConfBadge v={parse.confidence.items} />
          </div>
          <div className="sheet-wrap" style={{ marginBottom: 14 }}>
            <table className="sheet">
              <thead>
                <tr><th></th><th>S/N</th><th>Scope description</th><th>Item Code (SAP)</th><th>Part Number</th><th>UOM</th><th>Quantity</th><th>Price source</th><th></th></tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} style={include[i] ? undefined : { opacity: .45 }}>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={include[i]}
                        onChange={() => setInclude(include.map((v, j) => (j === i ? !v : v)))} title="Include in proposal" />
                    </td>
                    <td className="rowhead">{it.sn}</td>
                    <td style={{ maxWidth: 340 }}><input value={it.description} onChange={setItem(i, 'description')} style={{ minWidth: 320 }} /></td>
                    <td>{it.sapCode || <span className="hint">—</span>}</td>
                    <td><input value={it.pn} onChange={setItem(i, 'pn')} placeholder="—" style={{ minWidth: 150 }} /></td>
                    <td>{it.uom}</td>
                    <td className="num"><input type="number" min="0" value={it.qty} onChange={setItem(i, 'qty', true)} style={{ width: 60, textAlign: 'right' }} /></td>
                    <td>
                      {matched[i]?.match
                        ? matched[i].match.tier === 4
                          ? <span className="evidence warn">
                              {matched[i].match.list} · {matched[i].match.currency} {fmt(matched[i].match.price)} — {matched[i].match.pn}
                              {' '}(suggested from the description — confirm)
                            </span>
                          : <span className="evidence ok">{matched[i].match.list} · {matched[i].match.currency} {fmt(matched[i].match.price)} (price list)</span>
                        : <span className="evidence warn">No price — ad-hoc part will be created (supplier quote needed)</span>}
                    </td>
                    <td><ConfBadge v={it.confidence} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="section-title">
            Commercial terms &amp; compliance ({comp.length}) <ConfBadge v={parse.confidence.terms} />
          </div>
          <div className="sheet-wrap" style={{ marginBottom: 8 }}>
            <table className="sheet">
              <thead><tr><th>Term</th><th>Customer ask</th><th>Our response</th><th>Verdict</th><th>Source</th></tr></thead>
              <tbody>
                {comp.map((c, i) => (
                  <tr key={c.key}>
                    <td><b>{c.label}</b>{c.needsReview && <div className="hint">engineering review</div>}</td>
                    <td style={{ maxWidth: 300, whiteSpace: 'normal' }}>{c.customerAsk}</td>
                    <td><input value={c.ourResponse} onChange={setCompRow(i, 'ourResponse')} style={{ minWidth: 260 }} /></td>
                    <td className={c.status === 'Deviation' ? 'err' : ''}>
                      <select value={c.status} onChange={setCompRow(i, 'status')}>
                        <option>Comply</option><option>Deviation</option>
                      </select>
                    </td>
                    <td>
                      <details><summary className="hint">{c.clauseRef}</summary>
                        <div className="hint" style={{ maxWidth: 340, whiteSpace: 'normal' }}>
                          {(parse.terms.find(t => `Clause ${t.n}` === c.clauseRef)?.text) || parse.preNotes.find(n => c.clauseRef === 'Tender notes' && n) || ''}
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details style={{ marginBottom: 14 }}>
            <summary className="hint">Other clauses ({parse.terms.filter(t => !t.categoryKey).length}) — accepted as-is, not carried into the proposal</summary>
            <ul className="stat-list" style={{ maxWidth: 760 }}>
              {parse.terms.filter(t => !t.categoryKey).map(t => (
                <li key={t.n}><span>Clause {t.n}</span> <span className="hint" style={{ textAlign: 'right' }}>{t.summary}</span></li>
              ))}
            </ul>
          </details>

          <div className="toolbar">
            <button onClick={() => { setStep('upload'); setError(null); setReplaceArmed(false) }}>◂ Start over</button>
            <span className="spacer" />
            {!requiredOk && <span className="hint">Fill the required (amber) fields and include at least one line item.</span>}
            <button className="primary" disabled={!requiredOk} onClick={confirm}>
              {attachHasBoq && replaceArmed ? 'Replace existing BoQ & continue' : 'Confirm & Generate Proposal ▸'}
            </button>
          </div>
        </>
      )}

      {step === 'done' && (
        <div className="form-card" style={{ maxWidth: 640 }}>
          <div className="section-title"><Icon name="checkCircle" size={16} /> Proposal generated for {doneId}</div>
          <ul className="stat-list">
            <li><span>Tracker row</span><b>{target === 'new' ? 'created (stage RFQ)' : 'existing'}</b></li>
            <li><span>Tender document</span><b>saved to {doneId} / Customer Specs</b></li>
            <li><span>BoQ lines</span><b>{doneStats.lines}</b></li>
            <li><span>Ad-hoc parts awaiting supplier quotes</span><b>{doneStats.adhoc}</b></li>
            <li><span>Compliance terms ({comp.filter(c => c.status === 'Deviation').length} deviations)</span><b>{comp.length}</b></li>
          </ul>
          {warn && <div className="warn-box" style={{ marginTop: 8 }}>{warn}</div>}
          <div className="toolbar" style={{ marginTop: 14 }}>
            <button className="primary" onClick={() => nav(`/proposal/${doneId}`)}>Open proposal workbook ▸</button>
            <button onClick={() => nav(`/folders/${doneId}/Customer%20Specs`)}>Open folder</button>
            <button onClick={() => { setStep('upload'); setError(null); setFile(null); setWarn('') }}>Process another tender</button>
          </div>
          <div className="costing-note">
            Add prices in the Priced BoQ (deviations are already on the cover letter), then Print / PDF and Email from the workbook.
          </div>
        </div>
      )}
    </div>
  )
}
