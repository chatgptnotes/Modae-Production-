import test from 'node:test'
import assert from 'node:assert/strict'
import { importReviewedWorkbook, normalizeAiReview } from '../src/proposal/reviewWorkbook.js'

const proposal = {
  units: 7,
  bom: [{ desc: 'Proximity probe, 8 mm', pn: 'PRB-8', qtyPerUnit: 1, common: 0, spares: 0, quoted: '', uom: 'EA' }],
}

test('imports reviewed workbook quantities and prices into matching proposal lines', () => {
  const result = importReviewedWorkbook({ sheets: [{ name: 'Priced BoQ', rows: [
    ['Sl.', 'Item Description', 'Proposed Model/Part No.', 'Total Qty', 'UOM', 'Unit Price ₹', 'Total Price ₹'],
    [1, 'Proximity probe, 8 mm', 'PRB-8', 2, 'EA', 1250, 2500],
  ] }] }, proposal, { sellTo: 'KSB Limited' })
  assert.equal(result.proposal.bom[0].common, 2)
  assert.equal(result.proposal.bom[0].qtyPerUnit, 0)
  assert.equal(result.proposal.bom[0].quoted, 1250)
  assert.equal(result.changes[0].type, 'updated')
  assert.equal(result.issues.length, 1)
  assert.equal(result.issues[0].code, 'customer.mismatch')
})

test('reports invalid quantities, totals, and unmatched workbook rows', () => {
  const result = importReviewedWorkbook({ sheets: [{ name: 'Proposal', rows: [
    ['Description', 'Part Number', 'Quantity', 'Unit Price', 'Total Price'],
    ['New cable', 'CAB-5', 0, 100, 10],
  ] }] }, proposal, { sellTo: '' })
  assert.ok(result.issues.some(issue => issue.code === 'line.quantity'))
  assert.ok(result.issues.some(issue => issue.code === 'line.total'))
  assert.ok(result.issues.some(issue => issue.code === 'line.unmatched'))
  assert.equal(result.proposal.bom.length, 2)
})

test('normalizes AI findings without allowing arbitrary severities', () => {
  const findings = normalizeAiReview({ findings: [{ severity: 'block', code: 'scope', text: 'Scope differs', evidence: 'Proposal row 4' }, { severity: 'danger', finding: 'Review this' }] })
  assert.deepEqual(findings.map(item => item.severity), ['block', 'warning'])
  assert.equal(findings[0].source, 'AI')
})
