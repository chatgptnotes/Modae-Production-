import React, { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ROLES, STAGES, PROB_LEVELS, SEGMENTS, PRODUCTS, BUS, SUBFOLDERS } from '../seed.js'
import { canViewCommercial, isAdminRole, fmt, ageDays, ddMmmYY } from '../utils.js'
import { readiness, isBlocked, computeProposalTotals } from '../gates.js'
import { COMMERCIAL_RX } from './Approvals.jsx'
import { Chip, ClassChip, AiBadge, Stepper, WarnBox, Modal } from '../ui.jsx'
import { Icon } from '../icons.jsx'
import { runJson, runText } from '../ai.js'
import WbSpares from '../workbench/WbSpares.jsx'
import WbService from '../workbench/WbService.jsx'
import WbProject from '../workbench/WbProject.jsx'
import PropBuilder from '../workbench/PropBuilder.jsx'
import SubmissionPanel from '../workbench/SubmissionPanel.jsx'
import PoHandover from '../workbench/PoHandover.jsx'

const TABS = [
  ['overview', 'Overview'], ['requirement', 'Requirement'], ['customer', 'Customer/KYC'],
  ['clarifications', 'Clarifications'], ['sourcing', 'Sourcing'], ['proposal', 'Proposal'],
  ['approvals', 'Approvals'], ['comms', 'Communications'], ['po', 'PO & Handover'],
  ['files', 'Files'], ['audit', 'Audit'],
]

const statusPill = s =>
  s === 'Approved' ? 'Green' : s === 'Rejected' ? 'Red' : s === 'Approved with conditions' ? 'Amber' : 'Blue'

const NEXT_ACTION = {
  Intake: 'Qualify the inquiry and register the opportunity',
  Qualification: 'Qualify the inquiry and register the opportunity',
  'Customer/KYC': 'Complete customer verification before quoting',
  Registration: 'Complete registration details and screening',
  Screening: 'Screen the requirement and confirm the route',
  Clarification: 'Chase open clarifications with the customer',
  Sourcing: 'Confirm part matches and price sources in the workbench',
  Proposal: 'Complete the proposal workbook and submit for approval',
  Approval: 'Awaiting release approval — follow up with LJS / AH',
  Submitted: 'Follow up with the customer inside the validity window',
  'Follow-up': 'Record follow-ups and push for a decision',
  'PO Validation': 'Resolve PO deviations and complete joint acceptance',
  Handover: 'Complete the handover checklist with the execution team',
}

