import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { seedPriceLists } from '../seed.js'
import { canViewCommercial, fmt } from '../utils.js'
import { computeProposalTotals } from '../gates.js'
import { Chip, AiBadge, Phase2Badge } from '../ui.jsx'
import { Icon } from '../icons.jsx'

const SECTIONS = [
  '1. Requirement summary', '2. Hardware BOQ', '3. Software BOQ', '4. Services BOQ',
  '5. Signal list', '6. Rack layout', '7. Compliance & deviations',
  '8. Assumptions / exclusions', '9. Pricing', '10. Preview',
]

// Seeded B&K BOQ (AI-generated stand-in): [category, pn, qtyPerUnit, common, spares]
const CANNED_BOQ = [
  ['Hardware', 'RK16-BASE', 0, 2, 0],
  ['Hardware', 'VC-8000/UMM', 1, 0, 1],
  ['Hardware', 'IN081-3-110-50', 8, 0, 2],
  ['Hardware', 'AGSC-51-4-CAB', 12, 0, 0],
  ['Software', 'SETPOINT-XC-CMS', 0, 1, 0],
]

const TERM_STATUSES = ['Comply', 'Deviation', 'Clarification Required']

// Project workbench — pragmatic 10-section view over the proposal workbook.
export default function WbProject({ opp, openBuilder }) {
  const store = useStore()
  const comm = canViewCommercial(store.role)
  const p = store.getProposal(opp.id)
  const [sec, setSec] = useState(0)
  const [rfpSim, setRfpSim] = useState(false)
  const [fxSim, setFxSim] = useState(false)
  const [fx, setFx] = useState({ USD: 90, AED: 24.5 })
  const [routed, setRouted] = useState(false)
  const lead = store.leads.find(l => l.oppId === opp.id)

  const save = next => store.saveProposal(opp.id, next)

  const generateBoq = () => {
    const parts = seedPriceLists.BNK.parts
    const bom = CANNED_BOQ.map(([cat, pn, qtyPerUnit, common, spares]) => {
      const part = parts.find(x => x.pn === pn)
      return {
        itemCategory: cat, pn, desc: part?.desc || pn, listPrice: part?.price || 0,
        adders: [], qtyPerUnit, common, spares, quoted: '', list: 'BNK', currency: 'EUR',
      }
    })
    save({ ...p, bom: [...(p.bom || []), ...bom] })
  }

  const setTermStatus = (i, status) =>
    save({ ...p, terms: (p.terms || []).map((t, j) => (j === i ? { ...t, status } : t)) })

  const routeDeviation = t => {
    store.requestApproval({
      oppId: opp.id, type: 'Technical deviation', approver: 'LJS', needed: ['LJS'],
      detail: `${t.term}: customer asks "${t.customerAsk}", our response "${t.ourResponse}" — TECH reviews informally, LJS decides.`,
    })
    setRouted(true)
  }

  const boqSection = cat => {
    const rows = (p.bom || []).filter(l => l.itemCategory === cat)
    return (
      <div>
        <div className="section-title">{cat} BOQ ({rows.length} line{rows.length === 1 ? '' : 's'})</div>
        {!(p.bom || []).length && (
          <div style={{ marginBottom: 8 }}>
            <button className="primary" onClick={generateBoq}>
              <Icon name="sparkles" size={13} /> Generate seeded BOQ (AI)
            </button>
            <span className="hint" style={{ marginLeft: 8 }}>Builds a starter B&K line-up from the price list — review every line.</span>
          </div>
        )}
        <div className="sheet-wrap">
          <table className="sheet">
            <thead><tr><th>Part number</th><th>Description</th><th>Qty/Unit</th><th>Common</th><th>Spares</th><th>Compliance</th></tr></thead>
            <tbody>
              {rows.map((l, i) => (
                <tr key={i}>
                  <td><b>{l.pn}</b></td>
                  <td>{l.desc}</td>
                  <td className="num">{l.qtyPerUnit || 0}</td>
                  <td className="num">{l.common || 0}</td>
                  <td className="num">{l.spares || 0}</td>
                  <td><Chip tone={l.compliance === 'Deviation' ? 'state-Blocks' : 'state-Accepted'}>{l.compliance || 'Comply'}</Chip></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6} className="hint">No {cat.toLowerCase()} lines in the BoQ yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <p style={{ marginTop: 8 }}>
          <Link to={`/proposal/${opp.id}`}><Icon name="fileSheet" size={13} /> Open full workbook (Priced BoQ)</Link>
        </p>
      </div>
    )
  }

  const totals = computeProposalTotals(p)
  const unpriced = (p.bom || []).filter(l => !l.listPrice && l.quoted === '').length

  const body = () => {
    switch (sec) {
      case 0: return (
        <div>
          <div className="section-title">Requirement summary</div>
          <p style={{ fontSize: 12.5 }}>{lead?.ai?.summary || opp.remarks || 'No structured requirement captured yet — see the Requirement tab.'}</p>
          {lead?.attachments?.map(a => (
            <div key={a.name} className="attach-row"><Icon name="fileText" size={13} /> {a.name} <span className="hint">{a.pages} p.</span></div>
          ))}
          <div className="phase2-panel">
            <Phase2Badge /> <b>RFP / SOW parsing</b>
            <p className="hint">In Phase 2 a full RFP or scope-of-work document uploads here and parses into structured requirements with per-field AI confidence, using the same accept/edit/reject pattern as lead intake.</p>
            <button onClick={() => setRfpSim(true)}>Simulate RFP/SOW upload</button>
            {rfpSim && <div className="okbox">RFP parsed (simulated): 38 requirements extracted, 4 below the confidence threshold and queued for human review.</div>}
          </div>
        </div>
      )
      case 1: return boqSection('Hardware')
      case 2: return boqSection('Software')
      case 3: return boqSection('Service')
      case 4: return (
        <div>
          <div className="section-title">Signal list summary</div>
          <div className="sheet-wrap">
            <table className="sheet">
              <thead><tr><th>Signal</th><th>Per unit</th><th>Units</th><th>Total</th></tr></thead>
              <tbody>
                {(p.signals || []).map((s, i) => (
                  <tr key={i}><td>{s.signal}</td><td className="num">{s.perUnit}</td><td className="num">{s.units}</td><td className="num">{s.perUnit * s.units}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: 8 }}><Link to={`/proposal/${opp.id}`}>Edit in the workbook (Signal List tab)</Link></p>
        </div>
      )
      case 5: return (
        <div>
          <div className="section-title">Rack layout</div>
          <p className="hint">Slot allocation and rack sizing live on the workbook's Rack Layout tab — module counts there must match the hardware BOQ.</p>
          <p><Link to={`/proposal/${opp.id}`}><Icon name="layers" size={13} /> Open workbook (Rack Layout tab)</Link></p>
        </div>
      )
      case 6: return (
        <div>
          <div className="section-title">Compliance & deviations <AiBadge label="AI-drafted matrix" /></div>
          <div className="sheet-wrap">
            <table className="sheet">
              <thead><tr><th>Term</th><th>Customer ask</th><th>Our response</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {(p.terms || []).map((t, i) => (
                  <tr key={i}>
                    <td><b>{t.term}</b></td>
                    <td>{t.customerAsk}</td>
                    <td>{t.ourResponse}</td>
                    <td>
                      <select value={t.status} onChange={e => setTermStatus(i, e.target.value)}>
                        {TERM_STATUSES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td>
                      {t.status === 'Deviation' && (
                        <button onClick={() => routeDeviation(t)}>Resolve & route (Technical + LJS)</button>
                      )}
                    </td>
                  </tr>
                ))}
                {!(p.terms || []).length && <tr><td colSpan={5} className="hint">No terms captured yet — insert the AI-suggested terms from the builder.</td></tr>}
              </tbody>
            </table>
          </div>
          {routed && <div className="okbox">Technical deviation routed — TECH reviews informally, LJS decides in Approvals.</div>}
        </div>
      )
      case 7: return (
        <div>
          <div className="section-title">Assumptions / exclusions</div>
          <textarea rows={8} style={{ width: '100%' }} value={p.assumptions || ''}
            placeholder={'One per line, e.g.\nUtility power available at rack room\nCivil works excluded\nSite access and permits by customer'}
            onChange={e => save({ ...p, assumptions: e.target.value })} />
          <p className="hint">Flows into the proposal's Assumptions and Exclusions sections.</p>
        </div>
      )
      case 8: return (
        <div>
          <div className="section-title">Pricing summary</div>
          {comm ? (
            <table className="cost-table">
              <tbody>
                <tr><td>Customer-facing value</td><td className="num">₹ {fmt(totals.value)}</td></tr>
                <tr><td>COGS</td><td className="num">₹ {fmt(totals.cogs)}</td></tr>
                <tr className="total"><td>GM</td><td className="num">₹ {fmt(totals.value - totals.cogs)} ({totals.gmPct.toFixed(1)}%)</td></tr>
              </tbody>
            </table>
          ) : (
            <div className="restricted"><Icon name="lock" size={12} /> Pricing summary restricted — LJS / AH only</div>
          )}
          {unpriced > 0 && <div className="warnbox">{unpriced} unpriced line{unpriced === 1 ? '' : 's'} in the BoQ — blocks readiness until priced.</div>}
          {!(p.bom || []).length && <div className="warnbox">No priced lines in the proposal — blocks readiness.</div>}
          {comm && (
            <div className="phase2-panel">
              <Phase2Badge /> <b>Multi-currency conversion</b>
              <p className="hint">Convert the customer-facing total at a configurable hedge rate for international tenders. Demo rates only — not a live feed.</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <span>INR base: ₹ {fmt(totals.value)}</span>
                {['USD', 'AED'].map(cur => (
                  <label key={cur} style={{ fontSize: 12 }}>
                    1 {cur} = ₹ <input type="number" step="0.1" value={fx[cur]} style={{ width: 70 }}
                      onChange={e => setFx({ ...fx, [cur]: +e.target.value || 1 })} />
                    <b style={{ marginLeft: 6 }}>{cur} {fmt(totals.value / (fx[cur] || 1))}</b>
                  </label>
                ))}
                <button onClick={() => setFxSim(true)}>Simulate</button>
              </div>
              {fxSim && <div className="okbox">Converted totals stamped on the draft (simulated) — hedge rate would be frozen at proposal date.</div>}
            </div>
          )}
        </div>
      )
      default: return (
        <div>
          <div className="section-title">Preview</div>
          <p className="hint">The customer-facing preview and submission readiness live in the proposal builder.</p>
          <button className="primary" onClick={openBuilder}><Icon name="arrowRight" size={13} /> Open proposal builder</button>
        </div>
      )
    }
  }

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 210 }}>
        {SECTIONS.map((s, i) => (
          <button key={s} className={sec === i ? 'primary' : ''} style={{ textAlign: 'left' }}
            onClick={() => setSec(i)}>{s}</button>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 320 }}>{body()}</div>
    </div>
  )
}
