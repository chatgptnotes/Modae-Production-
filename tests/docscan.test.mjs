import test from 'node:test'
import assert from 'node:assert/strict'
import { parsedToLeadFields, mergeDeterministicIntoAi, deterministicPromptContext } from '../src/docScan.js'

const sampleParsed = {
  header: { buyer: 'NTPC Limited', station: 'Vindhyachal Super Thermal Power Station', subject: 'Supply of vibration sensors', sectionRef: 'RFQ-4521', rfqDate: '2026-05-01', signatory: 'Chief Engineer (C&I)' },
  items: [
    { description: 'Proximity Probe', pn: 'DS821', sapCode: 'A1234567890123', uom: 'NOS', qty: 10, confidence: 0.95 },
  ],
  compliance: [
    { label: 'Warranty', customerAsk: '18 months from supply', ourResponse: 'Comply', status: 'Comply' },
  ],
  confidence: { header: 1, items: 0.95, terms: 0.6 },
}

test('parsedToLeadFields maps parseTender output into ai.fields/lineItems shape', () => {
  const { fields, lineItems } = parsedToLeadFields(sampleParsed, 'rfq.pdf')
  const byKey = k => fields.find(f => f.k === k)
  assert.equal(byKey('Buyer').v, 'NTPC Limited')
  assert.equal(byKey('RFQ number').v, 'RFQ-4521')
  assert.equal(byKey('RFQ date').v, '2026-05-01')
  assert.ok(fields.every(f => f.source === 'deterministic'))
  assert.ok(fields.some(f => f.group === 'Compliance'))
  assert.equal(lineItems.length, 1)
  assert.equal(lineItems[0].partNumber, 'DS821')
  assert.equal(lineItems[0].customerRef, 'A1234567890123')
  assert.equal(lineItems[0].confidence, 95)
})

test('parsedToLeadFields tolerates a null parse', () => {
  assert.deepEqual(parsedToLeadFields(null, 'x.pdf'), { fields: [], lineItems: [] })
})

test('deterministic RFQ number wins outright over a lower-confidence conflicting AI field, AI value kept as alt', () => {
  const ai = {
    fields: [{ group: 'RFQ', k: 'RFQ number', v: 'RFQ-WRONG', conf: 50, ev: 'AI guess from body' }],
    lineItems: [],
  }
  const { fields } = parsedToLeadFields(sampleParsed, 'rfq.pdf')
  const merged = mergeDeterministicIntoAi(ai, fields, [])
  const rfqNumber = merged.fields.find(f => f.k === 'RFQ number')
  assert.equal(rfqNumber.v, 'RFQ-4521')
  assert.equal(rfqNumber.source, 'deterministic')
  assert.equal(rfqNumber.alt.length, 1)
  assert.equal(rfqNumber.alt[0].v, 'RFQ-WRONG')
})

test('a matching value is not duplicated as a conflict', () => {
  const ai = { fields: [{ group: 'RFQ', k: 'RFQ number', v: 'RFQ-4521', conf: 60, ev: 'AI' }], lineItems: [] }
  const { fields } = parsedToLeadFields(sampleParsed, 'rfq.pdf')
  const merged = mergeDeterministicIntoAi(ai, fields, [])
  const rfqNumber = merged.fields.find(f => f.k === 'RFQ number')
  assert.equal(rfqNumber.alt, undefined)
  assert.ok(rfqNumber.conf >= 60)
})

test('deterministic line items merge by part number, keeping the richer description', () => {
  const ai = {
    fields: [],
    lineItems: [{ description: '', partNumber: 'DS821', customerRef: '', qty: 5, confidence: 40, evidence: 'AI body read' }],
  }
  const { lineItems } = parsedToLeadFields(sampleParsed, 'rfq.pdf')
  const merged = mergeDeterministicIntoAi(ai, [], lineItems)
  assert.equal(merged.lineItems.length, 1)
  assert.equal(merged.lineItems[0].description, 'Proximity Probe')
  assert.equal(merged.lineItems[0].qty, 10)
  assert.match(merged.lineItems[0].evidence, /Deterministic parse: rfq.pdf/)
})

test('mergeDeterministicIntoAi is a no-op when there is nothing deterministic', () => {
  const ai = { fields: [{ group: 'RFQ', k: 'Subject', v: 'X', conf: 80, ev: 'e' }], lineItems: [] }
  assert.equal(mergeDeterministicIntoAi(ai, [], []), ai)
  assert.equal(mergeDeterministicIntoAi(null, [], []), null)
})

test('deterministicPromptContext summarizes each scanned attachment on one line', () => {
  const context = deterministicPromptContext([{ name: 'rfq.pdf', parsed: sampleParsed }])
  assert.match(context, /rfq\.pdf: buyer=NTPC Limited/)
  assert.match(context, /items=1/)
})