export default function Workbench() {
  const { oppId, tab = 'overview' } = useParams()
  const store = useStore()
  const nav = useNavigate()
  const opp = store.opportunities.find(o => o.id === oppId)

  if (!opp) {
    return (
      <div className="page">
        <h2>Opportunity not found</h2>
        <p className="hint">No opportunity with ID <b>{oppId}</b> — it may have been deleted or the link is stale.</p>
        <Link to="/">Back to the tracker</Link>
      </div>
    )
  }

  const goTab = k => nav(`/opp/${opp.id}/${k}`)

  return (
    <div className="page">
      <div className="opp-head">
        <h2>{opp.id} — {opp.oppName}</h2>
        <ClassChip cls={opp.customerStatus} />
        <Chip tone="grey">{opp.route}</Chip>
        <Chip tone="grey">{opp.stage}</Chip>
        <span className="hint">Owner {opp.owner} — {ROLES[opp.owner]?.name || opp.owner}</span>
      </div>
      <Stepper current={opp.milestone} />

      <div className="wb-tabs" style={{ marginTop: 10 }}>
        {TABS.map(([k, label]) => (
          <button key={k} className={`wtab ${tab === k ? 'active' : ''}`} onClick={() => goTab(k)}>{label}</button>
        ))}
      </div>
      <div className="wb-body">
        {tab === 'overview' && <OverviewTab opp={opp} goTab={goTab} />}
        {tab === 'requirement' && <RequirementTab opp={opp} />}
        {tab === 'customer' && <CustomerKycTab opp={opp} />}
        {tab === 'clarifications' && <ClarificationsTab opp={opp} />}
        {tab === 'sourcing' && <SourcingTab opp={opp} goTab={goTab} />}
        {tab === 'proposal' && <ProposalTab opp={opp} />}
        {tab === 'approvals' && <ApprovalsTab opp={opp} />}
        {tab === 'comms' && <CommsTab opp={opp} />}
        {tab === 'po' && <PoHandover opp={opp} />}
        {tab === 'files' && <FilesTab opp={opp} />}
        {tab === 'audit' && <AuditTab opp={opp} />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function OverviewTab({ opp, goTab }) {
  const store = useStore()
  const nav = useNavigate()
  const p = store.getProposal(opp.id)
  const blockers = readiness(opp, p, store)
  const blocked = isBlocked(blockers)
  const firstBlock = blockers.find(b => b.severity === 'block')

  const nextAction = firstBlock
    ? `Resolve blocker: ${firstBlock.text}`
    : NEXT_ACTION[opp.milestone] || 'Progress the opportunity'

  const comm = canViewCommercial(store.role)
  const summary = [
    `${opp.oppName} for ${opp.sellTo} (${opp.customerStatus} customer, ${opp.category}) runs on the ${opp.route} route and sits at ${opp.milestone}.`,
    comm && opp.valueK > 0
      ? `Estimated value ₹ ${fmt(opp.valueK)}K with ${opp.prob?.toLowerCase() || 'unrated'} probability at the ${opp.stage} stage.`
      : `${comm ? 'Not yet priced — probability' : 'Probability'} ${opp.prob?.toLowerCase() || 'unrated'} at the ${opp.stage} stage.`,
    blocked ? `${blockers.filter(b => b.severity !== 'info').length} readiness item(s) currently gate the proposal.` : 'No readiness blockers — clear to progress.',
  ].join(' ')

  const dates = [
    ['Created', ddMmmYY(opp.createDate)], ['Proposal', ddMmmYY(opp.proposalDate) || '—'],
    ['Expected order', ddMmmYY(opp.orderDate) || '—'], ['Last updated', ddMmmYY(opp.lastUpdated)],
    ['Age', `${ageDays(opp.createDate) ?? '—'} days`],
  ]

  return (
    <div>
      <p style={{ fontSize: 13 }}><b>Next best action:</b> {nextAction}</p>

      <div className={`gate-strip ${blocked ? 'blocked' : 'ready'}`}>
        {!blockers.length && (
          <div className="gate-row"><Icon name="checkCircle" size={15} /><span>No blockers — the proposal is clear to go to the customer.</span></div>
        )}
        {blockers.map(bl => (
          <div key={bl.key} className={`gate-row ${bl.severity}`}>
            <Icon name={bl.severity === 'info' ? 'alert' : bl.severity === 'wait' ? 'clock' : 'lock'} size={15} />
            <span>{bl.text}</span>
          </div>
        ))}
      </div>

      <div className="ana-grid">
        <div className="ana-card c-6">
          <div className="ana-title">AI summary <AiBadge /></div>
          <p style={{ fontSize: 12.5 }}>{summary}</p>
          {opp.remarks && <p className="hint">Remarks: {opp.remarks}</p>}
        </div>
        <div className="ana-card c-6">
          <div className="ana-title">Key dates</div>
          <table className="cost-table" style={{ width: '100%' }}>
            <tbody>
              {dates.map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{v}</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="ana-card c-12">
          <div className="ana-title">Quick actions</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => nav('/notes')}><Icon name="note" size={13} /> Add note</button>
            <button onClick={() => goTab('clarifications')}><Icon name="mail" size={13} /> Draft clarification</button>
            <button onClick={() => nav(`/proposal/${opp.id}`)}><Icon name="fileSheet" size={13} /> Open proposal workbook</button>
            <button onClick={() => goTab('approvals')}><Icon name="checkCircle" size={13} /> Request approval</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function RequirementTab({ opp }) {
  const store = useStore()
  const lead = store.leads.find(l => l.oppId === opp.id)
  const upd = k => e => store.updateOpportunity(opp.id, { [k]: e.target.value })

  const editable = [
    ['stage', 'Stage', STAGES], ['prob', 'Probability', PROB_LEVELS], ['bu', 'BU', BUS],
    ['segment', 'Segment', SEGMENTS], ['product', 'Product', PRODUCTS],
  ]
  const readonly = [
    ['Opportunity ID', opp.id], ['Sell-to', opp.sellTo], ['Category', opp.category],
    ['End user', `${opp.eucName || '—'} · ${opp.eucLocation || '—'}`],
    ['Route', opp.route], ['Owner', `${opp.owner} — ${ROLES[opp.owner]?.name || ''}`],
    ['Contact', `${opp.contactPerson || '—'} ${opp.contactPhone || ''}`],
  ]

  return (
    <div className="ana-grid">
      <div className="ana-card c-6">
        <div className="ana-title">Source requirement</div>
        {lead ? (
          <>
            <p style={{ fontSize: 12.5 }}><b>{lead.subject}</b> <span className="hint">from {lead.from}</span></p>
            <div className="email-body">{lead.body}</div>
            {(lead.attachments || []).map(a => (
              <div key={a.name} className="attach-row">
                <Icon name="fileText" size={13} /> {a.name} {a.pages && <span className="hint">{a.pages} p.</span>}
              </div>
            ))}
          </>
        ) : (
          <p style={{ fontSize: 12.5 }}>{opp.remarks || 'No linked lead email — requirement captured at intake.'}</p>
        )}
      </div>
      <div className="ana-card c-6">
        <div className="ana-title">Pipeline metadata</div>
        <table className="cost-table" style={{ width: '100%' }}>
          <tbody>
            {readonly.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
            {editable.map(([k, label, opts]) => (
              <tr key={k}>
                <td>{label}</td>
                <td>
                  <select value={opp[k] || ''} onChange={upd(k)}>
                    {opts.map(o => <option key={o}>{o}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
const kycTone = s => (s === 'Verified' ? 'state-Accepted' : s === 'Uploaded' ? 'state-Review' : 'state-Blocks')

function CustomerKycTab({ opp }) {
  const store = useStore()
  const customer = store.customers.find(c => c.name === opp.sellTo)
  const canVerify = store.role === 'AH' || isAdminRole(store.role)
  const items = (customer && store.kyc[customer.name])
    || (store.config?.kycItems || []).map(n => ({ name: n, state: 'Missing', when: '' }))
  const fee = store.config?.amberFee || { amount: 25000, cur: 'INR', days: 7 }
  const setState = (item, state) => customer && store.setKycState(customer.name, item, state)

  return (
    <div className="ana-grid">
      <div className="ana-card c-6">
        <div className="ana-title">Customer</div>
        {customer ? (
          <>
            <p style={{ fontSize: 13 }}><b>{customer.name}</b> <ClassChip cls={customer.status} /></p>
            <table className="cost-table" style={{ width: '100%' }}>
              <tbody>
                <tr><td>Category</td><td>{customer.category}</td></tr>
                <tr><td>KYC status</td><td>{customer.kyc}</td></tr>
                <tr><td>Payment record</td><td>{customer.payment}</td></tr>
              </tbody>
            </table>
          </>
        ) : (
          <p className="hint">{opp.sellTo} is not in the customer master yet — treated as a new (Blue) customer.</p>
        )}
        {opp.customerStatus === 'Blue' && (
          <WarnBox>Blue class: AH clearance required before proposal release.</WarnBox>
        )}
        {opp.customerStatus === 'Red' && (
          <WarnBox>Red class: KYC not required — continuation gated by joint LJS+AH (AP-1).</WarnBox>
        )}
        {opp.customerStatus === 'Amber' && (
          <div className={opp.amberFeePaid ? 'okbox' : 'warnbox'}>
            <b>Amber pre-quote fee:</b> ₹ {fmt(fee.amount)} — {opp.amberFeePaid ? 'received' : `pending (${fee.days}-day window)`}
            {!opp.amberFeePaid && (
              <div style={{ marginTop: 6 }}>
                <button onClick={() => store.updateOpportunity(opp.id, { amberFeePaid: true })}>Simulate fee received</button>
              </div>
            )}
          </div>
        )}
        {opp.kycOverride && (
          <div className="okbox">
            KYC overridden by {opp.kycOverride.by}: {opp.kycOverride.reason}
            <span className="hint"> (logged {ddMmmYY((opp.kycOverride.ts || '').slice(0, 10))})</span>
          </div>
        )}
      </div>
      <div className="ana-card c-6">
        <div className="ana-title">KYC checklist</div>
        {items.map(k => (
          <div key={k.name} className="check-row">
            <span style={{ minWidth: 170 }}>{k.name}</span>
            <Chip tone={kycTone(k.state)}>{k.state}</Chip>
            {k.when && <span className="hint">{k.when}</span>}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              {(k.state === 'Missing' || k.state === 'Expired') && (
                <button disabled={!customer} onClick={() => setState(k.name, 'Uploaded')}>Simulate upload</button>
              )}
              {k.state === 'Uploaded' && (
                <>
                  <button className="primary" disabled={!canVerify} title={canVerify ? '' : 'Only AH verifies KYC'}
                    onClick={() => setState(k.name, 'Verified')}>Verify</button>
                  <button disabled={!canVerify} title={canVerify ? '' : 'Only AH'}
                    onClick={() => setState(k.name, 'Missing')}>Reject</button>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
const CLAR_SUGGESTIONS = {
  Spares: [
    { category: 'Technical', gap: 'Part identification incomplete', q: 'Please confirm nameplate part numbers, quantities and any legacy / superseded references for each line item.', evidence: 'RFQ line items' },
    { category: 'Commercial', gap: 'Delivery basis missing', q: 'Confirm the required delivery period and destination (ex-works or door delivery).', evidence: 'RFQ email' },
  ],
  Service: [
    { category: 'Site data', gap: 'Machine details missing', q: 'Share the machine make/model, RPM and bearing arrangement for the affected unit.', evidence: 'Service request email' },
    { category: 'Logistics', gap: 'Site access unclear', q: 'Confirm site access, permits and safety induction requirements for our engineer.', evidence: 'Service request email' },
  ],
  Project: [
    { category: 'Technical', gap: 'Signal list incomplete', q: 'Provide the complete signal list per unit, including sensor types and measurement ranges.', evidence: 'RFQ annexure' },
    { category: 'Site data', gap: 'Cable routing distances missing', q: 'Distance machine to rack, JBs per machine, and rack to DCS interface details (MODBUS TCP/IP)?', evidence: 'Purchasing spec' },
  ],
}

const clarTone = s => (s === 'Answered' ? 'state-Accepted' : s === 'Sent' ? 'state-Review' : 'grey')

function ClarificationsTab({ opp }) {
  const store = useStore()
  const rows = store.clarifications.filter(c => c.oppId === opp.id)
  const open = rows.filter(c => c.status === 'Draft' || c.status === 'Open')
  const [draftOpen, setDraftOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [sentOk, setSentOk] = useState(false)
  const [busy, setBusy] = useState('') // '' | 'suggest' | 'draft'

  // Gemini proposes gap-specific questions; the canned per-route list is the
  // fallback whenever the AI is unavailable (see src/ai.js).
  const suggest = async () => {
    setBusy('suggest')
    const proposal = store.getProposal(opp.id)
    const ai = await runJson('clarification.suggest', {
      oppName: opp.oppName, sellTo: opp.sellTo, route: opp.route, segment: opp.segment,
      eucName: opp.eucName, location: opp.location, remarks: opp.remarks,
      lines: (proposal.lines || []).map(l => ({ pn: l.pn, desc: l.desc, qty: l.qty })),
      existing: rows.map(c => c.q),
    })
    setBusy('')
    const due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    const suggestions = ai?.rows?.length ? ai.rows : (CLAR_SUGGESTIONS[opp.route] || CLAR_SUGGESTIONS.Project)
    for (const s of suggestions) {
      store.addClarification({ ...s, oppId: opp.id, owner: opp.owner, audience: 'Customer', due, status: 'Open' })
    }
  }

  // Deterministic template — also the fallback when Gemini can't be reached.
  const templateDraft = () => {
    const qs = open.map((c, i) => `${i + 5}. ${c.q}`).join('\n')
    return [
      'Dear Sir,',
      '',
      `Thank you for your inquiry for ${opp.oppName}. To proceed with our proposal, kindly provide the following details:`,
      '',
      '1. End User Name',
      '2. Plant/Project & Location',
      '3. Application/Machine details',
      '4. RPM and operating speed range',
      ...(qs ? ['', 'Specific clarifications:', qs] : []),
      '',
      'Best regards,',
      `${ROLES[opp.owner]?.name || opp.owner}`,
      'ModAE India Pvt Ltd',
    ].join('\n')
  }

  const openDraft = async () => {
    setBusy('draft')
    const text = await runText('email.clarification', {
      oppName: opp.oppName, sellTo: opp.sellTo, contactPerson: opp.contactPerson,
      route: opp.route, questions: open.map(c => c.q),
      senderName: ROLES[opp.owner]?.name || opp.owner,
    })
    setBusy('')
    setDraft(text?.trim() || templateDraft())
    setDraftOpen(true)
  }

  const approveSend = () => {
    for (const c of open) store.updateClarification(c.id, { status: 'Sent' })
    store.addCommunication(opp.id, {
      to: opp.contactPerson || opp.sellTo,
      subject: `Clarifications — ${opp.oppName}`,
      kind: 'clarification',
    })
    setDraftOpen(false)
    setSentOk(true)
  }

  return (
    <div>
      <div className="toolbar">
        <button onClick={suggest} disabled={!!busy}>
          <Icon name="sparkles" size={13} /> {busy === 'suggest' ? 'Thinking…' : 'AI: suggest questions'}
        </button>
        <button onClick={openDraft} disabled={!open.length || !!busy}
          title={open.length ? '' : 'No open questions to draft from'}>
          <Icon name="mail" size={13} /> {busy === 'draft' ? 'Drafting…' : 'AI: draft email'}
        </button>
        <span className="spacer" />
      </div>
      {sentOk && <div className="okbox">Clarification email sent (simulated) — logged in Communications.</div>}
      <div className="sheet-wrap">
        <table className="sheet">
          <thead><tr><th>ID</th><th>Category</th><th>Gap / evidence</th><th>Question</th><th>Owner</th><th>Audience</th><th>Due</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map(c => (
              <tr key={c.id}>
                <td>{c.id}</td>
                <td>{c.category}</td>
                <td>{c.gap}<div className="hint">{c.evidence}</div></td>
                <td>{c.q}{c.response && <div className="okbox">Response: {c.response}</div>}</td>
                <td>{c.owner}</td>
                <td>{c.audience}</td>
                <td>{ddMmmYY(c.due)}</td>
                <td><Chip tone={clarTone(c.status)}>{c.status}</Chip></td>
                <td>
                  {c.status !== 'Answered' && (
                    <button onClick={() => store.updateClarification(c.id, { status: 'Answered' })}>Mark resolved</button>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9} className="hint">No clarifications yet — let the AI suggest questions from detected gaps.</td></tr>}
          </tbody>
        </table>
      </div>

      {draftOpen && (
        <Modal title="AI-drafted clarification email" onClose={() => setDraftOpen(false)} wide>
          <p className="hint">To: {opp.contactPerson || opp.sellTo} · Subject: Clarifications — {opp.oppName}</p>
          <textarea rows={14} style={{ width: '100%' }} value={draft} onChange={e => setDraft(e.target.value)} />
          <WarnBox>Human review required before sending — verify every question and the addressee.</WarnBox>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={() => setDraftOpen(false)}>Cancel</button>
            <button className="primary" onClick={approveSend}><Icon name="send" size={13} /> Approve & send (simulated)</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
function SourcingTab({ opp, goTab }) {
  const store = useStore()
  const lines = store.sparesLines.filter(l => l.oppId === opp.id)
  const superseded = lines.some(l => String(l.match).toLowerCase().includes('superseded'))
  const [rfqOk, setRfqOk] = useState(false)

  const sources = lines.length
    ? [...new Map(lines.map(l => [l.priceList, l.priceState])).entries()].map(([name, state]) => ({ name, state }))
    : Object.entries(store.priceLists).map(([name, pl]) => ({ name: `${name} ${pl.version}`, state: 'Current' }))

  return (
    <div className="ana-grid">
      {superseded && (
        <div className="ana-card c-12">
          <WarnBox>
            <b>Obsolescence alert:</b> a quoted part is superseded (demo bulletin SB-112 — BKD-3300 replaced by BKD-3310).
            Resolve the supersession in the Spares workbench before quoting.
          </WarnBox>
        </div>
      )}
      <div className="ana-card c-6">
        <div className="ana-title">Vendor / price-list versions</div>
        {sources.map(s => (
          <div key={s.name} className="check-row">
            <span>{s.name}</span>
            {s.state === 'Expired'
              ? <Chip tone="state-Blocks">Expired</Chip>
              : <Chip tone="state-Accepted">Current</Chip>}
          </div>
        ))}
      </div>
      <div className="ana-card c-6">
        <div className="ana-title">Vendor actions</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setRfqOk(true)}><Icon name="mail" size={13} /> Draft vendor RFQ (simulated)</button>
          <button className="primary" onClick={() => goTab('proposal')}>
            <Icon name="arrowRight" size={13} /> Route to workbench
          </button>
        </div>
        {rfqOk && (
          <div className="okbox">
            Vendor RFQ draft prepared (simulated) — {lines.length || 'all'} line(s), delivery {opp.location || 'site'}.
            Human review required before any external send.
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function ProposalTab({ opp }) {
  const [sub, setSub] = useState('workbench')
  const openBuilder = () => setSub('builder')
  const SUBS = [['workbench', 'Workbench'], ['builder', 'Builder'], ['preview', 'Preview'], ['followup', 'Follow-up']]
  return (
    <div>
      <div className="wb-sub">
        {SUBS.map(([k, label]) => (
          <button key={k} className={sub === k ? 'active' : ''} onClick={() => setSub(k)}>{label}</button>
        ))}
      </div>
      {sub === 'workbench' && (
        opp.route === 'Spares' ? <WbSpares opp={opp} openBuilder={openBuilder} />
        : opp.route === 'Service' ? <WbService opp={opp} openBuilder={openBuilder} />
        : <WbProject opp={opp} openBuilder={openBuilder} />
      )}
      {sub === 'builder' && <PropBuilder opp={opp} />}
      {sub === 'preview' && <PreviewPane opp={opp} />}
      {sub === 'followup' && <FollowUpPane opp={opp} />}
    </div>
  )
}

function PreviewPane({ opp }) {
  const store = useStore()
  const comm = canViewCommercial(store.role)
  const p = store.getProposal(opp.id)
  const t = computeProposalTotals(p)
  return (
    <div className="form-card" style={{ maxWidth: 560 }}>
      <div className="section-title">Workbook preview</div>
      <table className="cost-table" style={{ width: '100%' }}>
        <tbody>
          <tr><td>BoQ lines</td><td className="num">{(p.bom || []).length}</td></tr>
          <tr><td>Revision</td><td className="num">{p.revision}</td></tr>
          {comm ? (
            <>
              <tr><td>Customer-facing value</td><td className="num">₹ {fmt(t.value)}</td></tr>
              <tr><td>COGS</td><td className="num">₹ {fmt(t.cogs)}</td></tr>
              <tr className="total"><td>GM</td><td className="num">{t.gmPct.toFixed(1)}%</td></tr>
            </>
          ) : (
            <tr><td colSpan={2}><span className="restricted"><Icon name="lock" size={11} /> Value / COGS / GM restricted — LJS / AH only</span></td></tr>
          )}
        </tbody>
      </table>
      <p style={{ marginTop: 10 }}>
        <Link to={`/proposal/${opp.id}`}><Icon name="fileSheet" size={13} /> Open the full proposal workbook</Link>
      </p>
    </div>
  )
}

function FollowUpPane({ opp }) {
  const store = useStore()
  const p = store.getProposal(opp.id)
  const revisions = p.revisions || []
  const [note, setNote] = useState('')
  const [fuOpen, setFuOpen] = useState(false)
  const [fuDraft, setFuDraft] = useState('')
  const [fuBusy, setFuBusy] = useState(false)
  const [fuSent, setFuSent] = useState(false)
  const [escOpen, setEscOpen] = useState(false)

  const validityDays = opp.validityDays || 30
  const age = opp.proposalDate ? ageDays(opp.proposalDate) : null
  const left = age == null ? null : validityDays - age

  const addRevision = () => {
    const today = new Date().toISOString().slice(0, 10)
    store.saveProposal(opp.id, {
      ...p,
      revision: String((+p.revision || 0) + 1).padStart(2, '0'),
      revisions: [...revisions, {
        rev: `R${revisions.length + 1}`, when: today, by: store.role,
        note: note.trim() || 'Revision created', status: 'Draft',
      }],
    })
    setNote('')
  }

  const templateFu = () => [
    'Dear Sir,',
    '',
    `Trusting our proposal for ${opp.oppName} (${opp.id}) reached you well. We would appreciate your feedback on the technical and commercial aspects, and are happy to arrange a discussion at your convenience.`,
    '',
    `The offer remains valid ${left != null && left > 0 ? `for ${left} more day(s)` : `for ${validityDays} days from submission`}.`,
    '',
    'Best regards,',
    `${ROLES[opp.owner]?.name || opp.owner}`,
  ].join('\n')

  const openFu = async () => {
    setFuBusy(true)
    const text = await runText('email.followup', {
      oppName: opp.oppName, sellTo: opp.sellTo, contactPerson: opp.contactPerson,
      quoteRef: opp.id, sentOn: opp.proposalDate, ageDays: age,
      validity: left != null && left > 0 ? `${left} of ${validityDays} days remaining` : `${validityDays} days from submission`,
      history: (store.communications?.[opp.id] || []).map(c => `${c.ts?.slice(0, 10)} ${c.kind} → ${c.to}: ${c.subject}`),
      senderName: ROLES[opp.owner]?.name || opp.owner,
    })
    setFuBusy(false)
    setFuDraft(text?.trim() || templateFu())
    setFuOpen(true)
  }

  const sendFu = () => {
    store.addCommunication(opp.id, {
      to: opp.contactPerson || opp.sellTo,
      subject: `Follow-up — ${opp.oppName}`,
      kind: 'follow-up',
    })
    setFuOpen(false)
    setFuSent(true)
  }

  return (
    <div className="ana-grid">
      <div className="ana-card c-6">
        <div className="ana-title">Revisions</div>
        {revisions.map((r, i) => (
          <div key={i} className="check-row">
            <b>{r.rev}</b><span>{r.note}</span>
            <Chip tone="grey">{r.status}</Chip>
            <span className="hint" style={{ marginLeft: 'auto' }}>{ddMmmYY(r.when)} · {r.by}</span>
          </div>
        ))}
        {!revisions.length && <p className="hint">No revisions recorded yet.</p>}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input placeholder="Revision note" value={note} style={{ flex: 1 }}
            onChange={e => setNote(e.target.value)} />
          <button onClick={addRevision}><Icon name="plus" size={13} /> Add revision</button>
        </div>
      </div>
      <div className="ana-card c-6">
        <div className="ana-title">Follow-up & reminders</div>
        {age == null
          ? <p className="hint">Not yet submitted — the validity countdown starts at the proposal date.</p>
          : left > 0
            ? <p style={{ fontSize: 12.5 }}>Validity: <b>{left} day(s) left</b> of {validityDays} (submitted {ddMmmYY(opp.proposalDate)}).</p>
            : <WarnBox>Proposal validity expired {-left} day(s) ago — revalidate or issue a revision.</WarnBox>}
        {(store.config?.reminders || []).map(r => (
          <div key={r.id} className="check-row">
            <span>{r.label}</span>
            {r.on ? <Chip tone="state-Accepted">On</Chip> : <Chip tone="grey">Off</Chip>}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button onClick={openFu} disabled={fuBusy}>
            <Icon name="sparkles" size={13} /> {fuBusy ? 'Drafting…' : 'AI: draft follow-up'}
          </button>
          <button onClick={() => setEscOpen(true)}><Icon name="sparkles" size={13} /> AI: escalation suggestion</button>
        </div>
        {fuSent && <div className="okbox">Follow-up sent (simulated) — logged in Communications.</div>}
        {escOpen && (
          <div className="okbox">
            Post-quotation intelligence: {age != null ? `submitted ${age} day(s) ago with no recorded customer response` : 'proposal not yet submitted'}.
            Suggest a courtesy call by {opp.owner} this week, and escalate to LJS if silent past day 14 of the follow-up schedule.
          </div>
        )}
      </div>

      {fuOpen && (
        <Modal title="AI-drafted follow-up" onClose={() => setFuOpen(false)} wide>
          <textarea rows={10} style={{ width: '100%' }} value={fuDraft} onChange={e => setFuDraft(e.target.value)} />
          <WarnBox>Human review required before sending.</WarnBox>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={() => setFuOpen(false)}>Cancel</button>
            <button className="primary" onClick={sendFu}><Icon name="send" size={13} /> Simulate send</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
function ApprovalsTab({ opp }) {
  const store = useStore()
  const rows = store.approvals.filter(a => a.oppId === opp.id)
  return (
    <div>
      {rows.map(a => (
        <div key={a.id} className="form-card" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <b>{a.id}</b>
            <span style={{ fontSize: 12.5 }}>{a.type}</span>
            <span className={`pill ${statusPill(a.status)}`}>{a.status}</span>
            <span className="hint" style={{ marginLeft: 'auto' }}>requested by {a.requestedBy} · {ddMmmYY((a.ts || '').slice(0, 10))}</span>
          </div>
          {COMMERCIAL_RX.test(a.detail || '') && !canViewCommercial(store.role) ? (
            <div className="restricted" style={{ fontSize: 12.5, margin: '6px 0' }}>
              <Icon name="lock" size={11} /> Commercial exception — trigger values (GM% / discount / value) visible to LJS / AH only.
            </div>
          ) : (
            <div style={{ fontSize: 12.5, margin: '6px 0' }}>{a.detail}</div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(a.needed || [a.approver].filter(Boolean)).map(r => {
              const d = (a.decisions || {})[r]
              return (
                <Chip key={r} tone={!d ? 'grey' : d.d === 'Rejected' ? 'state-Rejected' : d.d === 'Returned' ? 'state-Review' : 'state-Accepted'}>
                  {r}: {d ? d.d : 'Pending'}
                </Chip>
              )
            })}
          </div>
          {(a.conditions || []).length > 0 && (
            <div style={{ marginTop: 6 }}>
              {a.conditions.map((c, i) => (
                <div key={i} className="hint">
                  {c.incorporated ? 'Incorporated: ' : 'Condition open: '}{c.text}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {!rows.length && <p className="hint">No approvals raised for this opportunity yet — the builder routes them when needed.</p>}
      <Link to="/approvals"><Icon name="checkCircle" size={13} /> Open the Approvals page</Link>
    </div>
  )
}

// ---------------------------------------------------------------------------
function CommsTab({ opp }) {
  const store = useStore()
  const rows = store.communications[opp.id] || []
  return (
    <div className="ana-grid">
      <div className="ana-card c-6">
        <div className="ana-title">Communication log</div>
        {rows.map((c, i) => (
          <div key={i} className="check-row">
            <Icon name="mail" size={13} />
            <span><b>{c.subject}</b><div className="hint">to {c.to} · {new Date(c.ts).toLocaleString()}</div></span>
            <Chip tone="grey">{c.kind}</Chip>
          </div>
        ))}
        {!rows.length && <p className="hint">No communications logged yet.</p>}
      </div>
      <div className="ana-card c-6">
        <SubmissionPanel opp={opp} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function FilesTab({ opp }) {
  const store = useStore()
  const folders = store.files[opp.id] || Object.fromEntries(SUBFOLDERS.map(f => [f, []]))
  const sp = store.spSync[opp.id]
  const syncPill = sp?.error
    ? <span className="pill Red">SP error</span>
    : sp
      ? <span className="pill Green">SP synced</span>
      : <span className="pill Blue">Local only</span>

  const simulate = folder => store.addFile(opp.id, folder, {
    name: `Simulated_${folder.replace(/[^A-Za-z]+/g, '_')}_${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.pdf`,
    date: new Date().toISOString().slice(0, 10),
    size: '120 KB',
  })

  return (
    <div>
      <div className="toolbar">
        {syncPill}
        <span className="spacer" />
        <Link to={`/folders/${opp.id}`}><Icon name="folder" size={13} /> Open folder view</Link>
      </div>
      <div className="ana-grid">
        {Object.entries(folders).map(([folder, files]) => (
          <div key={folder} className="ana-card c-4">
            <div className="ana-title">{folder} ({files.length})</div>
            {files.map(f => (
              <div key={f.name} className="attach-row">
                <Icon name="fileText" size={13} /> {f.name}
                <span className="hint" style={{ marginLeft: 'auto' }}>{f.size} · {ddMmmYY(f.date)}</span>
              </div>
            ))}
            {!files.length && <p className="hint">Empty.</p>}
            <button style={{ marginTop: 6 }} onClick={() => simulate(folder)}>
              <Icon name="upload" size={12} /> Simulate upload
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function AuditTab({ opp }) {
  const store = useStore()
  const rows = store.audit.filter(e => (e.objectId || '').includes(opp.id))
  return (
    <div className="sheet-wrap">
      <table className="sheet">
        <thead><tr><th>When</th><th>Role</th><th>Action</th><th>Object</th><th>Detail</th></tr></thead>
        <tbody>
          {rows.map((e, i) => (
            <tr key={i}>
              <td style={{ whiteSpace: 'nowrap' }}>{new Date(e.ts).toLocaleString()}</td>
              <td>{e.role}</td>
              <td><b>{e.action}</b></td>
              <td>{e.objectId}</td>
              <td>{e.detail}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5} className="hint">No audit events for this opportunity yet.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
