import React, { useState } from 'react'
import { useStore, snapshotProposal } from '../store.jsx'
import { canPriceProposal, fmt, ddMmmYY, displayRole, displayRoles } from '../utils.js'
import { readiness, isBlocked, commercialGate, releaseState, approvalSet, serviceApprovalSet } from '../gates.js'
import { REVISION_TYPES } from '../seed.js'
import { Chip, AiBadge, Phase2Badge, ErrBox, WarnBox, Modal } from '../ui.jsx'
import { Icon } from '../icons.jsx'
// Shared with the printed document, so the checklist and the real document
// can never list different sections.
import { PROP_SECTIONS, recommendTerms } from '../proposalDoc.js'

// Proposal builder: section checklist, customer-facing excerpt, and the
// readiness / approval column that gates 'Submit for approval'.
export default function PropBuilder({ opp, onRevision }) {
  const store = useStore()
  const comm = canPriceProposal(store.role)
  const p = store.getProposal(opp.id)
  const blockers = readiness(opp, p, store)
  const blocked = isBlocked(blockers)
  const gate = commercialGate(opp, p, store.config)

  const [manualDone, setManualDone] = useState({})
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [reviseOpen, setReviseOpen] = useState(false)
  const [reviseReason, setReviseReason] = useState('')
  // Diagram 02 §7 — "Identify Type of Revision". The type is what routes the
  // rework back to B-02..B-05, so it is picked here rather than inferred.
  const [reviseType, setReviseType] = useState(REVISION_TYPES[0].id)
  const [condNotes, setCondNotes] = useState({})
  const [compareOpen, setCompareOpen] = useState(false)
  const [inserted, setInserted] = useState(false)
  const [tcSim, setTcSim] = useState(false)

  const revisions = p.revisions || []
  // Scoped to the current revision: a revised quote is no longer released,
  // so 'Submit for approval' re-opens rather than staying permanently locked.
  const serviceReview = opp.route === 'Service' ? serviceApprovalSet(store.approvals, opp.id)[0] : null
  const { pending: pendingRelease, release } = opp.route === 'Service'
    ? { pending: serviceReview?.pending, release: serviceReview?.approved }
    : releaseState(p, store.approvals, opp.id)
  const released = !!release
  // Diagram 02 §5 — technical, commercial and margin are drawn as one
  // checkpoint feeding "All Approvals Completed → Quote Ready for Dispatch",
  // so they are shown together rather than discovered one blocker at a time.
  // Each covers the current revision only.
  const gates5 = opp.route === 'Service'
    ? serviceApprovalSet(store.approvals, opp.id)
    : approvalSet(p, store.approvals, opp.id)
  const allApproved = gates5.every(g => !!g.approved)

  // Content sections come from the workbook; the rest are auto-drafted by
  // proposalDoc and the checkbox records that a human has read them.
  const CONTENT = { 'Line items / BOQ': () => (p.bom || []).length > 0, Terms: () => (p.terms || []).length > 0 }
  const sectionDone = s => (CONTENT[s] ? CONTENT[s]() : !!manualDone[s])
  const derived = s => !!CONTENT[s]

  // A blocker may name more than one acceptable approver (5A is "LJS or AN"),
  // in which case it carries its own `needed` list and the `anyOf` flag that
  // lets a single decision clear it.
  const requestForBlocker = bl => store.requestApproval({
    oppId: opp.id, type: bl.approvalType, approver: bl.approver,
    rev: bl.rev || String(p.revision ?? ''),
    needed: bl.needed || [bl.approver], anyOf: !!bl.anyOf, detail: bl.text,
  })

  const applyOverride = () => {
    if (!overrideReason.trim()) return
    store.kycOverride(opp.id, overrideReason.trim())
    setOverrideOpen(false)
    setOverrideReason('')
  }

  const applyRevision = () => {
    if (!reviseReason.trim()) return
    store.reviseProposal(opp.id, reviseReason.trim(), reviseType)
    onRevision?.()
    setReviseOpen(false)
    setReviseReason('')
    setReviseType(REVISION_TYPES[0].id)
  }

  const condApprovals = store.approvals.filter(a =>
    a.oppId === opp.id && a.status === 'Approved with conditions')

  const insertTerms = () => {
    const recs = recommendTerms(opp, store.config)
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
    if (opp.route === 'Service') return
    const today = new Date().toISOString().slice(0, 10)
    // The approval is stamped with the revision it approves, so a later
    // revision cannot inherit it.
    const rev = String((+p.revision || 0) + 1).padStart(2, '0')
    store.requestApproval({
      oppId: opp.id, type: 'Final quote release', rev,
      detail: `GM ${gate.gmPct.toFixed(1)}% — ${gate.label}`,
      listValue: gate.listValue,
      requestedValue: gate.value,
      discountPct: gate.disc,
      markupPct: p.markupPct || 0,
      // Final quote release is a joint AH + LJS decision. The commercial gate
      // still determines the routing context, but neither approver can release
      // the quote alone.
      approver: 'LJS', needed: ['LJS', 'AH'], anyOf: false,
    })
    store.updateOpportunity(opp.id, { milestone: 'Approval' })
    store.saveProposal(opp.id, {
      ...p,
      revision: rev,
      pricingHistory: [...(p.pricingHistory || []), {
        revision: rev,
        status: 'Submitted for approval',
        when: new Date().toISOString(),
        listValue: gate.listValue,
        requestedValue: gate.value,
        discountPct: gate.disc,
        markupPct: p.markupPct || 0,
        by: store.role,
      }],
      // A submission is not a revision — it gets its own S-series so the
      // customer-facing V-numbers stay the diagram's V1, V2, V3.
      revisions: [...revisions, {
        rev: `S${revisions.filter(r => r.status === 'Submitted').length + 1}`,
        when: today, by: store.role,
        note: 'Submitted for approval', status: 'Submitted',
        snapshot: snapshotProposal(p),
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
          {!comm && <p className="hint"><Icon name="lock" size={11} /> Commercial totals restricted — sales owners, approvers and admin only.</p>}
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
                <button onClick={() => requestForBlocker(bl)}>Request {bl.anyOf ? 'AH or LJS' : bl.approver} approval</button>
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
                <b>{displayRole(a.approver)}:</b> {c.text}
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
        {recommendTerms(opp, store.config).map(t => (
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

        <div className="section-title" style={{ marginTop: 10 }}>Section 5 approvals</div>
        {gates5.map(g => {
          const state = g.approved ? g.approved.status : g.pending ? 'Pending' : 'Not raised'
          const tone = g.approved ? 'state-Accepted' : g.pending ? 'state-Review' : 'grey'
          return (
            <div key={g.type} style={{ fontSize: 12.5, padding: '2px 0', display: 'flex', gap: 6, alignItems: 'center' }}>
              <Icon name={g.approved ? 'checkCircle' : 'clock'} size={13} />
              <span style={{ flex: 1 }}>{g.type}</span>
              <Chip tone={tone}>{state}</Chip>
            </div>
          )
        })}
        {allApproved ? (
          <div className="okbox">All approvals completed — quote ready for dispatch (revision {p.revision || '00'}).</div>
        ) : (
          <p className="hint">All three must clear before the quote can be dispatched, and again after every
            revision. Raise a missing one from the lifecycle stepper when the move to Submitted is blocked.</p>
        )}

        <div className="section-title" style={{ marginTop: 10 }}>Revisions</div>
        {revisions.map((r, i) => (
          <div key={i} style={{ fontSize: 12.5, padding: '2px 0' }}>
            <b>{r.rev}</b> — {r.note} <Chip tone="grey">{r.status}</Chip>
            {r.type && <Chip tone="state-Review">{r.type} revision</Chip>}
            {' '}<span className="hint">{ddMmmYY(r.when)} · {r.by}</span>
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
        {pendingRelease && <div className="warnbox">Final quote release pending with {displayRoles(pendingRelease.needed || [pendingRelease.approver])} — decide it on the Approvals page.</div>}
        {released && !pendingRelease && (
          <div className="okbox">
            Quote released — simulate the send from the Communications tab.
            <div style={{ marginTop: 6 }}>
              {!reviseOpen && (
                <button onClick={() => setReviseOpen(true)}>Revise quote</button>
              )}
              {reviseOpen && (
                <>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <select value={reviseType} onChange={e => setReviseType(e.target.value)}>
                      {REVISION_TYPES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                    <input placeholder="Reason for revision (logged)" value={reviseReason} style={{ flex: 1, minWidth: 160 }}
                      onChange={e => setReviseReason(e.target.value)} />
                    <button className="primary" disabled={!reviseReason.trim()} onClick={applyRevision}>Open revision</button>
                  </div>
                  <div className="hint" style={{ marginTop: 4 }}>
                    The revised quote must pass the approval checks again before it can be sent.
                  </div>
                </>
              )}
            </div>
            <span className="hint">A revision re-opens the approval gate — the revised quote must be approved again before it can be sent.</span>
          </div>
        )}
      </div>

      {compareOpen && (
        <Modal title="Compare revisions" onClose={() => setCompareOpen(false)}>
          {revisions.map((r, i) => {
            const snap = r.snapshot
            const dev = snap?.terms?.filter(t => t.status === 'Deviation').length || 0
            return (
              <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-soft)' }}>
                <div className="check-row">
                  <b>{r.rev}</b><span>{r.note}</span>
                  <Chip tone="grey">{r.status}</Chip>
                  {r.type && <Chip tone="state-Review">{r.type} revision</Chip>}
                  <span className="hint" style={{ marginLeft: 'auto' }}>{ddMmmYY(r.when)} · {r.by}</span>
                </div>
                {snap ? (
                  <div className="hint" style={{ marginTop: 4 }}>
                    {(snap.bom || []).length} BoQ line{(snap.bom || []).length === 1 ? '' : 's'}
                    {' · '}{(snap.terms || []).length} term{(snap.terms || []).length === 1 ? '' : 's'}{dev ? ` (${dev} deviation${dev === 1 ? '' : 's'})` : ''}
                    {' · '}Discount {snap.discountPct || 0}% · Markup {snap.markupPct || 0}%
                    {snap.approvedPricing?.requestedValue != null && ` · Requested ₹ ${fmt(snap.approvedPricing.requestedValue)}`}
                    {snap.subject && ` · ${snap.subject}`}
                  </div>
                ) : (
                  <div className="hint" style={{ marginTop: 4 }}>No content captured for this revision.</div>
                )}
              </div>
            )
          })}
          <div style={{ textAlign: 'right', marginTop: 8 }}><button onClick={() => setCompareOpen(false)}>Close</button></div>
        </Modal>
      )}
    </div>
  )
}
