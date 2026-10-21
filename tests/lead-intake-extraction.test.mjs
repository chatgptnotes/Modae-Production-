import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { buildSync } from 'esbuild'
import { leadIdentity } from '../src/leadFieldMapping.js'
import { enquiry, rows } from './fixtures/spares-enquiry.mjs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const { outputFiles } = buildSync({
  stdin: { contents: "export { extractLead, StructuredItemsTable, reconcileMissingWithDecisions } from './src/pages/Inbox.jsx'", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  loader: { '.js': 'jsx', '.css': 'empty', '.png': 'text', '.jpg': 'text' },
  define: {
    'import.meta.env': '{}',
    'import.meta.url': JSON.stringify(new URL('../src/branding/modae.js', import.meta.url).href),
  },
})
const bundled = { exports: {} }
new Function('require', 'module', 'exports', outputFiles[0].text)(require, bundled, bundled.exports)
const { extractLead } = bundled.exports

test('spares table shows real references, units and every row on desktop and phone', () => {
  for (const phoneLayout of [false,true]) {
    const html=renderToStaticMarkup(React.createElement(bundled.exports.StructuredItemsTable,{items:rows.map(r=>({equipmentRef:r[1],partNumber:r[2],description:r[3],qty:Number(r[4]),uom:r[5]})),phoneLayout}))
    for (const row of rows) assert.ok(html.includes(row[2]))
    assert.match(html,/Equipment reference/)
    assert.match(html,/sets/)
    const empty=renderToStaticMarkup(React.createElement(bundled.exports.StructuredItemsTable,{items:[]}))
    assert.match(empty,/No spares extracted/)
    assert.doesNotMatch(empty,/MPC4|VM600|Eddy-current/)
    const missing=renderToStaticMarkup(React.createElement(bundled.exports.StructuredItemsTable,{items:[{description:'Kit',qty:0}]}))
    assert.doesNotMatch(missing,/<td>1<\/td>/)
  }
})

test('source identity beats invalid high-confidence AI guesses and items survive partial scans', async () => {
  const originalFetch=globalThis.fetch
  let calls=0
  try {
    globalThis.fetch=async()=>++calls===1 ? Response.json({ok:true,data:{summary:'Spare parts',route:'Spares',fields:[
      {group:'Customer',k:'Sell-to customer',v:'wrong-filename.pdf',conf:99,ev:'file'},
      {group:'Customer',k:'Contact person',v:'anita.rao@example.com',conf:99,ev:'From'},
    ],lineItems:[],missing:[],next:[]}}) : Response.json({ok:false,errorCode:'AI_TIMEOUT',error:'AI request timed out'},{status:504})
    const lead=await extractLead({from:'',body:'Please read the enquiry.',subject:'',attachments:[{name:'customer-spares-enquiry.pdf',text:enquiry}]},{customers:[],config:{}})
    assert.equal(lead.contactPerson,'Anita Rao')
    assert.match(lead.sellTo,/Example Process/)
    assert.equal(lead.ai.lineItems.length,6)
    assert.equal(lead.ai.scan.completed,1)
    assert.equal(lead.ai.scan.complete,false)
    assert.equal(lead.ai.scan.failures[0].errorCode,'AI_TIMEOUT')
    assert.ok(lead.ai.fields.every(f=>f.state==='pending'))
  } finally {globalThis.fetch=originalFetch}
})

test('attachment-only customer email survives AI failure with all six spares and header details', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => Response.json({ ok: false, errorCode: 'AI_KEY_MISSING', error: 'AI is not configured' }, { status: 503 })
    const lead = await extractLead({ from: '', subject: '', body: '', attachments: [{ name: 'customer-spares-enquiry.pdf', text: enquiry }] }, { customers: [], config: {} })
    assert.match(leadIdentity(lead, lead.ai.fields).sellTo, /^Example Process Systems Pvt\. Ltd\.?$/)
    assert.equal(leadIdentity(lead, lead.ai.fields).contactPerson, 'Anita Rao')
    assert.equal(lead.contactEmail, 'anita.rao@example.com')
    assert.match(lead.sellToCustomerLocation, /Bengaluru/)
    assert.equal(lead.rfqNumber, 'EPS/RFQ/26-27/184')
    assert.equal(lead.rfqDate, '2026-10-20')
    assert.equal(lead.source, 'Email')
    assert.deepEqual(lead.ai.lineItems.map(x => x.partNumber), rows.map(r => r[2]))
    assert.deepEqual(lead.ai.lineItems.map(x => x.qty), [4, 2, 12, 6, 2, 2])
    assert.deepEqual(lead.ai.lineItems.map(x => x.equipmentRef), rows.map(r => r[1]))
    assert.match(lead.opportunityScope, /seal kit/i)
    assert.ok(lead.opportunityScope.length <= 220)
    assert.equal(lead.ai.scan.complete, false)
    assert.equal(lead.ai.scan.failures[0].errorCode, 'AI_KEY_MISSING')
    assert.match(lead.ai.summary, /AI is not configured/)
  } finally { globalThis.fetch = originalFetch }
})

test('fallback intake does not present the buyer as an extracted EUC', async () => {
  const lead = await extractLead({ from: 'buyer@example.com', subject: 'Probe enquiry', body: 'Customer: ABC EPC\nPlease quote two probes.' }, {
    customers: [], config: { aiModel: { provider: 'Built-in fallback' } },
  })
  assert.equal(lead.sellTo, 'ABC EPC')
  assert.equal(lead.eucName, '')
  assert.equal(lead.ai.fields.some(field => field.k === 'EUC Name'), false)
  assert.equal(leadIdentity(lead, lead.ai.fields).eucName, '')
})

