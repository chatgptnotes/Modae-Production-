import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const admin = fs.readFileSync('src/pages/Admin.jsx', 'utf8')

test('Admin integrations and AI configuration are not rendered', () => {
  assert.doesNotMatch(admin, /Integrations &amp; AI/)
  assert.doesNotMatch(admin, /admin-panel-integrations/)
  assert.doesNotMatch(admin, /SharePoint connector/)
  assert.doesNotMatch(admin, /AI model configuration/)
})

test('Admin workflow and documents tabs remain available', () => {
  assert.match(admin, /id: 'workflow', label: 'Workflow & governance'/)
  assert.match(admin, /id: 'documents', label: 'Documents & templates'/)
  assert.match(admin, /id="admin-panel-workflow"/)
  assert.match(admin, /id="admin-panel-documents"/)
})

test('Admin header does not render the redundant workflow configuration action', () => {
  assert.doesNotMatch(admin, /Configure workflow/)
  assert.doesNotMatch(admin, /nav\('\/admin\/workflow'\)/)
})

test('Admin KYC validation explains defaults before exposing advanced regex rules', () => {
  assert.match(admin, /Expected format:/)
  assert.match(admin, /Advanced validation rule/)
  assert.match(admin, /Regular expression/)
  assert.match(admin, /Custom validation rule/)
})

test('Admin exposes independent final-release and commercial-term approval switches', () => {
  assert.match(admin, /requireFinalQuoteApproval/)
  assert.match(admin, /Require AH \+ LJS approval before final proposal send/)
  assert.match(admin, /requireCommercialDeviationApproval/)
  assert.match(admin, /Require AH approval for special customer terms/)
})
