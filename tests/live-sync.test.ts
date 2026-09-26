import assert from 'node:assert/strict'
import test from 'node:test'
import { liveDataUrl, parseLiveEvent } from '../src/liveSync.js'

test('live sync only accepts approval, lead, and opportunity event payloads', () => {
  assert.deepEqual(parseLiveEvent('event: changed\ndata: {"entities":["leads","opportunities"]}'), ['leads', 'opportunities'])
  assert.deepEqual(parseLiveEvent('event: changed\ndata: {"entities":["users"]}'), [])
  assert.deepEqual(parseLiveEvent('event: other\ndata: {"entities":["approvals"]}'), [])
})

test('live data request names only the affected entities', () => {
  assert.equal(liveDataUrl(['approvals', 'leads']), '/api/live-data?entities=approvals%2Cleads')
})
