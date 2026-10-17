import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { checklistFor } from '../src/customerClasses.js'

const inbox = fs.readFileSync('src/pages/Inbox.jsx', 'utf8')

test('active lead review has no workflow strip or repeated RFQ heading', () => {
  assert.doesNotMatch(inbox, /<LeadWorkflowBar\b/)
  assert.match(inbox, /\{converted && <div className="structured-rfq-header">/)
})

test('optional KYC controls are available for every classification', () => {
  const verification = inbox.slice(inbox.indexOf('function LeadVerification'), inbox.indexOf('// One picked file'))
  assert.match(verification, /KYC documents — optional/)
  assert.match(verification, /checklistFor\(store.config, customerStatus\)\.map\(item =>/)
  assert.doesNotMatch(verification, /policy\?\.verification\?\.required === false/)
  assert.doesNotMatch(verification, /Registration is blocked|Opportunity creation is blocked|required before commercial approval/)
  for (const status of ['Unclassified', 'Green', 'Yellow', 'Red']) assert.ok(checklistFor({}, status).length > 0)
})
