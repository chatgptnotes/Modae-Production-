import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
function component() {
  assert.ok(fs.existsSync('src/workbench/PhonePartsWorkspace.jsx'), 'parts workspace exists')
  const { outputFiles } = buildSync({ entryPoints: ['src/workbench/PhonePartsWorkspace.jsx'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom', 'react-router-dom'], define: { 'import.meta.url': JSON.stringify(new URL('../src/branding/modae.js', import.meta.url).href) } })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', outputFiles[0].text)(require, module, module.exports)
  return module.exports.default
}
const parts = Array.from({ length: 20 }, (_, i) => ({ id: `P${i}`, oppId: 'O1', pn: 'SAME-PART', custRef: `REF-${i}`, desc: 'Monitoring spare', qty: 2, listPrice: 100, currency: 'INR', priceState: 'Current', confirmed: false }))
const props = { oppId: 'O1', userId: 'QA', lines: parts, costing: {}, canPrice: true, canEdit: true, formatMoney: value => `INR ${value}`, formatDraft: value => String(value), displayCurrency: 'INR', sourceDetails: () => ({ primary: 'List' }) }

test('compact workspace keeps repeated requested rows and exposes multi-row editing and status filters', () => {
  const html = renderToStaticMarkup(React.createElement(component(), props))
  assert.equal((html.match(/data-part-id="P/g) || []).length, 20)
  assert.match(html, /Edit quantities/)
  assert.match(html, /Edit prices/)
  assert.match(html, /Needs attention/)
  assert.match(html, /Ready/)
})

test('restricted workspace never renders commercial values or bulk editing controls', () => {
  const html = renderToStaticMarkup(React.createElement(component(), { ...props, canPrice: false, canEdit: false }))
  assert.doesNotMatch(html, /INR 100|INR 200|Edit prices|Batch pricing|Confirm selected/)
  assert.match(html, /Pricing restricted/)
})

test('completed-stage workspace hides mutations while retaining visible parts and status', () => {
  const html = renderToStaticMarkup(React.createElement(component(), { ...props, canEdit: false }))
  assert.doesNotMatch(html, /Edit quantities|Edit prices|Confirm selected|Batch pricing/)
  assert.match(html, /Read-only/)
  assert.match(html, /SAME-PART/)
})
