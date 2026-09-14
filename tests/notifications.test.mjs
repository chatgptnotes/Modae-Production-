import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')

test('all approval notifications route to the central approvals list', () => {
  assert.match(app, /export const approvalNotificationPath = \(\) => '\/approvals'/)
  assert.match(app, /to: approvalNotificationPath\(a\)/)
})

test('approved approval requests notify the person who raised them', () => {
  // The audience is the record's owner plus whoever decided it or was asked to —
  // an approver must hear the outcome of their own decision, which owner-only
  // filtering never told them.
  assert.match(app, /\['Approved', 'Approved with conditions', 'Returned', 'Rejected'\]\.includes\(a\.status\) && approvalAudience\(a, store\)\.includes\(role\)/)
  assert.match(app, /const approvalAudience = \(approval, store\) => \[[\s\S]*?approvalOwner\(approval, store\)/)
  assert.match(app, /const approvalAudience = \(approval, store\) => \[[\s\S]*?approval\.decidedBy/)
  assert.match(app, /const approvalOwner = \(approval, store\) =>/)
  assert.match(app, /lead\?\.assignedOwner \|\| lead\?\.suggestedOwner \|\| approval\.requestedBy/)
  assert.match(app, /title: `Approval \$\{a\.status\.toLowerCase\(\)\}`/)
  assert.match(app, /id: `approval-result-\$\{a\.id\}`/)
})
