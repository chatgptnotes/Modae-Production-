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
  const review = workbench.indexOf('<div className="workbench-section-title">Requirement review</div>')
  assert.ok(clarifications >= 0 && clarifications < review, 'Clarifications should appear before requirement review')
  assert.match(workbench, /<ClarificationsTab opp=\{opp\} sourceText=\{sourceText\} compact \/>/)
  assert.match(workbench, /Sourcing is blocked/)
  assert.match(workbench, /clarification-cards/)
})

test('progress stepper grid follows visible workflow step count', () => {
  const styles = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8')
  assert.match(styles, /grid-template-columns: repeat\(var\(--progress-step-count, 10\), minmax\(64px, 1fr\)\)/)
  assert.match(styles, /grid-template-columns: repeat\(var\(--progress-step-count, 10\), 86px\)/)
  assert.match(styles, /grid-template-columns: repeat\(var\(--progress-step-count, 10\), minmax\(82px, 1fr\)\)/)
})

test('the compact lifecycle stepper exposes every displayed stage as selectable', () => {
  const ui = fs.readFileSync(path.join(root, 'src/ui.jsx'), 'utf8')
  assert.match(ui, /aria-label="Opportunity lifecycle"/)
  assert.match(ui, /aria-label=\{onStep \? `Select \$\{m\} milestone` : m\}/)
  assert.match(ui, /onClick=\{\(\) => onStep\?\.\(m\)\}/)
  assert.match(ui, /className=\{`step \$\{i < at \? 'done' : i === at \? 'now' : 'future'\}/)
})
