import test from 'node:test'
import assert from 'node:assert/strict'
import { leadFieldValue, leadIdentity, splitBuSegment, normalizeLeadLabel, inferEucFromText, labeledEucLocationFromText } from '../src/leadFieldMapping.js'
import { extractLeadIdentityFacts, mergeLeadResults } from '../src/leadExtraction.js'
import { mergeDeterministicIntoAi } from '../src/docScan.js'
import { hardenLeadExtraction } from '../src/leadRules.js'

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

test('EUN and project-site aliases map to the primary EUC fields', () => {
  const aliases = [
    { k: 'EUN', v: 'Tarali PSP' },
    { k: 'Project Site Address', v: 'Tarali, Maharashtra' },
  ]
  assert.equal(leadFieldValue(aliases, 'eucName'), 'Tarali PSP')
  assert.equal(leadFieldValue(aliases, 'eucLocation'), 'Tarali, Maharashtra')
  assert.equal(normalizeLeadLabel('BU / Segment'), 'bu segment')
})

test('site, plant and station facts remain available when EUC is absent', () => {
  const identity = leadIdentity({}, [
    { k: 'Station Name', v: 'Koyna Stage 3' },
    { k: 'Plant Location', v: 'Koyna, Maharashtra' },
  ])
  assert.equal(identity.eucName, 'Koyna Stage 3')
  assert.equal(identity.eucLocation, 'Koyna, Maharashtra')
})

test('prose installation details fill EUC name and location when labels are absent', () => {
  const identity = leadIdentity({
    subject: 'Request for quotation — Metrix vibration monitoring spares',
    body: 'Please quote replacement spares for the existing installation at Demo Thermal Plant, Korba, Chhattisgarh.',
  }, [])
  assert.deepEqual(inferEucFromText('existing installation at Demo Thermal Plant, Korba, Chhattisgarh'), {
    eucName: 'Demo Thermal Plant',
    eucLocation: 'Korba, Chhattisgarh',
  })
  assert.equal(identity.eucName, 'Demo Thermal Plant')
  assert.equal(identity.eucLocation, 'Korba, Chhattisgarh')
})

test('explicit Site Location text fills EUC Location when AI fields omit it', () => {
  const body = `
    End User: ABC Engineering Pvt. Ltd.
    Site Location: Pune, Maharashtra
    Contact Person: Rahul Mehta
  `
  assert.equal(labeledEucLocationFromText(body), 'Pune, Maharashtra')
  assert.equal(leadIdentity({ body }, []).eucLocation, 'Pune, Maharashtra')
})

test('same-customer delivery RFQs infer EUC name and multiline delivery location', () => {
  const body = `
    Please submit your quotation for the following spare components.

    Required delivery location:
    Tata Power Ltd.
    Mumbai, Maharashtra, India
  `
  assert.equal(labeledEucLocationFromText(body), 'Mumbai, Maharashtra')
  assert.deepEqual(leadIdentity({ sellTo: 'Tata Power Ltd.', body }, []), {
    sellTo: 'Tata Power Ltd.',
    eucName: 'Tata Power Ltd.',
    eucLocation: 'Mumbai, Maharashtra',
    contactPerson: '',
    contactPhone: '',
  })
})

test('inline RFQ wording infers the EUC from customer and city after at', () => {
  const identity = leadIdentity({
    body: 'Please submit your quotation for the components required at Tata Power, Mumbai:',
  }, [])
  assert.equal(identity.eucName, 'Tata Power')
  assert.equal(identity.eucLocation, 'Mumbai')
})

test('explicit end-user values override same-customer fallback', () => {
  const identity = leadIdentity({ sellTo: 'ABC EPC Pvt. Ltd.', body: 'Delivery location: Chennai, Tamil Nadu' }, [
    { k: 'EUN', v: 'Tata Power Mumbai Plant', state: 'accepted' },
    { k: 'EUC Location', v: 'Mumbai, Maharashtra', state: 'accepted' },
  ])
  assert.equal(identity.eucName, 'Tata Power Mumbai Plant')
  assert.equal(identity.eucLocation, 'Mumbai, Maharashtra')
})

