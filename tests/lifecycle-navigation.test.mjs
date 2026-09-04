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
    ['Customer/KYC', 'customer'], ['Registration', 'customer'],
    ['Screening', 'requirement'],
    ['Clarification', 'clarifications'], ['Sourcing', 'sourcing'],
    ['Proposal', 'proposal'], ['Approval', 'approvals'],
    ['PO Validation', 'po'], ['Handover', 'po'],
    ['Submitted', 'overview'], ['Follow-up', 'overview'],
  ]) {
    assert.match(workbench, new RegExp(`['"]?${milestone}['"]?: '${tab}'`))
  }
  assert.match(workbench, /goTab\(LIFECYCLE_TABS\[milestone\] \|\| 'overview'\)/)
  assert.match(workbench, /moveToMilestone\(transition\.target, transition\.reason\.trim\(\)\)/)
})

test('the compact lifecycle stepper exposes every displayed stage as selectable', () => {
  const ui = fs.readFileSync(path.join(root, 'src/ui.jsx'), 'utf8')
  assert.match(ui, /aria-label="Opportunity lifecycle"/)
  assert.match(ui, /aria-label=\{onStep \? `Select \$\{m\} milestone` : m\}/)
  assert.match(ui, /onClick=\{\(\) => onStep\?\.\(m\)\}/)
  assert.match(ui, /className=\{`step \$\{i < at \? 'done' : i === at \? 'now' : 'future'\}/)
})
