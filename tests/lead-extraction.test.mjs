import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { deterministicLeadRoute, leadTextChunks, mergeLeadResults, pageAwareChunks, textChunks } from '../src/leadExtraction.js'

test('long email and attachment text are split into complete labelled chunks', () => {
  const body = 'B'.repeat(12001)
  const attachment = { name: 'spec.docx', text: 'A'.repeat(12001) }
  const chunks = leadTextChunks(body, [attachment])
  assert.equal(chunks.length, 4)
  assert.equal(chunks.map(x => x.text).join('').length, body.length + attachment.text.length)
  assert.equal(chunks[0].source, 'Email body')
  assert.equal(chunks[2].source, 'Attachment: spec.docx')
  assert.equal(chunks.every(x => x.total === chunks.length), true)
})

test('empty sources do not create extraction requests', () => {
  assert.deepEqual(textChunks('   '), [])
  assert.deepEqual(leadTextChunks('', [{ name: 'empty.txt', text: '' }]), [])
})

test('chunk results merge duplicate fields and line items while retaining conflicts', () => {
  const merged = mergeLeadResults([
    { summary: 'First section.', route: 'Spares', urgency: 'Normal', completeness: 60, suggestedOwner: 'RS',
      fields: [{ group: 'RFQ', k: 'Buyer reference', v: '14716', conf: 90, ev: 'page 1' }],
      lineItems: [{ description: 'Probe', partNumber: 'DS821', qty: 10, confidence: 80, evidence: 'page 2' }],
      missing: ['Delivery location'], next: ['Confirm delivery'] },
    { summary: 'Second section.', route: 'Spares', urgency: 'Urgent', completeness: 80, suggestedOwner: 'RS',
      fields: [{ group: 'RFQ', k: 'Buyer reference', v: '14716', conf: 95, ev: 'page 9' },
        { group: 'RFQ', k: 'Bid date', v: '2026-09-01', conf: 70, ev: 'page 10' }],
      lineItems: [{ description: 'Probe', partNumber: 'DS821', qty: 10, confidence: 88, evidence: 'page 3' }],
      missing: ['Bid date'], next: ['Confirm delivery'] },
  ])
  assert.equal(merged.fields.length, 2)
  assert.equal(merged.fields[0].ev, 'page 1; page 9')
  assert.equal(merged.lineItems.length, 1)
  assert.equal(merged.lineItems[0].evidence, 'page 2; page 3')
  assert.deepEqual(merged.missing, ['Delivery location', 'Bid date'])
  assert.equal(merged.urgency, 'Urgent')
})

test('physical buyer specifications are classified as Spares, not Service', () => {
  const route = deterministicLeadRoute('', [{
    name: '02_7425309-Buyers Speces.pdf',
    text: 'Supply of B&K Vibro spare sensors and accessories. Part No. DS821. Quantity 10 nos. OEM packing. Authorized dealer certificate required. Service support clause applies.',
  }])
  assert.equal(route, 'Spares')
  assert.equal(deterministicLeadRoute('Need field engineer for calibration and maintenance at site', []), 'Service')
})

test('genuinely conflicting field values are kept as structured alternatives, not flattened', () => {
  const merged = mergeLeadResults([
    { summary: 'A', route: 'Spares', urgency: 'Normal', completeness: 60, suggestedOwner: 'RS',
      fields: [{ group: 'RFQ', k: 'RFQ number', v: 'RFQ-100', conf: 80, ev: 'page 1' }],
      lineItems: [], missing: [], next: [] },
    { summary: 'B', route: 'Spares', urgency: 'Normal', completeness: 60, suggestedOwner: 'RS',
      fields: [{ group: 'RFQ', k: 'RFQ number', v: 'RFQ-200', conf: 60, ev: 'page 9' }],
      lineItems: [], missing: [], next: [] },
  ])
  assert.equal(merged.fields.length, 1)
  const field = merged.fields[0]
  assert.equal(field.v, 'RFQ-100', 'the first-seen value stays the addressable v — no semicolon flattening')
  assert.equal(field.alt.length, 1)
  assert.equal(field.alt[0].v, 'RFQ-200')
  assert.match(field.note, /Conflicting values/)
})

test('pageAwareChunks packs whole pages without splitting one across chunks', () => {
  const struct = [
    [{ text: 'A'.repeat(7000) }],
    [{ text: 'B'.repeat(7000) }],
    [{ text: 'C'.repeat(7000) }],
  ]
  const chunks = pageAwareChunks(struct, { source: 'Attachment: rfq.pdf' })
  assert.ok(chunks.length >= 2)
  for (const chunk of chunks) assert.ok(chunk.text.length <= 12000)
  assert.equal(chunks[0].pageStart, 1)
  assert.equal(chunks[chunks.length - 1].pageEnd, 3)
  // Every character from every page must survive somewhere in the chunks.
  assert.equal(chunks.map(c => c.text).join('\n').replace(/\n/g, '').length, 21000)
})

test('a single oversized page falls back to a character slice for that page only', () => {
  const struct = [[{ text: 'X'.repeat(30000) }]]
  const chunks = pageAwareChunks(struct, { source: 'Attachment: big.pdf' })
  assert.ok(chunks.length >= 3)
  for (const chunk of chunks) { assert.equal(chunk.pageStart, 1); assert.equal(chunk.pageEnd, 1) }
})

test('leadTextChunks prefers page-aware chunking when structPages is present', () => {
  const struct = [[{ text: 'A'.repeat(5000) }], [{ text: 'B'.repeat(5000) }]]
  const chunks = leadTextChunks('', [{ name: 'rfq.pdf', text: 'A'.repeat(5000) + '\nB'.repeat(5000), structPages: struct }])
  assert.ok(chunks.every(c => c.pageStart != null && c.pageEnd != null))
})

test('SPA rewrite excludes serverless API paths', () => {
  const config = fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')
  assert.match(config, /\(\?\!api\//)
})
