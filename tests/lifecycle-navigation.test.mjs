import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const workbench = fs.readFileSync(path.join(root, 'src/pages/Workbench.jsx'), 'utf8')

test('milestone changes open their lifecycle workspace', () => {
  for (const [milestone, tab] of [
    ['Intake', 'overview'], ['Qualification', 'requirement'],
    ['Customer/KYC', 'customer'], ['Registration', 'registration'],
    ['Screening', 'requirement'],
    ['Clarification', 'clarifications'], ['Sourcing', 'sourcing'],
    ['Proposal', 'proposal'], ['Approval', 'approval'],
    ['PO Validation', 'po'], ['Handover', 'po'],
    ['Submitted', 'overview'], ['Follow-up', 'overview'],
  ]) {
    assert.match(workbench, new RegExp(`['"]?${milestone}['"]?: '${tab}'`))
  }
  assert.match(workbench, /goTab\(tabOverride \|\| LIFECYCLE_TABS\[milestone\] \|\| 'overview'\)/)
  assert.match(workbench, /const saved = await store\.flushPersistence\(\)/)
  assert.match(workbench, /if \(saved === false\)/)
  assert.match(workbench, /moveToMilestone\(transition\.target, transition\.reason\.trim\(\)\)/)
  assert.match(workbench, /viewTab === 'registration' && <RegistrationTab opp=\{opp\} goTab=\{goTab\} \/>/)
  assert.match(workbench, /function RegistrationTab\(\{ opp, goTab, detailsRef, spares = false \}\)/)
  assert.match(workbench, /workflowStepsFor\(store\.config, opp\.route\)/)
  assert.match(workbench, /const SPARES_WORKFLOW_STEPS = \[/)
  assert.match(workbench, /label: 'Opportunity Intake'/)
  assert.match(workbench, /label: 'Requirement Validation'/)
  assert.match(workbench, /label: 'Spares Sourcing'/)
  assert.match(workbench, /label: 'Quotation Preparation'/)
  assert.match(workbench, /label: 'Quotation Submission'/)
  assert.match(workbench, /if \(route === 'Spares'\) return SPARES_WORKFLOW_STEPS/)
  assert.match(workbench, /effectiveMilestone = opp\.route === 'Spares' && opp\.milestone === 'Qualification' \? 'Screening'/)
  assert.match(workbench, /Approval: 'approval'/)
  assert.match(workbench, /'--progress-step-count': steps\.length/)
})

test('Service workflow lets users preview every non-current page as read-only', () => {
  assert.match(workbench, /allowFutureNavigation = false/)
  assert.match(workbench, /disabled=\{!allowFutureNavigation && index > completedThrough\}/)
  assert.match(workbench, /const serviceOpenNavigation = opp\.route === 'Service'/)
  assert.match(workbench, /const viewingFutureStep = requestedStepIndex > persistedStepIndex/)
  assert.match(workbench, /const activeStep = serviceOpenNavigation && requestedWorkflowStep\s*\? requestedWorkflowStep\.slug/)
  assert.match(workbench, /if \(index < 0 \|\| \(!serviceOpenNavigation && index > persistedStepIndex\)\) return/)
  assert.match(workbench, /const workflowReadOnly = reviewingCompletedStep \|\| viewingFutureStep/)
  assert.match(workbench, /allowFutureNavigation=\{serviceOpenNavigation\}/)
  assert.match(workbench, /setTransition\(\{ kind: 'blocked', target: step\.label, blockers: serviceBlockers \}\)/)
  assert.match(workbench, /if \(serviceBlockers\.length\) \{[\s\S]*setTransition\(\{ kind: 'blocked', target: step\.label, blockers: serviceBlockers \}\)/)
  assert.match(workbench, /if \(opp\.route === 'Service' && viewingFutureStep\) return/)
  assert.match(workbench, /Previewing future stage:/)
})

test('Service workflow uses five grouped industrial stages', () => {
  for (const label of ['Service Request', 'Scope Confirmation', 'Standard Rate Schedule', 'Customer Acceptance', 'Service Execution & Close']) {
    assert.match(workbench, new RegExp(label.replace(/[&]/g, '\\&')))
  }
  for (const legacySlug of ['service-intake', 'service-capture', 'service-scope', 'service-offer', 'service-review', 'service-send', 'service-decision', 'service-execution', 'service-report', 'service-invoice']) {
    assert.match(workbench, new RegExp(legacySlug))
  }
  assert.match(workbench, /servicePhaseStart/)
  assert.match(workbench, /servicePhaseEnd/)
  assert.doesNotMatch(workbench, /SERVICE_WORK_AREAS/)
  assert.doesNotMatch(workbench, /ServiceWorkAreaBar/)
  assert.doesNotMatch(workbench, /Current work area/)
  assert.doesNotMatch(workbench, /Next audit stage/)
  const styles = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8')
  assert.doesNotMatch(styles, /\.service-work-area(?:-|\s|\{)/)
})

test('Spares workflow has eight grouped industry-standard stages', () => {
  const labels = [
    'Opportunity Intake', 'Customer Verification', 'Requirement Validation',
    'Spares Sourcing', 'Quotation Preparation', 'Approval',
    'Quotation Submission', 'Follow-up & Closure',
  ]
  let previous = 0
  for (const label of labels) {
    const index = workbench.indexOf(label, previous)
    assert.ok(index >= 0, `${label} should appear after the previous Spares label`)
    previous = index + label.length
  }
  assert.match(workbench, /milestones: \['Intake', 'Registration'\]/)
  assert.match(workbench, /milestones: \['Screening', 'Clarification', 'Qualification'\]/)
  assert.match(workbench, /tab: 'requirement-validation'/)
  assert.match(workbench, /tab: 'comms'/)
})

test('Spares requirement validation leads with actionable clarifications', () => {
  const clarifications = workbench.indexOf('<div className="workbench-section-title">Clarifications first</div>')
  const review = workbench.indexOf('<div className="workbench-section-title">Source &amp; opportunity details</div>')
  assert.ok(clarifications >= 0 && clarifications < review, 'Clarifications should appear before requirement review')
  assert.match(workbench, /<ClarificationsTab opp=\{opp\} sourceText=\{sourceText\} compact \/>/)
  assert.match(workbench, /Sourcing is blocked/)
  assert.match(workbench, /clarification-cards/)
})

test('clarifications auto-suggest on source changes and allow required manual questions', () => {
  assert.match(workbench, /const autoSuggestSignature = JSON\.stringify\(/)
  assert.match(workbench, /autoSuggestRef\.current === autoSuggestSignature/)
  assert.match(workbench, /rows\.length \|\| opp\.autoClarificationSuggestedAt/)
  assert.match(workbench, /autoClarificationSuggestedAt: new Date\(\)\.toISOString\(\)/)
  assert.match(workbench, /suggest\(\)/)
  assert.match(workbench, /Add question manually/)
  assert.match(workbench, /const saveManualQuestion = event =>/)
  assert.match(workbench, /evidence: 'Manual entry'/)
  assert.match(workbench, /status: 'Open'/)
  assert.match(workbench, /It will block sourcing until answered/)
  assert.match(workbench, /if \(selected\.length\) store\.updateOpportunity\(opp\.id, \{ autoClarificationSuggestedAt:/)
  assert.match(workbench, /covered by source/)
  assert.match(workbench, /Source already covers this/)
  assert.match(workbench, /const selected = aiRows\.length \? aiRows : fallbackRows\.filter\(row => row\?\.q\)/)
})

test('commercial decision terms use separate readable labels and values', () => {
  assert.match(workbench, /commercial-decision-request[\s\S]*<b>Customer requested:<\/b><span>/)
  assert.match(workbench, /commercial-decision-request[\s\S]*<b>ModAE standard:<\/b><span>/)
})

test('matching customer terms offer one descriptive manual AH approval request', () => {
  const panel = workbench.slice(workbench.indexOf('function CommercialDecisionPanel'))
  const decisionHandler = panel.slice(panel.indexOf('const setDecision'), panel.indexOf('const setConfirmation'))
  assert.doesNotMatch(decisionHandler, /requestCommercialApproval\(/)
  assert.match(panel, /type: 'Commercial deviation'/)
  assert.match(panel, /approver: 'AH'/)
  assert.match(panel, /deviationDetails/)
  assert.match(panel, /refreshPendingContext: true/)
  assert.match(panel, /Request AH approval for/)
  assert.match(panel, /AH approval requested for: \$\{requestSummary\}/)
  assert.match(panel, /customer asked/)
  assert.match(panel, /ModAE response/)
  assert.doesNotMatch(decisionHandler, /requestCommercialApproval\(nextTerms\)[\s\S]*Counter-offer with ModAE standard terms/)
  assert.match(panel, /ModAE response “\$\{term\.ourResponse \|\| term\.proposedTerm \|\| term\.standardTerm/)
})

test('transition modal shows pending approvals without approval-navigation shortcuts', () => {
  const transition = workbench.slice(workbench.indexOf('Cannot move from'), workbench.indexOf('Backward movement is allowed'))
  assert.doesNotMatch(transition, /Open approval/)
  assert.match(transition, /is pending with/)
  assert.match(transition, /Exception approval <b>\{exception\.id\}<\/b> is pending\./)
  assert.match(transition, /Request final quote release from AH \+ LJS/)
})

test('communications tabs stack the route-specific send form above the full-width log', () => {
  const legacyStart = workbench.indexOf('function LegacyCommsTab')
  const legacyEnd = workbench.indexOf('// ---------------------------------------------------------------------------', legacyStart + 1)
  const legacy = workbench.slice(legacyStart, legacyEnd)
  const commsStart = workbench.indexOf('function CommsTab')
  const commsEnd = workbench.indexOf('// ---------------------------------------------------------------------------', commsStart + 1)
  const comms = workbench.slice(commsStart, commsEnd)

  assert.ok(legacy.indexOf('<SubmissionPanel opp={opp} />') < legacy.indexOf('Communication log'))
  assert.ok(comms.indexOf("opp.route === 'Service'") < comms.indexOf('Communication log'))
  assert.match(legacy, /<div className="ana-card c-12">\s*<SubmissionPanel opp=\{opp\} \/>\s*<\/div>\s*<div className="ana-card c-12">\s*<div className="ana-title">Communication log<\/div>/s)
  assert.match(comms, /<div className="ana-card c-12">\s*\{opp\.route === 'Service'[\s\S]*<RateSheetPanel opp=\{opp\} est=\{est\} readOnly=\{readOnly\} \/>[\s\S]*<SubmissionPanel opp=\{opp\} readOnly=\{readOnly\} \/>[\s\S]*<\/div>\s*<div className="ana-card c-12">\s*<div className="ana-title">Communication log<\/div>/s)
})

test('commercial decisions appear before sourcing, not inside the proposal editor', () => {
  const proposal = fs.readFileSync(path.join(root, 'src/pages/Proposal.jsx'), 'utf8')
  const decision = workbench.indexOf('Commercial decision required')
  const clarifications = workbench.indexOf('Clarifications first')
  assert.ok(decision >= 0 && decision < clarifications, 'commercial decisions should lead Requirement Validation')
  assert.match(workbench, /<CommercialDecisionPanel opp=\{opp\} \/>/)
  assert.doesNotMatch(proposal, /Commercial decision and confirmation/)
})

test('source and opportunity details keeps pipeline metadata as a live read-only reference', () => {
  const start = workbench.indexOf('function RequirementTab({ opp })')
  const end = workbench.indexOf('// ---------------------------------------------------------------------------', start + 1)
  const requirement = workbench.slice(start, end)
  assert.match(requirement, /Reference only\. Update pipeline fields in Opportunity details/)
  assert.match(requirement, /\['Stage', opp\.stage \|\| '—'\]/)
  assert.match(requirement, /\['Probability', opp\.prob \|\| '—'\]/)
  assert.match(requirement, /\['Equipment \/ Product Family', productDisplayLabel\(opp\.product\)/)
  assert.doesNotMatch(requirement, /const editable =/)
  assert.doesNotMatch(requirement, /onChange=\{upd\(k\)\}/)
})

test('progress stepper grid follows visible workflow step count', () => {
  const styles = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8')
  assert.match(styles, /grid-template-columns: repeat\(var\(--progress-step-count, 10\), minmax\(64px, 1fr\)\)/)
  assert.match(styles, /grid-template-columns: repeat\(var\(--progress-step-count, 10\), 86px\)/)
  assert.match(styles, /grid-template-columns: repeat\(var\(--progress-step-count, 10\), minmax\(82px, 1fr\)\)/)
})

test('reviewed workflow stages do not render a red dashed outline', () => {
  const styles = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8')
  assert.doesNotMatch(styles, /\.progress-step\.reviewing\s*\{[^}]*outline:\s*1px\s+dashed/i)
})

test('approval is shown in an opportunity rail only while its request is pending', () => {
  assert.match(workbench, /const hasPendingApproval = \(approvals, oppId\) => \(approvals \|\| \[\]\)\.some\(/)
  assert.match(workbench, /approval\.oppId === oppId && approval\.status === 'Pending'/)
  assert.match(workbench, /const allWorkflowSteps = workflowStepsFor\(store\.config, opp\.route\)/)
  assert.match(workbench, /step\.milestone !== 'Approval' \|\| approvalPending/)
  assert.match(workbench, /hiddenApprovalRequested/)
  assert.match(workbench, /replace: true/)
  assert.match(workbench, /const requestedWorkflowStep = workflowBySlug\[requestedServiceSlug\]/)
  assert.match(workbench, /const activeStepConfig = workflowBySlug\[activeStep\]/)
  assert.match(workbench, /!activeStepConfig && viewTab === 'approvals'/)
})

test('retrying a transition with only pending approvals keeps a visible waiting banner', () => {
  assert.match(workbench, /const \[pendingTransition, setPendingTransition\] = useState\(null\)/)
  assert.match(workbench, /const pendingRequestsFor = blockersForMove\.map\(approvalRequestFor\)/)
  assert.match(workbench, /pendingRequestsFor\.length === blockersForMove\.length/)
  assert.match(workbench, /setPendingTransition\(\{ target: milestone, requests: pendingRequestsFor \}\)/)
  assert.match(workbench, /if \(!currentBlockers\.length \|\| currentRequests\.length !== currentBlockers\.length\)/)
  assert.match(workbench, /approval-pending-banner/)
  assert.match(workbench, /Open approvals/)
})

test('the compact lifecycle stepper exposes every displayed stage as selectable', () => {
  const ui = fs.readFileSync(path.join(root, 'src/ui.jsx'), 'utf8')
  assert.match(ui, /aria-label="Opportunity lifecycle"/)
  assert.match(ui, /aria-label=\{onStep \? `Select \$\{m\} milestone` : m\}/)
  assert.match(ui, /onClick=\{\(\) => onStep\?\.\(m\)\}/)
  assert.match(ui, /className=\{`step \$\{i < at \? 'done' : i === at \? 'now' : 'future'\}/)
})
