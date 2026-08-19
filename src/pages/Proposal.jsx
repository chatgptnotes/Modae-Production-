import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { defaultCosting, newProposal, proposalTypeForOpp } from '../seed.js'
import { effectiveRate, unitCostINR, unitSellINR, fmt, exportCSV, canPriceProposal, clampCosting, clampQty, MAX_GM_PCT } from '../utils.js'
import { useFormulaBar } from '../formulabar.jsx'
import { Icon, ModaeImageLogo } from '../icons.jsx'
import { Modal } from '../ui.jsx'
import { oppBlockers, isBlocked } from '../gates.js'
import { docModel, docRoute, MODAE_COMPANY } from '../proposalDoc.js'
import DocEditor from '../proposal/DocEditor.jsx'
import PrintDoc from '../proposal/PrintDoc.jsx'
import { signalsFromBom, countSignals, signalsAreEmpty, rackLayout, UMM_CHANNELS, RACK_SLOTS } from '../rack.js'

const ROUTE_TABS = {
  Project: ['Cover Letter', 'Document', 'Signal List', 'Rack Layout', 'Priced BoQ'],
  Services: ['Cover Letter', 'Document', 'Scope of Work', 'Issues List', 'Proposal', 'Service Rate Schedule'],
  Spares: ['Cover Letter', 'Document', 'Firm Offer', 'Clarifications', 'Sensor Comparison', 'Priced BoQ'],
}

function RouteTemplateTab({ route, tab, p, doc, priced, lineQuoted }) {
  const rows = (p.bom || []).map((line, i) => ({
    ...line,
    index: i + 1,
    qty: (line.qtyPerUnit || 0) * (p.units || 1) + (line.common || 0) + (line.spares || 0),
  }))
  const title = tab === 'Service Rate Schedule' ? 'Service Rate Schedule'
    : tab === 'Firm Offer' ? 'Firm Offer'
      : tab

  if (tab === 'Scope of Work') {
    return <div className="form-card route-template-panel">
      <div className="section-title">Scope of Work</div>
      <p className="hint">Service template: execution scope and deliverables from the service proposal and SOW.</p>
      {(doc.scope || []).map((item, i) => <div className="route-template-row" key={i}><b>{i + 1}. {item.category || item.desc}</b><span>{item.desc || item.pn || 'Scope item'}</span></div>)}
      {(doc.scopeIncludes || []).map((item, i) => <div className="route-template-row" key={`include-${i}`}><b>Deliverable</b><span>{item}</span></div>)}
      {!doc.scope?.length && !doc.scopeIncludes?.length && <div className="hint">Add the service scope in the Document tab.</div>}
    </div>
  }

  if (tab === 'Issues List') {
    return <div className="form-card route-template-panel">
      <div className="section-title">Issues List</div>
      <p className="hint">Service template: open issues, assumptions, and resolution notes stay tied to the proposal.</p>
      {(p.terms || []).map((term, i) => <div className="route-template-row" key={i}><b>{term.term || `Issue ${i + 1}`}</b><span>{term.customerAsk || term.ourResponse || 'Review required'} · {term.status}</span></div>)}
      {!p.terms?.length && <div className="hint">No service issues captured yet.</div>}
    </div>
  }

  if (tab === 'Proposal') {
    return <div className="form-card route-template-panel">
      <div className="section-title">Service Proposal</div>
      <p className="route-template-lead">{doc.execSummary}</p>
      <div className="section-title">Commercial note</div>
      <p>{doc.commercialNote || 'Commercial terms are maintained in the Document tab.'}</p>
    </div>
  }

  if (tab === 'Clarifications') {
    return <div className="form-card route-template-panel">
      <div className="section-title">Clarifications</div>
      <p className="hint">Spares template: customer references and unresolved commercial or technical questions.</p>
      {(p.terms || []).map((term, i) => <div className="route-template-row" key={i}><b>{term.term || `Clarification ${i + 1}`}</b><span>{term.customerAsk || 'No customer requirement recorded'} → {term.ourResponse || 'Response pending'}</span></div>)}
      {!p.terms?.length && <div className="hint">No clarifications captured yet.</div>}
    </div>
  }

  if (tab === 'Sensor Comparison') {
    return <div className="form-card route-template-panel">
      <div className="section-title">Sensor Comparison</div>
      <p className="hint">Spares template: compare the customer item reference with the proposed ModAE/OEM item.</p>
      <table className="sheet"><thead><tr><th>#</th><th>Customer item</th><th>Proposed item</th><th>Description</th></tr></thead><tbody>
        {rows.map(row => <tr key={row.index}><td>{row.index}</td><td>{row.custRef || '—'}</td><td>{row.pn || '—'}</td><td>{row.desc || '—'}</td></tr>)}
        {!rows.length && <tr><td colSpan={4} className="hint">No comparison rows captured yet.</td></tr>}
      </tbody></table>
    </div>
  }

  if (tab === 'Service Rate Schedule' || tab === 'Firm Offer') {
    return <div className="form-card route-template-panel">
      <div className="section-title">{title}</div>
      <p className="hint">{route === 'Services' ? 'Service template: priced activities, man-days, mobilisation, and payment milestones.' : 'Spares template: offered parts, quantities, unit prices, and total prices.'}</p>
      <table className="sheet"><thead><tr><th>#</th><th>Item / scope description</th><th>Proposed model / part no.</th><th>Qty</th>{priced && <th>Unit price (₹)</th>}</tr></thead><tbody>
        {rows.map(row => <tr key={row.index}><td>{row.index}</td><td>{row.desc || row.itemCategory || '—'}</td><td>{row.pn || '—'}</td><td className="num">{row.qty}</td>{priced && <td className="num">₹ {fmt(lineQuoted(row))}</td>}</tr>)}
        {!rows.length && <tr><td colSpan={priced ? 5 : 4} className="hint">No line items captured yet.</td></tr>}
      </tbody></table>
    </div>
  }

  return null
}

