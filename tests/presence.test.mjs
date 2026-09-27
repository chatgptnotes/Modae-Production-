import test from 'node:test'
import assert from 'node:assert/strict'
import { countOnlineUsers } from '../src/presence.js'

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
