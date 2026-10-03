import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { computeAlerts } from '../src/monitoring.js'

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')

test('the desktop shell does not render a notification bell after the top bar is removed', () => {
  assert.doesNotMatch(app, /NotificationBell/)
  assert.doesNotMatch(app, /notification-popover/)
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
