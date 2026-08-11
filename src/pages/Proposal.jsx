import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { defaultCosting } from '../seed.js'
import { effectiveRate, unitCostINR, unitSellINR, fmt, exportCSV, canViewCommercial } from '../utils.js'
import { useFormulaBar } from '../formulabar.jsx'
import { Icon } from '../icons.jsx'

const TABS = ['Cover Letter', 'Signal List', 'Rack Layout', 'Priced BoQ']

// Older saved proposals (and newProposal before this change) used a single
// `qty`; the real BoQ splits quantities into Qty/Unit × units + Common + Spares.
function normalize(pr) {
  return {
    ...pr,
    units: pr.units || 7,
    costing: { ...defaultCosting, ...pr.costing },
    terms: pr.terms || [],
    bom: (pr.bom || []).map(l => ({
      itemCategory: '', qtyPerUnit: 0, common: 0, spares: 0, quoted: '',
      list: 'BNK', currency: 'EUR',
      ...l,
      ...(l.qtyPerUnit === undefined && l.qty != null ? { common: l.qty } : {}),
    })),
  }
}

export default function Proposal() {
  const { oppId } = useParams()
  const store = useStore()
  const fb = useFormulaBar()
  const opp = store.opportunities.find(o => o.id === oppId)
  const [tab, setTab] = useState('Cover Letter')
  const [printing, setPrinting] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailNote, setEmailNote] = useState('')
  const [p, setP] = useState(() => normalize(store.getProposal(oppId)))
  // Ref mirror: deferred commits (formula bar) must patch the CURRENT proposal,
  // never a click-time snapshot — a stale snapshot would silently revert edits.
  const pRef = React.useRef(p)
  pRef.current = p

  // /proposal/:oppId reuses this component instance — reload state per opportunity.
  useEffect(() => { setP(normalize(store.getProposal(oppId))); setTab('Cover Letter') }, [oppId]) // eslint-disable-line

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

  const comm = canViewCommercial(store.role)

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

  const totalQty = (l, u = units) => (l.qtyPerUnit || 0) * u + (l.common || 0) + (l.spares || 0)
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
  const totalSignals = p.signals.reduce((s, r) => s + r.perUnit * r.units, 0)

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
  const setCosting = k => e => save({ ...p, costing: { ...p.costing, [k]: +e.target.value || 0 } })

  // Formula-bar selection for the costing block — the same cell refs and
  // formulas as the real Priced BoQ sheet (O4 is literally =8.5%+2.5%+5%).
  const selCosting = (ref, formula, key, kind = 'number') => () => fb.select({
    ref, formula,
    // Patch against pRef.current, not the render-time p — the commit may fire
    // long after other edits (BoQ lines, units, terms) have changed the proposal.
    commit: key ? v => { const cur = pRef.current; save({ ...cur, costing: { ...cur.costing, [key]: v } }) } : null,
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
  const updLine = (i, k, numeric = true) => e => {
    const v = numeric ? (+e.target.value || 0) : e.target.value
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

  const sendEmail = () => {
    const body = [
      'Dear Sir/Madam,',
      '',
      ...(emailNote.trim() ? [emailNote.trim(), ''] : []),
      `Please find our Techno-Commercial Proposal ${oppId}${p.project ? ' for ' + p.project : ''}.`,
      ...(p.rfqNumber ? [`Ref: ${p.rfqNumber}`] : []),
      '',
      ...p.bom.slice(0, 6).map((l, i) => `${i + 1}. ${l.desc} — ${totalQty(l)} nos`),
      ...(p.bom.length > 6 ? [`…and ${p.bom.length - 6} more items`] : []),
      '',
      'The detailed proposal PDF is attached separately.',
      '',
      'Best regards,',
      'ModAE India Pvt Ltd',
    ].join('\n')
    // mailto URLs are unreliable past ~2000 chars — cap the encoded body and
    // never cut through a %XX escape.
    const encBody = encodeURIComponent(body).slice(0, 1600).replace(/%[0-9A-F]?$/i, '')
    window.location.href = `mailto:${encodeURIComponent(emailTo.trim())}?subject=${encodeURIComponent(emailSubject)}&body=${encBody}`
    store.addCommunication(oppId, { to: emailTo.trim(), subject: emailSubject, kind: 'proposal-email' })
    setEmailOpen(false)
  }

  const openEmail = () => {
    setEmailSubject(`${oppId} — Techno-Commercial Proposal${p.project ? ' — ' + p.project.slice(0, 60) : ''}`)
    setEmailOpen(true)
  }

  const exportBoQ = () => exportCSV(
    `${oppId}_Priced_BoQ.csv`,
    ['Sl.', 'Item Category', 'Item/Scope Description', 'Proposed Model & Part Number', 'Adders', 'Qty/Unit', 'Common', 'Spares', 'Total Qty', 'Unit Price ₹', 'Total Price ₹', 'Unit Cost ₹', 'Total Cost ₹', `List Price`, 'Currency'],
    p.bom.map((l, i) => [i + 1, l.itemCategory, l.desc, l.pn, l.adders.join('+'), l.qtyPerUnit, l.common, l.spares, totalQty(l), lineQuoted(l), lineQuoted(l) * totalQty(l), Math.round(lineCost(l)), Math.round(lineCost(l) * totalQty(l)), linePrice(l), l.currency])
  )

  return (
    <div className="page">
      <h2>{oppId} — {opp.sellTo} — Proposal Workbook</h2>
      <div className="toolbar">
        <Link className="btn" to={`/folders/${oppId}`}>◂ Back to folder</Link>
        <span className="spacer" />
        {tab === 'Priced BoQ' && comm && <button onClick={exportBoQ}>Extract to Excel</button>}
        <button onClick={openEmail}><Icon name="mail" size={13} /> Email proposal</button>
        <button className="primary" onClick={() => setPrinting(true)}><Icon name="printer" size={13} /> Print / PDF proposal</button>
      </div>

      {(tab === 'Cover Letter' || printing) && (
        <div className="cover-sheet">
          <div className="cover-head">
            <span className="brand">‖a·e‖</span>
            <span className="tagline">Your Partners In Achieving Excellence</span>
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

      {tab === 'Signal List' && !printing && (
        <div className="form-card">
          <div className="section-title">Signal List {['Spares', 'Service', 'Training', 'AMC'].includes(opp.oppType) && <span className="hint">(not applicable for spares/service proposals — shown for reference)</span>}</div>
          <table className="sheet">
            <thead><tr><th>Signal</th><th>Per Unit</th><th>Units</th><th>Total</th><th>PI Tags (×15)</th></tr></thead>
            <tbody>
              {p.signals.map((s, i) => (
                <tr key={i}>
                  <td>{s.signal}</td>
                  <td className="num"><input type="number" value={s.perUnit} onChange={e => { const signals = p.signals.map((x, j) => j === i ? { ...x, perUnit: +e.target.value || 0 } : x); save({ ...p, signals }) }} style={{ width: 60, textAlign: 'right' }} /></td>
                  <td className="num"><input type="number" value={s.units} onChange={e => { const signals = p.signals.map((x, j) => j === i ? { ...x, units: +e.target.value || 0 } : x); save({ ...p, signals }) }} style={{ width: 60, textAlign: 'right' }} /></td>
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
            1 vibration signal ≈ 15 AVEVA PI tags. {totalSignals * 15} tags → select the next-higher CMS license tier from the B&K price list (e.g. CMS-TAG-4000).
          </div>
        </div>
      )}

      {tab === 'Rack Layout' && !printing && (
        <div className="form-card">
          <div className="section-title">Rack Layout (engineering output — placeholder in Phase 1)</div>
          <pre style={{ background: '#f7f7f7', border: '1px solid #ddd', padding: 14, fontSize: 12 }}>
{`┌─────────────────────── 16-SLOT RACK (VC-8000/RCK) ───────────────────────────┐
│ PSU │ PSU │ RCM │ UMM │ UMM │ UMM │ UMM │ eSAM │ ... │ ... │ ... │ spare... │
└──────────────────────────────────────────────────────────────────────────────┘`}
          </pre>
          <div className="hint">Module selection follows the signal list; the rack drawing is attached by the engineer.</div>
        </div>
      )}

      {tab === 'Priced BoQ' && !comm && (
        <div className="restricted" style={{ maxWidth: 640 }}>
          <Icon name="lock" size={13} /> Restricted — the Priced BoQ (costing factors, landed costs, margins) is visible to approvers/admin only.
        </div>
      )}

      {(tab === 'Priced BoQ' || printing) && comm && (
        <>
          <div className="factors">
            <table>
              <thead><tr><th colSpan={2}>Imported Items Pricing &amp; Costing Factors</th></tr></thead>
              <tbody>
                <tr onClick={selCosting('O3', p.costing.baseRate, 'baseRate')}><td>Euro-₹ Base</td><td className="num"><input type="number" step="0.01" value={p.costing.baseRate} onChange={setCosting('baseRate')} /></td></tr>
                <tr onClick={selCosting('P3', p.costing.usdBase, 'usdBase')}><td>USD-₹ Base</td><td className="num"><input type="number" step="0.01" value={p.costing.usdBase} onChange={setCosting('usdBase')} /></td></tr>
                <tr onClick={selCosting('O4', p.costing.cdErvContPct === 16 ? '=8.5%+2.5%+5%' : p.costing.cdErvContPct, 'cdErvContPct', 'pct')}><td>CD+ERV+Cont.</td><td className="num"><input type="number" step="0.1" value={p.costing.cdErvContPct} onChange={setCosting('cdErvContPct')} />%</td></tr>
                <tr onClick={selCosting('O5', p.costing.bnkDiscPct, 'bnkDiscPct', 'pct')}><td>B&amp;K Disc%</td><td className="num"><input type="number" step="0.1" value={p.costing.bnkDiscPct} onChange={setCosting('bnkDiscPct')} />%</td></tr>
                <tr onClick={selCosting('O6', '=ROUNDUP((O3*(1+O4)*(1-O5)),0)', null)}><td><b>Eff. Rate</b></td><td className="num"><b>₹ {fmt(effectiveRate(p.costing))} / €&nbsp;·&nbsp;₹ {fmt(effectiveRate(p.costing, 'USD', false))} / $</b></td></tr>
                <tr onClick={selCosting('O7', p.costing.inputGMPct, 'inputGMPct', 'pct')}><td>Input GM%</td><td className="num"><input type="number" step="0.1" value={p.costing.inputGMPct} onChange={setCosting('inputGMPct')} />%</td></tr>
              </tbody>
            </table>
            <table>
              <thead><tr><th colSpan={2}>Roll-up (internal)</th></tr></thead>
              <tbody>
                <tr onClick={selCosting('Q3', '=SUM(Total Cost ₹)', null)}><td>ModAE Costs</td><td className="num">₹ {fmt(totals.cost)}</td></tr>
                <tr onClick={selCosting('Q4', '=SUM(Total Price ₹)', null)}><td>Target Price</td><td className="num">₹ {fmt(totals.target)}</td></tr>
                <tr onClick={selCosting('Q5', p.costing.financeCostK, 'financeCostK')}><td>Finance Cost (K₹)</td><td className="num"><input type="number" step="1" value={p.costing.financeCostK} onChange={setCosting('financeCostK')} /></td></tr>
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
                  <th>Qty/Unit</th><th>Common</th><th>Spares</th><th>Total Qty</th>
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
                      <td>{l.pn}</td>
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
                {!p.bom.length && <tr><td colSpan={16} className="hint">No lines yet — add parts from the price list above. Quantities work like the sheet: Total Qty = Qty/Unit × {units} units + Common + Spares.</td></tr>}
              </tbody>
              {p.bom.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={9}>Totals</td>
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
            <div className="q-label">Subject</div>
            <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
          </div>
          <div className="q">
            <div className="q-label">Note (optional, one line)</div>
            <input type="text" value={emailNote} onChange={e => setEmailNote(e.target.value)} placeholder="e.g. Submitted within due date — happy to discuss." />
          </div>
          <div className="costing-note">
            Opens your mail app with a summary body — attach the printed PDF before sending. The send is recorded in the communications log.
          </div>
          <div className="forms-actions">
            <button className="primary" disabled={!emailTo.trim()} onClick={sendEmail}>Open in mail app ▸</button>
            <button onClick={() => setEmailOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="sheet-tabs">
        {TABS.map(t => (
          <div key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</div>
        ))}
        <div className="tab">＋</div>
      </div>
    </div>
  )
}
