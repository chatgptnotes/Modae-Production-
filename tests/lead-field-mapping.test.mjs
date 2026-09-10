import test from 'node:test'
import assert from 'node:assert/strict'
import { leadFieldValue, leadIdentity, splitBuSegment } from '../src/leadFieldMapping.js'

const fields = [
  { k: 'CUSTOMER NAME', v: 'KSB Limited', state: 'accepted' },
  { k: 'SITE', v: 'KSB Pune Plant', state: 'accepted' },
  { k: 'SITE LOCATION', v: 'Pune, Maharashtra', state: 'accepted' },
  { k: 'CONTACT PERSON', v: 'Neha Kulkarni', state: 'accepted' },
  { k: 'MOBILE', v: '+91 90000 12345', state: 'accepted' },
  { k: 'BU / Segment', v: 'Aero / Thermal', state: 'accepted' },
]

test('lead aliases map customer, site and contact values to the right fields', () => {
  assert.equal(leadFieldValue(fields, 'sellTo'), 'KSB Limited')
  assert.equal(leadFieldValue(fields, 'eucName'), 'KSB Pune Plant')
  assert.equal(leadFieldValue(fields, 'eucLocation'), 'Pune, Maharashtra')
  assert.equal(leadFieldValue(fields, 'contactPerson'), 'Neha Kulkarni')
  assert.equal(leadFieldValue(fields, 'contactPhone'), '+91 90000 12345')
})

test('combined BU and Segment extraction is split into separate values', () => {
  assert.deepEqual(splitBuSegment(fields), { bu: 'Aero', segment: 'Thermal' })
})

test('human lead fields take priority over extracted aliases', () => {
  const identity = leadIdentity({ sellTo: 'Confirmed Customer', eucName: 'Confirmed Site' }, fields)
  assert.equal(identity.sellTo, 'Confirmed Customer')
  assert.equal(identity.eucName, 'Confirmed Site')
  assert.equal(identity.contactPerson, 'Neha Kulkarni')
})
