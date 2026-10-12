import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { buildSync } from 'esbuild'
import { leadIdentity } from '../src/leadFieldMapping.js'

const require = createRequire(import.meta.url)
const { outputFiles } = buildSync({
  stdin: { contents: "export { extractLead } from './src/pages/Inbox.jsx'", resolveDir: process.cwd() },
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
