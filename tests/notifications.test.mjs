import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { computeAlerts } from '../src/monitoring.js'

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
  assert.match(app, /const approvalNotificationKey = approval => \[/)
  assert.match(app, /const latestApprovalByOutcome = approvals => \{/)
  assert.match(app, /latestApprovalByOutcome\(\(store\.approvals \|\| \[\]\)\.filter\(a => \['Approved', 'Approved with conditions', 'Returned', 'Rejected'\]\.includes\(a\.status\)/)
  assert.match(app, /id: `approval-result-\$\{approvalNotificationKey\(a\)\}`/)
  assert.doesNotMatch(app, /approvalNotificationKey = approval => \[[\s\S]*?approval\.rev/)
  assert.match(app, /const visibleNotifications = unseenNotifications/)
  assert.match(app, /visibleNotifications\.map\(item =>/)
  assert.match(app, /onClick=\{\(\) => markSeen\(visibleNotifications\)\}/)
  assert.match(app, /You have no unread notifications\./)
})

test('follow-up alerts choose one actionable condition per opportunity', () => {
  const today = new Date('2026-09-24T00:00:00.000Z')
  const state = {
    role: 'RS',
    opportunities: [
      { id: 'MISSING', status: 'Open', owner: 'RS', lastUpdated: '2026-09-15', nextActionOwner: '' },
      { id: 'STALE', status: 'Open', owner: 'RS', lastUpdated: '2026-09-15', nextActionOwner: 'AH' },
    ],
    approvals: [],
    svcEstimates: [],
    config: {},
  }
  const alerts = computeAlerts(state, today).filter(alert => ['missing-follow-up', 'stale-opportunity'].includes(alert.type))
  assert.deepEqual(alerts.map(alert => [alert.objectId, alert.type]), [
    ['MISSING', 'missing-follow-up'],
    ['STALE', 'stale-opportunity'],
  ])
})
