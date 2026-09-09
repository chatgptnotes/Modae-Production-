import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')

test('approval notifications route to the approvals list when no opportunity exists', () => {
  assert.match(app, /export const approvalNotificationPath = approval => approval\?\.oppId/)
  assert.match(app, /\? `\/opp\/\$\{approval\.oppId\}\/approvals`\s*:\s*'\/approvals'/)
  assert.match(app, /to: approvalNotificationPath\(a\)/)
})

test('approved approval requests notify the person who raised them', () => {
  assert.match(app, /\['Approved', 'Approved with conditions', 'Returned', 'Rejected'\]\.includes\(a\.status\) && approvalOwner\(a, store\) === role/)
  assert.match(app, /const approvalOwner = \(approval, store\) =>/)
  assert.match(app, /lead\?\.assignedOwner \|\| lead\?\.suggestedOwner \|\| approval\.requestedBy/)
  assert.match(app, /title: `Approval \$\{a\.status\.toLowerCase\(\)\}`/)
  assert.match(app, /id: `approval-result-\$\{a\.id\}`/)
})
