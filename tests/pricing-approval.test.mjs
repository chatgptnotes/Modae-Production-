import test from 'node:test'
import assert from 'node:assert/strict'

import { pricingThresholdExceptions, readiness } from '../src/gates.js'

const opp = { id: 'PRICE-1', route: 'Spares', customerStatus: 'Green' }
const state = { config: { approvalThresholds: { discountPct: 5, markupPct: 10 } }, approvals: [], sparesLines: [] }

test('pricing thresholds allow values exactly at the configured limits', () => {
  const result = pricingThresholdExceptions(opp, {
    discountPct: 5,
    markupPct: 10,
    bom: [{ pn: 'P-1', discountPct: 5, markupPct: 10 }],
  }, state)
  assert.equal(result.rows.length, 0)
})

test('pricing thresholds flag proposal and sourcing line exceptions', () => {
  const proposal = { revision: '01', discountPct: 6, bom: [{ pn: 'P-1', markupPct: 11 }] }
  const result = pricingThresholdExceptions(opp, proposal, {
    ...state,
    sparesLines: [{ oppId: 'PRICE-1', pn: 'P-2', discountPct: 7 }],
  })
  assert.equal(result.rows.length, 3)
  const blockers = readiness(opp, proposal, {
    ...state,
    sparesLines: [{ oppId: 'PRICE-1', pn: 'P-2', discountPct: 7 }],
  })
  assert.equal(blockers.find(item => item.key === 'pricing-threshold')?.approvalType, 'Pricing threshold exception')
  assert.deepEqual(blockers.find(item => item.key === 'pricing-threshold')?.needed, ['AH', 'LJS'])
  assert.equal(blockers.find(item => item.key === 'pricing-threshold')?.anyOf, true)
})

test('removed sourcing lines do not create pricing or confirmation blockers', () => {
  const proposal = { revision: '01', bom: [] }
  const removedLine = { id: 'SL-REMOVED', oppId: 'PRICE-1', pn: 'P-REMOVED', qty: 0, removedFromSourcing: true, markupPct: 50, confirmed: false }
  const result = pricingThresholdExceptions(opp, proposal, { ...state, sparesLines: [removedLine] })
  const blockers = readiness(opp, proposal, { ...state, sparesLines: [removedLine] })
  assert.equal(result.rows.length, 0)
  assert.equal(blockers.some(item => item.key === 'pricing-threshold' || item.key === 'sp-conf-SL-REMOVED'), false)
})

test('an approved pricing exception clears the blocker for its revision', () => {
  const proposal = { revision: '02', discountPct: 8, bom: [] }
  const blockers = readiness(opp, proposal, {
    ...state,
    approvals: [{ oppId: 'PRICE-1', type: 'Pricing threshold exception', rev: '02', status: 'Approved' }],
  })
  assert.equal(blockers.some(item => item.key === 'pricing-threshold'), false)
})

test('Admin-configured pricing approvers are used by the blocker', () => {
  const blockers = readiness(opp, { revision: '03', markupPct: 11, bom: [] }, {
    ...state,
    config: { approvalThresholds: { discountPct: 5, markupPct: 10, pricingApprovers: ['AN'] } },
  })
  const pricing = blockers.find(item => item.key === 'pricing-threshold')
  assert.equal(pricing.approver, 'AN')
  assert.deepEqual(pricing.needed, ['AN'])
  assert.equal(pricing.anyOf, false)
})

test('unpriced spares lines have a distinct pricing blocker', () => {
  const blockers = readiness(opp, { bom: [] }, {
    ...state,
    sparesLines: [{ id: 'SL-UNPRICED', oppId: 'PRICE-1', pn: 'P-2', confirmed: true, priceState: 'Needs pricing' }],
  })
  assert.equal(blockers.find(item => item.key === 'sp-price-SL-UNPRICED')?.text, 'Pricing required — select a price-list part or apply an approved quote (P-2)')
})
