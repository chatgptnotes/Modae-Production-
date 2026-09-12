import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ROLES, OWNERS, STAGES, PROB_LEVELS, SEGMENTS, PRODUCTS, BUS, SUBFOLDERS, MILESTONES, CLOSE_REASONS, REVISION_TYPES, DEFAULT_WORKFLOW } from '../seed.js'
import { canPriceProposal, isAdminRole, fmt, ageDays, ddMmmYY, gmailComposeHref, displayRole, displayRoles, displayRoleLabel, formatISTDateTime } from '../utils.js'
import { readiness, isBlocked, nextActionWith, transitionBlockers } from '../gates.js'
import { COMMERCIAL_RX, ConditionCompletion } from './Approvals.jsx'
import { Chip, ClassChip, AiBadge, WarnBox, ErrBox, Modal } from '../ui.jsx'
import { Icon } from '../icons.jsx'
import { productBrandProfiles } from '../branding/modae.js'
import { MODAE_COMPANY } from '../proposalDoc.js'
import { runJson, runTaskResult, runText } from '../ai.js'
import { clarificationSender } from '../leadClarification.js'
import WbSpares from '../workbench/WbSpares.jsx'
import WbService from '../workbench/WbService.jsx'
import WbProject from '../workbench/WbProject.jsx'
import PropBuilder from '../workbench/PropBuilder.jsx'
// The same component the standalone /proposal/:oppId route renders — both write
// through store.saveProposal, so the two views are never out of step.
import Proposal from './Proposal.jsx'
import SubmissionPanel from '../workbench/SubmissionPanel.jsx'
import PoHandover from '../workbench/PoHandover.jsx'
import OpportunityDetailsEditor, { OpportunityDetailsView } from '../OpportunityDetailsEditor.jsx'
import AttachmentViewer from '../AttachmentViewer.jsx'
import { extractDocText } from '../docText.js'
import { putFiles } from '../leadBlobs.js'
import { uploadOppFile, fmtSize } from '../filestore.js'
import { isPlaceholderSparesLine, isSparesSupportRow, catalogueDescriptionForLine } from '../proposal/sparesBoq.js'
import { recipientsValid } from '../emailValidation.js'
import { downloadKycTemplate } from '../kycTemplate.js'

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

const WORKFLOW_STEPS = [
  { slug: 'intake', label: 'Intake', tab: 'overview' },
  { slug: 'qualification', label: 'Qualification', tab: 'requirement' },
  { slug: 'customer-kyc', label: 'Customer/KYC', tab: 'customer' },
  { slug: 'registration', label: 'Registration', tab: 'customer' },
  { slug: 'screening', label: 'Screening', tab: 'requirement' },
  { slug: 'clarification', label: 'Clarification', tab: 'clarifications' },
  { slug: 'sourcing', label: 'Sourcing', tab: 'sourcing' },
  { slug: 'proposal', label: 'Proposal', tab: 'proposal' },
  { slug: 'approval', label: 'Approval', tab: 'approval' },
  { slug: 'follow-up', label: 'Follow-up', tab: 'followup' },
]

const WORKFLOW_STEP_BY_SLUG = Object.fromEntries(WORKFLOW_STEPS.map(step => [step.slug, step]))
const WORKFLOW_STEP_BY_TAB = Object.fromEntries(WORKFLOW_STEPS.map(step => [step.tab, step.slug]))
const workflowStepsFor = config => {
  const configured = Array.isArray(config?.workflow) && config.workflow.length
    ? [...config.workflow].sort((a, b) => a.order - b.order)
    : DEFAULT_WORKFLOW
  return configured.filter(step => step.enabled !== false).map(step => ({
    slug: step.id,
    label: step.label,
    milestone: step.milestone || step.label,
    tab: step.tab || WORKFLOW_STEPS.find(item => item.label === step.milestone)?.tab || 'overview',
  }))
}
const REMOVED_WORKFLOW_MILESTONES = new Set(['Submitted', 'PO Validation', 'Handover'])
const milestoneSlug = milestone => {
  if (REMOVED_WORKFLOW_MILESTONES.has(milestone)) return 'follow-up'
  return WORKFLOW_STEPS.find(step => step.label === milestone)?.slug || 'intake'
}

const titleCase = value => String(value || '').toLowerCase().split(/\s+/).map((word, index) => {
  const small = ['for', 'of', 'and', 'the', 'to', 'in'].includes(word) && index > 0
  return small ? word : word.charAt(0).toUpperCase() + word.slice(1)
}).join(' ').replace(/\bBoq\b/g, 'BOQ').replace(/\bKyc\b/g, 'KYC').replace(/\bRfq\b/g, 'RFQ')

