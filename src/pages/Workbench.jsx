import React, { useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ROLES, OWNERS, STAGES, PROB_LEVELS, SEGMENTS, PRODUCTS, BUS, SUBFOLDERS, MILESTONES } from '../seed.js'
import { canPriceProposal, isAdminRole, fmt, ageDays, ddMmmYY } from '../utils.js'
import { readiness, isBlocked, computeProposalTotals, nextActionWith, transitionBlockers } from '../gates.js'
import { COMMERCIAL_RX } from './Approvals.jsx'
import { Chip, ClassChip, AiBadge, Stepper, WarnBox, Modal } from '../ui.jsx'
import { Icon } from '../icons.jsx'
import { productBrandProfiles } from '../branding/modae.js'
import { MODAE_COMPANY } from '../proposalDoc.js'
import { runJson, runText } from '../ai.js'
import WbSpares from '../workbench/WbSpares.jsx'
import WbService from '../workbench/WbService.jsx'
import WbProject from '../workbench/WbProject.jsx'
import PropBuilder from '../workbench/PropBuilder.jsx'
import SubmissionPanel from '../workbench/SubmissionPanel.jsx'
import PoHandover from '../workbench/PoHandover.jsx'
import OpportunityDetailsEditor from '../OpportunityDetailsEditor.jsx'
import AttachmentViewer from '../AttachmentViewer.jsx'
import { extractDocText } from '../docText.js'
import { putFiles } from '../leadBlobs.js'
import { uploadOppFile, fmtSize } from '../filestore.js'

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
  const [transition, setTransition] = useState(null)
  const detailsRef = useRef(null)
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
  const proposal = store.getProposal(opp.id)
  const blockers = readiness(opp, proposal, store)
  const nextAction = nextActionWith(opp, proposal, store)
  const canSeeValue = canPriceProposal(store.role)
  const due = opp.orderDate || opp.proposalDate || opp.lastUpdated
  const milestoneIndex = MILESTONES.indexOf(opp.milestone)
  const moveMilestone = milestone => {
    if (milestone === opp.milestone) return
    if (MILESTONES.indexOf(milestone) < milestoneIndex) {
      setTransition({ kind: 'backward', target: milestone, reason: '' })
      return
    }
    const blockersForMove = transitionBlockers(opp, milestone, proposal, store)
    if (blockersForMove.length) {
      setTransition({ kind: 'blocked', target: milestone, blockers: blockersForMove })
      return
    }
    store.setMilestone(opp.id, milestone)
  }
  const moveRelative = delta => {
    const next = MILESTONES[milestoneIndex + delta]
    if (next) moveMilestone(next)
  }
  const exceptionApprovalFor = blocker => (store.approvals || []).find(a =>
    a.type === 'Milestone exception' && a.oppId === opp.id
    && a.targetMilestone === transition?.target && a.blockerKey === blocker.key)
  const canRequestException = blocker => ['kyc', 'amber-fee', 'red-clearance', 'dev'].includes(blocker.key) || !!blocker.approvalType
  const requestException = blocker => {
    const needed = blocker.needed || [blocker.approver || 'AH']
    store.requestApproval({
      oppId: opp.id,
      type: 'Milestone exception',
      targetMilestone: transition.target,
      blockerKey: blocker.key,
      detail: `${blocker.text} — exception requested to move to ${transition.target}.`,
      approver: needed[0],
      needed,
    })
  }
  const openTransitionTab = tabName => {
    setTransition(null)
    goTab(tabName)
  }
  const openMissingContact = field => {
    setTransition(null)
    if (tab !== 'overview') nav(`/opp/${opp.id}/overview`)
    window.setTimeout(() => detailsRef.current?.focusField(field), tab === 'overview' ? 0 : 120)
  }
  const clarificationRows = (store.clarifications || []).filter(c => c.oppId === opp.id && ['Draft', 'Open', 'Sent'].includes(c.status))
  const deviationRows = (proposal?.terms || []).filter(t => t.status === 'Deviation')
  const blockerOwner = blocker => blocker.needed?.join(' + ') || blocker.approver || (blocker.key === 'clarifications' ? opp.owner : 'Opportunity owner')
  const blockerExplanation = blocker => {
    if (blocker.key === 'clarifications') return 'Customer answers are still missing. The proposal must not be built on unconfirmed technical, delivery, or site assumptions.'
    if (blocker.key === 'dev') return 'The customer has requested terms outside the standard commercial position. AH must review and approve the exception before proposal work can continue.'
    if (blocker.key === 'amber-fee') return 'This Amber customer requires the pre-quote processing fee to be received before the opportunity can progress.'
    if (blocker.key === 'kyc') return 'This Blue customer is new or unverified. AH must complete the required KYC review before registration or quoting.'
    if (blocker.key === 'red-clearance') return 'This Red customer requires joint commercial clearance because of the risk or payment history.'
    return 'Complete the requirement shown below before continuing.'
  }

  return (
    <div className="page">
      <div className="opp-summary">
        <div className="opp-summary-title">
          <span className="opp-id">{opp.id}</span>
          <h2>{opp.oppName}</h2>
          <ClassChip cls={opp.customerStatus} />
          <Chip tone="grey">{opp.route}</Chip>
          <Chip tone={blockers.length ? 'state-Review' : 'state-Accepted'}>{blockers.length ? 'At risk' : 'On track'}</Chip>
        </div>
        <div className="opp-summary-grid">
          <div><span>Owner</span><b>{opp.owner} — {ROLES[opp.owner]?.name || opp.owner}</b></div>
          <div><span>Milestone</span><b>{opp.milestone || opp.stage}</b></div>
          <div><span>Customer value</span><b>{canSeeValue ? `₹${fmt(opp.valueK || 0)},000` : 'Restricted'}</b></div>
          <div className="opp-summary-action"><span>Next action</span><b>{nextAction.text || NEXT_ACTION[opp.milestone] || 'Progress the opportunity'}</b></div>
          <div><span>Due</span><b>{ddMmmYY(due) || '—'}</b></div>
        </div>
      </div>
      <div className="wb-tabs" style={{ marginTop: 10 }}>
        {TABS.map(([k, label]) => (
          <button key={k} className={`wtab ${tab === k ? 'active' : ''}`} onClick={() => goTab(k)}>{label}</button>
        ))}
      </div>
      <div className="opp-lifecycle">
        <div className="lifecycle-heading">
          <div><div className="workbench-section-title">Lifecycle</div><span className="hint">Select any stop to move the opportunity, including backward corrections.</span></div>
          <div className="lifecycle-controls">
            <button disabled={milestoneIndex <= 0} onClick={() => moveRelative(-1)}>← Previous</button>
            <b>{opp.milestone}</b>
            <button disabled={milestoneIndex < 0 || milestoneIndex >= MILESTONES.length - 1} onClick={() => moveRelative(1)}>Next →</button>
          </div>
        </div>
        <Stepper current={opp.milestone} onStep={moveMilestone} />
      </div>
      {transition && (
        <Modal title={transition.kind === 'blocked' ? `Cannot move from ${opp.milestone} to ${transition.target}` : `Move back to ${transition.target}`} onClose={() => setTransition(null)} wide>
          {transition.kind === 'blocked' ? (
            <>
              <p className="transition-intro">Complete the following requirements or obtain an approved exception before continuing to <b>{transition.target}</b>.</p>
              <div className="transition-blockers">{transition.blockers.map((item, i) => {
                const exception = exceptionApprovalFor(item)
                const requestable = canRequestException(item)
                return <div key={`${item.key}-${i}`} className={`workbench-blocker ${item.severity}`}>
                  <div className="transition-blocker-head"><b>{item.text}</b><span className="transition-owner">Owner: <strong>{blockerOwner(item)}</strong></span></div>
                  <span className="transition-explanation">{blockerExplanation(item)}</span>
                  {item.key === 'clarifications' && clarificationRows.length > 0 && <div className="transition-detail-list">{clarificationRows.map(row => <div key={row.id}><b>{row.id}</b> · {row.category} · {row.q} <em>{row.status}</em></div>)}</div>}
                  {item.key === 'dev' && deviationRows.length > 0 && <div className="transition-detail-list">{deviationRows.map((row, index) => <div key={`${row.term}-${index}`}><b>{row.term}</b> · Customer ask: {row.customerAsk || 'Not recorded'} · Response: {row.ourResponse || 'Pending review'}</div>)}</div>}
                  {item.severity === 'wait' && <span>Waiting for the responsible approver.</span>}
                  {item.key === 'clarifications' && <button className="exception-action" onClick={() => openTransitionTab('clarifications')}>Open clarifications</button>}
                  {item.key === 'required-contactPerson' && <button className="exception-action" onClick={() => openMissingContact('contactPerson')}>Edit contact person</button>}
                  {item.key === 'required-contactPhone' && <button className="exception-action" onClick={() => openMissingContact('contactPhone')}>Edit contact phone</button>}
                  {requestable && exception?.status === 'Pending' && <span>Exception approval <b>{exception.id}</b> is pending — <button className="inline-action" onClick={() => openTransitionTab('approvals')}>Open approval</button></span>}
                  {requestable && !exception && <button className="exception-action" onClick={() => requestException(item)}>Request {blockerOwner(item)} approval to continue</button>}
                  {requestable && exception?.status === 'Rejected' && <span>Exception <b>{exception.id}</b> was rejected; resolve the requirement or request a new review.</span>}
                </div>
              })}</div>
              <div className="forms-actions"><button className="primary" onClick={() => setTransition(null)}>Close</button><button onClick={() => openTransitionTab('approvals')}>Open approvals</button></div>
            </>
          ) : (
            <>
              <p className="hint">Backward movement is allowed for corrections, but a reason is required and will be recorded in the audit trail.</p>
              <label>Reason<textarea rows={3} value={transition.reason} onChange={e => setTransition({ ...transition, reason: e.target.value })} placeholder="Explain what changed or why this stage needs correction." /></label>
              <div className="forms-actions"><button className="primary" disabled={!transition.reason?.trim()} onClick={() => { store.setMilestone(opp.id, transition.target, transition.reason.trim()); setTransition(null) }}>Move backward</button><button onClick={() => setTransition(null)}>Cancel</button></div>
            </>
          )}
        </Modal>
      )}
      <div className="wb-body">
        {tab === 'overview' && <OverviewTab opp={opp} goTab={goTab} detailsRef={detailsRef} />}
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
function OverviewTab({ opp, goTab, detailsRef }) {
  const store = useStore()
  const nav = useNavigate()
  const [action, setAction] = useState(null)
  const [actionText, setActionText] = useState('')
  const [owner, setOwner] = useState(opp.owner)
  const p = store.getProposal(opp.id)
  const blockers = readiness(opp, p, store)
  const blocked = isBlocked(blockers)
  const firstBlock = blockers.find(b => b.severity === 'block')
  const approvals = (store.approvals || []).filter(a => a.oppId === opp.id)
  const pendingApprovals = approvals.filter(a => a.status === 'Pending')
  const customer = store.customers.find(c => c.name === opp.sellTo)
  const kycItems = customer ? ((store.kyc || {})[customer.name] || []) : []
  const verifiedKyc = kycItems.filter(k => k.state === 'Verified').length
  const audit = (store.audit || []).filter(e => (e.objectId || '').includes(opp.id)).slice(0, 3)
  const brandedProducts = productBrandProfiles(opp.product)

  const nextAction = firstBlock
    ? `Resolve blocker: ${firstBlock.text}`
    : NEXT_ACTION[opp.milestone] || 'Progress the opportunity'

  const comm = canPriceProposal(store.role)
  const summary = [
    `${opp.oppName} for ${opp.sellTo} (${opp.customerStatus} customer, ${opp.category}) runs on the ${opp.route} route and sits at ${opp.milestone}.`,
    comm && opp.valueK > 0
      ? `Estimated value (₹) ${fmt(opp.valueK)}K with ${opp.prob?.toLowerCase() || 'unrated'} probability at the ${opp.stage} stage.`
      : `${comm ? 'Not yet priced — probability' : 'Probability'} ${opp.prob?.toLowerCase() || 'unrated'} at the ${opp.stage} stage.`,
    blocked ? `${blockers.filter(b => b.severity !== 'info').length} readiness item(s) currently gate the proposal.` : 'No readiness blockers — clear to progress.',
  ].join(' ')

  const dates = [
    ['Created', ddMmmYY(opp.createDate)], ['Proposal', ddMmmYY(opp.proposalDate) || '—'],
    ['Expected order', ddMmmYY(opp.orderDate) || '—'], ['Last updated', ddMmmYY(opp.lastUpdated)],
    ['Age', `${ageDays(opp.createDate) ?? '—'} days`],
  ]

  const saveAction = () => {
    if (action === 'call') {
      store.addCommunication(opp.id, {
        to: opp.contactPerson || opp.sellTo,
        subject: `Call recorded — ${opp.oppName}`,
        kind: 'call', note: actionText.trim(),
      })
    } else if (action === 'owner' && owner) {
      store.updateOpportunity(opp.id, { owner })
    }
    setAction(null)
    setActionText('')
  }

  const openAction = name => { setAction(name); setActionText(''); setOwner(opp.owner) }

  return (
    <div className="workbench-overview">
      <OpportunityDetailsEditor ref={detailsRef} opp={opp} store={store} className="workbench-details-editor" />
      <div className="workbench-overview-grid">
        <section className="workbench-panel next-action-panel">
          <div className="workbench-section-title">Next best action</div>
          <strong>{nextAction.text || NEXT_ACTION[opp.milestone] || 'Progress the opportunity'}</strong>
          <p className="hint">Due {ddMmmYY(opp.orderDate || opp.lastUpdated) || '—'}</p>
          <div className="workbench-actions">
            <button onClick={() => goTab('clarifications')}><Icon name="mail" size={13} /> Create clarification</button>
            <button className="primary" onClick={() => nav(`/proposal/${opp.id}`)}><Icon name="fileSheet" size={13} /> Open workbench</button>
            <button onClick={() => goTab('approvals')}><Icon name="checkCircle" size={13} /> Request approval</button>
            <button onClick={() => openAction('call')}><Icon name="phone" size={13} /> Record call</button>
            <button onClick={() => openAction('owner')}><Icon name="users" size={13} /> Change owner</button>
          </div>
        </section>

        <section className="workbench-panel blocker-panel">
          <div className="workbench-section-title">Risks &amp; blockers</div>
          {blockers.length ? blockers.map(bl => (
            <div key={bl.key} className={`workbench-blocker ${bl.severity}`}>
              <b>{bl.text}</b>
              <span>{bl.approvalType ? `Fix: request ${bl.approver} approval` : 'Fix: resolve in the relevant workbench tab'}</span>
            </div>
          )) : <div className="workbench-empty"><Icon name="checkCircle" size={15} /> No active blockers.</div>}
        </section>

        <section className="workbench-panel">
          <div className="workbench-section-title">AI summary <AiBadge /></div>
          <p className="workbench-summary">{summary}</p>
          <div className="workbench-readiness"><span>Proposal readiness</span><Chip tone={blocked ? 'state-Blocks' : 'state-Accepted'}>{blocked ? `${blockers.length} blocker(s)` : 'Ready to progress'}</Chip></div>
        </section>

        {brandedProducts.length > 0 && (
          <section className="workbench-panel workbench-brand-panel">
            <div className="workbench-section-title">ModAE solution context</div>
            <div className="workbench-brand-products">
              {brandedProducts.map(product => (
                <article className="workbench-brand-product" key={product.slug}>
                  <img src={product.imageUrl} alt="" />
                  <div>
                    <b>{product.title}</b>
                    <p>{product.summary}</p>
                    <span className="hint">{product.sections.applications}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="workbench-panel">
          <div className="workbench-section-title">KYC snapshot</div>
          <div className="workbench-kpi"><b>{kycItems.length ? `${verifiedKyc}/${kycItems.length}` : customer ? '0/0' : '—'}</b><span>{customer ? 'verified' : 'Customer not in master'}</span></div>
          <Chip tone={customer && kycItems.length > 0 && verifiedKyc === kycItems.length ? 'state-Accepted' : 'state-Review'}>{customer && kycItems.length > 0 && verifiedKyc === kycItems.length ? 'Complete' : 'Review required'}</Chip>
          <button onClick={() => goTab('customer')}>Open Customer/KYC</button>
        </section>

        <section className="workbench-panel">
          <div className="workbench-section-title">Pending approvals</div>
          {pendingApprovals.length ? pendingApprovals.slice(0, 3).map(a => <div className="workbench-list-row" key={a.id}><b>{a.type}</b><Chip tone="state-Review">{a.status}</Chip></div>) : <p className="hint">None pending.</p>}
          <button onClick={() => goTab('approvals')}>Open approvals</button>
        </section>

        <section className="workbench-panel">
          <div className="workbench-section-title">Key dates</div>
          <table className="cost-table" style={{ width: '100%' }}><tbody>{dates.map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{v}</td></tr>)}</tbody></table>
        </section>

        <section className="workbench-panel workbench-timeline-panel">
          <div className="workbench-section-title">Timeline &amp; audit summary</div>
          {audit.length ? audit.map((e, i) => <div className="workbench-timeline-row" key={`${e.ts}-${i}`}><span className="timeline-dot" /><span><b>{ddMmmYY((e.ts || '').slice(0, 10))} {e.role}</b><br />{e.action}</span></div>) : <p className="hint">No audit events for this opportunity yet.</p>}
          <button onClick={() => goTab('audit')}>Full audit</button>
        </section>
      </div>

      {action && (
        <Modal title={action === 'call' ? 'Record customer call' : 'Change opportunity owner'} onClose={() => setAction(null)}>
          {action === 'owner' ? (
            <label>New owner<select value={owner} onChange={e => setOwner(e.target.value)}>{OWNERS.map(r => <option key={r} value={r}>{r} — {ROLES[r]?.name || r}</option>)}</select></label>
          ) : (
            <label>Details<textarea rows={4} value={actionText} onChange={e => setActionText(e.target.value)} placeholder="Summarise the call and next commitment." /></label>
          )}
          <div className="forms-actions"><button className="primary" disabled={action !== 'owner' && !actionText.trim()} onClick={saveAction}>Save</button><button onClick={() => setAction(null)}>Cancel</button></div>
        </Modal>
      )}
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

// KYC blobs share the lead blob store; the customer name namespaces them so a
// document survives a reload and can be previewed with the same viewer.
const kycBlobKey = customerName => 'kyc:' + customerName
const KYC_TEXT_CAP = 8000

function CustomerKycTab({ opp }) {
  const store = useStore()
  const customer = store.customers.find(c => c.name === opp.sellTo)
  const canVerify = store.role === 'AH' || isAdminRole(store.role)
  const items = (customer && store.kyc[customer.name])
    || (store.config?.kycItems || []).map(n => ({ name: n, state: 'Missing', when: '' }))
  const fee = store.config?.amberFee || { amount: 25000, cur: 'INR', days: 7 }
  const setState = (item, state, file) => customer && store.setKycState(customer.name, item, state, file)

  const fileInput = useRef(null)
  const pending = useRef('')
  const [busy, setBusy] = useState('')
  const [viewing, setViewing] = useState(null)

  const pick = itemName => { pending.current = itemName; fileInput.current?.click() }

  // A real upload: bytes to IndexedDB (so the preview works after a reload) and
  // a copy pushed to the opportunity folder. A failed cloud push keeps the local
  // copy rather than losing the document.
  async function onPick(e) {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    const itemName = pending.current
    if (!file || !itemName || !customer) return
    setBusy(itemName)
    try {
      const doc = await extractDocText(file)
      await putFiles(kycBlobKey(customer.name), [file])
      const meta = { name: file.name, size: fmtSize(file.size), type: file.type || '', cloud: true }
      if (doc.text) meta.text = doc.text.slice(0, KYC_TEXT_CAP)
      if (doc.pages) meta.pages = doc.pages
      if (doc.err) meta.err = doc.err
      try {
        const rec = await uploadOppFile(opp, 'KYC', file)
        store.addFile(opp.id, 'KYC', rec)
        if (rec.webUrl || rec.url) meta.webUrl = rec.webUrl || rec.url
      } catch (err) {
        meta.cloud = false
        meta.cloudErr = (err && err.message) || String(err)
      }
      setState(itemName, 'Uploaded', meta)
    } finally {
      setBusy('')
    }
  }

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
          opp.leadVerification?.status === 'Verified'
            ? <div className="okbox">KYC verified at Lead stage — no second verification is required in the Opportunity.</div>
            : <WarnBox>Blue class: AH clearance required before proposal release.</WarnBox>
        )}
        {opp.customerStatus === 'Red' && (
          <WarnBox>Red class: KYC not required — continuation gated by joint LJS+AH (AP-1).</WarnBox>
        )}
        {opp.customerStatus === 'Amber' && (
          opp.leadVerification?.status === 'Confirmed'
            ? <div className="okbox"><b>Amber processing fee:</b> confirmed at Lead stage — no second confirmation is required in the Opportunity.</div>
            : <div className={opp.amberFeePaid ? 'okbox' : 'warnbox'}>
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
        <div className="ana-title">{opp.leadVerification ? 'Lead-stage verification' : 'KYC checklist'}</div>
        {opp.leadVerification ? (
          <>
            <div className="okbox">
              {opp.leadVerification.type === 'KYC' ? 'KYC verified at Lead stage.' : opp.leadVerification.type === 'Payment' ? 'Payment confirmed at Lead stage.' : 'Verification was not required.'}
              {' '}This Opportunity uses the Lead-stage confirmation.
            </div>
            {opp.leadVerification.type === 'KYC' && Object.entries(opp.leadVerification.items || {}).map(([name, item]) => (
              <div className="check-row" key={name}>
                <Icon name="check" size={14} /> <span style={{ flex: 1 }}>{name}</span>
                <Chip tone="state-Accepted">{item.mode === 'simulated' ? 'Verified (simulated)' : 'Verified (uploaded)'}</Chip>
              </div>
            ))}
          </>
        ) : <>
        <input ref={fileInput} type="file" style={{ display: 'none' }} onChange={onPick} />
        {items.map(k => (
          <React.Fragment key={k.name}>
            <div className="check-row">
              <span style={{ minWidth: 170 }}>{k.name}</span>
              <Chip tone={kycTone(k.state)}>{k.state}</Chip>
              {k.when && <span className="hint">{k.when}</span>}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                {/* Both paths stay on every row, Verified included — otherwise a
                    fully verified checklist offers no way to replace a document
                    or re-run the demo. */}
                <button disabled={!customer || !!busy} onClick={() => pick(k.name)}
                  title="Attach the actual document">
                  {busy === k.name ? 'Uploading…' : k.file ? 'Replace…' : 'Upload…'}
                </button>
                <button disabled={!customer || !!busy} onClick={() => setState(k.name, 'Uploaded')}
                  title="Demo only — flips the state without a document">Simulate upload</button>
                {k.state === 'Uploaded' && (
                  <>
                    <button className="primary" disabled={!canVerify} title={canVerify ? '' : 'Only AH verifies KYC'}
                      onClick={() => setState(k.name, 'Verified')}>Verify</button>
                    <button disabled={!canVerify} title={canVerify ? '' : 'Only AH'}
                      onClick={() => setState(k.name, 'Missing', null)}>Reject</button>
                  </>
                )}
              </span>
            </div>
            {k.file && (
              <div className="kyc-file">
                <button type="button" className="kyc-file-open" onClick={() => setViewing(k.file)}
                  title={`View ${k.file.name}`}>
                  <Icon name="fileText" size={12} />
                  <span className="attach-name">{k.file.name}</span>
                  <span className="attach-meta">{k.file.pages ? k.file.pages + ' p.' : k.file.size || ''}</span>
                  <Icon name="eye" size={12} />
                </button>
                {k.file.cloud === false && (
                  <span className="hint"><Icon name="alert" size={11} /> cloud copy failed — kept locally</span>
                )}
              </div>
            )}
          </React.Fragment>
        ))}
        {!items.some(k => k.file) && (
          <p className="hint" style={{ marginTop: 8 }}>
            Upload attaches the real document (previewable, also filed under the opportunity's KYC folder);
            Simulate upload only flips the state for a demo run.
          </p>
        )}
        </>}
      </div>
      {viewing && customer && (
        <AttachmentViewer leadId={kycBlobKey(customer.name)} attachment={viewing} onClose={() => setViewing(null)} />
      )}
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
    }, { fallback: store.config?.aiModel?.provider === 'Built-in fallback' })
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
      MODAE_COMPANY.name,
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
  const rfqDraft = (store.communications[opp.id] || []).find(c => c.kind === 'vendor-rfq-draft')
  const prepareRfq = () => store.addCommunication(opp.id, {
    to: 'Approved vendor list',
    subject: `Vendor RFQ draft — ${opp.oppName}`,
    kind: 'vendor-rfq-draft',
    note: `${lines.length || 'all'} line(s), delivery ${opp.location || 'site'}. Human review required before any external send.`,
  })

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
          <button onClick={prepareRfq} disabled={!!rfqDraft}><Icon name="mail" size={13} /> {rfqDraft ? 'Vendor RFQ draft prepared' : 'Draft vendor RFQ (simulated)'}</button>
          <button className="primary" onClick={() => goTab('proposal')}>
            <Icon name="arrowRight" size={13} /> Route to workbench
          </button>
        </div>
        {rfqDraft && (
          <div className="okbox">
            Vendor RFQ draft prepared (simulated) — {rfqDraft.note || `${lines.length || 'all'} line(s), delivery ${opp.location || 'site'}.`}
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
  const comm = canPriceProposal(store.role)
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
          {COMMERCIAL_RX.test(a.detail || '') && !canPriceProposal(store.role) ? (
            <div className="restricted" style={{ fontSize: 12.5, margin: '6px 0' }}>
              <Icon name="lock" size={11} /> Commercial exception — trigger values (GM% / discount / value) visible to approvers and the opportunity owner only.
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
