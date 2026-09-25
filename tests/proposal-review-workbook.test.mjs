import test from 'node:test'
import assert from 'node:assert/strict'
import { extractCommercialTerms, importReviewedWorkbook, normalizeAiReview } from '../src/proposal/reviewWorkbook.js'

const proposal = {
  units: 7,
  bom: [{ desc: 'Proximity probe, 8 mm', pn: 'PRB-8', qtyPerUnit: 1, common: 0, spares: 0, quoted: '', uom: 'EA' }],
}

test('imports reviewed workbook quantities and prices into matching proposal lines', () => {
  const result = importReviewedWorkbook({ sheets: [{ name: 'Priced BoQ', rows: [
    ['Sl.', 'Scope / Equipment Description', 'Proposed Model/Part No.', 'Total Quantity', 'UOM', 'Unit Price ₹', 'Total Price ₹'],
    [1, 'Proximity probe, 8 mm', 'PRB-8', 2, 'EA', 1250, 2500],
  ] }] }, proposal, { sellTo: 'KSB Limited' })
  assert.equal(result.proposal.bom[0].common, 2)
  assert.equal(result.proposal.bom[0].qtyPerUnit, 0)
  assert.equal(result.proposal.bom[0].quoted, 1250)
  assert.equal(result.changes[0].type, 'updated')
  assert.deepEqual(result.changes[0].fields.map(field => field.field), ['quantity', 'unitPrice', 'totalPrice'])
  assert.ok(result.issues.some(issue => issue.code === 'line.value-changed' && /Quantity for .* changed from "7" to "2"/.test(issue.text)))
  assert.ok(result.issues.some(issue => issue.code === 'line.value-changed' && /Unit price for .* changed from "blank" to "1250"/.test(issue.text)))
  assert.ok(result.issues.some(issue => issue.code === 'customer.mismatch'))
})

test('formats UOM changes with explicit old and new values', () => {
  const result = importReviewedWorkbook({ sheets: [{ name: 'Priced BoQ', rows: [
    ['Description', 'Part Number', 'Quantity', 'UOM'],
    ['VC-8000 universal monitoring module', 'VC-8000/UMM', 1, 'EA'],
  ] }] }, {
    units: 1,
    bom: [{ desc: 'VC-8000 universal monitoring module', pn: 'VC-8000/UMM', qtyPerUnit: 0, common: 1, spares: 0, uom: 'No.' }],
  }, { sellTo: '' })
  assert.ok(result.issues.some(issue => issue.code === 'line.value-changed'
    && issue.text === 'UOM for "VC-8000 universal monitoring module" changed from "No." to "EA".'))
})

test('does not report value changes when the uploaded workbook is unchanged', () => {
  const unchanged = {
    ...proposal,
    bom: [{ ...proposal.bom[0], common: 2, qtyPerUnit: 0, quoted: 1250 }],
  }
  const result = importReviewedWorkbook({ sheets: [{ name: 'Priced BoQ', rows: [
    ['Sl.', 'Scope / Equipment Description', 'Proposed Model/Part No.', 'Total Quantity', 'UOM', 'Unit Price ₹', 'Total Price ₹'],
    [1, 'Proximity probe, 8 mm', 'PRB-8', 2, 'EA', 1250, 2500],
  ] }] }, unchanged, { sellTo: '' })
  assert.equal(result.issues.some(issue => issue.code === 'line.value-changed'), false)
  assert.deepEqual(result.changes[0].fields, [])
})

test('matches the rounded downloaded draft despite hidden source precision', () => {
  const result = importReviewedWorkbook({ sheets: [{ name: 'Priced BoQ', rows: [
    ['Description', 'Part Number', 'Total Quantity', 'UOM', 'Unit Price', 'Total Price'],
    ['Precision item', 'P-2', 10, 'EA', 72755.20, 727552.00],
  ] }] }, {
    units: 1,
    bom: [{ desc: 'Precision item', pn: 'P-2', qtyPerUnit: 10, common: 0, spares: 0, quoted: 72755.196, uom: 'EA' }],
  }, { sellTo: '' })
  assert.equal(result.issues.some(issue => issue.code === 'line.value-changed'), false)
  assert.equal(result.proposal.bom[0].quoted, 72755.2)
})

test('keeps genuine uploaded price changes visible after normalization', () => {
  const result = importReviewedWorkbook({ sheets: [{ name: 'Priced BoQ', rows: [
    ['Description', 'Part Number', 'Total Quantity', 'UOM', 'Unit Price', 'Total Price'],
    ['Changed item', 'P-3', 10, 'EA', 33, 330],
  ] }] }, {
    units: 1,
    bom: [{ desc: 'Changed item', pn: 'P-3', qtyPerUnit: 10, common: 0, spares: 0, quoted: 72755.2, uom: 'EA' }],
  }, { sellTo: '' })
  const changes = result.issues.filter(issue => issue.code === 'line.value-changed')
  assert.ok(changes.some(issue => issue.change.field === 'unitPrice' && issue.change.before === 72755.2 && issue.change.after === 33))
  assert.ok(changes.some(issue => issue.change.field === 'totalPrice' && issue.change.before === 727552 && issue.change.after === 330))
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

test('compares uploaded commercial terms with the original proposal without blocking', () => {
  const workbook = { sheets: [{ name: 'Firm Offer Rev-04', rows: [
    ['Description', 'Part Number', 'Quantity', 'Unit Price', 'Total Price'],
    ['Proximity probe, 8 mm', 'PRB-8', 1, 1250, 1250],
    [],
    ['Terms & Conditions:'],
    ['1. Payment Terms:'],
    ['30 days from invoice'],
    ['2. Delivery Period:'],
    ['8 weeks ex-works'],
  ] }] }
  const original = {
    ...proposal,
    units: 1,
    terms: [
      { key: 'payment', term: 'Payment', ourResponse: '50% advance and balance on material readiness' },
      { key: 'delivery', term: 'Delivery', ourResponse: '10–12 weeks ex-works' },
    ],
    bom: [{ ...proposal.bom[0], qtyPerUnit: 0, common: 1, quoted: 1250 }],
  }
  const extracted = extractCommercialTerms(workbook)
  assert.deepEqual(extracted.map(term => term.key), ['payment', 'delivery'])
  const result = importReviewedWorkbook(workbook, original, { sellTo: '' })
  const termIssues = result.issues.filter(issue => issue.code === 'term.value-changed')
  assert.equal(termIssues.length, 2)
  assert.ok(termIssues.every(issue => issue.severity === 'info' && issue.humanReview))
  assert.match(termIssues[0].text, /50% advance.*30 days from invoice/)
  assert.equal(termIssues[0].evidence, 'Firm Offer Rev-04, Row 5')
  assert.deepEqual(result.termChanges.map(change => change.label), ['Payment', 'Delivery'])
})

test('normalizes AI findings without allowing arbitrary severities', () => {
  const findings = normalizeAiReview({ findings: [{ severity: 'block', code: 'scope', text: 'Scope differs', evidence: 'Proposal row 4' }, { severity: 'danger', finding: 'Review this' }] })
  assert.deepEqual(findings.map(item => item.severity), ['block', 'warning'])
  assert.equal(findings[0].source, 'AI')
})
