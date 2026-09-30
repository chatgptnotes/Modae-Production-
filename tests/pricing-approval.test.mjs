import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { pricingApprovalFor, pricingThresholdExceptions, readiness } from '../src/gates.js'
import { pricingExceptionSignature, proposalApprovalSnapshot } from '../src/approvalMemory.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

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

test('pricing exceptions explain the excess and calculate the discount impact', () => {
  const result = pricingThresholdExceptions(opp, { revision: '01', bom: [] }, {
    ...state,
    sparesLines: [{
      oppId: 'PRICE-1', pn: 'P-2', qty: 2, listUnitPrice: 100,
      currency: 'INR', discountPct: 10, markupPct: 0,
    }],
  })
  const row = result.rows.find(item => item.label === 'P-2')
  assert.equal(row.discountExcessPct, 5)
  assert.equal(row.quantity, 2)
  assert.equal(row.listTotalINR, 200)
  assert.equal(row.discountAmountINR, 20)
  assert.equal(row.afterDiscountTotalINR, 180)
})

test('pricing approval UI explains why the exception needs sign-off', () => {
  const approvals = read('src/pages/Approvals.jsx')
  const spares = read('src/workbench/WbSpares.jsx')
  assert.match(approvals, /Why approval is required/)
  assert.match(approvals, /exceeds by/)
  assert.match(approvals, /Affected lines/)
  assert.match(approvals, /pricingRows\.length > 0 && <PricingRows rows=\{pricingRows\} approvers=\{neededOf\(a\)\} \/>/)
  assert.match(approvals, /One approval required — your approval or/)
  assert.match(approvals, /One approval from \{displayRoles\(approvalRoles\)\}/)
  assert.match(spares, /Why approval is required/)
  assert.match(spares, /Total discount impact/)
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

const signedApproval = (rows, extra = {}) => ({
  oppId: 'PRICE-1', type: 'Pricing threshold exception', status: 'Approved',
  pricingSignature: pricingExceptionSignature(rows),
  ...extra,
})

test('a signature-backed pricing approval survives a revision bump and unrelated edits', () => {
  const proposal = { revision: '01', discountPct: 8, bom: [{ pn: 'P-1', quoted: 100 }] }
  const offendingRows = pricingThresholdExceptions(opp, proposal, state).rows
  assert.ok(offendingRows.length)
  const approval = signedApproval(offendingRows, { rev: '01' })
  // Revision bumped and an unrelated line edited — the approved values did not change.
  const bumped = {
    ...proposal,
    revision: '02',
    bom: [{ pn: 'P-1', quoted: 100 }, { pn: 'P-9', quoted: 555, markupPct: 2 }],
  }
  const blockers = readiness(opp, bumped, { ...state, approvals: [approval] })
  assert.equal(blockers.some(item => item.key === 'pricing-threshold'), false)
})

test('a legacy pricing approval reuses its exact pricing rows after unrelated workbook edits', () => {
  const approvedProposal = {
    revision: '01',
    bom: [{ pn: 'P-1', quoted: 100, discountPct: 8 }],
  }
  const currentProposal = {
    ...approvedProposal,
    bom: [
      { pn: 'P-1', quoted: 100, discountPct: 8 },
      { pn: 'P-9', quoted: 555, quantity: 4 },
    ],
  }
  const pricingRows = pricingThresholdExceptions(opp, approvedProposal, state).rows
  const legacyApproval = {
    oppId: 'PRICE-1',
    type: 'Pricing threshold exception',
    status: 'Approved',
    rev: '01',
    pricingRows,
    approvalSnapshot: proposalApprovalSnapshot(approvedProposal, opp),
  }

  const blockers = readiness(opp, currentProposal, { ...state, approvals: [legacyApproval] })
  assert.equal(blockers.some(item => item.key === 'pricing-threshold'), false)
})

test('a pricing approval re-opens when an approved over-threshold value changes', () => {
  const proposal = { revision: '01', discountPct: 8, bom: [] }
  const offendingRows = pricingThresholdExceptions(opp, proposal, state).rows
  const approval = signedApproval(offendingRows)
  // The discount the approver signed off was raised — re-approval required.
  const blockers = readiness(opp, { ...proposal, discountPct: 12 }, { ...state, approvals: [approval] })
  assert.equal(blockers.some(item => item.key === 'pricing-threshold'), true)
})

test('a pending pricing approval with a matching signature still waits, not blocks', () => {
  const proposal = { revision: '01', discountPct: 8, bom: [] }
  const rows = pricingThresholdExceptions(opp, proposal, state).rows
  const blockers = readiness(opp, proposal, {
    ...state,
    approvals: [signedApproval(rows, { status: 'Pending' })],
  })
  assert.equal(blockers.find(item => item.key === 'pricing-threshold')?.severity, 'wait')
})

test('the Proposal page forwards pricingRows so its approvals carry the signature', () => {
  const source = read('src/pages/Proposal.jsx')
  const store = read('src/store.jsx')
  const matches = source.match(/\.\.\.\(bl\.pricingRows\?\.length \? \{ pricingRows: bl\.pricingRows \} : \{\}\)/g) || []
  assert.equal(matches.length, 2, 'both requestApproval call sites must forward pricingRows')
  assert.match(store, /req\.type === 'Pricing threshold exception' \|\| req\.coversPricingThreshold/,
    'combined quote approvals must retain the pricing signature')
})

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8')
}

test('unpriced spares lines have a distinct pricing blocker', () => {
  const blockers = readiness(opp, { bom: [] }, {
    ...state,
    sparesLines: [{ id: 'SL-UNPRICED', oppId: 'PRICE-1', pn: 'P-2', confirmed: true, priceState: 'Needs pricing' }],
  })
  assert.equal(blockers.find(item => item.key === 'sp-price-SL-UNPRICED')?.text, 'Pricing required — select a price-list part or apply an approved quote (P-2)')
})
