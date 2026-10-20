import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync('src/pages/Inbox.jsx', 'utf8')

test('customer class draft previews verification without restoring the workflow strip', () => {
  assert.match(source, /const previewCustomerStatus = previewCustomer\?\.status \|\| leadCustomerStatus/)
  assert.match(source, /<LeadVerification lead=\{lead\} customerStatus=\{previewCustomerStatus\}/)
  assert.doesNotMatch(source, /const verificationBlocked|const registrationBlocked/)
  assert.match(source, /isFastTrackLead\(previewLead, store\.config, customer\)/)
})

test('changing customer class clears stale decision state', () => {
  assert.match(source, /setDecisionDraft\(\{ \.\.\.decisionDraft, customerStatus: e\.target\.value \}\)/)
  assert.match(source, /setDecisionErr\(''\)/)
  assert.match(source, /setDecisionSaved\(false\)/)
})
