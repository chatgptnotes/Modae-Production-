import test from 'node:test'
import assert from 'node:assert/strict'
import { extractSparesTable } from '../src/leadSparesTable.js'
import { enquiryEmailFacts } from '../src/leadEmailFacts.js'
import { buildLeadProposalData } from '../src/leadBoq.js'
import { enquiry, rows } from './fixtures/spares-enquiry.mjs'
import { deriveOpportunityScope } from '../src/leadScope.js'

test('parsed spares survive proposal handoff without duplicating quantities or losing equipment references', () => {
  const parsed = extractSparesTable(enquiry)
  const { extracted, workbenchRows } = buildLeadProposalData({ ai: { lineItems: parsed }, attachments: [{ name: 'customer-spares-enquiry.pdf', text: enquiry }] }, {})
  assert.equal(extracted.length, 6)
  assert.deepEqual(extracted.map(i => i.qty), [4,2,12,6,2,2])
  assert.deepEqual(extracted.map(i => i.equipmentRef), rows.map(r => r[1]))
  assert.deepEqual(workbenchRows.map(i => i.equipmentRef), rows.map(r => r[1]))
  assert.deepEqual(workbenchRows.map(i => i.uom), rows.map(r => r[5]))
})

test('geometric PDF table supports wrapped descriptions, split headers and repeated page headers', () => {
  const x = [50,80,150,250,480,515]
  const line = (cells, y) => ({ y, text: cells.filter(Boolean).join(' '), items: cells.flatMap((str,i)=>str?[{x:x[i],str,w:20}]:[]) })
  const header = line(['Item','Equipment ref.','Part number','Description / specification','Qty','Unit'],700)
  const struct = [[header,line(rows[0],680),line(['','','','Includes body seals','',''],660)], [header,line(rows[1],680),line(['Please quote your best price','','','','',''],600)]]
  const result = extractSparesTable('',struct)
  assert.equal(result.length,2)
  assert.match(result[0].description,/Includes body seals/)
  assert.deepEqual(result.map(i=>i.qty),[4,2])
})

test('internal signatures and conflicting external senders cannot become customer identities', () => {
  const text='From: Internal Owner <owner@mod-ae.com>\nRegards,\nInternal Owner\nModAE India Pvt. Ltd.'
  const fields=enquiryEmailFacts(text,{from:'owner@mod-ae.com',isInternal:e=>e.endsWith('@mod-ae.com')})
  assert.equal(fields.some(f=>/Contact person|Sell-to customer/.test(f.k)),false)
  const conflicting=enquiryEmailFacts(enquiry+'\nFrom: Someone Else <someone@other.example>')
  assert.equal(conflicting.some(f=>f.k==='Contact person'),false)
})

test('same part for distinct equipment stays separate and exact table repeats are coalesced', () => {
  const first=rows[0].join(' ')
  const second=['2','BV-UT-204',...rows[0].slice(2)].join(' ')
  const source='Item Equipment ref. Part number Description Qty Unit\n'+[first,first,second].join('\n')
  const parsed=extractSparesTable(source)
  assert.equal(parsed.length,2)
  const {extracted}=buildLeadProposalData({ai:{lineItems:parsed}}, {})
  assert.equal(extracted.length,2)
  assert.deepEqual(extracted.map(i=>i.qty),[4,4])
})

test('AI wording changes do not double the quantity already present in the source table', () => {
  const parsed=extractSparesTable(enquiry)
  parsed[0].description+=' Includes body seals'
  const {extracted}=buildLeadProposalData({ai:{lineItems:parsed},attachments:[{name:'enquiry.pdf',text:enquiry}]},{})
  assert.equal(extracted.length,6)
  assert.deepEqual(extracted.map(i=>i.qty),[4,2,12,6,2,2])
})

test('missing quantities are not silently changed to one during opportunity handoff', () => {
  const {extracted,workbenchRows}=buildLeadProposalData({ai:{lineItems:[{partNumber:'EPS-BV50-SK-316',equipmentRef:'BV-UT-201',description:'Ball valve kit',qty:0,uom:'sets'}]}},{})
  assert.equal(extracted[0].qty,0)
  assert.equal(workbenchRows[0].qty,0)
})

test('opportunity scope names each requested family without copying commercial terms or full specifications', () => {
  const scope=deriveOpportunityScope(extractSparesTable(enquiry))
  for(const family of ['seal kit','gasket','actuator repair kit','solenoid valve']) assert.ok(scope.includes(family))
  assert.match(scope,/6 line items/)
  assert.ok(scope.length<=220)
  assert.doesNotMatch(scope,/GST|freight|24 V|EPS-/)
})
