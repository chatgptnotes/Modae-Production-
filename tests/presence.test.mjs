import test from 'node:test'
import assert from 'node:assert/strict'
import { countOnlineUsers } from '../src/presence.js'
import fs from 'node:fs'

const app = fs.readFileSync('src/App.jsx', 'utf8')
const dashboard = fs.readFileSync('src/pages/MyDashboard.jsx', 'utf8')

test('countOnlineUsers counts each recently seen user once', () => {
  const now = Date.parse('2026-09-27T08:00:00.000Z')
  const rows = [
    { userId: 'user-1', lastSeenAt: '2026-09-27T07:59:30.000Z' },
    { userId: 'user-1', lastSeenAt: '2026-09-27T07:59:00.000Z' },
    { userId: 'user-2', lastSeenAt: '2026-09-27T07:57:59.999Z' },
    { userId: 'user-3', lastSeenAt: 'invalid' },
  ]

  assert.equal(countOnlineUsers(rows, now), 1)
})

test('countOnlineUsers includes a user exactly at the two-minute boundary', () => {
  const now = Date.parse('2026-09-27T08:00:00.000Z')

  assert.equal(countOnlineUsers([{ userId: 'user-1', lastSeenAt: '2026-09-27T07:58:00.000Z' }], now), 1)
})

test('the application does not start periodic presence traffic', () => {
  assert.doesNotMatch(app, /usePresenceHeartbeat|presence\.js/)
  assert.doesNotMatch(dashboard, /useOnlineUserCount|Users online/)
})
