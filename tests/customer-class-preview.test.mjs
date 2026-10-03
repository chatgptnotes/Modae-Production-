import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync('src/pages/Inbox.jsx', 'utf8')

test('customer class draft previews workflow and blockers before save', () => {
  assert.match(source, /const previewCustomerStatus = previewCustomer\?\.status \|\| leadCustomerStatus/)
  assert.match(source, /<LeadWorkflowBar lead=\{lead\} customerStatus=\{previewCustomerStatus\}/)
  assert.match(source, /<LeadVerification lead=\{lead\} customerStatus=\{previewCustomerStatus\}/)
  assert.match(source, /const isRed = previewCustomerStatus === 'Red'/)
  assert.match(source, /const verificationComplete = leadVerificationComplete\(\{ \.\.\.lead, existingCustomerKyc: previewCustomer\?\.kyc === 'Valid' \}, previewCustomerStatus/)
  assert.match(source, /const verificationBlocked = !verificationComplete && !verificationDeferred/)
  assert.match(source, /const registrationBlocked = .*verificationBlocked/)
  assert.match(source, /isFastTrackLead\(previewLead, store\.config, customer\)/)
})

test('changing customer class clears stale decision state', () => {
  assert.match(source, /setDecisionDraft\(\{ \.\.\.decisionDraft, customerStatus: e\.target\.value \}\)/)
  assert.match(source, /setDecisionErr\(''\)/)
  assert.match(source, /setDecisionSaved\(false\)/)
})
