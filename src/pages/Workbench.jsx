import React, { useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ROLES, OWNERS, STAGES, PROB_LEVELS, SEGMENTS, PRODUCTS, BUS, SUBFOLDERS, MILESTONES, CLOSE_REASONS, REVISION_TYPES } from '../seed.js'
import { canPriceProposal, isAdminRole, fmt, ageDays, ddMmmYY, gmailComposeHref } from '../utils.js'
import { readiness, isBlocked, nextActionWith, transitionBlockers, B_PRE_PROPOSAL_STEPS, B_PROPOSAL_STEPS } from '../gates.js'
import { COMMERCIAL_RX } from './Approvals.jsx'
import { Chip, ClassChip, AiBadge, Stepper, WarnBox, ErrBox, Modal } from '../ui.jsx'
import { Icon } from '../icons.jsx'
import { productBrandProfiles } from '../branding/modae.js'
import { MODAE_COMPANY } from '../proposalDoc.js'
import { runJson, runText } from '../ai.js'
import { clarificationSender } from '../leadClarification.js'
import WbSpares from '../workbench/WbSpares.jsx'
import WbService from '../workbench/WbService.jsx'
import WbProject from '../workbench/WbProject.jsx'
import PropBuilder from '../workbench/PropBuilder.jsx'
// The same component the standalone /proposal/:oppId route renders â€” both write
// through store.saveProposal, so the two views are never out of step.
import Proposal from './Proposal.jsx'
import PrintDoc from '../proposal/PrintDoc.jsx'
import { buildDocProps } from '../proposal/docProps.js'
import BSteps from '../workbench/BSteps.jsx'
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
  Approval: 'Awaiting release approval â€” follow up with LJS / AH',
  Submitted: 'Follow up with the customer inside the validity window',
  'Follow-up': 'Record follow-ups and push for a decision',
  'PO Validation': 'Resolve PO deviations and complete joint acceptance',
  Handover: 'Complete the handover checklist with the execution team',
}