test('fallback intake maps a named plant instead of its EPC buyer', async () => {
  const lead = await extractLead({ from: 'buyer@example.com', subject: 'Probe enquiry', body: 'Customer: ABC EPC\nPlant Name: Salal Power Station\nPlant Location: Reasi, Jammu & Kashmir' }, {
    customers: [], config: { aiModel: { provider: 'Built-in fallback' } },
  })
  const identity = leadIdentity(lead, lead.ai.fields)
  assert.equal(identity.sellTo, 'ABC EPC')
  assert.equal(identity.eucName, 'Salal Power Station')
  assert.equal(identity.eucLocation, 'Reasi, Jammu & Kashmir')
})

test('AI intake keeps the end user and plant location through review mapping', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => Response.json({ ok: true, data: {
      summary: 'Spare probes for NHPC.', route: 'Spares', urgency: 'Normal', completeness: 80,
      suggestedOwner: '', fields: [
        { group: 'Customer', k: 'Sell-to customer', v: 'ABC EPC', conf: 95, ev: 'Buyer in email' },
        { group: 'Customer', k: 'Location', v: 'Delhi', conf: 95, ev: 'Buyer office' },
        { group: 'Customer', k: 'EUC Name', v: 'NHPC', conf: 95, ev: 'Enquiry end user' },
        { group: 'Customer', k: 'EUC Location', v: 'Reasi', conf: 95, ev: 'Enquiry installation' },
      ], lineItems: [], missing: [], next: [],
    } })
    const lead = await extractLead({ from: 'buyer@example.com', subject: 'Probe enquiry', body: 'Buyer Location: Delhi\nDelivery Location: Delhi warehouse\nEUC Name: NHPC\nEUC Location: Reasi\nPlease quote two probes for NHPC.' }, {
      customers: [], config: {},
    })
    const identity = leadIdentity(lead, lead.ai.fields)
    assert.equal(identity.sellTo, 'ABC EPC')
    assert.equal(identity.eucName, 'NHPC')
    assert.equal(identity.eucLocation, 'Reasi')
    assert.equal(lead.ai.scan.complete, true)
    assert.equal(lead.ai.fields.every(field => field.state === 'pending'), true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('sample spares RFQ preserves explicit scope and rejects placeholder contact data', async () => {
  const originalFetch = globalThis.fetch
  const scope = 'Supply of pump seals, bearings, gaskets, compressor filters and valve service kits.'
  const sample = `RFQ No: DVE/SP/2026/1042 Date: 21 October 2026
Customer: Demo Valley Engineering Pvt. Ltd.
Telephone: +91 00000 00000 (test placeholder)
Delivery address: Pune, Maharashtra
Scope: ${scope}
Item Equipment ref. Part number Description Qty Unit
1 P-101A MSK-045-EPDM Mechanical seal kit 2 SET
2 P-101A BRG-6309-C3 Deep-groove ball bearing 4 NOS`
  try {
    for (const ok of [true, false]) {
      globalThis.fetch = async () => Response.json(ok ? {ok:true,data:{fields:[{k:'RFQ number',v:'WRONG',ev:'AI',conf:99},{k:'Contact phone',v:'+91 00000 00000',ev:'AI',conf:99}],lineItems:[]}} : {ok:false,error:'Unavailable'})
      const lead = await extractLead({attachments:[{name:'spares.pdf',text:sample}]}, {customers:[],config:{}})
      assert.equal(lead.rfqNumber, 'DVE/SP/2026/1042')
      assert.equal(lead.opportunityScope, scope)
      assert.equal(lead.contactPhone, '')
      assert.equal(lead.ai.lineItems.length, 2)
      assert.match(lead.ai.fields.find(f => f.k === 'EUC Location').note, /confirm end-user location/)
    }
  } finally { globalThis.fetch = originalFetch }
})

test('eight-row sample RFQ keeps every requested part and RFQ date on provider failure', async () => {
  const {sampleSparesRfq, sampleSparesRows, sampleSparesScope} = await import('./fixtures/sample-spares-rfq.mjs')
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => Response.json({ok:false,error:'Unavailable'})
    const lead = await extractLead({attachments:[{name:'sample-spares.pdf',text:sampleSparesRfq}]}, {customers:[],config:{}})
    assert.equal(lead.rfqNumber, 'DVE/SP/2026/1042')
    assert.equal(lead.rfqDate, '2026-10-21')
    assert.equal(lead.opportunityScope, sampleSparesScope)
    assert.equal(lead.contactPhone, '')
    assert.deepEqual(lead.ai.lineItems.map(r => [r.equipmentRef,r.partNumber,r.description,r.qty,r.uom]), sampleSparesRows.map(r => [r[1],r[2],r[3],Number(r[4]),r[5]]))
  } finally { globalThis.fetch = originalFetch }
})


test('one complete spares row does not hide another row missing quantity or specifications', () => {
  const missing = ['Line 1: quantity', 'Line 2: quantity', 'Required operating specifications']
  const remaining = bundled.exports.reconcileMissingWithDecisions(missing, {}, [], [
    {description:'Seal',qty:2}, {description:'Bearing',qty:0},
  ])
  assert.deepEqual(remaining,['Line 2: quantity','Required operating specifications'])
})
