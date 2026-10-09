import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { buildSync } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { stateFromSaved } from '../src/appState.js'

test('tender intake can reopen an older compact cache without ad-hoc parts', () => {
  const restored = stateFromSaved(JSON.stringify({ opportunities: [], demoData: false }))
  assert.deepEqual(restored.adhocParts, [])
  const parts = [{ pn: 'LOCAL-42', supplier: 'Supplier quote', price: 120, currency: 'INR' }]
  assert.deepEqual(stateFromSaved(JSON.stringify({ opportunities: [], demoData: false, adhocParts: parts })).adhocParts, parts)
})

test('phone tender review retains editable lines, inclusion and pricing evidence', async () => {
  const require = createRequire(import.meta.url)
  const { outputFiles } = buildSync({ entryPoints: ['src/pages/PhoneTenderReview.jsx'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom'] })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', outputFiles[0].text)(require, module, module.exports)
  const html = renderToStaticMarkup(React.createElement(module.exports.PhoneTenderLines, {
    items: [{ sn: 1, description: 'Sensor cable', pn: 'SC-42', sapCode: 'SAP-12', uom: 'EA', qty: 2, confidence: .8 }],
    include: [false], matched: [{ match: { tier: 4, list: 'B&K', currency: 'EUR', price: 42, pn: 'SC-43' } }],
    setItem: () => () => {}, toggleInclude: () => {},
  }))
  assert.match(html, /Sensor cable/)
  assert.match(html, /value="SC-42"/)
  assert.match(html, /value="2"/)
  assert.match(html, /SAP-12/)
  assert.match(html, /Include line 1/)
  assert.doesNotMatch(html, /checked=""/)
  assert.match(html, /suggested from the description/)
  assert.match(html, /SC-43/)
  assert.match(html, /Medium/)
  assert.doesNotMatch(html, /<table/)
  const missingPrice = renderToStaticMarkup(React.createElement(module.exports.PhoneTenderLines, {
    items: [{ sn: 1, description: 'Unknown part', confidence: .4 }], include: [true], matched: [], setItem: () => () => {}, toggleInclude: () => {},
  }))
  assert.match(missingPrice, /checked=""/)
  assert.match(missingPrice, /supplier quote needed/)
})

test('phone commercial review preserves customer ask, response, verdict and source', async () => {
  const require = createRequire(import.meta.url)
  const { outputFiles } = buildSync({ entryPoints: ['src/pages/PhoneTenderReview.jsx'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom'] })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', outputFiles[0].text)(require, module, module.exports)
  const html = renderToStaticMarkup(React.createElement(module.exports.PhoneTenderTerms, {
    comp: [{ key: 'delivery', label: 'Delivery', customerAsk: 'Four weeks', ourResponse: 'Six weeks', status: 'Deviation', needsReview: true, clauseRef: 'Clause 2' }],
    parse: { terms: [{ n: 2, text: 'Delivery required within four weeks.' }], preNotes: [] }, setCompRow: () => () => {},
  }))
  assert.match(html, /Four weeks/)
  assert.match(html, /value="Six weeks"/)
  assert.match(html, /selected="">Deviation/)
  assert.match(html, /engineering review/)
  assert.match(html, /Delivery required within four weeks/)
  assert.doesNotMatch(html, /<table/)
})