// Qty/Unit × units + Common + Spares — the BoQ quantity rule, in one place so
// the signal-list derivation reads the same totals the sheet shows.
const lineQty = (l, u) => (l.qtyPerUnit || 0) * u + (l.common || 0) + (l.spares || 0)

// Older saved proposals (and newProposal before this change) used a single
// `qty`; the real BoQ splits quantities into Qty/Unit × units + Common + Spares.
function normalize(pr, opp) {
  const units = pr.units || 7
  const bom = (pr.bom || []).map(l => ({
    itemCategory: '', qtyPerUnit: 0, common: 0, spares: 0, quoted: '',
    list: 'BNK', currency: 'EUR', uom: 'EA', custRef: '',
    ...l,
    ...(l.qtyPerUnit === undefined && l.qty != null ? { common: l.qty } : {}),
  }))
  // Tender intake saves the signal rows zeroed (spares quantities are absolute,
  // not per-unit), which left the tab blank. Counts are implied by the BoQ, so
  // adopt them as the default until someone types a figure of their own.
  const stored = pr.signals || newProposal(pr.oppId).signals
  const derived = signalsFromBom(bom, units, l => lineQty(l, units))
  const signals = signalsAreEmpty(stored) && !signalsAreEmpty(derived) ? derived : stored
  return {
    ...pr,
    proposalType: pr.proposalType || proposalTypeForOpp(opp),
    route: pr.route || docRoute(pr, opp),
    artifactSheets: pr.artifactSheets || (docRoute(pr, opp) === 'Project'
      ? ['Cover Letter', 'Signal List', 'Rack Layout', 'Priced BoQ', 'Compliance Table']
      : docRoute(pr, opp) === 'Service'
        ? ['Cover Letter', 'Scope of Work', 'Issues List', 'Proposal', 'Service Rate Schedule']
        : ['Cover Letter', 'Firm Offer', 'Clarifications', 'Sensor Comparison', 'Priced BoQ']),
    signals,
    bom,
    units,
    costing: { ...defaultCosting, ...pr.costing },
    terms: (pr.terms || []).map(t => ({ key: '', clauseRef: '', ...t })),
  }
}