const LIFECYCLE_TABS = {
  Intake: 'overview',
  Qualification: 'requirement',
  'Customer/KYC': 'customer',
  Registration: 'customer',
  Screening: 'requirement',
  Clarification: 'clarifications',
  Sourcing: 'sourcing',
  Proposal: 'proposal',
  Approval: 'approvals',
  'PO Validation': 'po',
  Handover: 'po',
  Submitted: 'overview',
  'Follow-up': 'overview',
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
        <p className="hint">No opportunity with ID <b>{oppId}</b> â€” it may have been deleted or the link is stale.</p>
        <Link to="/">Back to the tracker</Link>
      </div>
    )
  }

  const goTab = k => nav(`/opp/${opp.id}/${k}`)
  const moveToMilestone = (milestone, reason = '') => {
    store.setMilestone(opp.id, milestone, reason)
    goTab(LIFECYCLE_TABS[milestone] || 'overview')
  }
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
    moveToMilestone(milestone)
  }
  const moveRelative = delta => {
    const next = MILESTONES[milestoneIndex + delta]
    if (next) moveMilestone(next)
  }
  const exceptionApprovalFor = blocker => (store.approvals || []).find(a =>
    a.type === 'Milestone exception' && a.oppId === opp.id
    && a.targetMilestone === transition?.target && a.blockerKey === blocker.key)
  // Diagram 02 Â§5 draws the layered approval as mandatory â€” its only "No" branch
  // is Return for Revision, never a bypass. So a blocker that names its own
  // approval type is *requested*, not excepted; the exception route is kept for
  // the lead-management requirements that have no approval object of their own.
  const canRequestApproval = blocker => !!blocker.approvalType
  const canRequestException = blocker => !blocker.approvalType
    && ['amber-fee', 'red-clearance'].includes(blocker.key)
  const approvalRequestFor = blocker => (store.approvals || []).find(a =>
    a.oppId === opp.id && a.type === blocker.approvalType && a.status === 'Pending')
  // Â§5A names two acceptable approvers ("LJS or AN") and carries `anyOf`, so a
  // single decision clears it. The approval is stamped with the revision it
  // covers, or a later revision would inherit it.
  const requestBlockerApproval = blocker => store.requestApproval({
    oppId: opp.id,
    type: blocker.approvalType,
    rev: String(proposal?.revision ?? ''),
    approver: blocker.approver,
    needed: blocker.needed || [blocker.approver],
    anyOf: !!blocker.anyOf,
    detail: blocker.text,
  })
  const requestException = blocker => {
    const needed = blocker.needed || [blocker.approver || 'AH']
    store.requestApproval({
      oppId: opp.id,
      type: 'Milestone exception',
      targetMilestone: transition.target,
      blockerKey: blocker.key,
      detail: `${blocker.text} â€” exception requested to move to ${transition.target}.`,
      approver: needed[0],
      needed,
      anyOf: !!blocker.anyOf,
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
  // `anyOf` blockers (Â§5A "LJS OR AN") name two approvers but need only one, so
  // the owner line must not read as a joint requirement.
  const blockerOwner = blocker => blocker.needed?.join(blocker.anyOf ? ' or ' : ' + ')
    || blocker.approver || (blocker.key === 'clarifications' ? opp.owner : 'Opportunity owner')
  const blockerExplanation = blocker => {
    if (blocker.key === 'clarifications') return 'Customer answers are still missing. The proposal must not be built on unconfirmed technical, delivery, or site assumptions.'
    if (blocker.key === 'dev') return 'The customer has requested terms outside the standard commercial position. AH must review and approve the exception before proposal work can continue.'
    if (blocker.key === 'amber-fee') return 'This Amber customer requires the pre-quote processing fee to be received before the opportunity can progress.'
    if (blocker.key === 'kyc') return 'This Blue customer is new or unverified. AH must complete the required KYC review before registration or quoting.'
    if (blocker.key === 'red-clearance') return 'This Red customer requires joint commercial clearance because of the risk or payment history.'
    // Diagram 02 Â§5 â€” the layered approval before the first quote dispatch and
    // before every revision. All three must clear; there is no exception route.
    if (blocker.key === 'tech-approval') return 'Section 5A: the technical scope must be signed off by LJS or AN before the quote can be dispatched. Either approver alone clears it.'
    if (blocker.key === 'comm-approval') return 'Section 5B: the commercial position must be signed off by AH before the quote can be dispatched.'
    if (blocker.key === 'release') return 'Section 5C: the final quote release, routed by order value and margin. It covers this revision only â€” a revised quote must be released again.'
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
          {/* Which of the diagram's three worlds this runs in â€” it decides the
              B-step chain, the pricing embargo and the survey path. */}
          {opp.context && <Chip tone="grey" title={`${opp.context} lane`}>{opp.context}</Chip>}
          <Chip tone={blockers.length ? 'state-Review' : 'state-Accepted'}>{blockers.length ? 'At risk' : 'On track'}</Chip>
        </div>
        <div className="opp-summary-grid">
          <div><span>Owner</span><b>{opp.owner} â€” {ROLES[opp.owner]?.name || opp.owner}</b></div>
          <div><span>Milestone</span><b>{opp.milestone || opp.stage}</b></div>
          <div><span>Customer value</span><b>{canSeeValue ? `â‚¹${fmt(opp.valueK || 0)},000` : 'Restricted'}</b></div>
          <div className="opp-summary-action"><span>Next action</span><b>{nextAction.text || NEXT_ACTION[opp.milestone] || 'Progress the opportunity'}</b></div>
          <div><span>Due</span><b>{ddMmmYY(due) || 'â€”'}</b></div>
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
            <button disabled={milestoneIndex <= 0} onClick={() => moveRelative(-1)}>â† Previous</button>
            <b>{opp.milestone}</b>
            <button disabled={milestoneIndex < 0 || milestoneIndex >= MILESTONES.length - 1} onClick={() => moveRelative(1)}>Next â†’</button>
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
                const approvable = canRequestApproval(item)
                const openRequest = approvable ? approvalRequestFor(item) : null
                return <div key={`${item.key}-${i}`} className={`workbench-blocker ${item.severity}`}>
                  <div className="transition-blocker-head"><b>{item.text}</b><span className="transition-owner">Owner: <strong>{blockerOwner(item)}</strong></span></div>
                  <span className="transition-explanation">{blockerExplanation(item)}</span>
                  {item.key === 'clarifications' && clarificationRows.length > 0 && <div className="transition-detail-list">{clarificationRows.map(row => <div key={row.id}><b>{row.id}</b> Â· {row.category} Â· {row.q} <em>{row.status}</em></div>)}</div>}
                  {item.key === 'dev' && deviationRows.length > 0 && <div className="transition-detail-list">{deviationRows.map((row, index) => <div key={`${row.term}-${index}`}><b>{row.term}</b> Â· Customer ask: {row.customerAsk || 'Not recorded'} Â· Response: {row.ourResponse || 'Pending review'}</div>)}</div>}
                  {item.severity === 'wait' && <span>Waiting for the responsible approver.</span>}
                  {item.key === 'clarifications' && <button className="exception-action" onClick={() => openTransitionTab('clarifications')}>Open clarifications</button>}
                  {item.key === 'b-steps' && <button className="exception-action" onClick={() => openTransitionTab(item.phase === 'pre-proposal' ? 'sourcing' : 'proposal')}>Open {item.phase === 'pre-proposal' ? 'Sourcing workflow' : 'Proposal workflow'}</button>}
                  {item.key === 'kyc' && <button className="exception-action" onClick={() => openTransitionTab('customer')}>Open Customer/KYC</button>}
                  {item.key === 'required-contactPerson' && <button className="exception-action" onClick={() => openMissingContact('contactPerson')}>Edit contact person</button>}
                  {item.key === 'required-contactPhone' && <button className="exception-action" onClick={() => openMissingContact('contactPhone')}>Edit contact phone</button>}
                  {approvable && openRequest && <span>{item.approvalType} <b>{openRequest.id}</b> is pending with {openRequest.needed?.join(openRequest.anyOf ? ' or ' : ' + ') || openRequest.approver} â€” <button className="inline-action" onClick={() => openTransitionTab('approvals')}>Open approval</button></span>}
                  {approvable && !openRequest && <button className="exception-action" onClick={() => requestBlockerApproval(item)}>Request {item.approvalType.toLowerCase()} from {blockerOwner(item)}</button>}
                  {requestable && exception?.status === 'Pending' && <span>Exception approval <b>{exception.id}</b> is pending â€” <button className="inline-action" onClick={() => openTransitionTab('approvals')}>Open approval</button></span>}
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
              <div className="forms-actions"><button className="primary" disabled={!transition.reason?.trim()} onClick={() => { moveToMilestone(transition.target, transition.reason.trim()); setTransition(null) }}>Move backward</button><button onClick={() => setTransition(null)}>Cancel</button></div>
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
      ? `Estimated value (â‚¹) ${fmt(opp.valueK)}K with ${opp.prob?.toLowerCase() || 'unrated'} probability at the ${opp.stage} stage.`
      : `${comm ? 'Not yet priced â€” probability' : 'Probability'} ${opp.prob?.toLowerCase() || 'unrated'} at the ${opp.stage} stage.`,
    blocked ? `${blockers.filter(b => b.severity !== 'info').length} readiness item(s) currently gate the proposal.` : 'No readiness blockers â€” clear to progress.',
  ].join(' ')

  const dates = [
    ['Created', ddMmmYY(opp.createDate)], ['Proposal', ddMmmYY(opp.proposalDate) || 'â€”'],
    ['Expected order', ddMmmYY(opp.orderDate) || 'â€”'], ['Last updated', ddMmmYY(opp.lastUpdated)],
    ['Age', `${ageDays(opp.createDate) ?? 'â€”'} days`],
  ]

  const saveAction = () => {
    if (action === 'call') {
      store.addCommunication(opp.id, {
        to: opp.contactPerson || opp.sellTo,
        subject: `Call recorded â€” ${opp.oppName}`,
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
          <p className="hint">Due {ddMmmYY(opp.orderDate || opp.lastUpdated) || 'â€”'}</p>
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
          <div className="workbench-kpi"><b>{kycItems.length ? `${verifiedKyc}/${kycItems.length}` : customer ? '0/0' : 'â€”'}</b><span>{customer ? 'verified' : 'Customer not in master'}</span></div>
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
            <label>New owner<select value={owner} onChange={e => setOwner(e.target.value)}>{OWNERS.map(r => <option key={r} value={r}>{r} â€” {ROLES[r]?.name || r}</option>)}</select></label>
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
    ['End user', `${opp.eucName || 'â€”'} Â· ${opp.eucLocation || 'â€”'}`],
    ['Route', opp.route], ['Lane', `${opp.context || 'â€”'} world`],
    ['Owner', `${opp.owner} â€” ${ROLES[opp.owner]?.name || ''}`],
    ['Contact', `${opp.contactPerson || 'â€”'} ${opp.contactPhone || ''}`],
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
          <p style={{ fontSize: 12.5 }}>{opp.remarks || 'No linked lead email â€” requirement captured at intake.'}</p>
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
  const simulateAllKycDone = () => {
    if (!customer || !canVerify || busy) return
    items.forEach(item => store.setKycState(customer.name, item.name, 'Verified'))
  }

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
          <p className="hint">{opp.sellTo} is not in the customer master yet â€” treated as a new (Blue) customer.</p>
        )}
        {opp.customerStatus === 'Blue' && (
          opp.leadVerification?.status === 'Verified'
            ? <div className="okbox">KYC verified at Lead stage â€” no second verification is required in the Opportunity.</div>
            : <WarnBox>Blue class: AH clearance required before proposal release.</WarnBox>
        )}
        {opp.customerStatus === 'Red' && (
          <WarnBox>Red class: KYC not required â€” continuation gated by joint LJS+AH (AP-1).</WarnBox>
        )}
        {opp.customerStatus === 'Amber' && (
          opp.leadVerification?.status === 'Confirmed'
            ? <div className="okbox"><b>Amber processing fee:</b> confirmed at Lead stage â€” no second confirmation is required in the Opportunity.</div>
            : <div className={opp.amberFeePaid ? 'okbox' : 'warnbox'}>
              <b>Amber pre-quote fee:</b> â‚¹ {fmt(fee.amount)} â€” {opp.amberFeePaid ? 'received' : `pending (${fee.days}-day window)`}
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
        {customer && (
          <div className="toolbar" style={{ margin: '0 0 8px' }}>
            <button className="primary" disabled={!canVerify || !!busy || items.every(k => k.state === 'Verified')}
              title={canVerify ? 'Demo only - marks every checklist item verified' : 'Only AH verifies KYC'}
              onClick={simulateAllKycDone}>
              Simulate all KYC done
            </button>
          </div>
        )}
        {items.map(k => (
          <React.Fragment key={k.name}>
            <div className="check-row">
              <span style={{ minWidth: 170 }}>{k.name}</span>
              <Chip tone={kycTone(k.state)}>{k.state}</Chip>
              {k.when && <span className="hint">{k.when}</span>}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                {/* Both paths stay on every row, Verified included â€” otherwise a
                    fully verified checklist offers no way to replace a document
                    or re-run the demo. */}
                <button disabled={!customer || !!busy} onClick={() => pick(k.name)}
                  title="Attach the actual document">
                  {busy === k.name ? 'Uploadingâ€¦' : k.file ? 'Replaceâ€¦' : 'Uploadâ€¦'}
                </button>
                <button disabled={!customer || !!busy} onClick={() => setState(k.name, 'Uploaded')}
                  title="Demo only â€” flips the state without a document">Simulate upload</button>
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
                  <span className="hint"><Icon name="alert" size={11} /> cloud copy failed â€” kept locally</span>
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
  const [draft, setDraft] = useState(null)
  const [sentOk, setSentOk] = useState(false)
  const [sendErr, setSendErr] = useState('')
  const [busy, setBusy] = useState('') // '' | 'suggest' | 'draft'
  const [answerFor, setAnswerFor] = useState(null)
  const [answerForm, setAnswerForm] = useState({ response: '', answerSource: 'Customer', receivedAt: '' })
  const [answerFiles, setAnswerFiles] = useState([])
  const [answerErr, setAnswerErr] = useState('')

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

  // Deterministic template â€” also the fallback when Gemini can't be reached.
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
    const customer = (store.customers || []).find(c => c.id === opp.sellTo || c.name === opp.sellTo)
    const sender = clarificationSender({ assignedOwner: opp.owner }, store.users, store.config)
    setDraft({
      from: sender.address,
      to: opp.contactEmail || customer?.email || '',
      cc: sender.cc,
      subject: `Clarifications â€” ${opp.oppName}`,
      body: text?.trim() || templateDraft(),
    })
    setSendErr('')
    setDraftOpen(true)
  }

  const approveSend = () => {
    if (!draft?.to?.trim()) { setSendErr('Add a recipient email address before sending'); return }
    const href = gmailComposeHref(draft)
    if (!href) { setSendErr('Add a recipient email address before sending'); return }
    window.open(href, '_blank', 'noopener')
    for (const c of open) store.updateClarification(c.id, { status: 'Sent' })
    store.addCommunication(opp.id, {
      to: draft.to,
      cc: draft.cc,
      subject: draft.subject,
      kind: 'clarification',
    })
    setDraftOpen(false)
    setSentOk(true)
  }

  const openAnswer = c => {
    setAnswerFor(c)
    setAnswerForm({
      response: c.response || '',
      answerSource: c.answerSource || c.audience || 'Customer',
      receivedAt: c.answeredAt || new Date().toISOString().slice(0, 10),
    })
    setAnswerFiles([])
    setAnswerErr('')
  }

  const saveAnswer = async () => {
    if (!answerFor) return
    if (!answerForm.response.trim()) { setAnswerErr('Add the answer received before marking this resolved.'); return }
    setBusy('answer')
    const attachments = []
    for (const file of answerFiles) {
      try {
        const rec = await uploadOppFile(opp, 'Customer Specs', file)
        store.addFile(opp.id, 'Customer Specs', rec)
        attachments.push({ ...rec, folder: 'Customer Specs' })
      } catch (err) {
        attachments.push({ name: file.name, date: new Date().toISOString().slice(0, 10), size: fmtSize(file.size), folder: 'Customer Specs', cloud: false, error: err?.message || String(err) })
      }
    }
    store.answerClarification(answerFor.id, {
      response: answerForm.response.trim(),
      answerSource: answerForm.answerSource,
      answeredAt: answerForm.receivedAt,
      attachments,
    })
    setBusy('')
    setAnswerFor(null)
  }

  return (
    <div>
      <div className="toolbar">
        <button onClick={suggest} disabled={!!busy}>
          <Icon name="sparkles" size={13} /> {busy === 'suggest' ? 'Thinkingâ€¦' : 'AI: suggest questions'}
        </button>
        <button onClick={openDraft} disabled={!open.length || !!busy}
          title={open.length ? '' : 'No open questions to draft from'}>
          <Icon name="mail" size={13} /> {busy === 'draft' ? 'Draftingâ€¦' : 'AI: draft email'}
        </button>
        <span className="spacer" />
      </div>
      {sentOk && <div className="okbox">Clarification email sent (simulated) â€” logged in Communications.</div>}
      <div className="sheet-wrap">
        <table className="sheet">
          <thead><tr><th>ID</th><th>Category</th><th>Gap / evidence</th><th>Question</th><th>Owner</th><th>Audience</th><th>Due</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map(c => (
              <tr key={c.id}>
                <td>{c.id}</td>
                <td>{c.category}</td>
                <td>{c.gap}<div className="hint">{c.evidence}</div></td>
                <td>{c.q}{c.response && <div className="okbox">Response: {c.response}<div className="hint">From {c.answerSource || c.audience || 'source'}{c.answeredAt ? ` · ${ddMmmYY(c.answeredAt)}` : ''}</div>{(c.attachments || []).map(f => <div key={f.name} className="hint"><Icon name="fileText" size={11} /> {f.name}</div>)}</div>}</td>
                <td>{c.owner}</td>
                <td>{c.audience}</td>
                <td>{ddMmmYY(c.due)}</td>
                <td><Chip tone={clarTone(c.status)}>{c.status}</Chip></td>
                <td>
                  <button onClick={() => openAnswer(c)}>{c.status === 'Answered' ? 'Edit answer' : 'Add answer'}</button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9} className="hint">No clarifications yet â€” let the AI suggest questions from detected gaps.</td></tr>}
          </tbody>
        </table>
      </div>

      {answerFor && (
        <Modal title={`Answer clarification - ${answerFor.id}`} onClose={() => setAnswerFor(null)} wide>
          {answerErr && <ErrBox>{answerErr}</ErrBox>}
          <div className="clar-mail-form">
            <label className="afield">Source
              <select value={answerForm.answerSource} onChange={e => setAnswerForm({ ...answerForm, answerSource: e.target.value })}>
                <option>Customer</option>
                <option>Manufacturer / Vendor</option>
                <option>Internal</option>
              </select>
            </label>
            <label className="afield">Received date
              <input type="date" value={answerForm.receivedAt} onChange={e => setAnswerForm({ ...answerForm, receivedAt: e.target.value })} />
            </label>
            <label className="afield">Answer received
              <textarea rows={8} value={answerForm.response} onChange={e => setAnswerForm({ ...answerForm, response: e.target.value })} placeholder="Paste or summarise the answer received for this question." autoFocus />
            </label>
            <label className="afield">Files / mail evidence
              <input type="file" multiple onChange={e => setAnswerFiles(Array.from(e.target.files || []))} />
            </label>
            {!!answerFiles.length && <div className="hint">{answerFiles.length} file(s) selected for Customer Specs.</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={() => setAnswerFor(null)}>Cancel</button>
            <button className="primary" disabled={busy === 'answer'} onClick={saveAnswer}><Icon name="check" size={13} /> {busy === 'answer' ? 'Saving...' : 'Save answer'}</button>
          </div>
        </Modal>
      )}
      {draftOpen && (
        <Modal title="AI-drafted clarification email" onClose={() => setDraftOpen(false)} wide className="clarification-compose-modal">
          {sendErr && <ErrBox>{sendErr}</ErrBox>}
          <div className="clar-mail-form">
            <label className="afield">From
              <input value={draft?.from || ''} readOnly />
            </label>
            <label className="afield">To
              <input value={draft?.to || ''} onChange={e => setDraft({ ...draft, to: e.target.value })} placeholder="customer@company.com" autoFocus />
            </label>
            <label className="afield">CC
              <input value={draft?.cc || ''} onChange={e => setDraft({ ...draft, cc: e.target.value })} placeholder="name@company.com, another@company.com" />
            </label>
            <label className="afield">Subject
              <input value={draft?.subject || ''} onChange={e => setDraft({ ...draft, subject: e.target.value })} />
            </label>
            <label className="afield">Body
              <textarea rows={14} value={draft?.body || ''} onChange={e => setDraft({ ...draft, body: e.target.value })} />
            </label>
          </div>
          <WarnBox>Human review required before sending â€” verify every question and the addressee.</WarnBox>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={() => setDraftOpen(false)}>Cancel</button>
            <button className="primary" onClick={approveSend}><Icon name="send" size={13} /> Open Gmail compose</button>
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
  const quotes = (store.vendorQuotes || []).filter(q => q.oppId === opp.id)
  const superseded = lines.some(l => String(l.match).toLowerCase().includes('superseded'))
  const [rfqOpen, setRfqOpen] = useState(false)
  const [rfqForm, setRfqForm] = useState({ manufacturer: '', to: '', cc: '', subject: '', body: '' })
  const [rfqErr, setRfqErr] = useState('')
  const [quoteFor, setQuoteFor] = useState(null)
  const [quoteForm, setQuoteForm] = useState({ lineId: '', unitPrice: '', currency: 'INR', leadTime: '', quoteRef: '', notes: '' })
  const [quoteFiles, setQuoteFiles] = useState([])
  const [quoteErr, setQuoteErr] = useState('')
  const [quoteBusy, setQuoteBusy] = useState(false)
  const [vendorSimBusy, setVendorSimBusy] = useState(false)
  const [vendorSimErr, setVendorSimErr] = useState('')

  const rfqBody = () => [
    'Dear Sir,',
    '',
    `Please share your best price and delivery for ${opp.oppName} (${opp.id}).`,
    '',
    'Items:',
    ...(lines.length ? lines.map((l, i) => `${i + 1}. ${l.pn || l.custRef} - ${l.desc || 'Item'} - Qty ${l.qty || 1}`) : ['1. As per attached buyer specification.']),
    '',
    'Kindly include validity, lead time, warranty, freight basis and applicable taxes.',
    '',
    'Best regards,',
    `${ROLES[opp.owner]?.name || opp.owner}`,
    MODAE_COMPANY.name,
  ].join('\n')

  const openRfq = () => {
    setRfqForm({
      manufacturer: '', to: '', cc: '',
      subject: `Manufacturer RFQ - ${opp.oppName} - ${opp.id}`,
      body: rfqBody(),
    })
    setRfqErr('')
    setRfqOpen(true)
  }

  const simulateVendorResponse = async () => {
    setVendorSimBusy(true); setVendorSimErr('')
    const result = await runJson('vendor.quote', {
      oppId: opp.id,
      oppName: opp.oppName,
      customer: opp.sellTo,
      product: (opp.product || []).join(', '),
      route: opp.oppType || opp.route || '',
      lines,
    }, { model: store.config?.aiModel?.model })
    if (!result?.manufacturer) {
      setVendorSimErr('AI could not generate a vendor response. Please try again.')
      setVendorSimBusy(false)
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    const prices = Array.isArray(result.prices)
      ? result.prices.filter(p => lines.some(l => l.id === p.lineId)).map(p => ({
        lineId: p.lineId, unitPrice: Number(p.unitPrice) || 0, currency: p.currency || 'INR',
        leadTime: p.leadTime || result.leadTime, notes: p.notes || '', appliedAt: new Date().toISOString(),
      }))
      : []
    store.addVendorQuote(opp.id, {
      manufacturer: result.manufacturer,
      email: 'simulated-manufacturer@example.com',
      subject: `Indicative quote ${result.quoteRef} - ${opp.oppName}`,
      body: result.notes,
      lineIds: lines.map(l => l.id),
      status: 'Received', receivedAt: today, quoteRef: result.quoteRef,
      leadTime: result.leadTime, notes: result.notes, prices, simulated: true,
    })
    store.addCommunication(opp.id, {
      dir: 'In', from: 'simulated-manufacturer@example.com', fromName: result.manufacturer,
      to: ROLES[opp.owner]?.name || opp.owner, subject: `Indicative quote ${result.quoteRef} - ${opp.oppName}`,
      body: result.notes, kind: 'vendor-response', simulated: true,
    })
    store.recordAiAction(opp.id, {
      provider: store.config?.aiModel?.provider,
      model: store.config?.aiModel?.model,
      action: 'vendor.quote', result,
    })
    setVendorSimBusy(false)
  }

  const sendRfq = () => {
    if (!rfqForm.to.trim()) { setRfqErr('Add the manufacturer email address before opening compose.'); return }
    const href = gmailComposeHref({ to: rfqForm.to, cc: rfqForm.cc, subject: rfqForm.subject, body: rfqForm.body })
    if (!href) { setRfqErr('Add the manufacturer email address before opening compose.'); return }
    window.open(href, '_blank', 'noopener')
    store.addVendorQuote(opp.id, {
      manufacturer: rfqForm.manufacturer.trim() || rfqForm.to.trim(),
      email: rfqForm.to.trim(), cc: rfqForm.cc.trim(), subject: rfqForm.subject,
      body: rfqForm.body, lineIds: lines.map(l => l.id), status: 'Sent',
    })
    store.addCommunication(opp.id, {
      to: rfqForm.to.trim(), cc: rfqForm.cc.trim(), subject: rfqForm.subject,
      kind: 'vendor-rfq',
    })
    setRfqOpen(false)
  }

  const openVendorResponse = q => {
    setQuoteFor(q)
    setQuoteForm({
      lineId: q.lineIds?.[0] || lines[0]?.id || '',
      unitPrice: '', currency: 'INR', leadTime: '', quoteRef: '', notes: '',
    })
    setQuoteFiles([])
    setQuoteErr('')
  }

  const saveVendorResponse = async () => {
    if (!quoteFor) return
    if (!quoteFiles.length && !quoteForm.unitPrice) { setQuoteErr('Upload the manufacturer reply or enter the quoted unit price.'); return }
    setQuoteBusy(true)
    try {
      for (const file of quoteFiles) {
        try {
          const rec = await uploadOppFile(opp, 'Partner Docs', file)
          store.addFile(opp.id, 'Partner Docs', rec)
          store.attachVendorQuoteFile(quoteFor.id, { ...rec, folder: 'Partner Docs' })
        } catch (err) {
          store.attachVendorQuoteFile(quoteFor.id, { name: file.name, date: new Date().toISOString().slice(0, 10), size: fmtSize(file.size), folder: 'Partner Docs', cloud: false, error: err?.message || String(err) })
        }
      }
      if (quoteForm.unitPrice && quoteForm.lineId) {
        store.applyVendorQuoteToLine(quoteFor.id, quoteForm.lineId, {
          manufacturer: quoteFor.manufacturer,
          unitPrice: quoteForm.unitPrice,
          currency: quoteForm.currency,
          leadTime: quoteForm.leadTime,
          quoteRef: quoteForm.quoteRef,
          notes: quoteForm.notes,
        })
      } else {
        store.updateVendorQuote(quoteFor.id, { status: 'Received', receivedAt: new Date().toISOString().slice(0, 10), notes: quoteForm.notes })
      }
      setQuoteFor(null)
    } finally {
      setQuoteBusy(false)
    }
  }

  const sources = lines.length
    ? [...new Map(lines.map(l => [l.priceList, l.priceState])).entries()].map(([name, state]) => ({ name, state }))
    : Object.entries(store.priceLists).map(([name, pl]) => ({ name: `${name} ${pl.version}`, state: 'Current' }))

  return (
    <div className="ana-grid">
      {opp.context === 'Brownfield' && (
        <div className="ana-card c-12">
          <BSteps opp={opp} steps={B_PRE_PROPOSAL_STEPS} title="Brownfield sourcing sign-off - B-01 to B-04" />
        </div>
      )}
      {opp.route === 'Spares' && (
        <div className="ana-card c-12 sourcing-spares-workbench">
          <WbSpares opp={opp} openBuilder={() => goTab('proposal')} />
        </div>
      )}
      {superseded && (
        <div className="ana-card c-12">
          <WarnBox>
            <b>Obsolescence alert:</b> a quoted part is superseded (demo bulletin SB-112 - BKD-3300 replaced by BKD-3310).
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
          <button onClick={openRfq}><Icon name="mail" size={13} /> Draft manufacturer RFQ</button>
          <button onClick={simulateVendorResponse} disabled={vendorSimBusy} title="Ask AI to create a test vendor response">
            <Icon name="sparkles" size={13} /> {vendorSimBusy ? 'Generating…' : 'Simulate vendor response'}
          </button>
          <button className="primary" onClick={() => goTab('proposal')}>
            <Icon name="arrowRight" size={13} /> Route to workbench
          </button>
        </div>
        {vendorSimErr && <ErrBox>{vendorSimErr}</ErrBox>}
        <p className="hint">Send RFQs to multiple manufacturers, attach their replies, then apply the chosen price to the opportunity line.</p>
      </div>

      <div className="ana-card c-12">
        <div className="ana-title">Manufacturer quotes</div>
        {quotes.map(q => (
          <div key={q.id} className="check-row" style={{ alignItems: 'flex-start' }}>
            <Icon name="mail" size={13} />
            <span style={{ flex: 1 }}>
              <b>{q.manufacturer}</b> <Chip tone={q.status === 'Applied' ? 'state-Accepted' : q.status === 'Received' ? 'state-Review' : 'grey'}>{q.status}</Chip>
              <div className="hint">{q.email}{q.sentAt ? ` - sent ${ddMmmYY((q.sentAt || '').slice(0, 10))}` : ''}{q.receivedAt ? ` - received ${ddMmmYY(q.receivedAt)}` : ''}</div>
              {(q.attachments || []).map(f => <div key={f.name} className="hint"><Icon name="fileText" size={11} /> {f.name}</div>)}
              {(q.prices || []).map((p, i) => <div key={i} className="okbox">Applied {p.unitPrice} {p.currency} to {p.lineId}{p.leadTime ? ` - ${p.leadTime}` : ''}</div>)}
            </span>
            <button onClick={() => openVendorResponse(q)}><Icon name="upload" size={12} /> Upload / apply response</button>
          </div>
        ))}
        {!quotes.length && <p className="hint">No manufacturer RFQs sent yet.</p>}
      </div>

      {rfqOpen && (
        <Modal title="Draft manufacturer RFQ" onClose={() => setRfqOpen(false)} wide>
          {rfqErr && <ErrBox>{rfqErr}</ErrBox>}
          <div className="clar-mail-form">
            <label className="afield">Manufacturer
              <input value={rfqForm.manufacturer} onChange={e => setRfqForm({ ...rfqForm, manufacturer: e.target.value })} placeholder="Manufacturer / vendor name" />
            </label>
            <label className="afield">To
              <input value={rfqForm.to} onChange={e => setRfqForm({ ...rfqForm, to: e.target.value })} placeholder="sales@manufacturer.com" autoFocus />
            </label>
            <label className="afield">CC
              <input value={rfqForm.cc} onChange={e => setRfqForm({ ...rfqForm, cc: e.target.value })} />
            </label>
            <label className="afield">Subject
              <input value={rfqForm.subject} onChange={e => setRfqForm({ ...rfqForm, subject: e.target.value })} />
            </label>
            <label className="afield">Body
              <textarea rows={14} value={rfqForm.body} onChange={e => setRfqForm({ ...rfqForm, body: e.target.value })} />
            </label>
          </div>
          <WarnBox>Human review required before sending. The app opens Gmail compose and logs the RFQ against this opportunity.</WarnBox>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={() => setRfqOpen(false)}>Cancel</button>
            <button className="primary" onClick={sendRfq}><Icon name="send" size={13} /> Open Gmail compose</button>
          </div>
        </Modal>
      )}

      {quoteFor && (
        <Modal title={`Manufacturer response - ${quoteFor.manufacturer}`} onClose={() => setQuoteFor(null)} wide>
          {quoteErr && <ErrBox>{quoteErr}</ErrBox>}
          <div className="clar-mail-form">
            <label className="afield">Apply to opportunity line
              <select value={quoteForm.lineId} onChange={e => setQuoteForm({ ...quoteForm, lineId: e.target.value })}>
                <option value="">Do not apply price yet</option>
                {lines.map(l => <option key={l.id} value={l.id}>{l.pn || l.custRef} - {l.desc || 'Item'} - Qty {l.qty || 1}</option>)}
              </select>
            </label>
            <label className="afield">Quoted unit price
              <input type="number" min="0" value={quoteForm.unitPrice} onChange={e => setQuoteForm({ ...quoteForm, unitPrice: e.target.value })} />
            </label>
            <label className="afield">Currency
              <select value={quoteForm.currency} onChange={e => setQuoteForm({ ...quoteForm, currency: e.target.value })}>
                {['INR', 'EUR', 'USD'].map(c => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="afield">Lead time
              <input value={quoteForm.leadTime} onChange={e => setQuoteForm({ ...quoteForm, leadTime: e.target.value })} placeholder="4-6 weeks" />
            </label>
            <label className="afield">Quote reference
              <input value={quoteForm.quoteRef} onChange={e => setQuoteForm({ ...quoteForm, quoteRef: e.target.value })} placeholder="Manufacturer quote no. / email date" />
            </label>
            <label className="afield">Notes
              <textarea rows={4} value={quoteForm.notes} onChange={e => setQuoteForm({ ...quoteForm, notes: e.target.value })} />
            </label>
            <label className="afield">Reply files / price sheet
              <input type="file" multiple onChange={e => setQuoteFiles(Array.from(e.target.files || []))} />
            </label>
            {!!quoteFiles.length && <div className="hint">{quoteFiles.length} file(s) selected for Partner Docs.</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={() => setQuoteFor(null)}>Cancel</button>
            <button className="primary" disabled={quoteBusy} onClick={saveVendorResponse}><Icon name="check" size={13} /> {quoteBusy ? 'Saving...' : 'Save response'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
// ---------------------------------------------------------------------------
function ProposalTab({ opp }) {
  const [sub, setSub] = useState('edit-sheet')
  const openBuilder = () => setSub('builder')
  const openEditSheet = () => setSub('edit-sheet')
  // Diagram 02 Â§3 is the Brownfield lane only â€” Greenfield runs Phase-1
  // activities and Service runs the Â§4 survey path instead.
  const SUBS = [
    ['workbench', 'Workbench'],
    ...(opp.context === 'Brownfield' ? [['steps', 'B-01â€¦B-05']] : []),
    ['builder', 'Builder'], ['edit-sheet', 'Edit proposal'], ['preview', 'Document preview'], ['followup', 'Follow-up'],
  ]
  return (
    <div className="proposal-tab-shell">
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
      {sub === 'steps' && <BSteps opp={opp} steps={B_PROPOSAL_STEPS} title="Brownfield proposal sign-off - B-05" />}
      {sub === 'builder' && (
        <>
          <PropBuilder opp={opp} openSteps={() => setSub('steps')} />
          <div className="builder-divider" />
          <Proposal oppId={opp.id} embedded initialTab="Cover Letter" />
        </>
      )}
      {sub === 'edit-sheet' && <Proposal oppId={opp.id} embedded initialTab="Edit Sheet" />}
      {sub === 'preview' && <PreviewPane opp={opp} openBuilder={openBuilder} openEditSheet={openEditSheet} />}
      {sub === 'followup' && <FollowUpPane opp={opp} />}
    </div>
  )
}

// The real customer document, not a summary of it. Same component, same props
// and same data the Builder's "Preview proposal" modal and the printer use â€” a
// preview that showed anything else would be worth less than no preview at all.
function PreviewPane({ opp, openBuilder, openEditSheet }) {
  const store = useStore()
  const props = buildDocProps(store, opp.id)
  if (!props) return <div className="form-card">Unknown opportunity.</div>
  const { p, doc, priced, totals, lineQuoted } = props
  return (
    <div className="proposal-preview-pane">
      <div className="proposal-preview-toolbar">
        <span className="hint">
          Customer-facing document Â· Rev {p.revision} Â· Read-only preview
          {!priced && ' Â· prices hidden'}
        </span>
        <button className="linklike" onClick={openEditSheet}>
          <Icon name="fileSheet" size={13} /> Edit in the Sheet
        </button>
      </div>
      <div className="proposal-preview-scroll">
        <PrintDoc p={p} opp={opp} doc={doc} priced={priced} totals={totals} lineQuoted={lineQuoted} />
      </div>
    </div>
  )
}

function FollowUpPane({ opp }) {
  const store = useStore()
  const p = store.getProposal(opp.id)
  const revisions = p.revisions || []
  const [note, setNote] = useState('')
  const [revType, setRevType] = useState(REVISION_TYPES[0].id)
  const [fuOpen, setFuOpen] = useState(false)
  const [fuDraft, setFuDraft] = useState('')
  const [fuBusy, setFuBusy] = useState(false)
  const [fuSent, setFuSent] = useState(false)
  const [escOpen, setEscOpen] = useState(false)
  // Diagram 02 Â§7 "Opportunity Lost â€” Capture Loss Reason" and Â§8 competitor
  // tracking. Both close-out branches live beside the follow-up loop they end.
  const [lossReason, setLossReason] = useState('')
  const [lossCompetitor, setLossCompetitor] = useState('')
  const [compName, setCompName] = useState('')
  const [compNote, setCompNote] = useState('')

  const competitors = (store.competitors || []).filter(c => c.oppId === opp.id)
  const validityDays = opp.validityDays || 30
  const age = opp.proposalDate ? ageDays(opp.proposalDate) : null
  const left = age == null ? null : validityDays - age

  // Diagram 02 Â§7 has one revision path, not two: every revision is typed, is
  // routed back to the B-step that owns it, and re-opens the Â§5 approval. This
  // used to write an untyped R-numbered entry that did none of that, so the
  // same act had two different consequences depending on which panel raised it.
  const addRevision = () => {
    if (!note.trim()) return
    store.reviseProposal(opp.id, note.trim(), revType)
    setNote('')
    setRevType(REVISION_TYPES[0].id)
  }
  const revSpec = REVISION_TYPES.find(r => r.id === revType) || REVISION_TYPES[0]

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
      history: (store.communications?.[opp.id] || []).map(c => `${c.ts?.slice(0, 10)} ${c.kind} â†’ ${c.to}: ${c.subject}`),
      senderName: ROLES[opp.owner]?.name || opp.owner,
    })
    setFuBusy(false)
    setFuDraft(text?.trim() || templateFu())
    setFuOpen(true)
  }

  const sendFu = () => {
    store.addCommunication(opp.id, {
      to: opp.contactPerson || opp.sellTo,
      subject: `Follow-up â€” ${opp.oppName}`,
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
            {r.type && <Chip tone="state-Review">{r.type} â†’ {r.step}</Chip>}
            <span className="hint" style={{ marginLeft: 'auto' }}>{ddMmmYY(r.when)} Â· {r.by}</span>
          </div>
        ))}
        {!revisions.length && <p className="hint">No revisions recorded yet.</p>}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <select value={revType} onChange={e => setRevType(e.target.value)}>
            {REVISION_TYPES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <input placeholder="Reason for revision (logged)" value={note} style={{ flex: 1, minWidth: 160 }}
            onChange={e => setNote(e.target.value)} />
          <button disabled={!note.trim()} onClick={addRevision}><Icon name="plus" size={13} /> Add revision</button>
        </div>
        <p className="hint" style={{ marginTop: 4 }}>
          Returns the opportunity to <b>{revSpec.step}</b>, reopens that step for sign-off, and
          requires the whole Â§5 approval again before the quote can be sent.
        </p>
      </div>
      <div className="ana-card c-6">
        <div className="ana-title">Follow-up & reminders</div>
        {age == null
          ? <p className="hint">Not yet submitted â€” the validity countdown starts at the proposal date.</p>
          : left > 0
            ? <p style={{ fontSize: 12.5 }}>Validity: <b>{left} day(s) left</b> of {validityDays} (submitted {ddMmmYY(opp.proposalDate)}).</p>
            : <WarnBox>Proposal validity expired {-left} day(s) ago â€” revalidate or issue a revision.</WarnBox>}
        {(store.config?.reminders || []).map(r => (
          <div key={r.id} className="check-row">
            <span>{r.label}</span>
            {r.on ? <Chip tone="state-Accepted">On</Chip> : <Chip tone="grey">Off</Chip>}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button onClick={openFu} disabled={fuBusy}>
            <Icon name="sparkles" size={13} /> {fuBusy ? 'Draftingâ€¦' : 'AI: draft follow-up'}
          </button>
          <button onClick={() => setEscOpen(true)}><Icon name="sparkles" size={13} /> AI: escalation suggestion</button>
        </div>
        {fuSent && <div className="okbox">Follow-up sent (simulated) â€” logged in Communications.</div>}
        {escOpen && (
          <div className="okbox">
            Post-quotation intelligence: {age != null ? `submitted ${age} day(s) ago with no recorded customer response` : 'proposal not yet submitted'}.
            Suggest a courtesy call by {opp.owner} this week, and escalate to LJS if silent past day 14 of the follow-up schedule.
          </div>
        )}
      </div>

      <div className="ana-card c-6">
        <div className="ana-title">Close-out</div>
        {opp.status === 'Closed' ? (
          <div className={opp.stage === 'Won' ? 'okbox' : 'warnbox'}>
            Closed as <b>{opp.stage}</b>{opp.closedReason ? ` â€” ${opp.closedReason}` : ''}
          </div>
        ) : (
          <>
            <p className="hint">
              A lost opportunity always carries a reason â€” it is what the win/loss analytics read.
            </p>
            <div style={{ display: 'grid', gap: 6 }}>
              <select value={lossReason} onChange={e => setLossReason(e.target.value)}>
                <option value="">â€” loss reason (required) â€”</option>
                {CLOSE_REASONS.map(r => <option key={r}>{r}</option>)}
              </select>
              <input placeholder="Competitor who won it (optional)" value={lossCompetitor}
                onChange={e => setLossCompetitor(e.target.value)} />
              <div>
                <button disabled={!lossReason}
                  title={lossReason ? '' : 'Select a loss reason first'}
                  onClick={() => {
                    store.closeLost(opp.id, lossReason, lossCompetitor.trim() ? { name: lossCompetitor.trim() } : null)
                    setLossReason(''); setLossCompetitor('')
                  }}>
                  <Icon name="flag" size={13} /> Close as lost
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="ana-card c-6">
        <div className="ana-title">Competitors</div>
        {competitors.map(c => (
          <div key={c.id} className="check-row">
            <Icon name="building" size={13} />
            <span><b>{c.name}</b>{c.note ? <div className="hint">{c.note}</div> : null}</span>
            {c.outcome && <Chip tone="state-Rejected">{c.outcome}</Chip>}
            <button style={{ marginLeft: 'auto' }} onClick={() => store.removeCompetitor(c.id)}>Remove</button>
          </div>
        ))}
        {!competitors.length && <p className="hint">No competitor recorded on this opportunity.</p>}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <input placeholder="Competitor" value={compName} style={{ flex: '1 1 120px' }}
            onChange={e => setCompName(e.target.value)} />
          <input placeholder="What we know (price, position)" value={compNote} style={{ flex: '2 1 180px' }}
            onChange={e => setCompNote(e.target.value)} />
          <button disabled={!compName.trim()}
            onClick={() => {
              store.addCompetitor(opp.id, { name: compName.trim(), note: compNote.trim() })
              setCompName(''); setCompNote('')
            }}>
            <Icon name="plus" size={13} /> Record
          </button>
        </div>
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
            <span className="hint" style={{ marginLeft: 'auto' }}>requested by {a.requestedBy} Â· {ddMmmYY((a.ts || '').slice(0, 10))}</span>
          </div>
          {COMMERCIAL_RX.test(a.detail || '') && !canPriceProposal(store.role) ? (
            <div className="restricted" style={{ fontSize: 12.5, margin: '6px 0' }}>
              <Icon name="lock" size={11} /> Commercial exception â€” trigger values (GM% / discount / value) visible to approvers and the opportunity owner only.
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
      {!rows.length && <p className="hint">No approvals raised for this opportunity yet â€” the builder routes them when needed.</p>}
      <Link to="/approvals"><Icon name="checkCircle" size={13} /> Open the Approvals page</Link>
    </div>
  )
}

// ---------------------------------------------------------------------------
const cleanAddress = value => typeof value === 'string' ? value.trim() : ''

function CommsName({ value, email }) {
  return <>{value}{email && <span className="hint"> &lt;{email}&gt;</span>}</>
}

function communicationRecipient(entry, opp, customer, vendorQuotes, mailbox) {
  const raw = cleanAddress(entry.to)
  if (raw && mailbox && raw.toLowerCase() === mailbox.toLowerCase()) {
    return { name: 'ModAE Sales Desk', email: raw }
  }
  const customerEmail = cleanAddress(opp.contactEmail || customer?.email)
  if (raw && customerEmail && raw.toLowerCase() === customerEmail.toLowerCase()) {
    return { name: opp.contactPerson || customer?.name || opp.sellTo, email: raw }
  }
  if (entry.kind === 'vendor-rfq') {
    const quote = vendorQuotes.find(q => q.subject === entry.subject)
    if (quote?.manufacturer) return { name: quote.manufacturer, email: raw || quote.email }
  }
  return { name: raw || 'ModAE Sales Desk', email: '' }
}

function communicationSender(entry, opp, lead) {
  const raw = cleanAddress(entry.from)
  if (entry.dir === 'In') return { name: entry.fromName || lead?.sender || raw || 'Customer', email: raw && raw !== (entry.fromName || lead?.sender) ? raw : '' }
  return { name: entry.fromName || ROLES[opp.owner]?.name || opp.owner || 'ModAE Sales Desk', email: raw }
}

function LegacyCommsTab({ opp }) {
  const store = useStore()
  const lead = [...(store.leads || []), ...(store.leadArchive || [])].find(l => l.id === opp.sourceLeadId)
  const customer = (store.customers || []).find(c => c.name?.toLowerCase() === opp.sellTo?.toLowerCase())
  const vendorQuotes = store.vendorQuotes?.[opp.id] || []
  const leadRows = store.communications?.[lead?.id] || []
  const opportunityRows = store.communications?.[opp.id] || []
  const mailbox = store.config?.commonMailbox || 'sales@modae.demo'
  const inbound = lead ? [{
    id: `lead-${lead.id}`, ts: lead.ts, dir: 'In', kind: 'enquiry',
    from: lead.from, fromName: lead.sender, to: mailbox,
    subject: lead.subject || 'Original enquiry', body: lead.body,
  }] : []
  const recordedVendorResponses = new Set(opportunityRows.filter(c => c.kind === 'vendor-response').map(c => c.subject))
  const simulatedVendorRows = vendorQuotes
    .filter(q => q.simulated && !recordedVendorResponses.has(q.subject))
    .map(q => ({
      id: `vendor-response-${q.id}`, ts: q.receivedAt || q.sentAt, dir: 'In',
      from: q.email, fromName: q.manufacturer, to: ROLES[opp.owner]?.name || opp.owner,
      subject: q.subject || `Vendor response - ${q.manufacturer}`, body: q.body || q.notes,
      kind: 'vendor-response', simulated: true, attachmentNames: q.attachmentNames || [],
    }))
  const rows = [...inbound, ...leadRows, ...opportunityRows, ...simulatedVendorRows]
    .sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0))
  const formatKind = kind => ({
    enquiry: 'Incoming enquiry', 'clarification-response': 'Customer reply',
    clarification: 'Clarification', 'vendor-rfq': 'Manufacturer RFQ',
    'proposal-email': 'Proposal email', submission: 'Proposal submission',
    'follow-up': 'Follow-up', ack: 'Customer acknowledgement',
  }[kind] || kind || 'Communication')
  return (
    <div className="ana-grid">
      <div className="ana-card c-6">
        <div className="ana-title">Communication log</div>
        {rows.map((c, i) => (
          <div key={i} className="check-row">
            <Icon name="mail" size={13} />
            <span><b>{c.subject}</b><div className="hint">to {c.to} Â· {new Date(c.ts).toLocaleString()}</div></span>
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
function CommsTab({ opp }) {
  const store = useStore()
  const [selectedCommunication, setSelectedCommunication] = useState(null)
  const lead = [...(store.leads || []), ...(store.leadArchive || [])].find(l => l.id === opp.sourceLeadId)
  const customer = (store.customers || []).find(c => c.name?.toLowerCase() === opp.sellTo?.toLowerCase())
  const vendorQuotes = store.vendorQuotes?.[opp.id] || []
  const leadRows = store.communications?.[lead?.id] || []
  const opportunityRows = store.communications?.[opp.id] || []
  const mailbox = store.config?.commonMailbox || 'sales@modae.demo'
  const inbound = lead ? [{
    id: `lead-${lead.id}`, ts: lead.ts, dir: 'In', kind: 'enquiry',
    from: lead.from, fromName: lead.sender, to: mailbox,
    subject: lead.subject || 'Original enquiry', body: lead.body,
  }] : []
  const rows = [...inbound, ...leadRows, ...opportunityRows]
    .sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0))
  const formatKind = kind => ({
    enquiry: 'Incoming enquiry', 'clarification-response': 'Customer reply',
    clarification: 'Clarification', 'vendor-rfq': 'Manufacturer RFQ',
    'proposal-email': 'Proposal email', submission: 'Proposal submission',
    'follow-up': 'Follow-up', ack: 'Customer acknowledgement',
  }[kind] || kind || 'Communication')
  return (
    <div className="ana-grid">
      <div className="ana-card c-6">
        <div className="ana-title">Communication log</div>
        {rows.map((c, i) => {
          const sender = communicationSender(c, opp, lead)
          const recipient = communicationRecipient(c, opp, customer, vendorQuotes, mailbox)
          return (
            <div key={c.id || `${c.ts}-${i}`} className="check-row communication-row" role="button" tabIndex={0}
              onClick={() => setSelectedCommunication(c)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedCommunication(c) } }}>
              <Icon name="mail" size={13} />
              <span>
                <b>{c.subject}</b>
                <div className="hint"><CommsName value={sender.name} email={sender.email} /> → <CommsName value={recipient.name} email={recipient.email} /> · {new Date(c.ts).toLocaleString()}</div>
              </span>
              <Chip tone={c.dir === 'In' ? 'Blue' : 'grey'}>{formatKind(c.kind)}</Chip>
            </div>
          )
        })}
        {!rows.length && <p className="hint">No communications logged yet.</p>}
      </div>
      <div className="ana-card c-6">
        <SubmissionPanel opp={opp} />
      </div>
      {selectedCommunication && (() => {
        const c = selectedCommunication
        const sender = communicationSender(c, opp, lead)
        const recipient = communicationRecipient(c, opp, customer, vendorQuotes, mailbox)
        return (
          <Modal title={c.subject || 'Communication'} onClose={() => setSelectedCommunication(null)} wide>
            <div className="communication-detail">
              <div className="communication-detail-meta">
                <div><b>From</b><span><CommsName value={sender.name} email={sender.email} /></span></div>
                <div><b>To</b><span><CommsName value={recipient.name} email={recipient.email} /></span></div>
                {c.cc && <div><b>CC</b><span>{c.cc}</span></div>}
                <div><b>Date</b><span>{c.ts ? new Date(c.ts).toLocaleString() : '—'}</span></div>
                <div><b>Type</b><span>{formatKind(c.kind)}</span></div>
              </div>
              <div className="communication-detail-body">{c.body || 'No message body was recorded for this communication.'}</div>
              {(c.attachmentNames || []).length > 0 && <div className="communication-detail-attachments"><b>Attachments</b><span>{c.attachmentNames.join(' · ')}</span></div>}
            </div>
          </Modal>
        )
      })()}
    </div>
  )
}

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
                <span className="hint" style={{ marginLeft: 'auto' }}>{f.size} Â· {ddMmmYY(f.date)}</span>
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
