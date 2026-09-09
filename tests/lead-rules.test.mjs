import test from 'node:test'
import assert from 'node:assert/strict'
import { deadlineForLead, expiredLeadDeadline, isFastTrackLead, routeOwner, supplyMissing } from '../src/leadRules.js'

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
  assert.deepEqual(rows.map(r => r.type), ['kyc'])
  assert.equal(rows[0].dueAt, '2026-08-08T00:00:00.000Z')
  assert.equal(expiredLeadDeadline(lead, config, new Date('2026-08-09T00:00:00.000Z')).type, 'kyc')
})

// ---- supplying missing information by hand --------------------------------
// The AI flags what it could not find, and the operator often already knows the
// answer. Before this, the only way to clear an item was to wait for the
// customer to write back — so a lead sat on a running clarification deadline
// over a detail the sales owner could have typed in seconds.

const partial = () => ({
  id: 'LD-900', completeness: 78,
  ai: {
    summary: '', duplicates: [], next: [],
    missing: ['Number of preventive visits per year expected', 'Delivery address', 'Required response time'],
    fields: [{ k: 'Sell-to customer', v: 'Tata Steel', conf: 97, state: 'accepted', group: 'Customer' }],
  },
})

test('answering a missing item records it as an accepted field', () => {
  const lead = partial()
  const patch = supplyMissing(lead, 'Delivery address', ' Jajpur, Odisha ', 'Delivery address')
  assert.deepEqual(patch.ai.missing,
    ['Number of preventive visits per year expected', 'Required response time'])
  const added = patch.ai.fields.at(-1)
  assert.equal(added.k, 'Delivery address')
  assert.equal(added.v, 'Jajpur, Odisha', 'the value is trimmed')
  assert.equal(added.state, 'accepted')
  assert.equal(added.conf, 100, 'a human typed it — there is nothing to be unsure about')
  assert.equal(added.manual, true)
  assert.equal(patch.ai.fields.length, lead.ai.fields.length + 1, 'existing fields are kept')
})

test('completeness climbs and the last outstanding item closes the lead at 100', () => {
  let lead = partial()
  const seen = []
  for (const item of [...lead.ai.missing]) {
    const patch = supplyMissing(lead, item, 'answered', item)
    lead = { ...lead, ...patch }
    seen.push(lead.completeness)
  }
  assert.deepEqual(lead.ai.missing, [])
  assert.equal(lead.completeness, 100, 'no arbitrary remainder left behind')
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] > seen[i - 1], 'completeness must not go backwards')
})

// The point of the whole feature.
test('AI missing information does not create a clarification deadline', () => {
  let lead = partial()
  assert.equal(deadlineForLead(lead, config).some(r => r.type === 'clarification'), false)
  for (const item of [...lead.ai.missing]) {
    lead = { ...lead, ...supplyMissing(lead, item, 'answered', item) }
  }
  assert.equal(deadlineForLead(lead, config).some(r => r.type === 'clarification'), false)
})

// Information nobody flagged: recorded, but it does not invent progress.
test('adding unlisted information leaves the outstanding list and completeness alone', () => {
  const lead = partial()
  const patch = supplyMissing(lead, 'Site contact', 'S. Mohapatra')
  assert.deepEqual(patch.ai.missing, lead.ai.missing)
  assert.equal(patch.completeness, 78, 'answering nothing outstanding is not progress')
  assert.equal(patch.ai.fields.at(-1).k, 'Site contact')
})

test('a blank label or value is not recorded at all', () => {
  const lead = partial()
  for (const [k, v] of [['', 'x'], ['x', ''], ['   ', 'x'], ['x', '   ']]) {
    assert.equal(supplyMissing(lead, k, v, null), null, `${JSON.stringify([k, v])} must be rejected`)
  }
})

test('supplying against a lead the AI never parsed does not throw', () => {
  const patch = supplyMissing({ id: 'LD-901' }, 'Delivery address', 'Jajpur')
  assert.equal(patch.ai.fields.length, 1)
  assert.deepEqual(patch.ai.missing, [])
  assert.equal(patch.completeness, 0)
})