function OpportunityProgress({ activeStep, completedThrough, onStep, onNext, steps = WORKFLOW_STEPS }) {
  const activeIndex = steps.findIndex(step => step.slug === activeStep)
  return (
    <nav className="opportunity-progress" aria-label="Opportunity progress">
      <div className="progress-head">
        <div>
          <span className="progress-kicker">Workflow</span>
          <strong>Opportunity progress</strong>
        </div>
        <div className="progress-controls" aria-label="Navigate workflow views">
          <button type="button" disabled={activeIndex <= 0} onClick={() => onStep(steps[activeIndex - 1].slug)}>Previous</button>
          <span>{steps[activeIndex]?.label}</span>
          <button type="button" disabled={activeIndex < 0 || activeIndex >= steps.length - 1} onClick={() => onNext(steps[activeIndex + 1].slug)}>Next</button>
        </div>
      </div>
      <div className="progress-steps">
        <span className="progress-track" aria-hidden="true" />
        {steps.map((step, index) => (
          <button key={step.slug} type="button"
            className={`progress-step ${index < completedThrough ? 'done' : ''} ${index === activeIndex ? 'current' : ''}`}
            aria-current={index === activeIndex ? 'step' : undefined}
            aria-label={`${step.label}${index === activeIndex ? ', selected step' : ''}`}
            title={`View ${step.label}`} onClick={() => onStep(step.slug)}>
            <span className="progress-node">{index < completedThrough ? '✓' : String(index + 1).padStart(2, '0')}</span>
            <span className="progress-label">{step.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

export default function Workbench() {
  const { oppId, tab = 'overview' } = useParams()
  const store = useStore()
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
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
  const workflowSteps = workflowStepsFor(store.config)
  const workflowBySlug = Object.fromEntries(workflowSteps.map(step => [step.slug, step]))
  const workflowByTab = Object.fromEntries(workflowSteps.map(step => [step.tab, step.slug]))
  const legacyStep = tab === 'overview' ? null : workflowByTab[tab] || WORKFLOW_STEP_BY_TAB[tab]
  const requestedStep = searchParams.get('step')
  const activeStep = workflowBySlug[requestedStep] ? requestedStep : legacyStep || workflowSteps.find(step => step.milestone === opp.milestone)?.slug || 'intake'
  const activeStepConfig = workflowBySlug[activeStep]
  const viewTab = workflowBySlug[requestedStep] ? activeStepConfig.tab : tab
  const persistedStepIndex = workflowSteps.findIndex(step => step.milestone === opp.milestone)
  const selectStep = step => {
    if (!workflowBySlug[step]) return
    nav(`/opp/${opp.id}?step=${encodeURIComponent(step)}`)
  }
  const proposal = store.getProposal(opp.id)
  const moveToMilestone = (milestone, reason = '') => {
    store.setMilestone(opp.id, milestone, reason)
    goTab(LIFECYCLE_TABS[milestone] || 'overview')
  }
  const blockers = readiness(opp, proposal, store)
  const nextAction = nextActionWith(opp, proposal, store)
  const canSeeValue = canPriceProposal(store.role)
  const due = opp.orderDate || opp.proposalDate || opp.lastUpdated
  const isOverdue = !!due && new Date(`${due}T23:59:59`) < new Date()
  const milestoneIndex = MILESTONES.indexOf(opp.milestone)
  const moveMilestone = milestone => {
    if (milestone === opp.milestone) return true
    if (MILESTONES.indexOf(milestone) < milestoneIndex) {
      setTransition({ kind: 'backward', target: milestone, reason: '' })
      return false
    }
    const blockersForMove = transitionBlockers(opp, milestone, proposal, store)
    if (blockersForMove.length) {
      setTransition({ kind: 'blocked', target: milestone, blockers: blockersForMove })
      return false
    }
    moveToMilestone(milestone)
    return true
  }
  const advanceStep = slug => {
    const step = workflowBySlug[slug]
    if (!step) return
    if (moveMilestone(step.milestone)) selectStep(slug)
  }
  const exceptionApprovalFor = blocker => (store.approvals || []).find(a =>
    a.type === 'Milestone exception' && a.oppId === opp.id
    && a.targetMilestone === transition?.target && a.blockerKey === blocker.key)
  // Diagram 02 §5 draws the layered approval as mandatory — its only "No" branch
  // is Return for Revision, never a bypass. So a blocker that names its own
  // approval type is *requested*, not excepted; the exception route is kept for
  // the lead-management requirements that have no approval object of their own.
  const canRequestApproval = blocker => !!blocker.approvalType
  const canRequestException = blocker => !blocker.approvalType
    && ['amber-fee', 'red-clearance'].includes(blocker.key)
  const approvalRequestFor = blocker => (store.approvals || []).find(a =>
    a.oppId === opp.id && a.type === blocker.approvalType && a.status === 'Pending')
  const approvalContextFor = blocker => {
    const lead = (store.leads || []).find(l => l.oppId === opp.id)
    const aiSummary = lead?.ai?.summary?.trim() || ''
    const fallbackSummary = `${opp.oppName || 'This opportunity'} is a ${opp.route || 'sales'} opportunity for ${opp.sellTo || 'the customer'}${opp.product ? ` covering ${Array.isArray(opp.product) ? opp.product.join(', ') : opp.product}` : ''}.`
    const deviations = blocker.key === 'dev'
      ? (proposal?.terms || []).filter(t => t.status === 'Deviation').map(t => ({
        term: t.term,
        customerAsk: t.customerAsk || 'Not recorded',
        ourResponse: t.ourResponse || 'Pending review',
      }))
      : []
    const blockingReason = blocker.key === 'dev'
      ? `${blocker.text} This blocks Proposal because the customer-requested terms differ from ModAE’s offered terms and require AH approval.`
      : blocker.text
    return {
      blockingReason,
      opportunitySummary: aiSummary || fallbackSummary,
      summarySource: aiSummary ? 'ai' : 'opportunity',
      opportunitySnapshot: {
        name: opp.oppName || '', customer: opp.sellTo || '', route: opp.route || '',
        product: Array.isArray(opp.product) ? opp.product.join(', ') : (opp.product || ''),
        milestone: opp.milestone || opp.stage || '', valueK: canSeeValue ? (opp.valueK ?? null) : null,
      },
      deviationDetails: deviations,
    }
  }
  // §5A names two acceptable approvers ("LJS or AN") and carries `anyOf`, so a
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
    pricingRows: blocker.pricingRows || undefined,
    ...approvalContextFor(blocker),
  })
  const requestException = blocker => {
    const needed = blocker.needed || [blocker.approver || 'AH']
    store.requestApproval({
      oppId: opp.id,
      type: 'Milestone exception',
      targetMilestone: transition.target,
      blockerKey: blocker.key,
      detail: `${blocker.text} — exception requested to move to ${transition.target}.`,
      ...approvalContextFor(blocker),
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
  const openDetails = () => {
    if (tab !== 'overview') nav(`/opp/${opp.id}/overview`)
    window.setTimeout(() => detailsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), tab === 'overview' ? 0 : 120)
  }
  const clarificationRows = (store.clarifications || []).filter(c => c.oppId === opp.id && ['Draft', 'Open', 'Sent'].includes(c.status))
  const deviationRows = (proposal?.terms || []).filter(t => t.status === 'Deviation')
  // `anyOf` blockers (§5A "LJS OR AN") name two approvers but need only one, so
  // the owner line must not read as a joint requirement.
  const blockerOwner = blocker => blocker.needed?.join(blocker.anyOf ? ' or ' : ' + ')
    || blocker.approver || (blocker.key === 'clarifications' ? opp.owner : 'Opportunity owner')
  const blockerExplanation = blocker => {
    if (blocker.key === 'clarifications') return 'Customer answers are still missing. The proposal must not be built on unconfirmed technical, delivery, or site assumptions.'
    if (blocker.key === 'dev') return 'This proposal differs from the customer’s requested commercial terms. AH approval is required before submission.'
    if (blocker.key === 'amber-fee') return 'This Amber customer requires the pre-quote processing fee to be received before the opportunity can progress.'
    if (blocker.key === 'kyc') return 'This Blue customer is new or unverified. AH must complete the required KYC review before registration or quoting.'
    if (blocker.key === 'red-clearance') return 'This Red customer requires joint commercial clearance because of the risk or payment history.'
    // Diagram 02 §5 — the layered approval before the first quote dispatch and
    // before every revision. All three must clear; there is no exception route.
    if (blocker.key === 'tech-approval') return 'Section 5A: the technical scope must be signed off by LJS or AN before the quote can be dispatched. Either approver alone clears it.'
    if (blocker.key === 'comm-approval') return 'Section 5B: the commercial position must be signed off by AH before the quote can be dispatched.'
    if (blocker.key === 'release') return 'Section 5C: the final quote release, routed by order value and margin. It covers this revision only — a revised quote must be released again.'
    if (blocker.key.startsWith('sp-conf-')) return 'This spares line’s part match has not been confirmed. Confirm the match — or pick an alternative — in Sourcing before the proposal can be built.'
    if (blocker.key.startsWith('sp-price-')) return 'This spares line’s price source has expired. Refresh it against a current price list or vendor quote in Sourcing.'
    if (blocker.key === 'pricing-threshold') return 'A discount or markup exceeds the Admin-configured limit. Request one approval from AH or LJS before continuing.'
    return 'Complete the requirement shown below before continuing.'
  }
  const approvalRequestReason = blocker => {
    if (blocker.key === 'comm-approval') {
      return 'The proposal contains customer-requested commercial terms that differ from ModAE’s standard offer and need AH sign-off before dispatch.'
    }
    if (blocker.key === 'release') {
      const revision = proposal?.revision ? ` revision ${proposal.revision}` : ''
      return `The customer-facing quote${revision} is ready for final release and must be approved by LJS and AH before it can be sent.`
    }
    if (blocker.approvalType) return `This requirement needs ${blocker.approver || 'the assigned approver'} approval before the workflow can continue.`
    return ''
  }

  return (
    <div className="page">
      <div className="opp-summary">
        <Link className="back-to-opportunities" to="/opportunities">
          <Icon name="arrowLeft" size={13} /> Back to opportunities
        </Link>
        <div className="opp-summary-title">
          <h1><span className="opp-id">{opp.id}</span><span className="opp-title-separator">-</span>{titleCase(opp.oppName)}</h1>
          <ClassChip cls={opp.customerStatus} />
          <Chip tone="grey">{opp.route}</Chip>
          {/* Which of the diagram's three worlds this runs in — it decides the
              B-step chain, the pricing embargo and the survey path. */}
          {opp.context && <Chip tone="grey" title={`${opp.context} lane`}>{opp.context}</Chip>}
          <Chip tone={blockers.length ? 'state-Review' : 'state-Accepted'}>{blockers.length ? 'At risk' : 'On track'}</Chip>
        </div>
      </div>
      <div className="opp-summary-grid clean-summary-grid summary-strip bg-gray-50 border border-gray-200 rounded-lg p-4 divide-x divide-gray-200" aria-label="Opportunity summary">
        <div className="summary-meta-item"><span>Owner</span><b>{displayRole(opp.owner)}</b></div>
        <div className="summary-meta-item"><span>Milestone</span><b>{opp.milestone || opp.stage}</b></div>
        <div className="summary-meta-item"><span>Customer value</span><b>{canSeeValue ? `₹${fmt(opp.valueK || 0)},000` : 'Restricted'}</b></div>
        <div className="summary-meta-item opp-summary-action"><span>Next action</span><b>{nextAction.text || NEXT_ACTION[opp.milestone] || 'Progress the opportunity'}</b></div>
        <div className={`summary-meta-item summary-due ${isOverdue ? 'is-overdue' : ''}`}><span>Due</span><div className="summary-meta-value"><b>{ddMmmYY(due) || '-'}</b>{isOverdue && <Chip tone="state-Blocks">Overdue</Chip>}</div></div>
      </div>
      <OpportunityProgress steps={workflowSteps} activeStep={activeStep} completedThrough={persistedStepIndex} onStep={selectStep} onNext={advanceStep} />
      {transition && (
        <Modal title={transition.kind === 'blocked' ? `Cannot move from ${opp.milestone} to ${transition.target}` : `Move back to ${transition.target}`} onClose={() => setTransition(null)} wide>
          {transition.kind === 'blocked' ? (
            <>
              <p className="transition-intro">This opportunity cannot move to <b>{transition.target}</b> until the following items are resolved or approved.</p>
              <div className="transition-blockers">{transition.blockers.map((item, i) => {
                const exception = exceptionApprovalFor(item)
                const requestable = canRequestException(item)
                const approvable = canRequestApproval(item)
                const openRequest = approvable ? approvalRequestFor(item) : null
                return <div key={`${item.key}-${i}`} className={`workbench-blocker ${item.severity}`}>
                  <div className="transition-blocker-head"><b>{item.text}</b><span className="transition-owner">Owner: <strong>{blockerOwner(item)}</strong></span></div>
                  <span className="transition-explanation">{blockerExplanation(item)}</span>
                  {item.approvalType && <div className="transition-request-reason"><b>Reason for request</b><span>{approvalRequestReason(item)}</span></div>}
                  {item.key === 'pricing-threshold' && item.pricingRows?.length > 0 && <div className="transition-pricing-details">{item.pricingRows.map((row, rowIndex) => <div key={`${row.label}-${rowIndex}`}><b>{row.label}</b>{row.discount > row.discountPct && <span>Discount {row.discount}% (limit {row.discountPct}%)</span>}{row.markup > row.markupPct && <span>Markup {row.markup}% (limit {row.markupPct}%)</span>}</div>)}</div>}
                  {item.key === 'clarifications' && clarificationRows.length > 0 && <div className="transition-detail-list">{clarificationRows.map(row => <div key={row.id}><b>{row.id}</b> · {row.category} · {row.q} <em>{row.status}</em></div>)}</div>}
                  {item.key === 'dev' && deviationRows.length > 0 && <div className="transition-detail-list">{deviationRows.map((row, index) => <div key={`${row.term}-${index}`}><b>{row.term}</b><br />Customer requested: {row.customerAsk || 'Not recorded'}<br />ModAE offered: {row.ourResponse || 'Pending review'}</div>)}</div>}
                  {item.severity === 'wait' && <span>Waiting for the responsible approver.</span>}
                  {item.key === 'clarifications' && <button className="exception-action" onClick={() => openTransitionTab('clarifications')}>Open clarifications</button>}
                  {item.key === 'kyc' && <button className="exception-action" onClick={() => openTransitionTab('customer')}>Open Customer/KYC</button>}
                  {item.key === 'required-contactPerson' && <button className="exception-action" onClick={() => openMissingContact('contactPerson')}>Edit contact person</button>}
                  {item.key === 'required-contactPhone' && <button className="exception-action" onClick={() => openMissingContact('contactPhone')}>Edit contact phone</button>}
                  {(item.key.startsWith('sp-conf-') || item.key.startsWith('sp-price-')) && <button className="exception-action" onClick={() => openTransitionTab('sourcing')}>Open sourcing</button>}
                  {approvable && openRequest && <span>{item.approvalType === 'Commercial deviation' ? 'AH approval for commercial deviations' : item.approvalType} <b>{openRequest.id}</b> is pending with {openRequest.needed?.join(openRequest.anyOf ? ' or ' : ' + ') || openRequest.approver} — <button className="inline-action" onClick={() => openTransitionTab('approvals')}>Open approval</button></span>}
                  {approvable && !openRequest && <button className="exception-action" onClick={() => requestBlockerApproval(item)}>{item.approvalType === 'Commercial deviation' ? 'Request AH approval for commercial deviations' : `Request ${item.approvalType.toLowerCase()} from ${blockerOwner(item)}`}</button>}
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
              <div className="forms-actions"><button className="primary" disabled={!transition.reason?.trim()} onClick={() => { moveToMilestone(transition.target, transition.reason.trim()); setTransition(null) }}>Move backward</button><button onClick={() => setTransition(null)}>Cancel</button></div>
            </>
          )}
        </Modal>
      )}
      <div className="wb-body">
        {viewTab === 'overview' && <OverviewTab opp={opp} detailsRef={detailsRef} />}
        {viewTab === 'requirement' && <RequirementTab opp={opp} />}
        {viewTab === 'customer' && <CustomerKycTab opp={opp} />}
        {viewTab === 'clarifications' && <ClarificationsTab opp={opp} />}
        {viewTab === 'sourcing' && <SourcingTab opp={opp} goTab={goTab} />}
        {viewTab === 'proposal' && <ProposalTab opp={opp} goTab={goTab} />}
        {viewTab === 'approval' && <ApprovalsTab opp={opp} />}
        {viewTab === 'followup' && <FollowUpTab opp={opp} goTab={goTab} />}
        {!activeStepConfig && viewTab === 'approvals' && <ApprovalsTab opp={opp} />}
        {!activeStepConfig && viewTab === 'comms' && <CommsTab opp={opp} />}
        {!activeStepConfig && viewTab === 'po' && <PoHandover opp={opp} />}
        {!activeStepConfig && viewTab === 'files' && <FilesTab opp={opp} />}
        {!activeStepConfig && viewTab === 'audit' && <AuditTab opp={opp} />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function OverviewTab({ opp, detailsRef }) {
  const store = useStore()
  const p = store.getProposal(opp.id)
  const blockers = readiness(opp, p, store)
  const blocked = isBlocked(blockers)
  const brandedProducts = productBrandProfiles(opp.product)

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

  return (
    <div className="workbench-overview">
      {opp.milestone === 'Intake'
        ? <OpportunityDetailsEditor ref={detailsRef} opp={opp} store={store} className="workbench-details-editor" />
        : <OpportunityDetailsView opp={opp} className="workbench-details-editor" />}
      <div className="workbench-overview-grid">
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
          <div className="workbench-section-title">Key dates</div>
          <table className="cost-table" style={{ width: '100%' }}><tbody>{dates.map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{v}</td></tr>)}</tbody></table>
        </section>
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
    ['Route', opp.route], ['Lane', `${opp.context || '—'} world`],
    ['Owner', displayRoleLabel(opp.owner)],
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
  const detailSeed = {
    billingAddress: opp.billingAddress ?? customer?.billingAddress ?? '',
    shippingAddress: opp.shippingAddress ?? customer?.shippingAddress ?? '',
    shippingPincode: opp.shippingPincode ?? customer?.shippingPincode ?? '',
    gstin: opp.gstin ?? customer?.gstin ?? '',
  }
  const [details, setDetails] = useState(detailSeed)
  const [detailSaved, setDetailSaved] = useState(false)
  const items = (customer && store.kyc[customer.name])
    || (store.config?.kycItems || []).map(n => ({ name: n, state: 'Missing', when: '' }))
  const fee = store.config?.amberFee || { amount: 25000, cur: 'INR', days: 7 }
  const setState = (item, state, file, mode) => customer && store.setKycState(customer.name, item, state, file, mode)
  const simulateAllKycDone = () => {
    if (!customer || !canVerify || busy) return
    items.forEach(item => store.setKycState(customer.name, item.name, 'Verified'))
  }

  const fileInput = useRef(null)
  const pending = useRef('')
  const [busy, setBusy] = useState('')
  const [viewing, setViewing] = useState(null)
  const [menuFor, setMenuFor] = useState('')
  const menuRef = useRef(null)

  useEffect(() => {
    setDetails({
      billingAddress: opp.billingAddress ?? customer?.billingAddress ?? '',
      shippingAddress: opp.shippingAddress ?? customer?.shippingAddress ?? '',
      shippingPincode: opp.shippingPincode ?? customer?.shippingPincode ?? '',
      gstin: opp.gstin ?? customer?.gstin ?? '',
    })
    setDetailSaved(false)
  }, [opp.id, customer?.name])

  const updateDetail = (key, value) => {
    setDetails(previous => ({ ...previous, [key]: value }))
    setDetailSaved(false)
  }

  const saveCustomerDetails = () => {
    const patch = Object.fromEntries(Object.entries(details).map(([key, value]) => [key, String(value || '').trim()]))
    store.updateOpportunity(opp.id, patch)
    if (customer) {
      if (isAdminRole(store.role)) {
        store.updateCustomer(customer.name, patch, 'Opportunity customer details completed')
      } else {
        store.requestApproval({
          type: 'Customer master change',
          needed: ['AH'],
          approver: 'AH',
          customerName: customer.name,
          patch,
          detail: `${customer.name} — billing/shipping/GST details supplied from Opportunity ${opp.id}`,
        })
      }
    }

    // Resolve only the lead missing items that now have a value. Other open
    // follow-up questions remain visible on the converted lead.
    const lead = store.leads.find(item => item.oppId === opp.id)
    if (lead?.ai?.missing?.length) {
      const matches = item => {
        const text = String(item || '').toLowerCase()
        return (patch.billingAddress && /billing\s+address/.test(text))
          || (patch.shippingAddress && /shipping\s+address/.test(text) && !/pincode|pin\s*code/.test(text))
          || (patch.shippingPincode && /(shipping\s+)?pincode|pin\s*code/.test(text))
          || (patch.gstin && /gstin|gst\s*(?:number|no\.?|details?)/.test(text))
      }
      const missing = lead.ai.missing.filter(item => !matches(item))
      if (missing.length !== lead.ai.missing.length) {
        store.updateLead(lead.id, { ai: { ...lead.ai, missing } }, 'Opportunity customer details supplied')
      }
    }
    setDetailSaved(true)
  }

  useEffect(() => {
    const close = event => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuFor('')
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

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
            <div className="section-title" style={{ marginTop: 14 }}>Customer commercial details</div>
            <p className="hint" style={{ marginTop: 4 }}>
              Optional at registration. Complete before the final quotation or invoice.
            </p>
            <div className="dgrid2" style={{ marginTop: 8 }}>
              <label>Billing address
                <textarea rows={2} value={details.billingAddress} onChange={e => updateDetail('billingAddress', e.target.value)} placeholder="Add billing address" />
              </label>
              <label>Shipping address
                <textarea rows={2} value={details.shippingAddress} onChange={e => updateDetail('shippingAddress', e.target.value)} placeholder="Add shipping address" />
              </label>
              <label>Shipping pincode
                <input value={details.shippingPincode} onChange={e => updateDetail('shippingPincode', e.target.value)} placeholder="e.g. 440001" inputMode="numeric" />
              </label>
              <label>GSTIN
                <input value={details.gstin} onChange={e => updateDetail('gstin', e.target.value.toUpperCase())} placeholder="Add GSTIN" />
              </label>
            </div>
            <div className="toolbar" style={{ marginTop: 8, marginBottom: 0 }}>
              <button type="button" onClick={saveCustomerDetails} disabled={detailSaved}>Save customer details</button>
              {detailSaved && <span className="lead-decision-saved">Saved just now</span>}
            </div>
            {!isAdminRole(store.role) && <p className="hint">Opportunity values save immediately. Updating the shared customer master requires AH approval.</p>}
          </>
        ) : (
          <p className="hint">{opp.sellTo} is not in the customer master yet — treated as a new (Blue) customer.</p>
        )}
        {opp.customerStatus === 'Blue' && (
          opp.leadVerification?.status === 'Verified'
            ? null
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
              <b>{opp.leadVerification.type === 'KYC' ? 'KYC' : opp.leadVerification.type === 'Payment' ? 'Payment' : 'Verification'}</b>
              {' '}<Chip tone="state-Accepted">Verified</Chip>
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
        {customer && !canVerify && <p className="hint">Only AH can verify these documents.</p>}
        {customer && canVerify && <button type="button" disabled={!canVerify || !!busy || items.every(k => k.state === 'Verified')} onClick={simulateAllKycDone}>
          <Icon name="bot" size={12} /> Simulate all KYC done
        </button>}
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
                <span className="kyc-upload-menu" ref={menuFor === k.name ? menuRef : null}>
                  <button type="button" disabled={!customer || !!busy} onClick={event => { event.stopPropagation(); setMenuFor(menuFor === k.name ? '' : k.name) }}
                    title="Download a template or attach the document">
                    <Icon name="upload" size={12} /> {busy === k.name ? 'Uploading…' : k.file ? 'Replace…' : 'Upload…'}
                  </button>
                  {menuFor === k.name && customer && (
                    <span className="kyc-upload-menu-list" role="menu">
                      <button type="button" role="menuitem" onClick={() => { downloadKycTemplate(customer.name, opp.id, k.name); setMenuFor('') }}><Icon name="download" size={12} /> Download template</button>
                      <button type="button" role="menuitem" onClick={() => { pick(k.name); setMenuFor('') }}><Icon name="upload" size={12} /> Upload document</button>
                      <button type="button" role="menuitem" onClick={() => { setMenuFor(''); setState(k.name, 'Verified', undefined, 'simulated') }}><Icon name="bot" size={12} /> Simulate verification</button>
                    </span>
                  )}
                </span>
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
            Upload attaches the real document, makes it previewable, and files it under the opportunity's KYC folder.
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

// Opportunity Details fields a clarification can be linked to — restricted to
// plain string fields a free-text answer can be written into directly. owner
// (a role key), valueK (numeric, stored in thousands), product (multi-select)
// and rfqDate (date input) need type-specific handling this doesn't cover.
const OPP_FIELD_OPTIONS = [
  ['', '— none —'],
  ['oppName', 'Opportunity Name/Description'],
  ['rfqNumber', 'RFQ Number'],
  ['sellTo', 'Sell To Customer'],
  ['category', 'Category'],
  ['location', 'Location'],
  ['customerStatus', 'Customer Status'],
  ['eucName', 'EUC Name'],
  ['eucLocation', 'EUC Location'],
  ['oppType', 'Opp Type'],
  ['bu', 'BU'],
  ['segment', 'Segment'],
  ['solution', 'Solution'],
  ['contactPerson', 'Contact Person'],
  ['contactPhone', 'Contact Phone'],
]

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

const clarTone = s => (s === 'Answered' ? 'state-Accepted' : ['Sent', 'Needs review'].includes(s) ? 'state-Review' : 'grey')

const deviationClarification = term => ({
  category: 'Commercial',
  gap: `${term.term || 'Commercial'} deviation requires customer confirmation`,
  q: `Please confirm your acceptance of the proposed ${String(term.term || 'commercial').toLowerCase()} term: ${term.ourResponse || 'the term stated in our proposal'}.`,
  evidence: 'Proposal deviations',
})

function ClarificationsTab({ opp }) {
  const store = useStore()
  const rows = store.clarifications.filter(c => c.oppId === opp.id)
  // Sent questions are still waiting for the customer's reply. Only answered
  // questions should be excluded from the single-reply update flow.
  const open = rows.filter(c => c.status !== 'Answered')
  const [draftOpen, setDraftOpen] = useState(false)
  const [draft, setDraft] = useState(null)
  const [sentOk, setSentOk] = useState(false)
  const [sendErr, setSendErr] = useState('')
  const [busy, setBusy] = useState('') // '' | 'suggest' | 'draft'
  const [answerFor, setAnswerFor] = useState(null)
  const [answerForm, setAnswerForm] = useState({ response: '', answerSource: 'Customer', receivedAt: '' })
  const [answerFiles, setAnswerFiles] = useState([])
  const [answerErr, setAnswerErr] = useState('')
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyForm, setReplyForm] = useState({ from: '', subject: '', receivedAt: new Date().toISOString().slice(0, 10), body: '' })
  const [replyFiles, setReplyFiles] = useState([])
  const [replyErr, setReplyErr] = useState('')
  const [replyOk, setReplyOk] = useState('')

  // Gemini proposes gap-specific questions; the canned per-route list is the
  // fallback whenever the AI is unavailable (see src/ai.js).
  const suggest = async () => {
    setBusy('suggest')
    const proposal = store.getProposal(opp.id)
    const deviations = (proposal.terms || []).filter(t => t.status === 'Deviation')
    const existingQuestions = rows.map(c => c.q)
    const ai = await runJson('clarification.suggest', {
      oppName: opp.oppName, sellTo: opp.sellTo, route: opp.route, segment: opp.segment,
      eucName: opp.eucName, location: opp.location, remarks: opp.remarks,
      lines: (proposal.lines || []).map(l => ({ pn: l.pn, desc: l.desc, qty: l.qty })),
      deviations: deviations.map(t => ({ term: t.term, customerAsk: t.customerAsk, ourResponse: t.ourResponse })),
      existing: existingQuestions,
    }, { fallback: store.config?.aiModel?.provider === 'Built-in fallback' })
    setBusy('')
    const due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    const targeted = deviations.map(deviationClarification)
      .filter(row => !existingQuestions.some(q => q.toLowerCase() === row.q.toLowerCase()))
    const aiRows = (ai?.rows || []).filter(row => !existingQuestions.some(q => q.toLowerCase() === String(row.q || '').toLowerCase()))
    const fallbackRows = targeted.length ? targeted : (CLAR_SUGGESTIONS[opp.route] || CLAR_SUGGESTIONS.Project)
    const suggestions = [...targeted, ...aiRows.filter(row => !targeted.some(item => item.q === row.q))]
    const selected = (suggestions.length ? suggestions : fallbackRows).slice(0, 6)
    for (const s of selected) {
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
      `${displayRole(opp.owner)}`,
      MODAE_COMPANY.name,
    ].join('\n')
  }

  const openDraft = async () => {
    setBusy('draft')
    const text = await runText('email.clarification', {
      oppName: opp.oppName, sellTo: opp.sellTo, contactPerson: opp.contactPerson,
      route: opp.route, questions: open.map(c => c.q),
      senderName: displayRole(opp.owner),
    })
    setBusy('')
    const customer = (store.customers || []).find(c => c.id === opp.sellTo || c.name === opp.sellTo)
    const sender = clarificationSender({ assignedOwner: opp.owner }, store.users, store.config)
    setDraft({
      from: sender.address,
      to: opp.contactEmail || customer?.email || '',
      cc: sender.cc,
      subject: `Clarifications — ${opp.oppName}`,
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

  const openCustomerReply = () => {
    setReplyForm({ from: '', subject: '', receivedAt: new Date().toISOString().slice(0, 10), body: '' })
    setReplyFiles([])
    setReplyErr('')
    setReplyOk('')
    setReplyOpen(true)
  }

  const saveCustomerReply = async () => {
    if (!replyForm.body.trim() && !replyFiles.length) {
      setReplyErr('Paste the customer reply or attach the email/file first.')
      return
    }
    setBusy('reply')
    setReplyErr('')
    const attachments = []
    const attachmentMeta = []
    for (const file of replyFiles) {
      let text = ''
      try { text = (await extractDocText(file))?.text || '' } catch (err) { text = `Could not extract text: ${err?.message || String(err)}` }
      try {
        const rec = await uploadOppFile(opp, 'Customer Specs', file)
        store.addFile(opp.id, 'Customer Specs', rec)
        attachmentMeta.push({ ...rec, folder: 'Customer Specs' })
      } catch (err) {
        attachmentMeta.push({ name: file.name, date: replyForm.receivedAt, size: fmtSize(file.size), folder: 'Customer Specs', cloud: false, error: err?.message || String(err) })
      }
      attachments.push({ name: file.name, text })
    }
    const aiResult = await runTaskResult('clarification.answer', {
      oppName: opp.oppName,
      customer: opp.sellTo,
      from: replyForm.from,
      subject: replyForm.subject,
      receivedAt: replyForm.receivedAt,
      body: replyForm.body,
      attachments,
      questions: open.map(c => ({ id: c.id, question: c.q, category: c.category, gap: c.gap })),
    }, { fallback: store.config?.aiModel?.provider === 'Built-in fallback' })
    // runTaskResult returns the transport envelope; the matcher rows are in
    // its nested data payload (the same shape consumed by runJson).
    const ai = aiResult?.data?.data
    store.addCommunication(opp.id, {
      from: replyForm.from,
      subject: replyForm.subject || `Customer reply — ${opp.oppName}`,
      body: replyForm.body,
      attachmentNames: attachmentMeta.map(f => f.name),
      kind: 'clarification-response',
    })
    const byId = new Map(open.map(c => [c.id, c]))
    const matches = (ai?.rows || []).filter(row => byId.has(row.id) && ['Answered', 'Needs review'].includes(row.status) && (String(row.response || '').trim() || String(row.missing || '').trim()))
    for (const row of matches) {
      store.answerClarification(row.id, {
        response: String(row.response).trim(),
        answerSource: 'Customer',
        answeredAt: replyForm.receivedAt,
        attachments: attachmentMeta,
        evidence: row.evidence,
        aiConfidence: row.confidence,
        status: row.status,
        missing: String(row.missing || '').trim(),
      })
    }
    const answered = matches.filter(row => row.status === 'Answered').length
    const needsReview = matches.filter(row => row.status === 'Needs review').length
    const remaining = Math.max(0, open.length - answered - needsReview)
    setBusy('')
    setReplyOpen(false)
    setReplyFiles([])
    setReplyOk(matches.length
      ? `AI checked the reply: ${answered} answered${needsReview ? `, ${needsReview} need review` : ''}${remaining ? `, ${remaining} unanswered` : ''}. Customer reply saved.`
      : ai
        ? 'AI checked the reply but found no answer for the open questions. Customer reply saved; use “Update information” to assign answers manually.'
        : `Customer reply saved, but AI could not check it (${aiResult?.error || 'AI connection unavailable'}). Use “Update information” to assign answers manually.`)
  }

  const saveAnswer = async () => {
    if (!answerFor) return
    if (!answerForm.response.trim()) { setAnswerErr('Add the missing information received before marking this resolved.'); return }
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
          <Icon name="sparkles" size={13} /> {busy === 'suggest' ? 'Thinking…' : 'AI: suggest questions'}
        </button>
        <button onClick={openDraft} disabled={!open.length || !!busy}
          title={open.length ? '' : 'No open questions to draft from'}>
          <Icon name="mail" size={13} /> {busy === 'draft' ? 'Drafting…' : 'AI: draft email'}
        </button>
        <button onClick={openCustomerReply} disabled={!open.length || !!busy}
          title={open.length ? 'Paste one customer reply and attach supporting files' : 'No open questions'}>
          <Icon name="upload" size={13} /> Update information
        </button>
        <span className="spacer" />
      </div>
      {sentOk && <div className="okbox">Clarification email sent and logged in Communications.</div>}
      {replyOk && <div className="okbox">{replyOk}</div>}
      <div className="sheet-wrap">
        <table className="sheet">
          <thead><tr><th>ID</th><th>Category</th><th>Gap / evidence</th><th>Question</th><th>Owner</th><th>Audience</th><th>Due</th><th>Status</th><th>Updates field</th><th></th></tr></thead>
          <tbody>
            {rows.map(c => (
              <tr key={c.id}>
                <td>{c.id}</td>
                <td>{c.category}</td>
                <td>{c.gap}<div className="hint">{c.evidence}</div></td>
                <td>{c.q}{(c.response || c.missing) && <div className={c.status === 'Needs review' ? 'warnbox' : 'okbox'}>{c.response && <>Response: {c.response}</>}{c.missing && <div className="hint"><b>Still needed:</b> {c.missing}</div>}<div className="hint">From {c.answerSource || c.audience || 'source'}{c.answeredAt ? ` · ${ddMmmYY(c.answeredAt)}` : ''}</div>{c.answerEvidence && <div className="hint">Evidence: {c.answerEvidence}</div>}{(c.attachments || []).map(f => <div key={f.name} className="hint"><Icon name="fileText" size={11} /> {f.name}</div>)}</div>}</td>
                <td>{displayRole(c.owner)}</td>
                <td>{c.audience}</td>
                <td>{ddMmmYY(c.due)}</td>
                <td><Chip tone={clarTone(c.status)}>{c.status}</Chip></td>
                <td>
                  <select value={c.field || ''} disabled={c.status === 'Answered'}
                    title="Once answered, apply this response straight to that Opportunity Details field"
                    onChange={e => store.updateClarification(c.id, { field: e.target.value })}>
                    {OPP_FIELD_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </td>
                <td>
                  <button onClick={() => openAnswer(c)}>{c.status === 'Answered' ? 'Edit information' : 'Update information'}</button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={10} className="hint">No clarifications yet — let the AI suggest questions from detected gaps.</td></tr>}
          </tbody>
        </table>
      </div>

      {replyOpen && (
        <Modal title="Add customer reply" onClose={() => setReplyOpen(false)} wide>
          {replyErr && <ErrBox>{replyErr}</ErrBox>}
          <div className="clar-mail-form">
            <label className="afield">From
              <input value={replyForm.from} onChange={e => setReplyForm({ ...replyForm, from: e.target.value })} placeholder="customer@company.com" autoFocus />
            </label>
            <label className="afield">Subject
              <input value={replyForm.subject} onChange={e => setReplyForm({ ...replyForm, subject: e.target.value })} placeholder="Customer reply subject" />
            </label>
            <label className="afield">Received date
              <input type="date" value={replyForm.receivedAt} onChange={e => setReplyForm({ ...replyForm, receivedAt: e.target.value })} />
            </label>
            <label className="afield">Reply message
              <textarea rows={9} value={replyForm.body} onChange={e => setReplyForm({ ...replyForm, body: e.target.value })} placeholder="Paste the customer’s complete reply here." />
            </label>
            <label className="afield">Attach email or supporting file
              <input type="file" multiple onChange={e => setReplyFiles(Array.from(e.target.files || []))} />
            </label>
            {!!replyFiles.length && <div className="hint">{replyFiles.length} file(s) will be saved in Customer Specs and read by AI. <button type="button" onClick={() => setReplyFiles([])}>Cancel upload</button></div>}
          </div>
          <div className="hint" style={{ marginTop: 8 }}>AI will answer only the open questions supported by this reply. Anything unanswered will remain open.</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button onClick={() => setReplyOpen(false)}>Cancel</button>
            <button className="primary" disabled={busy === 'reply'} onClick={saveCustomerReply}><Icon name="check" size={13} /> {busy === 'reply' ? 'Reading reply…' : 'Save and match answers'}</button>
          </div>
        </Modal>
      )}

      {answerFor && (
        <Modal title={`Update information - ${answerFor.id}`} onClose={() => setAnswerFor(null)} wide>
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
            <label className="afield">Information received
              <textarea rows={8} value={answerForm.response} onChange={e => setAnswerForm({ ...answerForm, response: e.target.value })} placeholder="Paste or summarise the missing information received for this request." autoFocus />
            </label>
            <label className="afield">Files / mail evidence
              <input type="file" multiple onChange={e => setAnswerFiles(Array.from(e.target.files || []))} />
            </label>
            {!!answerFiles.length && <div className="hint">{answerFiles.length} file(s) selected for Customer Specs. <button type="button" onClick={() => setAnswerFiles([])}>Cancel upload</button></div>}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={() => setAnswerFor(null)}>Cancel</button>
            <button className="primary" disabled={busy === 'answer'} onClick={saveAnswer}><Icon name="check" size={13} /> {busy === 'answer' ? 'Saving...' : 'Save information'}</button>
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
          <WarnBox>Human review required before sending — verify every question and the addressee.</WarnBox>
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
  const proposal = store.getProposal(opp.id)
  const sourcingLines = store.sparesLines.filter(l => l.oppId === opp.id && !isPlaceholderSparesLine(l))
  // Keep manufacturer RFQs aligned with the customer-facing proposal BoQ.
  // Older sourcing rows can retain placeholder text or a default quantity of
  // one after a lead import, while the approved proposal has the corrected
  // catalogue description and quantity in `common`.
  const lines = sourcingLines.map(line => {
    const bomLine = (proposal.bom || []).find(b => !isSparesSupportRow(b)
      && String(b.pn || b.custRef || '').trim().toLowerCase() === String(line.pn || line.custRef || '').trim().toLowerCase())
    return {
      ...line,
      desc: catalogueDescriptionForLine(line, store.priceLists) || bomLine?.desc || line.desc,
      qty: Number(bomLine?.common) > 0 ? Number(bomLine.common) : Number(line.qty) || 1,
    }
  })
  const quotes = (store.vendorQuotes || []).filter(q => q.oppId === opp.id)
  const superseded = lines.some(l => String(l.match).toLowerCase().includes('superseded'))
  const usingApprovedPriceList = lines.length > 0 && lines.every(l => {
    const source = String(l.priceList || '')
    return l.priceState !== 'Expired' && source && source !== 'Manual entry' && source !== 'Ad-hoc'
  })
  const [rfqOpen, setRfqOpen] = useState(false)
  const [rfqForm, setRfqForm] = useState({ manufacturer: '', to: '', cc: '', subject: '', body: '' })
  const [rfqErr, setRfqErr] = useState('')
  const [rfqSending, setRfqSending] = useState(false)
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
    `${displayRole(opp.owner)}`,
    MODAE_COMPANY.name,
  ].join('\n')

  const openRfq = () => {
    if (opp.route === 'Spares') return
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
      to: displayRole(opp.owner), subject: `Indicative quote ${result.quoteRef} - ${opp.oppName}`,
      body: result.notes, kind: 'vendor-response', simulated: true,
    })
    store.recordAiAction(opp.id, {
      provider: store.config?.aiModel?.provider,
      model: store.config?.aiModel?.model,
      action: 'vendor.quote', result,
    })
    setVendorSimBusy(false)
  }

  const sendRfq = async () => {
    const to = rfqForm.to.trim()
    const from = store.config?.gmailAccount || 'sales@mod-ae.com'
    if (!recipientsValid(to)) { setRfqErr('Add a valid manufacturer email address before sending.'); return }
    if (rfqForm.cc.trim() && !recipientsValid(rfqForm.cc)) {
      setRfqErr('Check the CC email address before sending.')
      return
    }
    setRfqSending(true)
    setRfqErr('')
    try {
      // The shared mail endpoint requires an attachment. A plain-text copy of
      // the reviewed RFQ keeps this vendor request auditable without inventing
      // a customer proposal workbook attachment.
      const bytes = new TextEncoder().encode(rfqForm.body)
      let binary = ''
      bytes.forEach(byte => { binary += String.fromCharCode(byte) })
      const response = await fetch('/api/send-proposal-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          oppId: opp.id,
          from,
          to,
          cc: rfqForm.cc,
          subject: rfqForm.subject,
          body: rfqForm.body,
          attachments: [{
            filename: `${opp.id}_Manufacturer_RFQ.txt`,
            mimeType: 'text/plain',
            contentBase64: btoa(binary),
          }],
        }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || `The email service is unreachable (HTTP ${response.status}) — check the server's Gmail configuration`)
      }
      store.addVendorQuote(opp.id, {
        manufacturer: rfqForm.manufacturer.trim() || to,
        email: to, cc: rfqForm.cc.trim(), subject: rfqForm.subject,
        body: rfqForm.body, lineIds: lines.map(l => l.id), status: 'Sent',
        sentAt: new Date().toISOString(), messageId: result.messageId,
        attachmentNames: [`${opp.id}_Manufacturer_RFQ.txt`],
      })
      store.addCommunication(opp.id, {
        to, cc: rfqForm.cc.trim(), subject: rfqForm.subject, body: rfqForm.body,
        kind: 'vendor-rfq', status: 'sent', messageId: result.messageId,
        attachmentNames: [`${opp.id}_Manufacturer_RFQ.txt`],
      })
      setRfqOpen(false)
    } catch (error) {
      setRfqErr(error?.message || 'RFQ email could not be sent')
    } finally {
      setRfqSending(false)
    }
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
          <button onClick={openRfq} disabled={opp.route === 'Spares'} title={opp.route === 'Spares' ? 'Manufacturer RFQ is not used for Spares' : 'Request an exceptional vendor price'}>
            <Icon name="mail" size={13} /> Request exceptional vendor price
          </button>
          <button className="primary" onClick={() => goTab('proposal')}>
            <Icon name="arrowRight" size={13} /> Open proposal workbench
          </button>
        </div>
        <p className="hint">{opp.route === 'Spares'
          ? 'Manufacturer RFQ is disabled for Spares. Use the approved price list or raise a pricing exception.'
          : 'Approved price lists are used first. Request a vendor price only when a current approved source is unavailable.'}</p>
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
        {!quotes.length && (
          <p className="hint">
            {usingApprovedPriceList
              ? 'Using approved price list — no manufacturer RFQ required.'
              : 'No manufacturer RFQs sent yet.'}
          </p>
        )}
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
          <WarnBox>Review the message before sending. The RFQ will be sent through the configured Gmail account and logged against this opportunity after Gmail accepts it.</WarnBox>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={() => setRfqOpen(false)}>Cancel</button>
            <button className="primary" onClick={sendRfq} disabled={rfqSending}><Icon name="send" size={13} /> {rfqSending ? 'Sending…' : 'Send RFQ email'}</button>
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
            {!!quoteFiles.length && <div className="hint">{quoteFiles.length} file(s) selected for Partner Docs. <button type="button" onClick={() => setQuoteFiles([])}>Cancel upload</button></div>}
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
function FollowUpTab({ opp, goTab }) {
  return <FollowUpPane opp={opp} onRevision={() => goTab('sourcing')} />
}

function ProposalTab({ opp, goTab }) {
  const [sub, setSub] = useState('edit-sheet')
  const openBuilder = () => setSub('builder')
  // Diagram 02 §3 is the Brownfield lane only — Greenfield runs Phase-1
  // activities and Service runs the §4 survey path instead.
  const SUBS = [['edit-sheet', 'Edit proposal']]
  return (
    <div className="proposal-tab-shell">
      {sub === 'workbench' && (
        opp.route === 'Spares' ? <WbSpares opp={opp} openBuilder={openBuilder} />
        : opp.route === 'Service' ? <WbService opp={opp} openBuilder={openBuilder} />
        : <WbProject opp={opp} openBuilder={openBuilder} />
      )}
      {sub === 'builder' && (
        <>
          <PropBuilder opp={opp} onRevision={() => goTab('sourcing')} />
          <div className="builder-divider" />
          <Proposal oppId={opp.id} embedded initialTab="Cover Letter" />
        </>
      )}
      {sub === 'edit-sheet' && <Proposal oppId={opp.id} embedded initialTab="Edit Sheet" />}
      {sub === 'followup' && <FollowUpPane opp={opp} onRevision={() => goTab('sourcing')} />}
    </div>
  )
}

// The real customer document, not a summary of it. Same component, same props
// and same data the Builder's "Preview proposal" modal and the printer use — a
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
          Customer-facing document · Rev-{p.revision} · Read-only preview
          {!priced && ' · prices hidden'}
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

function FollowUpPane({ opp, onRevision }) {
  const store = useStore()
  const p = store.getProposal(opp.id)
  const revisions = p.revisions || []
  const commsRows = (store.communications?.[opp.id] || []).slice().sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0))
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyFrom, setReplyFrom] = useState('')
  const [replySubject, setReplySubject] = useState('')
  const [replyBody, setReplyBody] = useState('')
  const [replyErr, setReplyErr] = useState('')
  const [replyReview, setReplyReview] = useState(null)
  const [replyAction, setReplyAction] = useState('')
  const [replyRevisionType, setReplyRevisionType] = useState(REVISION_TYPES[0].id)
  const logReply = async () => {
    if (!replyBody.trim()) { setReplyErr('Paste the customer reply body.'); return }
    const communicationId = `CM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const body = replyBody.trim()
    const subject = replySubject.trim() || `Re: ${opp.oppName}`
    store.addCommunication(opp.id, {
      id: communicationId,
      dir: 'In', kind: 'clarification-response',
      from: replyFrom.trim() || opp.contactPerson || opp.sellTo,
      subject,
      body,
    })
    setReplyOpen(false); setReplyFrom(''); setReplySubject(''); setReplyBody(''); setReplyErr('')
    setReplyReview({ id: communicationId, status: 'analyzing', subject, body })
    const classification = await runJson('reply.classify', {
      oppId: opp.id,
      oppName: opp.oppName,
      customer: opp.sellTo,
      revision: p?.revision || '00',
      subject,
      body,
    })
    const valid = classification && ['accepted', 'rejected', 'revision', 'follow-up'].includes(classification.outcome)
      && Number.isFinite(Number(classification.confidence))
    const result = valid ? {
      ...classification,
      confidence: Math.max(0, Math.min(100, Number(classification.confidence))),
      revisionType: classification.revisionType === 'None' ? '' : classification.revisionType,
    } : null
    store.updateCommunication(opp.id, communicationId, {
      aiClassification: result,
      classificationStatus: result ? (result.confidence >= 75 ? 'review' : 'manual') : 'unavailable',
    }, 'Customer reply classified')
    const suggestedAction = result && result.confidence >= 75
      ? result.outcome === 'accepted' ? '' : result.outcome
      : ''
    setReplyReview({ id: communicationId, status: result ? 'ready' : 'manual', subject, body, classification: result })
    setReplyAction(suggestedAction)
    setReplyRevisionType(result?.revisionType || REVISION_TYPES[0].id)
  }
  const confirmReplyAction = (action, revisionType = '') => {
    const result = replyReview?.classification
    if (!replyReview || replyReview.status === 'analyzing') return
    if (action === 'accepted-won') store.markWon(opp.id, 'Customer acceptance')
    if (action === 'accepted-po') store.setMilestone(opp.id, 'PO Validation', 'Customer accepted proposal — PO required')
    if (action === 'rejected') store.closeLost(opp.id, 'Others')
    if (action === 'revision') {
      const type = revisionType || result?.revisionType || REVISION_TYPES[0].id
      store.reviseProposal(opp.id, result?.nextStep || result?.summary || 'Customer requested a proposal change', type)
      onRevision?.()
    }
    if (action === 'follow-up') store.setMilestone(opp.id, 'Follow-up', result?.nextStep || 'Customer reply requires follow-up')
    store.updateCommunication(opp.id, replyReview.id, {
      reviewerDecision: action,
      reviewerAt: new Date().toISOString(),
      classificationStatus: 'confirmed',
    }, 'Customer reply action confirmed')
    setReplyReview(null)
    setReplyAction('')
  }
  const [note, setNote] = useState('')
  const [revType, setRevType] = useState(REVISION_TYPES[0].id)
  const [fuOpen, setFuOpen] = useState(false)
  const [fuDraft, setFuDraft] = useState('')
  const [fuBusy, setFuBusy] = useState(false)
  const [fuSent, setFuSent] = useState(false)
  const [escOpen, setEscOpen] = useState(false)
  // Diagram 02 §7 "Opportunity Lost — Capture Loss Reason" and §8 competitor
  // tracking. Both close-out branches live beside the follow-up loop they end.
  const [lossReason, setLossReason] = useState('')
  const [lossCompetitor, setLossCompetitor] = useState('')
  const [compName, setCompName] = useState('')
  const [compNote, setCompNote] = useState('')

  const competitors = (store.competitors || []).filter(c => c.oppId === opp.id)
  const validityDays = opp.validityDays || 30
  const age = opp.proposalDate ? ageDays(opp.proposalDate) : null
  const left = age == null ? null : validityDays - age

  // Diagram 02 §7 has one revision path, not two: every revision is typed, is
  // routed back to the B-step that owns it, and re-opens the §5 approval. This
  // used to write an untyped R-numbered entry that did none of that, so the
  // same act had two different consequences depending on which panel raised it.
  const addRevision = () => {
    if (!note.trim()) return
    store.reviseProposal(opp.id, note.trim(), revType)
    onRevision?.()
    setNote('')
    setRevType(REVISION_TYPES[0].id)
  }

  const templateFu = () => [
    'Dear Sir,',
    '',
    `Trusting our proposal for ${opp.oppName} (${opp.id}) reached you well. We would appreciate your feedback on the technical and commercial aspects, and are happy to arrange a discussion at your convenience.`,
    '',
    `The offer remains valid ${left != null && left > 0 ? `for ${left} more day(s)` : `for ${validityDays} days from submission`}.`,
    '',
    'Best regards,',
    `${displayRole(opp.owner)}`,
  ].join('\n')

  const openFu = async () => {
    setFuBusy(true)
    const text = await runText('email.followup', {
      oppName: opp.oppName, sellTo: opp.sellTo, contactPerson: opp.contactPerson,
      quoteRef: opp.id, sentOn: opp.proposalDate, ageDays: age,
      validity: left != null && left > 0 ? `${left} of ${validityDays} days remaining` : `${validityDays} days from submission`,
      history: (store.communications?.[opp.id] || []).map(c => `${c.ts?.slice(0, 10)} ${c.kind} → ${c.to}: ${c.subject}`),
      senderName: displayRole(opp.owner),
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
    <div className="ana-grid follow-up-grid">
      <div className="ana-card c-6 follow-up-panel">
        <SubmissionPanel opp={opp} />
      </div>
      <div className="ana-card c-6 follow-up-panel">
        <div className="ana-title">Customer communications</div>
        {commsRows.map((c, i) => (
          <details key={c.id || `${c.ts}-${i}`} className="communication-disclosure">
            <summary className="communication-summary">
              <Icon name="mail" size={13} />
              <span className="communication-summary-copy">
                <b>{c.subject}</b>
                <span className="hint">{formatKind(c.kind)} · {c.ts ? formatISTDateTime(c.ts) : '—'}</span>
              </span>
              {c.status && <Chip tone={c.status === 'sent' ? 'Green' : 'Amber'}>{formatCommunicationStatus(c.status)}</Chip>}
            </summary>
            <div className="communication-expanded">
              <div className="hint">
                {c.from && <>From: {c.from} · </>}
                To: {c.to || '—'}
                {c.cc && <> · CC: {c.cc}</>}
              </div>
              {c.body && <div className="communication-expanded-body">{c.body}</div>}
              {(c.attachmentNames || []).length > 0 && (
                <div className="communication-expanded-attachments">
                  <b>Attachments:</b> {c.attachmentNames.join(' · ')}
                </div>
              )}
            </div>
          </details>
        ))}
        {!commsRows.length && <p className="hint">No communications logged yet.</p>}
        {!replyOpen ? (
          <button onClick={() => setReplyOpen(true)} style={{ marginTop: 8 }}><Icon name="mail" size={13} /> Log customer reply</button>
        ) : (
          <div className="drawer-form">
            <b>Log customer reply</b>
            <label style={{ marginTop: 6 }}>From</label>
            <input value={replyFrom} onChange={e => setReplyFrom(e.target.value)} placeholder={opp.contactPerson || opp.sellTo} />
            <label style={{ marginTop: 6 }}>Subject</label>
            <input value={replySubject} onChange={e => setReplySubject(e.target.value)} placeholder={`Re: ${opp.oppName}`} />
            <label style={{ marginTop: 6 }}>Reply body</label>
            <textarea rows={5} value={replyBody} onChange={e => setReplyBody(e.target.value)} placeholder="Paste the customer's reply" />
            {replyErr && <ErrBox>{replyErr}</ErrBox>}
            <div className="toolbar" style={{ margin: 0 }}>
              <button className="primary" type="button" onClick={logReply}>Save reply</button>
              <button type="button" onClick={() => { setReplyOpen(false); setReplyErr('') }}>Cancel</button>
            </div>
          </div>
        )}
        {replyReview && (
          <div className="drawer-form" style={{ marginTop: 12, borderLeft: '3px solid var(--accent, #e33)' }}>
            <b>{replyReview.status === 'analyzing' ? 'Reading customer reply…' : 'Review suggested next action'}</b>
            {replyReview.status === 'analyzing' ? (
              <p className="hint">The reply was saved. AI is checking whether the customer accepted, rejected, requested a change, or needs follow-up.</p>
            ) : replyReview.classification ? (
              <>
                <div className="check-row" style={{ marginTop: 8 }}>
                  <Chip tone="state-Review">{replyReview.classification.outcome}</Chip>
                  <Chip tone={replyReview.classification.confidence >= 75 ? 'state-Accepted' : 'state-Review'}>
                    {replyReview.classification.confidence}% confidence
                  </Chip>
                </div>
                <p style={{ margin: '8px 0 4px' }}>{replyReview.classification.summary}</p>
                <p className="hint" style={{ margin: '4px 0' }}><b>Next step:</b> {replyReview.classification.nextStep}</p>
                <p className="hint" style={{ margin: '4px 0' }}><b>Evidence:</b> {replyReview.classification.evidence}</p>
                {replyReview.classification.confidence < 75 && (
                  <WarnBox>Confidence is below the review threshold. Select the correct route manually.</WarnBox>
                )}
              </>
            ) : (
              <WarnBox>AI could not classify this reply. Choose the next route manually.</WarnBox>
            )}
            {replyReview.status !== 'analyzing' && (
              <>
                <label style={{ marginTop: 8 }}>Confirmed route</label>
                <select value={replyAction} onChange={e => setReplyAction(e.target.value)}>
                  <option value="">Select a route</option>
                  <option value="follow-up">Keep open for follow-up</option>
                  <option value="revision">Open a revision</option>
                  <option value="accepted-po">Accepted — move to PO Validation</option>
                  <option value="accepted-won">Accepted — mark Won</option>
                  <option value="rejected">Rejected — close as lost</option>
                </select>
                {replyAction === 'revision' && (
                  <select value={replyRevisionType} onChange={e => setReplyRevisionType(e.target.value)} style={{ marginTop: 6 }}>
                    {REVISION_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
                  </select>
                )}
                {replyAction === 'rejected' && <p className="hint">This will close the opportunity as Lost with reason “Others”.</p>}
                <div className="toolbar" style={{ margin: '8px 0 0' }}>
                  <button className="primary" type="button" disabled={!replyAction}
                    onClick={() => confirmReplyAction(replyAction, replyRevisionType)}>
                    <Icon name="check" size={13} /> Confirm action
                  </button>
                  <button type="button" onClick={() => { setReplyReview(null); setReplyAction('') }}>Dismiss</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <div className="ana-card c-6 follow-up-panel">
        <div className="ana-title">Revisions</div>
        {revisions.map((r, i) => (
          <div key={i} className="check-row">
            <b>{r.rev}</b><span>{r.note}</span>
            <Chip tone="grey">{r.status}</Chip>
            {r.type && <Chip tone="state-Review">{r.type} revision</Chip>}
            <span className="hint" style={{ marginLeft: 'auto' }}>{ddMmmYY(r.when)} · {r.by}</span>
          </div>
        ))}
        {!revisions.length && <p className="hint">No revisions recorded yet.</p>}
        <div className="follow-up-control-row revision-control-row">
          <select value={revType} onChange={e => setRevType(e.target.value)}>
            {REVISION_TYPES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <input placeholder="Reason for revision (logged)" value={note} style={{ flex: 1, minWidth: 160 }}
            onChange={e => setNote(e.target.value)} />
          <button disabled={!note.trim()} onClick={addRevision}><Icon name="plus" size={13} /> Add revision</button>
        </div>
        <p className="hint" style={{ marginTop: 4 }}>
          The revised quote must pass the approval checks again before it can be sent.
        </p>
      </div>
      <div className="ana-card c-6 follow-up-panel">
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
        <div className="follow-up-control-row">
          <button onClick={openFu} disabled={fuBusy}>
            <Icon name="sparkles" size={13} /> {fuBusy ? 'Drafting…' : 'AI: draft follow-up'}
          </button>
          <button onClick={() => setEscOpen(true)}><Icon name="sparkles" size={13} /> AI: escalation suggestion</button>
        </div>
        {fuSent && <div className="okbox">Follow-up logged in Communications.</div>}
        {escOpen && (
          <div className="okbox">
            Post-quotation intelligence: {age != null ? `submitted ${age} day(s) ago with no recorded customer response` : 'proposal not yet submitted'}.
            Suggest a courtesy call by {displayRole(opp.owner)} this week, and escalate to LJS if silent past day 14 of the follow-up schedule.
          </div>
        )}
      </div>

      <div className="ana-card c-6 follow-up-panel">
        <div className="ana-title">Close-out</div>
        {opp.status === 'Closed' ? (
          <div className={opp.stage === 'Won' ? 'okbox' : 'warnbox'}>
            Closed as <b>{opp.stage}</b>{opp.closedReason ? ` — ${opp.closedReason}` : ''}
          </div>
        ) : (
          <>
            <p className="hint">
              A lost opportunity always carries a reason — it is what the win/loss analytics read.
            </p>
            <div className="follow-up-form-stack">
              <select value={lossReason} onChange={e => setLossReason(e.target.value)}>
                <option value="">— loss reason (required) —</option>
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

      <div className="ana-card c-6 follow-up-panel">
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
        <div className="follow-up-control-row competitor-control-row">
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
            <button className="primary" onClick={sendFu}><Icon name="send" size={13} /> Log follow-up</button>
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
  const canCompleteCondition = a => store.role === opp.owner || store.role === a.requestedBy
  return (
    <div>
      {rows.map(a => (
        <div key={a.id} className="form-card" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <b>{a.id}</b>
            <span style={{ fontSize: 12.5 }}>{a.type}</span>
            <span className={`pill ${statusPill(a.status)}`}>{a.status}</span>
            <span className="hint" style={{ marginLeft: 'auto' }}>requested by {displayRole(a.requestedBy)} · {ddMmmYY((a.ts || '').slice(0, 10))}</span>
          </div>
          {(COMMERCIAL_RX.test(a.detail || '') || (a.type === 'Pricing threshold exception' && a.pricingRows?.length > 0)) && !canPriceProposal(store.role) ? (
            <div className="restricted" style={{ fontSize: 12.5, margin: '6px 0' }}>
              <Icon name="lock" size={11} /> Commercial exception — trigger values (GM% / discount / value) visible to approvers and the opportunity owner only.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12.5, margin: '6px 0' }}>{a.detail}</div>
              {a.type === 'Pricing threshold exception' && a.pricingRows?.length > 0 && <div className="approval-pricing-rows">{a.pricingRows.map((row, i) => <div className="approval-pricing-row" key={`${row.label}-${i}`}><b>{row.label}</b>{row.discount > row.discountPct && <span>Discount {row.discount}% <small>(limit {row.discountPct}%)</small></span>}{row.markup > row.markupPct && <span>Markup {row.markup}% <small>(limit {row.markupPct}%)</small></span>}</div>)}</div>}
            </>
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
                <div key={i} className="approval-condition-row">
                  <div className="approval-condition-text">{c.text}</div>
                  <ConditionCompletion
                    approval={a}
                    index={i}
                    condition={c}
                    canComplete={canCompleteCondition(a)}
                    onConfirm={store.confirmCondition}
                  />
                </div>
              ))}
            </div>
          )}
          {!canCompleteCondition(a) && (a.conditions || []).some(c => !c.incorporated) && (
            <div className="hint" style={{ marginTop: 6 }}>The opportunity owner confirms incorporation of open conditions.</div>
          )}
        </div>
      ))}
      {!rows.length && <p className="hint">No approvals raised for this opportunity yet — the builder routes them when needed.</p>}
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
  return { name: entry.fromName || displayRole(opp.owner) || 'ModAE Sales Desk', email: raw }
}

const formatKind = kind => ({
  enquiry: 'Incoming enquiry', 'clarification-response': 'Customer reply',
  clarification: 'Clarification', 'vendor-rfq': 'Manufacturer RFQ',
  'proposal-email': 'Proposal email', submission: 'Proposal submission',
  'follow-up': 'Follow-up', ack: 'Customer acknowledgement',
}[kind] || kind || 'Communication')

const formatCommunicationStatus = status => status === 'sent' ? 'Sent' : status === 'draft' ? 'Draft opened' : 'Logged'

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
      from: q.email, fromName: q.manufacturer, to: displayRole(opp.owner),
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
            <span><b>{c.subject}</b><div className="hint">to {c.to} · {formatISTDateTime(c.ts)}</div></span>
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
                <div className="hint"><CommsName value={sender.name} email={sender.email} /> → <CommsName value={recipient.name} email={recipient.email} /> · {formatISTDateTime(c.ts)}</div>
              </span>
              <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginLeft: 'auto' }}>
                <Chip tone={c.dir === 'In' ? 'Blue' : 'grey'}>{formatKind(c.kind)}</Chip>
                {c.status && <Chip tone={c.status === 'sent' ? 'Green' : 'Amber'}>{formatCommunicationStatus(c.status)}</Chip>}
              </span>
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
                <div><b>Date</b><span>{c.ts ? formatISTDateTime(c.ts) : '—'}</span></div>
                <div><b>Type</b><span>{formatKind(c.kind)}</span></div>
                {c.status && <div><b>Status</b><span>{formatCommunicationStatus(c.status)}</span></div>}
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
              <td style={{ whiteSpace: 'nowrap' }}>{formatISTDateTime(e.ts)}</td>
              <td>{displayRole(e.role)}</td>
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
