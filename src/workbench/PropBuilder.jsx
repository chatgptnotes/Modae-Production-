import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { canViewCommercial, fmt, ddMmmYY } from '../utils.js'
import { readiness, isBlocked, commercialGate } from '../gates.js'
import { Chip, AiBadge, Phase2Badge, ErrBox, WarnBox, Modal } from '../ui.jsx'
import { Icon } from '../icons.jsx'
// Shared with the printed document, so the checklist and the real document
// can never list different sections.
import { PROP_SECTIONS, recommendTerms } from '../proposalDoc.js'

// Proposal builder: section checklist, customer-facing excerpt, and the
// readiness / approval column that gates 'Submit for approval'.
export default function PropBuilder({ opp }) {
  const store = useStore()
  const comm = canViewCommercial(store.role)
  const p = store.getProposal(opp.id)
  const blockers = readiness(opp, p, store)
  const blocked = isBlocked(blockers)
  const gate = commercialGate(opp, p, store.config)

  const [manualDone, setManualDone] = useState({})
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [condNotes, setCondNotes] = useState({})
  const [compareOpen, setCompareOpen] = useState(false)
  const [inserted, setInserted] = useState(false)
  const [tcSim, setTcSim] = useState(false)

  const revisions = p.revisions || []
  const pendingRelease = store.approvals.find(a =>
    a.oppId === opp.id && a.type === 'Final quote release' && a.status === 'Pending')
  const released = p.releaseStatus === 'Released' || store.approvals.some(a =>
    a.oppId === opp.id && a.type === 'Final quote release'
    && (a.status === 'Approved' || a.status === 'Approved with conditions'))

  // Content sections come from the workbook; the rest are auto-drafted by
  // proposalDoc and the checkbox records that a human has read them.
  const CONTENT = { 'Line items / BOQ': () => (p.bom || []).length > 0, Terms: () => (p.terms || []).length > 0 }
  const sectionDone = s => (CONTENT[s] ? CONTENT[s]() : !!manualDone[s])
  const derived = s => !!CONTENT[s]

  const requestForBlocker = bl => store.requestApproval({
    oppId: opp.id, type: bl.approvalType, approver: bl.approver,
    needed: [bl.approver], detail: bl.text,
  })

  const applyOverride = () => {
    if (!overrideReason.trim()) return
    store.kycOverride(opp.id, overrideReason.trim())
    setOverrideOpen(false)
    setOverrideReason('')
  }

  const condApprovals = store.approvals.filter(a =>
    a.oppId === opp.id && a.status === 'Approved with conditions')

  const insertTerms = () => {
    const recs = recommendTerms(opp)
    const terms = [...(p.terms || [])]
    for (const rec of recs) {
      const i = terms.findIndex(t => t.term === rec.term)
      if (i >= 0) terms[i] = { ...terms[i], ourResponse: rec.ourResponse, status: 'Comply' }
      else terms.push({ term: rec.term, customerAsk: '', ourResponse: rec.ourResponse, status: 'Comply' })
    }
    store.saveProposal(opp.id, { ...p, terms })
    setInserted(true)
  }

  const submitForApproval = () => {
    const today = new Date().toISOString().slice(0, 10)
    store.requestApproval({
      oppId: opp.id, type: 'Final quote release',
      detail: `GM ${gate.gmPct.toFixed(1)}% — ${gate.label}`,
      approver: gate.needed[0], needed: gate.needed,
    })
    store.updateOpportunity(opp.id, { milestone: 'Approval' })
    store.saveProposal(opp.id, {
      ...p,
      revision: String((+p.revision || 0) + 1).padStart(2, '0'),
      revisions: [...revisions, {
        rev: `R${revisions.length + 1}`, when: today, by: store.role,
        note: 'Submitted', status: 'Submitted',
      }],
    })
  }

  const totalLine = comm
    ? `₹ ${fmt(gate.value)} (${(p.bom || []).length} BoQ line${(p.bom || []).length === 1 ? '' : 's'})`
    : `${(p.bom || []).length} BoQ line${(p.bom || []).length === 1 ? '' : 's'}`

  return (
    <div className="threepanel">
      <div className="panel">
        <div className="panel-title">Sections</div>
        {PROP_SECTIONS.map(s => (
          <div key={s} className="check-row">
            <input type="checkbox" checked={sectionDone(s)} disabled={derived(s)}
              title={derived(s) ? 'Derived from the workbook content' : 'Auto-drafted — tick once reviewed'}
              onChange={e => setManualDone({ ...manualDone, [s]: e.target.checked })} />
            <span>{s}</span>
            {sectionDone(s)
              ? <Chip tone="state-Accepted">{derived(s) ? 'Ready' : 'Reviewed'}</Chip>
              : <Chip tone="grey">{derived(s) ? 'Open' : 'Auto-drafted'}</Chip>}
          </div>
        ))}
        <p className="hint" style={{ marginTop: 8 }}>
          Line items and Terms derive from the workbook. The rest are auto-drafted into the printed
          document and editable on the proposal's Document tab — tick each once you have read it.
        </p>
      </div>

      <div className="panel">
        <div className="panel-title">Customer-facing preview (excerpt)</div>
        <div className="form-card">
          <ErrBox>DEMO — NOT A COMMERCIAL OFFER</ErrBox>
          <p style={{ margin: '6px 0' }}><b>{p.addressee || `M/s. ${opp.sellTo}`}</b></p>
          <p style={{ margin: '6px 0' }}>Kind attn: {p.kindAttn || opp.contactPerson}</p>
          <p style={{ margin: '6px 0' }}><b>Subject:</b> {p.subject || `Proposal For ${opp.oppName}`}</p>
          <p style={{ margin: '6px 0' }}><b>Ref:</b> {opp.id} · Rev {p.revision}</p>
          <p style={{ margin: '6px 0' }}><b>Line items:</b> {totalLine}</p>
          {!comm && <p className="hint"><Icon name="lock" size={11} /> Commercial totals restricted — LJS / AH only.</p>}
          <p className="hint">Full document includes: {PROP_SECTIONS.join(' · ')}.</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Readiness & approval</div>
        {blockers.length === 0 && <div className="okbox">All readiness checks pass.</div>}
        {blockers.map(bl => (
          <div key={bl.key} className={bl.severity === 'info' ? 'warnbox' : bl.severity === 'wait' ? 'warnbox' : 'errbox'}>
            {bl.text}
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {bl.approvalType && bl.severity !== 'wait' && (
                <button onClick={() => requestForBlocker(bl)}>Request {bl.approver} approval</button>
              )}
              {bl.kyc && !overrideOpen && (
                <button onClick={() => setOverrideOpen(true)}>Override with reason</button>
              )}
            </div>
            {bl.kyc && overrideOpen && (
              <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                <input placeholder="Override reason (logged)" value={overrideReason} style={{ flex: 1 }}
                  onChange={e => setOverrideReason(e.target.value)} />
                <button className="primary" disabled={!overrideReason.trim()} onClick={applyOverride}>Log override</button>
              </div>
            )}
          </div>
        ))}
        {opp.kycOverride && (
          <div className="okbox">
            KYC overridden by {opp.kycOverride.by}: {opp.kycOverride.reason}
            <span className="hint"> (logged decision to proceed before AH clearance)</span>
          </div>
        )}

        {condApprovals.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 10 }}>Conditions from approvals</div>
            {condApprovals.map(a => (a.conditions || []).map((c, i) => (
              <div key={`${a.id}-${i}`} className={c.incorporated ? 'okbox' : 'warnbox'}>
                <b>{a.approver}:</b> {c.text}
                {c.incorporated
                  ? <div className="hint">Incorporated — {c.note}</div>
                  : (
                    <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                      <input placeholder="How was it incorporated?" style={{ flex: 1 }}
                        value={condNotes[`${a.id}-${i}`] || ''}
                        onChange={e => setCondNotes({ ...condNotes, [`${a.id}-${i}`]: e.target.value })} />
                      <button className="primary" disabled={!(condNotes[`${a.id}-${i}`] || '').trim()}
                        onClick={() => store.confirmCondition(a.id, i, condNotes[`${a.id}-${i}`].trim())}>
                        Confirm
                      </button>
                    </div>
                  )}
              </div>
            )))}
          </>
        )}

        <div className="section-title" style={{ marginTop: 10 }}>Commercial terms <AiBadge label="AI-suggested" /></div>
        {recommendTerms(opp).map(t => (
          <div key={t.term} style={{ fontSize: 12.5, padding: '2px 0' }}>
            <b>{t.term}:</b> {t.ourResponse}
          </div>
        ))}
        <button style={{ marginTop: 6 }} onClick={insertTerms}>Insert into Terms section</button>
        {inserted && <div className="okbox">Suggested terms merged into the proposal's Terms section.</div>}

        <div className="phase2-panel">
          <Phase2Badge /> <b>T&C clause library</b>
          <p className="hint">Phase 2: a maintained clause library generates full legal T&Cs by opportunity type, tender vs direct, and jurisdiction.</p>
          <button onClick={() => setTcSim(true)}>Simulate T&C generation</button>
          {tcSim && <div className="okbox">T&C set generated (simulated) — 14 clauses, 2 flagged for legal review.</div>}
        </div>

        <div className="section-title" style={{ marginTop: 10 }}>Approval routing</div>
        {comm ? (
          <p style={{ fontSize: 12.5 }}>
            GM {gate.gmPct.toFixed(1)}% · discount {gate.disc.toFixed(1)}% → <b>{gate.label}</b>
            <span className="hint"> (thresholds from Admin config)</span>
          </p>
        ) : (
          <p style={{ fontSize: 12.5 }}>
            <b>{gate.label}</b><br />
            <span className="restricted"><Icon name="lock" size={11} /> Routing computed from restricted margin thresholds</span>
          </p>
        )}

        <div className="section-title" style={{ marginTop: 10 }}>Revisions</div>
        {revisions.map((r, i) => (
          <div key={i} style={{ fontSize: 12.5, padding: '2px 0' }}>
            <b>{r.rev}</b> — {r.note} <Chip tone="grey">{r.status}</Chip> <span className="hint">{ddMmmYY(r.when)} · {r.by}</span>
          </div>
        ))}
        {!revisions.length && <p className="hint">No revisions yet.</p>}
        {revisions.length > 1 && <button onClick={() => setCompareOpen(true)}>Compare revisions</button>}

        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="primary" disabled={blocked || !!pendingRelease || released}
            title={blocked ? 'Blocked by readiness items' : pendingRelease ? 'Release approval already pending' : released ? 'Already released' : ''}
            onClick={submitForApproval}>
            <Icon name="send" size={13} /> Submit for approval
          </button>
        </div>
        {pendingRelease && <div className="warnbox">Final quote release pending with {(pendingRelease.needed || [pendingRelease.approver]).join(' + ')} — decide it on the Approvals page.</div>}
        {released && !pendingRelease && <div className="okbox">Quote released — simulate the send from the Communications tab.</div>}
      </div>

      {compareOpen && (
        <Modal title="Compare revisions" onClose={() => setCompareOpen(false)}>
          {revisions.map((r, i) => (
            <div key={i} className="check-row">
              <b>{r.rev}</b><span>{r.note}</span>
              <Chip tone="grey">{r.status}</Chip>
              <span className="hint" style={{ marginLeft: 'auto' }}>{ddMmmYY(r.when)} · {r.by}</span>
            </div>
          ))}
          <p className="hint" style={{ marginTop: 8 }}>Naive comparison — the production system diffs BoQ lines, totals and terms between revisions.</p>
          <div style={{ textAlign: 'right' }}><button onClick={() => setCompareOpen(false)}>Close</button></div>
        </Modal>
      )}
    </div>
  )
}
