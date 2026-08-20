import test from 'node:test'
import assert from 'node:assert/strict'
import { leadWorkflow } from '../src/leadWorkflow.js'
import { supplyMissing } from '../src/leadRules.js'

const fields = [
  { k: 'Sell-to', v: 'Customer', conf: 95, state: 'accepted' },
  { k: 'Opp type', v: 'Spares', conf: 95, state: 'accepted' },
]

test('active lead reports the first unresolved workflow step', () => {
  const flow = leadWorkflow({
    status: 'New', readAt: '2026-08-18T10:00:00Z',
    source: 'Common mailbox', suggestedOwner: 'RS',
    ai: { fields, route: 'Spares', missing: [] },
  }, { customerStatus: 'Blue' })

  assert.equal(flow.steps[0].state, 'complete')
  assert.equal(flow.steps[1].state, 'complete')
  assert.equal(flow.steps[2].state, 'current')
  assert.equal(flow.complete, false)
})

test('low-confidence fields block AI validation', () => {
  const flow = leadWorkflow({
    status: 'Qualified', source: 'Common mailbox', suggestedOwner: 'RS',
    ai: { fields: [{ k: 'Scope', v: '', conf: 40, state: 'pending' }], route: 'Project', missing: [] },
  }, { customerStatus: 'Green' })

  assert.equal(flow.steps[6].state, 'blocked')
  assert.match(flow.blocked, /AI field/)
})

test('converted lead shows a completed handoff', () => {
  const flow = leadWorkflow({
    status: 'Converted', oppId: '2608224RS', ai: { fields: [], missing: [] },
  })

  assert.equal(flow.complete, true)
  assert.ok(flow.steps.every(step => step.state === 'complete'))
})

test('dropped lead is terminal rather than appearing stuck on AI validation', () => {
  const flow = leadWorkflow({
    status: 'Dropped', droppedReason: 'No response from customer',
    source: 'Common mailbox', suggestedOwner: 'RS',
    ai: { fields: [{ k: 'Scope', v: '', conf: 40, state: 'pending' }], route: 'Spares', missing: ['Delivery'] },
  })

  assert.equal(flow.terminal, 'dropped')
  assert.equal(flow.blocked, 'Lead discarded')
  assert.equal(flow.complete, false)
})

// Answering the outstanding clarifications by hand has to move the workflow on,
// not just tidy the panel — L-07 stays open while ai.missing has anything in it,
// and the header reads "N clarifications required".
test('supplying the missing information clears the L-07 AI validation block', () => {
  let lead = {
    id: 'LD-902', status: 'Qualified', mailbox: true, suggestedOwner: 'RS', route: 'Service',
    customerStatus: 'Green', completeness: 78,
    ai: {
      fields: [{ k: 'Sell-to', v: 'Tata Steel', conf: 97, state: 'accepted' }],
      missing: ['Number of preventive visits per year expected', 'Required response time'],
    },
  }
  const before = leadWorkflow(lead, { customerStatus: 'Green' })
  assert.equal(before.blocked, '2 clarifications required')

  for (const item of [...lead.ai.missing]) {
    lead = { ...lead, ...supplyMissing(lead, item, 'answered', item) }
  }
  const after = leadWorkflow(lead, { customerStatus: 'Green' })
  assert.equal(after.blocked, '', 'nothing should still be blocking')
  assert.ok(after.activeIndex > before.activeIndex, 'the lead must advance past L-07')
  // The answers are accepted fields, so they cannot re-block the step.
  assert.equal(lead.ai.fields.filter(f => f.manual).length, 2)
  assert.equal(lead.completeness, 100)
})