export default function Proposal() {
  const { oppId } = useParams()
  const store = useStore()
  const fb = useFormulaBar()
  const opp = store.opportunities.find(o => o.id === oppId)
  const [tab, setTab] = useState('Cover Letter')
  const [printing, setPrinting] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailCc, setEmailCc] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailNote, setEmailNote] = useState('')
  const [emailPreview, setEmailPreview] = useState(false)
  const [conditionTarget, setConditionTarget] = useState(null)
  const [conditionNote, setConditionNote] = useState('')
  const [p, setP] = useState(() => normalize(store.getProposal(oppId), opp))
  // Ref mirror: deferred commits (formula bar) must patch the CURRENT proposal,
  // never a click-time snapshot — a stale snapshot would silently revert edits.
  const pRef = React.useRef(p)
  pRef.current = p

  // /proposal/:oppId reuses this component instance — reload state per opportunity.
  useEffect(() => { setP(normalize(store.getProposal(oppId), opp)); setTab('Cover Letter') }, [oppId]) // eslint-disable-line

  // Print-all: render the full customer document (cover + terms + BoQ) first,
  // then open the dialog; afterprint restores the tabbed view.
  useEffect(() => {
    if (!printing) return
    const done = () => setPrinting(false)
    window.addEventListener('afterprint', done, { once: true })
    const t = setTimeout(() => window.print(), 60)
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done) }
  }, [printing])

  if (!opp) return <div className="page"><h2>Unknown opportunity</h2><Link to="/">Back to tracker</Link></div>

  const comm = canPriceProposal(store.role)
  const customer = store.customers.find(c => c.name === opp.sellTo)
  const pendingForOpp = (store.approvals || []).filter(a => a.oppId === oppId && a.status === 'Pending')

  const units = p.units || 7

  const allParts = [
    ...Object.entries(store.priceLists).flatMap(([list, pl]) =>
      pl.parts.map(part => ({ ...part, list, currency: pl.currency }))),
    // Trader quotes captured on Price Lists → Ad-hoc parts (latest first = reference price)
    ...store.adhocParts.map(a => ({
      pn: a.pn, desc: a.note ? `${a.note} (${a.supplier})` : a.supplier,
      price: a.price, adders: [], list: 'Ad-hoc', currency: a.currency,
    })),
  ]

  const totalQty = (l, u = units) => lineQty(l, u)
  const linePrice = l => {
    const part = allParts.find(x => x.pn === l.pn && (x.list === l.list || !l.list))
    const adderSum = (part?.adders || []).filter(a => l.adders.includes(a.code)).reduce((s, a) => s + a.price, 0)
    return l.listPrice + adderSum
  }
  const isBnk = l => (l.list || 'BNK') === 'BNK'
  const lineCost = (l, c = p.costing) => unitCostINR(linePrice(l), c, l.currency || 'EUR', isBnk(l))
  const lineComputed = (l, c = p.costing) => unitSellINR(linePrice(l), c, l.currency || 'EUR', isBnk(l))
  // Customer-facing (target) price — editable; defaults to the computed GM price.
  const lineQuoted = (l, c = p.costing) => (l.quoted !== '' && l.quoted != null ? +l.quoted : Math.round(lineComputed(l, c)))

  const computeTotals = pr => pr.bom.reduce((t, l) => {
    const q = totalQty(l, pr.units || 7)
    return { cost: t.cost + lineCost(l, pr.costing) * q, target: t.target + lineQuoted(l, pr.costing) * q }
  }, { cost: 0, target: 0 })

  const totals = computeTotals(p)
  const financeCost = (p.costing.financeCostK || 0) * 1000
  const netGM = totals.target - totals.cost - financeCost
  // The BoQ's own reading of the signal count — offered as the default and as a
  // "recalculate" action, but never forced over a figure the user has typed.
  const derivedSignals = signalsFromBom(p.bom, units, totalQty)
  const derivedTotal = countSignals(derivedSignals)
  const totalSignals = countSignals(p.signals)
  const signalsStale = derivedTotal > 0 && derivedTotal !== totalSignals
  const rack = rackLayout(totalSignals)

  const save = next => {
    // Once a BoQ has ever been priced, keep syncing even down to 0 — an emptied
    // BoQ must not leave stale Value/COGS on the tracker. Never-priced proposals
    // don't overwrite the intake estimate.
    next = { ...next, pricedOnce: pRef.current.pricedOnce || next.bom.length > 0 }
    setP(next)
    store.saveProposal(oppId, next)
    if (next.pricedOnce) {
      const t = computeTotals(next)
      const valueK = Math.round(t.target / 1000)
      const cogsK = Math.round(t.cost / 1000)
      if (isFinite(valueK) && isFinite(cogsK) && (valueK !== opp.valueK || cogsK !== opp.cogsK || !opp.proposalDate)) {
        store.updateOpportunity(oppId, {
          valueK, cogsK,
          ...(opp.proposalDate ? {} : { proposalDate: new Date().toISOString().slice(0, 10) }),
        })
      }
    }
  }
  const set = k => e => save({ ...p, [k]: e.target.value })
  const setCosting = k => e => save({ ...p, costing: { ...p.costing, [k]: clampCosting(k, e.target.value) } })

  // Formula-bar selection for the costing block — the same cell refs and
  // formulas as the real Priced BoQ sheet (O4 is literally =8.5%+2.5%+5%).
  const selCosting = (ref, formula, key, kind = 'number') => () => fb.select({
    ref, formula,
    // Patch against pRef.current, not the render-time p — the commit may fire
    // long after other edits (BoQ lines, units, terms) have changed the proposal.
    // Clamped here too — the bar writes to state directly, so the cells' own
    // min/max attributes never see the value.
    commit: key ? v => { const cur = pRef.current; save({ ...cur, costing: { ...cur.costing, [key]: clampCosting(key, v) } }) } : null,
    kind,
  })

  // Add by index into allParts — part numbers are NOT unique across lists
  // (ad-hoc quotes can duplicate a BNK/Metrics PN, and repeat over time).
  const addBomLine = idx => {
    const part = allParts[+idx]
    if (!part) return
    save({
      ...p,
      bom: [...p.bom, {
        itemCategory: '', pn: part.pn, desc: part.desc, listPrice: part.price, adders: [],
        qtyPerUnit: 0, common: 1, spares: 0, quoted: '', list: part.list, currency: part.currency,
      }],
    })
  }
  // Unit Price ₹ stays a string field — blank means "use the computed price" —
  // so it can't go through clampQty; it only rejects negatives.
  const clampQuoted = s => {
    const t = String(s)
    if (t.trim() === '') return ''
    const n = Number(t)
    if (!isFinite(n)) return ''
    return n < 0 ? '0' : t
  }
  const updLine = (i, k, numeric = true) => e => {
    const v = k === 'quoted' ? clampQuoted(e.target.value)
      : numeric ? clampQty(e.target.value) : e.target.value
    save({ ...p, bom: p.bom.map((l, j) => (j === i ? { ...l, [k]: v } : l)) })
  }
  const toggleAdder = (i, adder) => () => {
    const bom = p.bom.map((l, j) => {
      if (j !== i) return l
      const has = l.adders.includes(adder.code)
      return { ...l, adders: has ? l.adders.filter(a => a !== adder.code) : [...l.adders, adder.code] }
    })
    save({ ...p, bom })
  }
  const removeLine = i => () => save({ ...p, bom: p.bom.filter((_, j) => j !== i) })

  const updTerm = (i, k) => e => save({ ...p, terms: p.terms.map((t, j) => (j === i ? { ...t, [k]: e.target.value } : t)) })
  const addTerm = () => save({ ...p, terms: [...p.terms, { term: '', customerAsk: '', ourResponse: '', status: 'Comply' }] })
  const removeTerm = i => () => save({ ...p, terms: p.terms.filter((_, j) => j !== i) })

  const comms = (store.communications || {})[oppId] || []

  // Submission gates: red-customer clearance, deviation approvals, and
  // approved-with-conditions confirmations, per the Aug 10 review.
  const blockers = oppBlockers(opp, p, store.approvals || [])
  const blocked = isBlocked(blockers)
  const submitted = comms.some(c => c.kind === 'submission')

  const requestApproval = bl => () => store.requestApproval({
    oppId, type: bl.approvalType, approver: bl.approver, detail: bl.text,
  })
  const confirmCond = bl => () => {
    setConditionTarget(bl)
    setConditionNote('')
  }
  const saveCondition = () => {
    if (!conditionNote.trim() || !conditionTarget) return
    store.confirmCondition(conditionTarget.approvalId, conditionTarget.condIdx, conditionNote.trim())
    setConditionTarget(null)
    setConditionNote('')
  }
  const markSubmitted = () => {
    store.addCommunication(oppId, {
      to: opp.contactPerson || opp.sellTo,
      subject: `${oppId} — Proposal Rev ${p.revision} submitted to customer`,
      kind: 'submission',
    })
    if (!opp.proposalDate) store.updateOpportunity(oppId, { proposalDate: new Date().toISOString().slice(0, 10) })
  }

  const attachmentName = `${oppId}_Proposal_Rev_${p.revision}.pdf`

  const emailBody = [
      'Dear Sir/Madam,',
      '',
      ...(emailNote.trim() ? [emailNote.trim(), ''] : []),
      `Please find our Techno-Commercial Proposal ${oppId}${p.project ? ' for ' + p.project : ''}.`,
      ...(p.rfqNumber ? [`Ref: ${p.rfqNumber}`] : []),
      '',
      ...p.bom.slice(0, 6).map((l, i) => `${i + 1}. ${l.desc} — ${totalQty(l)} nos`),
      ...(p.bom.length > 6 ? [`…and ${p.bom.length - 6} more items`] : []),
      '',
      'The proposal PDF can be saved from the workbook using Print / PDF proposal.',
      '',
      'Best regards,',
      MODAE_COMPANY.name,
  ].join('\n')
  // Gmail compose URLs are reliable in the browser and do not depend on the
  // Mac's default mail application. Keep the body compact and never cut through
  // a %XX escape.
  const gmailComposeHref = (() => {
    if (!emailTo.trim()) return ''
    const encBody = encodeURIComponent(emailBody).slice(0, 1600).replace(/%[0-9A-F]?$/i, '')
    const cc = emailCc.trim() ? `&cc=${encodeURIComponent(emailCc.trim())}` : ''
    return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(emailTo.trim())}&su=${encodeURIComponent(emailSubject)}${cc}&body=${encBody}`
  })()

  const sendEmail = () => {
    if (!emailTo.trim()) return
    store.addCommunication(oppId, {
      to: emailTo.trim(), cc: emailCc.trim(), subject: emailSubject,
      kind: 'proposal-email-compose', pdfName: attachmentName,
    })
    setEmailOpen(false)
  }

  const openEmail = () => {
    setEmailSubject(`${oppId} — Techno-Commercial Proposal${p.project ? ' — ' + p.project.slice(0, 60) : ''}`)
    setEmailTo(opp.contactEmail || customer?.email || '')
    setEmailCc('')
    setEmailPreview(false)
    setEmailOpen(true)
  }

  const exportBoQ = () => exportCSV(
    `${oppId}_Priced_BoQ.csv`,
    ['Sl.', 'Item Category', 'Item/Scope Description', 'Proposed Model & Part Number', 'Customer Item Code', 'Adders', 'Qty/Unit', 'Common', 'Spares', 'Total Qty', 'UOM', 'Unit Price ₹', 'Total Price ₹', 'Unit Cost ₹', 'Total Cost ₹', `List Price`, 'Currency'],
    p.bom.map((l, i) => [i + 1, l.itemCategory, l.desc, l.pn, l.custRef, l.adders.join('+'), l.qtyPerUnit, l.common, l.spares, totalQty(l), l.uom, lineQuoted(l), lineQuoted(l) * totalQty(l), Math.round(lineCost(l)), Math.round(lineCost(l) * totalQty(l)), linePrice(l), l.currency])
  )

  // The customer document: sections auto-drafted from the opportunity and BoQ,
  // each overridable on the Document tab. Attachments pick up whatever the
  // intake wizard filed under Customer Specs.
  const specFiles = ((store.files || {})[oppId] || {})['Customer Specs'] || []
  const doc = docModel(p, opp, { files: specFiles.map(f => f.name).filter(Boolean) })
  // An unpriced technical bid, or a role that may not see money, prints the
  // full document with quantities only — never a document with the BoQ missing.
  const priced = p.bidType !== 'Unpriced (Technical)' && comm

  // Signal List and Rack Layout are project artefacts. Biji, 13 Aug: "in the
  // spare parts case, there will not be any signal list, there will not be
  // rack layout." Hide the tabs rather than show them with an apology.
  const route = docRoute(p, opp)
  const visibleTabs = ROUTE_TABS[route] || ROUTE_TABS.Project
  // Switching route while sitting on a now-hidden tab must not blank the page.
  if (!visibleTabs.includes(tab)) { setTab('Cover Letter'); return null }

  if (printing) {
    return (
      <div className="page">
        <PrintDoc p={p} opp={opp} doc={doc} priced={priced} totals={totals} lineQuoted={lineQuoted} />
      </div>
    )
  }

  return (
    <div className="page">
      <h2>{oppId} — {opp.sellTo} — Proposal Workbook</h2>
      <div className="toolbar">
        <Link className="btn" to={`/folders/${oppId}`}>◂ Back to folder</Link>
        <span className="spacer" />
        <label className="hint">Proposal type:{' '}
          <select value={p.proposalType || 'Project'} onChange={set('proposalType')}>
            <option>Project</option><option>Spares</option><option>Services</option>
          </select>
        </label>
        {pendingForOpp.length > 0 && <span className="pill Amber">{pendingForOpp.length} approval{pendingForOpp.length > 1 ? 's' : ''} pending</span>}
        {tab === 'Priced BoQ' && comm && <button onClick={exportBoQ}>Extract to Excel</button>}
        <button onClick={() => setPreviewOpen(true)}><Icon name="eye" size={13} /> Preview proposal</button>
        <button onClick={openEmail}><Icon name="mail" size={13} /> Email proposal</button>
        <button className="primary" onClick={() => setPrinting(true)}><Icon name="printer" size={13} /> Print / PDF proposal</button>
      </div>

      {opp.status === 'Open' && (
        <div className={`gate-strip ${blocked ? 'blocked' : 'ready'}`}>
          {blockers.length === 0 && (
            <div className="gate-row">
              <Icon name="checkCircle" size={15} />
              <span>No blockers — the proposal is clear to go to the customer.</span>
              <span className="spacer" />
              {submitted
                ? <span className="pill won">Submitted</span>
                : <button className="primary" onClick={markSubmitted}>Mark submitted to customer</button>}
            </div>
          )}
          {blockers.map(bl => (
            <div key={bl.key} className={`gate-row ${bl.severity}`}>
              <Icon name={bl.severity === 'info' ? 'alert' : bl.severity === 'wait' ? 'clock' : 'lock'} size={15} />
              <span>{bl.text}</span>
              <span className="spacer" />
              {bl.approvalType && bl.severity !== 'wait' && (
                <button onClick={requestApproval(bl)}>Request {bl.approver} approval</button>
              )}
              {bl.approvalId != null && bl.condIdx != null && (
                <button onClick={confirmCond(bl)}>Confirm incorporated</button>
              )}
            </div>
          ))}
          {blockers.length > 0 && !blocked && !submitted && (
            <div className="gate-row">
              <span className="spacer" />
              <button className="primary" onClick={markSubmitted}>Mark submitted to customer</button>
            </div>
          )}
          {blockers.length > 0 && !blocked && submitted && (
            <div className="gate-row"><span className="spacer" /><span className="pill won">Submitted</span></div>
          )}
        </div>
      )}

      {route !== 'Project' && (
        <div className="ai-notice" style={{ marginBottom: 10 }}>
          <b>{route} proposal route.</b> The printed document uses the short {route.toLowerCase()} section
          set — no signal list or rack layout, and no project front matter. Section wording will be
          based on the supplied {p.templateSource || `${route.toLowerCase()} sample`} structure: {p.artifactSheets.filter(x => !['Cover Letter', 'Priced BoQ'].includes(x)).join(' · ')}.
        </div>
      )}

      {tab === 'Cover Letter' && (
        <div className="cover-sheet">
          <div className="cover-head">
            <ModaeImageLogo className="cover-logo" height={34} />
            <span className="tagline">{MODAE_COMPANY.tagline}</span>
          </div>
          <div className="cover-meta">
            <div><b>Date:</b> <span className="cover-field"><input type="date" value={p.revisionDate} onChange={set('revisionDate')} /></span></div>
            <div><b>Our Ref:</b> {p.ourRef}</div>
            <div><b>Bid Stage:</b> <select value={p.bidStage} onChange={set('bidStage')}><option>Binding</option><option>Budgetary</option></select></div>
            <div><b>Bid Type:</b> <select value={p.bidType} onChange={set('bidType')}><option>Priced</option><option>Unpriced (Technical)</option></select></div>
            <div><b>Revision:</b> <select value={p.revision} onChange={set('revision')}>{['00','01','02','03','04'].map(r => <option key={r}>{r}</option>)}</select></div>
          </div>
          <div className="cover-meta">
            <div><b>{p.addressee}</b></div>
            <div>Kind Attn: <span className="cover-field"><input value={p.kindAttn} onChange={set('kindAttn')} /></span></div>
            <div>Mobile: {p.attnPhone}</div>
          </div>
          <div className="cover-meta">
            <div><b>Subject:</b> RFQ # <span className="cover-field"><input value={p.rfqNumber} onChange={set('rfqNumber')} placeholder="RFQ number & date" style={{ minWidth: 180 }} /></span></div>
            <div style={{ marginLeft: 62 }}>{p.subject}</div>
            <div><b>Project:</b> <span className="cover-field"><input value={p.project} onChange={set('project')} style={{ minWidth: 420 }} /></span></div>
          </div>
          <div className="cover-body">
            <p>Dear Sir,</p>
            <p>With reference to your RFQ {p.rfqNumber && `# ${p.rfqNumber}`} we are pleased to submit our Techno-Commercial Proposal for your review and consideration.</p>
            <p>Based on our understanding of the requirement and the information shared by your team, we have prepared the enclosed proposal to support your planning, budgeting, and technical evaluation activities.</p>
          </div>

          <div className="section-title">Commercial Terms &amp; Compliance</div>
          <table className="sheet" style={{ marginBottom: 8 }}>
            <thead>
              <tr><th>Term</th><th>Customer Ask</th><th>Our Response</th><th>Comply / Deviation</th><th></th></tr>
            </thead>
            <tbody>
              {p.terms.map((t, i) => (
                <tr key={i}>
                  <td><input value={t.term} onChange={updTerm(i, 'term')} placeholder="e.g. Payment" /></td>
                  <td><input value={t.customerAsk} onChange={updTerm(i, 'customerAsk')} /></td>
                  <td><input value={t.ourResponse} onChange={updTerm(i, 'ourResponse')} /></td>
                  <td className={t.status === 'Deviation' ? 'err' : ''}>
                    <select value={t.status} onChange={updTerm(i, 'status')}>
                      <option>Comply</option><option>Deviation</option>
                    </select>
                  </td>
                  <td><button onClick={removeTerm(i)} title="Remove term">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={addTerm} className="no-print">+ Add term</button>
          <div className="costing-note">
            Every deviation from the customer's preferred commercial terms is called out here — deviations need approval before submission.
          </div>
          {comms.length > 0 && (
            <div className="comms-log">
              <div className="section-title">Communications</div>
              <table className="sheet">
                <thead><tr><th>When</th><th>To</th><th>Subject</th></tr></thead>
                <tbody>
                  {comms.map((c, i) => (
                    <tr key={i}>
                      <td>{c.ts.slice(0, 16).replace('T', ' ')}</td><td>{c.to}</td><td>{c.subject}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'Document' && (
        <DocEditor p={p} opp={opp} save={save} files={specFiles.map(f => f.name).filter(Boolean)}
          totals={totals} priced={priced} />
      )}

      {['Scope of Work', 'Issues List', 'Proposal', 'Service Rate Schedule', 'Firm Offer', 'Clarifications', 'Sensor Comparison'].includes(tab) && (
        <RouteTemplateTab route={route} tab={tab} p={p} doc={doc} priced={priced} lineQuoted={lineQuoted} />
      )}

      {tab === 'Signal List' && (
        <div className="form-card print-landscape">
          <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>Signal List</span>
            {derivedTotal > 0
              ? <span className="hint">(counted from the priced BoQ — edit any cell to override)</span>
              : ['Spares', 'Retrofit', 'Service'].includes(opp.oppType) &&
                <span className="hint">(not applicable for spares/service proposals — shown for reference)</span>}
            {signalsStale && (
              <button style={{ marginLeft: 'auto', fontSize: 12, padding: '3px 10px' }}
                onClick={() => save({ ...p, signals: derivedSignals })}>
                Recalculate from BoQ ({derivedTotal})
              </button>
            )}
          </div>
          <table className="sheet">
            <thead><tr><th>Signal</th><th>Per Unit</th><th>Units</th><th>Total</th><th>PI Tags (×15)</th></tr></thead>
            <tbody>
              {p.signals.map((s, i) => (
                <tr key={i}>
                  <td>{s.signal}</td>
                  <td className="num"><input type="number" min="0" value={s.perUnit} onChange={e => { const signals = p.signals.map((x, j) => j === i ? { ...x, perUnit: clampQty(e.target.value) } : x); save({ ...p, signals }) }} style={{ width: 60, textAlign: 'right' }} /></td>
                  <td className="num"><input type="number" min="0" value={s.units} onChange={e => { const signals = p.signals.map((x, j) => j === i ? { ...x, units: clampQty(e.target.value) } : x); save({ ...p, signals }) }} style={{ width: 60, textAlign: 'right' }} /></td>
                  <td className="num">{s.perUnit * s.units}</td>
                  <td className="num">{s.perUnit * s.units * 15}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>Total</td><td></td><td></td><td className="num">{totalSignals}</td><td className="num">{totalSignals * 15}</td></tr>
            </tfoot>
          </table>
          <div className="costing-note">
            {totalSignals > 0
              ? <>1 vibration signal ≈ 15 AVEVA PI tags. {totalSignals * 15} tags → select the next-higher CMS license tier from the B&K price list (e.g. CMS-TAG-4000).</>
              : <>No sensing elements on the priced BoQ yet — add accelerometers, proximity probes or keyphasors there and the counts appear here, or type them in directly.</>}
          </div>
        </div>
      )}

      {tab === 'Rack Layout' && (
        <div className="form-card print-landscape">
          <div className="section-title">Rack Layout <span className="hint">(sized from the signal list)</span></div>
          {totalSignals === 0 ? (
            <div className="hint" style={{ padding: '18px 2px' }}>
              Nothing to size yet — the rack follows the signal count. Add sensing elements to the
              priced BoQ, or enter counts on the Signal List tab.
            </div>
          ) : (
            <>
              <div className="costing-note" style={{ marginTop: 0, marginBottom: 12 }}>
                {totalSignals} signals ÷ {UMM_CHANNELS} channels per UMM → {rack.ummCount} UMM.
                With 2× PSU, RCM and eSAM fixed in every rack, that is {rack.slotsUsed} of {rack.totalSlots} slots
                across {rack.rackCount} rack{rack.rackCount > 1 ? 's' : ''} — {rack.spareSlots} spare.
              </div>
              <table className="sheet" style={{ maxWidth: 560, marginBottom: 18 }}>
                <thead><tr><th>Module</th><th>Part Number</th><th>Qty</th></tr></thead>
                <tbody>
                  {rack.modules.map(m => (
                    <tr key={m.key}>
                      <td>{m.label}</td>
                      <td>{m.pn}</td>
                      <td className="num">{m.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rack.racks.map((slots, r) => (
                <div key={r} style={{ marginBottom: 14 }}>
                  <div className="hint" style={{ marginBottom: 6 }}>
                    Rack {r + 1} of {rack.rackCount} — {RACK_SLOTS}-slot VC-8000/RCK
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {slots.map((mod, i) => (
                      <div key={i} title={`Slot ${i + 1}${mod ? ` — ${mod}` : ' — spare'}`}
                        style={{
                          width: 62, padding: '10px 0', textAlign: 'center', fontSize: 12,
                          borderRadius: 4, border: '1px solid var(--border-soft)',
                          background: mod ? 'var(--primary-soft)' : 'transparent',
                          color: mod ? 'var(--primary-deep)' : 'var(--text-subtle)',
                          borderStyle: mod ? 'solid' : 'dashed',
                          fontWeight: mod ? 600 : 400,
                        }}>
                        {mod || 'spare'}
                        <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.6 }}>{i + 1}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
          <div className="hint">Module counts must match the hardware BoQ; the final rack drawing is attached by the engineer.</div>
        </div>
      )}

      {tab === 'Priced BoQ' && !comm && (
        <div className="restricted" style={{ maxWidth: 640 }}>
          <Icon name="lock" size={13} /> Restricted — the Priced BoQ (costing factors, landed costs, margins) is visible to the sales owner, approvers and admin — technical reviewers see quantities only.
        </div>
      )}

      {tab === 'Priced BoQ' && comm && (
        <>
          <div className="factors">
            <table>
              <thead><tr><th colSpan={2}>Imported Items Pricing &amp; Costing Factors</th></tr></thead>
              <tbody>
                <tr onClick={selCosting('O3', p.costing.baseRate, 'baseRate')}><td>Euro-₹ Base</td><td className="num"><input type="number" step="0.01" min="0" value={p.costing.baseRate} onChange={setCosting('baseRate')} /></td></tr>
                <tr onClick={selCosting('P3', p.costing.usdBase, 'usdBase')}><td>USD-₹ Base</td><td className="num"><input type="number" step="0.01" min="0" value={p.costing.usdBase} onChange={setCosting('usdBase')} /></td></tr>
                <tr onClick={selCosting('O4', p.costing.cdErvContPct === 16 ? '=8.5%+2.5%+5%' : p.costing.cdErvContPct, 'cdErvContPct', 'pct')}><td>CD+ERV+Cont.</td><td className="num"><input type="number" step="0.1" min="0" value={p.costing.cdErvContPct} onChange={setCosting('cdErvContPct')} />%</td></tr>
                <tr onClick={selCosting('O5', p.costing.bnkDiscPct, 'bnkDiscPct', 'pct')}><td>B&amp;K Disc%</td><td className="num"><input type="number" step="0.1" min="0" max="100" value={p.costing.bnkDiscPct} onChange={setCosting('bnkDiscPct')} />%</td></tr>
                <tr onClick={selCosting('O6', '=ROUNDUP((O3*(1+O4)*(1-O5)),0)', null)}><td><b>Eff. Rate</b></td><td className="num"><b>₹ {fmt(effectiveRate(p.costing))} / €&nbsp;·&nbsp;₹ {fmt(effectiveRate(p.costing, 'USD', false))} / $</b></td></tr>
                <tr onClick={selCosting('O7', p.costing.inputGMPct, 'inputGMPct', 'pct')}><td>Input GM%</td><td className="num"><input type="number" step="0.1" min="0" max={MAX_GM_PCT} value={p.costing.inputGMPct} onChange={setCosting('inputGMPct')} />%</td></tr>
              </tbody>
            </table>
            <table>
              <thead><tr><th colSpan={2}>Roll-up (internal)</th></tr></thead>
              <tbody>
                <tr onClick={selCosting('Q3', '=SUM(Total Cost ₹)', null)}><td>ModAE Costs</td><td className="num">₹ {fmt(totals.cost)}</td></tr>
                <tr onClick={selCosting('Q4', '=SUM(Total Price ₹)', null)}><td>Target Price</td><td className="num">₹ {fmt(totals.target)}</td></tr>
                <tr onClick={selCosting('Q5', p.costing.financeCostK, 'financeCostK')}><td>Finance Cost (K₹)</td><td className="num"><input type="number" step="1" min="0" value={p.costing.financeCostK} onChange={setCosting('financeCostK')} /></td></tr>
                <tr onClick={selCosting('Q6', '=Q4-Q3-Q5*1000', null)}><td><b>Net GM ₹</b></td><td className="num"><b>₹ {fmt(netGM)}</b></td></tr>
                <tr onClick={selCosting('Q7', '=Q6/Q4', null)}><td><b>Net GM %</b></td><td className="num"><b>{totals.target ? ((netGM / totals.target) * 100).toFixed(2) + '%' : '—'}</b></td></tr>
              </tbody>
            </table>
            <table>
              <thead><tr><th colSpan={2}>Project</th></tr></thead>
              <tbody>
                <tr><td>№ of Units</td><td className="num"><input type="number" min="1" value={units} onChange={e => save({ ...p, units: +e.target.value || 1 })} /></td></tr>
              </tbody>
            </table>
          </div>
          <div className="costing-note">
            Eff. Rate = ROUNDUP(base × (1 + CD+ERV+Cont.) × (1 − B&amp;K Disc)) — e.g. 112 × 1.16 × 0.50 → ₹65 (B&amp;K discount applies to the B&amp;K list only).
            Unit ₹ price = list × Eff. Rate ÷ (1 − GM). Net GM = Target − ModAE Costs − Finance Cost, so quoting below the computed price or adding finance cost pulls Net GM% under the Input GM%.
            Input GM% is capped at {MAX_GM_PCT}%, the discount at 100%, and finance cost cannot be negative — the cells hold at those limits.
          </div>

          <div className="toolbar">
            <label>Add part from price list:{' '}
              <select value="" onChange={e => e.target.value !== '' && addBomLine(e.target.value)}>
                <option value="">— select part number —</option>
                {allParts.map((x, i) => <option key={i} value={i}>{x.list} · {x.pn} — {x.desc} ({x.currency} {fmt(x.price)})</option>)}
              </select>
            </label>
            <span className="hint">Ad-hoc trader quotes captured in Price Lists appear here too (latest entry = reference price).</span>
          </div>

          <div className="sheet-wrap">
            <table className="sheet">
              <thead>
                <tr>
                  <th>Sl.</th><th>Item Category</th><th>Item/Scope Description</th><th>Proposed Model &amp; Part Number</th><th>Configurable Adders</th>
                  <th>Qty/Unit</th><th>Common</th><th>Spares</th><th>Total Qty</th><th>UOM</th>
                  <th>Unit Price ₹</th><th>Total Price ₹</th>
                  <th className="internal">Unit Cost ₹</th><th className="internal">Total Cost ₹</th><th className="internal">Computed ₹</th><th className="internal">List Price</th><th></th>
                </tr>
              </thead>
              <tbody>
                {p.bom.map((l, i) => {
                  const part = allParts.find(x => x.pn === l.pn && (x.list === l.list || !l.list))
                  const q = totalQty(l)
                  return (
                    <tr key={i}>
                      <td className="rowhead">{i + 1}</td>
                      <td><input value={l.itemCategory} onChange={updLine(i, 'itemCategory', false)} placeholder="e.g. Proximity Transducer" style={{ minWidth: 140 }} /></td>
                      <td><input value={l.desc} onChange={updLine(i, 'desc', false)} style={{ minWidth: 180 }} /></td>
                      <td>
                        {l.pn || <span className="hint">—</span>}
                        {l.custRef && <div className="hint" title="Customer's own item code from the tender">{l.custRef}</div>}
                      </td>
                      <td>
                        {(part?.adders || []).length
                          ? part.adders.map(a => (
                            <label key={a.code} style={{ marginRight: 10 }}>
                              <input type="checkbox" checked={l.adders.includes(a.code)} onChange={toggleAdder(i, a)} />
                              {' '}{a.desc} (+{l.currency === 'USD' ? '$' : l.currency === 'INR' ? '₹' : '€'}{a.price})
                            </label>
                          ))
                          : <span className="hint">—</span>}
                      </td>
                      <td className="num"><input type="number" min="0" value={l.qtyPerUnit || ''} onChange={updLine(i, 'qtyPerUnit')} style={{ width: 52, textAlign: 'right' }} placeholder="-" /></td>
                      <td className="num"><input type="number" min="0" value={l.common || ''} onChange={updLine(i, 'common')} style={{ width: 52, textAlign: 'right' }} placeholder="-" /></td>
                      <td className="num"><input type="number" min="0" value={l.spares || ''} onChange={updLine(i, 'spares')} style={{ width: 52, textAlign: 'right' }} placeholder="-" /></td>
                      <td className="num"><b>{q}</b></td>
                      <td>{l.uom}</td>
                      <td className="num"><input type="number" min="0" value={l.quoted} onChange={updLine(i, 'quoted', false)} placeholder={fmt(Math.round(lineComputed(l)))} style={{ width: 90, textAlign: 'right' }} title="Customer-facing (target) price — blank = computed price" /></td>
                      <td className="num">₹ {fmt(lineQuoted(l) * q)}</td>
                      <td className="num internal">₹ {fmt(lineCost(l))}</td>
                      <td className="num internal">₹ {fmt(lineCost(l) * q)}</td>
                      <td className="num internal">₹ {fmt(Math.round(lineComputed(l)))}</td>
                      <td className="num internal">{l.currency === 'USD' ? '$' : l.currency === 'INR' ? '₹' : '€'} {fmt(linePrice(l))}</td>
                      <td><button onClick={removeLine(i)} title="Remove line">✕</button></td>
                    </tr>
                  )
                })}
                {!p.bom.length && <tr><td colSpan={17} className="hint">No lines yet — add parts from the price list above. Quantities work like the sheet: Total Qty = Qty/Unit × {units} units + Common + Spares.</td></tr>}
              </tbody>
              {p.bom.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={10}>Totals</td>
                    <td></td>
                    <td className="num">₹ {fmt(totals.target)}</td>
                    <td className="internal"></td>
                    <td className="num internal">₹ {fmt(totals.cost)}</td>
                    <td className="internal" colSpan={2}></td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div className="costing-note">Grey columns are the internal costing block (never shown to the customer); the white columns are the customer-facing BoQ, quoted in ₹ only.</div>
        </>
      )}

      {emailOpen && (
        <div className="modal form-card no-print">
          <div className="section-title"><Icon name="mail" size={15} /> Email proposal — {oppId}</div>
          <div className="q">
            <div className="q-label">To</div>
            <input type="text" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="customer@company.com" autoFocus />
          </div>
          <div className="q">
            <div className="q-label">CC</div>
            <input type="text" value={emailCc} onChange={e => setEmailCc(e.target.value)} placeholder="name@company.com, another@company.com" />
          </div>
          <div className="q">
            <div className="q-label">Subject</div>
            <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
          </div>
          <div className="q">
            <div className="q-label">Note (optional, one line)</div>
            <input type="text" value={emailNote} onChange={e => setEmailNote(e.target.value)} placeholder="e.g. Submitted within due date — happy to discuss." />
          </div>
          {/* Honest about the mechanism: a mailto: link opens Gmail compose but
              cannot send or carry the generated PDF. */}
          <div className="costing-note">
            Save <b>{attachmentName}</b> with <b>Save proposal PDF</b> below, then add it in Gmail if needed.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setEmailPreview(!emailPreview)}>
              {emailPreview ? 'Hide proposal preview' : 'Preview proposal'}
            </button>
            <button type="button" onClick={() => { setEmailOpen(false); setPrinting(true) }}>
              <Icon name="printer" size={13} /> Save proposal PDF
            </button>
          </div>
          {emailPreview && (
            <div className="email-preview">
              <div className="hint" style={{ padding: '6px 0' }}>
                To {emailTo || '— no recipient —'}{emailCc.trim() ? ` · CC ${emailCc}` : ''} · Subject: {emailSubject}
              </div>
              <div className="email-preview-doc">
                <PrintDoc p={p} opp={opp} doc={doc} priced={priced} totals={totals} lineQuoted={lineQuoted} />
              </div>
            </div>
          )}
          <div className="forms-actions">
            <a className={`primary email-launch-link${!gmailComposeHref ? ' disabled' : ''}`} href={gmailComposeHref || undefined}
              onClick={event => { if (!gmailComposeHref) event.preventDefault(); else sendEmail() }}
              aria-disabled={!gmailComposeHref} target="_blank" rel="noreferrer">
              Open Gmail compose ▸
            </a>
            <button onClick={() => setEmailOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {previewOpen && (
        <Modal title={`Proposal preview — ${oppId}`} onClose={() => setPreviewOpen(false)} wide className="proposal-preview-modal">
          <div className="proposal-preview-toolbar">
            <span className="hint">Customer-facing document · Rev {p.revision} · Read-only preview</span>
            <div className="forms-actions">
              <button onClick={() => setPreviewOpen(false)}>Close</button>
              <button className="primary" onClick={() => { setPreviewOpen(false); setPrinting(true) }}>
                <Icon name="printer" size={13} /> Print / PDF proposal
              </button>
            </div>
          </div>
          <div className="proposal-preview-scroll">
            <PrintDoc p={p} opp={opp} doc={doc} priced={priced} totals={totals} lineQuoted={lineQuoted} />
          </div>
        </Modal>
      )}

      {conditionTarget && (
        <Modal title="Confirm approval condition incorporated" onClose={() => setConditionTarget(null)}>
          <p className="hint">Record how this condition was incorporated in the proposal before release.</p>
          <textarea rows={4} value={conditionNote} onChange={e => setConditionNote(e.target.value)} placeholder="Describe the proposal change..." style={{ width: '100%' }} />
          <div className="forms-actions">
            <button className="primary" disabled={!conditionNote.trim()} onClick={saveCondition}>Confirm incorporated</button>
            <button onClick={() => setConditionTarget(null)}>Cancel</button>
          </div>
        </Modal>
      )}

      <div className="sheet-tabs">
        {visibleTabs.map(t => (
          <div key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</div>
        ))}
        <div className="tab">＋</div>
      </div>
    </div>
  )
}
