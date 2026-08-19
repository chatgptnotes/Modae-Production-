import test from 'node:test'
import assert from 'node:assert/strict'
import { deadlineForLead, expiredLeadDeadline, isFastTrackLead, routeOwner } from '../src/leadRules.js'

const config = {
  ownershipRules: [
    { region: 'North & West India', owner: 'RS' },
    { region: 'South, East & Central India', owner: 'PP' },
  ],
  leadDeadlines: { kycDays: 7, amberFeeDays: 5, clarificationDays: 3 },
  fastTrack: { enabled: true, customerStatus: 'Green' },
}

test('region routing uses the configured owner', () => {
  assert.equal(routeOwner('North India — Noida', config), 'RS')
  assert.equal(routeOwner('South India — Chennai', config), 'PP')
})

test('fast-track is configurable and limited to the configured class', () => {
  assert.equal(isFastTrackLead({ customerStatus: 'Green' }, config), true)
  assert.equal(isFastTrackLead({ customerStatus: 'Green' }, { ...config, fastTrack: { ...config.fastTrack, enabled: false } }), false)
  assert.equal(isFastTrackLead({ customerStatus: 'Amber' }, config), false)
})

test('lead deadlines are generated from configurable rules', () => {
  const lead = { id: 'LD-1', ts: '2026-08-01T00:00:00.000Z', customerStatus: 'Blue', ai: { missing: ['GST'] } }
  const rows = deadlineForLead(lead, config)
  assert.deepEqual(rows.map(r => r.type), ['kyc', 'clarification'])
  assert.equal(rows[0].dueAt, '2026-08-08T00:00:00.000Z')
  assert.equal(expiredLeadDeadline(lead, config, new Date('2026-08-09T00:00:00.000Z')).type, 'kyc')
})
