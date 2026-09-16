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
})

test('commercial decision terms use separate readable labels and values', () => {
  assert.match(workbench, /commercial-decision-request[\s\S]*<b>Customer requested:<\/b><span>/)
  assert.match(workbench, /commercial-decision-request[\s\S]*<b>ModAE standard:<\/b><span>/)
})

test('matching customer terms automatically requests one internal AH approval', () => {
  const panel = workbench.slice(workbench.indexOf('function CommercialDecisionPanel'))
  const decisionHandler = panel.slice(panel.indexOf('const setDecision'), panel.indexOf('const setConfirmation'))
  assert.match(decisionHandler, /if \(decision === 'Match customer terms'\) requestCommercialApproval\(nextTerms\)/)
  assert.match(panel, /type: 'Commercial deviation'/)
  assert.match(panel, /approver: 'AH'/)
  assert.match(panel, /deviationDetails/)
  assert.match(panel, /refreshPendingContext: true/)
  assert.match(panel, /AH approval was requested automatically/)
  assert.doesNotMatch(decisionHandler, /requestCommercialApproval\(nextTerms\)[\s\S]*Counter-offer with ModAE standard terms/)
})

test('communications tabs stack the full-width submission form above the full-width log', () => {
  const legacyStart = workbench.indexOf('function LegacyCommsTab')
  const legacyEnd = workbench.indexOf('// ---------------------------------------------------------------------------', legacyStart + 1)
  const legacy = workbench.slice(legacyStart, legacyEnd)
  const commsStart = workbench.indexOf('function CommsTab')
  const commsEnd = workbench.indexOf('// ---------------------------------------------------------------------------', commsStart + 1)
  const comms = workbench.slice(commsStart, commsEnd)

  assert.ok(legacy.indexOf('<SubmissionPanel opp={opp} />') < legacy.indexOf('Communication log'))
  assert.ok(comms.indexOf('<SubmissionPanel opp={opp} />') < comms.indexOf('Communication log'))
  assert.match(legacy, /<div className="ana-card c-12">\s*<SubmissionPanel opp=\{opp\} \/>\s*<\/div>\s*<div className="ana-card c-12">\s*<div className="ana-title">Communication log<\/div>/s)
  assert.match(comms, /<div className="ana-card c-12">\s*<SubmissionPanel opp=\{opp\} \/>\s*<\/div>\s*<div className="ana-card c-12">\s*<div className="ana-title">Communication log<\/div>/s)
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
  assert.match(requirement, /\['Product', Array\.isArray\(opp\.product\)/)
  assert.doesNotMatch(requirement, /const editable =/)
  assert.doesNotMatch(requirement, /onChange=\{upd\(k\)\}/)
})

test('progress stepper grid follows visible workflow step count', () => {
  const styles = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8')
  assert.match(styles, /grid-template-columns: repeat\(var\(--progress-step-count, 10\), minmax\(64px, 1fr\)\)/)
  assert.match(styles, /grid-template-columns: repeat\(var\(--progress-step-count, 10\), 86px\)/)
  assert.match(styles, /grid-template-columns: repeat\(var\(--progress-step-count, 10\), minmax\(82px, 1fr\)\)/)
})

test('approval is shown in an opportunity rail only while its request is pending', () => {
  assert.match(workbench, /const hasPendingApproval = \(approvals, oppId\) => \(approvals \|\| \[\]\)\.some\(/)
  assert.match(workbench, /approval\.oppId === oppId && approval\.status === 'Pending'/)
  assert.match(workbench, /const allWorkflowSteps = workflowStepsFor\(store\.config, opp\.route\)/)
  assert.match(workbench, /step\.milestone !== 'Approval' \|\| approvalPending/)
  assert.match(workbench, /hiddenApprovalRequested/)
  assert.match(workbench, /replace: true/)
  assert.match(workbench, /workflowBySlug\[WORKFLOW_STEP_BY_TAB\[tab\]\] \? WORKFLOW_STEP_BY_TAB\[tab\] : null/)
  assert.match(workbench, /const hiddenApprovalTab = tab === 'approval'/)
})

test('the compact lifecycle stepper exposes every displayed stage as selectable', () => {
  const ui = fs.readFileSync(path.join(root, 'src/ui.jsx'), 'utf8')
  assert.match(ui, /aria-label="Opportunity lifecycle"/)
  assert.match(ui, /aria-label=\{onStep \? `Select \$\{m\} milestone` : m\}/)
  assert.match(ui, /onClick=\{\(\) => onStep\?\.\(m\)\}/)
  assert.match(ui, /className=\{`step \$\{i < at \? 'done' : i === at \? 'now' : 'future'\}/)
})
