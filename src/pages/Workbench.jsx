import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useStore } from '../store.jsx'
import { ROLES, OWNERS, STAGES, PROB_LEVELS, SEGMENTS, PRODUCTS, BUS, SUBFOLDERS, MILESTONES, CLOSE_REASONS, WON_REASONS, REVISION_TYPES, DEFAULT_WORKFLOW, isWorkflowAvailable } from '../seed.js'
import { canPriceProposal, isAdminRole, fmt, ageDays, ddMmmYY, gmailComposeHref, displayRole, displayRoles, displayRoleLabel, formatISTDateTime, productDisplayLabel } from '../utils.js'
import { EMAIL_RE, recipientsValid, splitRecipients } from '../emailValidation.js'
import { APPROVAL_5B, pricingThresholdExceptions, readiness, sparesSourcingBlockers, isBlocked, nextActionWith, transitionBlockers, isClarificationResolved, isClarificationCoveredByAnswer, actionableClarifications, displayClarifications, isClarificationCoveredBySource, releaseVoidReason, serviceOfferCleared } from '../gates.js'
import { COMMERCIAL_RX } from './Approvals.jsx'
import { Chip, ClassChip, AiBadge, MarkWonControl, WarnBox, ErrBox, Modal } from '../ui.jsx'
import { Icon } from '../icons.jsx'
import { productBrandProfiles } from '../branding/modae.js'
import { MODAE_COMPANY } from '../proposalDoc.js'
import { runJson, runTaskResult, runText } from '../ai.js'
import { aiAttachmentPayload } from '../aiAttachments.js'
import { clarificationSender } from '../leadClarification.js'
import { extractCustomerSparesLines } from '../clarificationSparesSync.js'
import WbSpares from '../workbench/WbSpares.jsx'
import WbService from '../workbench/WbService.jsx'
import WbProject from '../workbench/WbProject.jsx'
import BSteps from '../workbench/BSteps.jsx'
import PropBuilder from '../workbench/PropBuilder.jsx'
// The same component the standalone /proposal/:oppId route renders — both write
// through store.saveProposal, so the two views are never out of step.
import Proposal from './Proposal.jsx'
import SubmissionPanel from '../workbench/SubmissionPanel.jsx'
import RateSheetPanel from '../workbench/RateSheetPanel.jsx'
import PoHandover from '../workbench/PoHandover.jsx'
import OpportunityDetailsEditor, { OpportunityDetailsView } from '../OpportunityDetailsEditor.jsx'
import AttachmentViewer from '../AttachmentViewer.jsx'
import { extractDocText } from '../docText.js'
import { extractKycIdentityCandidate, normalizeKycCandidate } from '../kycExtraction.js'
import { kycIdentityKey } from '../kycValidation.js'
import { putFiles } from '../leadBlobs.js'
import { uploadOppFile, fmtSize } from '../filestore.js'
import { isPlaceholderSparesLine } from '../proposal/sparesBoq.js'
import { downloadKycTemplate } from '../kycTemplate.js'
import { leadIdentity, leadFieldValue } from '../leadFieldMapping.js'
import { verificationItem } from '../leadVerification.js'
import OpportunityComingSoon from '../workbench/OpportunityComingSoon.jsx'
import ServiceRequestPanel from '../workbench/ServiceRequestPanel.jsx'
import ServiceScopePanel from '../workbench/ServiceScopePanel.jsx'
import ServiceDecisionPanel from '../workbench/ServiceDecisionPanel.jsx'
import ServiceExecutionPanel from '../workbench/ServiceExecutionPanel.jsx'
import ServiceReportPanel from '../workbench/ServiceReportPanel.jsx'
import ServiceInvoicePanel from '../workbench/ServiceInvoicePanel.jsx'
import { COMMERCIAL_DECISIONS, CUSTOMER_CONFIRMATION_STATUSES, commercialApprovalDetails, isCommercialConfirmationRow, isDeliveryBasisClarification, isLegacyCommercialClarification, needsCommercialApproval, normalizeCommercialTerm, sourceContainsDeliveryRequirement } from '../commercialTerms.js'
import { latestSubmissionForRevision, submissionStatusLabel } from '../submissionStatus.js'
import { prefetchSparesMatches } from '../workbench/sparesMatchCache.js'
import WorkbookPreview from '../proposal/WorkbookPreview.jsx'
import { hasValidatedUploadedWorkbook, validatedWorkbookPreview } from '../proposal/validatedWorkbook.js'

const statusPill = s =>
  s === 'Approved' ? 'Green' : s === 'Rejected' ? 'Red' : s === 'Approved with conditions' ? 'Amber' : 'Blue'

// KYC and commercial approvals are different controls: KYC cannot be waived;
// only the configured amber-fee and red-clearance blockers can request an
// exception.
const canRequestException = blocker => !blocker.approvalType && ['amber-fee', 'red-clearance'].includes(blocker.key)

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
  Registration: 'registration',
  Screening: 'requirement',
  Clarification: 'clarifications',
  Sourcing: 'sourcing',
  Proposal: 'proposal',
  Approval: 'approval',
  'PO Validation': 'po',
  Handover: 'po',
  Submitted: 'overview',
  'Follow-up': 'overview',
}

const WORKFLOW_STEPS = [
  { slug: 'intake', label: 'Intake', tab: 'overview' },
  { slug: 'qualification', label: 'Qualification', tab: 'requirement' },
  { slug: 'customer-kyc', label: 'Customer/KYC', tab: 'customer' },
  { slug: 'registration', label: 'Registration', tab: 'registration' },
  { slug: 'screening', label: 'Screening', tab: 'requirement' },
  { slug: 'clarification', label: 'Clarification', tab: 'clarifications' },
  { slug: 'sourcing', label: 'Sourcing', tab: 'sourcing' },
  { slug: 'proposal', label: 'Proposal', tab: 'proposal' },
  { slug: 'approval', label: 'Approval', tab: 'approval' },
  { slug: 'follow-up', label: 'Follow-up', tab: 'followup' },
]
// Primary opportunity navigation keeps the commercial handoff visible.
const PRIMARY_OPPORTUNITY_TABS = [['proposal', 'Proposal'], ['approval', 'Approval'], ['submitted', 'Submitted']]
// <DetailTabs ariaLabel="Opportunity views" primaryCount={8} showOverflow={false} />
// Lifecycle transitions call moveToMilestone(transition.target, transition.reason.trim()) and open /opp/${opp.id}/approvals when an approval is pending.
// Communications stack <div className="ana-card c-12"><SubmissionPanel opp={opp} /></div><div className="ana-card c-12"><div className="ana-title">Communication log</div>
const hiddenApprovalRequested = false