test('saved or structured EUC Location overrides the text fallback', () => {
  const body = 'Site Location: Pune, Maharashtra'
  assert.equal(leadIdentity({ body, eucLocation: 'Mumbai, Maharashtra' }, []).eucLocation, 'Mumbai, Maharashtra')
  assert.equal(leadIdentity({ body }, [{ k: 'EUC Location', v: 'Nashik, Maharashtra' }]).eucLocation, 'Nashik, Maharashtra')
})

test('plant-only source survives extraction merging into the EUC decision', () => {
  const body = 'Customer: ABC EPC\nPlant Name: Salal Power Station\nPlant Location: Reasi, Jammu & Kashmir'
  const facts = extractLeadIdentityFacts(body)
  const merged = mergeDeterministicIntoAi(mergeLeadResults([{ fields: [] }]), facts.fields)
  const ai = hardenLeadExtraction(merged, { text: body })
  const identity = leadIdentity({ body }, ai.fields)
  assert.equal(identity.eucName, 'Salal Power Station')
  assert.equal(identity.eucLocation, 'Reasi, Jammu & Kashmir')
})

test('explicit EUC fields outrank earlier generic location and site aliases', () => {
  const identity = leadIdentity({}, [
    { k: 'Location', v: 'Delhi' },
    { k: 'Site / Plant Name', v: 'Salal Power Station' },
    { k: 'Delivery / Site Location', v: 'Delhi warehouse' },
    { k: 'EUC Name', v: 'NHPC' },
    { k: 'EUC Location', v: 'Reasi' },
  ])
  assert.equal(identity.eucName, 'NHPC')
  assert.equal(identity.eucLocation, 'Reasi')
})

test('missing EUC stays blank instead of copying an EPC buyer', () => {
  assert.equal(leadIdentity({ sellTo: 'ABC EPC', body: 'Please quote two probes.' }, []).eucName, '')
})

test('a contact office is not inferred as an end user', () => {
  assert.deepEqual(inferEucFromText('Contact us at Sales Office, Delhi:'), { eucName: '', eucLocation: '' })
})

test('an explicit site location outranks the stored generic buyer location', () => {
  assert.equal(leadIdentity({ location: 'Delhi', body: 'Site Location: Reasi' }, []).eucLocation, 'Reasi')
})

test('an explicit source site location outranks a generic AI location', () => {
  assert.equal(leadIdentity({ body: 'Site Location: Reasi' }, [{ k: 'Location', v: 'Delhi' }]).eucLocation, 'Reasi')
})

test('source hardening keeps the EUC location separate from an earlier delivery warehouse', () => {
  const body = 'Delivery Location: Delhi warehouse\nEUC Name: NHPC\nEUC Location: Reasi'
  const ai = hardenLeadExtraction({ fields: [
    { k: 'Location', v: 'Delhi', conf: 95, ev: 'Buyer office' },
    { k: 'EUC Location', v: 'Reasi', conf: 95, ev: 'Plant address' },
  ] }, { text: body })
  assert.equal(leadIdentity({ body }, ai.fields).eucLocation, 'Reasi')
  assert.equal(ai.fields.find(field => field.k === 'Location').v, 'Delhi')
})

test('blank and rejected EUC fields do not hide usable site facts', () => {
  const identity = leadIdentity({}, [
    { k: 'EUC Name', v: 'Wrong company', state: 'rejected' },
    { k: 'EUC Name', v: ' ' },
    { k: 'Site / Plant Name', v: 'Salal Power Station' },
    { k: 'EUC Location', v: '' },
    { k: 'Site / Plant Location', v: 'Reasi' },
  ])
  assert.equal(identity.eucName, 'Salal Power Station')
  assert.equal(identity.eucLocation, 'Reasi')
})