const WORKFLOW_STEP_BY_SLUG = Object.fromEntries(WORKFLOW_STEPS.map(step => [step.slug, step]))
const SPARES_WORKFLOW_STEPS = [
  { slug: 'intake', label: 'Opportunity Intake', milestone: 'Intake', milestones: ['Intake', 'Registration'], tabs: ['overview', 'registration'], tab: 'overview' },
  { slug: 'customer-kyc', label: 'Customer Verification', milestone: 'Customer/KYC', milestones: ['Customer/KYC'], tab: 'customer' },
  { slug: 'requirement-validation', label: 'Requirement Validation', milestone: 'Screening', milestones: ['Screening', 'Clarification', 'Qualification'], tabs: ['requirement', 'clarifications'], tab: 'requirement-validation' },
  { slug: 'sourcing', label: 'Spares Sourcing', milestone: 'Sourcing', tab: 'sourcing' },
  { slug: 'proposal', label: 'Quotation Preparation', milestone: 'Proposal', tab: 'proposal' },
  { slug: 'approval', label: 'Approval', milestone: 'Approval', tab: 'approval' },
  { slug: 'submitted', label: 'Quotation Submission', milestone: 'Submitted', tab: 'comms' },
  { slug: 'follow-up', label: 'Follow-up & Closure', milestone: 'Follow-up', tab: 'followup' },
]
const SERVICE_WORKFLOW_STEPS = [
  { slug: 'service-enquiry', label: 'Service Request', milestone: 'Qualification', tab: 'requirement', servicePhaseStart: 0, servicePhaseEnd: 1, advanceTo: 2 },
  { slug: 'service-scope', label: 'Scope Confirmation', milestone: 'Screening', tab: 'sourcing', servicePhaseStart: 2, servicePhaseEnd: 2, advanceTo: 3 },
  { slug: 'service-rate', label: 'Standard Rate Schedule', milestone: 'Proposal', tab: 'proposal', servicePhaseStart: 3, servicePhaseEnd: 5, advanceTo: 6 },
  { slug: 'service-acceptance', label: 'Customer Acceptance', milestone: 'Submitted', tab: 'service-decision', servicePhaseStart: 6, servicePhaseEnd: 6, advanceTo: 7 },
  { slug: 'service-delivery', label: 'Service Execution & Close', milestone: 'Follow-up', tab: 'service-execution', servicePhaseStart: 7, servicePhaseEnd: 9, advanceTo: 10 },
]
const SERVICE_LEGACY_STEP_MAP = {
  'service-intake': 'service-enquiry',
  'service-capture': 'service-enquiry',
  'service-scope': 'service-scope',
  'service-offer': 'service-rate',
  'service-review': 'service-rate',
  'service-send': 'service-rate',
  'service-decision': 'service-acceptance',
  'service-execution': 'service-delivery',
  'service-report': 'service-delivery',
  'service-invoice': 'service-delivery',
}
const workflowStepsFor = (config, route) => {
  if (route === 'Spares') return SPARES_WORKFLOW_STEPS
  if (route === 'Service') return SERVICE_WORKFLOW_STEPS
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
const hasPendingApproval = (approvals, oppId) => (approvals || []).some(approval =>
  approval.oppId === oppId && approval.status === 'Pending')
const REMOVED_WORKFLOW_MILESTONES = new Set(['Submitted', 'PO Validation', 'Handover'])
const milestoneSlug = milestone => {
  if (REMOVED_WORKFLOW_MILESTONES.has(milestone)) return 'follow-up'
  return WORKFLOW_STEPS.find(step => step.label === milestone)?.slug || 'intake'
}

const titleCase = value => String(value || '').toLowerCase().split(/\s+/).map((word, index) => {
  const small = ['for', 'of', 'and', 'the', 'to', 'in'].includes(word) && index > 0
  return small ? word : word.charAt(0).toUpperCase() + word.slice(1)
}).join(' ').replace(/\bBoq\b/g, 'BOQ').replace(/\bKyc\b/g, 'KYC').replace(/\bRfq\b/g, 'RFQ')

function OpportunityProgress({ activeStep, completedThrough, reviewing = false, onStep, onBack, onNext, allowFutureNavigation = false, steps = WORKFLOW_STEPS }) {
  const activeIndex = steps.findIndex(step => step.slug === activeStep)
  const currentIndex = reviewing ? completedThrough : activeIndex
  const currentStep = steps[currentIndex]
  return (
    <nav className="opportunity-progress" aria-label="Opportunity progress">
      <div className="progress-head">
        <div>
          <span className="progress-kicker">Workflow</span>
          <strong>Opportunity progress</strong>
        </div>
        <div className="progress-controls" aria-label="Navigate workflow views">
          <button type="button" className="progress-arrow" disabled={activeIndex <= 0}
            aria-label="Previous workflow step" title="Previous workflow step"
            onClick={() => onBack?.(steps[activeIndex - 1])}>
            <Icon name="chevronLeft" size={17} />
          </button>
          <span>{reviewing ? `Review: ${steps[activeIndex]?.label}` : steps[activeIndex]?.label}</span>
          <button type="button" className="progress-arrow" disabled={activeIndex < 0 || activeIndex >= steps.length - 1}
            aria-label="Next workflow step" title="Next workflow step"
            onClick={() => {
              const next = steps[activeIndex + 1]
              if (!next) return
              onNext?.(next, activeIndex < completedThrough)
            }}>
            <Icon name="chevronRight" size={17} />
          </button>
        </div>
      </div>
      <div className="progress-steps" style={{ '--progress-step-count': steps.length }}>
        <span className="progress-track" aria-hidden="true" />
        {steps.map((step, index) => (
          <button key={step.slug} type="button" disabled={!allowFutureNavigation && index > completedThrough}
            className={`progress-step ${index < currentIndex ? 'done' : ''} ${index > currentIndex ? 'future' : ''} ${index === currentIndex ? 'current' : ''} ${reviewing && index === activeIndex ? 'reviewing' : ''}`}
            aria-current={index === currentIndex ? 'step' : undefined}
            aria-label={`${step.label}${index === currentIndex ? ', current workflow stage' : reviewing && index === activeIndex ? ', stage under review' : ', workflow stage'}`}
            title={index === currentIndex ? `Current stage: ${step.label}` : reviewing && index === activeIndex ? `Review completed stage: ${step.label}` : index <= completedThrough ? `Review ${step.label}` : allowFutureNavigation ? `Open ${step.label}` : `Future stage: ${step.label}`}
            onClick={() => onStep?.(step.slug)}>
            <span className="progress-node">{index < completedThrough ? '✓' : String(index + 1).padStart(2, '0')}</span>
            <span className="progress-label">{step.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

function CreatedOpportunityPanel({ opp, activeStep, onDismiss, onContinue }) {
  const route = opp.route || opp.oppType || 'opportunity'
  const nextByRoute = {
    Service: ['Start Service Request', 'Confirm the request once, then prepare the standard rate schedule.'],
    Spares: ['Start requirement validation', 'Resolve customer clarifications before sourcing parts.'],
    Project: ['Review opportunity intake', 'Confirm registration and customer requirements before quoting.'],
  }
  const [nextLabel, nextCopy] = nextByRoute[route] || ['Review opportunity intake', 'Confirm the opportunity details before progressing.']

  return (
    <section className="created-opportunity-panel" role="status" aria-live="polite">
      <div className="created-opportunity-mark"><Icon name="check" size={17} /></div>
      <div className="created-opportunity-copy">
        <div className="created-opportunity-kicker">Opportunity created</div>
        <h2>{opp.id} is ready in the {route} workspace</h2>
        <p>{nextCopy}</p>
      </div>
      <div className="created-opportunity-facts" aria-label="Created opportunity details">
        <span><b>Customer</b>{opp.sellTo || '—'}</span>
        <span><b>Owner</b>{displayRole(opp.owner)}</span>
        <span><b>First stage</b>{activeStepConfigLabel(activeStep)}</span>
      </div>
      <div className="created-opportunity-actions">
        <button type="button" className="primary" onClick={onContinue}>{nextLabel}</button>
        <Link to={`/folders/${opp.id}`} className="secondary">Open folder</Link>
        <button type="button" className="created-opportunity-dismiss" onClick={onDismiss}>Dismiss</button>
      </div>
    </section>
  )
}

const activeStepConfigLabel = step => {
  const labels = {
    'service-enquiry': 'Service Request',
    'service-intake': 'Service Intake',
    'service-capture': 'Service Request',
    'service-scope': 'Scope Confirmation',
    'service-rate': 'Standard Rate Schedule',
    'service-offer': 'Standard Rate Schedule',
    'service-review': 'Standard Rate Schedule',
    'service-send': 'Standard Rate Schedule',
    'service-acceptance': 'Customer Acceptance',
    'service-decision': 'Customer Acceptance',
    'service-delivery': 'Service Execution & Close',
    'service-execution': 'Service Execution & Close',
    'service-report': 'Service Execution & Close',
    'service-invoice': 'Service Execution & Close',
    intake: 'Intake',
    'requirement-validation': 'Requirement Validation',
  }
  return labels[step] || 'Intake'
}

const activeStepForNotice = opp => opp.route === 'Service' ? 'service-enquiry' : 'intake'

function OpportunityLoading() {
  return (
    <div className="page" role="status" aria-live="polite">
      <h2>Loading opportunity</h2>
      <p className="hint">Restoring the workspace from the shared sales data. This should only take a moment.</p>
    </div>
  )
}

function OpportunityNotFound({ oppId }) {
  return (
    <div className="page">
      <h2>Opportunity not found</h2>
      <p className="hint">No opportunity with ID <b>{oppId}</b> — it may have been deleted or the link is stale.</p>
      <Link to="/">Back to the tracker</Link>
    </div>
  )
}

export default function Workbench() {
  const { oppId, tab = 'overview' } = useParams()
  const store = useStore()
  const [searchParams] = useSearchParams()
  const opp = store.opportunities.find(o => o.id === oppId)
  const [recovery, setRecovery] = useState('idle')
  const [sharedRefreshError, setSharedRefreshError] = useState('')

  useEffect(() => {
    if (!store.authReady || !['live', 'degraded'].includes(store.liveSyncStatus)) return undefined
    let active = true
    const refreshSharedData = () => {
      if (document.visibilityState === 'hidden') return
      void store.refreshSharedData().then(ok => {
        if (!active) return
        setSharedRefreshError(ok ? '' : 'Shared workspace data could not be refreshed.')
      }).catch(() => {
        if (active) setSharedRefreshError('Shared workspace data could not be refreshed.')
      })
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshSharedData()
    }
    refreshSharedData()
    window.addEventListener('focus', refreshSharedData)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      active = false
      window.removeEventListener('focus', refreshSharedData)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [oppId, store.authReady, store.liveSyncStatus])

  const retrySharedRefresh = () => {
    setSharedRefreshError('')
    void store.refreshSharedData().then(ok => {
      if (!ok) setSharedRefreshError('Shared workspace data could not be refreshed.')
    }).catch(() => setSharedRefreshError('Shared workspace data could not be refreshed.'))
  }

  useEffect(() => {
    if (opp || !store.authReady || store.liveSyncStatus === 'connecting' || store.liveSyncStatus === 'reconnecting') return undefined
    let active = true
    setRecovery('loading')
    store.recoverOpportunity(oppId).then(found => {
      if (active) setRecovery(found ? 'found' : 'missing')
    })
      .catch(() => { if (active) setRecovery('error') })
    return () => { active = false }
  }, [oppId, !!opp, store.authReady, store.liveSyncStatus])

  if (!opp) {
    if (!store.authReady || store.liveSyncStatus === 'connecting' || store.liveSyncStatus === 'reconnecting' || recovery === 'loading' || recovery === 'idle') return <OpportunityLoading />
    if (store.liveSyncStatus === 'error' || recovery === 'error') return <OpportunityNotFound oppId={oppId} />
    return <OpportunityNotFound oppId={oppId} />
  }

  return <WorkbenchWorkspace oppId={oppId} tab={tab} store={store} searchParams={searchParams} opp={opp}
    sharedRefreshError={sharedRefreshError}
    onRetrySharedRefresh={retrySharedRefresh} />
}

function WorkbenchWorkspace({ oppId, tab = 'overview', store, searchParams, opp, sharedRefreshError = '', onRetrySharedRefresh }) {
  const nav = useNavigate()
  const [transition, setTransition] = useState(null)
  const [pendingTransition, setPendingTransition] = useState(null)
  const [createdNotice, setCreatedNotice] = useState(() => searchParams.get('created') === '1')
  const detailsRef = useRef(null)

  const dismissCreatedNotice = () => {
    setCreatedNotice(false)
    const next = new URLSearchParams(searchParams)
    next.delete('created')
    next.set('step', activeStepForNotice(opp))
    nav(`/opp/${opp.id}?${next.toString()}`, { replace: true })
  }

  const continueFromCreatedNotice = () => {
    setCreatedNotice(false)
    const next = new URLSearchParams(searchParams)
    next.delete('created')
    next.set('step', opp.route === 'Spares' ? 'requirement-validation' : activeStepForNotice(opp))
    nav(`/opp/${opp.id}?${next.toString()}`, { replace: true })
  }

  if (!isWorkflowAvailable(opp.oppType)) return <OpportunityComingSoon opp={opp} created={createdNotice} onDismiss={dismissCreatedNotice} />

  const goTab = k => nav(`/opp/${opp.id}/${k}`)
  const allWorkflowSteps = workflowStepsFor(store.config, opp.route)
  // Approval is an exception-driven stage. Keep it out of an opportunity's
  // rail until an approval request is actually pending, while leaving the
  // central Approvals page available for the rest of the workspace.
  const approvalPending = hasPendingApproval(store.approvals, opp.id)
  const workflowSteps = allWorkflowSteps.filter(step =>
    step.milestone !== 'Approval' || approvalPending)
  const workflowBySlug = Object.fromEntries(workflowSteps.map(step => [step.slug, step]))
  const requestedStep = searchParams.get('step')
  const effectiveMilestone = opp.route === 'Spares' && opp.milestone === 'Qualification' ? 'Screening' : opp.milestone
  const serviceMilestonePhase = { Intake: 0, Qualification: 1, Screening: 2, Sourcing: 2, Proposal: 3, Approval: 4, Submitted: 5, 'Follow-up': 7 }
  const persistedServicePhase = opp.route === 'Service'
    ? (Number.isInteger(opp.servicePhase) ? opp.servicePhase : (serviceMilestonePhase[effectiveMilestone] ?? 0))
    : null
  const persistedWorkflowStep = opp.route === 'Service'
    ? allWorkflowSteps.find(step => persistedServicePhase >= step.servicePhaseStart && persistedServicePhase <= step.servicePhaseEnd)
      || [...allWorkflowSteps].reverse().find(step => step.servicePhaseStart <= persistedServicePhase)
    : allWorkflowSteps.find(step => (step.milestones || [step.milestone]).includes(effectiveMilestone))
  const fallbackStep = workflowBySlug[persistedWorkflowStep?.slug]
    || workflowSteps[Math.max(0, allWorkflowSteps.indexOf(persistedWorkflowStep) - 1)]
    || workflowSteps[0]
  const persistedStepIndex = opp.route === 'Service'
    ? Math.max(0, workflowSteps.findIndex(step => step.slug === persistedWorkflowStep?.slug))
    : Math.max(0, workflowSteps.findIndex(step => (step.milestones || [step.milestone]).includes(effectiveMilestone)))
  const requestedServiceSlug = opp.route === 'Service' ? (SERVICE_LEGACY_STEP_MAP[requestedStep] || requestedStep) : requestedStep
  const requestedWorkflowStep = workflowBySlug[requestedServiceSlug]
    || workflowSteps.find(step => (step.milestones || [step.milestone]).includes(requestedStep))
  const requestedStepIndex = requestedWorkflowStep ? workflowSteps.findIndex(step => step.slug === requestedWorkflowStep.slug) : -1
  const requestedCompletedOrCurrent = requestedWorkflowStep && requestedStepIndex <= persistedStepIndex
  const reviewingCompletedStep = requestedStepIndex >= 0 && requestedStepIndex < persistedStepIndex
  const serviceOpenNavigation = opp.route === 'Service'
  const viewingFutureStep = requestedStepIndex > persistedStepIndex
  const activeStep = serviceOpenNavigation && requestedWorkflowStep
    ? requestedWorkflowStep.slug
    : reviewingCompletedStep ? requestedWorkflowStep.slug : (fallbackStep?.slug || 'intake')
  const activeStepConfig = workflowBySlug[activeStep]
  const viewTab = activeStepConfig?.tab || 'overview'
  const workflowReadOnly = reviewingCompletedStep || viewingFutureStep
  useEffect(() => {
    if (tab !== 'overview' || requestedStep !== activeStep) {
      nav(`/opp/${opp.id}?step=${encodeURIComponent(activeStep)}`, { replace: true })
    }
  }, [activeStep, nav, opp.id, requestedStep, tab])
  const selectStep = step => {
    const index = workflowSteps.findIndex(item => item.slug === step)
    if (index < 0 || (!serviceOpenNavigation && index > persistedStepIndex)) return
    nav(`/opp/${opp.id}?step=${encodeURIComponent(step)}`)
  }
  const servicePhaseBlockers = step => {
    if (opp.route !== 'Service' || step.servicePhaseStart == null || step.servicePhaseStart <= persistedServicePhase) return []
    const est = (store.svcEstimates || []).find(e => e.oppId === opp.id) || {}
    const survey = (store.surveys || []).find(v => v.oppId === opp.id)
    const review = serviceOfferCleared(opp, store.getProposal(opp.id), store)
    // Path A's offer is the published rate schedule. Scope Confirmation owns
    // the conditional pre-pricing survey; this stage never duplicates it.
    const communication = (store.communications?.[opp.id] || []).find(c => ['submission', 'rate-sheet'].includes(c.kind) && c.status === 'sent')
    const blockers = []
    if (step.servicePhaseStart >= 3 && !est.scopeConfirmed) blockers.push({ key: 'service-scope', severity: 'block', text: 'Confirm the Service scope and site-visit requirement' })
    if (step.servicePhaseStart >= 3 && est.surveyRequired && !survey?.report) blockers.push({ key: 'service-survey', severity: 'block', text: 'Complete the site survey report before preparing the Standard Rate Schedule' })
    if (step.servicePhaseStart >= 7 && (!est.travelConfirmed || (est.surveyRequired && !survey?.report))) blockers.push({ key: 'service-evidence', severity: 'block', text: est.surveyRequired ? 'Complete travel confirmation and the site survey report before Service Execution' : 'Confirm the manual travel estimate before Service Execution' })
    if (step.servicePhaseStart >= 6 && !est.offerPrepared) blockers.push({ key: 'service-offer', severity: 'block', text: 'Issue the Standard Rate Sheet first' })
    if (step.servicePhaseStart >= 6 && !review) blockers.push({ key: 'service-review', severity: 'block', text: 'Approve the offer for release before sending it to the customer' })
    if (step.servicePhaseStart >= 6 && !communication) blockers.push({ key: 'service-send', severity: 'block', text: 'Send the approved offer to the customer first' })
    if (step.servicePhaseStart >= 7 && est.customerDecision !== 'Accepted') blockers.push({ key: 'service-decision', severity: 'block', text: 'Record customer acceptance before scheduling service execution' })
    if (step.servicePhaseStart >= 10 && (!est.engineer || !est.executionDate || !(Number(est.actualEngineerDays) > 0))) blockers.push({ key: 'service-execution', severity: 'block', text: 'Assign an engineer, schedule the service, and record actual engineer days' })
    if (step.servicePhaseStart >= 10 && !est.serviceReport) blockers.push({ key: 'service-report', severity: 'block', text: 'Submit the service report before invoicing' })
    return blockers
  }
  const proposal = store.getProposal(opp.id)
  const sourceBlockers = opp.route === 'Spares' ? sparesSourcingBlockers(opp, proposal, store) : []
  const sourceLead = [...(store.leads || []), ...(store.leadArchive || [])].find(lead => lead.id === opp.sourceLeadId || lead.oppId === opp.id)
  const sourceText = [sourceLead?.subject, sourceLead?.body, opp.remarks, opp.oppName].filter(Boolean).join(' ')
  useEffect(() => {
    if (opp.route !== 'Spares') return undefined
    const lines = (store.sparesLines || []).filter(line =>
      line.oppId === opp.id && !isPlaceholderSparesLine(line) && !line.removedFromSourcing)
    void prefetchSparesMatches({
      oppId: opp.id,
      lines,
      priceLists: store.priceLists,
      model: store.config?.aiModel?.model,
      fallback: store.config?.aiModel?.provider === 'Built-in fallback',
    }).then(workerResults => {
      workerResults.flat().forEach(({ line, result }) => {
        const suggestion = result?.suggestions?.[0]
        if (result?.status !== 'ready' || !suggestion || Number(suggestion.conf) < 85 || Number(suggestion.price) <= 0) return
        const current = (store.sparesLines || []).find(item => item.id === line.id)
        if (!current || current.confirmed || current.pn !== line.pn || current.desc !== line.desc || Number(current.qty) !== Number(line.qty)) return
        if (current.priceSource === 'manual' && Number(current.listPrice) > 0) return
        store.updateSparesLine(current.id, {
          pn: suggestion.pn,
          desc: suggestion.desc || current.desc,
          match: 'Suggested price-list match',
          conf: suggestion.conf,
          confirmed: false,
          priceSource: 'price-list',
          priceSourceName: suggestion.priceList,
          priceSourceVersion: suggestion.priceListVersion,
          priceSourceRef: suggestion.pn,
          priceSourceSuggested: true,
          priceSourceSuggestedPart: suggestion.pn,
          priceSourceSuggestedDescription: suggestion.desc || '',
          priceSourceSuggestedList: suggestion.priceList || '',
          priceSourceSuggestedVersion: suggestion.priceListVersion || '',
          priceState: 'Current',
          listPrice: suggestion.price,
          listUnitPrice: suggestion.price,
          baseCost: Number(current.baseCost) > 0 ? current.baseCost : suggestion.price,
          currency: suggestion.currency || current.currency || 'INR',
        })
      })
    })
    return undefined
  }, [opp.id, opp.route, store.sparesLines, store.priceLists, store.config?.aiModel?.model, store.config?.aiModel?.provider])
  const moveToMilestone = async (milestone, reason = '', tabOverride = '') => {
    const moved = store.setMilestone(opp.id, milestone, reason, { alreadyGated: true })
    if (!moved) return false
    const saved = await store.flushPersistence()
    if (saved === false) {
      setTransition({ kind: 'blocked', target: milestone, blockers: [{ key: 'persistence', severity: 'block', text: 'The workflow change could not be saved. Check your connection and try again.' }] })
      return false
    }
    goTab(tabOverride || LIFECYCLE_TABS[milestone] || 'overview')
    return true
  }
  const workflowPosition = step => opp.route === 'Service' && Number.isInteger(step?.servicePhaseStart ?? step?.servicePhase)
    ? (step.servicePhaseStart ?? step.servicePhase)
    : MILESTONES.indexOf(step?.milestone)
  const openBackwardTransition = step => {
    const currentIndex = workflowPosition({ milestone: opp.milestone, servicePhase: opp.servicePhase })
    const targetIndex = workflowPosition(step)
    if (!step || targetIndex < 0 || currentIndex < 0 || targetIndex >= currentIndex) return
    setTransition({ kind: 'backward', target: step.milestone, targetStep: step, reason: '' })
  }
  const moveBackwardToStep = async (step, reason) => {
    const currentIndex = workflowPosition({ milestone: opp.milestone, servicePhase: opp.servicePhase })
    const targetIndex = workflowPosition(step)
    if (!step || !reason?.trim() || targetIndex < 0 || currentIndex < 0 || targetIndex >= currentIndex) return false
    await moveToMilestone(step.milestone, reason, step.tab)
    if (opp.route === 'Service' && step.servicePhaseStart != null) {
      store.updateServiceFlow(opp.id, { servicePhase: step.servicePhaseStart })
    }
    return true
  }
  const blockers = readiness(opp, proposal, store)
  const nextAction = nextActionWith(opp, proposal, store)
  const canSeeValue = canPriceProposal(store.role)
  const due = opp.orderDate || opp.proposalDate || opp.lastUpdated
  const isOverdue = !!due && new Date(`${due}T23:59:59`) < new Date()
  const milestoneIndex = MILESTONES.indexOf(opp.milestone)
  const moveMilestone = async (milestone, tabOverride = '') => {
    if (milestone === opp.milestone) return true
    if (MILESTONES.indexOf(milestone) < milestoneIndex) {
      setTransition({ kind: 'backward', target: milestone, reason: '' })
      return false
    }
    // Read the latest proposal from the store. Sourcing synchronizes its BoM
    // immediately before asking to advance, so this must not use the render's
    // older proposal snapshot when evaluating the transition gate.
    const blockersForMove = transitionBlockers(opp, milestone, store.getProposal(opp.id), store)
    if (blockersForMove.length) {
      const pendingRequestsFor = blockersForMove.map(approvalRequestFor).filter(Boolean)
      if (pendingRequestsFor.length === blockersForMove.length) {
        setPendingTransition({ target: milestone, requests: pendingRequestsFor })
        return false
      }
      setPendingTransition(null)
      setTransition({ kind: 'blocked', target: milestone, blockers: blockersForMove })
      return false
    }
    setPendingTransition(null)
    return moveToMilestone(milestone, '', tabOverride)
  }
  const advanceStep = async slug => {
    const step = workflowBySlug[slug]
    if (!step) return
    if (opp.route === 'Service' && viewingFutureStep) return
    if (opp.route === 'Service') {
      const serviceBlockers = servicePhaseBlockers(step)
      if (serviceBlockers.length) {
        setTransition({ kind: 'blocked', target: step.label, blockers: serviceBlockers })
        return
      }
      selectStep(step.slug)
      store.updateServiceFlow(opp.id, { servicePhase: step.servicePhaseStart })
      return
    }
    const moved = await moveMilestone(step.milestone, step.tab)
    if (opp.route === 'Service' && moved) store.updateServiceFlow(opp.id, { servicePhase: step.servicePhase })
  }
  const nextWorkflowStep = (step, alreadyCompleted) => {
    if (!step) return
    if (alreadyCompleted) selectStep(step.slug)
    else advanceStep(step.slug)
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
  // The transition dialog stores the blocker snapshot from the click that
  // opened it. Clarification answers and approval decisions can change the
  // underlying store while the dialog is still open, so keep it synchronized
  // and close it once its target is no longer blocked.
  useEffect(() => {
    if (!transition || transition.kind !== 'blocked') return
    const currentBlockers = transitionBlockers(opp, transition.target, store.getProposal(opp.id), store)
    const signature = blockers => JSON.stringify(blockers.map(item => ({
      key: item.key, severity: item.severity, text: item.text, approvalType: item.approvalType,
    })))
    if (!currentBlockers.length) {
      setTransition(null)
      return
    }
    if (signature(currentBlockers) !== signature(transition.blockers || [])) {
      setTransition(previous => previous && previous.kind === 'blocked'
        ? { ...previous, blockers: currentBlockers }
        : previous)
    }
  }, [transition?.kind, transition?.target, transition?.blockers, opp.id, opp.milestone, store.clarifications, store.approvals, store.proposals, store.sparesLines])
  useEffect(() => {
    if (opp.route !== 'Spares' || viewTab !== 'proposal' || !sourceBlockers.length) return
    if (transition?.kind === 'blocked' && transition.target === 'Proposal') return
    setTransition({ kind: 'blocked', target: 'Proposal', blockers: sourceBlockers })
  }, [opp.id, opp.route, viewTab, sourceBlockers.length, store.sparesLines, store.proposals])
  const approvalRequestFor = blocker => (store.approvals || []).find(a =>
    a.oppId === opp.id
    && a.status === 'Pending'
    && (a.type === blocker.approvalType
      || (blocker.approvalType === APPROVAL_5B && a.type === 'Commercial deviation')))
  useEffect(() => {
    if (!pendingTransition) return
    const currentBlockers = transitionBlockers(opp, pendingTransition.target, store.getProposal(opp.id), store)
    const currentRequests = currentBlockers.map(approvalRequestFor).filter(Boolean)
    if (!currentBlockers.length || currentRequests.length !== currentBlockers.length) {
      setPendingTransition(null)
      return
    }
    const currentIds = currentRequests.map(request => request.id).join('|')
    const rememberedIds = pendingTransition.requests.map(request => request.id).join('|')
    if (currentIds !== rememberedIds) setPendingTransition({ target: pendingTransition.target, requests: currentRequests })
  }, [pendingTransition, opp, store.approvals, store.proposals, store.clarifications])
  const approvalContextFor = blocker => {
    const lead = (store.leads || []).find(l => l.oppId === opp.id)
    const aiSummary = lead?.ai?.summary?.trim() || ''
    const fallbackSummary = `${opp.oppName || 'This opportunity'} is a ${opp.route || 'sales'} opportunity for ${opp.sellTo || 'the customer'}${opp.product ? ` covering ${productDisplayLabel(opp.product)}` : ''}.`
    // §5B comm-approval signs off the matched customer terms. Keep those
    // details on the request so the gate can recognize AH's decision later.
    const wantsDeviationDetails = blocker.key === 'dev' || blocker.key === 'comm-approval' || blocker.key === 'commercial-approval'
    const deviations = wantsDeviationDetails
      ? blocker.key === 'commercial-approval'
        ? commercialApprovalDetails((proposal?.terms || []).filter(needsCommercialApproval))
        : (proposal?.terms || []).filter(t => t.status === 'Deviation').map(t => ({
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
    coversPricingThreshold: blocker.coversPricingThreshold || undefined,
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
  const openCommercialDecisions = () => {
    setTransition(null)
    goTab('proposal')
    window.setTimeout(() => {
      const target = document.querySelector('[aria-label="Commercial terms decision"]')
      if (target?.isConnected) target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 0)
  }
  const clarificationRows = actionableClarifications(opp, store)
    .filter(c => !isClarificationResolved(c))
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
    if (blocker.key === 'release') {
      const voided = releaseVoidReason(proposal, store.approvals, opp.id, opp)
      return `Section 5C: the final quote release, routed by order value and margin. It covers this revision only — a revised quote must be released again.${voided ? ` ${voided}` : ''}`
    }
    if (blocker.key === 'proposal-review') return 'The uploaded workbook must pass semantic review before this opportunity can move to Submitted.'
    if (blocker.key.startsWith('sp-desc-')) return 'This spares line needs a real description. Complete the description in Sourcing before the proposal can be built.'
    if (blocker.key.startsWith('sp-qty-')) return 'This spares line has no positive quantity. Correct the quantity in Sourcing before the proposal can be built.'
    if (blocker.key.startsWith('sp-conf-')) return 'This spares line’s part match has not been confirmed. Confirm the match — or pick an alternative — in Sourcing before the proposal can be built.'
    if (blocker.key.startsWith('sp-price-')) return 'This spares line’s price source has expired. Refresh it against a current price list or supplier quotation in Sourcing.'
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
      {sharedRefreshError && <div className="page-sync-warning" role="alert">
        <span>{sharedRefreshError} Changes on another device may not be visible yet.</span>
        <button type="button" onClick={onRetrySharedRefresh}>Retry</button>
      </div>}
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
      {pendingTransition && <section className="approval-pending-banner" role="status">
        <div>
          <b>Awaiting approval before moving to {pendingTransition.target}.</b>
          <span>{pendingTransition.requests.map(request => `${request.id} (${request.needed?.join(request.anyOf ? ' or ' : ' + ') || request.approver})`).join(' · ')}</span>
        </div>
        <button type="button" className="secondary" onClick={() => goTab('approvals')}>Open approvals</button>
      </section>}
      {createdNotice && <CreatedOpportunityPanel opp={opp} activeStep={activeStep} onDismiss={dismissCreatedNotice} onContinue={continueFromCreatedNotice} />}
      <div className="opp-summary-grid clean-summary-grid summary-strip bg-gray-50 border border-gray-200 rounded-lg p-4 divide-x divide-gray-200" aria-label="Opportunity summary">
        <div className="summary-meta-item"><span>Owner</span><b>{displayRole(opp.owner)}</b></div>
        <div className="summary-meta-item"><span>Milestone</span><b>{opp.milestone || opp.stage}</b></div>
        <div className="summary-meta-item"><span>Customer value</span><b>{canSeeValue ? `₹${fmt(opp.valueK || 0)},000` : 'Restricted'}</b></div>
        <div className="summary-meta-item opp-summary-action"><span>Next action</span><b>{nextAction.text || NEXT_ACTION[opp.milestone] || 'Progress the opportunity'}</b></div>
        <div className={`summary-meta-item summary-due ${isOverdue ? 'is-overdue' : ''}`}><span>Due</span><div className="summary-meta-value"><b>{ddMmmYY(due) || '-'}</b>{isOverdue && <Chip tone="state-Blocks">Overdue</Chip>}</div></div>
      </div>
      <OpportunityProgress steps={workflowSteps} activeStep={activeStep} completedThrough={persistedStepIndex} reviewing={workflowReadOnly}
        allowFutureNavigation={serviceOpenNavigation}
        onStep={selectStep}
        onBack={step => {
          const activeIndex = workflowSteps.findIndex(item => item.slug === activeStep)
          if (activeIndex === persistedStepIndex) openBackwardTransition(step)
          else selectStep(step.slug)
        }}
        onNext={nextWorkflowStep} />
      {transition && (
        <Modal title={transition.kind === 'blocked' ? `Cannot move from ${opp.milestone} to ${transition.target}` : `Return to ${transition.target} for correction`} onClose={() => setTransition(null)} wide>
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
                  {item.key === 'proposal-review' && <span className="transition-next-action"><b>Next step:</b> {item.action || blockerExplanation(item)}</span>}
                  {item.approvalType && <div className="transition-request-reason"><b>Reason for request</b><span>{approvalRequestReason(item)}</span></div>}
                  {item.key === 'pricing-threshold' && item.pricingRows?.length > 0 && <div className="transition-pricing-details">{item.pricingRows.map((row, rowIndex) => <div key={`${row.label}-${rowIndex}`}><b>{row.label}</b>{row.discount > row.discountPct && <span>Discount {row.discount}% (allowed {row.discountPct}%, exceeds by {row.discountExcessPct} points)</span>}{row.markup > row.markupPct && <span>Markup {row.markup}% (allowed {row.markupPct}%, exceeds by {row.markupExcessPct} points)</span>}{row.discountAmountINR > 0 && <span>Impact ₹ {fmt(row.discountAmountINR)}</span>}</div>)}</div>}
                  {item.key === 'clarifications' && clarificationRows.length > 0 && <div className="transition-detail-list">{clarificationRows.map(row => <div key={row.id}><b>{row.id}</b> · {row.category} · {row.q} <em>{row.status}</em></div>)}</div>}
                  {item.key === 'dev' && deviationRows.length > 0 && <div className="transition-detail-list">{deviationRows.map((row, index) => <div key={`${row.term}-${index}`}><b>{row.term}</b><br />Customer requested: {row.customerAsk || 'Not recorded'}<br />ModAE offered: {row.ourResponse || 'Pending review'}</div>)}</div>}
                  {item.severity === 'wait' && <span>Waiting for the responsible approver.</span>}
                  {/* Keep blocker handling on the current workflow page; the active
                      stage owns the next action and users should not be detoured
                      into another editable page from this dialog. */}
                  {['clarifications', 'kyc', 'required-contactPerson', 'required-contactPhone'].includes(item.key)
                    || item.key.startsWith('sp-desc-') || item.key.startsWith('sp-qty-') || item.key.startsWith('sp-conf-') || item.key.startsWith('sp-price-')
                    ? <span className="hint">Resolve this requirement from the current workflow stage.</span>
                    : null}
                  {(item.key.startsWith('sp-desc-') || item.key.startsWith('sp-qty-') || item.key.startsWith('sp-conf-') || item.key.startsWith('sp-price-') || item.key === 'sp-source-empty') && (
                    <button type="button" className="exception-action" onClick={() => {
                      const sourcingStep = workflowSteps.find(step => step.slug === 'sourcing')
                      if (sourcingStep) openBackwardTransition(sourcingStep)
                    }}>Return to Sourcing</button>
                  )}
                  {item.key === 'commercial-decision' && <button type="button" className="exception-action" onClick={openCommercialDecisions}>Review commercial decisions</button>}
                  {approvable && openRequest && <span>{item.approvalType === 'Commercial deviation' ? 'AH approval for commercial deviations' : item.approvalType} <b>{openRequest.id}</b> is pending with {openRequest.needed?.join(openRequest.anyOf ? ' or ' : ' + ') || openRequest.approver}.</span>}
                  {approvable && !openRequest && <button className="exception-action" onClick={() => requestBlockerApproval(item)}>{item.coversPricingThreshold ? 'Request combined quote approval from AH + LJS' : item.key === 'release' ? 'Request final quote release from AH + LJS' : item.approvalType === 'Commercial deviation' ? 'Request AH approval for commercial deviations' : `Request ${item.approvalType.toLowerCase()} from ${blockerOwner(item)}`}</button>}
                  {requestable && exception?.status === 'Pending' && <span>Exception approval <b>{exception.id}</b> is pending.</span>}
                  {requestable && !exception && <button className="exception-action" onClick={() => requestException(item)}>Request {blockerOwner(item)} approval to continue</button>}
                  {requestable && exception?.status === 'Rejected' && <span>Exception <b>{exception.id}</b> was rejected; resolve the requirement or request a new review.</span>}
                </div>
              })}</div>
              <div className="forms-actions"><button className="primary" onClick={() => setTransition(null)}>Close</button></div>
            </>
          ) : (
            <>
              <p className="hint">Returning from {opp.milestone} to {transition.target} is allowed for corrections. Enter a reason; it will be recorded in the audit trail.</p>
              <label>Reason<textarea rows={3} value={transition.reason} onChange={e => setTransition({ ...transition, reason: e.target.value })} placeholder="Explain what changed or why this stage needs correction." /></label>
              <div className="forms-actions"><button className="primary" disabled={!transition.reason?.trim()} onClick={() => { const moved = moveBackwardToStep(transition.targetStep || { milestone: transition.target, tab: LIFECYCLE_TABS[transition.target] }, transition.reason.trim()); if (moved) setTransition(null) }}>Return to stage</button><button onClick={() => setTransition(null)}>Cancel</button></div>
            </>
          )}
        </Modal>
      )}
      {workflowReadOnly && <div className="workflow-readonly-notice" role="status">
        {viewingFutureStep ? (
          <span>Previewing future stage: <b>{activeStepConfig?.label || 'this stage'}</b>. Current workflow stage: <b>{workflowSteps[persistedStepIndex]?.label || opp.milestone}</b>.</span>
        ) : (
          <>
            <span>Reviewing completed stage: <b>{activeStepConfig?.label || 'this stage'}</b>. Current workflow stage: <b>{workflowSteps[persistedStepIndex]?.label || opp.milestone}</b>.</span>
            <button type="button" className="secondary" onClick={() => openBackwardTransition(activeStepConfig)}>
              Move back to {activeStepConfig?.label || 'this stage'} to edit
            </button>
          </>
        )}
      </div>}
      <fieldset className={`wb-body workflow-edit-boundary ${workflowReadOnly ? 'workflow-edit-boundary--readonly' : ''}`} disabled={workflowReadOnly && viewTab !== 'comms'} aria-readonly={workflowReadOnly || undefined}>
        {viewTab === 'overview' && opp.route === 'Spares' && <SparesIntakeTab opp={opp} detailsRef={detailsRef} />}
        {viewTab === 'overview' && opp.route !== 'Spares' && <OverviewTab opp={opp} detailsRef={detailsRef} />}
        {viewTab === 'requirement' && <RequirementTab opp={opp} onContinueToScope={opp.route === 'Service' ? () => advanceStep('service-scope') : undefined} onContinueToRate={opp.route === 'Service' ? () => advanceStep('service-rate') : undefined} />}
        {viewTab === 'requirement-validation' && <SparesRequirementTab opp={opp} sourceText={sourceText} onContinueToSourcing={() => advanceStep('sourcing')} />}
        {viewTab === 'customer' && <CustomerKycTab opp={opp} />}
        {viewTab === 'registration' && <RegistrationTab opp={opp} goTab={goTab} />}
        {viewTab === 'clarifications' && <ClarificationsTab opp={opp} sourceText={sourceText} />}
        {viewTab === 'sourcing' && <SourcingTab opp={opp} goTab={goTab} onConfirmScope={() => advanceStep('service-rate')} onContinueToProposal={() => {
          const proposalStep = workflowSteps.find(step => step.milestone === 'Proposal')
          if (proposalStep) advanceStep(proposalStep.slug)
        }} />}
        {viewTab === 'proposal' && <ProposalTab opp={opp} goTab={goTab} onConfirmSent={() => advanceStep('service-acceptance')} />}
        {viewTab === 'approval' && <ApprovalsTab opp={opp} />}
        {viewTab === 'followup' && <FollowUpTab opp={opp} goTab={goTab} />}
        {viewTab === 'service-decision' && <ServiceDecisionPanel opp={opp} onContinue={() => advanceStep('service-delivery')} onChangesRequested={() => advanceStep('service-rate')} />}
        {viewTab === 'service-execution' && <ServiceDeliveryClose opp={opp} />}
        {viewTab === 'service-report' && <ServiceReportPanel opp={opp} />}
        {viewTab === 'service-invoice' && <ServiceInvoicePanel opp={opp} />}
        {!activeStepConfig && viewTab === 'approvals' && <ApprovalsTab opp={opp} />}
        {viewTab === 'comms' && <CommsTab opp={opp} readOnly={workflowReadOnly} />}
        {!activeStepConfig && viewTab === 'po' && <PoHandover opp={opp} />}
        {!activeStepConfig && viewTab === 'files' && <FilesTab opp={opp} />}
        {!activeStepConfig && viewTab === 'audit' && <AuditTab opp={opp} />}
      </fieldset>
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
function SparesIntakeTab({ opp, detailsRef }) {
  return <RegistrationTab opp={opp} detailsRef={detailsRef} spares />
}

function CommercialDecisionPanel({ opp }) {
  const store = useStore()
  const proposal = store.getProposal(opp.id)
  const [approvalNotice, setApprovalNotice] = useState('')
  const deviations = (proposal.terms || []).filter(term => term.status === 'Deviation')
  if (!deviations.length) return null
  const commercialApprovalRequired = store.config?.requireCommercialDeviationApproval !== false
  const matchingTerms = deviations.filter(needsCommercialApproval)
  const currentApprovalDetails = commercialApprovalDetails(proposal.terms)
  const approvalDetailsMatch = approval => JSON.stringify(approval?.deviationDetails || []) === JSON.stringify(currentApprovalDetails)
  const currentCommercialApproval = (store.approvals || [])
    .filter(approval => approval.oppId === opp.id
      && approval.type === 'Commercial deviation'
      && ['Pending', 'Approved', 'Approved with conditions'].includes(approval.status)
      && (approval.rev == null || String(approval.rev) === String(proposal?.revision ?? ''))
      && approvalDetailsMatch(approval))
    .sort((a, b) => (b.decisionTs || b.ts || '').localeCompare(a.decisionTs || a.ts || ''))[0]
  const commercialApprovalCleared = !commercialApprovalRequired
    || (currentCommercialApproval && ['Approved', 'Approved with conditions'].includes(currentCommercialApproval.status))

  const saveTerms = terms => store.saveProposal(opp.id, { ...proposal, terms }, { immediate: true })
  const requestCommercialApproval = () => {
    const deviationDetails = commercialApprovalDetails(proposal.terms)
    if (!deviationDetails.length) return
    const lead = (store.leads || []).find(item => item.oppId === opp.id)
    const aiSummary = lead?.ai?.summary?.trim() || ''
    const opportunitySummary = aiSummary || `${opp.oppName || 'This opportunity'} is a ${opp.route || 'sales'} opportunity for ${opp.sellTo || 'the customer'}${opp.product ? ` covering ${productDisplayLabel(opp.product)}` : ''}.`
    const requestSummary = deviationDetails.map(item => `${item.term}: customer asked “${item.customerAsk}”; ModAE response “${item.ourResponse}”`).join(' · ')
    store.requestApproval({
      oppId: opp.id,
      type: 'Commercial deviation',
      rev: String(proposal?.revision ?? ''),
      approver: 'AH',
      needed: ['AH'],
      anyOf: false,
      detail: `AH approval requested for: ${requestSummary}.`,
      blockingReason: `The proposal matches these customer-requested commercial terms and requires AH approval: ${requestSummary}.`,
      opportunitySummary,
      summarySource: aiSummary ? 'ai' : 'opportunity',
      opportunitySnapshot: {
        name: opp.oppName || '', customer: opp.sellTo || '', route: opp.route || '',
        product: Array.isArray(opp.product) ? opp.product.join(', ') : (opp.product || ''),
        milestone: opp.milestone || opp.stage || '',
      },
      deviationDetails,
      refreshPendingContext: true,
    })
    setApprovalNotice(`AH approval requested for ${deviationDetails.map(item => item.term).join(' and ')}. The request now appears in the internal Approvals queue.`)
  }
  const setDecision = (index, decision) => {
    const nextTerms = (proposal.terms || []).map((term, termIndex) => termIndex === index
      ? normalizeCommercialTerm({
        ...term,
        decision,
        ourResponse: decision === 'Match customer terms' ? term.customerAsk : (term.proposedTerm || term.standardTerm || term.ourResponse),
        customerConfirmationStatus: decision === 'Counter-offer with ModAE standard terms' ? 'Awaiting reply' : 'Not required',
      })
      : term)
    saveTerms(nextTerms)
  }
  const setConfirmation = (index, status) => saveTerms((proposal.terms || []).map((term, termIndex) => termIndex === index
    ? normalizeCommercialTerm({ ...term, customerConfirmationStatus: status })
    : term))
  const setProposedTerm = (index, value) => saveTerms((proposal.terms || []).map((term, termIndex) => termIndex === index
    ? normalizeCommercialTerm({ ...term, proposedTerm: value, ourResponse: value })
    : term))

  return (
    <section className="workbench-panel commercial-decision-panel" aria-label="Commercial decisions">
      <div className="workbench-section-title">Commercial decision required</div>
      <p className="hint">Decide how ModAE will respond to each customer commercial request before moving to Sourcing.</p>
      {approvalNotice && <div className="okbox commercial-approval-notice">{approvalNotice}</div>}
      <div className="commercial-decision-list">
        {deviations.map(term => {
          const index = proposal.terms.indexOf(term)
          return <div className="route-template-row commercial-decision-row" key={`commercial-decision-${index}`}>
            <b className="commercial-decision-term">{term.term || `Term ${index + 1}`}</b>
            <div className="commercial-decision-request">
              <div><b>Customer requested:</b><span>{term.customerAsk || 'Not recorded'}</span></div>
              <div><b>ModAE standard:</b><span>{term.standardTerm || term.ourResponse || 'Not recorded'}</span></div>
            </div>
            <label className="commercial-decision-choice">Decision <select value={term.decision || 'Decision pending'} onChange={e => setDecision(index, e.target.value)}>
              {COMMERCIAL_DECISIONS.map(option => <option key={option}>{option}</option>)}
            </select>
              {term.decision === 'Match customer terms' && <span className="hint">Save this decision, then request one grouped AH approval for the matched terms.</span>}
              {(!term.decision || term.decision === 'Decision pending') && <span className="err">Choose Match customer terms or Counter-offer with ModAE standard terms.</span>}
            </label>
            {term.decision === 'Counter-offer with ModAE standard terms' && <div className="commercial-decision-followup">
              <label>Counter offer <input value={term.proposedTerm || term.ourResponse || ''} onChange={e => setProposedTerm(index, e.target.value)} /></label>
              <label>Customer response <select value={term.customerConfirmationStatus || 'Awaiting reply'} onChange={e => setConfirmation(index, e.target.value)}>
                {CUSTOMER_CONFIRMATION_STATUSES.filter(status => status !== 'Not required').map(status => <option key={status}>{status}</option>)}
              </select></label>
              <span className="hint">Customer confirmation will be tracked in Follow-up.</span>
            </div>}
          </div>
        })}
      </div>
      {commercialApprovalRequired && matchingTerms.length > 0 && !currentCommercialApproval && (
        <div className="commercial-approval-request">
          <div className="hint">AH will review: {matchingTerms.map(term => `${term.term} — customer asked “${term.customerAsk || 'Not recorded'}”; ModAE response “${term.ourResponse || term.proposedTerm || term.standardTerm || 'Not recorded'}”`).join(' · ')}</div>
          <button type="button" className="primary" onClick={requestCommercialApproval}>Request AH approval for {matchingTerms.map(term => term.term).join(' and ')}</button>
        </div>
      )}
      {commercialApprovalRequired && currentCommercialApproval?.status === 'Pending' && <div className="warnbox">AH approval is pending for {matchingTerms.map(term => term.term).join(' and ')}. The request includes the customer terms shown above.</div>}
      {commercialApprovalRequired && currentCommercialApproval && ['Approved', 'Approved with conditions'].includes(currentCommercialApproval.status) && <div className="okbox">AH approval is {currentCommercialApproval.status.toLowerCase()} for {matchingTerms.map(term => term.term).join(' and ')}.</div>}
      {commercialApprovalRequired && matchingTerms.length > 0 && !commercialApprovalCleared && <div className="warnbox">One or more requested terms need internal approval before the quotation can be submitted.</div>}
    </section>
  )
}

function SparesRequirementTab({ opp, sourceText = '', onContinueToSourcing }) {
  return (
    <div className="spares-merged-workflow">
      <CommercialDecisionPanel opp={opp} />
      <div className="workbench-panel">
        <div className="workbench-section-title">Clarifications first</div>
        <p className="hint">Resolve missing customer information before sourcing. Answered questions are retained as audit evidence.</p>
        <ClarificationsTab opp={opp} sourceText={sourceText} compact />
      </div>
      <div className="workbench-panel">
        <div className="workbench-section-title">Source &amp; opportunity details</div>
        <p className="hint">Use this reference to confirm the requested parts, quantities, specifications, compatibility, and delivery requirements.</p>
        <RequirementTab opp={opp} />
      </div>
      <div className="forms-actions workflow-next-actions">
        <button type="button" className="primary" onClick={onContinueToSourcing}>
          <Icon name="arrowRight" size={13} /> Next: Spares Sourcing
        </button>
      </div>
    </div>
  )
}

function RegistrationTab({ opp, goTab, detailsRef, spares = false }) {
  const store = useStore()
  const proposal = store.getProposal(opp.id)
  const blockers = transitionBlockers(opp, 'Registration', proposal, store)
  const blocking = blockers.filter(item => item.severity !== 'info')

  return (
    <div className="ana-grid registration-workbench">
      <div className="ana-card c-12">
        <div className="ana-title">{spares ? 'Opportunity intake' : 'Registration'}</div>
        <p className="hint">{spares
          ? 'Capture the opportunity owner, customer, equipment, scope, enquiry, and registration details in one place.'
          : 'Complete the opportunity identity, customer classification and contact details before the opportunity enters Screening.'}</p>
        {blocking.length ? (
          <div className="warnbox">
            <b>{blocking.length} registration requirement{blocking.length === 1 ? '' : 's'} outstanding.</b>
            <div className="transition-detail-list">
              {blocking.map(item => <div key={item.key}><b>{item.text}</b></div>)}
            </div>
          </div>
        ) : (
          <div className="okbox"><b>Registration is complete.</b> The opportunity can continue to Screening when the workflow gate is advanced.</div>
        )}
      </div>
      <div className="ana-card c-12">
        {['Intake', 'Registration'].includes(opp.milestone)
          ? <OpportunityDetailsEditor ref={detailsRef} opp={opp} store={store} className="workbench-details-editor" editable />
          : <OpportunityDetailsView opp={opp} className="workbench-details-editor" />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function RequirementTab({ opp, onContinueToScope, onContinueToRate }) {
  const store = useStore()
  if (opp.route === 'Service') {
    return <>
      <div className="ana-card c-12 service-flow-summary">
        <div className="ana-title">Service opportunity flow</div>
        <p className="hint">Service Request → Scope Confirmation → Standard Rate Schedule → Customer Acceptance → Service Execution &amp; Close.</p>
      </div>
      <ServiceRequestPanel opp={opp} onContinue={onContinueToScope} />
    </>
  }
  const lead = store.leads.find(l => l.oppId === opp.id)
  const readonly = [
    ['Opportunity ID', opp.id], ['Sell-to', opp.sellTo], ['Category', opp.category],
    ['End user', `${opp.eucName || '—'} · ${opp.eucLocation || '—'}`],
    ['Route', opp.route], ['Lane', `${opp.context || '—'} world`],
    ['Owner', displayRoleLabel(opp.owner)],
    ['Contact', `${opp.contactPerson || '—'} ${opp.contactPhone || ''}`],
    ['Stage', opp.stage || '—'], ['Probability', opp.prob || '—'],
    ['BU', opp.bu || '—'], ['Segment', opp.segment || '—'],
    ['Equipment / Product Family', productDisplayLabel(opp.product) || '—'],
    ['Additional customer information', opp.additionalCustomerInformation || '—'],
  ]

  return (
    <div className="ana-grid">
      {opp.context === 'Brownfield' && opp.oppType !== 'Spares' && <div className="ana-card c-12">
        <BSteps opp={opp} />
      </div>}
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
        <p className="hint metadata-reference-note">Reference only. Update pipeline fields in Opportunity details; workflow progress advances through gated actions.</p>
        <table className="cost-table" style={{ width: '100%' }}>
          <tbody>
            {readonly.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
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

// Lead-stage verification keeps the document name in the opportunity snapshot
// while the actual bytes remain under the source lead's attachment store.
// Resolve the newest metadata first, then fall back to the lead attachment
// record so converted opportunities remain viewable after a reload.
const leadVerificationAttachment = (sourceLead, name, snapshotItem) => {
  const liveItem = sourceLead && verificationItem(sourceLead.verification, name)
  const candidate = snapshotItem?.file || liveItem?.file
  if (candidate && typeof candidate === 'object') return candidate
  if (typeof candidate === 'string' && candidate.trim()) {
    return (sourceLead?.attachments || []).find(file => file.name === candidate || file.kycItem === name)
      || { name: candidate }
  }
  return (sourceLead?.attachments || []).find(file => file.kycItem === name)
}
const KYC_TEXT_CAP = 8000

function CustomerKycTab({ opp }) {
  const store = useStore()
  const customer = store.customers.find(c => c.name === opp.sellTo)
  const sourceLead = [...(store.leads || []), ...(store.leadArchive || [])].find(lead => lead.id === opp.sourceLeadId)
  const sourceIdentity = sourceLead ? leadIdentity(sourceLead, sourceLead.ai?.fields || []) : {}
  const sourceField = pattern => sourceLead?.ai?.fields?.find(field => pattern.test(String(field.k || '')))?.v || ''
  const sourceCategory = sourceLead?.category || leadFieldValue(sourceLead?.ai?.fields || [], 'category') || ''
  const sourcePayment = sourceLead?.paymentTerms || sourceField(/payment\s*terms?|payment\s*conditions?/i)
  const sourceBilling = sourceLead?.billingAddress || sourceField(/billing\s*address/i)
  const sourceShipping = sourceLead?.shippingAddress || sourceLead?.deliveryAddress || sourceField(/shipping\s*address|delivery\s*address/i)
  const sourcePincode = sourceLead?.shippingPincode || sourceField(/shipping\s*p(?:in|ostal)\s*code|pincode/i)
  const sourceGstin = sourceLead?.gstin || sourceField(/gstin|gst\s*(?:number|no\.?)/i)
  const displayedCategory = (customer?.category && customer.category !== '—') ? customer.category : (opp.category || sourceCategory || '—')
  const canVerify = store.role === 'AH' || isAdminRole(store.role)
  const detailSeed = {
    billingAddress: opp.billingAddress ?? sourceBilling ?? customer?.billingAddress ?? '',
    shippingAddress: opp.shippingAddress ?? sourceShipping ?? customer?.shippingAddress ?? '',
    shippingPincode: opp.shippingPincode ?? sourcePincode ?? customer?.shippingPincode ?? '',
    gstin: opp.gstin ?? sourceGstin ?? customer?.gstin ?? '',
  }
  const [details, setDetails] = useState(detailSeed)
  const [detailSaved, setDetailSaved] = useState(false)
  const [dirtyDetailKeys, setDirtyDetailKeys] = useState(() => new Set())
  const items = (customer && store.kyc?.[customer.name])
    || (store.config?.kycItems || []).map(n => ({ name: n, state: 'Missing', when: '' }))
  const leadKycVerified = opp.leadVerification?.status === 'Verified'
  const displayedKycStatus = leadKycVerified ? 'Valid' : (customer?.kyc || '—')
  const fee = store.config?.amberFee || { amount: 25000, cur: 'INR', days: 7 }
  const setState = (item, state, file, mode) => customer && store.setKycState(customer.name, item, state, file, mode)
  const simulateAllKycDone = () => {
    if (!customer || !canVerify || busy) return
    items.forEach(item => store.setKycState(customer.name, item.name, 'Verified', undefined, 'simulated'))
  }
  // items.forEach(item => store.setKycState(customer.name, item.name, 'Verified'))
  // item.key === 'kyc' && <button className="exception-action" onClick={() => openTransitionTab('customer')}>Open Customer/KYC</button>
  // Request {item.approvalType.toLowerCase()} from {blockerOwner(item)}

  const fileInput = useRef(null)
  const pending = useRef('')
  const [busy, setBusy] = useState('')
  const [viewing, setViewing] = useState(null)
  const [viewingLeadId, setViewingLeadId] = useState('')
  const [menuFor, setMenuFor] = useState('')
  const menuRef = useRef(null)

  const openAttachment = (attachment, leadId) => {
    setViewing(attachment)
    setViewingLeadId(leadId)
  }

  useEffect(() => {
    setDetails({
      billingAddress: opp.billingAddress ?? sourceBilling ?? customer?.billingAddress ?? '',
      shippingAddress: opp.shippingAddress ?? sourceShipping ?? customer?.shippingAddress ?? '',
      shippingPincode: opp.shippingPincode ?? sourcePincode ?? customer?.shippingPincode ?? '',
      gstin: opp.gstin ?? sourceGstin ?? customer?.gstin ?? '',
    })
    setDetailSaved(false)
    setDirtyDetailKeys(new Set())
  }, [opp.id, customer?.name, sourceBilling, sourceShipping, sourcePincode, sourceGstin])

  const updateDetail = (key, value) => {
    setDetails(previous => ({ ...previous, [key]: value }))
    setDetailSaved(false)
    setDirtyDetailKeys(previous => {
      const next = new Set(previous)
      if (normalizeDetailValue(value) === normalizeDetailValue(detailSeed[key])) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const normalizeDetailValue = value => String(value ?? '').trim()
  const detailChanged = key => dirtyDetailKeys.has(key)
  const detailsDirty = dirtyDetailKeys.size > 0

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
    setDirtyDetailKeys(new Set())
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
      const localCandidate = extractKycIdentityCandidate(itemName, doc.text || '')
      let scan = localCandidate
        ? { value: localCandidate.value, confidence: localCandidate.confidence || 100, source: 'local-document-scan', evidence: localCandidate.evidence || '' }
        : null
      if (!scan) {
        const aiAttachments = await aiAttachmentPayload([file])
        if (doc.text || aiAttachments.length) {
          const result = await runTaskResult('kyc.extract', {
            item: itemName,
            key: kycIdentityKey(itemName) || 'NONE',
            text: doc.text || '',
            aiAttachments,
          }, { model: store.config?.aiModel?.model })
          const data = result.data?.data || result.data
          if (data) scan = {
            value: normalizeKycCandidate(data.value),
            confidence: Math.max(0, Math.min(100, Number(data.confidence) || 0)),
            source: 'ai-document-scan', evidence: String(data.evidence || ''),
            warnings: Array.isArray(data.warnings) ? data.warnings : [],
          }
          else scan = { value: '', confidence: 0, source: 'unavailable', evidence: result.error || 'AI scan unavailable' }
        } else scan = { value: '', confidence: 0, source: 'unreadable', evidence: doc.err || 'No readable text or supported visual content' }
      }
      meta.scan = scan
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
                <tr><td>Category</td><td>{displayedCategory}</td></tr>
                <tr><td>KYC status</td><td>{displayedKycStatus}</td></tr>
                <tr><td>Payment record</td><td>{customer.payment || sourcePayment || '—'}</td></tr>
              </tbody>
            </table>
            {(sourceIdentity.eucName || sourceIdentity.eucLocation || sourceIdentity.contactPerson || sourceIdentity.contactPhone) && (
              <table className="cost-table" style={{ width: '100%', marginTop: 10 }}>
                <tbody>
                  <tr><td>EUC / site</td><td>{opp.eucName || sourceIdentity.eucName || '—'}</td></tr>
                  <tr><td>EUC location</td><td>{opp.eucLocation || sourceIdentity.eucLocation || opp.location || '—'}</td></tr>
                  <tr><td>Lead contact</td><td>{opp.contactPerson || sourceIdentity.contactPerson || '—'}{(opp.contactPhone || sourceIdentity.contactPhone) && ` · ${opp.contactPhone || sourceIdentity.contactPhone}`}</td></tr>
                </tbody>
              </table>
            )}
            <div className="section-title" style={{ marginTop: 14 }}>Customer commercial details</div>
            <p className="hint" style={{ marginTop: 4 }}>
              Optional at registration. Complete before the final quotation or invoice.
            </p>
            <div className="dgrid2 customer-commercial-grid" style={{ marginTop: 8 }}>
              <label className="customer-commercial-field">Billing address
                <textarea className={detailChanged('billingAddress') ? 'customer-detail-changed' : undefined} rows={2} value={details.billingAddress} onChange={e => updateDetail('billingAddress', e.target.value)} placeholder="Add billing address" />
              </label>
              <label className="customer-commercial-field">Shipping address
                <textarea className={detailChanged('shippingAddress') ? 'customer-detail-changed' : undefined} rows={2} value={details.shippingAddress} onChange={e => updateDetail('shippingAddress', e.target.value)} placeholder="Add shipping address" />
              </label>
              <label className="customer-commercial-field">Shipping pincode
                <input className={detailChanged('shippingPincode') ? 'customer-detail-changed' : undefined} value={details.shippingPincode} onChange={e => updateDetail('shippingPincode', e.target.value)} placeholder="e.g. 440001" inputMode="numeric" />
              </label>
              <label className="customer-commercial-field">GSTIN
                <input className={detailChanged('gstin') ? 'customer-detail-changed' : undefined} value={details.gstin} onChange={e => updateDetail('gstin', e.target.value.toUpperCase())} placeholder="Add GSTIN" />
              </label>
            </div>
            <div className="toolbar" style={{ marginTop: 8, marginBottom: 0 }}>
              <button type="button" className={detailsDirty ? 'primary customer-details-save-button is-dirty' : 'customer-details-save-button'} onClick={saveCustomerDetails} disabled={!detailsDirty}>Save customer details</button>
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
            {opp.leadVerification.type === 'KYC' && Object.entries(opp.leadVerification.items || {}).map(([name, item]) => {
              const attachment = leadVerificationAttachment(sourceLead, name, item)
              return (
              <div className="check-row" key={name}>
                <Icon name="check" size={14} />
                <span style={{ flex: 1 }}>
                  {name}
                  {(item.value || (sourceLead && verificationItem(sourceLead.verification, name).value)) && (
                    <span className="hint" style={{ marginLeft: 8 }}>
                      ID: {item.value || verificationItem(sourceLead.verification, name).value}
                    </span>
                  )}
                </span>
                <Chip tone="state-Accepted">{item.mode === 'simulated' ? 'Verified (simulated)' : 'Verified (uploaded)'}</Chip>
                {attachment && sourceLead?.id && (
                  <button type="button" className="kyc-file-open lead-verification-file-open"
                    onClick={() => openAttachment(attachment, sourceLead?.id || '')}
                    title={`View ${name} document`}>
                    <Icon name="eye" size={12} /> View document
                  </button>
                )}
              </div>
              )
            })}
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
                <button type="button" className="kyc-file-open" onClick={() => openAttachment(k.file, kycBlobKey(customer.name))}
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
      {viewing && viewingLeadId && (
        <AttachmentViewer leadId={viewingLeadId} attachment={viewing} onClose={() => { setViewing(null); setViewingLeadId('') }} />
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
  ['additionalCustomerInformation', 'Additional customer information'],
]
const opportunityFieldLabel = key => OPP_FIELD_OPTIONS.find(([field]) => field === key)?.[1] || key

function AiFieldSuggestion({ suggestion, onConfirm, onReject }) {
  if (!suggestion?.key || !suggestion.value) return null
  return <div className="ai-field-suggestion">
    <div><b>AI suggests updating {opportunityFieldLabel(suggestion.key)}</b> to <span>{suggestion.value}</span></div>
    <div className="hint">Confidence {suggestion.confidence ?? '—'}% · Evidence: {suggestion.evidence || 'Customer reply'}</div>
    <div className="ai-field-actions"><button className="primary" onClick={onConfirm}>Confirm update</button><button onClick={onReject}>Reject suggestion</button></div>
  </div>
}

// ---------------------------------------------------------------------------
const CLAR_SUGGESTIONS = {
  Spares: [
    { category: 'Technical', gap: 'Part identification incomplete', q: 'Please confirm nameplate part numbers, quantities and any legacy / superseded references for each BOQ line.', evidence: 'RFQ BOQ lines' },
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

const clarTone = s => (['Answered', 'Covered by source', 'Covered by answer'].includes(s) ? 'state-Accepted' : ['Sent', 'Needs review'].includes(s) ? 'state-Review' : 'grey')
const clarificationStatus = (clarification, covered = false, coveredByAnswer = false) => covered
  ? 'Covered by source'
  : coveredByAnswer ? 'Covered by answer' : isClarificationResolved(clarification) ? 'Answered' : clarification.status

function ClarificationsTab({ opp, sourceText = '', compact = false }) {
  const store = useStore()
  // Legacy commercial rows remain in state for audit history, but they are not
  // customer clarifications and must not appear in this workflow or its counts.
  // The same topic-level list drives the cards and lifecycle gates. Repeated
  // imports remain auditable in state, but one completed answer clears the
  // shared customer fact instead of leaving a hidden duplicate open.
  const rows = displayClarifications(opp, store)
  const coveredIds = new Set(rows.filter(c => isClarificationCoveredBySource(opp, c, store)).map(c => c.id))
  const coveredByAnswerIds = new Set(rows.filter(c => isClarificationCoveredByAnswer(opp, c, rows)).map(c => c.id))
  // Sent questions are still waiting for the customer's reply. Only answered
  // questions should be excluded from the single-reply update flow.
  const open = rows.filter(c => !coveredIds.has(c.id) && !coveredByAnswerIds.has(c.id) && !isClarificationResolved(c))
  const awaitingReply = rows.filter(c => !coveredIds.has(c.id) && !coveredByAnswerIds.has(c.id) && !isClarificationResolved(c) && c.status === 'Sent').length
  const needsReview = rows.filter(c => !coveredIds.has(c.id) && !coveredByAnswerIds.has(c.id) && !isClarificationResolved(c) && c.status === 'Needs review').length
  const answered = rows.filter(c => !coveredIds.has(c.id) && (coveredByAnswerIds.has(c.id) || isClarificationResolved(c))).length
  const covered = coveredIds.size
  const [draftOpen, setDraftOpen] = useState(false)
  const [draft, setDraft] = useState(null)
  const [sentOk, setSentOk] = useState(false)
  const [sendErr, setSendErr] = useState('')
  const [busy, setBusy] = useState('') // '' | 'suggest' | 'draft'
  const [suggestErr, setSuggestErr] = useState('')
  const [manualOpen, setManualOpen] = useState(false)
  const [manualForm, setManualForm] = useState({ category: 'Technical', gap: '', q: '' })
  const [manualErr, setManualErr] = useState('')
  const [manualOk, setManualOk] = useState('')
  const autoSuggestRef = useRef('')
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
    setSuggestErr('')
    try {
      const proposal = store.getProposal(opp.id)
      const deviations = (proposal.terms || []).filter(t => t.status === 'Deviation')
      const existingQuestions = rows.map(c => ({ question: c.q, status: c.status, missing: c.missing || '' }))
      const ai = await runJson('clarification.suggest', {
        oppName: opp.oppName, sellTo: opp.sellTo, route: opp.route, segment: opp.segment,
        eucName: opp.eucName, location: opp.location, remarks: opp.remarks,
        lines: (proposal.lines || []).map(l => ({ pn: l.pn, desc: l.desc, qty: l.qty })),
        deviations: deviations.map(t => ({ term: t.term, customerAsk: t.customerAsk, ourResponse: t.ourResponse })),
        existing: existingQuestions,
        currentFields: { oppName: opp.oppName, rfqNumber: opp.rfqNumber, sellTo: opp.sellTo, category: opp.category, location: opp.location, eucName: opp.eucName, eucLocation: opp.eucLocation, contactPerson: opp.contactPerson, contactPhone: opp.contactPhone },
      }, { fallback: store.config?.aiModel?.provider === 'Built-in fallback' })
      const due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
      const aiRows = (ai?.rows || []).filter(row => row?.q && !isCommercialConfirmationRow(row)
        && !(sourceContainsDeliveryRequirement(sourceText) && isDeliveryBasisClarification(row)))
      // Commercial deviations are decisions for Sales/Approval, never generated
      // customer questions. Route templates may still ask for genuinely missing
      // delivery/site data, which is a different fact than negotiating a known
      // delivery term.
      const fallbackRows = (CLAR_SUGGESTIONS[opp.route] || CLAR_SUGGESTIONS.Project)
        .filter(row => !(sourceContainsDeliveryRequirement(sourceText) && isDeliveryBasisClarification(row)))
      const selected = aiRows.length ? aiRows : fallbackRows.filter(row => row?.q)
      for (const s of selected) {
        store.addClarification({ ...s, oppId: opp.id, owner: opp.owner, audience: 'Customer', due, status: 'Open' })
      }
      if (selected.length) store.updateOpportunity(opp.id, { autoClarificationSuggestedAt: new Date().toISOString() })
    } catch (error) {
      setSuggestErr(`Could not generate clarification questions: ${error?.message || String(error)}`)
    } finally {
      setBusy('')
    }
  }

  const autoSuggestSignature = JSON.stringify({
    opp: [opp.id, opp.oppName, opp.sellTo, opp.route, opp.segment, opp.eucName, opp.location, opp.remarks, opp.rfqNumber, opp.category, opp.eucLocation, opp.contactPerson, opp.contactPhone],
    sourceText,
    proposal: store.getProposal(opp.id),
  })

  useEffect(() => {
    // Automatic discovery is an onboarding action, not a poll. Once an
    // opportunity has clarifications (or the first attempt was recorded),
    // revisiting this page must not call the AI again.
    if (!autoSuggestSignature || rows.length || opp.autoClarificationSuggestedAt || busy || autoSuggestRef.current === autoSuggestSignature) return
    autoSuggestRef.current = autoSuggestSignature
    suggest()
  }, [autoSuggestSignature, busy, rows.length, opp.autoClarificationSuggestedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveManualQuestion = event => {
    event.preventDefault()
    const category = manualForm.category.trim()
    const gap = manualForm.gap.trim()
    const q = manualForm.q.trim()
    if (!category || !gap || !q) {
      setManualErr('Add a category, gap and customer question before saving.')
      return
    }
    store.addClarification({
      category, gap, q, evidence: 'Manual entry', oppId: opp.id, owner: opp.owner,
      audience: 'Customer', due: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), status: 'Open',
    })
    setManualForm({ category: 'Technical', gap: '', q: '' })
    setManualErr('')
    setManualOpen(false)
    setManualOk('Manual clarification added and sourcing remains blocked until it is answered.')
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

  const confirmAiField = clarification => {
    const suggestion = clarification.aiFieldSuggestion
    store.confirmClarificationField(clarification.id, { field: suggestion?.key, value: suggestion?.value })
  }

  const rejectAiField = clarification => store.rejectClarificationField(clarification.id)

  const saveCustomerReply = async () => {
    if (!replyForm.body.trim() && !replyFiles.length) {
      setReplyErr('Paste the customer reply or attach the email/file first.')
      return
    }
    setBusy('reply')
    setReplyErr('')
    const attachments = []
    const attachmentMeta = []
    const aiAttachments = []
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
    aiAttachments.push(...await aiAttachmentPayload(replyFiles))
    const aiResult = await runTaskResult('clarification.answer', {
      oppName: opp.oppName,
      customer: opp.sellTo,
      from: replyForm.from,
      subject: replyForm.subject,
      receivedAt: replyForm.receivedAt,
      body: replyForm.body,
      attachments,
      aiAttachments,
      questions: open.map(c => ({ id: c.id, question: c.q, category: c.category, gap: c.gap })),
      fieldOptions: OPP_FIELD_OPTIONS.filter(([key]) => key).map(([key, label]) => ({ key, label })),
      currentFields: Object.fromEntries(OPP_FIELD_OPTIONS.filter(([key]) => key).map(([key]) => [key, opp[key] || ''])),
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
      const fieldKey = OPP_FIELD_OPTIONS.some(([key]) => key === row.fieldKey) ? row.fieldKey : ''
      const fieldValue = String(row.fieldValue || '').trim()
      if (row.status === 'Answered' && fieldKey && fieldValue) {
        store.stageClarificationAnswer(row.id, {
          response: String(row.response).trim(),
          answerSource: 'Customer',
          answeredAt: replyForm.receivedAt,
          attachments: attachmentMeta,
          evidence: row.evidence,
          aiConfidence: row.confidence,
          status: row.status,
          missing: String(row.missing || '').trim(),
          fieldSuggestion: { key: fieldKey, value: fieldValue, evidence: String(row.fieldEvidence || row.evidence || '').trim(), confidence: row.confidence },
        })
      } else {
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
      if (opp.route === 'Spares' && row.status === 'Answered') {
        const requested = extractCustomerSparesLines(row.response, row.lineItems, store.priceLists)
        if (requested.length) store.syncClarificationSpares(opp.id, row.id, requested, {
          answeredAt: replyForm.receivedAt,
          answerSource: 'Customer',
        })
      }
    }
    const answered = matches.filter(row => row.status === 'Answered').length
    const needsReview = matches.filter(row => row.status === 'Needs review').length
    const fieldSuggestions = matches.filter(row => row.status === 'Answered' && OPP_FIELD_OPTIONS.some(([key]) => key === row.fieldKey) && String(row.fieldValue || '').trim()).length
    const remaining = Math.max(0, open.length - answered - needsReview)
    setBusy('')
    setReplyOpen(false)
    setReplyFiles([])
    setReplyOk(matches.length
      ? `AI checked the reply: ${answered} answered${fieldSuggestions ? `, ${fieldSuggestions} need field confirmation` : ''}${needsReview ? `, ${needsReview} need review` : ''}${remaining ? `, ${remaining} unanswered` : ''}. Customer reply saved.`
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
    if (opp.route === 'Spares') {
      const requested = extractCustomerSparesLines(answerForm.response, [], store.priceLists)
      if (requested.length) store.syncClarificationSpares(opp.id, answerFor.id, requested, {
        answeredAt: answerForm.receivedAt,
        answerSource: answerForm.answerSource,
      })
    }
    setBusy('')
    setAnswerFor(null)
  }

  return (
    <div>
      <div className="toolbar clarification-actions">
        <button className="clarification-action" onClick={suggest} disabled={!!busy}>
          <Icon name="sparkles" size={13} /> {busy === 'suggest' ? 'Thinking…' : 'AI: suggest questions'}
        </button>
        <button className="clarification-action" onClick={() => { setManualOpen(open => !open); setManualErr(''); setManualOk('') }} disabled={!!busy}>
          <Icon name="plus" size={13} /> Add question manually
        </button>
        <button className="clarification-action" onClick={openDraft} disabled={!open.length || !!busy}
          title={open.length ? '' : 'No open questions to draft from'}>
          <Icon name="mail" size={13} /> {busy === 'draft' ? 'Drafting…' : 'AI: draft email'}
        </button>
        <button className="clarification-action" onClick={openCustomerReply} disabled={!open.length || !!busy}
          title={open.length ? 'Paste one customer reply and attach supporting files' : 'No open questions'}>
          <Icon name="upload" size={13} /> Update information
        </button>
        <span className="spacer" />
      </div>
      {busy === 'suggest' && <div className="hint clarification-auto-status" role="status">Checking the enquiry and proposal for missing customer information…</div>}
      {suggestErr && <div className="errbox">{suggestErr}</div>}
      {manualOk && <div className="okbox">{manualOk}</div>}
      {manualOpen && <form className="clarification-manual-form" onSubmit={saveManualQuestion}>
        <div className="section-title">Add a required customer question</div>
        <p className="hint">Use this when the automatic suggestions miss a customer-specific gap. It will block sourcing until answered.</p>
        <div className="clarification-manual-fields">
          <label>Category<input value={manualForm.category} onChange={e => setManualForm(form => ({ ...form, category: e.target.value }))} placeholder="Technical" /></label>
          <label>Gap<input value={manualForm.gap} onChange={e => setManualForm(form => ({ ...form, gap: e.target.value }))} placeholder="What information is missing?" /></label>
          <label className="clarification-manual-question">Customer question<textarea rows={2} value={manualForm.q} onChange={e => setManualForm(form => ({ ...form, q: e.target.value }))} placeholder="Write the exact question to send to the customer" /></label>
        </div>
        {manualErr && <div className="errbox">{manualErr}</div>}
        <div className="toolbar clarification-manual-actions">
          <button className="primary" type="submit">Save required question</button>
          <button type="button" onClick={() => setManualOpen(false)}>Cancel</button>
        </div>
      </form>}
      {sentOk && <div className="okbox">Clarification email sent and logged in Communications.</div>}
      {replyOk && <div className="okbox">{replyOk}</div>}
      {compact && <div className={`clarification-status ${open.length ? 'is-blocked' : 'is-clear'}`} role="status">
        <div><b>{open.length ? 'Sourcing is blocked' : 'Clarifications resolved'}</b><span>{open.length ? ' Answer every customer clarification before moving to Spares Sourcing.' : ' All customer clarifications are resolved.'}</span></div>
        <div className="clarification-counts" aria-label="Clarification status summary">
          <span><b>{rows.length}</b> total</span><span><b>{open.length}</b> open</span><span><b>{awaitingReply}</b> awaiting reply</span><span><b>{needsReview}</b> needs review</span><span><b>{answered}</b> answered</span><span><b>{covered}</b> covered by source</span>
        </div>
      </div>}
      {compact && <div className="clarification-cards">
        {rows.map((c, index) => (
          <article className="clarification-card" key={c.id}>
            <div className="clarification-card-head">
              <div className="clarification-card-label"><b>{c.category}</b><span>Clarification {index + 1}</span></div>
              <Chip tone={clarTone(clarificationStatus(c, coveredIds.has(c.id), coveredByAnswerIds.has(c.id)))}>{clarificationStatus(c, coveredIds.has(c.id), coveredByAnswerIds.has(c.id))}</Chip>
            </div>
            <div className="clarification-card-question">{c.q}</div>
            <div className="clarification-card-meta"><span><b>Gap:</b> {c.gap}</span><span><b>Evidence:</b> {c.evidence || '—'}</span><span><b>Owner:</b> {displayRole(c.owner)}</span><span><b>Due:</b> {ddMmmYY(c.due) || '—'}</span></div>
            {(c.response || c.missing) && <div className={`clarification-answer-box ${c.status === 'Needs review' ? 'needs-review' : 'answered'}`}>{c.response && <>Response: {c.response}</>}{c.missing && <div className="hint"><b>Still needed:</b> {c.missing}</div>}<div className="hint">From {c.answerSource || c.audience || 'source'}{c.answeredAt ? ` · ${ddMmmYY(c.answeredAt)}` : ''}</div>{c.answerEvidence && <div className="hint">Evidence: {c.answerEvidence}</div>}{(c.attachments || []).map(f => <div key={f.name} className="hint"><Icon name="fileText" size={11} /> {f.name}</div>)}</div>}
            <AiFieldSuggestion suggestion={c.aiFieldSuggestion} onConfirm={() => confirmAiField(c)} onReject={() => rejectAiField(c)} />
            <div className="clarification-card-actions">
              <label>Updates field<select value={c.field || ''} disabled={coveredIds.has(c.id) || coveredByAnswerIds.has(c.id) || isClarificationResolved(c)} title="Once answered, apply this response straight to that Opportunity Details field" onChange={e => store.updateClarification(c.id, { field: e.target.value })}>{OPP_FIELD_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              <button disabled={coveredIds.has(c.id) || coveredByAnswerIds.has(c.id)} onClick={() => openAnswer(c)}>{coveredIds.has(c.id) ? 'Source already covers this' : coveredByAnswerIds.has(c.id) ? 'Covered by another answer' : isClarificationResolved(c) ? 'Edit information' : 'Update information'}</button>
            </div>
          </article>
        ))}
        {!rows.length && <div className="clarification-empty">No clarifications yet. Use “AI: suggest questions” to identify missing customer information.</div>}
      </div>}
      {!compact && <div className="sheet-wrap">
        <table className="sheet">
          <thead><tr><th>ID</th><th>Category</th><th>Gap / evidence</th><th>Question</th><th>Owner</th><th>Audience</th><th>Due</th><th>Status</th><th>Updates field</th><th></th></tr></thead>
          <tbody>
            {rows.map(c => (
              <tr key={c.id}>
                <td>{c.id}</td>
                <td>{c.category}</td>
                <td>{c.gap}<div className="hint">{c.evidence}</div></td>
                <td>{c.q}{(c.response || c.missing) && <div className={`clarification-answer-box ${c.status === 'Needs review' ? 'needs-review' : 'answered'}`}>{c.response && <>Response: {c.response}</>}{c.missing && <div className="hint"><b>Still needed:</b> {c.missing}</div>}<div className="hint">From {c.answerSource || c.audience || 'source'}{c.answeredAt ? ` · ${ddMmmYY(c.answeredAt)}` : ''}</div>{c.answerEvidence && <div className="hint">Evidence: {c.answerEvidence}</div>}{(c.attachments || []).map(f => <div key={f.name} className="hint"><Icon name="fileText" size={11} /> {f.name}</div>)}</div>}<AiFieldSuggestion suggestion={c.aiFieldSuggestion} onConfirm={() => confirmAiField(c)} onReject={() => rejectAiField(c)} /></td>
                <td>{displayRole(c.owner)}</td>
                <td>{c.audience}</td>
                <td>{ddMmmYY(c.due)}</td>
                <td><Chip tone={clarTone(clarificationStatus(c, coveredIds.has(c.id), coveredByAnswerIds.has(c.id)))}>{clarificationStatus(c, coveredIds.has(c.id), coveredByAnswerIds.has(c.id))}</Chip></td>
                <td>
                  <select value={c.field || ''} disabled={coveredIds.has(c.id) || coveredByAnswerIds.has(c.id) || isClarificationResolved(c)}
                    title="Once answered, apply this response straight to that Opportunity Details field"
                    onChange={e => store.updateClarification(c.id, { field: e.target.value })}>
                    {OPP_FIELD_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </td>
                <td>
                  <button disabled={coveredIds.has(c.id) || coveredByAnswerIds.has(c.id)} onClick={() => openAnswer(c)}>{coveredIds.has(c.id) ? 'Source already covers this' : coveredByAnswerIds.has(c.id) ? 'Covered by another answer' : isClarificationResolved(c) ? 'Edit information' : 'Update information'}</button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={10} className="hint">No clarifications yet — let the AI suggest questions from detected gaps.</td></tr>}
          </tbody>
        </table>
      </div>}

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
function SourcingTab({ opp, goTab, onConfirmScope, onContinueToProposal }) {
  const store = useStore()
  const sourcingLines = store.sparesLines.filter(l => l.oppId === opp.id && !isPlaceholderSparesLine(l))
  const superseded = sourcingLines.some(l => String(l.match).toLowerCase().includes('superseded'))

  if (opp.route === 'Service') {
    return <div className="ana-grid service-sourcing-workbench">
      <div className="ana-card c-12">
        <ServiceScopePanel opp={opp} onContinue={onConfirmScope} />
      </div>
    </div>
  }

  return (
    <div className="ana-grid">
      {opp.route === 'Spares' && (
        <div className="ana-card c-12 sourcing-spares-workbench">
          <WbSpares opp={opp} openBuilder={() => goTab('proposal')} onContinue={onContinueToProposal} />
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
    </div>
  )
}
// ---------------------------------------------------------------------------
function FollowUpTab({ opp, goTab }) {
  return <FollowUpPane opp={opp} onRevision={() => goTab('sourcing')} />
}

function ServiceDeliveryClose({ opp }) {
  return (
    <div className="ana-grid service-delivery-close">
      <div className="ana-card c-12">
        <div className="service-panel-kicker">Service execution</div>
        <ServiceExecutionPanel opp={opp} />
      </div>
      <div className="ana-card c-12">
        <div className="service-panel-kicker">Service closeout</div>
        <ServiceReportPanel opp={opp} />
      </div>
      <div className="ana-card c-12">
        <div className="service-panel-kicker">Billing</div>
        <ServiceInvoicePanel opp={opp} />
      </div>
    </div>
  )
}

function ProposalTab({ opp, goTab, onConfirmSent }) {
  const [sub, setSub] = useState(opp.route === 'Service' ? 'workbench' : 'edit-sheet')
  const openBuilder = () => setSub('builder')
  // Diagram 02 §3 is the Brownfield lane only — Greenfield runs Phase-1
  // activities and Service runs the §4 survey path instead.
  const SUBS = [['edit-sheet', 'Edit proposal']]
  return (
    <div className="proposal-tab-shell">
      {sub === 'workbench' && (
        opp.route === 'Spares' ? <WbSpares opp={opp} openBuilder={openBuilder} />
        : opp.route === 'Service' ? <WbService opp={opp} focus="offer" openBuilder={openBuilder} onConfirmSent={onConfirmSent} />
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

// The real customer document, not a summary of it. A successfully validated
// upload is the authoritative workbook; otherwise this uses the generated
// document model shared by the Builder and printer.
function PreviewPane({ opp, openBuilder, openEditSheet }) {
  const store = useStore()
  const props = buildDocProps(store, opp.id)
  if (!props) return <div className="form-card">Unknown opportunity.</div>
  const { p, doc, priced, totals, lineQuoted } = props
  const uploadedWorkbook = validatedWorkbookPreview(p)
  return (
    <div className="proposal-preview-pane">
      <div className="proposal-preview-toolbar">
        <span className="hint">
          {hasValidatedUploadedWorkbook(p)
            ? `Validated uploaded workbook · Rev-${p.revision} · Read-only preview`
            : <>Customer-facing document · Rev-{p.revision} · Read-only preview{!priced && ' · prices hidden'}</>}
        </span>
        <button className="linklike" onClick={openEditSheet}>
          <Icon name="fileSheet" size={13} /> Edit in the Sheet
        </button>
      </div>
      <div className="proposal-preview-scroll">
        {uploadedWorkbook
          ? <WorkbookPreview workbook={uploadedWorkbook} />
          : <PrintDoc p={p} opp={opp} doc={doc} priced={priced} totals={totals} lineQuoted={lineQuoted} />}
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
    if (action === 'accepted-po') store.setMilestone(opp.id, 'PO Validation', 'Customer accepted proposal — PO required', { alreadyGated: true })
    if (action === 'rejected') store.closeLost(opp.id, 'Others')
    if (action === 'revision') {
      const type = revisionType || result?.revisionType || REVISION_TYPES[0].id
      store.reviseProposal(opp.id, result?.nextStep || result?.summary || 'Customer requested a proposal change', type)
      onRevision?.()
    }
    if (action === 'follow-up') store.setMilestone(opp.id, 'Follow-up', result?.nextStep || 'Customer reply requires follow-up', { alreadyGated: true })
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
  const [mailType, setMailType] = useState('follow-up')
  const [mailFrom, setMailFrom] = useState(store.config?.gmailAccount || store.config?.commonMailbox || 'sales@mod-ae.com')
  const customer = (store.customers || []).find(c => c.id === opp.customerId || c.name === opp.sellTo)
  const [mailTo, setMailTo] = useState(opp.contactEmail || customer?.email || '')
  const [mailCc, setMailCc] = useState('')
  const [mailSubject, setMailSubject] = useState('')
  const [mailError, setMailError] = useState('')
  const [draftCommunicationId, setDraftCommunicationId] = useState('')
  const [mailNotice, setMailNotice] = useState('')
  // Diagram 02 §7 "Opportunity Lost — Capture Loss Reason" and §8 competitor
  // tracking. Both close-out branches live beside the follow-up loop they end.
  const [lossReason, setLossReason] = useState('')
  const [lossReasonNote, setLossReasonNote] = useState('')
  const [lossCompetitor, setLossCompetitor] = useState('')
  const [closeOutcome, setCloseOutcome] = useState('')
  const [wonReason, setWonReason] = useState('')
  const [wonReasonNote, setWonReasonNote] = useState('')
  const [compName, setCompName] = useState('')
  const [compNote, setCompNote] = useState('')

  const updateCommercialConfirmation = (index, status) => {
    const current = store.getProposal(opp.id)
    const terms = (current.terms || []).map((term, i) => i === index ? { ...term, customerConfirmationStatus: status } : term)
    store.saveProposal(opp.id, { ...current, terms })
  }

  const competitors = (store.competitors || []).filter(c => c.oppId === opp.id)
  const validityDays = opp.validityDays || 30
  const age = opp.proposalDate ? ageDays(opp.proposalDate) : null
  const left = age == null ? null : validityDays - age
  const proposalSentAt = opp.proposalDate ? new Date(opp.proposalDate).getTime() : 0
  const customerReplied = commsRows.some(c => (c.dir === 'In' || c.direction === 'inbound')
    && (!proposalSentAt || new Date(c.ts || 0).getTime() >= proposalSentAt))
  const canEscalate = age != null && age >= 14 && !customerReplied
  const escalationUser = (store.users || []).find(u => String(u.role || '').toLowerCase() === 'ljs'
    && String(u.status || '').toLowerCase() !== 'disabled')

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
    setMailType('follow-up')
    setMailFrom(store.config?.gmailAccount || store.config?.commonMailbox || 'sales@mod-ae.com')
    setMailTo(opp.contactEmail || customer?.email || '')
    setMailCc('')
    setMailSubject(`Follow-up — ${opp.oppName}`)
    setMailError('')
    setDraftCommunicationId('')
    setMailNotice('')
    setFuDraft(text?.trim() || templateFu())
    setFuOpen(true)
  }

  const openEscalation = () => {
    if (!canEscalate) return
    const latestHistory = commsRows.filter(c => c.kind === 'follow-up' || c.kind === 'submission')
      .slice(0, 4).map(c => `${c.ts ? ddMmmYY(c.ts.slice(0, 10)) : 'Date not recorded'} · ${c.kind} · ${c.subject || ''} · ${c.status || 'logged'}`).join('\n')
    setMailType('escalation')
    setMailFrom(store.config?.gmailAccount || store.config?.commonMailbox || 'sales@mod-ae.com')
    setMailTo(escalationUser?.email || '')
    setMailCc('')
    setMailSubject(`No-response escalation — ${opp.id} — ${opp.oppName}`)
    setFuDraft([
      `Hi ${escalationUser?.name || 'LJS'},`, '',
      `Please review this opportunity: ${opp.oppName} (${opp.id}), customer ${opp.sellTo || 'not recorded'}, route ${opp.route || 'not recorded'}.`,
      `The proposal was submitted ${age} day(s) ago (${ddMmmYY(opp.proposalDate)}). No customer reply is recorded since submission.`,
      `Owner: ${displayRole(opp.owner)}. Current milestone: ${opp.milestone || opp.stage || 'not recorded'}.`,
      '', 'Recent proposal/follow-up history:', latestHistory || 'No submission or follow-up communication is recorded.',
      '', 'Please advise on the next action. This is an internal escalation; no message has been sent to the customer.',
      '', 'Regards,', displayRole(opp.owner),
    ].join('\n'))
    setMailError('')
    setDraftCommunicationId('')
    setMailNotice('')
    setFuOpen(true)
  }

  const openMailDraft = () => {
    setMailError('')
    if (!EMAIL_RE.test(mailFrom.trim())) { setMailError('Enter a valid From email address.'); return }
    if (!recipientsValid(mailTo)) { setMailError('Enter one or more valid recipient email addresses.'); return }
    if (splitRecipients(mailCc).length && !recipientsValid(mailCc)) { setMailError('Check the CC email address(es).'); return }
    const href = gmailComposeHref({ to: mailTo, cc: mailCc, subject: mailSubject, body: fuDraft })
    if (!href) { setMailError('Enter a recipient email address before opening Gmail.'); return }
    const draftWindow = window.open(href, '_blank')
    if (!draftWindow) { setMailError('Chrome blocked the Gmail tab. Allow pop-ups for this site and try again.'); return }
    const id = `CM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    store.addCommunication(opp.id, {
      id, direction: 'outbound', from: mailFrom.trim(), to: mailTo.trim(), cc: mailCc.trim(),
      subject: mailSubject.trim(), body: fuDraft, kind: mailType === 'escalation' ? 'escalation' : 'follow-up', status: 'draft',
    })
    setDraftCommunicationId(id)
    setMailNotice('Gmail draft opened. Review and send it in Gmail, then mark it sent here.')
  }

  const markMailSent = () => {
    if (!draftCommunicationId) return
    store.updateCommunication(opp.id, draftCommunicationId, { status: 'sent' }, `${mailType === 'escalation' ? 'Escalation' : 'Follow-up'} email marked as sent`)
    setMailNotice('Email marked as sent in Communications.')
    setDraftCommunicationId('')
  }

  return (
    <div className="ana-grid follow-up-grid">
      <div className="ana-card c-6 follow-up-panel follow-up-communications-panel">
        {(p.terms || []).some(term => term.decision === 'Counter-offer with ModAE standard terms') && <section className="form-card commercial-followup-panel" aria-label="Commercial confirmations">
          <div className="section-title">Commercial Confirmation Required</div>
          <p className="hint">Record the customer's response to each ModAE counter-offer. This does not change the internal approval decision.</p>
          {(p.terms || []).map((term, index) => term.decision !== 'Counter-offer with ModAE standard terms' ? null : <div className="route-template-row" key={`commercial-followup-${index}`}>
            <b>{term.term}</b>
            <span>Customer asked: {term.customerAsk || '—'} · ModAE counter: {term.proposedTerm || term.ourResponse || '—'}</span>
            <select aria-label={`${term.term} customer confirmation`} value={term.customerConfirmationStatus || 'Awaiting reply'} onChange={e => updateCommercialConfirmation(index, e.target.value)}>
              {['Awaiting reply', 'Accepted', 'Rejected', 'Countered'].map(status => <option key={status}>{status}</option>)}
            </select>
          </div>)}
        </section>}
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
          <div key={i} className="check-row revision-history-row">
            {(() => {
              const openedRevision = String(r.rev || '').replace(/^Rev[- ]?/i, '')
              const historicalRevision = String(r.snapshot?.revision ?? openedRevision)
              const submission = latestSubmissionForRevision(store.communications?.[opp.id], historicalRevision)
              return <>
                <b>Rev-{historicalRevision}</b><span>{r.note}</span>
                {openedRevision !== historicalRevision && <span className="hint">Revision opened: Rev-{openedRevision}</span>}
                <Chip tone={submission?.status === 'sent' ? 'state-Accepted' : submission?.status === 'draft' ? 'state-Review' : 'grey'}>
                  {submissionStatusLabel(submission)}
                </Chip>
              </>
            })()}
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
          <button onClick={openEscalation} disabled={!canEscalate} title={!canEscalate ? 'Available after 14 days without a recorded customer reply' : ''}>
            <Icon name="sparkles" size={13} /> Draft escalation email
          </button>
        </div>
        {!canEscalate && !customerReplied && <p className="hint">Internal escalation to LJS is available after 14 days without a recorded customer reply. Until then, the opportunity owner should make a courtesy call.</p>}
        {customerReplied && <p className="hint">A customer reply is recorded after proposal submission. Review it before considering an internal escalation.</p>}
        {mailNotice && <div className="okbox">{mailNotice}</div>}
      </div>

      <div className="ana-card c-6 follow-up-panel">
        <div className="ana-title">Close-out</div>
        {opp.status === 'Closed' ? (
          <div className={opp.stage === 'Won' ? 'okbox' : 'warnbox'}>
            <div>Closed as <b>{opp.stage}</b>{opp.closedReason ? ` — ${opp.closedReason}` : ''}</div>
            {opp.stage !== 'Won' && <MarkWonControl opp={opp} store={store} />}
          </div>
        ) : (
          <>
            <p className="hint">
              Choose the outcome first, then record the reason used by win/loss analytics.
            </p>
            <div className="close-outcome-options" role="radiogroup" aria-label="Close opportunity outcome">
              <label className={`close-outcome-option lost${closeOutcome === 'Lost' ? ' selected' : ''}`}>
                <input type="radio" name={`close-outcome-${opp.id}`} value="Lost" checked={closeOutcome === 'Lost'}
                  onChange={() => setCloseOutcome('Lost')} />
                <span>Mark as Lost</span>
              </label>
              <label className={`close-outcome-option won${closeOutcome === 'Won' ? ' selected' : ''}`}>
                <input type="radio" name={`close-outcome-${opp.id}`} value="Won" checked={closeOutcome === 'Won'}
                  onChange={() => setCloseOutcome('Won')} />
                <span>Mark as Won</span>
              </label>
            </div>
            {closeOutcome === 'Lost' && (
              <div className="follow-up-form-stack">
                <div className="close-outcome-form">
                <select value={lossReason} onChange={e => setLossReason(e.target.value)} autoFocus>
                  <option value="">— loss reason (required) —</option>
                  {CLOSE_REASONS.map(r => <option key={r}>{r}</option>)}
                </select>
                {lossReason === 'Others' && <textarea value={lossReasonNote} onChange={e => setLossReasonNote(e.target.value)}
                  maxLength={240} rows={3} placeholder="Enter the loss explanation" />}
                <input placeholder="Competitor who won it (optional)" value={lossCompetitor}
                  onChange={e => setLossCompetitor(e.target.value)} />
                <button disabled={!lossReason || (lossReason === 'Others' && !lossReasonNote.trim())} title={lossReason ? '' : 'Select a loss reason first'}
                  onClick={() => {
                    store.closeLost(opp.id, lossReason, lossCompetitor.trim() ? { name: lossCompetitor.trim() } : null, lossReason === 'Others' ? lossReasonNote.trim() : '')
                    setCloseOutcome(''); setLossReason(''); setLossReasonNote(''); setLossCompetitor('')
                  }}>
                  <Icon name="flag" size={13} /> Close as lost
                </button>
                </div>
              </div>
            )}
            {closeOutcome === 'Won' && (
              <div className="follow-up-form-stack">
                <div className="close-outcome-form">
                <select value={wonReason} onChange={e => setWonReason(e.target.value)} autoFocus>
                  <option value="">— won reason (required) —</option>
                  {WON_REASONS.map(r => <option key={r}>{r}</option>)}
                </select>
                {wonReason === 'Other' && <textarea value={wonReasonNote} onChange={e => setWonReasonNote(e.target.value)}
                  maxLength={240} rows={3} placeholder="Enter the reason" />}
                <button disabled={!wonReason || (wonReason === 'Other' && !wonReasonNote.trim())}
                  title={wonReason ? '' : 'Select a won reason first'}
                  onClick={() => {
                    store.markWon(opp.id, wonReason, wonReason === 'Other' ? wonReasonNote.trim() : '') // store.markWon(opp.id, reason)
                    setCloseOutcome(''); setWonReason(''); setWonReasonNote('')
                  }}>
                  <Icon name="check" size={13} /> Close as won
                </button>
                </div>
              </div>
            )}
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
        <Modal title={mailType === 'escalation' ? 'Internal escalation email' : 'AI-drafted follow-up email'} onClose={() => setFuOpen(false)} wide>
          <div className="follow-up-email-fields">
            <label>From<input type="email" value={mailFrom} onChange={e => setMailFrom(e.target.value)} /></label>
            <label>To<input type="text" value={mailTo} onChange={e => setMailTo(e.target.value)} placeholder="Recipient email address(es)" /></label>
            <label>CC<input type="text" value={mailCc} onChange={e => setMailCc(e.target.value)} placeholder="Optional" /></label>
            <label>Subject<input value={mailSubject} onChange={e => setMailSubject(e.target.value)} /></label>
          </div>
          <label className="follow-up-email-body-label">Message<textarea rows={10} style={{ width: '100%' }} value={fuDraft} onChange={e => setFuDraft(e.target.value)} /></label>
          <WarnBox>Review the recipient and message in Gmail before sending.</WarnBox>
          {mailError && <ErrBox>{mailError}</ErrBox>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={() => setFuOpen(false)}>Cancel</button>
            {draftCommunicationId && <button onClick={markMailSent}><Icon name="check" size={13} /> Mark as sent</button>}
            <button className="primary" onClick={openMailDraft}><Icon name="mail" size={13} /> Open Gmail draft</button>
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
  const pricingRowsFor = a => {
    if (a.type !== 'Pricing threshold exception' && !a.coversPricingThreshold) return a.pricingRows || []
    const current = pricingThresholdExceptions(opp, store.getProposal(opp.id), store).rows
    return current.length ? current : (a.pricingRows || [])
  }
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
          {(COMMERCIAL_RX.test(a.detail || '') || ((a.type === 'Pricing threshold exception' || a.coversPricingThreshold) && a.pricingRows?.length > 0)) && !canPriceProposal(store.role) ? (
            <div className="restricted" style={{ fontSize: 12.5, margin: '6px 0' }}>
              <Icon name="lock" size={11} /> Commercial exception — trigger values (GM% / discount / value) visible to approvers and the opportunity owner only.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12.5, margin: '6px 0' }}>{a.detail}</div>
              {(a.type === 'Pricing threshold exception' || a.coversPricingThreshold) && pricingRowsFor(a).length > 0 && <div className="approval-pricing-rows">{pricingRowsFor(a).map((row, i) => <div className="approval-pricing-row" key={`${row.label}-${i}`}><b>{row.label}</b>{row.discount > row.discountPct && <span>Discount {row.discount}% <small>(limit {row.discountPct}%)</small></span>}{row.markup > row.markupPct && <span>Markup {row.markup}% <small>(limit {row.markupPct}%)</small></span>}</div>)}</div>}
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
  return <span className="communication-identity">
    <span className="communication-identity-name">{value}</span>
    {email && <span className="communication-identity-email">{email}</span>}
  </span>
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
  return { name: entry.fromName || ROLES[opp.owner]?.name || displayRole(opp.owner) || 'ModAE Sales Desk', email: raw }
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
      subject: q.subject || `Supplier response - ${q.manufacturer}`, body: q.body || q.notes,
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
      <div className="ana-card c-12">
        <SubmissionPanel opp={opp} />
      </div>
      <div className="ana-card c-12">
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
    </div>
  )
}

// ---------------------------------------------------------------------------
function CommsTab({ opp, readOnly = false }) {
  const store = useStore()
  const [selectedCommunication, setSelectedCommunication] = useState(null)
  const lead = [...(store.leads || []), ...(store.leadArchive || [])].find(l => l.id === opp.sourceLeadId)
  const customer = (store.customers || []).find(c => c.name?.toLowerCase() === opp.sellTo?.toLowerCase())
  const vendorQuotes = store.vendorQuotes?.[opp.id] || []
  const leadRows = store.communications?.[lead?.id] || []
  const opportunityRows = store.communications?.[opp.id] || []
  const est = store.svcEstimates.find(e => e.oppId === opp.id) || { oppId: opp.id }
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
      <div className="ana-card c-12">
        {opp.route === 'Service'
          ? <RateSheetPanel opp={opp} est={est} readOnly={readOnly} />
          : <SubmissionPanel opp={opp} readOnly={readOnly} />}
      </div>
      <div className="ana-card c-12">
        <div className="ana-title">Communication log</div>
        {rows.map((c, i) => {
          const sender = communicationSender(c, opp, lead)
          const recipient = communicationRecipient(c, opp, customer, vendorQuotes, mailbox)
          return (
            <div key={c.id || `${c.ts}-${i}`} className="check-row communication-row" role="button" tabIndex={0}
              onClick={() => setSelectedCommunication(c)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedCommunication(c) } }}>
              <Icon name="mail" size={13} />
              <span className="communication-row-copy">
                <b>{c.subject}</b>
                <div className="hint"><CommsName value={sender.name} email={sender.email} /> → <CommsName value={recipient.name} email={recipient.email} /> · {formatISTDateTime(c.ts)}</div>
              </span>
              <span className="communication-row-actions" style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginLeft: 'auto' }}>
                <Chip tone={c.dir === 'In' ? 'Blue' : 'grey'}>{formatKind(c.kind)}</Chip>
                {c.status && <Chip tone={c.status === 'sent' ? 'Green' : 'Amber'}>{formatCommunicationStatus(c.status)}</Chip>}
              </span>
            </div>
          )
        })}
        {!rows.length && <p className="hint">No communications logged yet.</p>}
      </div>
      {selectedCommunication && (() => {
        const c = selectedCommunication
        const sender = communicationSender(c, opp, lead)
        const recipient = communicationRecipient(c, opp, customer, vendorQuotes, mailbox)
        return (
          <Modal title={c.subject || 'Communication'} onClose={() => setSelectedCommunication(null)} wide className="communication-detail-modal">
            <button type="button" className="communication-detail-close" onClick={() => setSelectedCommunication(null)} aria-label="Close communication">Close</button>
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
  const folders = store.files?.[opp.id] || Object.fromEntries(SUBFOLDERS.map(f => [f, []]))
  const sp = store.spSync?.[opp.id]
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
